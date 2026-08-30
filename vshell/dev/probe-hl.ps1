# vshell 高亮块渲染探针：CDP 同一时刻读 DOM rect + 截图像素验证
# 用法: pwsh -File probe-hl.ps1
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$ud = "$env:TEMP\dsh-cdp-hl"; Remove-Item $ud -Recurse -Force -ErrorAction SilentlyContinue
Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'headless' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1

$port = 9224
$p = Start-Process -FilePath $edge -ArgumentList @(
  '--headless=new','--disable-gpu','--hide-scrollbars','--autoplay-policy=no-user-gesture-required',
  "--remote-debugging-port=$port", "--user-data-dir=$ud", '--force-prefers-reduced-motion',
  'about:blank') -PassThru -WindowStyle Hidden
Start-Sleep 2.5

$targets = Invoke-RestMethod "http://127.0.0.1:$port/json"
$ws = ($targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1).webSocketDebuggerUrl
if (-not $ws) { throw 'no page target' }

$client = [System.Net.WebSockets.ClientWebSocket]::new()
$client.ConnectAsync([Uri]$ws, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
$nextId = 0

function Send-Cdp([string]$method, $params) {
  $script:nextId++
  $id = $script:nextId
  $msg = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 8 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
  $seg = [ArraySegment[byte]]::new($bytes)
  $client.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  while ($true) {
    $buf = New-Object byte[] 131072
    $ms = [System.IO.MemoryStream]::new()
    do {
      $res = $client.ReceiveAsync([ArraySegment[byte]]::new($buf), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
      $ms.Write($buf, 0, $res.Count)
    } while (-not $res.EndOfMessage)
    $txt = [Text.Encoding]::UTF8.GetString($ms.ToArray())
    $obj = $txt | ConvertFrom-Json
    if ($obj.id -eq $id) { return $obj }
  }
}

Send-Cdp 'Emulation.setDeviceMetricsOverride' @{ width = 1440; height = 900; deviceScaleFactor = 1; mobile = $false } | Out-Null
Send-Cdp 'Page.navigate' @{ url = 'http://127.0.0.1:8932/harness.html#/' } | Out-Null

# 等布局稳定（轮询 3 次 rect 相同；页面虚拟时间快进不影响真实时间）
$stable = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep 1
  $ev = Send-Cdp 'Runtime.evaluate' @{ expression = "(function(){ var ts=document.querySelectorAll('.vsc-video-title-tag'); var ti=document.querySelector('.vsc-video-title'); if(!ts.length||!ti) return null; var out={rects:[],title:null}; for(var i=0;i<ts.length;i++){ var r=ts[i].getBoundingClientRect(); out.rects.push({top:r.top,bottom:r.bottom,h:r.height,w:r.width,text:ts[i].textContent}); } var tr=ti.getBoundingClientRect(); var cs=getComputedStyle(ti); var tcs=getComputedStyle(ts[0]); out.title={top:tr.top,bottom:tr.bottom,h:tr.height,lineHeight:cs.lineHeight,display:cs.display}; out.tagLine=tcs.lineHeight; out.vAlign=tcs.verticalAlign; out.font=tcs.fontFamily; return out; })()"; returnByValue = $true }
  $v = $ev.result.result.value
  if ($v -and $i -gt 2) {
    if ($script:prev -and $script:prev.title.top -eq $v.title.top -and $script:prev.rects[0].top -eq $v.rects[0].top) { $stable = $true; break }
    $script:prev = $v
  }
  $script:prev = $v
}
Write-Host ("stable=" + $stable)
Write-Host ("rect: " + ($v | ConvertTo-Json -Compress))

$shot = Send-Cdp 'Page.captureScreenshot' @{ format = 'png' }
if ($shot.result.data) {
  [IO.File]::WriteAllBytes('D:\Project\Ongoing\vsc-ui\output\_vs-cdp-hl.png', [Convert]::FromBase64String($shot.result.data))
  Write-Host 'screenshot saved'
}
$client.Dispose()
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
