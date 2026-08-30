/// 设置页：ffmpeg 路径、下载目录、数据源信息、主题
library;

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/hls_downloader.dart';
import '../../state/app_state.dart';
import '../../theme/vs_theme.dart';
import '../pages/downloads_page.dart' show DownloadManager;

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  final _ffmpegCtrl = TextEditingController();
  bool? _ffmpegOk;
  String? _ffmpegMsg;

  @override
  void initState() {
    super.initState();
    _ffmpegCtrl.text = HlsDownloader.instance.ffmpegPath ?? '';
    _probe();
  }

  Future<void> _probe() async {
    final ok = await HlsDownloader.instance
        .detectFfmpeg(custom: _ffmpegCtrl.text.trim());
    if (!mounted) return;
    setState(() {
      _ffmpegOk = ok;
      _ffmpegMsg = ok
          ? 'ffmpeg 可用（m3u8 下载将合并为 MP4）'
          : '未找到 ffmpeg（m3u8 下载将输出 .ts 拼接文件）';
    });
  }

  @override
  Widget build(BuildContext context) {
    final themeLight = context.watch<AppState>().themeLight;
    final gridGap = context.watch<AppState>().gridGap;
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 40),
      children: [
        Text('设置',
            style: TextStyle(
                color: VsTheme.fg, fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 16),
        _section('外观', [
          _row('主题',
              subtitle: themeLight ? '浅色（vs-light）' : '深色（vs-dark）',
              trailing: Switch(
                value: themeLight,
                activeTrackColor: VsTheme.accent,
                onChanged: (_) => context.read<AppState>().toggleTheme(),
              )),
          _row('卡片间距',
              subtitle: '分类栏与视频卡片、视频卡片之间共用的间距（当前 ${gridGap.round()}px）',
              trailing: SizedBox(
                width: 200,
                child: Slider(
                  value: gridGap,
                  min: 2,
                  max: 16,
                  divisions: 7,
                  activeColor: VsTheme.accent,
                  label: '${gridGap.round()}px',
                  onChanged: (v) => context.read<AppState>().setGridGap(v),
                ),
              )),
        ]),
        const SizedBox(height: 16),
        _section('下载', [
          _row('ffmpeg 路径',
              subtitle: _ffmpegMsg ?? '检测中…',
              trailing: SizedBox(
                width: 320,
                child: TextField(
                  controller: _ffmpegCtrl,
                  onSubmitted: (_) => _probe(),
                  style: TextStyle(color: VsTheme.fg, fontSize: 13),
                  decoration: const InputDecoration(hintText: 'ffmpeg.exe 路径或留空自动检测'),
                ),
              ),
              onTrailingTap: _pickFfmpeg),
          _row('默认下载目录',
              subtitle: '下载文件保存位置',
              trailing: TextButton(
                onPressed: () async {
                  final dir = await getDirectoryPath();
                  if (dir != null) {
                    DownloadManager.instance.defaultDir = dir;
                    setState(() {});
                  }
                },
                child: Text(DownloadManager.instance.defaultDir ?? '选择目录…',
                    style: TextStyle(color: VsTheme.linkBlue, fontSize: 12)),
              )),
        ]),
        const SizedBox(height: 16),
        _section('数据源', [
          _row('AcFun', subtitle: '国内可访问 · 免登录 · m3u8 直链下载'),
        ]),
        const SizedBox(height: 16),
        _section('关于', [
          _row('vshell v0.5.6', subtitle: 'Flutter 桌面版（完整移植 web 版功能）'),
        ]),
      ],
    );
  }

  Future<void> _pickFfmpeg() async {
    const typeGroup = XTypeGroup(label: 'ffmpeg', extensions: ['exe']);
    final f = await openFile(acceptedTypeGroups: const [typeGroup]);
    if (f != null) {
      _ffmpegCtrl.text = f.path;
      await _probe();
    }
  }

  Widget _section(String title, List<Widget> rows) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title,
            style: TextStyle(
                color: VsTheme.fgDim, fontSize: 12, fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        Container(
          decoration: BoxDecoration(
            color: VsTheme.surface,
            borderRadius: BorderRadius.circular(VsTheme.radiusMedium),
            border: Border.all(color: VsTheme.border),
          ),
          child: Column(children: [for (final r in rows) r]),
        ),
      ],
    );
  }

  Widget _row(String title,
      {String? subtitle,
      Widget? trailing,
      VoidCallback? onTrailingTap}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: TextStyle(color: VsTheme.fg, fontSize: 13)),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(subtitle,
                      style: TextStyle(
                          color: VsTheme.fgDim, fontSize: 11)),
                ],
              ],
            ),
          ),
          if (trailing != null) trailing,
        ],
      ),
    );
  }
}
