# CDP 复现：vshell tag-panel 设置图片链路
# 打开面板 → 点击第一行图片按钮 → DOM.setFileInputFiles 注入 PNG
# → 检查行缩略图是否变为 img + tags.list()[0].icon 是否更新
# 用法: pwsh -File dev/cdp-tag-seticon.ps1（需 pwsh7；只杀 --headless）
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*--headless*' -or $_.CommandLine -like '*dsh-cdp-tag*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1
$port = 9232
$ud = Join-Path $env:TEMP "dsh-cdp-tagseticon"
Remove-Item $ud -Recurse -Force -ErrorAction SilentlyContinue
$url = 'http://127.0.0.1:8932/_vs-harness.html'
$p = Start-Process -FilePath $edge -ArgumentList @(
  '--headless=new','--disable-gpu','--hide-scrollbars',
  '--no-first-run','--disable-sync',
  "--remote-debugging-port=$port", "--user-data-dir=$ud",
  '--window-size=1440,900', $url) -PassThru -WindowStyle Hidden
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
  $idx = $text.LastIndexOf('{"id":' + $script:seq)
  if ($idx -ge 0) { $text = $text.Substring($idx) }
  return ($text | ConvertFrom-Json)
}
function Eval-JS($expr) {
  $r = Send-Cdp 'Runtime.evaluate' @{ expression = $expr; returnByValue = $true }
  if ($r.result.exceptionDetails) { return @{ __err__ = $r.result.exceptionDetails.text; __desc__ = $r.result.exceptionDetails.exception.description } }
  return $r.result.result.value
}
# 1) 打开 tag 面板
$open = Eval-JS "window.VShell && VShell.tagPanel.open(); true"
"OPEN: $($open | ConvertTo-Json -Compress)"
Start-Sleep 0.5
# 2) 点击第一行图片按钮
$click = Eval-JS "var b = document.querySelector('.vshell-tag-row .vshell-tag-img-btn'); if (b) { b.click(); 'clicked' } else { 'no-btn' }"
"CLICK: $click"
Start-Sleep 0.4
# 3) 注入文件
$inp = Eval-JS "var el = document.querySelector('body > input[type=file]'); el ? 'found' : 'none'"
"INPUT: $inp"
if ($inp -eq 'found') {
  $dom = Send-Cdp 'DOM.getDocument' @{ depth = -1 }
  $q = Send-Cdp 'DOM.querySelector' @{ nodeId = $dom.result.root.nodeId; selector = 'body > input[type=file]' }
  [void](Send-Cdp 'DOM.setFileInputFiles' @{ nodeId = $q.result.nodeId; files = @('D:\Project\Ongoing\vsc-ui\output\_vs-fixtures\test-blue.png') })
  Start-Sleep 1.0
}
# 4) v0.3.76：300x200 图 → 舞台 256x171，选区与图片对齐、可移动到任意区域
$crop = Eval-JS "(function () { var sel = document.querySelector('.vshell-tag-crop-sel'); var st = document.querySelector('.vshell-tag-crop-stage'); return sel ? { w: sel.style.width, l: sel.style.left, t: sel.style.top, stageW: st.style.width, stageH: st.style.height, img: !!document.querySelector('.vshell-tag-crop-stage img') } : null; })()"
"CROP: $($crop | ConvertTo-Json -Compress)"
# 拖动选区到左上角（越界应钳制到 0,0）
$toTopLeft = Eval-JS @"
(function () {
  var sel = document.querySelector('.vshell-tag-crop-sel');
  var r = sel.getBoundingClientRect();
  var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  var o = { bubbles: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1 };
  sel.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1 }));
  sel.dispatchEvent(new PointerEvent('pointermove', { clientX: cx - 2000, clientY: cy - 2000, bubbles: true, pointerId: 1, isPrimary: true, buttons: 1 }));
  sel.dispatchEvent(new PointerEvent('pointerup', { clientX: cx - 2000, clientY: cy - 2000, bubbles: true, pointerId: 1, isPrimary: true }));
  return { left: sel.style.left, top: sel.style.top };
})()
"@
"TOPLEFT: $($toTopLeft | ConvertTo-Json -Compress)"
# 拖动到右下角（越界应钳制到 fitW-selSize, fitH-selSize）
$toBottomRight = Eval-JS @"
(function () {
  var sel = document.querySelector('.vshell-tag-crop-sel');
  var r = sel.getBoundingClientRect();
  var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  sel.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1 }));
  sel.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + 2000, clientY: cy + 2000, bubbles: true, pointerId: 1, isPrimary: true, buttons: 1 }));
  sel.dispatchEvent(new PointerEvent('pointerup', { clientX: cx + 2000, clientY: cy + 2000, bubbles: true, pointerId: 1, isPrimary: true }));
  return { left: sel.style.left, top: sel.style.top };
})()
"@
"BOTTOMRIGHT: $($toBottomRight | ConvertTo-Json -Compress)"
# 拖手柄（右下角）：向右下 (+36,+20) → 中心锚定放大
$resized = Eval-JS @"
(function () {
  var sel = document.querySelector('.vshell-tag-crop-sel');
  var h = document.querySelector('.vshell-tag-crop-handle');
  var hr = h.getBoundingClientRect();
  var hx = hr.left + hr.width / 2, hy = hr.top + hr.height / 2;
  h.dispatchEvent(new PointerEvent('pointerdown', { clientX: hx, clientY: hy, bubbles: true, pointerId: 2, isPrimary: true, button: 0, buttons: 1 }));
  h.dispatchEvent(new PointerEvent('pointermove', { clientX: hx + 36, clientY: hy + 20, bubbles: true, pointerId: 2, isPrimary: true, buttons: 1 }));
  h.dispatchEvent(new PointerEvent('pointerup', { clientX: hx + 36, clientY: hy + 20, bubbles: true, pointerId: 2, isPrimary: true }));
  return { w: sel.style.width, h: sel.style.height, left: sel.style.left, top: sel.style.top };
})()
"@
"RESIZED: $($resized | ConvertTo-Json -Compress)"
# 诊断：stage img 加载状态
$imgDiag = Eval-JS "(function () { var i = document.querySelector('.vshell-tag-crop-stage img'); if (!i) return null; var r = i.getBoundingClientRect(); return { complete: i.complete, nw: i.naturalWidth, nh: i.naturalHeight, w: r.width, h: r.height, srcPrefix: (i.src || '').slice(0, 30) }; })()"
"IMGDIAG: $($imgDiag | ConvertTo-Json -Compress)"
# 截图（裁剪界面）
$shot = Send-Cdp 'Page.captureScreenshot' @{ format = 'png' }
if ($shot.result -and $shot.result.data) {
  [IO.File]::WriteAllBytes('D:\Project\Ongoing\vsc-ui\output\_crop-ui.png', [Convert]::FromBase64String($shot.result.data))
  'SHOT saved'
}
$okClick = Eval-JS "var ok = document.querySelector('.vshell-tag-crop-ok'); if (ok) { ok.click(); 'clicked' } else { 'no-ok' }"
"OKCLICK: $okClick"
Start-Sleep 0.8
$res = Eval-JS @"
(function () {
  var thumb = document.querySelector('.vshell-tag-row .vshell-tag-thumb');
  var img = thumb && thumb.querySelector('img');
  var tags = window.VShell && VShell.tags.list();
  return {
    thumbHasImg: !!img,
    srcIsPng: img ? img.src.indexOf('data:image/png') === 0 : false,
    srcLen: img ? img.src.length : 0,
    iconUpdated: tags && tags.length ? (tags[0].icon || '').indexOf('data:image/png') === 0 : false,
    cropClosed: !document.querySelector('.vshell-tag-crop-sel'),
  };
})()
"@
"RESULT: $($res | ConvertTo-Json -Compress)"
$ws.Dispose()
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
