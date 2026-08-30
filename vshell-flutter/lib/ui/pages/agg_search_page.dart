/// 聚合搜索页（web searchtags 页移植：多标签独立分页 + 随机混流 + 去重 +
/// 无限滚动；web searchtags.js 语义逐条对应）
///
/// 数据模型（web state.sources[kw]）：每标签一个源 {pn, queue, done,
/// failed, loading, retryAt}；混流 = 首屏轮转（每源至少出一条）后纯随机
/// pickOne 取队首，seen[id] 去重；标签变更 → 整页重渲染。
library;

import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../data/models.dart';
import '../../services/local_videos.dart';
import '../../state/app_state.dart';
import '../../theme/vs_icons.dart';
import '../../theme/vs_theme.dart';
import '../widgets/video_card.dart';
import '../widgets/vs_toast.dart';

/// 单标签源状态（web state.sources[kw]）
class _AggSource {
  int pn = 1;
  final List<VideoItem> queue = [];
  bool done = false;
  bool loading = false;
  bool failed = false;
  DateTime? retryAt;
}

class AggSearchPage extends StatefulWidget {
  const AggSearchPage({super.key});

  @override
  State<AggSearchPage> createState() => _AggSearchPageState();
}

class _AggSearchPageState extends State<AggSearchPage> {
  static const _batch = 8; // web BATCH
  static const _maxSteps = 128; // web MAX_STEPS

