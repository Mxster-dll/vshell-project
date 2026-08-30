/// 下载管理页：任务列表（m3u8 下载）+ 保存目录选择 + 下载入口
/// 第一版：手动输入 m3u8 URL 下载；详情页下载按钮后续接入
library;

import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';

import '../../services/hls_downloader.dart';
import '../../theme/vs_icons.dart';
import '../../theme/vs_theme.dart';
import '../../main.dart';

class DownloadTask {
  final String url;
  final String title;
  final String id; // 桥关联 id（web 任务 ↔ Flutter 任务）
  HlsTask handle = HlsTask();
  String status = 'downloading'; // downloading / done / failed / canceled
  double progress = 0;
  String? error;
  String? savePath;
  DownloadTask({required this.url, required this.title, String? id})
      : id = id ??
            'dl_${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}'
                '${(DownloadManager.instance.tasks.length).toString()}';
}

class DownloadManager extends ChangeNotifier {
  DownloadManager._();
  static final DownloadManager instance = DownloadManager._();

  final List<DownloadTask> tasks = [];
  String? defaultDir;

  DownloadTask? byId(String id) {
    for (final t in tasks) {
      if (t.id == id) return t;
    }
    return null;
  }

  Future<DownloadTask> add(String url, {String? title, String? dir}) async {
    final t = DownloadTask(url: url, title: title ?? p.basename(url));
    tasks.insert(0, t);
    notifyListeners();
    _run(t, dir ?? defaultDir);
    return t;
  }

  Future<void> _run(DownloadTask t, String? dir) async {
    try {
      final dl = HlsDownloader.instance;
      await dl.detectFfmpeg();
      var savePath = '';
      if (dir != null && dir.isNotEmpty) {
        savePath = p.join(dir, '${_safeName(t.title)}.mp4');
      } else {
        // 保存对话框（桌面 file_selector 后续替换，先默认到下载目录）
        final home = await _defaultDownloadsDir();
        savePath = p.join(home, '${_safeName(t.title)}.mp4');
      }
      t.savePath = savePath;
      await dl.downloadM3u8(t.url,
          savePath: savePath,
          task: t.handle,
          onProgress: (pct, bytes, total) {
            t.progress = pct < 0 ? 0 : pct;
            notifyListeners();
          });
      if (t.handle.canceled) {
        t.status = 'canceled';
      } else {
        t.status = 'done';
        t.progress = 100;
      }
    } catch (e) {
      if (t.handle.canceled) {
        t.status = 'canceled';
      } else {
        t.status = 'failed';
        t.error = '$e';
      }
    }
    notifyListeners();
  }

  static Future<String> _defaultDownloadsDir() async {
    // Android：path_provider 应用专属下载目录（/storage/emulated/0/Android/
    // data/<pkg>/files/Download——分区存储免权限）
    if (Platform.isAndroid) {
      try {
        final d = await getDownloadsDirectory();
        if (d != null) return d.path;
      } catch (_) {}
      try {
        final d = await getExternalStorageDirectory();
        if (d != null) return d.path;
      } catch (_) {}
      return '.';
    }
    try {
      final home = await _homeDir();
      final d = Directory(p.join(home, 'Downloads'));
      if (await d.exists()) return d.path;
      return home;
    } catch (_) {
      return '.';
    }
  }

  static Future<String> _homeDir() async {
    final env = Platform.environment['USERPROFILE'];
    if (env != null && env.isNotEmpty) return env;
    return Directory.current.path;
  }

  static String _safeName(String s) {
    final cleaned = s.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_').trim();
    return cleaned.isEmpty ? 'video' : cleaned.substring(0, cleaned.length > 80 ? 80 : cleaned.length);
  }
}

