/// 数据源抽象接口：可插拔（当前主源 = AcFun，可扩展其他站点）
library;

import 'models.dart';

abstract class DataSource {
  String get id;
  String get name;

  /// 分区列表（分类墙导航）
  Future<List<Channel>> channels();

  /// 分区视频墙（channelId = 0 表示全站热门）
  Future<PageResult<VideoItem>> channelVideos(int channelId, int page);

  /// 主页视频墙（热门榜，分页）
  Future<PageResult<VideoItem>> homeFeed(int page);

  /// 详情
  Future<VideoDetail> detail(String id);

  /// 播放源（m3u8 直链）
  Future<PlayInfo> playInfo(String id, {String? partId});

  /// 相关推荐
  Future<List<VideoItem>> related(String id);

  /// 搜索
  Future<PageResult<VideoItem>> search(String keyword,
      {int? channelId, int page = 1});

  /// 从输入（URL/文本）提取视频 id
  String? parseVideoId(String input);
}
