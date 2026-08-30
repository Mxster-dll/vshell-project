# 在窗口客户区内点击（物理坐标，DPI aware）
# 用法: powershell -ExecutionPolicy Bypass tool\click_at.ps1 -X 800 -Y 400 [-Double]
param(
  [int]$X = 800,
  [int]$Y = 400,
  [switch]$Double
)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MouseEx {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  public const uint LEFTDOWN = 0x02;
  public const uint LEFTUP = 0x04;
}
"@
[MouseEx]::SetCursorPos($X, $Y) | Out-Null
Start-Sleep -Milliseconds 80
[MouseEx]::mouse_event([MouseEx]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[MouseEx]::mouse_event([MouseEx]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
if ($Double) {
  Start-Sleep -Milliseconds 120
  [MouseEx]::mouse_event([MouseEx]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 60
  [MouseEx]::mouse_event([MouseEx]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
}
Write-Output "clicked $X,$Y"