class DownloadsPage extends StatelessWidget {
  const DownloadsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final mgr = context.watch<DownloadManager>();
    // web .vshell-fab：固定 right/bottom 20px，任务存在时悬浮胶囊
    return Stack(
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 12),
              child: Row(
                children: [
                  // web .vshell-page-title：18px/600
                  Text('下载',
                      style: TextStyle(
                          color: VsTheme.fg,
                          fontSize: 18,
                          fontWeight: FontWeight.w600)),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: () => _showAddDialog(context),
                    icon: const Icon(VsIcons.link, size: 14),
                    label: const Text('粘贴 m3u8 下载'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: mgr.tasks.isEmpty
                  ? Center(
                      child: Text('暂无下载任务\n在详情页点下载或粘贴 m3u8 链接',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: VsTheme.fgDim,
                              fontSize: 13,
                              height: 1.8)))
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(20, 4, 20, 60),
                      itemCount: mgr.tasks.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (c, i) => _taskTile(mgr, mgr.tasks[i]),
                    ),
            ),
          ],
        ),
        if (mgr.tasks.isNotEmpty)
          Positioned(right: 20, bottom: 20, child: _VsFab(mgr: mgr)),
      ],
    );
  }

  Widget _taskTile(DownloadManager mgr, DownloadTask t) {
    return _DlCard(mgr: mgr, task: t);
  }

  void _showAddDialog(BuildContext context) {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('粘贴 m3u8 地址'),
        content: SizedBox(
          width: 460,
          child: TextField(
            controller: ctrl,
            autofocus: true,
            decoration: const InputDecoration(hintText: 'https://.../index.m3u8'),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          ElevatedButton(
            onPressed: () {
              final u = ctrl.text.trim();
              if (u.isNotEmpty) {
                DownloadManager.instance.add(u);
              }
              Navigator.pop(ctx);
            },
            child: const Text('开始下载'),
          ),
        ],
      ),
    );
  }
}

/// 下载任务卡（web .vshell-dl-card：r12 + editorWidget 底 + 1px panel-border、
/// hover 上浮 1px 且边框变 widget-border（160ms）、入场 vshell-page-in 0.2s、
/// thumb 112×63 r8、标题 14/600、chip 11px、主进度条 6px r3 fill
/// progressBar #0078D4（300ms 宽过渡）、meta 12px）
class _DlCard extends StatefulWidget {
  const _DlCard({required this.mgr, required this.task});

  final DownloadManager mgr;
  final DownloadTask task;

  @override
  State<_DlCard> createState() => _DlCardState();
}

class _DlCardState extends State<_DlCard> {
  bool _hover = false;
  bool _entered = false;

  DownloadTask get t => widget.task;

  String get _chipText => switch (t.status) {
        'done' => '已完成',
        'failed' => '失败',
        'canceled' => '已取消',
        _ => '下载中',
      };

  @override
  void initState() {
    super.initState();
    // 入场动画（vshell-page-in 0.2s：opacity + translateY(8px)）
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _entered = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      opacity: _entered ? 1 : 0,
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOut,
      child: AnimatedSlide(
        offset: _entered ? Offset.zero : const Offset(0, 8 / 600),
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        child: MouseRegion(
          onEnter: (_) => setState(() => _hover = true),
          onExit: (_) => setState(() => _hover = false),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            curve: Curves.easeOut,
            transform: _hover
                ? (Matrix4.identity()..translate(0.0, -1.0))
                : null,
            transformAlignment: Alignment.topCenter,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: VsTheme.widgetBg,
              borderRadius: BorderRadius.circular(VsTheme.radiusXLarge),
              border: Border.all(
                  color: _hover ? VsTheme.widgetBorder : VsTheme.border),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _thumb(),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              t.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
                            ),
                          ),
                          const SizedBox(width: 8),
                          _chip(),
                        ],
                      ),
                      const SizedBox(height: 8),
                      _bar(),
                      const SizedBox(height: 8),
                      if (t.status == 'failed')
                        Text(t.error ?? '下载失败',
                            style: TextStyle(
                                color: VsTheme.error,
                                fontSize: 12,
                                fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback))
                      else if (t.savePath != null && t.status == 'done')
                        Text(t.savePath!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                color: VsTheme.fgDim,
                                fontSize: 12,
                                fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback)),
                      if (t.status == 'downloading') _ops(),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// 缩略图占位（web .vshell-dl-thumb：112×63 r8 bg list-hoverBackground；
  /// 无封面数据时显示下载图标）
  Widget _thumb() {
    return Container(
      width: 112,
      height: 63,
      decoration: BoxDecoration(
        color: VsTheme.listHover,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Icon(VsIcons.download, size: 24, color: VsTheme.fgDim),
    );
  }

  /// 状态胶囊（web .vshell-dl-chip：11px r10 badge 色）
  Widget _chip() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: VsTheme.badgeBg,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        _chipText,
        style: TextStyle(
            color: VsTheme.badgeFg, fontSize: 11, fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
      ),
    );
  }

  /// 主进度条（web .vshell-dl-bar：6px r3 track list-hover、
  /// fill progressBar #0078D4、width 300ms ease）
  Widget _bar() {
    final pct = (t.progress / 100).clamp(0.0, 1.0);
    return ClipRRect(
      borderRadius: BorderRadius.circular(3),
      child: LayoutBuilder(
        builder: (context, cons) => Container(
          height: 6,
          color: VsTheme.listHover,
          child: Align(
            alignment: Alignment.centerLeft,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut,
              width: cons.maxWidth * pct,
              height: 6,
              color: VsTheme.accent,
            ),
          ),
        ),
      ),
    );
  }

  /// 操作按钮（web .vshell-dl-op：高 28、padding 0 10、12px）
  Widget _ops() {
    return Row(
      children: [
        _opBtn(
          t.handle.paused ? VsIcons.debugContinue : VsIcons.debugPause,
          () {
            if (t.handle.paused) {
              t.handle.resume();
            } else {
              t.handle.pause();
            }
            setState(() {});
          },
        ),
        const SizedBox(width: 8),
        _opBtn(VsIcons.close, () => t.handle.cancel()),
      ],
    );
  }

  Widget _opBtn(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 28,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: VsTheme.border),
        ),
        child: Center(
          child: Icon(icon, size: 13, color: VsTheme.fg),
        ),
      ),
    );
  }
}

