/// WebView 桥：web 版前端（vshell.user.js）↔ Flutter 后端
/// 契约见 output/flutter-adapter.js（9 方法，全部 Promise）：
/// getHomeSections / getCategoryVideos / getHomeFeed / getVideoDetail /
/// getPlayInfo / getRelated / search / parseVideoId
/// 调用链：JS postMessage({id,method,args}) → Dart handle() → JSON 回传。
library;

import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:file_selector/file_selector.dart';

import '../data/data_source.dart';
import '../data/models.dart';
import '../ui/pages/downloads_page.dart';
import 'vs_store.dart';

class WebBridge {
  final DataSource source;
  WebBridge(this.source);

  /// 处理一个桥方法调用；返回回传给 JS 的 JSON 字符串。
  /// 抛异常时由调用方转成 {err} 并 ok=false。
  Future<dynamic> handle(String method, List<dynamic> args) async {
    switch (method) {
      case 'meta':
        return {
          'id': source.id,
          'name': source.name,
          'match': true,
        };
      case 'getHomeSections':
        final cs = await source.channels();
        return cs
            .map((c) => {
                  'key': '${c.id}',
                  'title': c.name,
                  'icon': 'folder',
                })
            .toList();
      case 'getCategoryVideos':
        final key = '${args.isNotEmpty ? args[0] : ''}';
        final page = args.length > 1 && args[1] is int ? args[1] : 1;
        final r = await source.channelVideos(int.tryParse(key) ?? 0, page);
        return _pageJson(r);
      case 'getHomeFeed':
        final page = args.isNotEmpty && args[0] is int ? args[0] : 1;
        final r = await source.homeFeed(page);
        return _pageJson(r);
      case 'getVideoDetail':
        final id = '${args.isNotEmpty ? args[0] : ''}';
        final d = await source.detail(id);
        return {
          ..._itemJson(d),
          'desc': d.desc,
          'pages': d.parts
              .map((p) => {
                    'id': p.id,
                    'title': p.title,
                    'duration': p.duration,
                  })
              .toList(),
        };
      case 'getPlayInfo':
        final id = '${args.isNotEmpty ? args[0] : ''}';
        final cid = args.length > 1 && args[1] != null ? '${args[1]}' : null;
        final p = await source.playInfo(id, partId: cid);
        // Flutter 端为 m3u8 直链（AcFun ksPlayJson）；web 播放器以 hls.js
        // 播 HLS（type:'hls'）。master：h264 各档合成 master playlist 文本
        // （JS 侧转 blob: URL → hls.js 原生 ABR 自动切清晰度）
        return {
          'type': 'hls',
          'url': p.m3u8Url,
          'duration': p.duration,
          'cid': cid ?? id,
          'master': _masterM3u8(p.qualities),
        };
      case 'getRelated':
        final id = '${args.isNotEmpty ? args[0] : ''}';
        final r = await source.related(id);
        return r.map(_itemJson).toList();
      case 'search':
        final q = '${args.isNotEmpty ? args[0] : ''}';
        final page = args.length > 1 && args[1] is int ? args[1] : 1;
        final r = await source.search(q, page: page);
        return _pageJson(r);
      case 'parseVideoId':
        final s = '${args.isNotEmpty ? args[0] : ''}';
        final m = RegExp(r'(?:ac|av|BV)?(\d{5,})').firstMatch(s);
        return m?.group(1);
      case 'storeSet':
        // web V.store.set 写穿（fire-and-forget）：键名 'vshell.' 前缀两边
        // 一致 → 与原生版 AppState 数据共享（watch/fav/blacklist/characters…）
        final key = '${args.isNotEmpty ? args[0] : ''}';
        final raw = args.length > 1 ? '${args[1]}' : '';
        if (key.isEmpty) return null;
        try {
          await VsStore.instance.set(key, jsonDecode(raw));
        } catch (_) {
          await VsStore.instance.set(key, raw);
        }
        return null;
      case 'storeDel':
        final dk = '${args.isNotEmpty ? args[0] : ''}';
        if (dk.isNotEmpty) await VsStore.instance.del(dk);
        return null;
      case 'downloadStart':
        // 性能敏感路径原生化：web medl 下载委托 Flutter 引擎
        // （HlsDownloader：并发分片 + ffmpeg 合并，不占 WebView 主线程）
        final url = '${args.isNotEmpty ? args[0] : ''}';
        final name = args.length > 1 ? '${args[1]}' : '';
        if (url.isEmpty) throw ArgumentError('downloadStart: empty url');
        final t = await DownloadManager.instance.add(url,
            title: name.isNotEmpty ? name : null);
        return t.id;
      case 'downloadCancel':
        final cid = '${args.isNotEmpty ? args[0] : ''}';
        final t = DownloadManager.instance.byId(cid);
        if (t != null && t.status == 'downloading') t.handle.cancel();
        return null;
      // ---- 插件数据源（v0.5.6 用户需求：Flutter 添加数据源只记本地文件
      // 路径，切换时才加载对应 JS 适配器）----
      case 'sourceAdd':
        // 文件对话框选 .js 适配器 → 存注册表（VsStore 'dataSources'）
        final picked = await openFile(acceptedTypeGroups: const [
          XTypeGroup(label: 'JS 适配器', extensions: ['js']),
        ]);
        if (picked == null) return {'added': false, 'sources': await _sourceList()};
        final path = picked.path;
        final id = picked.name.replaceAll(RegExp(r'\.(js|json)$'), '');
        final list = await _sourceList();
        list.removeWhere((s) => '${s['path']}' == path);
        list.add({'id': id, 'name': id, 'path': path});
        await VsStore.instance.set('dataSources', list);
        return {'added': true, 'sources': list};
      case 'sourceList':
        return _sourceList();
      case 'sourceRemove':
        final rid = '${args.isNotEmpty ? args[0] : ''}';
        final list = await _sourceList();
        list.removeWhere((s) => '${s['id']}' == rid);
        await VsStore.instance.set('dataSources', list);
        return list;
      case 'sourceLoad':
        // 读插件适配器文件内容（JS 侧注入执行）
        final lid = '${args.isNotEmpty ? args[0] : ''}';
        final list = await _sourceList();
        for (final s in list) {
          if ('${s['id']}' == lid) {
            final f = File('${s['path']}');
            if (await f.exists()) {
              return {'ok': true, 'code': await f.readAsString(), 'path': s['path']};
            }
            return {'ok': false, 'error': 'file not found: ${s['path']}'};
          }
        }
        return {'ok': false, 'error': 'source not found: $lid'};
      case 'netFetch':
        // 插件适配器的通用 HTTP 代理（规避 WebView2 CORS）：
        // 返回 {ok, status, text, finalUrl, headers}——finalUrl 为跟随重定向后
        // 的最终 URL，headers 为响应头（多值 join）；JS 侧自行 JSON.parse text
        final url = '${args.isNotEmpty ? args[0] : ''}';
        if (url.isEmpty) throw ArgumentError('netFetch: empty url');
        final opts = args.length > 1 && args[1] is Map
            ? Map<String, dynamic>.from(args[1] as Map)
            : <String, dynamic>{};
        final method = '${opts['method'] ?? 'GET'}'.toUpperCase();
        final timeout = (opts['timeout'] is int ? opts['timeout'] as int : 15000);
        final headers = opts['headers'] is Map
            ? Map<String, dynamic>.from(opts['headers'] as Map)
            : <String, dynamic>{};
        try {
          final dio = Dio(BaseOptions(
            connectTimeout: Duration(milliseconds: timeout),
            receiveTimeout: Duration(milliseconds: timeout),
            sendTimeout: Duration(milliseconds: timeout),
            responseType: ResponseType.plain,
            headers: headers,
          ));
          final resp = method == 'POST'
              ? await dio.post(url, data: opts['body'])
              : await dio.get(url, queryParameters: opts['query'] is Map
                  ? Map<String, dynamic>.from(opts['query'] as Map)
                  : null);
          // 返回 {ok, status, text, finalUrl, headers}：
          // finalUrl = dio 跟随重定向后的最终 URL（realUri）；headers 多值 join
          final respHeaders = <String, String>{};
          resp.headers.forEach((name, values) {
            respHeaders[name] = values.join(', ');
          });
          return {
            'ok': true,
            'status': resp.statusCode,
            'text': '${resp.data ?? ''}',
            'finalUrl': resp.realUri.toString(),
            'headers': respHeaders,
          };
        } catch (e) {
          return {'ok': false, 'status': 0, 'text': '', 'error': '$e'};
        }
      default:
        throw ArgumentError('unknown bridge method: $method');
    }
  }

