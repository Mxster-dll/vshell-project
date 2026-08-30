# CDP 验证标签添加交互（分栏方案）：
# 1) 右侧输入框输入"测试" + Enter → 2) 新标签应出现在列表最上面且选中
# 3) 右侧详情应切到新标签
# 用法: pwsh -File dev/cdp-add-tag.ps1   （需 pwsh7；只杀 --headless 进程）
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*--headless*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1
$port = 9230
$ud = Join-Path $env:TEMP "dsh-cdp-addtag"
Remove-Item $ud -Recurse -Force -ErrorAction SilentlyContinue
$url = 'http://127.0.0.1:8931/_tag-demo.html#split'
$p = Start-Process -FilePath $edge -ArgumentList @(
  '--headless=new','--disable-gpu','--hide-scrollbars',
  '--no-first-run','--disable-sync',
  "--remote-debugging-port=$port", "--user-data-dir=$ud",
  '--window-size=1280,900', $url) -PassThru -WindowStyle Hidden
Start-Sleep 3

# 取页面 ws 地址（page/1 硬编码不可靠）
$pages = Invoke-RestMethod "http://127.0.0.1:$port/json"
$wsUrl = ($pages | Where-Object { $_.type -eq 'page' } | Select-Object -First 1).webSocketDebuggerUrl
if (-not $wsUrl) { throw 'no page ws url' }

$ws = [System.Net.WebSockets.ClientWebSocket]::new()
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$wsUrl, $ct).Wait()
$buf = New-Object byte[] 1048576
function Send-Cdp($id, $method, $params) {
  $o = @{ id = $id; method = $method }
  if ($params) { $o.params = $params }
  $json = $o | ConvertTo-Json -Compress -Depth 8
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $seg = [System.ArraySegment[byte]]::new($bytes)
  $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
  $sb = New-Object System.Text.StringBuilder
  do {
    $r = $ws.ReceiveAsync([System.ArraySegment[byte]]::new($buf), $ct).Result
    [void]$sb.Append([System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count))
    $text = $sb.ToString()
  } while (-not $text.Contains('"id":' + $id))
  return ($text | ConvertFrom-Json)
}
function Eval-JS($expr) {
  $r = Send-Cdp 99 'Runtime.evaluate' @{ expression = $expr; returnByValue = $true }
  if ($r.result.exceptionDetails) {
    return @{ __err__ = $r.result.exceptionDetails.text }
  }
  return $r.result.result.value
}
# 诊断：页面状态
$diag = Eval-JS @"
(function () {
  var list = document.querySelector('#list-split');
  return {
    title: document.title,
    ready: document.readyState,
    listExists: !!list,
    rows: list ? list.children.length : -1,
    inputExists: !!document.querySelector('#split-detail .dlg-add-input'),
    hasErr: !!window.__demoErr,
  };
})()
"@
"DIAG: $($diag | ConvertTo-Json -Compress)"
[void](Eval-JS "document.querySelector('#split-detail .dlg-add-input').focus(); true")
Start-Sleep 0.3
$in = Send-Cdp 100 'Input.insertText' @{ text = '测试' }
Start-Sleep 0.3
[void](Send-Cdp 101 'Input.dispatchKeyEvent' @{ type = 'keyDown'; key = 'Enter'; code = 'Enter'; windowsVirtualKeyCode = 13; nativeVirtualKeyCode = 13 })
[void](Send-Cdp 102 'Input.dispatchKeyEvent' @{ type = 'keyUp'; key = 'Enter'; code = 'Enter'; windowsVirtualKeyCode = 13; nativeVirtualKeyCode = 13 })
Start-Sleep 0.6
$res = Eval-JS @"
(function () {
  var first = document.querySelector('#list-split .dlg-row');
  var detail = document.querySelector('#split-detail .split-detail-name');
  return {
    firstRowName: first ? first.querySelector('.row-name').textContent : null,
    firstRowSelected: first ? first.classList.contains('is-selected') : false,
    detailName: detail ? detail.textContent : null,
    listLen: document.querySelectorAll('#list-split .dlg-row').length,
  };
})()
"@
$res | ConvertTo-Json -Compress
$ws.Dispose()
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
