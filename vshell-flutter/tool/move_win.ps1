# 置顶 vshell 窗口后分步移动鼠标（模拟轨迹，触发 hover 事件）
# 用法: move_win.ps1 -X 1000 -Y 500
param(
  [int]$X = 1000,
  [int]$Y = 500
)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MoveWin {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
}
"@
$p = Get-Process vshell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output "no vshell"; exit 1 }
$h = $p.MainWindowHandle
# 强制恢复窗口位置尺寸（物理 200,45 2160x1350；不用 NOMOVE——
# 窗口偶发隐藏到 (-21333,-21333) 158x26，必须完整设置）
[MoveWin]::ShowWindow($h, 9) | Out-Null
[MoveWin]::SetWindowPos($h, [IntPtr](-1), 200, 45, 2160, 1350, 0x0040) | Out-Null
[MoveWin]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 400
# 从当前光标位置分步移动到目标（5 步）
$cx = [System.Windows.Forms.Cursor]::Position.X
$cy = [System.Windows.Forms.Cursor]::Position.Y
for ($i = 1; $i -le 5; $i++) {
  $nx = [int]($cx + ($X - $cx) * $i / 5)
  $ny = [int]($cy + ($Y - $cy) * $i / 5)
  [MoveWin]::SetCursorPos($nx, $ny) | Out-Null
  Start-Sleep -Milliseconds 80
}
Write-Output "moved stepwise to $X,$Y"
