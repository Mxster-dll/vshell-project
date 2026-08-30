/// 角色主页（复刻 web 版 role.js）
/// banner 背景（水平视差）+ 头像/关键词/统计 + 代表作滚动排 + 手动添加与聚合搜索合并网格
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../data/models.dart';
import '../../services/characters.dart';
import '../../services/search_cache.dart';
import '../../state/app_state.dart';
import '../../theme/char_banners.dart';
import '../../theme/vs_icons.dart';
import '../../theme/vs_theme.dart';
import '../widgets/video_card.dart';

class RolePage extends StatefulWidget {
  final String name;
  const RolePage({super.key, required this.name});

  @override
  State<RolePage> createState() => _RolePageState();
}

class _RolePageState extends State<RolePage> {
  final _svc = CharactersService.instance;
  final _scroll = ScrollController();
  List<VideoItem> _manual = [];
  final List<VideoItem> _agg = [];
  int _aggPage = 0;
  bool _aggLoading = false;
  bool _aggDone = false;
  String? _aggError;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _manual = _svc.videosOf(widget.name);
    _loadCached();
    _fetchAgg();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  String _cacheKey() => 'role:${widget.name}';

  void _loadCached() {
    final rc = SearchCache.instance.get(_cacheKey());
    if (rc == null) return;
    final role = _svc.find(widget.name);
    if (role == null) return;
    final items = rc.items.where((it) => _kwHit(role, it.title)).toList();
    if (items.isNotEmpty) {
      _agg.addAll(items);
      _aggPage = rc.pn;
      _aggDone = !rc.hasMore;
    }
  }

  bool _kwHit(Character role, String title) {
    final kws = role.keywords.isNotEmpty ? role.keywords : [role.name];
    final t = title.toLowerCase();
    return kws.any((k) => t.contains(k.toLowerCase()));
  }

  Future<void> _fetchAgg() async {
    if (_aggLoading || _aggDone) return;
    final role = _svc.find(widget.name);
    if (role == null) return;
    setState(() => _aggLoading = true);
    final src = context.read<AppState>().source;
    final kws = role.keywords.isNotEmpty ? role.keywords : [role.name];
    try {
      final page = _aggPage + 1;
      final results = await Future.wait(
        kws.map((k) => src
            .search(k, page: page)
            .then((r) => r.items)
            .catchError((_) => <VideoItem>[])),
      );
      if (!mounted) return;
      // kwHit 精确过滤（搜索非精确，角色主页要精确）
      var items = results.expand((x) => x).where((it) => _kwHit(role, it.title)).toList();
      // 同页多关键词间去重
      final seenPage = <String>{};
      items = items.where((it) => seenPage.add(it.id)).toList();
      // 与已加载去重（追加翻页）
      final seen = <String>{
        for (final it in _agg)
          it.id,
        for (final it in _manual)
          it.id,
      };
      final fresh = items.where((it) => seen.add(it.id)).toList();
      // 播放量降序
      fresh.sort((a, b) => b.viewCount.compareTo(a.viewCount));
      _agg.addAll(fresh);
      _aggPage = page;
      if (fresh.isEmpty && _aggPage >= 2) _aggDone = true;
      if (fresh.isEmpty && page == 1 && items.isEmpty) _aggDone = true;
      SearchCache.instance.set(_cacheKey(), _agg, _aggPage, !_aggDone);
      setState(() {});
    } catch (e) {
      if (mounted) setState(() => _aggError = '$e');
    } finally {
      if (mounted) setState(() => _aggLoading = false);
    }
  }

