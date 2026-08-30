# 截图 vshell 窗口（置顶保持原位 + CopyFromScreen），用法: win_shot.ps1 <out.png> [-Fast]
# -Fast: 恢复后立即截图（<400ms 总延迟），用于窗口被媒体 bug 反复最小化的场景
param([string]$Out = 'D:\Project\Ongoing\vsc-ui\_shot.png', [switch]$Fast)
Add-Type -AssemblyName System.Drawing
# DPI aware：pwsh 默认 unaware（150% 缩放时 CopyFromScreen 坐标被虚拟化导致截图错位）
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DpiAware {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[DpiAware]::SetProcessDPIAware() | Out-Null
Add-Type @"
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left, Top, Right, Bottom; }
public class Win32 {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@
$proc = Get-Process vshell -ErrorAction Stop | Select-Object -First 1
$h = $proc.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { Write-Error 'no window'; exit 1 }
$r = New-Object RECT
[Win32]::GetWindowRect($h, [ref]$r) | Out-Null
# 每次强制窗口固定位置尺寸（物理 2160x1350 = main.dart 逻辑 1440x900 @150% DPI）：
# media_kit 播放会使窗口位置/尺寸漂移（曾隐藏到 -21333），且每次启动 DPI 状态可能
# 不同导致布局漂移——固定坐标保证验证截图可复现。2K 主屏 2560x1440 可容纳。
[Win32]::ShowWindow($h, 9) | Out-Null  # SW_RESTORE
[Win32]::SetWindowPos($h, [IntPtr]::Zero, 200, 45, 2160, 1350, 0x0040) | Out-Null
if ($Fast) { Start-Sleep -Milliseconds 120 } else { Start-Sleep -Milliseconds 500 }
[Win32]::GetWindowRect($h, [ref]$r) | Out-Null
# 置顶（保持位置尺寸）
[Win32]::SetWindowPos($h, [IntPtr](-1), $r.Left, $r.Top, 0, 0, 0x0002 -bor 0x0001 -bor 0x0040) | Out-Null
if ($Fast) { Start-Sleep -Milliseconds 80 } else { Start-Sleep -Milliseconds 600 }
# 置顶后复查：窗口若被 media_kit 再次移出屏幕（Left<-1000），恢复并重查
[Win32]::GetWindowRect($h, [ref]$r) | Out-Null
if ($r.Left -lt -1000) {
  [Win32]::ShowWindow($h, 9) | Out-Null
  [Win32]::SetWindowPos($h, [IntPtr]::Zero, 200, 45, 2160, 1350, 0x0040) | Out-Null
  Start-Sleep -Milliseconds 600
  [Win32]::GetWindowRect($h, [ref]$r) | Out-Null
}
$w = $r.Right - $r.Left; $hh = $r.Bottom - $r.Top
$bmp = New-Object System.Drawing.Bitmap($w, $hh)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size($w, $hh)))
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
# 截图后复查：窗口若被媒体 bug 再次最小化/移出屏幕，输出标记供脚本判断
[Win32]::GetWindowRect($h, [ref]$r) | Out-Null
$after = "OK"
if ($r.Left -lt -1000 -or $r.Top -lt -1000) { $after = "HIDDEN" }
Write-Output "saved $Out (${w}x${hh}) rectAfter=($($r.Left),$($r.Top)) $after"
