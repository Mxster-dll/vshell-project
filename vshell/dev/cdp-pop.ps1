# ============================================================
# cdp-pop.ps1 — CDP 真实鼠标点击验证：点击搜索框 input → 浮层打开且保持
# 用法: pwsh -File dev/cdp-pop.ps1
# 只启动自己的 headless 实例（--user-data-dir 独立），结束按 --headless 过滤清理
# ============================================================
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$ud = "$env:TEMP\dsh-cdp-pop"; Remove-Item $ud -Recurse -Force -ErrorAction SilentlyContinue
$port = 9226

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

  Send-Cdp 'Page.navigate' @{ url = 'http://127.0.0.1:8932/pop-test.html' } | Out-Null
  Start-Sleep 4
  # 诊断：boot 状态
  $diag = Send-Cdp 'Runtime.evaluate' @{
    expression = "JSON.stringify({app:!!document.querySelector('.vshell-app'),nav:!!document.querySelector('.vshell-navbar'),search:!!document.querySelector('.vshell-nav-search'),ed:!!document.querySelector('.vshell-st-editor'),inp:!!document.querySelector('.vshell-st-input'),vshell:typeof window.VShell,bodyChildren:document.body.children.length})"
  }
  "DIAG: $($diag.result.result.value)"
  # 状态读取辅助（页内函数：返回 JSON 字符串）
  function Get-PopState {
    $r = Send-Cdp 'Runtime.evaluate' @{
      expression = "(function(){
        var inp=document.querySelector('.vshell-st-input');
        var pv=document.querySelector('.vshell-nav-popover');
        var ed=document.querySelector('.vshell-st-editor');
        var ae=document.activeElement;
        var sb=document.querySelector('.vshell-nav-search');
        return JSON.stringify({
          popover: !!pv,
          activeIsInput: !!ae && ae.classList && ae.classList.contains('vshell-st-input'),
          activeTag: ae?ae.tagName+'.'+(ae.className||''):'null',
          inputInPopover: inp?!!(pv&&pv.contains(inp)):null,
          editorInPopover: ed?!!(pv&&pv.contains(ed)):null,
          popoverChildren: pv?pv.children.length:null,
          searchBoxChildren: sb?sb.children.length:null
        });
      })()"
    }
    return $r.result.result.value
  }

  # ===== 场景 1：真实鼠标点击 input =====
  $r0 = Send-Cdp 'Runtime.evaluate' @{
    expression = "(function(){var inp=document.querySelector('.vshell-st-input');if(!inp)return 'no-input';inp.scrollIntoView({block:'center'});var r=inp.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()"
  }
  $c = $r0.result.result.value | ConvertFrom-Json
  "input center: x=$($c.x) y=$($c.y)"
  Send-Cdp 'Input.dispatchMouseEvent' @{ type = 'mousePressed'; x = [int]$c.x; y = [int]$c.y; button = 'left'; clickCount = 1 } | Out-Null
  Send-Cdp 'Input.dispatchMouseEvent' @{ type = 'mouseReleased'; x = [int]$c.x; y = [int]$c.y; button = 'left'; clickCount = 1 } | Out-Null
  Start-Sleep 1
  $s1 = Get-PopState
  "S1 (after click input, +1s): $s1"
  # 浮层内 divider/clearBtn 实际状态（用户需求：未激活隐藏，激活显示）
  $rd = Send-Cdp 'Runtime.evaluate' @{
    expression = "(function(){var d=document.querySelector('.vshell-nav-divider');var c=document.querySelector('.vshell-nav-clear');return JSON.stringify({divider:{display:d?getComputedStyle(d).display:null,inPop:!!(d&&d.closest('.vshell-nav-popover'))},clear:{display:c?getComputedStyle(c).display:null,inPop:!!(c&&c.closest('.vshell-nav-popover'))},popover:!!document.querySelector('.vshell-nav-popover')});})()"
  }
  "DIVIDER STATE: $($rd.result.result.value)"

  # ===== 场景 2：点击浮层头部空白（应保持，mousedown 委托 preventDefault）=====
  $r2 = Send-Cdp 'Runtime.evaluate' @{
    expression = "(function(){var head=document.querySelector('.vshell-nav-popover-head');if(!head)return 'no-head';var r=head.getBoundingClientRect();return JSON.stringify({x:r.left+10,y:r.top+r.height/2});})()"
  }
  if ($r2.result.result.value -ne 'no-head') {
    $c2 = $r2.result.result.value | ConvertFrom-Json
    Send-Cdp 'Input.dispatchMouseEvent' @{ type = 'mousePressed'; x = [int]$c2.x; y = [int]$c2.y; button = 'left'; clickCount = 1 } | Out-Null
    Send-Cdp 'Input.dispatchMouseEvent' @{ type = 'mouseReleased'; x = [int]$c2.x; y = [int]$c2.y; button = 'left'; clickCount = 1 } | Out-Null
    Start-Sleep 0.8
    $s2 = Get-PopState
    "S2 (after click popover head, +0.8s): $s2"
  }

  # ===== 场景 3：点击浮层外（应关闭）=====
  $r3 = Send-Cdp 'Runtime.evaluate' @{
    expression = "(function(){var nav=document.querySelector('.vshell-navbar');var r=nav.getBoundingClientRect();return JSON.stringify({x:r.left+30,y:r.bottom-10});})()"
  }
  $c3 = $r3.result.result.value | ConvertFrom-Json
  Send-Cdp 'Input.dispatchMouseEvent' @{ type = 'mousePressed'; x = [int]$c3.x; y = [int]$c3.y; button = 'left'; clickCount = 1 } | Out-Null
  Send-Cdp 'Input.dispatchMouseEvent' @{ type = 'mouseReleased'; x = [int]$c3.x; y = [int]$c3.y; button = 'left'; clickCount = 1 } | Out-Null
  Start-Sleep 0.8
  $s3 = Get-PopState
  "S3 (after click outside, +0.8s): $s3"
} finally {
  $client.Dispose()
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match '--headless' -and $_.CommandLine -match 'dsh-cdp-pop' } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { } }
}
