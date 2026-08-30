/// AcFun 数据源冒烟测试（dart run tool/smoke.dart）
library;

import 'package:vshell/data/acfun_source.dart';

Future<void> main() async {
  final src = AcfunSource();
  var ok = true;

  void check(String name, bool cond, [String? detail]) {
    print('${cond ? "PASS" : "FAIL"}  $name${detail != null ? "  ($detail)" : ""}');
    if (!cond) ok = false;
  }

  try {
    // 1. 主页热门
    final home = await src.homeFeed(1);
    check('homeFeed', home.items.isNotEmpty, '${home.items.length} items');
    if (home.items.isNotEmpty) {
      final it = home.items.first;
      print('    first: ${it.title}  id=${it.id}  views=${it.viewText}  cover=${it.cover.substring(0, 40)}...');
      check('home item fields', it.id.isNotEmpty && it.title.isNotEmpty && it.cover.isNotEmpty);
    }

    // 2. 分类墙
    final cat = await src.channelVideos(206, 1);
    check('channelVideos(206)', cat.items.isNotEmpty, '${cat.items.length} items');

    // 3. 搜索
    final s = await src.search('鬼灭');
    check('search', s.items.isNotEmpty, 'total items=${s.items.length}');
    if (s.items.isNotEmpty) {
      print('    first: ${s.items.first.title}');
    }

    // 4. 详情（用主页第一条）
    final detail = await src.detail(home.items.first.id);
    check('detail', detail.title.isNotEmpty, '${detail.title}  parts=${detail.parts.length}');
    check('detail desc', detail.desc.isNotEmpty);
    check('detail owner', detail.ownerName.isNotEmpty, detail.ownerName);

    // 5. 播放源（m3u8 直链）
    final pi = await src.playInfo(home.items.first.id);
    check('playInfo', pi.m3u8Url.isNotEmpty, '${pi.qualities.length} qualities');
    print('    m3u8: ${pi.m3u8Url.substring(0, 90)}...');
    check('playInfo hls', pi.m3u8Url.contains('.m3u8'));

    // 6. parseVideoId
    check('parseVideoId', src.parseVideoId('https://www.acfun.cn/v/ac48797236') == '48797236');
    check('parseVideoId2', src.parseVideoId('48797236') == '48797236');
  } catch (e) {
    check('unexpected error', false, e.toString());
  }

  print(ok ? '\nALL PASS' : '\nSOME FAILED');
}
