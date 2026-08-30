# 恢复窗口到 (560,246,2160x1350) → 按窗口内相对坐标点击（物理像素）
# 2160x1350 物理 = 1440x900 逻辑（150% DPI），详情页全部内容可见
# 用法: click_win.ps1 -RelX 654 -RelY 775
param([int]$RelX = 654, [int]$RelY = 775)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public struct R3 { public int L, T, R, B; }
public class W3 {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R3 r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  public const uint LEFTDOWN = 0x02, LEFTUP = 0x04;
}
"@
[W3]::SetProcessDPIAware() | Out-Null
$p = Get-Process vshell | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Error 'no vshell window'; exit 1 }
$h = $p.MainWindowHandle
[W3]::ShowWindow($h, 9) | Out-Null
[W3]::SetWindowPos($h, [IntPtr]::Zero, 560, 246, 2160, 1350, 0x0040) | Out-Null
Start-Sleep -Milliseconds 500
$r = New-Object R3
[W3]::GetWindowRect($h, [ref]$r) | Out-Null
[W3]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 200
$sx = $r.L + $RelX; $sy = $r.T + $RelY
[W3]::SetCursorPos($sx, $sy) | Out-Null
Start-Sleep -Milliseconds 100
[W3]::mouse_event([W3]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[W3]::mouse_event([W3]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
Write-Output ("clicked screen " + $sx + "," + $sy + " (win " + $r.L + "," + $r.T + " " + ($r.R - $r.L) + "x" + ($r.B - $r.T) + ")")