  final _scroll = ScrollController();
  final Map<String, _AggSource> _sources = {};
  final Map<String, VideoItem> _seen = {}; // id → item（去重）
  final List<VideoItem> _items = []; // 混流结果（渲染顺序）
  final Set<String> _issued = {}; // 首屏已出过货的源
  final List<Completer<void>> _waiters = []; // web waiters（在途等待唤醒）
  final Map<String, Timer> _retryTimers = {};
  bool _firstRound = true;
  bool _loading = false;
  bool _done = false; // 全部源耗尽
  List<String> _lastTags = const [];

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _reset();
  }

  @override
  void dispose() {
    _scroll.dispose();
    for (final t in _retryTimers.values) {
      t.cancel();
    }
    super.dispose();
  }

  /// 去重搜索标签（web kws()：胶囊允许重复显示，搜索时去重）
  List<String> _kws() => context.read<AppState>().searchTags;

  /// 标签变更 → 整页重渲染（web searchTags.onChange：state 全重置）
  void _reset() {
    _sources.clear();
    _seen.clear();
    _items.clear();
    _issued.clear();
    _firstRound = true;
    _loading = false;
    _done = false;
    for (final t in _retryTimers.values) {
      t.cancel();
    }
    _retryTimers.clear();
    for (final w in _waiters) {
      if (!w.isCompleted) w.complete();
    }
    _waiters.clear();
    // 本地视频参与：标题命中任一标签（web：title.toLowerCase() 含任一 kw）
    final kws = _kws();
    final locals = LocalVideosService.instance.items
        .where((it) =>
            kws.any((k) => it.title.toLowerCase().contains(k.toLowerCase())))
        .toList();
    for (final it in locals) {
      _seen[it.id] = it;
      _items.add(it);
    }
    for (final kw in kws) {
      _sources[kw] = _AggSource();
    }
    if (kws.isNotEmpty) {
      Future.microtask(_loadMore);
    }
  }

  /// 单源拉取下一页（web fetchSource：黑名单过滤、!hasMore→done、
  /// 失败 retryAt 3s + toast + 自动重试）
  Future<void> _fetchSource(String kw) async {
    final src = _sources[kw];
    if (src == null || src.loading || src.done) return;
    src.loading = true;
    final state = context.read<AppState>();
    try {
      final r = await state.source.search(kw, page: src.pn);
      if (!mounted || !_sources.containsKey(kw)) return;
      src.loading = false;
      src.failed = false;
      src.retryAt = null;
      src.pn += 1;
      final filtered =
          r.items.where((it) => !state.isBlacklisted(it.id)).toList();
      src.queue.addAll(filtered);
      if (!r.hasMore) src.done = true;
      _wakeAll();
    } catch (e) {
      if (!mounted || !_sources.containsKey(kw)) return;
      src.loading = false;
      src.failed = true;
      src.retryAt = DateTime.now().add(const Duration(seconds: 3));
      VsToast.error(context, '搜索「$kw」失败，3 秒后自动重试');
      _wakeAll();
      // 失败自动重试（真实站并发请求可能被风控）——3s 后若源仍未耗尽则重拉
      _retryTimers[kw]?.cancel();
      _retryTimers[kw] = Timer(const Duration(seconds: 3), () {
        final s = _sources[kw];
        if (mounted && s != null && !s.done && !s.loading) {
          _fetchSource(kw);
        }
      });
    }
  }

  /// 从指定源取队首（带去重；重复/无效项跳过）
  VideoItem? _shiftItem(String kw) {
    final src = _sources[kw];
    while (src != null && src.queue.isNotEmpty) {
      final item = src.queue.removeAt(0);
      if (item == null || item.id.isEmpty) continue;
      if (_seen.containsKey(item.id)) continue;
      _seen[item.id] = item;
      return item;
    }
    return null;
  }

  /// 随机挑一个非空源取走队首（web pickOne：32 次 guard）
  VideoItem? _pickOne() {
    final rnd = Random();
    for (var guard = 0; guard < 32; guard++) {
      final keys = _sources.keys
          .where((kw) => _sources[kw]!.queue.isNotEmpty)
          .toList();
      if (keys.isEmpty) return null;
      final item = _shiftItem(keys[rnd.nextInt(keys.length)]);
      if (item != null) return item;
    }
    return null;
  }

  /// 全部源耗尽（done 且队列空）
  bool _allExhausted() {
    if (_sources.isEmpty) return true;
    return _sources.values.every((s) => s.done && s.queue.isEmpty);
  }

  /// 随机选一个未 done、未在加载、未在失败冷却中的源
  String? _randomUndone() {
    final now = DateTime.now();
    final keys = _sources.keys.where((kw) {
      final s = _sources[kw]!;
      return !s.done && !s.loading && (s.retryAt == null || now.isAfter(s.retryAt!));
    }).toList();
    if (keys.isEmpty) return null;
    return keys[Random().nextInt(keys.length)];
  }

  bool _hasInflight() => _sources.values.any((s) => s.loading);

  /// 挂起等待在途请求（web waiters.push：完成时由 notifyData 唤醒）
  Future<void> _wait() {
    final c = Completer<void>();
    _waiters.add(c);
    return c.future;
  }

  void _wakeAll() {
    for (final w in _waiters) {
      if (!w.isCompleted) w.complete();
    }
    _waiters.clear();
  }

  /// 轮换取数（web loadMore）：随机源 → 队首 → 追加，队列不足时拉取，
  /// 直到填满一批或全耗尽；首屏每个源至少出一条
  Future<void> _loadMore() async {
    if (_loading || _done) return;
    if (_kws().isEmpty) return;
    _loading = true;
    var appended = 0;
    var steps = 0;
    try {
      while (true) {
        if ((appended >= _batch && !_hasInflight()) ||
            _allExhausted() ||
            steps >= _maxSteps) {
          break;
        }
        steps++;
        // ---- 首屏轮转：每个源至少出一条才进入纯随机 ----
        if (_firstRound) {
          final unissued =
              _sources.keys.where((kw) => !_issued.contains(kw)).toList();
          if (unissued.isNotEmpty) {
            final ready = unissued
                .where((kw) => _sources[kw]!.queue.isNotEmpty)
                .toList();
            if (ready.isNotEmpty) {
              final kwR = ready[Random().nextInt(ready.length)];
              final item = _shiftItem(kwR);
              if (item != null) {
                _issued.add(kwR);
                _items.add(item);
                appended++;
                continue;
              }
              continue; // 队首重复被去重跳过 → 继续
            }
            // 未出过货的源暂无货：在途 → 等待；可拉 → 拉取；否则失败 → 跳过
            if (_hasInflight()) {
              await _wait();
              continue;
            }
            final kwF = _randomUndone();
            if (kwF != null) {
              await _fetchSource(kwF);
              continue;
            }
            // 失败冷却/不可拉 → 标记该源已处理（跳过），继续轮转
            for (final kw in unissued) {
              _issued.add(kw);
            }
            continue;
          }
          _firstRound = false; // 所有源都已出过货 → 进入纯随机
        }
        // ---- 随机轮换（用户模型）----
        final item = _pickOne();
        if (item != null) {
          _items.add(item);
          appended++;
          continue;
        }
        // 队列耗尽 → 随机拉一个未耗尽源的一页
        final kw = _randomUndone();
        if (kw != null) {
          await _fetchSource(kw);
          continue;
        }
        // 无可拉源：还有在途请求 → 挂起等待
        if (_hasInflight()) {
          await _wait();
          continue;
        }
        break;
      }
    } finally {
      _loading = false;
      _wakeAll();
      if (_allExhausted()) _done = true;
    }
    if (mounted) {
      setState(() {});
      // 内容不足一屏（哨兵仍在视口内）→ 续载（web finish 视口内 30ms 续载）
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || _done || _loading) return;
        final pos = _scroll.hasClients ? _scroll.position : null;
        if (pos != null &&
            pos.maxScrollExtent == 0 &&
            _items.isNotEmpty &&
            pos.viewportDimension > 0) {
          _loadMore();
        }
      });
    }
  }

  void _onScroll() {
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 600) {
      _loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    // 标签变更（add/remove/clear）→ 整页重渲染（web onChange）
    final tags = context.watch<AppState>().searchTags;
    if (!listEquals(tags, _lastTags)) {
      _lastTags = List.of(tags);
      _reset();
    }
    final kws = tags;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 页头（web .vshell-page-head：返回钮 + 标题 + 副标题）
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 12),
          child: Row(
            children: [
              GestureDetector(
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
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('聚合搜索',
                      style: TextStyle(
                          color: VsTheme.fg,
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback)),
                  const SizedBox(height: 2),
                  Text('Ctrl+Enter 添加搜索标签，随机混流整合各标签结果',
                      style: TextStyle(
                          color: VsTheme.fgDim,
                          fontSize: 11,
                          fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback)),
                ],
              ),
            ],
          ),
        ),
        Expanded(child: _buildBody(kws)),
      ],
    );
  }

  Widget _buildBody(List<String> kws) {
    // 空态（web wall.empty：还没有搜索标签…）
    if (kws.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(VsIcons.search, size: 36, color: VsTheme.fgDim),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 60),
              child: Text(
                '还没有搜索标签——在顶部搜索框输入关键词后按 Ctrl+Enter 添加，将随机混流整合各标签的搜索结果',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: VsTheme.fgDim,
                    fontSize: 13,
                    height: 1.6,
                    fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
              ),
            ),
          ],
        ),
      );
    }
    final state = context.watch<AppState>();
    final visible =
        _items.where((it) => !state.isBlacklisted(it.id)).toList();
    if (visible.isEmpty && !_loading) {
      // 首屏加载中 spinner（web bootstrap 骨架）
      return const Center(
          child: SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2)));
    }
    return Builder(builder: (c) {
      // web .vshell-wall：minmax(400px,1fr)——列宽下限 400
      final cols = (MediaQuery.sizeOf(c).width / 400).floor().clamp(1, 8);
      // 网格间距统一变量（设置页可调）
      final gap = state.gridGap;
      final w = (MediaQuery.sizeOf(c).width - 40 - gap * (cols - 1)) / cols;
      final ratio = state.coverLayout
          ? w / (w * 9 / 16) // cell 高 = 媒体区实际高（AspectRatio 宽 = cell 宽）
          : w / (w * 9 / 16 + 92); // 媒体区 + 文字区 92
      return GridView.builder(
        controller: _scroll,
        padding: const EdgeInsets.fromLTRB(20, 6, 20, 60),
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
                child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2)));
          }
          final it = visible[i];
          return VideoCard(
            item: it,
            onTap: () =>
                context.read<AppState>().go(PageType.detail, id: it.id),
          );
        },
      );
    });
  }
}
