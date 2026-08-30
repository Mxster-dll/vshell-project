/// 应用全局状态（Provider）：页面路由、视图模式、布局、数据源、待看/收藏
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../data/data_source.dart';
import '../data/models.dart';
import '../services/vs_store.dart';
import '../theme/vs_theme.dart';

/// 页面类型
enum PageType {
  home,
  search,
  aggregate,
  watchlist,
  favorites,
  downloads,
  characters,
  local,
  settings,
  blacklist,
  detail,
  role,
}
class AppState extends ChangeNotifier {
  AppState(this.source) {
    _loadSaved();
  }

  final DataSource source;

  /// 当前页面（detail 用 routeId 表示）
  PageType page = PageType.home;

  /// 详情页目标视频 id
  String? detailId;

  /// 搜索关键字
  String searchKeyword = '';

  /// 角色主页目标角色名
  String roleName = '';

  /// 主题模式（true = 浅色）
  bool themeLight = false;

  void toggleTheme() {
    themeLight = !themeLight;
    VsTheme.light = themeLight;
    VsStore.instance.set('themeLight', themeLight);
    notifyListeners();
  }

  /// 视图模式（web 版 viewMode）：wall 视频墙 / feed 抖音刷
  bool feedMode = false;

  void setFeedMode(bool v) {
    feedMode = v;
    VsStore.instance.set('feedMode', v);
    notifyListeners();
  }

  /// feed 全屏（web 版第十轮需求 7：全屏后仍可滚动；导航栏隐藏）
  bool feedFullscreen = false;

  void setFeedFullscreen(bool v) {
    if (feedFullscreen == v) return;
    feedFullscreen = v;
    notifyListeners();
  }

  /// 卡片布局（web 版 layout）：standard / cover
  bool coverLayout = false;

  void setCoverLayout(bool v) {
    if (coverLayout == v) return;
    coverLayout = v;
    VsStore.instance.set('coverLayout', v);
    notifyListeners();
  }

  /// 网格间距（web .vshell-wall gap 6px；分类栏↔卡片与卡片↔卡片共用，设置页可调）
  double gridGap = 6.0;

  void setGridGap(double v) {
    final n = v.clamp(2.0, 16.0);
    if (gridGap == n) return;
    gridGap = n;
    VsStore.instance.set('gridGap', n);
    notifyListeners();
  }

  // ---------- 搜索标签（web V.searchTags：胶囊编辑器数据源） ----------
  final List<String> _searchTags = [];

  List<String> get searchTags => List.unmodifiable(_searchTags);

  bool hasSearchTag(String kw) => _searchTags.contains(kw);

  /// 添加搜索标签；已存在返回 false（web searchTags.add 语义）
  bool addSearchTag(String kw) {
    final v = kw.trim();
    if (v.isEmpty || _searchTags.contains(v)) return false;
    _searchTags.add(v);
    VsStore.instance.set('searchTags', _searchTags);
    notifyListeners();
    return true;
  }

  void removeSearchTag(String kw) {
    if (_searchTags.remove(kw)) {
      VsStore.instance.set('searchTags', _searchTags);
      notifyListeners();
    }
  }

  void clearSearchTags() {
    if (_searchTags.isEmpty) return;
    _searchTags.clear();
    VsStore.instance.set('searchTags', _searchTags);
    notifyListeners();
  }

  // ---------- 待看/收藏 ----------
  final Map<String, VideoItem> _watch = {};
  final Map<String, VideoItem> _fav = {};

  Map<String, VideoItem> get watch => _watch;
  Map<String, VideoItem> get fav => _fav;

  bool isWatch(String id) => _watch.containsKey(id);
  bool isFav(String id) => _fav.containsKey(id);

  Future<void> toggleWatch(VideoItem item) async {
    if (_watch.containsKey(item.id)) {
      _watch.remove(item.id);
    } else {
      _watch[item.id] = item;
    }
    await _saveList('watch', _watch);
    notifyListeners();
  }

