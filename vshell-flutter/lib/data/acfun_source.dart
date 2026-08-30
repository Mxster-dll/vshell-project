/// AcFun 数据源（Dart 实现）
///
/// 探测结论（2026-08 _probe_acfun*.py 实测）：
///   - 主页热门榜：GET /rest/pc-direct/rank/channel?channelId=0&rankPeriod=DAY&pageNo=N&pageSize=20
///   - 分类视频墙：同上 rid=<channelId>（如 206 搞笑），每页 10 条
///   - 搜索：POST /rest/pc-direct/search/video 表单 {keyword, page, pageSize, channelIds?}
///   - 详情：视频页 HTML 内嵌 window.videoInfo（括号平衡提取 JSON）
///   - 播放/下载：videoInfo.currentVideoInfo.ksPlayJson（h264 各档 m3u8 直链）
///     + ksPlayJsonHevc（h265 档）；m3u8 分片带 pkey/safety_id，Range 可下载
///   - 全部免登录、无签名、无风控；内容为弹幕视频站（与 B 站同构）
library;

import 'dart:convert';

import '../network/net.dart';
import 'data_source.dart';
import 'models.dart';

class AcfunSource implements DataSource {
  static const _api = 'https://www.acfun.cn';

  /// 分区 id -> 名称（探测时从 rank 响应/视频页 channel 字段确认）
  static const _channels = <int, String>{
    206: '搞笑',
    86: '动漫',
    199: '游戏',
    120: '音乐',
    88: '舞蹈',
    121: '影视',
    122: '娱乐',
    126: '科技',
    92: '体育',
    84: '游戏',
    60: '生活',
    178: '文章',
  };

  @override
  String get id => 'acfun';

  @override
  String get name => 'AcFun';

  @override
  Future<List<Channel>> channels() async {
    // 分区枚举：AcFun 分区页导航（实测主页 HTML 无静态导航，用已知表 + rank 探测兜底）
    return _channels.entries
        .map((e) => Channel(id: e.key, name: e.value))
        .toList();
  }

  @override
  Future<PageResult<VideoItem>> homeFeed(int page) =>
      _rank(channelId: 0, page: page);

  @override
  Future<PageResult<VideoItem>> channelVideos(int channelId, int page) =>
      _rank(channelId: channelId, page: page);

