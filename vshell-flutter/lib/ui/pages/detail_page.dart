/// 详情页：播放器 + 标题/统计/UP主/简介 + 相关推荐
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/models.dart';
import '../../services/characters.dart';
import '../../services/local_videos.dart';
import '../../services/shots.dart';
import '../../services/shots_scanner.dart';
import '../../state/app_state.dart';
import '../../theme/vs_icons.dart';
import '../../theme/vs_theme.dart';
import '../widgets/char_picker_dialog.dart';
import '../widgets/player_view.dart';
import '../widgets/vs_toast.dart';
import '../widgets/video_card.dart';
import 'downloads_page.dart';

class DetailPage extends StatefulWidget {
  final String videoId;
  const DetailPage({super.key, required this.videoId});

  @override
  State<DetailPage> createState() => _DetailPageState();
}

class _DetailPageState extends State<DetailPage> {
  VideoDetail? _detail;
  PlayInfo? _play;
  List<VideoItem> _related = [];
  String? _error;
  bool _downloading = false;
  bool _descExpanded = false;

  // ---- 分镜识别状态（web 版 shots.js 移植）----
  final ValueNotifier<int> _shotsRev = ValueNotifier<int>(0);
  bool _scanning = false;
  double _scanProgress = 0;

  Future<void> _startScan() async {
    final pi = _play;
    if (pi == null || pi.m3u8Url.isEmpty || _scanning) return;
    setState(() {
      _scanning = true;
      _scanProgress = 0;
    });
    // 快扫：隐藏播放器 4x 完整扫一遍（本地 file:// 同样可扫）
    await ShotsScanner.instance.scan(
      pi.m3u8Url,
      widget.videoId,
      knownDuration: (_detail?.duration ?? 0).toDouble(),
      onProgress: (p) {
        if (mounted) setState(() => _scanProgress = p);
      },
      onUpdate: (_) => _shotsRev.value++,
      onDone: () {
        _shotsRev.value++;
        if (mounted) setState(() => _scanning = false);
      },
    );
  }

  @override
  void dispose() {
    _shotsRev.dispose();
    super.dispose();
  }