/// 下载悬浮胶囊（web .vshell-fab，css:3296-3473）：
/// 右下 20,20 固定；胶囊 44 高 r22 editorWidget-background + widget-border +
/// shadow 0 6px 24px 0.35，hover 上浮 2px + 阴影加深 140ms；
/// 内容 = icon 17 charts-blue + 进行中计数 badge + 总进度条 60×4；
/// 点击开 drawer（320 宽任务列表，vshell-pop 0.18s）
class _VsFab extends StatefulWidget {
  final DownloadManager mgr;
  const _VsFab({required this.mgr});

  @override
  State<_VsFab> createState() => _VsFabState();
}

class _VsFabState extends State<_VsFab> {
  bool _open = false;
  bool _hover = false;

  @override
  void initState() {
    super.initState();
    // --fab-open：drawer 初始展开（截图验证用）
    _open = kFabOpenTest;
  }

  int get _active =>
      widget.mgr.tasks.where((t) => t.status == 'downloading').length;

  double get _avg => widget.mgr.tasks.isEmpty
      ? 0
      : widget.mgr.tasks.fold(0.0, (s, t) => s + t.progress) /
          widget.mgr.tasks.length;

  /// 任务状态色（web css:3476-3493）
  Color _statusColor(String s) => switch (s) {
        'downloading' => VsTheme.watchBlue, // charts-blue
        'merging' => VsTheme.accent, // progressBar
        'failed' => VsTheme.error,
        'done' => VsTheme.fg,
        _ => VsTheme.fgDim, // paused / canceled
      };

  String _statusText(String s) => switch (s) {
        'downloading' => '下载中',
        'merging' => '合并中',
        'failed' => '失败',
        'done' => '完成',
        'canceled' => '已取消',
        _ => s,
      };