  Future<PageResult<VideoItem>> _rank(
      {required int channelId, required int page}) async {
    final j = await Net.getJson('$_api/rest/pc-direct/rank/channel', params: {
      if (channelId == 0)
        'channelId': 0
      else
        'rid': channelId,
      'rankPeriod': 'DAY',
      'pageNo': page,
      'pageSize': 20,
    });
    _check(j);
    final list = (j['rankList'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(VideoItem.fromRank)
        .toList();
    return PageResult(items: list, hasMore: list.isNotEmpty);
  }

  @override
  Future<PageResult<VideoItem>> search(String keyword,
      {int? channelId, int page = 1}) async {
    final j = await Net.postForm('$_api/rest/pc-direct/search/video', {
      'keyword': keyword,
      'page': page,
      'pageSize': 20,
      if (channelId != null && channelId != 0) 'channelIds': '[$channelId]',
    });
    _check(j);
    final list = (j['videoList'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(VideoItem.fromSearch)
        .toList();
    final total = j['totalNum'] ?? 0;
    return PageResult(items: list, hasMore: list.isNotEmpty && page * 20 < total);
  }

  @override
  Future<VideoDetail> detail(String id) async {
    final html = await Net.getText('$_api/v/ac$id');
    final vi = _extractWindowJson(html, 'videoInfo');
    if (vi == null) {
      throw ApiException('视频页解析失败（videoInfo 未找到），id=$id',
          kind: 'parse');
    }
    final cur = vi['currentVideoInfo'] as Map<String, dynamic>? ?? {};
    final parts = (vi['videoList'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map((p) => VideoPart(
            id: '${p['id'] ?? ''}',
            title: '${p['title'] ?? ''}',
            duration: (p['durationMillis'] as num? ?? 0) ~/ 1000))
        .toList();
    final ch = vi['channel'] as Map<String, dynamic>? ?? {};
    final user = vi['user'] as Map<String, dynamic>? ?? {};
    return VideoDetail(
      id: '${vi['dougaId'] ?? id}',
      title: '${vi['title'] ?? ''}',
      cover: _firstUrl(vi['coverUrl'] ?? '', vi['coverCdnUrls']),
      duration: (cur['durationMillis'] as num? ?? vi['durationMillis'] ?? 0) ~/ 1000,
      pubdate: _toSec(vi['createTimeMillis']),
      ownerName: '${user['name'] ?? ''}',
      ownerFace: '${user['headUrl'] ?? ''}',
      viewCount: vi['viewCount'] ?? 0,
      danmakuCount: vi['danmakuCount'] ?? 0,
      channelId: ch['id'] ?? 0,
      channelName: '${ch['name'] ?? ''}',
      desc: '${vi['description'] ?? ''}',
      parts: parts,
    );
  }

  @override
  Future<PlayInfo> playInfo(String id, {String? partId}) async {
    final html = await Net.getText('$_api/v/ac$id');
    final vi = _extractWindowJson(html, 'videoInfo');
    if (vi == null) {
      throw ApiException('视频页解析失败（videoInfo 未找到），id=$id',
          kind: 'parse');
    }
    final cur = vi['currentVideoInfo'] as Map<String, dynamic>? ?? {};
    final dur = (cur['durationMillis'] as num? ?? 0) ~/ 1000;
    // h264 档（首选）：ksPlayJson 内嵌 JSON 字符串
    final ks = _parseKsJson(cur['ksPlayJson']);
    final hevc = _parseKsJson(cur['ksPlayJsonHevc']);
    final qualities = <Quality>[];
    if (ks != null) {
      for (final q in _extractRepresentations(ks)) {
        qualities.add(q);
      }
    }
    if (hevc != null) {
      for (final q in _extractRepresentations(hevc)) {
        qualities.add(Quality(label: '${q.label} HEVC', url: q.url, codec: 'hevc'));
      }
    }
    if (qualities.isEmpty) {
      throw ApiException('未获取到播放源（ksPlayJson 解析失败）', kind: 'parse');
    }
    // 首选：h264 最高清晰度
    final h264 = qualities.where((q) => q.codec == 'h264').toList()
      ..sort((a, b) => a.label.compareTo(b.label));
    final best = h264.isNotEmpty ? h264.last : qualities.first;
    return PlayInfo(
      m3u8Url: best.url,
      duration: dur,
      qualities: qualities,
    );
  }

  @override
  Future<List<VideoItem>> related(String id) async {
    // 相关推荐：AcFun 无公开接口（页面内暂无稳定注入），
    // 用同分区 rank 前 10 条做兜底（排除自身）
    final r = await _rank(channelId: 0, page: 1);
    return r.items.where((it) => it.id != id).take(12).toList();
  }

  @override
  String? parseVideoId(String input) {
    final s = input.trim();
    final m = RegExp(r'ac(\d{5,})').firstMatch(s);
    if (m != null) return m.group(1);
    if (RegExp(r'^\d{5,}$').hasMatch(s)) return s;
    return null;
  }

  /* ---------- 工具 ---------- */

  void _check(Map<String, dynamic> j) {
    final r = j['result'];
    if (r != null && r != 0) {
      throw ApiException('API ${j['error_msg'] ?? 'result=$r'}', code: r is int ? r : null);
    }
  }

  /// 括号平衡提取 window.<name> = {...}
  static Map<String, dynamic>? _extractWindowJson(String html, String name) {
    final start = RegExp('window\\.$name\\s*=').firstMatch(html);
    if (start == null) return null;
    var i = start.end;
    while (i < html.length && html[i] != '{') {
      i++;
    }
    if (i >= html.length) return null;
    var depth = 0;
    String? instr;
    for (var j = i; j < html.length; j++) {
      final c = html[j];
      if (instr != null) {
        if (c == r'\') {
          j++;
          continue;
        }
        if (c == instr) instr = null;
        continue;
      }
      if (c == '"' || c == "'") {
        instr = c;
      } else if (c == '{') {
        depth++;
      } else if (c == '}') {
        depth--;
        if (depth == 0) {
          try {
            return jsonDecode(html.substring(i, j + 1));
          } catch (_) {
            return null;
          }
        }
      }
    }
    return null;
  }

  /// ksPlayJson 字段是 JSON 字符串（或已解析对象）→ 解析为 Map
  static Map<String, dynamic>? _parseKsJson(dynamic v) {
    if (v == null) return null;
    if (v is Map<String, dynamic>) return v;
    if (v is String) {
      try {
        final d = jsonDecode(v);
        return d is Map<String, dynamic> ? d : null;
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  /// 从 ksPlayJson 提取各清晰度 m3u8（adaptationSet[].representation[].url）
  static List<Quality> _extractRepresentations(Map<String, dynamic> ks) {
    final out = <Quality>[];
    final sets = ks['adaptationSet'] as List? ?? [];
    for (final s in sets) {
      if (s is! Map<String, dynamic>) continue;
      final reps = s['representation'] as List? ?? [];
      for (final r in reps) {
        if (r is! Map<String, dynamic>) continue;
        final url = '${r['url'] ?? ''}';
        if (url.isEmpty) continue;
        // 从文件名推断清晰度（如 hls_1080p_h264_6m_1.m3u8）
        final m = RegExp(r'hls_(\d+p)_').firstMatch(url);
        out.add(Quality(
          label: m != null ? m.group(1)!.toUpperCase() : '自适应',
          url: url,
        ));
      }
    }
    return out;
  }

  static String _firstUrl(String a, dynamic list) {
    if (a.isNotEmpty) return a;
    if (list is List && list.isNotEmpty) return '${list.first}';
    return '';
  }

  static int _toSec(dynamic v) {
    if (v is num) return v ~/ 1000;
    return 0;
  }
}
