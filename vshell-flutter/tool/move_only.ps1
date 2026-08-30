# 纯鼠标移动（不点击），用法: move_only.ps1 -X 800 -Y 500
param(
  [int]$X = 800,
  [int]$Y = 500
)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MoveOnly {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
"@
[MoveOnly]::SetCursorPos($X, $Y) | Out-Null
Write-Output "moved $X,$Y"
