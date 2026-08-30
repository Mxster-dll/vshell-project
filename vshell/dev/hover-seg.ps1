# ============================================================
# hover-seg.ps1 — CDP 真实鼠标悬停验证：分段进度条只有悬停段变宽
# 用法: pwsh -File dev/hover-seg.ps1 [-Url <url>]
# 只启动自己的 headless 实例（--user-data-dir 独立），结束按 --headless 过滤清理，
# 不碰用户浏览器窗口
# ============================================================
param([string]$Url = 'http://127.0.0.1:8932/harness.html#/video/mockShots')
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$ud = "$env:TEMP\dsh-hover-seg"; Remove-Item $ud -Recurse -Force -ErrorAction SilentlyContinue
$port = 9224

$p = Start-Process -FilePath $edge -ArgumentList @(
  '--headless=new','--disable-gpu','--hide-scrollbars','--autoplay-policy=no-user-gesture-required',
  "--remote-debugging-port=$port", "--user-data-dir=$ud", '--force-prefers-reduced-motion',
  'about:blank') -PassThru -WindowStyle Hidden
try {
  Start-Sleep 2.5
  $targets = Invoke-RestMethod "http://127.0.0.1:$port/json"
  $ws = ($targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1).webSocketDebuggerUrl
  if (-not $ws) { throw 'no page target' }
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

  Send-Cdp 'Page.navigate' @{ url = $Url } | Out-Null
  Start-Sleep 6   # 等页面渲染 + 分镜节点渲染
  # 先把进度条滚动到视口（页面可能被探针滚动过），再取几何
  Send-Cdp 'Runtime.evaluate' @{
    expression = "document.querySelector('.vshell-player-bar').scrollIntoView({block:'center'});"
  } | Out-Null
  Start-Sleep 0.3
  # 拿 bar 几何 + 初始段高度
  $r = Send-Cdp 'Runtime.evaluate' @{
    expression = "(function(){var b=document.querySelector('.vshell-player-bar');var r=b.getBoundingClientRect();var segs=b.querySelectorAll('.vshell-player-bar-seg');return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height,bottom:r.bottom,segs:segs.length,h0:segs[0]?getComputedStyle(segs[0].querySelector('.vshell-player-bar-seg-track')).height:null,h1:segs[1]?getComputedStyle(segs[1].querySelector('.vshell-player-bar-seg-track')).height:null,h2:segs[2]?getComputedStyle(segs[2].querySelector('.vshell-player-bar-seg-track')).height:null});})()"
  }
  $geo = $r.result.result.value | ConvertFrom-Json
  # 鼠标移到段 2（x ≈ 段2 中心 = 25%~62.5% 中段 43.75%）
  $mx = [int]($geo.x + $geo.w * 0.4375)
  $my = [int]($geo.bottom - 2)
  Send-Cdp 'Input.dispatchMouseEvent' @{ type = 'mouseMoved'; x = $mx; y = $my } | Out-Null
  Start-Sleep 0.5
  # 读 hover 后段高度：段 2 应 8px，段 1/3 应 4px
  $r2 = Send-Cdp 'Runtime.evaluate' @{
    expression = "(function(){var b=document.querySelector('.vshell-player-bar');var segs=b.querySelectorAll('.vshell-player-bar-seg');var out={};for(var i=0;i<segs.length;i++){out['h'+i]=getComputedStyle(segs[i].querySelector('.vshell-player-bar-seg-track')).height;}out.hovered=document.querySelector('.vshell-player-bar-seg:hover')?document.querySelector('.vshell-player-bar-seg:hover').getBoundingClientRect().left:null;return JSON.stringify(out);})()"
  }
  $after = $r2.result.result.value | ConvertFrom-Json
  # 截图（hover 状态）
  $shot = Send-Cdp 'Page.captureScreenshot' @{ format = 'jpeg'; quality = 85 }
  if ($shot.result.data) { [IO.File]::WriteAllBytes("$env:TEMP\vshell-hover-seg.jpg", [Convert]::FromBase64String($shot.result.data)) }
  "bar: x=$($geo.x) y=$($geo.y) w=$($geo.w) bottom=$($geo.bottom) segs=$($geo.segs)"
  "before hover: h0=$($geo.h0) h1=$($geo.h1) h2=$($geo.h2)"
  "after hover (mouse at x=$mx,y=$my): h0=$($after.h0) h1=$($after.h1) h2=$($after.h2) hoveredSegLeft=$($after.hovered)"
} finally {
  $client.Dispose()
  # 只杀本次启动的 headless 实例（命令行含 --headless 特征），不碰用户窗口
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match '--headless' -and $_.CommandLine -match 'dsh-hover-seg' } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { } }
}
