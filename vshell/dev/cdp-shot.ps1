# vshell CDP 驱动：Edge headless + Emulation.setDeviceMetricsOverride
# 用法: powershell -File cdp-shot.ps1 -Url <url> -Out <png> -Width 390 -Height 844 [-Flags "..."]
param(
  [string]$Url = 'http://127.0.0.1:8932/_vs-harness.html?dark#/',
  [string]$Out = 'out.png',
  [int]$Width = 390,
  [int]$Height = 844,
  [string]$ExtraFlags = '',
  [int]$Port = 9222
)
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$ud = "$env:TEMP\dsh-cdp-shot"; Remove-Item $ud -Recurse -Force -ErrorAction SilentlyContinue
Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep 1

$p = Start-Process -FilePath $edge -ArgumentList @(
  '--headless=new','--disable-gpu','--hide-scrollbars','--autoplay-policy=no-user-gesture-required',
  "--remote-debugging-port=$Port", "--user-data-dir=$ud", '--force-prefers-reduced-motion',
  'about:blank') -PassThru -WindowStyle Hidden
Start-Sleep 2.5

# 拿 page target 的 websocket url
$targets = Invoke-RestMethod "http://127.0.0.1:$Port/json"
$ws = ($targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1).webSocketDebuggerUrl
if (-not $ws) { throw 'no page target' }

$client = [System.Net.WebSockets.ClientWebSocket]::new()
$client.ConnectAsync([Uri]$ws, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
$nextId = 0
$pending = @{}
$script:socket = $client

function Send-Cdp([string]$method, $params) {
  $script:nextId++
  $id = $script:nextId
  $msg = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 6 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
  $seg = [ArraySegment[byte]]::new($bytes)
  $client.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  # 读响应直到 id 匹配
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
    # 忽略事件消息
  }
}

Send-Cdp 'Emulation.setDeviceMetricsOverride' @{ width = $Width; height = $Height; deviceScaleFactor = 1; mobile = $false } | Out-Null
Send-Cdp 'Page.navigate' @{ url = $Url } | Out-Null
Start-Sleep 6   # 等页面渲染 + diag POST（含 cardTest 4s 启动）
$shot = Send-Cdp 'Page.captureScreenshot' @{ format = 'jpeg'; quality = 80 }
if (-not $shot -or -not $shot.result.data) { Write-Host ('shot resp len=' + ($shot | ConvertTo-Json -Depth 3 -Compress).Length) } elseif ($shot.result.data) {
  [IO.File]::WriteAllBytes($Out, [Convert]::FromBase64String($shot.result.data))
  Write-Host "saved: $Out ($(Get-Item $Out).Length bytes)"
} else { Write-Host 'no screenshot data' }
$client.Dispose()
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue


