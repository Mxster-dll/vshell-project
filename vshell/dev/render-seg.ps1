# ============================================================
# render-seg.ps1 — CDP 验证：播放中添加新节点（renderNodes 重建段 DOM）后
# fill 立即同步到当前进度（无「从 0 动画」中间态）
# 用法: pwsh -File dev/render-seg.ps1
# 只启动自己的 headless 实例，结束按 --headless + 专属 ud 清理
# ============================================================
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$ud = "$env:TEMP\dsh-render-seg"; Remove-Item $ud -Recurse -Force -ErrorAction SilentlyContinue
$port = 9226

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
  Send-Cdp 'Page.navigate' @{ url = 'http://127.0.0.1:8932/harness.html#/video/mockShots' } | Out-Null
  Start-Sleep 6
  Send-Cdp 'Runtime.evaluate' @{ expression = "document.querySelector('.vshell-player-bar').scrollIntoView({block:'center'});" } | Out-Null
  Start-Sleep 0.3
  # 暂停冻结媒体时钟（隔离变量）
  Send-Cdp 'Runtime.evaluate' @{ expression = "document.querySelector('video').pause();" } | Out-Null
  Start-Sleep 0.2

  # 同一 JS 任务：renderNodes 重建（模拟 attach 产点，节点 2→5 个）+ 立即读 fills
  $r = Send-Cdp 'Runtime.evaluate' @{
    expression = "(function(){
      var S = window.VShell.shots, bar = document.querySelector('.vshell-player-bar');
      var before = Array.prototype.map.call(bar.querySelectorAll('.vshell-player-bar-seg'), function(s){return s.querySelector('.vshell-player-bar-seg-fill').style.width;});
      var segsBefore = bar.querySelectorAll('.vshell-player-bar-seg').length;
      S.renderNodes(bar, [1,2,5,6.5], 8);            // 2 节点 → 5 节点：段 DOM 全重建
      var segs = bar.querySelectorAll('.vshell-player-bar-seg');
      var after = Array.prototype.map.call(segs, function(s){return s.querySelector('.vshell-player-bar-seg-fill').style.width;});
      var v = document.querySelector('video');
      return JSON.stringify({before:before, segsBefore:segsBefore, segsAfter:segs.length,
        after:after, ct:v.currentTime, dur:v.duration,
        expectPct:(v.currentTime/v.duration*100).toFixed(1)});
    })()"
  }
  $res = $r.result.result.value | ConvertFrom-Json
  # 跨帧采样（100ms × 4）：fills 应稳定（无 0 中间态/无过渡中间值）
  $series = @()
  for ($i = 0; $i -lt 4; $i++) {
    $s = Send-Cdp 'Runtime.evaluate' @{
      expression = "Array.prototype.map.call(document.querySelectorAll('.vshell-player-bar-seg-fill'),function(f){return f.style.width;}).join('|')"
    }
    $series += $s.result.result.value
    Start-Sleep -Milliseconds 100
  }
  "before: segs=$($res.segsBefore) fills=$($res.before -join ',')  ct=$($res.ct)s"
  "after renderNodes (same task): segs=$($res.segsAfter) fills=$($res.after -join ',')"
  "  expected at ct=$($res.ct)/$($res.dur)s (=$($res.expectPct)%): 首段应满或按进度，无全 0"
  "cross-frame series (100ms x4):"
  $series | ForEach-Object { "  $_" }
  $distinct = $series | Select-Object -Unique
  "distinct states: $($distinct.Count) (1 = 无动画中间态)"
  $hasZero = ($res.after -join ',') -match '(^|,)0%(,|$)'
  "immediate fills contain zero: $hasZero (期望 False)"
} finally {
  $client.Dispose()
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match '--headless' -and $_.CommandLine -match 'dsh-render-seg' } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { } }
}