  /// 数据源注册表（VsStore 'dataSources'）：[{id, name, path}]
  Future<List<Map<String, dynamic>>> _sourceList() async {
    final v = await VsStore.instance.get('dataSources');
    if (v is List) {
      return v
          .whereType<Map>()
          .map((m) => Map<String, dynamic>.from(m))
          .toList();
    }
    return [];
  }

  /// 合成 master m3u8：h264 各档（按清晰度排序）→ hls.js ABR 自动选档。
  /// 带宽从档名推断（hls_1080p_h264_6m → 6,000,000）。HEVC 档排除
  /// （hls.js 需 MSE 支持 HEVC，多数环境不可用）。
  static String _masterM3u8(List<Quality> qualities) {
    final h264 = qualities.where((q) => q.codec != 'hevc').toList();
    if (h264.length < 2) return '';
    final b = StringBuffer()
      ..writeln('#EXTM3U')
      ..writeln('#EXT-X-VERSION:3');
    for (final q in h264) {
      final m = RegExp(r'_(\d+)m_').firstMatch(q.url);
      final bw = m != null
          ? int.parse(m.group(1)!) * 1000000
          : (q.label.contains('1080')
              ? 6000000
              : q.label.contains('720')
                  ? 3000000
                  : q.label.contains('480')
                      ? 1500000
                      : 800000);
      b.writeln('#EXT-X-STREAM-INF:BANDWIDTH=$bw,RESOLUTION=${q.label.contains('1080') ? '1920x1080' : q.label.contains('720') ? '1280x720' : q.label.contains('480') ? '854x480' : '640x360'}');
      b.writeln(q.url);
    }
    return b.toString();
  }

  Map<String, dynamic> _pageJson(PageResult<VideoItem> r) => {
        'items': r.items.map(_itemJson).toList(),
        'hasMore': r.hasMore,
      };

  Map<String, dynamic> _itemJson(VideoItem it) => {
        'id': it.id,
        'title': it.title,
        'pic': it.cover,
        'duration': it.duration,
        'pubdate': it.pubdate,
        'owner': {
          'name': it.ownerName,
          'face': it.ownerFace,
        },
        'stat': {
          'view': it.viewCount,
          'like': 0,
          'danmaku': it.danmakuCount,
        },
        'channelId': it.channelId,
        'local': it.local,
      };

  /// JSON 编码 + 转义（executeJavaScript 字符串字面量安全）
  static String encodeJson(Object? o) {
    final s = jsonEncode(o);
    // 反斜杠与引号转义；\u2028/\u2029 是 JS 行分隔符（JSON.parse 前不执行，
    // 但 executeJavaScript 直接 eval 时危险）——统一转义
    return s
        .replaceAll('\\', '\\\\')
        .replaceAll("'", "\\'")
        .replaceAll('\u2028', '\\u2028')
        .replaceAll('\u2029', '\\u2029');
  }
}
