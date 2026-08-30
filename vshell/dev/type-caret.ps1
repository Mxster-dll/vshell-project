# vshell 胶囊编辑器真实键入探针（用户反馈：封装第一个胶囊后无法继续输入）
# CDP Input.insertText = 浏览器真实输入管道（execCommand 在 headless 不可用）
# 用法: pwsh -File type-caret.ps1
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$ud = "$env:TEMP\dsh-cdp-typecaret"; Remove-Item $ud -Recurse -Force -ErrorAction SilentlyContinue
Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'headless' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1

$port = 9225
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

function Eval([string]$expr) {
  $r = Send-Cdp 'Runtime.evaluate' @{ expression = $expr; returnByValue = $true }
  return $r.result.result.value
}

Send-Cdp 'Emulation.setDeviceMetricsOverride' @{ width = 1440; height = 900; deviceScaleFactor = 1; mobile = $false } | Out-Null
Send-Cdp 'Page.navigate' @{ url = 'http://127.0.0.1:8932/harness.html#/' } | Out-Null
Start-Sleep 3
Send-Cdp 'Page.bringToFront' @{} | Out-Null

# 1) 聚焦编辑器，光标放末尾锚点（初始编辑器 = 单个空文本锚点）
$s1 = Eval "(function(){ var ed=document.querySelector('.vshell-st-editor'); if(!ed) return 'no-editor'; ed.focus(); var last=ed.lastChild; var r=document.createRange(); r.setStart(last, last.textContent.length); r.collapse(true); var s=getSelection(); s.removeAllRanges(); s.addRange(r); return {anchor:(last.nodeType===3?'text':last.nodeName), len:last.textContent.length, active:document.activeElement===ed}; })()"
Write-Host "step1 focus+caret: $($s1 | ConvertTo-Json -Compress)"

# 2) 真实键入 '词A'（浏览器输入管道）
Send-Cdp 'Input.insertText' @{ text = '词A' } | Out-Null
$s2 = Eval "document.querySelector('.vshell-st-editor').textContent"
Write-Host "step2 typed: '$s2' (expect 词A)"

# 3) Ctrl+Enter 封装为胶囊（派发合成 keydown）
$s3 = Eval "(function(){ var ed=document.querySelector('.vshell-st-editor'); ed.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true})); var chips=ed.querySelectorAll('.vshell-st-chip').length; var sel=getSelection(); var an=sel.anchorNode; return {chips:chips, hash:location.hash, caretInAnchor: !!(an && an.nodeType===3), caretText: an?an.textContent:null, text:ed.textContent}; })()"
Write-Host "step3 ctrl+enter: $($s3 | ConvertTo-Json -Compress)"

# 4) 关键：封装后再次真实键入 '实打' —— 应落入胶囊后的可编辑锚点
Send-Cdp 'Input.insertText' @{ text = '实打' } | Out-Null
$s4 = Eval "(function(){ var ed=document.querySelector('.vshell-st-editor'); var sel=getSelection(); var an=sel.anchorNode; return {text:ed.textContent, caretAnchor:an?(an.nodeType===3?an.textContent:an.nodeName):null, typed:ed.textContent.indexOf('实打')!==-1}; })()"
Write-Host "step4 typed-after-chip: $($s4 | ConvertTo-Json -Compress)"

$client.Dispose()
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
