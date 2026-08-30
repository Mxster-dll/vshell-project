/// 数据模型：与 web 版 SiteAdapter 契约对齐（VideoItem/VideoDetail/PlayInfo）
library;

/// 视频条目（卡片/列表用）
class VideoItem {
  final String id; // ac 号（如 '48797236'）
  final String title;
  final String cover; // 封面 URL
  final int duration; // 秒
  final int pubdate; // 秒级时间戳，0 = 未知
  final String ownerName;
  final String ownerFace;
  final int viewCount;
  final int danmakuCount;
  final int channelId; // 分区 id（0 = 未知）
  final String channelName;
  final bool local; // 本地视频标记
  final String filePath; // 本地视频实际文件路径（本地数据源用）

  const VideoItem({
    required this.id,
    required this.title,
    this.cover = '',
    this.duration = 0,
    this.pubdate = 0,
    this.ownerName = '',
    this.ownerFace = '',
    this.viewCount = 0,
    this.danmakuCount = 0,
    this.channelId = 0,
    this.channelName = '',
    this.local = false,
    this.filePath = '',
  });

  factory VideoItem.fromRank(Map<String, dynamic> j) => VideoItem(
        id: '${j['contentId'] ?? j['dougaId'] ?? ''}',
        title: '${j['title'] ?? j['contentTitle'] ?? ''}',
        cover: '${j['coverUrl'] ?? j['videoCover'] ?? ''}',
        duration: _rankSec(j['durationMillis'], j['duration']),
        pubdate: _toSec(j['createTimeMillis'] ~/ 1000),
        ownerName: '${j['userName'] ?? ''}',
        ownerFace: '${j['userImg'] ?? ''}',
        viewCount: j['viewCount'] ?? 0,
        danmakuCount: j['danmakuCount'] ?? 0,
        channelId: j['channelId'] ?? 0,
        channelName: '${j['channelName'] ?? ''}',
      );

  /// AcFun rank duration 为毫秒（durationMillis 同义字段）——统一转秒
  static int _rankSec(dynamic millis, dynamic dur) {
    if (millis is num && millis > 0) return (millis / 1000).round();
    if (dur is num) {
      // >1 天视为毫秒（脏数据防御）
      return dur > 86400 ? (dur / 1000).round() : dur.round();
    }
    return _toSec(dur);
  }

  factory VideoItem.fromSearch(Map<String, dynamic> j) => VideoItem(
        id: '${j['contentId'] ?? j['videoId'] ?? ''}',
        title: (j['emTitle'] ?? j['title'] ?? '').toString().replaceAll(RegExp(r'</?em>'), ''),
        cover: '${j['coverUrl'] ?? ''}',
        duration: _rankSec(j['durationMillis'], j['duration']),
        pubdate: 0,
        ownerName: '${j['userName'] ?? ''}',
        ownerFace: '${j['userImg'] ?? ''}',
        viewCount: j['viewCount'] ?? 0,
        danmakuCount: j['danmuCount'] ?? j['danmakuCount'] ?? 0,
        channelId: j['channelId'] ?? 0,
      );

  VideoItem copyWith({String? cover, bool? local, String? filePath}) => VideoItem(
        id: id,
        title: title,
        cover: cover ?? this.cover,
        duration: duration,
        pubdate: pubdate,
        ownerName: ownerName,
        ownerFace: ownerFace,
        viewCount: viewCount,
        danmakuCount: danmakuCount,
        channelId: channelId,
        channelName: channelName,
        local: local ?? this.local,
        filePath: filePath ?? this.filePath,
      );

  static int _toSec(dynamic d) {
    if (d is int) return d;
    if (d is double) return d.round();
    if (d is String) {
      final parts = d.split(':');
      if (parts.length == 2) {
        return int.tryParse(parts[0])! * 60 + int.tryParse(parts[1])!;
      }
      if (parts.length == 3) {
        return int.tryParse(parts[0])! * 3600 +
            int.tryParse(parts[1])! * 60 +
            int.tryParse(parts[2])!;
      }
      return int.tryParse(d) ?? 0;
    }
    return 0;
  }

  /// 时长格式化 mm:ss / h:mm:ss（与 web 版 fmtTime 一致）
  String get durationText {
    if (duration <= 0) return '';
    final h = duration ~/ 3600;
    final m = (duration % 3600) ~/ 60;
    final s = duration % 60;
    if (h > 0) return '$h:${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  /// 播放数格式化（万/亿，与 web 版一致）
  String get viewText {
    if (viewCount <= 0) return '';
    if (viewCount >= 100000000) {
      return '${(viewCount / 100000000).toStringAsFixed(1)}亿';
    }
    if (viewCount >= 10000) {
      return '${(viewCount / 10000).toStringAsFixed(1)}万';
    }
    return '$viewCount';
  }
}

/// 详情页 = VideoItem + desc + 分P
class VideoDetail extends VideoItem {
  final String desc;
  final List<VideoPart> parts;

  const VideoDetail({
    required super.id,
    required super.title,
    super.cover,
    super.duration,
    super.pubdate,
    super.ownerName,
    super.ownerFace,
    super.viewCount,
    super.danmakuCount,
    super.channelId,
    super.channelName,
    this.desc = '',
    this.parts = const [],
  });
}

/// 分P
class VideoPart {
  final String id; // 播放用视频 id（currentVideoId）
  final String title;
  final int duration;

  const VideoPart({required this.id, required this.title, this.duration = 0});
}

/// 播放源（m3u8 直链，AcFun 数据源核心优势）
class PlayInfo {
  final String m3u8Url; // 首选：h264 最高清晰度
  final int duration;
  final List<Quality> qualities;

  const PlayInfo({
    required this.m3u8Url,
    this.duration = 0,
    this.qualities = const [],
  });
}

/// 清晰度档
class Quality {
  final String label; // 如 1080P
  final String url; // m3u8 直链
  final String codec; // h264 / hevc

  const Quality({required this.label, required this.url, this.codec = 'h264'});
}

/// 分区
class Channel {
  final int id;
  final String name;

  const Channel({required this.id, required this.name});
}

/// 分页结果
class PageResult<T> {
  final List<T> items;
  final bool hasMore;

  const PageResult({required this.items, this.hasMore = false});
}