  Future<void> toggleFav(VideoItem item) async {
    if (_fav.containsKey(item.id)) {
      _fav.remove(item.id);
    } else {
      _fav[item.id] = item;
    }
    await _saveList('fav', _fav);
    notifyListeners();
  }

  // ---------- 黑名单（web .vsc-video-blacklist：从各列表移除） ----------
  final Map<String, VideoItem> _blacklist = {};

  Map<String, VideoItem> get blacklist => _blacklist;

  bool isBlacklisted(String id) => _blacklist.containsKey(id);

  Future<void> toggleBlacklist(VideoItem item) async {
    if (_blacklist.containsKey(item.id)) {
      _blacklist.remove(item.id);
    } else {
      _blacklist[item.id] = item;
    }
    await _saveList('blacklist', _blacklist);
    notifyListeners();
  }

  // ---------- 导航 ----------
  void go(PageType p, {String? id, String? keyword, String? name}) {
    page = p;
    detailId = id;
    if (keyword != null) searchKeyword = keyword;
    if (name != null) roleName = name;
    notifyListeners();
  }

  /// 外部（角色管理等）强制全局重建：让各页面重算角标等派生状态
  void refresh() => notifyListeners();

  // ---------- 持久化 ----------
  void _loadSaved() {
    final tl = VsStore.instance.get<bool>('themeLight');
    if (tl == true) {
      themeLight = true;
      VsTheme.light = true;
    }
    final fm = VsStore.instance.get<bool>('feedMode');
    if (fm == true) feedMode = true;
    final cl = VsStore.instance.get<bool>('coverLayout');
    if (cl == true) coverLayout = true;
    final gg = VsStore.instance.get<dynamic>('gridGap');
    if (gg is num) gridGap = gg.toDouble().clamp(2.0, 16.0);
    final st = VsStore.instance.get<dynamic>('searchTags');
    if (st is List) {
      _searchTags.addAll(st.whereType<String>());
    }
    final w = VsStore.instance.get<dynamic>('watch');
    if (w is Map) {
      for (final e in w.entries) {
        final it = _itemFromJson(e.value);
        if (it != null) _watch[e.key] = it;
      }
    }
    final f = VsStore.instance.get<dynamic>('fav');
    if (f is Map) {
      for (final e in f.entries) {
        final it = _itemFromJson(e.value);
        if (it != null) _fav[e.key] = it;
      }
    }
    final b = VsStore.instance.get<dynamic>('blacklist');
    if (b is Map) {
      for (final e in b.entries) {
        final it = _itemFromJson(e.value);
        if (it != null) _blacklist[e.key] = it;
      }
    }
  }

  Future<void> _saveList(String key, Map<String, VideoItem> m) async {
    final j = <String, dynamic>{};
    for (final e in m.entries) {
      j[e.key] = _itemToJson(e.value);
    }
    await VsStore.instance.set(key, j);
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

  static VideoItem? _itemFromJson(dynamic v) {
    if (v is! Map) return null;
    return VideoItem(
      id: '${v['id'] ?? ''}',
      title: '${v['title'] ?? ''}',
      cover: '${v['cover'] ?? ''}',
      duration: (v['duration'] as num?)?.toInt() ?? 0,
      pubdate: (v['pubdate'] as num?)?.toInt() ?? 0,
      ownerName: '${v['owner'] ?? ''}',
      ownerFace: '${v['face'] ?? ''}',
      viewCount: (v['view'] as num?)?.toInt() ?? 0,
      danmakuCount: (v['danmaku'] as num?)?.toInt() ?? 0,
      channelId: (v['channelId'] as num?)?.toInt() ?? 0,
      channelName: '${v['channelName'] ?? ''}',
      local: v['local'] == true,
    );
  }
}

/// JSON 工具（角色系统等用）
Map<String, dynamic> jsonDecodeMap(String s) =>
    (jsonDecode(s) as Map).cast<String, dynamic>();
