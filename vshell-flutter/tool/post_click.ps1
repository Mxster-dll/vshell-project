# PostMessage 直接向 vshell 窗口发送鼠标点击（客户区物理坐标，DPI aware）
# 用法: post_click.ps1 -X 1803 -Y 42 [-Double]
param(
  [int]$X = 1803,
  [int]$Y = 42,
  [switch]$Double
)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class PM2 {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public const uint WM_LBUTTONDOWN = 0x0201;
  public const uint WM_LBUTTONUP = 0x0202;
}
"@
[PM2]::SetProcessDPIAware() | Out-Null
$p = Get-Process vshell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output "no vshell window"; exit 1 }
$h = $p.MainWindowHandle
[PM2]::SetForegroundWindow($h) | Out-Null
$r = New-Object PM2+RECT
[PM2]::GetWindowRect($h, [ref]$r) | Out-Null
# lParam = (y << 16) | x，客户区坐标（相对窗口左上）
$lp = (($Y -band 0xFFFF) -shl 16) -bor ($X -band 0xFFFF)
[PM2]::PostMessage($h, [PM2]::WM_LBUTTONDOWN, [IntPtr]::Zero, [IntPtr]$lp) | Out-Null
Start-Sleep -Milliseconds 80
[PM2]::PostMessage($h, [PM2]::WM_LBUTTONUP, [IntPtr]::Zero, [IntPtr]$lp) | Out-Null
if ($Double) {
  Start-Sleep -Milliseconds 120
  [PM2]::PostMessage($h, [PM2]::WM_LBUTTONDOWN, [IntPtr]::Zero, [IntPtr]$lp) | Out-Null
  Start-Sleep -Milliseconds 80
  [PM2]::PostMessage($h, [PM2]::WM_LBUTTONUP, [IntPtr]::Zero, [IntPtr]$lp) | Out-Null
}
Write-Output "posted click client($X,$Y) win=($($r.L),$($r.T))"
