/// 角色系统服务（移植 web 版 characters.js 核心语义）
/// - 关键词匹配：charFor(id,title) → char/conflict/none
/// - 手动指定与自然匹配分离：charManuals（隐式标记）
/// - 人工锁定 charLocks / 手动移除 charRemoved
/// - 关注 follow / 代表作 featured / 角色视频快照 charVideos
library;

import '../data/models.dart';
import 'vs_store.dart';

class Character {
  final String name;
  final List<String> keywords;
  final String icon; // dataURL 或 ''
  final String banner; // dataURL 或 ''
  final List<String> featured; // 代表作视频 id 列表

  const Character({
    required this.name,
    this.keywords = const [],
    this.icon = '',
    this.banner = '',
    this.featured = const [],
  });

  Map<String, dynamic> toJson() => {
        'name': name,
        'keywords': keywords,
        'icon': icon,
        'banner': banner,
        'featured': featured,
      };

  factory Character.fromJson(Map<String, dynamic> j) => Character(
        name: '${j['name'] ?? ''}',
        keywords: (j['keywords'] as List? ?? []).map((e) => '$e').toList(),
        icon: '${j['icon'] ?? ''}',
        banner: '${j['banner'] ?? ''}',
        featured: (j['featured'] as List? ?? []).map((e) => '$e').toList(),
      );
}

/// charFor 结果
class CharMatch {
  final String kind; // char / conflict / none
  final Character? char;
  final List<Character> conflicts;

  const CharMatch({required this.kind, this.char, this.conflicts = const []});
}

class CharactersService {
  CharactersService._();
  static final CharactersService instance = CharactersService._();

  static const _charsKey = 'characters';
  static const _videoCharsKey = 'videoChars';
  static const _conflictsKey = 'charConflicts';
  static const _locksKey = 'charLocks';
  static const _removedKey = 'charRemoved';
  static const _manualsKey = 'charManuals';
  static const _followsKey = 'charFollows';
  static const _videosKey = 'charVideos';

  final List<Character> _chars = [];
  final Map<String, String> _videoChars = {}; // videoId -> charName
  final Map<String, List<String>> _conflicts = {}; // videoId -> [names]
  final Set<String> _locks = {}; // videoId 人工锁定
  final Set<String> _removed = {}; // videoId 手动移除
  final Map<String, String> _manuals = {}; // videoId -> charName（手动指定记录）
  final Set<String> _follows = {}; // charName
  final Map<String, List<VideoItem>> _videos = {}; // charName -> [视频快照]

  void load() {
    final s = VsStore.instance;
    _chars
      ..clear()
      ..addAll((s.get<List<dynamic>>(_charsKey) ?? [])
          .whereType<Map>()
          .map((e) => Character.fromJson(e.cast<String, dynamic>())));
    final vc = s.get<Map<dynamic, dynamic>>(_videoCharsKey);
    if (vc != null) {
      _videoChars
        ..clear()
        ..addAll(vc.map((k, v) => MapEntry('$k', '$v')));
    }
    final cf = s.get<Map<dynamic, dynamic>>(_conflictsKey);
    if (cf != null) {
      _conflicts
        ..clear()
        ..addAll(cf.map((k, v) =>
            MapEntry('$k', (v as List).map((e) => '$e').toList())));
    }
    _locks
      ..clear()
      ..addAll(_strSet(s.get<List<dynamic>>(_locksKey)));
    _removed
      ..clear()
      ..addAll(_strSet(s.get<List<dynamic>>(_removedKey)));
    final mn = s.get<Map<dynamic, dynamic>>(_manualsKey);
    if (mn != null) {
      _manuals
        ..clear()
        ..addAll(mn.map((k, v) => MapEntry('$k', '${(v as Map)['name']}')));
    }
    _follows
      ..clear()
      ..addAll(_strSet(s.get<List<dynamic>>(_followsKey)));
    final vids = s.get<Map<dynamic, dynamic>>(_videosKey);
    if (vids != null) {
      _videos.clear();
      vids.forEach((k, v) {
        final name = '$k';
        final list = (v as List? ?? [])
            .whereType<Map>()
            .map((e) => _itemFromJson(e.cast<String, dynamic>()))
            .whereType<VideoItem>()
            .toList();
        _videos[name] = list;
      });
    }
  }

