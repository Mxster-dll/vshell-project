# 纯截图（不动窗口/鼠标），用法: shot_only.ps1 <out.png>
param([string]$Out = 'D:\Project\Ongoing\vsc-ui\_shot.png')
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DpiOnly {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[DpiOnly]::SetProcessDPIAware() | Out-Null
$bmp = New-Object System.Drawing.Bitmap(2160, 1350)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen(200, 45, 0, 0, (New-Object System.Drawing.Size(2160, 1350)))
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "shot saved $Out"