  void _onScroll() {
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 500) {
      _fetchAgg();
    }
  }

  List<VideoItem> _merged(Character role) {
    // 手动添加置顶 + 聚合去重（播放量降序）
    final seen = <String>{for (final it in _manual) it.id};
    final rest = _agg.where((it) => seen.add(it.id)).toList();
    return [..._manual, ...rest];
  }

  void _toggleFeatured(VideoItem it) {
    final role = _svc.find(widget.name);
    if (role == null) return;
    _svc.toggleFeatured(role.name, it.id);
    setState(() {});
    context.read<AppState>().refresh();
  }

  @override
  Widget build(BuildContext context) {
    final role = _svc.find(widget.name);
    if (role == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(VsIcons.error, color: VsTheme.error, size: 30),
            const SizedBox(height: 8),
            Text('角色「${widget.name}」不存在',
                style: TextStyle(color: VsTheme.fgDim, fontSize: 13)),
          ],
        ),
      );
    }
    final merged = _merged(role);
    final featuredVideos = _manual.where((v) => role.featured.contains(v.id)).toList();
    final isFeat = (String id) => role.featured.contains(id);
    // web JS：bannerUrl = role.banner || charBanners.bannerFor(role.name)——
    // 任何角色都有背景图（8 张手绘 SVG 按名 hash 分配），has-bg 恒真：
    // 背景图 + 暗渐变遮罩（180deg rgba(0,0,0,0.45)→0.82）+ 白字提亮
    final hasBg = true;

    return SingleChildScrollView(
      controller: _scroll,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ---- 头卡 banner（web .vshell-role-banner：r8、1px panel-border、
          // padding 20；默认背景 = 手绘 SVG + 暗遮罩；自定义 banner 优先）----
          Container(
            margin: const EdgeInsets.fromLTRB(20, 4, 20, 0),
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: VsTheme.border),
            ),
            child: Stack(
              children: [
                // 背景层：自定义 banner 或默认手绘 SVG（cover）
                Positioned.fill(
                  child: role.banner.isNotEmpty
                      ? Image.memory(
                          base64Decode(role.banner.split(',')[1]),
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => charBannerLayer(role.name),
                        )
                      : charBannerLayer(role.name),
                ),
                // 暗遮罩（web JS：linear-gradient(180deg, rgba(0,0,0,0.45),
                // rgba(0,0,0,0.82))；背景图已保证深底 → 文字提亮；
                // 上下溢出 2px 由外层 Clip.antiAlias 裁掉——消除渐变末端亮线缝隙）
                const Positioned(
                  left: 0,
                  right: 0,
                  top: -2,
                  bottom: -2,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Color(0x73000000), Color(0xD9000000)],
                      ),
                    ),
                  ),
                ),
                // 内容
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 返回钮（web 左上）
                Padding(
                  padding: const EdgeInsets.only(top: 20),
                  child: GestureDetector(
                    onTap: () =>
                        context.read<AppState>().go(PageType.characters),
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: const Color(0x99000000),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Icon(VsIcons.arrowLeft,
                          size: 15, color: Colors.white),
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                // 头像 64x64 r8（web：border dropdown-border、shadow 0 2px 8px 0.4、
                // letter 白底 #181818 字 28px 600）
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: VsTheme.dropdownBorder),
                    boxShadow: const [
                      BoxShadow(
                          color: Color(0x66000000),
                          blurRadius: 8,
                          offset: Offset(0, 2)),
                    ],
                    color: VsTheme.listHover,
                    image: role.icon.isNotEmpty &&
                            role.icon.startsWith('data:')
                        ? DecorationImage(
                            image:
                                MemoryImage(base64Decode(role.icon.split(',')[1])),
                            fit: BoxFit.cover)
                        : null,
                  ),
                  alignment: Alignment.center,
                  child: role.icon.isEmpty ||
                          !role.icon.startsWith('data:')
                      ? Text(
                          role.name.isEmpty
                              ? '?'
                              : role.name.characters.first.toUpperCase(),
                          style: const TextStyle(
                              color: Color(0xFF181818),
                              fontSize: 28,
                              fontWeight: FontWeight.w600,
                              height: 1,
                              fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
                        )
                      : null,
                ),
                const SizedBox(width: 16),
                // 名 + chips + 统计
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        role.name,
                        style: TextStyle(
                          color: hasBg ? Colors.white : VsTheme.fg,
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          height: 1.2,
                          fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
                          shadows: hasBg
                              ? const [
                                  Shadow(
                                      color: Color(0x99000000),
                                      blurRadius: 4,
                                      offset: Offset(0, 1))
                                ]
                              : null,
                        ),
                      ),
                      const SizedBox(height: 8),
                      // chips（web st-chip：22px 高 pill、toolbar-hover 底、12px）
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final kw in role.keywords.take(6))
                            Container(
                              height: 22,
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 8),
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: VsTheme.toolbarHover,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                kw,
                                style: TextStyle(
                                  color: hasBg ? Colors.white : VsTheme.fg,
                                  fontSize: 12,
                                  height: 1,
                                  fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${merged.length} 个视频 · ${featuredVideos.length} 代表作',
                        style: TextStyle(
                          color: hasBg
                              ? Colors.white.withValues(alpha: 0.85)
                              : VsTheme.fgDim,
                          fontSize: 12,
                          fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
                  ),
                ),
              ],
            ),
          ),
          // ---- 代表作滚动排（web .vshell-role-marquee：640 封面布局卡、
          // 36s 无限平移、hover 暂停、0.35s featuredhost 展开）----
          if (featuredVideos.isNotEmpty) ...[
            const SizedBox(height: 16),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 20),
              child: Text('代表作',
                  style: TextStyle(
                      color: VsTheme.fg, fontSize: 13, fontWeight: FontWeight.w600)),
            ),
            const SizedBox(height: 8),
            _FeaturedMarquee(
              videos: featuredVideos,
              onOpen: (v) => context
                  .read<AppState>()
                  .go(PageType.detail, id: v.id),
              onToggle: _toggleFeatured,
            ),
          ],
          // ---- 合并网格 ----
          const SizedBox(height: 16),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 20),
            child: Text('相关视频',
                style: TextStyle(
                    color: VsTheme.fg, fontSize: 13, fontWeight: FontWeight.w600)),
          ),
          const SizedBox(height: 10),
          if (merged.isEmpty && _aggLoading)
            const Padding(
              padding: EdgeInsets.all(40),
              child: Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          else if (merged.isEmpty)
            Padding(
              padding: EdgeInsets.all(40),
              child: Center(
                child: Text('暂无相关视频\n给视频指定该角色后会自动出现',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: VsTheme.fgDim, fontSize: 12, height: 1.7)),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 320,
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                  childAspectRatio: 16 / 9 / 1.52,
                ),
                itemCount: merged.length,
                itemBuilder: (c, i) {
                  final it = merged[i];
                  return VideoCard(
                    item: it,
                    showOwner: false,
                    featured: isFeat(it.id),
                    showFeatureBtn: true,
                    onFeatureTap: () => _toggleFeatured(it),
                    onTap: () => context
                        .read<AppState>()
                        .go(PageType.detail, id: it.id),
                  );
                },
              ),
            ),
          // 底部状态
          Padding(
            padding: const EdgeInsets.all(20),
            child: Center(
              child: _aggDone
                  ? Text('没有更多了',
                      style: TextStyle(color: VsTheme.fgDim, fontSize: 12))
                  : (_aggLoading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : (_aggError != null
                          ? GestureDetector(
                              onTap: _fetchAgg,
                              child: Text('加载失败，点击重试',
                                  style: TextStyle(
                                      color: VsTheme.linkBlue, fontSize: 12)),
                            )
                          : const SizedBox.shrink())),
            ),
          ),
        ],
      ),
    );
  }

  Widget _avatar(Character c, double size) {
    Widget inner;
    if (c.icon.isNotEmpty && c.icon.startsWith('data:')) {
      try {
        inner = ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Image.memory(
            base64Decode(c.icon.split(',')[1]),
            width: size,
            height: size,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _letter(c, size),
          ),
        );
      } catch (_) {
        inner = _letter(c, size);
      }
    } else {
      inner = _letter(c, size);
    }
    return SizedBox(width: size, height: size, child: inner);
  }

  Widget _letter(Character c, double size) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: VsTheme.btnSecondary,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: VsTheme.border),
      ),
      child: Text(
        c.name.isEmpty ? '?' : c.name.characters.first.toUpperCase(),
        style: TextStyle(
            color: Colors.white, fontSize: size * 0.45, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// 代表作滚动排（web .vshell-role-marquee + vshell-marquee 36s 无限平移）：
/// 卡 640px 封面布局、内容超宽时自动滚动、hover 暂停；
/// 入场 featuredhost 0.35s 展开（高度 0→362 + 淡入）
class _FeaturedMarquee extends StatefulWidget {
  final List<VideoItem> videos;
  final void Function(VideoItem) onOpen;
  final void Function(VideoItem) onToggle;
  const _FeaturedMarquee({
    required this.videos,
    required this.onOpen,
    required this.onToggle,
  });

  @override
  State<_FeaturedMarquee> createState() => _FeaturedMarqueeState();
}

class _FeaturedMarqueeState extends State<_FeaturedMarquee>
    with SingleTickerProviderStateMixin {
  static const double _cardW = 640; // .vshell-role-mcard2
  static const double _gap = 6; // half 内卡间距
  static const double _halfPad = 12; // half padding-right

  late final AnimationController _ctrl;
  bool _hover = false;

  @override
  void initState() {
    super.initState();
    // vshell-marquee 36s linear infinite
    _ctrl = AnimationController(
        vsync: this, duration: const Duration(seconds: 36));
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeStart());
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  double get _halfW => widget.videos.length * (_cardW + _gap) + _halfPad;

  void _maybeStart() {
    if (!mounted) return;
    final ctx = context;
    if (ctx.size == null) return;
    // 内容超宽才滚动（web .is-scrolling）
    if (_halfW > ctx.size!.width && !_hover && !_ctrl.isAnimating) {
      _ctrl.repeat();
    }
  }

  Widget _card(VideoItem v) => SizedBox(
        width: _cardW,
        child: VideoCard(
          item: v,
          layout: CardLayout.cover, // mcard2 = 封面布局（卡高=封面高）
          featured: true,
          showOwner: false,
          showFeatureBtn: true,
          onFeatureTap: () => widget.onToggle(v),
          onTap: () => widget.onOpen(v),
        ),
      );

  Widget _half() => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < widget.videos.length; i++) ...[
            if (i > 0) const SizedBox(width: _gap),
            _card(widget.videos[i]),
          ],
          const SizedBox(width: _halfPad),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final canScroll = _halfW > MediaQuery.sizeOf(context).width - 40;
    // 卡高 = 640*9/16 + 1px 边框×2 = 362
    return TweenAnimationBuilder<double>(
      // featuredhost 0.35s：grid-template-rows 0fr→1fr + opacity
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeInOut,
      builder: (c, t, _) => ClipRect(
        child: Opacity(
          opacity: t,
          child: SizedBox(
            height: 362 * t,
            child: t == 0
                ? null
                : MouseRegion(
                    onEnter: (_) {
                      setState(() => _hover = true);
                      _ctrl.stop();
                    },
                    onExit: (_) {
                      setState(() => _hover = false);
                      if (canScroll) _ctrl.repeat(min: _ctrl.value);
                    },
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        color: VsTheme.surface, // surface-background
                        child: LayoutBuilder(builder: (c, cons) {
                          // 内容不超宽：单份展示；超宽：双 half 无缝循环
                          final children = canScroll
                              ? [_half(), _half()]
                              : [_half()];
                          return Stack(
                            clipBehavior: Clip.hardEdge,
                            children: [
                              Positioned(
                                left: canScroll ? -_ctrl.value * _halfW : 0,
                                top: 0,
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: children,
                                ),
                              ),
                            ],
                          );
                        }),
                      ),
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}
