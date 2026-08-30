/// Android 壳：flutter_inappwebview 替代 WebView2（WebView2 是 Windows 专属）。
/// 与 Windows 壳（WebviewShell，main.dart）的差异：
///   - URL https://app.local/* 由 shouldInterceptRequest 映射到 assets/web/
///     （无虚拟主机 API；web 资源随 APK 打包；需 useShouldInterceptRequest=true）
///   - JS→Dart 桥：window.flutter_inappwebview.callHandler('vsBridge', json) →
///     addJavaScriptHandler（返回值自动序列化回 JS Promise，无需 RESOLVE 回调；
///     flutter-adapter.js 已按平台分发）
///   - Dart→JS：evaluateJavascript（与 webview_windows executeScript 同语义）
///   - __VS_SYNC__ / JS 错误捕获：initialUserScripts（AT_DOCUMENT_START，
///     等价 WebView2 addScriptToExecuteOnDocumentCreated）
///   - 触摸滚动/IME 原生支持——无需 scrollbridge/windowManager/标题栏处理
///   - 无探针参数（--probe-* 等为 Windows 验证用）
library;

import 'dart:collection';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import '../data/acfun_source.dart';
import '../services/vs_store.dart';
import '../services/web_bridge.dart';
import 'pages/downloads_page.dart' show DownloadManager;

class AndroidShell extends StatefulWidget {
  final AcfunSource source;
  const AndroidShell({super.key, required this.source});

  @override
  State<AndroidShell> createState() => _AndroidShellState();
}

