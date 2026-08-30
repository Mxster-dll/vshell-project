# ============================================================
# stop-headless.ps1 — 只终止 Edge headless 验证残留进程
# 不碰用户正常浏览窗口（按命令行 --headless 过滤，而非全杀 msedge）
# 用法：pwsh -File dev/stop-headless.ps1
# ============================================================
$procs = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match '--headless' }
$n = 0
foreach ($p in $procs) {
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; $n++ } catch { }
}
"killed $n headless msedge process(es); user windows untouched"
