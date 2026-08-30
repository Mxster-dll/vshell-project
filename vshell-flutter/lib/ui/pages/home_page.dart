/// 主页：分区 chips + 视频墙（复刻 web 版 home 页）
/// 无限滚动加载（滚动接近底部自动拉下一页）
library;

import '../widgets/vs_border_painter.dart';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../main.dart';
import '../../data/models.dart';
import '../../services/search_cache.dart';
import '../../state/app_state.dart';
import '../../theme/vs_icons.dart';
import '../../theme/vs_theme.dart';
import '../widgets/feed_view.dart';
import '../widgets/video_card.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _scroll = ScrollController();
  List<Channel> _channels = [];
  int _channelId = 0; // 0 = 全站热门
  final List<VideoItem> _items = [];
  int _page = 0;
  bool _loading = false;
  bool _done = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _init();
    // --scroll-test：启动 6s 后程序化滚动到 300px（验证悬浮导航
    // is-scrolled 阴影 + 分类卡随滚动滚走；鼠标/键盘事件注入对
    // Flutter Windows 无效——必须程序化滚动；延迟 6s 避免与截图竞争）
    if (kScrollTest) {
      Future.delayed(const Duration(seconds: 6), () {
        if (mounted && _scroll.hasClients) _scroll.jumpTo(300);
      });
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    // 缓存优先：先显示本地内容，再网络动态刷新（不阻塞在网络 channels 上）
    final cached = SearchCache.instance.get(_cacheKey());
    if (cached != null && cached.items.isNotEmpty) {
      if (mounted) {
        setState(() {
          _items.addAll(cached.items);
          _page = 1;
          _done = !cached.hasMore;
        });
      }
      _refreshFromNet();
    } else {
      await _loadMore();
    }
    final src = context.read<AppState>().source;
    try {
      final ch = await src.channels();
      if (mounted) setState(() => _channels = ch);
    } catch (_) {/* 分类失败不阻塞 */}
  }

  String _cacheKey() => _channelId == 0 ? 'home' : 'home:$_channelId';

  /// 网络第一页刷新：refresh 合并（网络在前 + 旧缓存去重追加）后整体替换
  Future<void> _refreshFromNet() async {
    final src = context.read<AppState>().source;
    try {
      final r = _channelId == 0
          ? await src.homeFeed(1)
          : await src.channelVideos(_channelId, 1);
      if (!mounted) return;
      final merged = SearchCache.instance.refresh(_cacheKey(), r.items, r.hasMore);
      setState(() {
        _items
          ..clear()
          ..addAll(merged);
        _page = 1;
        _done = !r.hasMore;
      });
    } catch (_) {/* 网络失败静默：缓存兜底 */}
  }

  Future<void> _loadMore() async {
    if (_loading || _done) return;
    setState(() => _loading = true);
    final src = context.read<AppState>().source;
    try {
      final r = _channelId == 0
          ? await src.homeFeed(_page + 1)
          : await src.channelVideos(_channelId, _page + 1);
      if (!mounted) return;
      final nextPage = _page + 1;
      // 写缓存：第一页替换式，翻页追加去重
      if (nextPage == 1) {
        SearchCache.instance.set(_cacheKey(), [..._items, ...r.items], 1, r.hasMore);
      } else {
        SearchCache.instance.append(_cacheKey(), r.items, nextPage, r.hasMore);
      }
      setState(() {
        _items.addAll(r.items);
        _page = nextPage;
        if (!r.hasMore) _done = true;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onScroll() {
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 600) {
      _loadMore();
    }
  }

  void _selectChannel(int id) {
    if (id == _channelId) return;
    setState(() {
      _channelId = id;
      _items.clear();
      _page = 0;
      _done = false;
      _error = null;
    });
    final cached = SearchCache.instance.get(_cacheKey());
    if (cached != null && cached.items.isNotEmpty) {
      setState(() {
        _items.addAll(cached.items);
        _page = 1;
        _done = !cached.hasMore;
      });
      _refreshFromNet();
    } else {
      _loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final feed = context.watch<AppState>().feedMode;
    // 网格间距统一变量（设置页可调）：分类栏↔卡片与卡片↔卡片共用
    final gridGap = context.watch<AppState>().gridGap;
    return LayoutBuilder(builder: (context, constraints) {
      // web .vshell-page-home：左右 10% 边距（1440 屏 → 2 列大卡）
      final hp = constraints.maxWidth * 0.1;
      // feed 模式：全屏滑卡（PageView 自身滚动，无分类卡）
      if (feed) {
        return Column(
          children: [
            Expanded(
              child: _items.isEmpty
                  ? (_error != null
                      ? Center(
                          child: Text('加载失败：$_error',
                              style: TextStyle(
                                  color: VsTheme.error, fontSize: 13)),
                        )
                      : const Center(
                          child: SizedBox(
                            width: 22,
                            height: 22,
                            child:
                                CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ))
                  : FeedView(
                      items: _items,
                      done: _done,
                      onLoadMore: _loadMore,
                      onOpen: (it) => context
                          .read<AppState>()
                          .go(PageType.detail, id: it.id),
                      playUrlOf: _playUrlOf,
                    ),
            ),
          ],
        );
      }
      // 墙模式：分类卡 + 视频墙在**同一滚动容器**（web .vshell-page-home
      // overflow-y auto）——分类卡随页面滚动滚走（非浮动）；
      // 只有导航栏才是悬浮的（web .vshell-navbar position:fixed）
      if (_items.isEmpty) {
        return CustomScrollView(
          controller: _scroll,
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                // 分类卡与视频卡之间间距 = 设置「卡片间距」（用户要求）
                padding: EdgeInsets.fromLTRB(hp, 3, hp, gridGap),
                child: _sectionsCard(context),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 60),
                child: _error != null
                    ? Center(
                        child: Text('加载失败：$_error',
                            style: TextStyle(
                                color: VsTheme.error, fontSize: 13)),
                      )
                    : const Center(
                        child: SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
              ),
            ),
          ],
        );
      }
      return CustomScrollView(
        controller: _scroll,
        slivers: [
          // 分区导航卡（web .vshell-sections：surface-background #181818 底 +
          // 1px sideBar-border + r8 + shadow-lg + padding 16；内 grid
          // minmax(112px,1fr) gap 8 + chip 34px r4；margin 3px 0 3px——
          // 下边距用 gridGap 统一变量）
          SliverToBoxAdapter(
            child: Padding(
              // 分类卡与视频卡之间间距 = 设置「卡片间距」（用户要求；
              // 顶部 3 保留 web .vshell-sections margin-top 3px）
              padding: EdgeInsets.fromLTRB(hp, 3, hp, gridGap),
              child: _sectionsCard(context),
            ),
          ),
          ..._wallSlivers(context, hp, gridGap, constraints.maxWidth),
        ],
      );
    });
  }

  /// 分区导航卡（web .vshell-sections 复刻；含浮动阴影 shadow-lg——
  /// web 原版即带，未取消）
  /// 注意：shrinkWrap GridView 放进 SliverToBoxAdapter（无界主轴约束）会
  /// 高度塌陷为 0（本卡在 CustomScrollView 里曾整卡消失）——改手动等宽
  /// 网格（web grid auto-fill minmax(112px,1fr) gap 8 语义）
  Widget _sectionsCard(BuildContext context) {
    final n = _channels.length + 1;
    return LayoutBuilder(builder: (context, cons) {
      final cols = ((cons.maxWidth + 8) / 120).floor().clamp(1, 20);
      final rows = (n / cols).ceil();
      // Stack 子项全为 Positioned（不参与尺寸计算）→ SliverToBoxAdapter
      // 无界主轴约束下会塌陷为 0——显式高度 = 内容 + padding 16×2
      return SizedBox(
        width: double.infinity,
        height: rows * 34 + (rows - 1) * 8 + 32,
        child: Stack(
          // Clip.none：painter 画布向下扩展 1 逻辑（底边框线画在底
          // 边界行）不能被 Stack 默认 hardEdge 裁剪
          clipBehavior: Clip.none,
          children: [
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  color: VsTheme.bg,
                  // 边框由 VsBorderPainter 画（物理像素对齐 1px 均匀细线；
                  // Border.all 在 DPI 1.5 下取整 1-2 物理像素 = 粗 + 圆角缺口）
                  borderRadius:
                      BorderRadius.circular(VsTheme.radiusLarge),
                  boxShadow: const [
                    BoxShadow(color: Color(0x24000000), blurRadius: 12),
                  ],
                ),
                padding: const EdgeInsets.all(16),
                child: SizedBox(
                  // SliverToBoxAdapter 无界主轴约束下 Column 动态高度会塌陷为 0
                  //（手动网格实测）——显式高度 = rows×34 + 行间距
                  height: rows * 34 + (rows - 1) * 8,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                    for (var r = 0; r < rows; r++)
                      Padding(
                        padding: EdgeInsets.only(
                            bottom: r == rows - 1 ? 0 : 8), // grid gap 8
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            for (var c = 0; c < cols; c++)
                              if (r * cols + c < n)
                                Expanded(
                                  child: Padding(
                                    padding: EdgeInsets.only(
                                        right: c == cols - 1 ? 0 : 8),
                                    child: _sectionChip(
                                        r * cols + c == 0
                                            ? 0
                                            : _channels[r * cols + c - 1].id,
                                        r * cols + c == 0
                                            ? '全站热门'
                                            : _channels[r * cols + c - 1].name),
                                  ),
                                )
                              else
                                const Expanded(child: SizedBox()),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            // 物理像素对齐边框（bottom:-1 扩展画布容纳底边界行；位于
            // 内容 Container 之外不受其圆角裁剪）
            Positioned(
              left: 0,
              top: 0,
              right: 0,
              bottom: -1,
              child: IgnorePointer(
                child: CustomPaint(
                  painter: VsBorderPainter(
                    color: VsTheme.border,
                    lineWidth: 1 / MediaQuery.devicePixelRatioOf(context),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    });
  }

  /// hover 预览直链：playInfo 取 m3u8（首档）
  Future<String?> _playUrlOf(VideoItem it) async {
    final src = context.read<AppState>().source;
    final pi = await src.playInfo(it.id);
    if (pi.m3u8Url.isEmpty) return null;
    return pi.m3u8Url;
  }

  List<Widget> _wallSlivers(BuildContext context, double hp, double gridGap,
      double viewportW) {
    final state = context.watch<AppState>();
    final cover = state.coverLayout;
    // 黑名单过滤（web .vsc-video-blacklist 加入后从列表移除）
    final visible = _items.where((it) => !state.isBlacklisted(it.id)).toList();
    // web .vshell-wall：repeat(auto-fill, minmax(400px,1fr))——列宽下限 400
    //（Flutter maxCrossAxisExtent 语义相反，手动按 floor(内容宽/400) 定列数；
    //  内容宽 = 视口宽 - 页面 10% 左右边距）
    final inner = viewportW - hp * 2;
    final cols = (inner / 400).floor().clamp(1, 8);
    // 卡高 = 媒体 16:9 + 文字区固定高 92px → 动态比例防窄窗口溢出；
    // cover 布局卡片只有媒体区 → 恒 16:9（web .vsc-video-body display:none）
    final gap = gridGap;
    final w = (inner - gap * (cols - 1)) / cols;
    final ratio = cover ? w / (w * 9 / 16) : w / (w * 9 / 16 + 92);
    // web：页面左右 10% 边距 + wall gap 6px + 底部 60px 留白
    return [
      SliverPadding(
        padding: EdgeInsets.fromLTRB(hp, 0, hp, 60),
        sliver: SliverGrid.builder(
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols,
            mainAxisSpacing: gap,
            crossAxisSpacing: gap,
            childAspectRatio: ratio,
          ),
          itemCount: visible.length + 1,
          itemBuilder: (c, i) {
            if (i >= visible.length) {
              if (_done) return const SizedBox.shrink();
              return const Center(
                child: Padding(
                  padding: EdgeInsets.all(12),
                  child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              );
            }
            final it = visible[i];
            return VideoCard(
              item: it,
              index: i,
              layout: cover ? CardLayout.cover : CardLayout.standard,
              onTap: () =>
                  context.read<AppState>().go(PageType.detail, id: it.id),
            );
          },
        ),
      ),
    ];
  }

  /// 分区 chip（web .vshell-section-chip：34 高 / radius 4 / 13px / icon 13px
  /// descriptionForeground / hover list-hoverBackground）
  /// 间距由外层手动网格控制（Row/Column gap 8）
  Widget _sectionChip(int id, String name) {
    final active = id == _channelId;
    return MouseRegion(
      child: GestureDetector(
        onTap: () => _selectChannel(id),
        child: Container(
          height: 34,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? VsTheme.listActive : Colors.transparent,
            borderRadius: BorderRadius.circular(VsTheme.radiusSmall),
            border: Border.all(
              color: active ? Colors.transparent : Colors.transparent,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(VsIcons.play,
                  size: 13,
                  color: active ? VsTheme.activeFg : VsTheme.fgDim),
              const SizedBox(width: 6),
              Text(
                name,
                style: TextStyle(
                  color: active ? VsTheme.activeFg : VsTheme.fg,
                  fontSize: 13,
                  fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
