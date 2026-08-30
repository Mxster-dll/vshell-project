# ============================================================
# cdp-bar.ps1 — 实测：mutedAutoplay 刷页下 controls 隐藏后，
# 进度条 bar 是否仍可见（用户需求：进度条不要隐藏）
# 用法: pwsh -File dev/cdp-bar.ps1
# ============================================================
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$ud = "$env:TEMP\dsh-cdp-bar"; Remove-Item $ud -Recurse -Force -ErrorAction SilentlyContinue
$port = 9235

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

  Send-Cdp 'Page.navigate' @{ url = 'http://127.0.0.1:8932/harness.html#/watchlist' } | Out-Null
  Start-Sleep 4
  $st = Send-Cdp 'Runtime.evaluate' @{
    expression = "JSON.stringify({ok:!!window.VShell,hash:location.hash,mode:(window.VShell&&window.VShell.viewMode)?window.VShell.viewMode.get():null,watchlist:!!document.querySelector('.vshell-page-watchlist'),feed:!!document.querySelector('.vshell-feed')})"
  }
  "STATE0: $($st.result.result.value)"
  # 切 feed 模式（默认 wall 无播放器）
  $sw = Send-Cdp 'Runtime.evaluate' @{
    expression = "JSON.stringify({set:(function(){try{window.VShell.viewMode.set('feed');window.VShell.router.nav('/watchlist');return 'done';}catch(e){return 'err:'+e.message;}})()})"
  }
  "SWITCH: $($sw.result.result.value)"
  Start-Sleep 2.5
  $st2 = Send-Cdp 'Runtime.evaluate' @{
    expression = "JSON.stringify({hash:location.hash,mode:window.VShell.viewMode.get(),watchlist:!!document.querySelector('.vshell-page-watchlist'),feed:!!document.querySelector('.vshell-feed'),slides:document.querySelectorAll('.vshell-feed-slide').length,players:document.querySelectorAll('.vshell-player').length})"
  }
  "STATE1: $($st2.result.result.value)"
  Start-Sleep 4

  function Get-BarState {
    $r = Send-Cdp 'Runtime.evaluate' @{
      expression = "(function(){
        var p=document.querySelector('.vshell-player');
        if(!p) return JSON.stringify({noPlayer:true,feed:!!document.querySelector('.vshell-feed')});
        var bar=p.querySelector('.vshell-player-bar');
        var ctrl=p.querySelector('.vshell-player-controls');
        var bs=getComputedStyle(bar), cs=getComputedStyle(ctrl);
        var br=bar.getBoundingClientRect(), cr=ctrl.getBoundingClientRect();
        return JSON.stringify({
          cls:p.className,
          ctrlVisible:p.classList.contains('vshell-player-controls-visible'),
          ctrlOpacity:cs.opacity, ctrlDisplay:cs.display, ctrlH:cr.height,
          barOpacity:bs.opacity, barDisplay:bs.display, barVisibility:bs.visibility, barH:br.height,
          barZ:bs.zIndex, ctrlZ:cs.zIndex,
          barTop:br.top, barBottom:br.bottom,
          ctrlTop:cr.top, ctrlBottom:cr.bottom
        });
      })()"
    }
    return $r.result.result.value
  }

  "S1 (feed, after switch +6s, playing ~6s: controls should be hidden by 0.7s): $(Get-BarState)"
  # 模拟鼠标移动 → controls 应恢复
  Send-Cdp 'Runtime.evaluate' @{ expression = "document.querySelector('.vshell-player').dispatchEvent(new PointerEvent('pointermove',{bubbles:true}));'ok'" } | Out-Null
  Start-Sleep 0.5
  "S2 (after pointermove +0.5s: controls visible): $(Get-BarState)"
  Start-Sleep 1.5
  "S3 (after another 1.5s idle: controls hidden again): $(Get-BarState)"
} finally {
  $client.Dispose()
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match '--headless' -and $_.CommandLine -match 'dsh-cdp-bar' } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { } }
}