  Future<void> _startDownload() async {
    final pi = _play;
    if (pi == null || pi.m3u8Url.isEmpty || _downloading) return;
    setState(() => _downloading = true);
    try {
      await DownloadManager.instance.add(pi.m3u8Url, title: _detail?.title ?? widget.videoId);
    } finally {
      if (mounted) {
        setState(() => _downloading = false);
        VsToast.show(context, '已加入下载：${_detail?.title ?? widget.videoId}');
      }
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final src = context.read<AppState>().source;
    // 本地视频分支：不走网站数据源，直接本地文件播放
    if (widget.videoId.startsWith('local:')) {
      await LocalVideosService.instance.init(); // main 未 await，此处确保就绪
      final lv = LocalVideosService.instance.find(widget.videoId);
      if (lv == null) {
        if (mounted) setState(() => _error = '本地视频不存在或已删除');
        return;
      }
      final fp = await LocalVideosService.instance.filePathOf(widget.videoId);
      if (fp == null) {
        if (mounted) setState(() => _error = '本地文件不存在');
        return;
      }
      if (!mounted) return;
      setState(() {
        _detail = VideoDetail(
          id: lv.id,
          title: lv.title,
          cover: lv.cover,
          duration: lv.duration,
          pubdate: lv.pubdate,
          ownerName: '本地视频',
          ownerFace: '',
          viewCount: lv.viewCount,
          danmakuCount: 0,
          channelName: '本地',
          desc: '',
        );
        _play = PlayInfo(
          m3u8Url: 'file://${fp.replaceAll('\\', '/')}',
        );
        _related = [];
      });
      return;
    }
    try {
      final d = await src.detail(widget.videoId);
      PlayInfo? pi;
      try {
        pi = await src.playInfo(widget.videoId,
            partId: d.parts.isNotEmpty ? d.parts.first.id : null);
      } catch (_) {/* 播放源失败不阻塞页面 */}
      List<VideoItem> rel = [];
      try {
        rel = await src.related(widget.videoId);
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _detail = d;
        _play = pi;
        _related = rel;
      });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(VsIcons.error, color: VsTheme.error, size: 32),
            const SizedBox(height: 10),
            Text('加载失败：$_error',
                style: TextStyle(color: VsTheme.error, fontSize: 13)),
            const SizedBox(height: 12),
            TextButton(onPressed: () => setState(() { _error = null; _load(); }), child: const Text('重试')),
          ],
        ),
      );
    }
    if (_detail == null) {
      return const Center(
          child: SizedBox(
              width: 24, height: 24,
              child: CircularProgressIndicator(strokeWidth: 2)));
    }
    final d = _detail!;
    final state = context.watch<AppState>();

    // 双栏布局（web grid：主列 1fr + 侧栏 25% 相关推荐，gap 30；
    // 页面 padding 0 40px 0 60px——左 60 让位浮动返回钮）
    return Stack(
      children: [
        Padding(
      padding: const EdgeInsets.fromLTRB(60, 16, 40, 40),
      child: LayoutBuilder(
        builder: (context, cons) {
          final showSide = cons.maxWidth >= 1120;
          final main = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
        // 播放器（16:9，最大 960 居中）
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 960),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: ClipRRect(
                // web：player-card radius 12
                borderRadius: BorderRadius.circular(12),
                child: _play != null && _play!.m3u8Url.isNotEmpty
                    ? PlayerView(
                        url: _play!.m3u8Url,
                        title: d.title,
                        shotsId: d.id,
                        shotsRev: _shotsRev,
                      )
                    : Container(
                        color: Colors.black,
                        child: Center(
                            child: Text('播放源不可用',
                                style: TextStyle(color: VsTheme.fgDim, fontSize: 13))),
                      ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 14),
        // 标题 + 操作
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 960),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 标题行：web = inline-flex gap 4、标题 19px 600 lh 1.4 nowrap ellipsis、复制按钮 20x20
                Row(
                  children: [
                    Expanded(
                      child: Text(d.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: VsTheme.fg,
                              fontSize: 19,
                              height: 1.4,
                              fontWeight: FontWeight.w600,
                              fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback)),
                    ),
                    const SizedBox(width: 4),
                    // 复制按钮 20x20（web .vshell-detail-copy）
                    _iconBtn(VsIcons.copy, () {
                      _copyTitle(d.title);
                    }),
                  ],
                ),
                const SizedBox(height: 8),
                // 统计行：web = flex gap 14 wrap、13px descriptionForeground、
                // 播放·弹幕·日期·时长 + 分区 badge（padding 2/8 radius 10 badge 11px）
                Wrap(
                  spacing: 14,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (d.viewCount > 0)
                      Text('${d.viewText}播放',
                          style: TextStyle(color: VsTheme.fgDim, fontSize: 13)),
                    if (d.danmakuCount > 0)
                      Text('${d.danmakuCount}弹幕',
                          style: TextStyle(color: VsTheme.fgDim, fontSize: 13)),
                    if (d.pubdate > 0)
                      Text(_fmtDate(d.pubdate),
                          style: TextStyle(color: VsTheme.fgDim, fontSize: 13)),
                    if (d.duration > 0)
                      Text(_fmtDur(d.duration),
                          style: TextStyle(color: VsTheme.fgDim, fontSize: 13)),
                    if (d.channelName.isNotEmpty)
                      Container(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: VsTheme.badgeBg,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(d.channelName,
                            style:
                                TextStyle(color: VsTheme.badgeFg, fontSize: 11)),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                // 操作按钮组：识别分镜 / 下载 / 收藏 / 待看（web = stats 行右侧区）
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    // 识别分镜（快扫 + 边播分析，分段进度条展示）
                    if (_play != null && _play!.m3u8Url.isNotEmpty)
                      GestureDetector(
                        onTap: _scanning ? null : _startScan,
                        child: Container(
                          padding:
                              const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: VsTheme.overlayBg,
                            borderRadius: BorderRadius.circular(VsTheme.radiusMedium),
                            border: Border.all(
                                color: _scanning ? VsTheme.accent : VsTheme.border),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (_scanning)
                                SizedBox(
                                    width: 12,
                                    height: 12,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2, color: VsTheme.accent))
                              else
                                Icon(VsIcons.target,
                                    size: 14, color: VsTheme.fg),
                              const SizedBox(width: 4),
                              Text(
                                _scanning
                                    ? '识别中 ${_scanProgress.round()}%'
                                    : (ShotsStore.instance.isScanned(d.id)
                                        ? '已识别·重扫'
                                        : '识别分镜'),
                                style: TextStyle(
                                    color: _scanning
                                        ? VsTheme.accent
                                        : VsTheme.fg,
                                    fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                      ),
                    // 下载（m3u8 直链 → 下载管理器）
                    if (_play != null && _play!.m3u8Url.isNotEmpty)
                      GestureDetector(
                        onTap: _downloading ? null : _startDownload,
                        child: Container(
                          padding:
                              const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: VsTheme.overlayBg,
                            borderRadius: BorderRadius.circular(VsTheme.radiusMedium),
                            border: Border.all(color: VsTheme.border),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(_downloading ? VsIcons.loading : VsIcons.download,
                                  size: 14, color: VsTheme.fg),
                              const SizedBox(width: 4),
                              Text(_downloading ? '已加入下载' : '下载',
                                  style: TextStyle(color: VsTheme.fg, fontSize: 12)),
                            ],
                          ),
                        ),
                      ),
                    // 收藏/待看
                    _actionBtn(context, VsIcons.star, '收藏',
                        state.isFav(d.id), VsTheme.favRed,
                        () => state.toggleFav(d)),
                    _actionBtn(context, VsIcons.bookmark, '待看',
                        state.isWatch(d.id), VsTheme.watchBlue,
                        () => state.toggleWatch(d)),
                  ],
                ),
                const SizedBox(height: 12),
                // UP主行（web：flex gap 10 margin-top 14、头像 38px 圆形
                // border 1px dropdownBorder shadow、名字 14px 600 fg）
                Row(
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: VsTheme.listHover,
                        border: Border.all(color: VsTheme.dropdownBorder),
                        boxShadow: [
                          BoxShadow(
                              color: const Color(0x80000000),
                              blurRadius: 4,
                              offset: const Offset(0, 1)),
                        ],
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: d.ownerFace.isNotEmpty
                          ? Image.network(d.ownerFace,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => _upFallback(d))
                          : _upFallback(d),
                    ),
                    const SizedBox(width: 10),
                    Flexible(
                      child: Text(d.ownerName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: VsTheme.fg,
                              fontSize: 14,
                              fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                // 角色行（web 版 renderUpRow）
                _charRow(d),
                // 简介（web：margin-top 14、padding 12/14、radius 8、bg listHover、
                // 13px lh 1.7 descriptionForeground、折叠 max-height 64 + 展开按钮）
                if (d.desc.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: VsTheme.listHover,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          d.desc,
                          maxLines: _descExpanded ? null : 3,
                          overflow:
                              _descExpanded ? null : TextOverflow.ellipsis,
                          style: TextStyle(
                              color: VsTheme.fgDim,
                              fontSize: 13,
                              height: 1.7),
                        ),
                        if (d.desc.length > 120)
                          GestureDetector(
                            onTap: () =>
                                setState(() => _descExpanded = !_descExpanded),
                            child: Padding(
                              padding:
                                  const EdgeInsets.only(top: 6),
                              child: Text(
                                _descExpanded ? '收起' : '展开',
                                style: TextStyle(
                                    color: VsTheme.linkBlue, fontSize: 12),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                // 分P
                if (d.parts.length > 1) ...[
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (var i = 0; i < d.parts.length; i++)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: i == 0 ? VsTheme.listActive : VsTheme.overlayBg,
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(color: i == 0 ? VsTheme.accent : VsTheme.border),
                          ),
                          child: Text('P${i + 1} ${d.parts[i].title}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: VsTheme.fg, fontSize: 12)),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
        // 相关推荐（窄窗口：底部网格兜底）
        if (!showSide && _related.isNotEmpty) ...[
          const SizedBox(height: 22),
          Text('相关推荐',
              style: TextStyle(
                  color: VsTheme.fg, fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 320,
              mainAxisSpacing: 16,
              crossAxisSpacing: 16,
              childAspectRatio: 16 / 9 / 1.52,
            ),
            itemCount: _related.length,
            itemBuilder: (c, i) => VideoCard(
              item: _related[i],
              onTap: () {
                final id = _related[i].id;
                // web：push 保留返回栈（返回回到上一详情）
                Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => DetailPage(videoId: id)));
              },
            ),
          ),
        ],
        ],
      );
          if (!showSide) {
            return SingleChildScrollView(child: main);
          }
          // 宽窗口：主列滚动 + 侧栏独立滚动（web：main overflow hidden / side overflow-y auto）
          // 侧栏宽：web 25% 列（1280 时收窄为 300px）→ min(25%, 320)
          final sideW = (cons.maxWidth * 0.25).clamp(240.0, 320.0);
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: SingleChildScrollView(child: main)),
              const SizedBox(width: 30),
              SizedBox(
                width: sideW,
                height: cons.maxHeight,
                child: _relatedList(),
              ),
            ],
          );
        },
      ),
        ),
        // 浮动返回钮（web .vshell-detail-back：24x24 r6 button-secondary 底、
        // shadow 0 1px 4px rgba(0,0,0,0.35)；返回上一页/主页）
        Positioned(
          left: 20,
          top: 16,
          child: GestureDetector(
            onTap: () {
              final nav = Navigator.of(context);
              if (nav.canPop()) {
                nav.pop();
              } else {
                context.read<AppState>().go(PageType.home);
              }
            },
            child: Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                color: VsTheme.btnSecondary,
                borderRadius: BorderRadius.circular(6),
                boxShadow: const [
                  BoxShadow(
                      color: Color(0x59333333),
                      blurRadius: 4,
                      offset: Offset(0, 1)),
                ],
              ),
              child: Icon(VsIcons.arrowLeft, size: 13, color: VsTheme.fg),
            ),
          ),
        ),
      ],
    );
  }

  /// 侧栏相关推荐（web .vshell-detail-related：thumb 168px 16:9 左 + 信息右）
  Widget _relatedList() {
    if (_related.isEmpty) return const SizedBox.shrink();
    return ListView.separated(
      padding: const EdgeInsets.only(top: 2),
      itemCount: _related.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (c, i) {
        final it = _related[i];
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () {
            // web：push 保留返回栈
            Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => DetailPage(videoId: it.id)));
          },
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 缩略图 168px + 时长右下（11px badgeFg 无底色）
              SizedBox(
                width: 168,
                child: AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Stack(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: SizedBox.expand(
                          child: it.cover.isNotEmpty
                              ? Image.network(it.cover,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) =>
                                      _thumbPlaceholder())
                              : _thumbPlaceholder(),
                        ),
                      ),
                      Positioned(
                        right: 4,
                        bottom: 4,
                        child: Text(_fmtDur(it.duration),
                            style: TextStyle(
                                color: VsTheme.badgeFg,
                                fontSize: 11,
                                height: 1.4)),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(it.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: VsTheme.fg, fontSize: 13)),
                    const SizedBox(height: 6),
                    Text('${it.ownerName} · ${it.viewText}播放',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style:
                            TextStyle(color: VsTheme.fgDim, fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _thumbPlaceholder() {
    return Container(
      color: VsTheme.editorBg,
      child: Center(
          child:
              Icon(VsIcons.fileMedia, size: 22, color: VsTheme.fgDim)),
    );
  }

  /// 角色行：已赋予=角标+角色名按钮(更改)+关注；冲突=红标可点解决；无角色=添加按钮
  Widget _charRow(VideoDetail d) {
    final svc = CharactersService.instance;
    final cm = svc.charFor(d.id, d.title);
    final state = context.read<AppState>();

    if (cm.kind == 'none') {
      return Row(
        children: [
          GestureDetector(
            onTap: () => _openCharPicker(d, null),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: VsTheme.overlayBg,
                borderRadius: BorderRadius.circular(VsTheme.radiusMedium),
                border: Border.all(color: VsTheme.border),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(VsIcons.add, size: 13, color: VsTheme.fg),
                  SizedBox(width: 4),
                  Text('添加角色',
                      style: TextStyle(color: VsTheme.fg, fontSize: 12)),
                ],
              ),
            ),
          ),
        ],
      );
    }

    final isConflict = cm.kind == 'conflict';
    final c = cm.char;
    final followed = c != null && svc.isFollowed(c.name);
    return Row(
      children: [
        // 角标
        if (isConflict)
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: const Color(0xCC2A1818),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: const Color(0x66F85149)),
            ),
            child: Icon(VsIcons.circleSlash, size: 15, color: VsTheme.error),
          )
        else if (c != null)
          _charAvatar(c, 30),
        const SizedBox(width: 8),
        // 角色名按钮（点击更改/解决）
        GestureDetector(
          onTap: () => _openCharPicker(d, cm),
          child: Text(
            isConflict ? '角色冲突' : c!.name,
            style: TextStyle(
              color: isConflict ? VsTheme.error : VsTheme.fg,
              fontSize: 13,
              fontWeight: isConflict ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ),
        if (!isConflict && c != null) ...[
          const SizedBox(width: 8),
          // 关注按钮（+ / ✓）
          Tooltip(
            message: followed ? '取消关注' : '关注该角色',
            child: GestureDetector(
              onTap: () {
                svc.toggleFollow(c.name);
                setState(() {});
              },
              child: Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: VsTheme.btnSecondary,
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(
                  followed ? VsIcons.check : VsIcons.add,
                  size: 12,
                  color: followed ? VsTheme.watchBlue : VsTheme.fg,
                ),
              ),
            ),
          ),
          // 进入角色主页
          const SizedBox(width: 8),
          Tooltip(
            message: '进入角色主页',
            child: GestureDetector(
              onTap: () => state.go(PageType.role, name: c.name),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: VsTheme.overlayBg,
                  borderRadius: BorderRadius.circular(VsTheme.radiusMedium),
                  border: Border.all(color: VsTheme.border),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(VsIcons.account, size: 12, color: VsTheme.fgDim),
                    SizedBox(width: 4),
                    Text('角色主页',
                        style: TextStyle(color: VsTheme.fgDim, fontSize: 11)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _charAvatar(Character c, double size) {
    Widget inner;
    if (c.icon.isNotEmpty && c.icon.startsWith('data:')) {
      try {
        inner = ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: Image.memory(
            base64Decode(c.icon.split(',')[1]),
            width: size,
            height: size,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _charLetter(c, size),
          ),
        );
      } catch (_) {
        inner = _charLetter(c, size);
      }
    } else {
      inner = _charLetter(c, size);
    }
    return SizedBox(width: size, height: size, child: inner);
  }

  Widget _charLetter(Character c, double size) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: const Color(0x99000000),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: const Color(0x40808080)),
      ),
      child: Text(
        c.name.isEmpty ? '?' : c.name.characters.first.toUpperCase(),
        style: TextStyle(
            color: Colors.white, fontSize: size * 0.45, fontWeight: FontWeight.w600),
      ),
    );
  }

  Future<void> _openCharPicker(VideoDetail d, CharMatch? m) async {
    final res = await showCharPicker(
      context,
      videoId: d.id,
      title: d.title,
      conflictNames: m != null && m.kind == 'conflict'
          ? m.conflicts.map((c) => c.name).toList()
          : null,
    );
    if (res == null || !mounted) return;
    if (res.startsWith(kCharRolePrefix)) {
      final name = res.substring(kCharRolePrefix.length);
      context.read<AppState>().go(PageType.role, name: name);
      return;
    }
    setState(() {});
    final svc = CharactersService.instance;
    final msg = res == kCharUnassign
        ? '已还原为自然匹配'
        : (svc.charOf(d.id) == null ? '已设为无角色' : '已指定角色：$res');
    VsToast.show(context, msg);
  }

  Widget _actionBtn(BuildContext context, IconData icon, String label, bool active,
      Color activeColor, VoidCallback onTap) {    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: active ? activeColor : VsTheme.overlayBg,
          borderRadius: BorderRadius.circular(VsTheme.radiusMedium),
          border: Border.all(color: active ? activeColor : VsTheme.border),
        ),
        child: Row(
          children: [
            Icon(icon, size: 14, color: active ? Colors.white : VsTheme.fg),
            const SizedBox(width: 4),
            Text(label,
                style: TextStyle(
                    color: active ? Colors.white : VsTheme.fg, fontSize: 12)),
          ],
        ),
      ),
    );
  }

  static String _fmtDate(int ts) {
    final d = DateTime.fromMillisecondsSinceEpoch(ts * 1000);
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  static String _fmtDur(int sec) {
    if (sec <= 0) return '';
    final h = sec ~/ 3600;
    final m = (sec % 3600) ~/ 60;
    final s = sec % 60;
    String two(int v) => v.toString().padLeft(2, '0');
    return h > 0 ? '$h:${two(m)}:${two(s)}' : '${two(m)}:${two(s)}';
  }

  /// 复制按钮（web .vshell-detail-copy：20x20、13px icon、hover 背景）
  Widget _iconBtn(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 20,
        height: 20,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
        ),
        child: Icon(icon, size: 13, color: VsTheme.fgDim),
      ),
    );
  }

  Future<void> _copyTitle(String title) async {
    await Clipboard.setData(ClipboardData(text: title));
    if (!mounted) return;
    VsToast.show(context, '标题已复制');
  }

  /// UP 头像兜底（web：首字 20px descriptionForeground）
  Widget _upFallback(VideoDetail d) {
    return Center(
      child: Text(
        d.ownerName.isEmpty ? '?' : d.ownerName.characters.first.toUpperCase(),
        style: TextStyle(color: VsTheme.fgDim, fontSize: 20),
      ),
    );
  }
}
