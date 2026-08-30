# ============================================================
# cdp-chip.ps1 — 胶囊删除按钮视觉验证：悬停胶囊 → 右上角圆形删除钮
# 截图到 $env:TEMP\vshell-chip-del.jpg + 读按钮几何/可见性
# ============================================================
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$ud = "$env:TEMP\dsh-cdp-chip"; Remove-Item $ud -Recurse -Force -ErrorAction SilentlyContinue
$port = 9227

$p = Start-Process -FilePath $edge -ArgumentList @(
  '--headless=new','--disable-gpu','--hide-scrollbars','--autoplay-policy=no-user-gesture-required',
  "--remote-debugging-port=$port", "--user-data-dir=$ud", '--force-prefers-reduced-motion',
  'about:blank') -PassThru -WindowStyle Hidden
try {
  Start-Sleep 2.5
  $targets = Invoke-RestMethod "http://127.0.0.1:$port/json"
  $ws = ($targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1).webSocketDebuggerUrl
  $client = [System.Net.WebSockets.ClientWebSocket]::new()
  $client.ConnectAsync([Uri]$ws, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  $script:nextId = 0
  function Send-Cdp([string]$method, $params) {
    $script:nextId++
    $id = $script:nextId
    $msg = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 6 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
    $seg = [ArraySegment[byte]]::new($bytes)
    $client.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    while ($true) {
      $buf = New-Object byte[] 65536
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

  Send-Cdp 'Page.navigate' @{ url = 'http://127.0.0.1:8932/pop-test.html' } | Out-Null
  Start-Sleep 4
  # 添加标签 → 胶囊出现
  Send-Cdp 'Runtime.evaluate' @{
    expression = "window.VShell && VShell.searchTags ? VShell.searchTags.add('视频') : 'no-st'"
  } | Out-Null
  Start-Sleep 0.3
  # 拿胶囊几何
  $r = Send-Cdp 'Runtime.evaluate' @{
    expression = "(function(){var c=document.querySelector('.vshell-st-chip');if(!c)return 'no-chip';c.scrollIntoView({block:'center'});var r=c.getBoundingClientRect();var d=c.querySelector('.vshell-st-chip-del');var dr=d?d.getBoundingClientRect():null;return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,del:dr?{x:dr.left,y:dr.top,w:dr.width,h:dr.height}:null});})()"
  }
  $geo = $r.result.result.value | ConvertFrom-Json
  if ($geo -is [string]) { "RESULT: $geo"; exit 1 }
  "chip: x=$($geo.x) y=$($geo.y) w=$($geo.w) h=$($geo.h)"
  if ($geo.del) { "del btn rect: x=$($geo.del.x) y=$($geo.del.y) w=$($geo.del.w) h=$($geo.del.h)" }
  # 悬停胶囊
  Send-Cdp 'Input.dispatchMouseEvent' @{ type = 'mouseMoved'; x = [int]$geo.x; y = [int]$geo.y } | Out-Null
  Start-Sleep 0.5
  # 读按钮可见性 + 截图
  $r2 = Send-Cdp 'Runtime.evaluate' @{
    expression = "(function(){var d=document.querySelector('.vshell-st-chip-del');if(!d)return 'no-del';var cs=getComputedStyle(d);return JSON.stringify({opacity:cs.opacity,hoverRule:!!document.styleSheets.length});})()"
  }
  "after hover: $($r2.result.result.value)"
  $shot = Send-Cdp 'Page.captureScreenshot' @{ format = 'jpeg'; quality = 92 }
  if ($shot.result.data) { [IO.File]::WriteAllBytes("$env:TEMP\vshell-chip-del.jpg", [Convert]::FromBase64String($shot.result.data)); "screenshot: $env:TEMP\vshell-chip-del.jpg" }
} finally {
  $client.Dispose()
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match '--headless' -and $_.CommandLine -match 'dsh-cdp-chip' } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { } }
}
