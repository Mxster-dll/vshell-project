# 置顶 vshell 主窗口后点击（屏幕物理坐标，DPI aware）
# 用法: powershell -ExecutionPolicy Bypass tool\click_app.ps1 -X 800 -Y 400 [-Double]
param(
  [int]$X = 800,
  [int]$Y = 400,
  [switch]$Double
)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MouseApp {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public const uint LEFTDOWN = 0x02;
  public const uint LEFTUP = 0x04;
}
"@
[MouseApp]::SetProcessDPIAware() | Out-Null
$p = Get-Process vshell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output "no vshell window"; exit 1 }
$h = $p.MainWindowHandle
# 恢复位置（物理 200,45 2160x1350；置顶）——0x0040=SWP_SHOWWINDOW（移动+改尺寸）
[MouseApp]::ShowWindow($h, 9) | Out-Null
[MouseApp]::SetWindowPos($h, [IntPtr](-1), 200, 45, 2160, 1350, 0x0040) | Out-Null
[MouseApp]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 300
[MouseApp]::SetCursorPos($X, $Y) | Out-Null
Start-Sleep -Milliseconds 120
[MouseApp]::mouse_event([MouseApp]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[MouseApp]::mouse_event([MouseApp]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
if ($Double) {
  Start-Sleep -Milliseconds 120
  [MouseApp]::mouse_event([MouseApp]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 60
  [MouseApp]::mouse_event([MouseApp]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
}
Write-Output "clicked $X,$Y on hwnd=$h"