  List<Character> get chars => List.unmodifiable(_chars);

  Character? find(String name) {
    for (final c in _chars) {
      if (c.name == name) return c;
    }
    return null;
  }

  /// 关键词匹配（自然赋予）：命中 1 个 → char；≥2 → conflict；无 → none
  CharMatch charFor(String videoId, String title) {
    // 人工锁定（手动指定/解决冲突后）：保持已赋予，不再被关键词重评升级回冲突
    if (_locks.contains(videoId) && _videoChars.containsKey(videoId)) {
      final c = find(_videoChars[videoId]!);
      if (c != null) return CharMatch(kind: 'char', char: c);
    }
    final lower = title.toLowerCase();
    final hits = <Character>[];
    for (final c in _chars) {
      final kws = c.keywords.isNotEmpty ? c.keywords : [c.name];
      for (final kw in kws) {
        if (lower.contains(kw.toLowerCase())) {
          hits.add(c);
          break;
        }
      }
    }
    // 手动移除：不再自动赋予（直到手动重新指定）
    if (_removed.contains(videoId)) {
      return const CharMatch(kind: 'none');
    }
    if (hits.isEmpty) return const CharMatch(kind: 'none');
    if (hits.length == 1) {
      _videoChars[videoId] = hits.first.name;
      _conflicts.remove(videoId);
      return CharMatch(kind: 'char', char: hits.first);
    }
    // 冲突：记录冲突列表（不覆盖已赋予）
    _conflicts[videoId] = hits.map((c) => c.name).toList();
    return CharMatch(kind: 'conflict', conflicts: hits);
  }

  /// 人工指定（assign）/解决冲突（resolveConflict）；name=null 移除角色
  void assign(String videoId, String? name, {VideoItem? meta}) {
    if (name == null || name.isEmpty) {
      _videoChars.remove(videoId);
      _conflicts.remove(videoId);
      _locks.remove(videoId);
      _removed.add(videoId); // 手动移除标记：自然匹配不再复活
      _manuals.remove(videoId);
    } else {
      _videoChars[videoId] = name;
      _conflicts.remove(videoId);
      _locks.add(videoId);
      _manuals[videoId] = name;
      _removed.remove(videoId);
    }
    if (meta != null) {
      final list = _videos.putIfAbsent(name ?? '', () => []);
      list.removeWhere((v) => v.id == meta.id);
      if (name != null && name.isNotEmpty) list.insert(0, meta);
    }
    _persist();
  }

  /// 还原自然匹配（去除手动指定）：删 manual/lock/指派 → 自然重评
  bool unassign(String videoId, String title) {
    final hadManual = _manuals.containsKey(videoId);
    _manuals.remove(videoId);
    _locks.remove(videoId);
    _videoChars.remove(videoId);
    _conflicts.remove(videoId);
    _removed.remove(videoId); // 还原 = 允许自然重评
    charFor(videoId, title); // 自然重评（可能回到冲突）
    _persist();
    return hadManual;
  }

  /// 看过 ≥5s：自然角色 → 手动指定（隐式，不通知）
  void autoToManual(String videoId) {
    final name = _videoChars[videoId];
    if (name == null || name.isEmpty) return;
    if (_manuals.containsKey(videoId)) return;
    _manuals[videoId] = name;
    _locks.add(videoId);
    _persist();
  }

  bool isManual(String videoId) => _manuals.containsKey(videoId);

  String? charOf(String videoId) => _videoChars[videoId];

  List<String> conflictsOf(String videoId) => _conflicts[videoId] ?? [];

