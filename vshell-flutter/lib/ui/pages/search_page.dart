/// 搜索页：关键字搜索 + 视频墙（无限滚动）
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../data/models.dart';
import '../../services/search_cache.dart';
import '../../state/app_state.dart';
import '../../theme/vs_theme.dart';
import '../widgets/video_card.dart';

class SearchPage extends StatefulWidget {
  final String keyword;
  const SearchPage({super.key, required this.keyword});

  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  final _scroll = ScrollController();
  late final TextEditingController _input = TextEditingController(text: _kw);
  late String _kw = widget.keyword;
  final List<VideoItem> _items = [];
  int _page = 0;
  bool _loading = false;
  bool _done = false;
  String? _error;
  bool _searched = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    if (_kw.isNotEmpty) _search();
  }

  @override
  void dispose() {
    _scroll.dispose();
    _input.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final kw = _kw.trim();
    if (kw.isEmpty) return;
    setState(() {
      _searched = true;
      _items.clear();
      _page = 0;
      _done = false;
      _error = null;
    });
    // 先显示本地缓存（零等待），再网络刷新
    final cache = SearchCache.instance.get(kw);
    if (cache != null) {
      setState(() {
        _items.addAll(cache.items);
        _page = cache.pn;
        _done = !cache.hasMore;
      });
    }
    await _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || _done || _kw.trim().isEmpty) return;
    setState(() => _loading = true);
    final src = context.read<AppState>().source;
    try {
      final r = await src.search(_kw.trim(), page: _page + 1);
      if (!mounted) return;
      // 缓存合并（翻页追加去重）
      if (_page == 0) {
        final merged = SearchCache.instance.refresh(_kw.trim(), r.items, r.hasMore);
        setState(() {
          _items
            ..clear()
            ..addAll(merged);
        });
      } else {
        SearchCache.instance.append(_kw.trim(), r.items, _page + 1, r.hasMore);
        setState(() {
          _items.addAll(r.items);
        });
      }
      setState(() {
        _page++;
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

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // 搜索输入行
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Row(
            children: [
              SizedBox(
                width: 360,
                height: 32,
                child: TextField(
                  controller: _input,
                  onSubmitted: (v) {
                    _kw = v;
                    _search();
                  },
                  style: TextStyle(color: VsTheme.fg, fontSize: 13),
                  decoration: const InputDecoration(hintText: '搜索视频…'),
                ),
              ),
              const SizedBox(width: 8),
              ElevatedButton(
                onPressed: () => _search(),
                child: const Text('搜索'),
              ),
              if (_kw.isNotEmpty) ...[
                const SizedBox(width: 8),
                Text('“$_kw”',
                    style: TextStyle(color: VsTheme.fgDim, fontSize: 12)),
              ],
            ],
          ),
        ),
        Expanded(
          child: !_searched
              ? Center(
                  child: Text('输入关键字搜索视频',
                      style: TextStyle(color: VsTheme.fgDim, fontSize: 13)))
              : _items.isEmpty
                  ? Center(
                      child: _error != null
                          ? Text('搜索失败：$_error',
                              style: TextStyle(color: VsTheme.error, fontSize: 13))
                          : const CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Builder(builder: (c) {
                      final state = context.watch<AppState>();
                      final visible = _items
                          .where((it) => !state.isBlacklisted(it.id))
                          .toList();
                      // web .vshell-wall：minmax(400px,1fr)——列宽下限 400
                      final cols =
                          (MediaQuery.sizeOf(c).width / 400).floor().clamp(1, 8);
                      // 卡高 = 媒体 16:9 + 文字区固定高 92px → 动态比例；
                      // cover 布局卡片只有媒体区 → 恒 16:9
                      // 网格间距统一变量（设置页可调）
                      final gap = state.gridGap;
                      final w = (MediaQuery.sizeOf(c).width - 40 -
                              gap * (cols - 1)) /
                          cols;
                      final ratio = state.coverLayout
                          ? w / (w * 9 / 16) // cell 高 = 媒体区实际高（AspectRatio 宽 = cell 宽）
                          : w / (w * 9 / 16 + 92); // 媒体区 + 文字区 92
                      return GridView.builder(
                        controller: _scroll,
                        // web：page padding 20px + gap 6 + 底部 60 留白
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 60),
                        gridDelegate:
                            SliverGridDelegateWithFixedCrossAxisCount(
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
                                child: SizedBox(
                                    width: 18, height: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2)));
                          }
                          final it = visible[i];
                          return VideoCard(
                            item: it,
                            onTap: () => context
                                .read<AppState>()
                                .go(PageType.detail, id: it.id),
                          );
                        },
                      );
                    }),
        ),
      ],
    );
  }
}
