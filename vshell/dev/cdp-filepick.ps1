# CDP 验证 Dialog 图片按钮链路：点击 → input[type=file] 创建 → DOM.setFileInputFiles
# 设置文件 → change → canvas 压缩 → 行缩略图变 data:image/png
# 用法: pwsh -File dev/cdp-filepick.ps1（需 pwsh7；只杀 --headless）
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*--headless*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1
$port = 9231
$ud = Join-Path $env:TEMP "dsh-cdp-filepick"
Remove-Item $ud -Recurse -Force -ErrorAction SilentlyContinue
$url = 'http://127.0.0.1:8931/_tag-demo.html#dialog'
$p = Start-Process -FilePath $edge -ArgumentList @(
  '--headless=new','--disable-gpu','--hide-scrollbars',
  '--no-first-run','--disable-sync',
  "--remote-debugging-port=$port", "--user-data-dir=$ud",
  '--window-size=1280,900', $url) -PassThru -WindowStyle Hidden
Start-Sleep 3
$pages = Invoke-RestMethod "http://127.0.0.1:$port/json"
$wsUrl = ($pages | Where-Object { $_.type -eq 'page' } | Select-Object -First 1).webSocketDebuggerUrl
$ws = [System.Net.WebSockets.ClientWebSocket]::new()
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$wsUrl, $ct).Wait()
$buf = New-Object byte[] 1048576
$seq = 0
function Send-Cdp($method, $params) {
  $script:seq++
  $o = @{ id = $script:seq; method = $method }
  if ($params) { $o.params = $params }
  $json = $o | ConvertTo-Json -Compress -Depth 8
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
  $sb = New-Object System.Text.StringBuilder
  do {
    $r = $ws.ReceiveAsync([System.ArraySegment[byte]]::new($buf), $ct).Result
    [void]$sb.Append([System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count))
  } while (-not $sb.ToString().Contains('"id":' + $script:seq))
  $text = $sb.ToString()
  # 可能拼入其他事件帧：只取目标 id 的最后一段完整 JSON
  $idx = $text.LastIndexOf('{"id":' + $script:seq)
  if ($idx -ge 0) { $text = $text.Substring($idx) }
  return ($text | ConvertFrom-Json)
}
function Eval-JS($expr) {
  $r = Send-Cdp 'Runtime.evaluate' @{ expression = $expr; returnByValue = $true }
  if ($r.result.exceptionDetails) { return @{ __err__ = $r.result.exceptionDetails.text } }
  return $r.result.result.value
}
# 1) 点击第一行"设置图片"按钮（创建 input[type=file] 并 click）
$click = Eval-JS "document.querySelector('#list-dialog .dlg-row .row-btn').click(); true"
Start-Sleep 0.4
# 2) 查找刚创建的 file input
$inp = Eval-JS "var el = document.querySelector('body > input[type=file]'); el ? (el.__vscdp = true, 'found') : 'none'"
"INPUT: $inp"
# 3) DOM.setFileInputFiles 设置文件
$dom = Send-Cdp 'DOM.getDocument' @{ depth = -1 }
$rootId = $dom.result.root.nodeId
$q = Send-Cdp 'DOM.querySelector' @{ nodeId = $rootId; selector = 'body > input[type=file]' }
$nodeId = $q.result.nodeId
$files = @('D:\Project\Ongoing\vsc-ui\output\_vs-fixtures\card1.svg')
[void](Send-Cdp 'DOM.setFileInputFiles' @{ nodeId = $nodeId; files = $files })
Start-Sleep 0.8
# 4) 验证缩略图更新
$res = Eval-JS @"
(function () {
  var thumb = document.querySelector('#list-dialog .dlg-row .row-thumb');
  var img = thumb && thumb.querySelector('img');
  return {
    hasImg: !!img,
    srcIsPng: img ? img.src.indexOf('data:image/png') === 0 : false,
    srcLen: img ? img.src.length : 0,
  };
})()
"@
"RESULT: $($res | ConvertTo-Json -Compress)"
$ws.Dispose()
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