  /// 设置关键词（v0.5.5 起不强制包含角色名——允许删空）
  void setKeywords(String name, List<String> kws) {
    final i = _indexOf(name);
    if (i < 0) return;
    final c = _chars[i];
    _chars[i] = Character(
      name: c.name,
      keywords: kws.map((k) => k.trim()).where((k) => k.isNotEmpty).toList(),
      icon: c.icon,
      banner: c.banner,
      featured: c.featured,
    );
    _persist();
  }

  void setIcon(String name, String icon) {
    final i = _indexOf(name);
    if (i < 0) return;
    final c = _chars[i];
    _chars[i] = Character(
        name: c.name, keywords: c.keywords, icon: icon, banner: c.banner, featured: c.featured);
    _persist();
  }

  void setBanner(String name, String banner) {
    final i = _indexOf(name);
    if (i < 0) return;
    final c = _chars[i];
    _chars[i] = Character(
        name: c.name, keywords: c.keywords, icon: c.icon, banner: banner, featured: c.featured);
    _persist();
  }

  /// 代表作切换（多代表作：列表）
  bool toggleFeatured(String name, String videoId) {
    final i = _indexOf(name);
    if (i < 0) return false;
    final c = _chars[i];
    final feat = List<String>.from(c.featured);
    final idx = feat.indexOf(videoId);
    if (idx >= 0) {
      feat.removeAt(idx);
    } else {
      feat.add(videoId);
    }
    _chars[i] = Character(
        name: c.name, keywords: c.keywords, icon: c.icon, banner: c.banner, featured: feat);
    _persist();
    return feat.contains(videoId);
  }

  /// 全局查询：某视频是哪个角色的代表作
  String? featuredOf(String videoId) {
    for (final c in _chars) {
      if (c.featured.contains(videoId)) return c.name;
    }
    return null;
  }

  bool isFollowed(String name) => _follows.contains(name);

  void toggleFollow(String name) {
    if (!_follows.remove(name)) _follows.add(name);
    _persist();
  }

  List<Character> followedFirst() {
    final rest = _chars.where((c) => !_follows.contains(c.name)).toList();
    final fl = _chars.where((c) => _follows.contains(c.name)).toList();
    return [...fl, ...rest];
  }

  /// 角色主页视频：手动添加（快照）+ 聚合搜索（调用方合并）
  List<VideoItem> videosOf(String name) => List.unmodifiable(_videos[name] ?? []);

  void addChar(String name) {
    if (find(name) != null) return;
    _chars.add(Character(name: name));
    _persist();
  }

  void removeChar(String name) {
    _chars.removeWhere((c) => c.name == name);
    _videoChars.removeWhere((k, v) => v == name);
    _conflicts.removeWhere((k, v) => v.contains(name));
    _manuals.removeWhere((k, v) => v == name);
    _follows.remove(name);
    _videos.remove(name);
    _persist();
  }

  int _indexOf(String name) {
    for (var i = 0; i < _chars.length; i++) {
      if (_chars[i].name == name) return i;
    }
    return -1;
  }

  Set<String> _strSet(List<dynamic>? l) =>
      (l ?? []).map((e) => '$e').toSet();

  void _persist() {
    final s = VsStore.instance;
    s.set(_charsKey, _chars.map((c) => c.toJson()).toList());
    s.set(_videoCharsKey, _videoChars);
    s.set(_conflictsKey, _conflicts);
    s.set(_locksKey, _locks.toList());
    s.set(_removedKey, _removed.toList());
    s.set(_manualsKey,
        _manuals.map((k, v) => MapEntry(k, {'name': v, 'at': 0})));
    s.set(_followsKey, _follows.toList());
    s.set(_videosKey,
        _videos.map((k, v) => MapEntry(k, v.map(_itemToJson).toList())));
  }

  static Map<String, dynamic> _itemToJson(VideoItem it) => {
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

  static VideoItem? _itemFromJson(Map<String, dynamic> j) => VideoItem(
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
