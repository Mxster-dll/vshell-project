/// 本地视频数据源（移植 web 版 localvideos.js 语义）
/// 导入：复制文件到应用数据目录 + 元数据持久化（JSON）
/// 注入：主页置顶 / 搜索合并 / 角色聚合合并 / 卡片本地绿点
library;

import 'dart:io';
import 'dart:ui' show VoidCallback;

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../data/models.dart';
import 'thumb_capture.dart';
import 'vs_store.dart';

class LocalVideosService {
  LocalVideosService._();
  static final LocalVideosService instance = LocalVideosService._();

  static const _key = 'localVideos';
  final List<VideoItem> _items = [];
  Directory? _dir;
  bool _ready = false;

  List<VideoItem> get items => List.unmodifiable(_items);
  bool get ready => _ready;

  /// 初始化：加载元数据 + 重建文件路径（幂等）
  Future<void> init() async {
    if (_ready) return;
    final support = await getApplicationSupportDirectory();
    _dir = Directory(p.join(support.path, 'local_videos'));
    await _dir!.create(recursive: true);
    final raw = VsStore.instance.get<List<dynamic>>(_key) ?? [];
    for (final e in raw) {
      if (e is! Map) continue;
      final j = e.cast<String, dynamic>();
      final filePath = '${j['filePath'] ?? ''}';
      if (filePath.isNotEmpty && await File(filePath).exists()) {
        _items.add(VideoItem(
          id: '${j['id'] ?? ''}',
          title: '${j['title'] ?? ''}',
          cover: '${j['cover'] ?? ''}',
          duration: (j['duration'] as num?)?.toInt() ?? 0,
          pubdate: (j['pubdate'] as num?)?.toInt() ?? 0,
          local: true,
          viewCount: (j['view'] as num?)?.toInt() ?? 0,
          filePath: filePath,
        ));
      }
    }
    _ready = true;
    // 无论截帧成败，init 完成都通知 UI（items 已就绪，空封面显示占位）
    _onChanged?.call();
  }

  /// 导入本地视频文件（复制到应用目录）
  Future<VideoItem?> importFile(String srcPath) async {
    if (_dir == null) await init();
    final src = File(srcPath);
    if (!await src.exists()) return null;
    final base = p.basename(srcPath);
    final title = base.contains('.')
        ? base.substring(0, base.lastIndexOf('.'))
        : base;
    final id = 'local:${DateTime.now().millisecondsSinceEpoch}:${_items.length}';
    // Windows 文件名不允许冒号——磁盘文件名用安全形式（id 本身保留冒号前缀语义）
    final safeName = id.replaceAll(':', '_');
    final dest = p.join(_dir!.path, '$safeName${p.extension(base)}');
    await src.copy(dest);
    final it = VideoItem(
      id: id,
      title: title,
      local: true,
      duration: 0, // 时长后续通过播放探测
      pubdate: DateTime.now().millisecondsSinceEpoch ~/ 1000,
      viewCount: 0,
      cover: '',
      filePath: dest, // 记录实际文件路径（含扩展名）
    );
    _items.insert(0, it);
    await _persist();
    _makeThumb(it, dest); // 异步截帧，不阻塞导入
    return it;
  }

  /// 截帧函数注入（UI 层提供带渲染宿主的实现；null = 用服务层裸 Player 兜底）
  Future<ThumbResult?> Function(String filePath)? thumbFn;

  /// 异步截帧：成功后回写 cover+duration 并通知卡片刷新
  Future<void> _makeThumb(VideoItem it, String path) async {
    final r =
        thumbFn != null ? await thumbFn!(path) : await ThumbCapture.captureThumb(path);
    if (r == null) return;
    final cur = find(it.id);
    if (cur == null) return;
    final i = _items.indexWhere((e) => e.id == it.id);
    if (i < 0) return;
    _items[i] = VideoItem(
      id: cur.id,
      title: cur.title,
      cover: r.cover,
      duration: r.durationSec > 0 ? r.durationSec : cur.duration,
      pubdate: cur.pubdate,
      viewCount: cur.viewCount,
      local: true,
      filePath: cur.filePath,
    );
    await _persist();
    _onChanged?.call();
  }

  /// 懒自愈：封面缺失的旧条目补截帧（上次截帧失败的兜底）。
  /// 仅由 LocalPage 打开时调用——启动期自动截帧会触发 media_kit 后台播放，
  /// 与 Flutter debug 渲染管线冲突（debugFrameWasSentToEngine 断言崩溃 +
  /// 窗口被最小化/移出屏幕）。
  Future<void> healMissingCovers() async {
    final pending = _items.where((it) => it.cover.isEmpty).toList();
    for (final it in pending) {
      if (it.filePath.isNotEmpty && await File(it.filePath).exists()) {
        await _makeThumb(it, it.filePath);
      }
    }
  }

  /// 本地封面就绪/变更通知（卡片重绘）
  VoidCallback? _onChanged;
  void set onChanged(VoidCallback? cb) => _onChanged = cb;

  Future<void> remove(String id) async {
    final i = _items.indexWhere((e) => e.id == id);
    if (i < 0) return;
    final it = _items.removeAt(i);
    final fp = it.filePath;
    if (fp.isNotEmpty) {
      try {
        await File(fp).delete();
      } catch (_) {}
    }
    await _persist();
  }

  /// 本地文件路径（详情页播放用）
  Future<String?> filePathOf(String id) async {
    final it = find(id);
    if (it != null && it.filePath.isNotEmpty) {
      if (await File(it.filePath).exists()) return it.filePath;
    }
    // 旧数据兜底：遍历持久化记录
    final raw = VsStore.instance.get<List<dynamic>>(_key) ?? [];
    for (final e in raw) {
      if (e is Map && '${e['id']}' == id) {
        final fp = '${e['filePath'] ?? ''}';
        if (fp.isNotEmpty && await File(fp).exists()) return fp;
      }
    }
    return null;
  }

  Future<void> _persist() async {
    await VsStore.instance.set(
        _key, _items.map((it) => _toJson(it)).toList());
  }

  Map<String, dynamic> _toJson(VideoItem it) => {
        'id': it.id,
        'title': it.title,
        'cover': it.cover,
        'duration': it.duration,
        'pubdate': it.pubdate,
        'view': it.viewCount,
        // 实际复制后的文件路径（含扩展名；旧数据无 filePath 时按 id 兜底）
        'filePath':
            it.filePath.isNotEmpty ? it.filePath : p.join(_dir!.path, it.id),
      };

  VideoItem? find(String id) {
    for (final it in _items) {
      if (it.id == id) return it;
    }
    return null;
  }

  /// 搜索命中（本地标题包含关键字）
  List<VideoItem> search(String q) {
    final k = q.trim().toLowerCase();
    if (k.isEmpty) return _items;
    return _items
        .where((it) => it.title.toLowerCase().contains(k))
        .toList();
  }
}
