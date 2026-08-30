# ============================================================
# click-seek.ps1 — CDP 真实点击进度条验证：seek 后 fill 立即到位
# （无「从 0 动画到目标」；拖动期/seek 期 transition none）
# 用法: pwsh -File dev/click-seek.ps1
# 只启动自己的 headless 实例，结束按 --headless + 专属 ud 清理，不碰用户窗口
# ============================================================
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$ud = "$env:TEMP\dsh-click-seek"; Remove-Item $ud -Recurse -Force -ErrorAction SilentlyContinue
$port = 9225

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

  Send-Cdp 'Page.navigate' @{ url = 'http://127.0.0.1:8932/harness.html#/video/mockShots' } | Out-Null
  Start-Sleep 6
  Send-Cdp 'Runtime.evaluate' @{ expression = "document.querySelector('.vshell-player-bar').scrollIntoView({block:'center'});" } | Out-Null
  Start-Sleep 0.3

  # 初始 fill 状态（每段宽度 %）
  function Get-Fills {
    $r = Send-Cdp 'Runtime.evaluate' @{
      expression = "(function(){var b=document.querySelector('.vshell-player-bar');var segs=b.querySelectorAll('.vshell-player-bar-seg');return JSON.stringify({fills:Array.prototype.map.call(segs,function(s){return s.querySelector('.vshell-player-bar-seg-fill').style.width;}),seeking:b.className.indexOf('vshell-player-bar-seeking')>=0,ct:document.querySelector('video').currentTime});})()"
    }
    return ($r.result.result.value | ConvertFrom-Json)
  }

  $g = Send-Cdp 'Runtime.evaluate' @{ expression = "(function(){var r=document.querySelector('.vshell-player-bar').getBoundingClientRect();return JSON.stringify({x:r.left,y:r.top,w:r.width,bottom:r.bottom});})()" }
  $geo = $g.result.result.value | ConvertFrom-Json
  # 点击前暂停视频：fill 只受 seek 影响（无播放推进干扰），采样序列稳定可判动画
  Send-Cdp 'Runtime.evaluate' @{ expression = "document.querySelector('video').pause();" } | Out-Null
  Start-Sleep 0.2
  $before = Get-Fills

  # 点击 60% 位置（pointerdown + pointerup）
  $cx = [int]($geo.x + $geo.w * 0.6)
  $cy = [int]($geo.bottom - 2)
  Send-Cdp 'Input.dispatchMouseEvent' @{ type = 'mousePressed'; x = $cx; y = $cy; button = 'left'; clickCount = 1 } | Out-Null
  Send-Cdp 'Input.dispatchMouseEvent' @{ type = 'mouseReleased'; x = $cx; y = $cy; button = 'left'; clickCount = 1 } | Out-Null
  Start-Sleep -Milliseconds 100
  $afterClick = Get-Fills
  # 模拟 dash.js 分步 seek：连续两次 seeked（间隔 200ms）
  Send-Cdp 'Runtime.evaluate' @{ expression = "document.querySelector('video').dispatchEvent(new Event('seeked'));" } | Out-Null
  Start-Sleep -Milliseconds 200
  $afterSeeked1 = Get-Fills
  Send-Cdp 'Runtime.evaluate' @{ expression = "document.querySelector('video').dispatchEvent(new Event('seeked'));" } | Out-Null
  Start-Sleep -Milliseconds 100
  $afterSeeked2 = Get-Fills
  # settle 定时器 700ms：seeked2 后再等 800ms → seeking 应移除
  Start-Sleep -Milliseconds 800
  $afterSettle = Get-Fills

  "click at x=$cx (60%)"
  "before(paused): fills=$($before.fills -join ',')"
  "t+100ms (click):      seeking=$($afterClick.seeking) fills=$($afterClick.fills -join ',')"
  "t+100ms seeked#1:     seeking=$($afterSeeked1.seeking) fills=$($afterSeeked1.fills -join ',')"
  "t+300ms seeked#2:     seeking=$($afterSeeked2.seeking) fills=$($afterSeeked2.fills -join ',')"
  "t+1100ms after settle: seeking=$($afterSettle.seeking) fills=$($afterSettle.fills -join ',')"
  "no zero-start during multi-seek: $(-not (($afterClick.fills + $afterSeeked1.fills + $afterSeeked2.fills) -match '^0%|0%,'))"
} finally {
  $client.Dispose()
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match '--headless' -and $_.CommandLine -match 'dsh-click-seek' } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { } }
}
