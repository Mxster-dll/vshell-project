/// 搜索/列表缓存（移植 web 版 searchcache.js 语义）
/// 先显示本地缓存 → 网络动态增量更新（返回零等待）
library;

import '../data/models.dart';
import 'vs_store.dart';

class SearchCacheEntry {
  final List<VideoItem> items;
  final int pn;
  final bool hasMore;
  final int savedAt;

  const SearchCacheEntry({
    required this.items,
    required this.pn,
    required this.hasMore,
    required this.savedAt,
  });
}

class SearchCache {
  SearchCache._();
  static final SearchCache instance = SearchCache._();

  static const _key = 'searchCache';
  static const maxEntries = 24;
  static const maxItems = 200;

  Map<String, dynamic> _data = {};

  void load() {
    _data = VsStore.instance.get<Map<dynamic, dynamic>>(_key)?.cast<String, dynamic>() ?? {};
  }

  static String keyOf(String q) => q.trim().toLowerCase();

  SearchCacheEntry? get(String q) {
    final k = keyOf(q);
    final e = _data[k];
    if (e is! Map) return null;
    final items = (e['items'] as List? ?? [])
        .whereType<Map>()
        .map((m) => _fromJson(m.cast<String, dynamic>()))
        .whereType<VideoItem>()
        .toList();
    if (items.isEmpty) return null;
    return SearchCacheEntry(
      items: items,
      pn: (e['pn'] as num?)?.toInt() ?? 1,
      hasMore: e['hasMore'] == true,
      savedAt: (e['savedAt'] as num?)?.toInt() ?? 0,
    );
  }

  /// 替换式写入（首页/单页）
  void set(String q, List<VideoItem> items, int pn, bool hasMore) {
    final k = keyOf(q);
    _data[k] = {
      'items': items.take(maxItems).map(_toJson).toList(),
      'pn': pn,
      'hasMore': hasMore,
      'savedAt': DateTime.now().millisecondsSinceEpoch,
    };
    _trim();
    _persist();
  }

  /// 追加去重（翻页）
  void append(String q, List<VideoItem> items, int pn, bool hasMore) {
    final old = get(q);
    final merged = _dedupe([...(old?.items ?? []), ...items]);
    set(q, merged, pn, hasMore);
  }

  /// 首页刷新合并：网络在前 + 旧缓存去重追加
  List<VideoItem> refresh(String q, List<VideoItem> fresh, bool freshHasMore) {
    final old = get(q);
    final merged = _dedupe([...fresh, ...(old?.items ?? [])]);
    set(q, merged, old?.pn ?? 1, freshHasMore);
    return merged;
  }

  static List<VideoItem> _dedupe(List<VideoItem> list) {
    final seen = <String>{};
    final out = <VideoItem>[];
    for (final it in list) {
      if (seen.add(it.id)) out.add(it);
    }
    return out;
  }

  void _trim() {
    final keys = _data.keys.toList();
    if (keys.length <= maxEntries) return;
    // LRU：按 savedAt 删最旧
    final sorted = keys
        .map((k) => (k: k, t: (get(k)?.savedAt) ?? 0))
        .toList()
      ..sort((a, b) => a.t.compareTo(b.t));
    for (var i = 0; i < sorted.length - maxEntries; i++) {
      _data.remove(sorted[i].k);
    }
  }

  void _persist() {
    VsStore.instance.set(_key, _data);
  }

  static Map<String, dynamic> _toJson(VideoItem it) => {
        'id': it.id,
        'title': it.title,
        'cover': it.cover,
        'duration': it.duration,
        'pubdate': it.pubdate,
        'owner': it.ownerName,
        'face': it.ownerFace,
        'view': it.viewCount,
        'danmaku': it.danmakuCount,
        'channelId': it.channelId,
        'channelName': it.channelName,
        'local': it.local,
      };

  static VideoItem? _fromJson(Map<String, dynamic> j) => VideoItem(
        id: '${j['id'] ?? ''}',
        title: '${j['title'] ?? ''}',
        cover: '${j['cover'] ?? ''}',
        duration: (j['duration'] as num?)?.toInt() ?? 0,
        pubdate: (j['pubdate'] as num?)?.toInt() ?? 0,
        ownerName: '${j['owner'] ?? ''}',
        ownerFace: '${j['face'] ?? ''}',
        viewCount: (j['view'] as num?)?.toInt() ?? 0,
        danmakuCount: (j['danmaku'] as num?)?.toInt() ?? 0,
        channelId: (j['channelId'] as num?)?.toInt() ?? 0,
        channelName: '${j['channelName'] ?? ''}',
        local: j['local'] == true,
      );
}