  @override
  Widget build(BuildContext context) {
    final tasks = widget.mgr.tasks;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        // ---- drawer（vshell-pop 0.18s：scale 0.94→1 + 淡入）----
        if (_open)
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: 1),
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            builder: (c, t, child) => Opacity(
              opacity: t,
              child: Transform.scale(scale: 0.94 + 0.06 * t, child: child),
            ),
            child: Container(
              width: 320,
              constraints: BoxConstraints(
                  maxHeight: MediaQuery.sizeOf(context).height * 0.62),
              decoration: BoxDecoration(
                color: VsTheme.widgetBg, // editorWidget-background
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: VsTheme.widgetBorder),
                boxShadow: const [
                  BoxShadow(
                      color: Color(0x73000000),
                      blurRadius: 40,
                      offset: Offset(0, 12)),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // drawer-head
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                    child: Row(
                      children: [
                        Text('下载任务',
                            style: TextStyle(
                                color: VsTheme.fg,
                                fontSize: 13,
                                fontWeight: FontWeight.w600)),
                        const Spacer(),
                        _HoverBtn(
                          icon: VsIcons.close,
                          size: 26,
                          iconSize: 12,
                          onTap: () => setState(() => _open = false),
                        ),
                      ],
                    ),
                  ),
                  // drawer-list
                  Flexible(
                    child: ListView.separated(
                      shrinkWrap: true,
                      padding: const EdgeInsets.all(6),
                      itemCount: tasks.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 4),
                      itemBuilder: (c, i) => _FabRow(task: tasks[i]),
                    ),
                  ),
                  // drawer-foot
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                    child: Row(
                      children: [
                        Expanded(
                          child: _drawerBtn('清除已完成', () {
                            for (final t in List.of(tasks)) {
                              if (t.status == 'done') {
                                widget.mgr.tasks.remove(t);
                              }
                            }
                            widget.mgr.notifyListeners();
                          }),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _drawerBtn('全部取消', () {
                            for (final t in tasks) {
                              if (t.status == 'downloading') t.handle.cancel();
                            }
                            setState(() {});
                          }),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        if (_open) const SizedBox(height: 10),
        // ---- 胶囊 ----
        MouseRegion(
          onEnter: (_) => setState(() => _hover = true),
          onExit: (_) => setState(() => _hover = false),
          child: GestureDetector(
            onTap: () => setState(() => _open = !_open),
            child: AnimatedSlide(
              offset: _hover ? const Offset(0, -0.045) : Offset.zero,
              duration: const Duration(milliseconds: 140),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 140),
                height: 44,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                decoration: BoxDecoration(
                  color: VsTheme.widgetBg,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: VsTheme.widgetBorder),
                  boxShadow: _hover
                      ? const [
                          BoxShadow(
                              color: Color(0x73000000),
                              blurRadius: 30,
                              offset: Offset(0, 10))
                        ]
                      : const [
                          BoxShadow(
                              color: Color(0x59000000),
                              blurRadius: 24,
                              offset: Offset(0, 6))
                        ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(VsIcons.cloudDownload,
                        size: 17, color: VsTheme.watchBlue), // charts-blue
                    if (_active > 0) ...[
                      const SizedBox(width: 8),
                      // 进行中计数（badge 色）
                      Container(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(
                          color: VsTheme.badgeBg,
                          borderRadius: BorderRadius.circular(9),
                        ),
                        child: Text('$_active',
                            style: TextStyle(
                                color: VsTheme.badgeFg,
                                fontSize: 12,
                                fontWeight: FontWeight.w600)),
                      ),
                    ],
                    const SizedBox(width: 8),
                    // 总进度条 60×4（fill progressBar 300ms）
                    SizedBox(
                      width: 60,
                      height: 4,
                      child: LayoutBuilder(builder: (c, cons) {
                        final pct = (_avg / 100).clamp(0.0, 1.0);
                        return Stack(
                          children: [
                            Container(
                              width: cons.maxWidth,
                              decoration: BoxDecoration(
                                color: VsTheme.listHover,
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                            AnimatedContainer(
                              duration: const Duration(milliseconds: 300),
                              width: cons.maxWidth * pct,
                              decoration: BoxDecoration(
                                color: VsTheme.accent, // progressBar
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                          ],
                        );
                      }),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _drawerBtn(String label, VoidCallback onTap) {
    return _HoverBtn(
      label: label,
      height: 30,
      radius: 6,
      fontSize: 12,
      onTap: onTap,
    );
  }
}

/// FAB drawer 任务行（web .vshell-fab-row，css:3419-3465）：
/// flex gap 10 padding 8 r8 hover list-hover；thumb 56×36 r4；
/// title 12 ellipsis；row-bar 4px r2 fill progressBar 300ms；
/// row-meta 11 descriptionForeground space-between
class _FabRow extends StatelessWidget {
  final DownloadTask task;
  const _FabRow({required this.task});

  Color _statusColor(String s) => switch (s) {
        'downloading' => VsTheme.watchBlue,
        'merging' => VsTheme.accent,
        'failed' => VsTheme.error,
        'done' => VsTheme.fg,
        _ => VsTheme.fgDim,
      };

  String _statusText(String s) => switch (s) {
        'downloading' => '下载中',
        'merging' => '合并中',
        'failed' => '失败',
        'done' => '完成',
        'canceled' => '已取消',
        _ => s,
      };

  @override
  Widget build(BuildContext context) {
    final pct = (task.progress / 100).clamp(0.0, 1.0);
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: VsTheme.listHover,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            // thumb 56×36 r4（任务无封面 → 图标占位）
            Container(
              width: 56,
              height: 36,
              decoration: BoxDecoration(
                color: VsTheme.bg,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Icon(VsIcons.fileMedia, size: 18, color: VsTheme.fgDim),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(task.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: VsTheme.fg,
                          fontSize: 12,
                          fontFamily: VsTheme.fontFamily,
                          fontFamilyFallback: VsTheme.fontFamilyFallback)),
                  const SizedBox(height: 6),
                  // row-bar 4px r2（LayoutBuilder 适配可用宽）
                  ClipRRect(
                    borderRadius: BorderRadius.circular(2),
                    child: SizedBox(
                      height: 4,
                      child: LayoutBuilder(builder: (c, cons) {
                        final barW = cons.maxWidth;
                        return Stack(
                          children: [
                            SizedBox(
                                width: barW,
                                height: 4,
                                child: ColoredBox(color: VsTheme.listHover)),
                            AnimatedContainer(
                              duration: const Duration(milliseconds: 300),
                              width: barW * pct,
                              color: _statusColor(task.status),
                            ),
                          ],
                        );
                      }),
                    ),
                  ),
                  const SizedBox(height: 4),
                  // row-meta：进度 + 状态
                  Row(
                    children: [
                      Expanded(
                        child: Text('${task.progress.toStringAsFixed(1)}%',
                            style: TextStyle(
                                color: VsTheme.fgDim,
                                fontSize: 11,
                                fontFamily: VsTheme.fontFamily,
                                fontFamilyFallback:
                                    VsTheme.fontFamilyFallback)),
                      ),
                      Text(_statusText(task.status),
                          style: TextStyle(
                              color: _statusColor(task.status),
                              fontSize: 11,
                              fontFamily: VsTheme.fontFamily,
                              fontFamilyFallback:
                                  VsTheme.fontFamilyFallback)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// FAB 内部 hover 工具按钮（bg list-hover → hover list-active + activeFg）
class _HoverBtn extends StatefulWidget {
  final String? label;
  final IconData? icon;
  final double size;
  final double iconSize;
  final double height;
  final double radius;
  final double fontSize;
  final VoidCallback onTap;
  const _HoverBtn({
    this.label,
    this.icon,
    this.size = 26,
    this.iconSize = 12,
    this.height = 30,
    this.radius = 6,
    this.fontSize = 12,
    required this.onTap,
  });

  @override
  State<_HoverBtn> createState() => _HoverBtnState();
}

class _HoverBtnState extends State<_HoverBtn> {
  bool _hover = false;
  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          height: widget.height,
          padding: widget.icon == null
              ? const EdgeInsets.symmetric(horizontal: 10)
              : null,
          width: widget.icon == null ? null : widget.size,
          decoration: BoxDecoration(
            color: _hover ? VsTheme.listActive : VsTheme.listHover,
            borderRadius: BorderRadius.circular(widget.radius),
          ),
          child: Center(
            child: widget.icon != null
                ? Icon(widget.icon,
                    size: widget.iconSize,
                    color: _hover ? VsTheme.activeFg : VsTheme.fg)
                : Text(widget.label ?? '',
                    style: TextStyle(
                      color: _hover ? VsTheme.activeFg : VsTheme.fg,
                      fontSize: widget.fontSize,
                      fontFamily: VsTheme.fontFamily,
                      fontFamilyFallback: VsTheme.fontFamilyFallback,
                    )),
          ),
        ),
      ),
    );
  }
}