class _AndroidShellState extends State<AndroidShell> {
  InAppWebViewController? _controller;
  late final WebBridge _bridge;
  // 下载进度回传节流：taskId → 上次上报进度（变化 <2% 不上报，同 Windows 壳）
  final _dlSent = <String, double>{};
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _bridge = WebBridge(widget.source);
    DownloadManager.instance.addListener(_onDlChanged);
  }

  @override
  void dispose() {
    DownloadManager.instance.removeListener(_onDlChanged);
    super.dispose();
  }

  /// 下载任务状态/进度 → JS（window.__VS_DL__(id, json)），同 Windows 壳
  void _onDlChanged() {
    final mgr = DownloadManager.instance;
    for (final t in mgr.tasks) {
      final prev = _dlSent[t.id];
      final terminal = t.status != 'downloading';
      if (prev == null || (t.progress - prev) >= 2 || terminal) {
        _dlSent[t.id] = t.progress;
        final json = WebBridge.encodeJson({
          'status': t.status,
          'progress': t.progress, // 0-100
          'error': t.error,
          'savePath': t.savePath,
        });
        _controller
            ?.evaluateJavascript(
                source: "window.__VS_DL__ && window.__VS_DL__('${t.id}','$json');")
            .catchError((_) {});
      }
    }
  }

  /// JS → Dart 桥：flutter-adapter.js callHandler('vsBridge', jsonString)。
  /// 返回值 {ok, result|error} 自动序列化回 JS Promise（then 分支 resolve）。
  Future<Map<String, dynamic>> _handleBridgeMessage(String raw) async {
    debugPrint('[vs-android] bridge << $raw');
    Map<String, dynamic> req;
    try {
      req = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return {'ok': false, 'error': 'bad json'};
    }
    if (req['id'] == null) return {'ok': false, 'error': 'no id'};
    final method = '${req['method']}';
    final args = (req['args'] as List?) ?? const [];
    try {
      final result = await _bridge.handle(method, args);
      return {'ok': true, 'result': result};
    } catch (e) {
      return {'ok': false, 'error': '$e'};
    }
  }

  /// https://app.local/* → assets/web/（打包的 web 资源）；其余网络请求放行
  Future<WebResourceResponse?> _intercept(
      InAppWebViewController controller, WebResourceRequest request) async {
    final url = request.url.toString();
    if (!url.startsWith('https://app.local/')) return null;
    var path = url.substring('https://app.local/'.length);
    final q = path.indexOf('?');
    if (q >= 0) path = path.substring(0, q);
    final h = path.indexOf('#');
    if (h >= 0) path = path.substring(0, h);
    if (path.isEmpty) path = 'app.html';
    final safe = path.replaceAll('../', ''); // 路径穿越防护
    try {
      final data = await rootBundle.load('assets/web/$safe');
      final bytes =
          data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
      return WebResourceResponse(
        statusCode: 200,
        reasonPhrase: 'OK',
        contentType: _mime(safe),
        contentEncoding: 'utf-8',
        data: bytes,
        headers: const {'Access-Control-Allow-Origin': '*'},
      );
    } catch (_) {
      return WebResourceResponse(
          statusCode: 404, reasonPhrase: 'Not Found', data: Uint8List(0));
    }
  }

  static String _mime(String path) {
    if (path.endsWith('.html')) return 'text/html; charset=utf-8';
    if (path.endsWith('.js')) return 'application/javascript; charset=utf-8';
    if (path.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
    if (path.endsWith('.mp4')) return 'video/mp4';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.svg')) return 'image/svg+xml';
    return 'application/octet-stream';
  }

  /// 文档创建时注入：__VS_SYNC__（持久化数据）+ JS 全局错误捕获
  UnmodifiableListView<UserScript>? _syncScripts() {
    final list = <UserScript>[];
    try {
      final syncData = VsStore.instance.exportAll();
      if (syncData.isNotEmpty) {
        list.add(UserScript(
          source: 'window.__VS_SYNC__ = ${jsonEncode(syncData)};',
          injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
        ));
      }
    } catch (_) {}
    list.add(UserScript(
      source: r"""
window.__VS_ERR__ = null;
window.addEventListener('error', function (e) {
  window.__VS_ERR__ = (e.message || String(e)) + ' @' + ((e.filename || '').split('/').pop() || 'inline') + ':' + e.lineno;
});
window.addEventListener('unhandledrejection', function (e) {
  window.__VS_ERR__ = 'REJ:' + (e.reason && e.reason.message ? e.reason.message : String(e.reason));
});
""",
      injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
    ));
    return UnmodifiableListView(list);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'vshell',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF181818),
      ),
      home: Scaffold(
        backgroundColor: const Color(0xFF181818),
        body: Stack(
          children: [
            // 无条件渲染：controller 只能由 InAppWebView 的 onWebViewCreated
            // 创建——条件渲染会死锁（_controller 恒 null，webview 永不创建）
            InAppWebView(
                // file:///android_asset/flutter_assets/assets/web/ —— Flutter 把
                // pubspec assets 打包到 APK 的 assets/flutter_assets/ 下；
                // 数据全走 vsBridge 桥（Dart dio），页面无 CORS 跨域请求
                initialUrlRequest: URLRequest(
                    url: WebUri(
                        'file:///android_asset/flutter_assets/assets/web/app.html')),
                initialSettings: InAppWebViewSettings(
                  javaScriptEnabled: true,
                  domStorageEnabled: true,
                  databaseEnabled: true,
                  mediaPlaybackRequiresUserGesture: false,
                  allowFileAccess: true,
                  allowUniversalAccessFromFileURLs: true, // file:// 页面跨域 XHR（hls.js 拉流）
                  supportZoom: false,
                  transparentBackground: false,
                ),
                initialUserScripts: _syncScripts(),
                onWebViewCreated: (c) {
                  _controller = c;
                  debugPrint('[vs-android] webview created');
                  // JS→Dart 桥：返回值自动序列化回 JS（callHandler Promise）
                  c.addJavaScriptHandler(
                    handlerName: 'vsBridge',
                    callback: (args) {
                      final raw =
                          args.isNotEmpty ? '${args[0]}' : '';
                      return _handleBridgeMessage(raw);
                    },
                  );
                },
                onLoadStart: (c, url) {
                  debugPrint('[vs-android] loadStart $url');
                  if (mounted) setState(() => _ready = false);
                },
                onLoadStop: (c, url) {
                  debugPrint('[vs-android] loadStop $url');
                  if (mounted) setState(() => _ready = true);
                },
                onConsoleMessage: (c, message) {
                  debugPrint('[vs-android] console(${message.messageLevel}): '
                      '${message.message}');
                },
                onReceivedError: (c, request, error) {
                  debugPrint('[vs-android] httpError: ${request.url} '
                      '-> ${error.type} ${error.description}');
                },
                shouldInterceptRequest: _intercept,
              ),
            if (!_ready)
              const Center(
                child: CircularProgressIndicator(color: Color(0xFF0078D4)),
              ),
          ],
        ),
      ),
    );
  }
}
