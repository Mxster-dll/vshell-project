/// vshell Flutter 桌面应用入口
/// 装配：窗口（1440x900 #181818）→ 持久化 → 数据源 → 主题 → Shell
library;

import 'dart:convert';
import 'dart:ffi' as ffi;
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart' show PointerScrollEvent;
import 'package:flutter/rendering.dart' show debugPaintSizeEnabled;
import 'package:ffi/ffi.dart' show malloc;
import 'package:media_kit/media_kit.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_windows/webview_windows.dart';
import 'package:window_manager/window_manager.dart';

import 'data/acfun_source.dart';
import 'data/models.dart';
import 'services/characters.dart';
import 'services/hls_downloader.dart';
import 'services/local_videos.dart';
import 'services/search_cache.dart';
import 'services/vs_store.dart';
import 'services/web_bridge.dart';
import 'state/app_state.dart';
import 'theme/vs_theme.dart';
import 'ui/pages/downloads_page.dart';
import 'ui/android_shell.dart';
import 'ui/shell.dart';
import 'ui/widgets/thumb_host.dart';

/// feed 全屏自动测试开关（--feed-fs-test）
bool kFeedFsTest = false;

/// 搜索框浮层自动聚焦测试开关（--search-pop：启动 2s 后自动聚焦末尾
/// 输入框 → 弹出角色快捷浮层，验证用）
bool kSearchPopTest = false;

/// 搜索框纯悬停测试开关（--search-hover：启动 2s 后强制所有输入框
/// hover 态（不聚焦）——验证 hover 时输入框高度/背景）
bool kSearchHoverTest = false;

/// FAB 抽屉默认展开测试开关（--fab-open：下载页 FAB drawer 初始展开）
bool kFabOpenTest = false;

/// 角色列表浮窗自动打开测试开关（--char-list：启动 2s 后自动打开
/// 角色列表弹窗，遮罩验证用）
bool kCharListTest = false;

/// 主页自动滚动测试开关（--scroll-test：启动 3s 后主页视频墙
/// jumpTo(300)——验证悬浮导航 is-scrolled 阴影）
bool kScrollTest = false;

/// 盒模型调试开关（--debug-paint：debugPaintSizeEnabled = true，
/// 所有 RenderBox 绘制蓝色布局边界/间距标记——查看盒模型用）
bool kDebugPaint = false;

/// 取 --name=value / --name value 形式的参数值（无则 null）
String? _argValue(List<String> args, String name) {
  for (var i = 0; i < args.length; i++) {
    final a = args[i];
    if (a == name && i + 1 < args.length) return args[i + 1];
    if (a.startsWith('$name=')) return a.substring(name.length + 1);
  }
  return null;
}

Future<void> main(List<String> args) async {
  WidgetsFlutterBinding.ensureInitialized();
  // 错误日志（debug 定位用）
  FlutterError.onError = (details) {
    try {
      File('vshell_error.log').writeAsStringSync(
        '${details.exception}\n${details.toString()}\n---\n',
        mode: FileMode.append,
      );
    } catch (_) {}
    FlutterError.presentError(details);
  };
  // Android 壳：inappwebview + assets/web（无窗口管理/虚拟主机）
  if (Platform.isAndroid) {
    await VsStore.instance.init();
    runApp(AndroidShell(source: AcfunSource()));
    return;
  }
  // Web 版前端壳（唯一入口）：整窗 WebView2 显示 web vshell，桥接 Flutter
  // 后端（AcFun 数据源 + VsStore 持久化 + 下载）。
  // 2026-08-28 架构决定：UI 全部走 web userscript，原生 Flutter UI 冻结——
  // lib/ui/ 代码保留作参考（编译但不运行），--native 参数已忽略。
  if (true) {
    // 窗口：1440x900，深色背景；用户需求：不限制窗口最小宽度（移动端适配）
    await windowManager.ensureInitialized();
    const winSize = Size(1440, 900);
    await windowManager.setSize(winSize);
    await windowManager.center();
    // 不用 setBackgroundColor：window_manager 在 Windows 上会走
    // SetWindowCompositionAttribute(ACCENT_ENABLE_GRADIENT) DWM 合成——
    // 点击窗口时 DWM 重合成导致系统标题栏闪动，且窗口背景被 Flutter 场景
    // 与 WebView2 纹理完全覆盖，此调用无视觉作用。
    await windowManager.show();
    await windowManager.focus();
    // 持久化初始化：web 壳启动时把 VsStore 全量状态同步给 JS（__VS_SYNC__），
    // web 版写操作经桥 storeSet/storeDel 落回 VsStore——与原生版共享
    await VsStore.instance.init();
    runApp(
      WebviewShell(
        // 虚拟主机映射（https://app.local → install/web/）：不依赖 http server，
        // 页面/脚本/fixtures 全部由 WebView2 原生映射提供（自包含可分发）
        url: 'https://app.local/app.html?v=0.6.28',
        source: AcfunSource(),
        probeDl: args.contains('--probe-dl'),
        probeAbr: args.contains('--probe-abr'),
        probeNf: args.contains('--probe-nf'),
        fixScope: args.contains('--fix-scope'),
        dsProbe: args.contains('--ds-probe'),
        privProbe: args.contains('--priv-probe'),
        switchProbe: args.contains('--switch-probe'),
        clickChar: args.contains('--click-char'),
        navVideo: _argValue(args, '--nav-video'),
        scrollStress: args.contains('--scroll-stress'),
        storeProbe: args.contains('--store-probe'),
        oomProbe: args.contains('--oom-probe'),
        openSettings: args.contains('--open-settings'),
        settingsDelayProbe: args.contains('--settings-delay-probe'),
        caseProbe: args.contains('--case-probe'),
        navProbe: args.contains('--nav-probe'),
        hlsProbe: args.contains('--hls-probe'),
        srcProbe: args.contains('--src-probe'),
        acfunCheck: args.contains('--acfun-check'),
        setDs: _argValue(args, '--set-ds'),
        netProbe: args.contains('--net-probe'),
        multiProbe: args.contains('--multi-probe'),
        srcEmptyProbe: args.contains('--src-empty-probe'),
        privLockProbe: args.contains('--priv-lock-probe'),
        sectionsProbe: args.contains('--sections-probe'),
        roleNullProbe: args.contains('--role-null-probe'),
        roleContentProbe: args.contains('--role-content-probe'),
        srcEmptyUiProbe: args.contains('--src-empty-ui-probe'),
        ghostProbe: args.contains('--ghost-probe'),
        clearCacheProbe: args.contains('--clear-cache-probe'),
        uiClearCacheProbe: args.contains('--ui-clear-cache-probe'),
        assignSrcProbe: args.contains('--assign-src-probe'),
        roleListProbe: args.contains('--role-list-probe'),
        detailDisabledProbe: args.contains('--detail-disabled-probe'),
        isoAuditProbe: args.contains('--iso-audit-probe'),
        settingsFlashProbe: args.contains('--settings-flash-probe'),
        roleHrefProbe: args.contains('--role-href-probe'),
        srcFeedProbe: args.contains('--srcfeed-probe'),
        roleFeedProbe: args.contains('--role-feed-probe'),
        homeDiagProbe: args.contains('--home-diag-probe'),
      ),
    );
    return;
  }
  // media_kit（libmpv）初始化
  MediaKit.ensureInitialized();
  // 调试直达：--video=<ac号> 参数或 VSHELL_VIDEO 环境变量打开详情页
  String? directVideoId;
  String? directPage; // --page=characters / --page=role:<名> 调试直达
  // feed 全屏自动测试：启动后 3s 自动全屏、6s 后退出，写 vshell_fs.log
  kFeedFsTest = args.contains('--feed-fs-test');
  kSearchPopTest = args.contains('--search-pop');
  kSearchHoverTest = args.contains('--search-hover');
  kFabOpenTest = args.contains('--fab-open');
  kCharListTest = args.contains('--char-list');
  kScrollTest = args.contains('--scroll-test');
  kDebugPaint = args.contains('--debug-paint');
  if (kDebugPaint) debugPaintSizeEnabled = true;
  for (var i = 0; i < args.length; i++) {
    final a = args[i];
    if (a.startsWith('--video=')) {
      directVideoId = a.substring('--video='.length);
    } else if (a == '--video' && i + 1 < args.length) {
      directVideoId = args[i + 1];
    }
    if (a.startsWith('--page=')) {
      directPage = a.substring('--page='.length);
    } else if (a == '--page' && i + 1 < args.length) {
      directPage = args[i + 1];
    }
  }
  directVideoId ??= Platform.environment['VSHELL_VIDEO'];
  // 窗口：1440x900，不限制最小宽度（用户需求：移动端适配）
  await windowManager.ensureInitialized();
  const winSize = Size(1440, 900);
  // 直接设置并显示（waitUntilReadyToShow 事件偶发丢失导致窗口卡在屏外隐藏态）
  await windowManager.setSize(winSize);
  await windowManager.center();
  // 同 web 分支：不用 setBackgroundColor（DWM accent 合成 → 点击时标题栏闪动）
  await windowManager.show();
  await windowManager.focus();

  // 持久化
  await VsStore.instance.init();
  // feed 模式直达（--feed：启动即抖音刷视图，验证用）
  final feedMode = args.contains('--feed');
  // 数据源（AcFun 主源）
  final source = AcfunSource();
  // 服务装配
  SearchCache.instance.load();
  CharactersService.instance.load();
  // 截帧必须走 UI 挂载的 ThumbHost（裸 Player 无渲染上下文，且 libmpv
  // 后台播放会把主窗口最小化/移出屏幕）——thumbFn 在 Shell 挂载前注入，
  // 实际截帧执行时（async 1-2s 后）ThumbHost 已渲染
  LocalVideosService.instance.thumbFn = ThumbHost.capture;
  LocalVideosService.instance.init();
  // ffmpeg 探测（下载合并）
  HlsDownloader.instance.detectFfmpeg();
  // 下载卡 UI 验证数据（--dl-demo：造 3 个演示任务，不真实下载）
  if (args.contains('--dl-demo')) {
    final mgr = DownloadManager.instance;
    void addDemo(String title, String status, double progress) {
      final t = DownloadTask(
        url: 'https://example.com/demo.m3u8',
        title: title,
      );
      t.status = status;
      t.progress = progress;
      if (status == 'done')
        t.savePath = 'C:\\Users\\demo\\Downloads\\$title.mp4';
      if (status == 'failed') t.error = '网络超时，请重试';
      mgr.tasks.add(t);
    }

    addDemo('云涯屋咯~看完一起发财【整活】', 'downloading', 43.5);
    addDemo('成年人都知道怎么选！欢乐八点档-1751', 'done', 100);
    addDemo('猛男往事第一集（片段）', 'failed', 0);
    mgr.notifyListeners();
  }

  runApp(
    VshellApp(
      source: source,
      directVideoId: directVideoId,
      directPage: directPage,
      feedMode: feedMode,
      demoData: args.contains('--demo-data'),
    ),
  );
}

/// WebView2 壳（--webview PoC）：全窗口显示 web 版 vshell。
/// 后续：webMessage 桥接收 window.chrome.webview.postMessage →
/// Flutter 后端（AcFun 数据源/持久化/下载）→ 结果回传 JS。
// FFI 签名（lookupFunction 泛参——native 侧类型 + Dart 侧类型）
typedef _FgWinNative = ffi.Pointer<ffi.Void> Function();
typedef _FgWinDart = ffi.Pointer<ffi.Void> Function();
typedef _PidNative =
    ffi.Uint32 Function(ffi.Pointer<ffi.Void>, ffi.Pointer<ffi.Uint32>);
typedef _PidDart = int Function(ffi.Pointer<ffi.Void>, ffi.Pointer<ffi.Uint32>);
typedef _CurPidNative = ffi.Uint32 Function();
typedef _CurPidDart = int Function();

class WebviewShell extends StatefulWidget {
  final String url;
  final AcfunSource source;
  final bool probeDl; // --probe-dl：启动后自动下载测试视频并轮询事件（验证用）
  final bool probeAbr; // --probe-abr：验证 master ABR（hls.js 加载 blob URL）
  final bool
  probeNf; // --probe-nf：验证 netFetch 返回 {ok,status,text,finalUrl,headers}
  final bool fixScope; // --fix-scope：清理空 .acfun 键 + reload（__VS_SYNC__ 补缺恢复）
  final bool dsProbe; // --ds-probe：数据源作用域键状态快照（dataSource 值+scoped 键）
  final bool privProbe; // --priv-probe：隐私数据源启动规避验证
  final bool switchProbe; // --switch-probe：数据源切换加载遮罩验证
  final bool clickChar; // --click-char：模拟点击导航栏「角色」按钮复现 OOM
  final String? navVideo; // --nav-video=<id>：先导航详情页再复现（对照实验）
  final bool scrollStress; // --scroll-stress：postWebMessage 高频滚动压力测试
  final bool storeProbe; // --store-probe：量化 localStorage 各键大小
  final bool oomProbe; // --oom-probe：OOM 崩前采样（heap/DOM/墙状态 → Dart 落盘）
  final bool openSettings; // --open-settings：启动后打开设置面板（数据源项验证）
  final bool settingsDelayProbe; // --settings-delay-probe：设置改动退出时生效验证
  final bool caseProbe; // --case-probe：角色识别大小写不敏感实测（注入测试角色→matchTitle→清理）
  final bool navProbe; // --nav-probe：移动端导航布局探针（视口宽/actions 容器/computed style）
  final bool hlsProbe; // --hls-probe：m3u8 播放验证（切 hlstest 源 → 详情页 → hls.js 出帧轮询）
  final bool
  srcProbe; // --src-probe：插件注入诊断（sourceLoad 直调 / script 清单 / localStorage）
  final bool acfunCheck; // --acfun-check：切回 acfun 源验证 type:'hls' 播放回归
  final String? setDs; // --set-ds=<id>：启动后切数据源（恢复用户环境用）
  final bool netProbe; // --net-probe：17c 数据源网络链路诊断（mixed content 降级）
  final bool multiProbe; // --multi-probe：多数据源验证（激活集/chips/卡片 data-src 分布/轮转）
  final bool
  srcEmptyProbe; // --src-empty-probe：取消全部数据源 → 主页空态验证（写 src-empty.log）
  final bool privLockProbe; // --priv-lock-probe：隐私源启动取消/手动可加载验证
  final bool sectionsProbe; // --sections-probe：分类按数据源分组验证（写 sections.log）
  final bool
  roleNullProbe; // --role-null-probe：角色页适配器 null 崩溃修复验证（写 role-null.log）
  final bool
  roleContentProbe; // --role-content-probe：角色页内容全源可见验证（写 role-content.log）
  final bool srcEmptyUiProbe; // --src-empty-ui-probe：设置面板取消所有源 → 主页空态（UI 全流程）
  final bool ghostProbe; // --ghost-probe：幽灵卡清理 + 详情 null 防御验证（写 ghost.log）
  final bool
  clearCacheProbe; // --clear-cache-probe：列出并清空全部 searchCache 缓存（写 clear-cache.log）
  final bool
  uiClearCacheProbe; // --ui-clear-cache-probe：设置面板「清除缓存」按钮 UI 全流程（写 ui-clear-cache.log）
  final bool assignSrcProbe; // --assign-src-probe：角色跨源添加语义验证（写 assign-src.log）
  final bool roleListProbe; // --role-list-probe：角色列表只显示激活源并集（写 role-list.log）
  final bool
  detailDisabledProbe; // --detail-disabled-probe：未启用源详情页提示验证（写 detail-disabled.log）
  final bool isoAuditProbe; // --iso-audit-probe：数据隔离审计（写 iso-audit.log）
  final bool
  settingsFlashProbe; // --settings-flash-probe：设置面板闪动修复 + 改数据源回主页验证（写 settings-flash.log）
  final bool
  roleHrefProbe; // --role-href-probe：角色页聚合卡 sourceId 标注修复验证（写 role-href.log）
  final bool
  srcFeedProbe; // --srcfeed-probe：source-feed 数据源层（增量拉取+缓存分片+相对路径）验证（写 srcfeed.log）
  final bool
  roleFeedProbe; // --role-feed-probe：角色页 source-feed 改造（取卡顺序/分片/无播放量降序）验证（写 role-feed.log）
  final bool
  homeDiagProbe; // --home-diag-probe：主页诊断（数据源/17c diag/home 缓存/首页 feed）写 home-diag.log
  const WebviewShell({
    super.key,
    required this.url,
    required this.source,
    this.probeDl = false,
    this.probeAbr = false,
    this.probeNf = false,
    this.fixScope = false,
    this.dsProbe = false,
    this.privProbe = false,
    this.switchProbe = false,
    this.clickChar = false,
    this.navVideo,
    this.scrollStress = false,
    this.storeProbe = false,
    this.oomProbe = false,
    this.openSettings = false,
    this.settingsDelayProbe = false,
    this.caseProbe = false,
    this.navProbe = false,
    this.hlsProbe = false,
    this.srcProbe = false,
    this.acfunCheck = false,
    this.setDs,
    this.netProbe = false,
    this.multiProbe = false,
    this.srcEmptyProbe = false,
    this.privLockProbe = false,
    this.sectionsProbe = false,
    this.roleNullProbe = false,
    this.roleContentProbe = false,
    this.srcEmptyUiProbe = false,
    this.ghostProbe = false,
    this.clearCacheProbe = false,
    this.uiClearCacheProbe = false,
    this.assignSrcProbe = false,
    this.roleListProbe = false,
    this.detailDisabledProbe = false,
    this.isoAuditProbe = false,
    this.settingsFlashProbe = false,
    this.roleHrefProbe = false,
    this.srcFeedProbe = false,
    this.roleFeedProbe = false,
    this.homeDiagProbe = false,
  });

  @override
  State<WebviewShell> createState() => _WebviewShellState();
}

class _WebviewShellState extends State<WebviewShell> with WindowListener {
  final _controller = WebviewController();
  bool _ready = false;
  late final WebBridge _bridge;
  // 下载进度回传节流：taskId → 上次上报进度（变化 <2% 不上报）
  final _dlSent = <String, double>{};

  // ---- IME 焦点抢回（FFI，零 pub 依赖）----
  // 根因：webview_windows 插件为 composition controller 创建 message-only 宿主
  // 窗口（类名 FlutterWebviewMessage，HWND_MESSAGE，webview_windows_plugin.cc:195）
  // ——点击 WebView2 客户区时 Chromium 调 SetForegroundWindow(宿主 hwnd) → 隐藏
  // 消息窗口抢走前台 → 主窗口标题栏失活 → TSF 候选框定位 fallback 屏幕底部
  // （微软 WebView2Feedback #2241 同族问题）。修复：失焦后若前台仍在进程内
  // （即被插件窗口抢走，onWindowBlur 时前台不可能=主窗口自身），恢复主窗口。
  static final ffi.DynamicLibrary _user32 = ffi.DynamicLibrary.open(
    'user32.dll',
  );
  static final ffi.DynamicLibrary _kernel32 = ffi.DynamicLibrary.open(
    'kernel32.dll',
  );
  static final _FgWinDart _getForegroundWindow = _user32
      .lookupFunction<_FgWinNative, _FgWinDart>('GetForegroundWindow');
  static final _PidDart _getWindowThreadProcessId = _user32
      .lookupFunction<_PidNative, _PidDart>('GetWindowThreadProcessId');
  static final _CurPidDart _getCurrentProcessId = _kernel32
      .lookupFunction<_CurPidNative, _CurPidDart>('GetCurrentProcessId');

  @override
  void initState() {
    super.initState();
    _bridge = WebBridge(widget.source);
    DownloadManager.instance.addListener(_onDlChanged);
    windowManager.addListener(this);
    _init();
  }

  @override
  void dispose() {
    windowManager.removeListener(this);
    DownloadManager.instance.removeListener(_onDlChanged);
    _controller.dispose();
    super.dispose();
  }

  /// 窗口失焦：延迟后检查前台是否被插件 message-only 窗口抢走，是则恢复
  @override
  void onWindowBlur() {
    super.onWindowBlur();
    // 等前台切换稳定（SetForegroundWindow 同步，但留余量）
    Future.delayed(const Duration(milliseconds: 120), () {
      if (!mounted) return;
      final fg = _getForegroundWindow();
      if (fg == ffi.nullptr) return;
      final fgPid = malloc<ffi.Uint32>();
      _getWindowThreadProcessId(fg, fgPid);
      final sameProcess = fgPid.value == _getCurrentProcessId();
      malloc.free(fgPid);
      if (!sameProcess) return; // 用户切到其他应用——不抢
      // 前台是本进程的非主窗口（插件 FlutterWebviewMessage 等）——抢回
      windowManager.focus().catchError((_) {});
    });
  }

  /// 下载任务状态/进度 → JS（window.__VS_DL__(id, json)）：
  /// web medl 桥任务（V.medl._bridgeDownload）经 __VS_DL_EVENTS__ 分发
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
            .executeScript(
              "window.__VS_DL__ && window.__VS_DL__('${t.id}','$json');",
            )
            .catchError((_) {});
      }
    }
  }

  Future<void> _init() async {
    try {
      // 环境初始化（共享，仅一次；已初始化会抛 PlatformException——忽略）
      // --force-device-scale-factor=1.5：让 Chromium 内部 DSF 与插件手动设置的
      // RasterizationScale(1.5) 同步——修复 composition 模式下 DPI>100% 时
      // IME 候选框位置错误（微软 WebView2Feedback #2241，open 4 年未修：
      // "position is not multiplied by the scale"）
      try {
        await WebviewController.initializeEnvironment(
          additionalArguments:
              '--force-device-scale-factor=1.5 '
              // 开 CDP 调试端口：外部可反复注入 JS 做诊断（Runtime.evaluate），
              // 不用每次重启应用。remote-allow-origins=* 让 http 端点可被访问
              //（否则 403 Forbidden）。端口绑定 127.0.0.1，仅本机可达。
              '--remote-debugging-port=9222 --remote-allow-origins=*',
        );
      } catch (_) {}
      await _controller.initialize();
      // 背景：页面 body 本身就是 #181818，这里用透明——WebView2 纹理
      // 直接合成到 Flutter 窗口（闪动修复曾改不透明，疑似导致纹理黑屏）
      await _controller.setBackgroundColor(Colors.transparent);
      // 虚拟主机映射：https://app.local/ → install/web/（自包含，无 http server）
      try {
        final webDir = File(Platform.resolvedExecutable).parent.path + '\\web';
        await _controller.addVirtualHostNameMapping(
          'app.local',
          webDir,
          WebviewHostResourceAccessKind.allow,
        );
      } catch (e) {
        debugPrint('[webview] vhost mapping error: $e');
      }
      // 启动同步：Flutter VsStore 全量状态 → 文档创建时注入 __VS_SYNC__，
      // vshell.user.js 的 store mem 初始化后 merge（原生版数据 → web 版）
      try {
        final syncData = VsStore.instance.exportAll();
        if (syncData.isNotEmpty) {
          final syncJs = 'window.__VS_SYNC__ = ${jsonEncode(syncData)};';
          await _controller.addScriptToExecuteOnDocumentCreated(syncJs);
        }
      } catch (e) {
        debugPrint('[webview] sync inject error: $e');
      }
      // 全局错误捕获（document 创建时注入，可捕获后续所有 JS 错误）
      try {
        await _controller.addScriptToExecuteOnDocumentCreated(r"""
window.__VS_ERR__ = null;
window.addEventListener('error', function (e) {
  window.__VS_ERR__ = (e.message || String(e)) + ' @' + ((e.filename || '').split('/').pop() || 'inline') + ':' + e.lineno;
});
window.addEventListener('unhandledrejection', function (e) {
  window.__VS_ERR__ = 'REJ:' + (e.reason && e.reason.message ? e.reason.message : String(e.reason));
});
""");
      } catch (e) {
        debugPrint('[webview] error-capture inject error: $e');
      }
      // JS → Dart 桥：flutter-adapter.js 的 postMessage({id,method,args})
      // 注意：webview_windows 0.4.0 已把消息 JSON 解码成 Map（非 String）
      _controller.webMessage.listen((event) async {
        if (event is! Map) {
          debugPrint('[webview] non-map msg: $event');
          return;
        }
        final req = Map<String, dynamic>.from(event as Map);
        // --oom-probe 采样消息（JS interval → Dart 落盘；渲染进程崩溃
        // 前最后几条采样 = OOM 前瞬间的 heap/DOM/墙状态）
        if (req['t'] == 'probe') {
          try {
            File('oom_probe.log').writeAsStringSync(
              '[${DateTime.now().toIso8601String()}] n=${req['n']} '
              'nodes=${req['nodes']} cards=${req['cards']} '
              'heap=${req['heap']} wallConn=${req['wallConn']}\n',
              mode: FileMode.append,
            );
          } catch (_) {}
          return;
        }
        if (req['id'] == null) {
          debugPrint('[webview] non-bridge msg: $req');
          return;
        }
        final id = req['id'];
        final method = '${req['method']}';
        final args = (req['args'] as List?) ?? const [];
        debugPrint('[webview] ← $method(${args.join(',')})');
        try {
          final result = await _bridge.handle(method, args);
          final js =
              "window.__VS_FLUTTER_RESOLVE__('$id',true,"
              "'${WebBridge.encodeJson(result)}');";
          await _controller.executeScript(js);
        } catch (e) {
          // ${ 插值表达式以 { 开头有解析歧义 → 先算变量再拼接
          final errJson = WebBridge.encodeJson({'err': '$e'});
          final js = "window.__VS_FLUTTER_RESOLVE__('$id',false,'$errJson');";
          await _controller.executeScript(js);
        }
      });
      await _controller.loadUrl(widget.url);
      if (mounted) setState(() => _ready = true);
      debugPrint('[webview] loaded ${widget.url}');
      if (widget.probeDl) _runProbeDl();
      if (widget.probeAbr) _runProbeAbr();
      if (widget.probeNf) _runProbeNf();
      if (widget.fixScope) _runFixScope();
      if (widget.dsProbe) _runDsProbe();
      if (widget.privProbe) _runPrivProbe();
      if (widget.switchProbe) _runSwitchProbe();
      if (widget.clickChar) _runClickChar();
      if (widget.scrollStress) _runScrollStress();
      if (widget.storeProbe) _runStoreProbe();
      if (widget.oomProbe) _runOomProbe();
      if (widget.openSettings) _runOpenSettings();
      if (widget.settingsDelayProbe) _runSettingsDelayProbe();
      if (widget.caseProbe) _runCaseProbe();
      if (widget.navProbe) _runNavProbe();
      if (widget.hlsProbe) _runHlsProbe();
      if (widget.srcProbe) _runSrcProbe();
      if (widget.multiProbe) _runMultiProbe();
      if (widget.srcEmptyProbe) _runSrcEmptyProbe();
      if (widget.privLockProbe) _runPrivLockProbe();
      if (widget.sectionsProbe) _runSectionsProbe();
      if (widget.roleNullProbe) _runRoleNullProbe();
      if (widget.roleContentProbe) _runRoleContentProbe();
      if (widget.srcEmptyUiProbe) _runSrcEmptyUiProbe();
      if (widget.ghostProbe) _runGhostProbe();
      if (widget.clearCacheProbe) _runClearCacheProbe();
      if (widget.uiClearCacheProbe) _runUiClearCacheProbe();
      if (widget.assignSrcProbe) _runAssignSrcProbe();
      if (widget.roleListProbe) _runRoleListProbe();
      if (widget.detailDisabledProbe) _runDetailDisabledProbe();
      if (widget.isoAuditProbe) _runIsoAuditProbe();
      if (widget.settingsFlashProbe) _runSettingsFlashProbe();
      if (widget.roleHrefProbe) _runRoleHrefProbe();
      if (widget.srcFeedProbe) _runSrcFeedProbe();
      if (widget.roleFeedProbe) _runRoleFeedProbe();
      if (widget.homeDiagProbe) _runHomeDiagProbe();
      if (widget.acfunCheck) _runAcfunCheck();
      if (widget.setDs != null) _runSetDs(widget.setDs!);
      if (widget.netProbe) _runNetProbe();
    } catch (e) {
      debugPrint('[webview] init error: $e');
    }
  }

  /// --hls-probe：m3u8（HLS）播放验证。流程：
  /// 1) V.dataSource.set('hlstest')（localStorage + reload，hlstest 插件已注册）
  /// 2) hash 导航详情页 #/video/hl-1（17c 同形态：type:'url' m3u8 直链）
  /// 3) 轮询 hls.js 出帧状态（Hls 全局 / video.currentTime / videoWidth /
  ///    __VS_ERR__）写 hls_probe.log，出帧即 break。
  Future<void> _runHlsProbe() async {
    void log(String s) {
      try {
        File('hls_probe.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    try {
      final prev = await _controller.executeScript(
        "localStorage.getItem('vshell.dataSource') || '(none)'",
      );
      log('prev-ds: $prev');
      await _controller.executeScript(
        "window.VShell.dataSource.set('hlstest');",
      );
      log('ds-set: hlstest');
    } catch (e) {
      log('ds-set err: $e');
      return;
    }
    await Future.delayed(const Duration(seconds: 5));
    try {
      await _controller.executeScript("location.hash = '#/video/hl-1';");
      log('nav: #/video/hl-1');
    } catch (e) {
      log('nav err: $e');
      return;
    }
    for (var i = 0; i < 12; i++) {
      await Future.delayed(const Duration(seconds: 2));
      try {
        final st = await _controller.executeScript("""
(function(){
  try {
    var v = document.querySelector('.vshell-player video') ||
            document.querySelector('.vshell-page-detail video') ||
            document.querySelector('video');
    var d = document.querySelector('.vshell-page-detail');
    var out = {
      hls: typeof Hls !== 'undefined' ? 'yes' : 'no',
      ds: (window.VShell && VShell.dataSource && VShell.dataSource.get) ? VShell.dataSource.get() : '?',
      adapters: (window.VShell && VShell.siteAdapters && VShell.siteAdapters.all)
          ? VShell.siteAdapters.all().map(function (a) { return a.meta.id; }).join(',') : '?',
      platform: !!window.__VS_PLATFORM__,
      detail: !!d,
      pageHtml: d ? d.innerHTML.slice(0, 150).replace(/\\s+/g, ' ') : '',
      src: v ? (v.src ? v.src.slice(0, 80) : '(none/mse)') : 'novideo',
      currentTime: v ? Math.round(v.currentTime * 10) / 10 : -1,
      duration: v ? Math.round(v.duration) : -1,
      videoWidth: v ? v.videoWidth : 0,
      err: window.__VS_ERR__ || ''
    };
    return JSON.stringify(out);
  } catch (e) { return 'ERR ' + e; }
})()
""");
        log('poll[$i]: $st');
        if (RegExp(r'"currentTime":\s*[1-9]').hasMatch(st)) {
          log('PLAYING OK');
          break;
        }
      } catch (e) {
        log('poll[$i] err: $e');
        return;
      }
    }
  }

  /// --src-probe：插件适配器注入诊断。直调 __VS_PLATFORM__.sourceLoad 看
  /// Dart 桥返回，检查当前源 localStorage 与页面 script 来源。
  Future<void> _runSrcProbe() async {
    void log(String s) {
      try {
        File('src_probe.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    try {
      final r1 = await _controller.executeScript("""
(function(){
  var out = {
    ds: localStorage.getItem('vshell.dataSource'),
    platform: !!window.__VS_PLATFORM__,
    scripts: [].map.call(document.querySelectorAll('script'), function (s) {
      return (s.src || 'inline') + (s.src ? '' : ':' + (s.textContent || '').length);
    }).join(' | '),
    adapters: (window.VShell && VShell.siteAdapters && VShell.siteAdapters.all)
        ? VShell.siteAdapters.all().map(function (a) { return a.meta.id; }).join(',') : '?'
  };
  return JSON.stringify(out);
})()
""");
      log('r1: $r1');
      // 两段式：直调 sourceLoad（Promise 异步）
      await _controller.executeScript("""
window.__SRC_RES__ = 'pending';
window.__VS_PLATFORM__.sourceLoad('hlstest').then(function (r) {
  window.__SRC_RES__ = JSON.stringify({ ok: r.ok, len: (r.code || '').length, path: r.path || '', err: r.error || '' });
}).catch(function (e) { window.__SRC_RES__ = 'REJ ' + e; });
""");
      await Future.delayed(const Duration(seconds: 2));
      final r2 = await _controller.executeScript("window.__SRC_RES__");
      log('r2 sourceLoad: $r2');
      // 注入测试（直接执行 hlstest 代码后看 adapters）
      await _controller.executeScript("""
window.__VS_PLATFORM__.sourceLoad('hlstest').then(function (r) {
  if (r && r.ok) {
    try {
      var s = document.createElement('script');
      s.textContent = r.code;
      document.head.appendChild(s);
      s.remove();
      window.__SRC_RES__ = 'injected, adapters now: ' +
        VShell.siteAdapters.all().map(function (a) { return a.meta.id; }).join(',');
    } catch (e) { window.__SRC_RES__ = 'INJ ERR ' + e; }
  } else {
    window.__SRC_RES__ = 'load fail ' + JSON.stringify(r);
  }
}).catch(function (e) { window.__SRC_RES__ = 'REJ2 ' + e; });
""");
      await Future.delayed(const Duration(seconds: 2));
      final r3 = await _controller.executeScript("window.__SRC_RES__");
      log('r3 manual-inject: $r3');
    } catch (e) {
      log('probe err: $e');
    }
  }

  /// --acfun-check：AcFun 回归（桥 getPlayInfo 返回 type:'hls' m3u8 直链 →
  /// detail.js setupPlayer 的 type:'hls' 分支 → player.load → hls.js）。
  Future<void> _runAcfunCheck() async {
    void log(String s) {
      try {
        File(
          'acfun_check.log',
        ).writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    try {
      await _controller.executeScript("window.VShell.dataSource.set('acfun');");
      log('ds-set: acfun');
    } catch (e) {
      log('ds-set err: $e');
      return;
    }
    await Future.delayed(const Duration(seconds: 2));
    try {
      final v = await _controller.executeScript("""
(function(){
  return JSON.stringify({
    store: VShell.store.get('dataSource'),
    ls: localStorage.getItem('vshell.dataSource'),
    navs: performance.getEntriesByType('navigation').length,
    hash: location.hash.slice(0, 30)
  });
})()
""");
      log('verify after set: $v');
    } catch (e) {
      log('verify err: $e');
    }
    await Future.delayed(const Duration(seconds: 3));
    try {
      await _controller.executeScript("location.hash = '#/video/48800003';");
      log('nav: #/video/48800003');
    } catch (e) {
      log('nav err: $e');
      return;
    }
    for (var i = 0; i < 12; i++) {
      await Future.delayed(const Duration(seconds: 3));
      try {
        final st = await _controller.executeScript("""
(function(){
  try {
    var v = document.querySelector('.vshell-page-detail video') || document.querySelector('video');
    var out = {
      ds: (window.VShell && VShell.store && VShell.store.get) ? VShell.store.get('dataSource') : '?',
      ls: localStorage.getItem('vshell.dataSource'),
      hash: location.hash.slice(0, 40),
      detail: !!document.querySelector('.vshell-page-detail'),
      title: (document.querySelector('.vshell-detail-title') || {}).textContent || '',
      src: v ? (v.src ? v.src.slice(0, 80) : '(none/mse)') : 'novideo',
      currentTime: v ? Math.round(v.currentTime * 10) / 10 : -1,
      duration: v ? Math.round(v.duration) : -1,
      videoWidth: v ? v.videoWidth : 0,
      err: window.__VS_ERR__ || ''
    };
    return JSON.stringify(out);
  } catch (e) { return 'ERR ' + e; }
})()
""");
        log('poll[$i]: $st');
        if (RegExp(r'"currentTime":\s*[1-9]').hasMatch(st)) {
          log('ACFUN PLAYING OK');
          break;
        }
      } catch (e) {
        log('poll[$i] err: $e');
        return;
      }
    }
  }

  /// --set-ds=<id>：启动后切数据源并保持（恢复用户环境；set 内部持久化）
  Future<void> _runSetDs(String id) async {
    await Future.delayed(const Duration(seconds: 4));
    try {
      await _controller.executeScript(
        "window.VShell.dataSource.set('$id'); setTimeout(function(){ location.reload(); }, 400);",
      );
      debugPrint('[probe] set-ds: $id');
    } catch (e) {
      debugPrint('[probe] set-ds err: $e');
    }
  }

  /// --net-probe：17c 数据源网络链路诊断。手动 V.net.fetch 17c 的 http 接口
  /// （https://app.local 页面 → mixed content 拦截 → 应降级 netFetch 桥）。
  Future<void> _runNetProbe() async {
    void log(String s) {
      try {
        File('net_probe.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    try {
      final ls0 = await _controller.executeScript(
        "JSON.stringify({ ls: localStorage.getItem('vshell.dataSource'), all: VShell.siteAdapters.all().map(function(a){return a.meta.id;}).join(','), boot: window.__VS_BOOT__ || '' })",
      );
      log('startup: $ls0');
    } catch (e) {
      log('startup probe err: $e');
    }
    try {
      // 第一段：触发请求（Promise 异步，结果存 window 槽位）
      await _controller.executeScript("""
window.__R__ = 'pending';
V.net.fetch('http://www.spsdcmc.com/v1/vod?page=1&limit=3',
  { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'http://www.spsdcmc.com/' } })
  .then(function (r) {
    window.__R__ = JSON.stringify({ ok: r.ok, status: r.status, len: (r.text || '').length,
      head: (r.text || '').slice(0, 60), finalUrl: r.finalUrl || '' });
  })
  .catch(function (e) { window.__R__ = 'ERR ' + (e && e.message ? e.message : e); });
""");
      await Future.delayed(const Duration(seconds: 4));
      final r1 = await _controller.executeScript("window.__R__");
      log('netFetch(17c vod): $r1');
      // 对比：原生 fetch 直连（应被 mixed content 拦）
      await _controller.executeScript("""
window.__R2__ = 'pending';
fetch('http://www.spsdcmc.com/v1/vod?page=1&limit=3')
  .then(function (r) { window.__R2__ = 'native-ok ' + r.status; })
  .catch(function (e) { window.__R2__ = 'native-ERR ' + (e && e.message ? e.message : e); });
""");
      await Future.delayed(const Duration(seconds: 3));
      final r2 = await _controller.executeScript("window.__R2__");
      log('native fetch: $r2');
      // AbortSignal 支持检测 + fetchNative 同步抛检测
      await _controller.executeScript("""
window.__R4__ = 'pending';
try {
  var init = { method: 'GET', headers: {}, signal: AbortSignal.timeout(15000) };
  fetch('http://www.spsdcmc.com/v1/vod?page=1&limit=3', init)
    .then(function (r) { window.__R4__ = 'native-with-signal-ok ' + r.status; })
    .catch(function (e) { window.__R4__ = 'native-with-signal-catch ' + (e && e.message ? e.message : e); });
} catch (e) {
  window.__R4__ = 'SYNC-THROW ' + (e && e.message ? e.message : e);
}
""");
      await Future.delayed(const Duration(seconds: 3));
      final r4 = await _controller.executeScript("window.__R4__");
      log('fetch with AbortSignal: $r4');
      // V.net.fetch 包 try/catch（同步抛检测）
      await _controller.executeScript("""
window.__R5__ = 'pending';
try {
  V.net.fetch('http://www.spsdcmc.com/v1/vod?page=1&limit=3',
    { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    .then(function (r) { window.__R5__ = 'resolved ok=' + r.ok + ' status=' + r.status + ' len=' + (r.text || '').length; })
    .catch(function (e) { window.__R5__ = 'rejected ' + (e && e.message ? e.message : e); });
} catch (e) {
  window.__R5__ = 'SYNC-THROW ' + (e && e.message ? e.message : e);
}
""");
      await Future.delayed(const Duration(seconds: 4));
      final r5 = await _controller.executeScript("window.__R5__");
      log('V.net.fetch try/catch: $r5');
      // 直接调 17c 适配器真实方法（17c 源已注入时）——getHomeFeed 全链
      await _controller.executeScript("""
window.__R6__ = 'pending';
var V2 = window.VShell || {};
var found = null;
var all = V2.siteAdapters && V2.siteAdapters.all ? V2.siteAdapters.all() : [];
for (var i = 0; i < all.length; i++) {
  if (all[i].meta && all[i].meta.id === '17c') { found = all[i]; break; }
}
if (!found) { window.__R6__ = 'NO-17c-ADAPTER; all=' + all.map(function (a) { return a.meta.id; }).join(','); }
else {
  var t0 = Date.now();
  found.getHomeFeed(1).then(function (res) {
    window.__R6__ = 'feed-ok items=' + (res && res.items ? res.items.length : '?') + ' hasMore=' + (res && res.hasMore) + ' ms=' + (Date.now() - t0);
  }).catch(function (e) {
    window.__R6__ = 'feed-ERR ' + (e && e.message ? e.message : e) + ' ms=' + (Date.now() - t0);
  });
}
""");
      await Future.delayed(const Duration(seconds: 10));
      final r6 = await _controller.executeScript("window.__R6__");
      log('17c getHomeFeed: $r6');
      // 17c getHomeSections（主页分类）
      await _controller.executeScript("""
window.__R7__ = 'pending';
var V2 = window.VShell || {};
var found = null;
var all = V2.siteAdapters && V2.siteAdapters.all ? V2.siteAdapters.all() : [];
for (var i = 0; i < all.length; i++) {
  if (all[i].meta && all[i].meta.id === '17c') { found = all[i]; break; }
}
if (!found) { window.__R7__ = 'NO-17c'; }
else {
  found.getHomeSections().then(function (s) {
    window.__R7__ = 'sections-ok n=' + (s ? s.length : '?');
  }).catch(function (e) {
    window.__R7__ = 'sections-ERR ' + (e && e.message ? e.message : e);
  });
}
""");
      await Future.delayed(const Duration(seconds: 8));
      final r7 = await _controller.executeScript("window.__R7__");
      log('17c getHomeSections: $r7');
      // sourceLoad('17c') 直调 + 手动注入（看注入执行是否报错）
      await _controller.executeScript("""
window.__R8__ = 'pending';
window.__VS_PLATFORM__.sourceLoad('17c').then(function (r) {
  if (!r || !r.ok) { window.__R8__ = 'load-fail ' + JSON.stringify(r); return; }
  window.__R8__ = 'loaded len=' + (r.code || '').length;
  try {
    var s = document.createElement('script');
    s.textContent = r.code;
    document.head.appendChild(s);
    s.remove();
    window.__R8__ += ' injected, all=' + VShell.siteAdapters.all().map(function (a) { return a.meta.id; }).join(',');
  } catch (e) { window.__R8__ += ' INJ-ERR ' + (e && e.message ? e.message : e); }
}).catch(function (e) { window.__R8__ = 'REJ ' + (e && e.message ? e.message : e); });
""");
      await Future.delayed(const Duration(seconds: 4));
      final r8 = await _controller.executeScript("window.__R8__");
      log('17c sourceLoad+inject: $r8');
      log(
        'pageErr: ${await _controller.executeScript("window.__VS_ERR__ || '(none)'")}',
      );
      // 桥直调 netFetch
      await _controller.executeScript("""
window.__R3__ = 'pending';
window.__VS_PLATFORM__.netFetch('http://www.spsdcmc.com/v1/vod?page=1&limit=3',
  { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
  .then(function (r) { window.__R3__ = JSON.stringify({ ok: r.ok, status: r.status, len: (r.text || '').length }); })
  .catch(function (e) { window.__R3__ = 'ERR ' + (e && e.message ? e.message : e); });
""");
      await Future.delayed(const Duration(seconds: 4));
      final r3 = await _controller.executeScript("window.__R3__");
      log('bridge netFetch: $r3');
    } catch (e) {
      log('probe err: $e');
    }
  }

  /// --multi-probe：多数据源验证——激活源集合/预取窗口/分类 chips 并集/
  /// 卡片 data-src 分布（轮转交替证据）。日志写 multi_probe.log。
  Future<void> _runMultiProbe() async {
    void log(String s) {
      try {
        File(
          'multi_probe.log',
        ).writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    for (var i = 0; i < 8; i++) {
      await Future.delayed(const Duration(seconds: 2));
      try {
        final st = await _controller.executeScript("""
(function(){
  try {
    var V2 = window.VShell || {};
    var chips = [].map.call(document.querySelectorAll('.vshell-section-chip'), function (c) {
      return (c.getAttribute('data-src') || '?') + ':' + (c.textContent || '').slice(0, 12);
    });
    var cards = [].map.call(document.querySelectorAll('.vsc-video-card'), function (c) {
      return c.getAttribute('data-src') || '?';
    });
    var srcs = [];
    var seen = {};
    cards.forEach(function (s) { if (!seen[s]) { seen[s] = true; srcs.push(s); } });
    var out = {
      ms: !!(V2.multisource),
      active: V2.multisource ? V2.multisource.activeSources().join(',') : '?',
      enabled: V2.multisource && V2.multisource.enabled
        ? JSON.stringify(V2.multisource.enabled()) : '?',
      dsReg: (V2.store && V2.store.get) ? JSON.stringify(V2.store.get('dataSources')) : '?',
      priv: (V2.store && V2.store.get) ? JSON.stringify(V2.store.get('privateSources')) : '?',
      k: V2.multisource ? V2.multisource.k() : '?',
      window: V2.multisource ? V2.multisource.windowSize() : '?',
      chips: chips.length,
      chipSrcs: chips.slice(0, 10),
      cards: cards.length,
      cardSrcDist: srcs.join(','),
      cardSeq: cards.slice(0, 16).join(''),
      err: window.__VS_ERR__ || ''
    };
    return JSON.stringify(out);
  } catch (e) { return 'ERR ' + e; }
})()
""");
        log('poll[$i]: $st');
        if (RegExp(r'"cards":\s*[1-9]').hasMatch(st)) break;
      } catch (e) {
        log('poll[$i] err: $e');
        return;
      }
    }
    // 第二段：复合键 href / 角色并集 / 待看并集
    try {
      final r2 = await _controller.executeScript("""
(function(){
  try {
    var V2 = window.VShell || {};
    var hrefs = [].map.call(document.querySelectorAll('.vsc-video-media'), function (a) {
      return a.getAttribute('href') || '';
    }).slice(0, 6);
    var roles = (V2.characters && V2.characters.list) ? V2.characters.list().map(function (c) { return c.name; }) : [];
    var saved = (V2.saved && V2.saved.listWatch) ? V2.saved.listWatch().map(function (x) { return (x.sourceId || '?') + ':' + x.id; }) : [];
    return JSON.stringify({ hrefs: hrefs, roles: roles.slice(0, 10), rolesN: roles.length, watch: saved.slice(0, 8) });
  } catch (e) { return 'ERR ' + e; }
})()
""");
      log('r2 hrefs/roles/watch: $r2');
    } catch (e) {
      log('r2 err: $e');
    }
    // 第三段：待看页并集（导航 → 卡片 data-src 分布）
    try {
      await _controller.executeScript("location.hash = '#/watchlist';");
      await Future.delayed(const Duration(seconds: 3));
      final r3 = await _controller.executeScript("""
(function(){
  var cards = [].map.call(document.querySelectorAll('.vsc-video-card'), function (c) {
    return (c.getAttribute('data-src') || '?') + ':' + (c.getAttribute('data-id') || '');
  }).slice(0, 10);
  var empty = !!document.querySelector('.vshell-empty');
  return JSON.stringify({ cards: cards, empty: empty });
})()
""");
      log('r3 watchlist: $r3');
    } catch (e) {
      log('r3 err: $e');
    }
  }

  /// --probe-dl 端到端验证：getPlayInfo → downloadStart（Flutter 引擎）
  /// → 轮询 __VS_DL_EVENTS__ 事件 → 校验保存文件 → 写 probe_dl.log
  Future<void> _runProbeDl() async {
    void log(String s) {
      try {
        File('probe_dl.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 2));
    final js = """
(async function(){
  var out = {step: 'start'};
  try {
    var tries = 0;
    while (!window.__VSHELL_ADAPTER__ && tries < 60) {
      await new Promise(function (r) { setTimeout(r, 200); });
      tries++;
    }
    if (!window.__VSHELL_ADAPTER__) { out.step = 'ERR:no adapter after ' + tries; window.__PROBE_DL_START__ = out; return JSON.stringify(out); }
    var pi = await window.__VSHELL_ADAPTER__.getPlayInfo('48800003', null);
    out.step = 'gotPlayInfo:' + (pi && pi.url ? pi.url.slice(0, 60) : 'none');
    window.__VS_DL_EVENTS__ = window.__VS_DL_EVENTS__ || {};
    var id = await window.__VSHELL_ADAPTER__.downloadStart({url: pi.url, name: 'probe-dl-test'});
    out.step = 'started:' + id;
    var evs = [];
    window.__VS_DL_EVENTS__[id] = {
      onProgress: function(p){ evs.push('p' + Math.round(p)); },
      onDone: function(){ evs.push('done'); },
      onError: function(e){ evs.push('err:' + (e && e.message)); }
    };
    window.__PROBE_DL__ = { id: id, evs: evs };
    out.step = 'listening';
  } catch (e) { out.step = 'ERR:' + String(e); }
  window.__PROBE_DL_START__ = out;
  return JSON.stringify(out);
})()
""";
    try {
      await _controller.executeScript(js);
    } catch (e) {
      log('inject err: $e');
      return;
    }
    for (var i = 0; i < 45; i++) {
      await Future.delayed(const Duration(seconds: 2));
      try {
        final st = await _controller.executeScript(
          "JSON.stringify({start: window.__PROBE_DL_START__, evs: window.__PROBE_DL__ && window.__PROBE_DL__.evs})",
        );
        if (i % 2 == 0 || st.contains('done') || st.contains('err:')) {
          log('poll[$i] $st');
        }
        if (st.contains('done')) {
          // 校验保存文件存在
          var ok = 'missing';
          try {
            final home = Platform.environment['USERPROFILE'] ?? '';
            final f = File(
              '${home}${Platform.pathSeparator}Downloads${Platform.pathSeparator}probe-dl-test.mp4',
            );
            ok = await f.exists() ? 'EXISTS ${f.lengthSync()}B' : 'missing';
          } catch (_) {}
          log('FINAL done, file: $ok');
          return;
        }
        if (st.contains('err:')) {
          log('FINAL error');
          return;
        }
      } catch (e) {
        log('poll err: $e');
        return;
      }
    }
    log('FINAL timeout');
  }

  /// --probe-nf 验证：netFetch 经 __VS_PLATFORM__ 返回结构
  /// {ok,status,text,finalUrl,headers}——用 http://www.baidu.com（301→https）
  /// 验证 finalUrl 反映重定向后的最终 URL；结果写 nf_probe.log
  Future<void> _runProbeNf() async {
    void log(String s) {
      try {
        File('nf_probe.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 2));
    final js = """
(async function(){
  var out = {step: 'start'};
  try {
    var tries = 0;
    while (!window.__VS_PLATFORM__ && tries < 60) {
      await new Promise(function (r) { setTimeout(r, 200); });
      tries++;
    }
    if (!window.__VS_PLATFORM__ || !window.__VS_PLATFORM__.netFetch) {
      out.step = 'ERR:no platform after ' + tries;
      window.__NF_PROBE__ = out;
      return JSON.stringify(out);
    }
    var r = await window.__VS_PLATFORM__.netFetch('http://www.baidu.com', {timeout: 10000});
    out = {
      step: 'done',
      ok: r && r.ok,
      status: r && r.status,
      hasFinalUrl: !!(r && r.finalUrl),
      finalUrl: r && r.finalUrl,
      headerCount: r && r.headers ? Object.keys(r.headers).length : -1,
      sampleHeaders: r && r.headers ? JSON.stringify(r.headers).slice(0, 160) : null,
      textLen: r && r.text ? r.text.length : 0
    };
  } catch (e) { out.step = 'ERR:' + String(e); }
  window.__NF_PROBE__ = out;
  return JSON.stringify(out);
})()
""";
    try {
      await _controller.executeScript(js);
    } catch (e) {
      log('inject err: $e');
      return;
    }
    for (var i = 0; i < 12; i++) {
      await Future.delayed(const Duration(milliseconds: 2000));
      try {
        final st = await _controller.executeScript(
          'JSON.stringify(window.__NF_PROBE__)',
        );
        log('poll[$i] $st');
        if (st.contains('"step":"done"') || st.contains('ERR:')) return;
      } catch (e) {
        log('poll err: $e');
        return;
      }
    }
    log('FINAL timeout');
  }

  /// --fix-scope 恢复：清理 localStorage 中空的 .acfun 键（迁移事故产物：
  /// 值 "[]"/"{}" ≤2B），然后 reload 页面——store.js 的 __VS_SYNC__ 补缺式
  /// merge 从 Flutter VsStore 快照补齐数据。结果写 fix_scope.log
  Future<void> _runFixScope() async {
    void log(String s) {
      try {
        File('fix_scope.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 3));
    final js = """
(function(){
  var out = {step: 'start', removed: [], kept: {}};
  try {
    var dels = ['characters','videoChars','charConflicts','charManuals',
                'charVideos','charFollows','charRemoved','saved'];
    for (var i = 0; i < dels.length; i++) {
      var k = 'vshell.' + dels[i] + '.acfun';
      var v = null;
      try { v = localStorage.getItem(k); } catch (e) {}
      if (v !== null) {
        var slim = String(v).trim();
        if (slim === '[]' || slim === '{}' || slim.length <= 2) {
          try { localStorage.removeItem(k); } catch (e) {}
          out.removed.push(k + '=' + slim);
        } else {
          out.kept[k] = String(v).slice(0, 60);
        }
      }
    }
    out.step = 'done';
  } catch (e) { out.step = 'ERR:' + String(e); }
  window.__FIX_SCOPE__ = out;
  return JSON.stringify(out);
})()
""";
    try {
      final r = await _controller.executeScript(js);
      log('fix: $r');
    } catch (e) {
      log('fix err: $e');
      return;
    }
    // reload → store.js merge 补缺
    try {
      await _controller.executeScript('location.reload();');
      log('reloaded');
    } catch (e) {
      log('reload err: $e');
      return;
    }
    for (var i = 0; i < 15; i++) {
      await Future.delayed(const Duration(seconds: 2));
      try {
        final st = await _controller.executeScript("""
JSON.stringify({
  syncKeys: window.__VS_SYNC__ ? Object.keys(window.__VS_SYNC__).length : -1,
  chars: (localStorage.getItem('vshell.characters.acfun') || '').slice(0, 80),
  vc: (localStorage.getItem('vshell.videoChars.acfun') || '').slice(0, 80),
  cf: (localStorage.getItem('vshell.charConflicts.acfun') || '').slice(0, 60),
  cv: (localStorage.getItem('vshell.charVideos.acfun') || '').slice(0, 60),
  saved: (localStorage.getItem('vshell.saved.acfun') || '').slice(0, 80)
})""");
        log('poll[$i] $st');
        final c =
            st.contains('"chars":') &&
            (st.contains('行为大赏') || st.contains('name'));
        final n = !st.contains('"chars":""');
        if (c && n && !st.contains('undefined')) {
          log('FINAL restored');
          return;
        }
      } catch (e) {
        log('poll err: $e');
        return;
      }
    }
    log('FINAL timeout');
  }

  /// --priv-probe：隐私数据源启动规避验证——阶段 A：kkav 标隐私 + 设为当前源
  /// → reload 后 dataSource 应自动切 'acfun'；阶段 B：取消隐私 + 设为 kkav
  /// → reload 后应保留 'kkav'。结果写 priv_probe.log
  Future<void> _runPrivProbe() async {
    void log(String s) {
      try {
        File('priv_probe.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 3));
    Future<String> readDs() async {
      try {
        return await _controller.executeScript(
          "localStorage.getItem('vshell.dataSource') || 'null'",
        );
      } catch (_) {
        return 'ERR';
      }
    }

    Future<bool> waitDs(String expect) async {
      for (var i = 0; i < 10; i++) {
        await Future.delayed(const Duration(seconds: 2));
        final v = await readDs();
        log('poll[$i] ds=$v expect=$expect');
        if (v == expect) return true;
      }
      return false;
    }

    // 阶段 A：kkav 标隐私 + 设为当前源 → reload → 应自动切第一个非隐私源
    try {
      await _controller.executeScript("""
(function(){
  var tries = 0;
  var iv = setInterval(function(){
    tries++;
    if (window.VShell && window.VShell.dataSource && window.VShell.dataSource.setPrivate) {
      clearInterval(iv);
      try { VShell.dataSource.setPrivate('kkav', true); } catch (e) {}
      localStorage.setItem('vshell.dataSource', '"kkav"');
      location.reload();
    } else if (tries > 50) { clearInterval(iv); }
  }, 200);
})()
""");
      log('A: kkav marked private + set as current + reload');
    } catch (e) {
      log('A inject err: $e');
      return;
    }
    if (!await waitDs('"acfun"')) {
      log('A FAILED: expected "acfun"');
      return;
    }
    log('A PASS: startup skipped private kkav -> acfun');

    // 阶段 B：取消隐私 + 设为 kkav → reload → 应保留 kkav
    try {
      await _controller.executeScript("""
(function(){
  var tries = 0;
  var iv = setInterval(function(){
    tries++;
    if (window.VShell && window.VShell.dataSource && window.VShell.dataSource.setPrivate) {
      clearInterval(iv);
      try { VShell.dataSource.setPrivate('kkav', false); } catch (e) {}
      localStorage.setItem('vshell.dataSource', '"kkav"');
      location.reload();
    } else if (tries > 50) { clearInterval(iv); }
  }, 200);
})()
""");
      log('B: kkav unmarked + set as current + reload');
    } catch (e) {
      log('B inject err: $e');
      return;
    }
    if (!await waitDs('"kkav"')) {
      log('B FAILED: expected "kkav"');
      return;
    }
    log('B PASS: kkav kept (not private)');

    // 阶段 C：kkav 标隐私 + **真实切换路径**（set() 写会话标记）→ reload
    // → 应**保持 kkav**（手动切换隐私源必须生效；规避仅限冷启动）
    try {
      await _controller.executeScript("""
(function(){
  var tries = 0;
  var iv = setInterval(function(){
    tries++;
    if (window.VShell && window.VShell.dataSource && window.VShell.dataSource.setPrivate) {
      clearInterval(iv);
      try { VShell.dataSource.setPrivate('kkav', true); } catch (e) {}
      try { VShell.dataSource.set('kkav'); } catch (e) {}
      location.reload();
    } else if (tries > 50) { clearInterval(iv); }
  }, 200);
})()
""");
      log('C: kkav private + manual set(kkav) + reload');
    } catch (e) {
      log('C inject err: $e');
      return;
    }
    if (!await waitDs('"kkav"')) {
      log('C FAILED: expected "kkav" (manual switch must win)');
      return;
    }
    log('C PASS: manual switch to private kkav kept after reload');

    // 收尾：取消 kkav 隐私（还原现场；当前源保持 kkav）
    try {
      await _controller.executeScript("""
(function(){
  var tries = 0;
  var iv = setInterval(function(){
    tries++;
    if (window.VShell && window.VShell.dataSource && window.VShell.dataSource.setPrivate) {
      clearInterval(iv);
      try { VShell.dataSource.setPrivate('kkav', false); } catch (e) {}
    } else if (tries > 50) { clearInterval(iv); }
  }, 200);
})()
""");
      log('cleanup: kkav unmarked');
    } catch (e) {
      log('cleanup err: $e');
    }
    log('FINAL PASS');
  }

  /// --switch-probe：数据源切换加载遮罩验证——阶段 1：show('TEST') 静态
  /// 显示（不 reload，供外部截图）→ 阶段 2：写切换标记 + show + reload →
  /// 轮询新页面：遮罩最终无残留（hide 成功）+ 页面正常接管。写 switch_probe.log
  Future<void> _runSwitchProbe() async {
    void log(String s) {
      try {
        File(
          'switch_probe.log',
        ).writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 3));
    // 阶段 1：静态显示遮罩（停留 15s 供外部截图 _r_switch.png）
    try {
      await _controller.executeScript("""
(function(){
  var tries = 0;
  var iv = setInterval(function(){
    tries++;
    if (window.VShell && window.VShell.switchOverlay) {
      clearInterval(iv);
      VShell.switchOverlay.show('正在切换数据源…（TEST）');
    } else if (tries > 50) { clearInterval(iv); }
  }, 200);
})()
""");
      log('S1: overlay shown (static)');
    } catch (e) {
      log('S1 err: $e');
    }
    await Future.delayed(const Duration(seconds: 15));

    // 阶段 2：模拟真实切换（标记 + show + reload）
    try {
      await _controller.executeScript("""
(function(){
  var tries = 0;
  var iv = setInterval(function(){
    tries++;
    if (window.VShell && window.VShell.switchOverlay) {
      clearInterval(iv);
      try { sessionStorage.setItem(VShell.switchOverlay.MARK, '1'); } catch (e) {}
      VShell.switchOverlay.show('正在切换数据源…');
      location.reload();
    } else if (tries > 50) { clearInterval(iv); }
  }, 200);
})()
""");
      log('S2: mark + show + reload');
    } catch (e) {
      log('S2 err: $e');
      return;
    }
    for (var i = 0; i < 12; i++) {
      await Future.delayed(const Duration(seconds: 2));
      try {
        final st = await _controller.executeScript("""
JSON.stringify({
  overlay: (function(){
    var e = document.querySelector('.vshell-switch-overlay');
    if (!e) return 'absent';
    return e.classList.contains('is-shown') ? 'shown' : 'hidden';
  })(),
  app: !!document.querySelector('.vshell-app'),
  html: document.documentElement.className.slice(0, 30)
})""");
        log('poll[$i] $st');
        if (st.contains('"app":true') && st.contains('"overlay":"absent"')) {
          log('FINAL PASS: overlay gone, page taken over');
          return;
        }
        if (st.contains('"overlay":"hidden"') && st.contains('"app":true')) {
          log('FINAL PASS: overlay hidden, page taken over');
          return;
        }
      } catch (e) {
        log('poll err: $e');
        return;
      }
    }
    log('FINAL timeout');
  }

  /// --ds-probe：数据源作用域状态快照——dataSource 值 + 各 scoped 键
  /// （.acfun/.kkav/无后缀残留）首 50 字符 → 写 ds_probe.log
  Future<void> _runDsProbe() async {
    void log(String s) {
      try {
        File('ds_probe.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    final js = """
(function(){
  var out = {ds: null, syncKeys: -1, keys: []};
  try { out.ds = localStorage.getItem('vshell.dataSource'); } catch (e) {}
  try { out.syncKeys = window.__VS_SYNC__ ? Object.keys(window.__VS_SYNC__).length : -1; } catch (e) {}
  try {
    var all = Object.keys(localStorage).filter(function (k) {
      return k.indexOf('vshell.') === 0 && (
        k.indexOf('.acfun') >= 0 || k.indexOf('.kkav') >= 0 ||
        k === 'vshell.characters' || k === 'vshell.saved' ||
        k === 'vshell.watch' || k === 'vshell.fav');
    }).sort();
    for (var i = 0; i < all.length; i++) {
      var v = localStorage.getItem(all[i]) || '';
      out.keys.push(all[i] + '=' + v.slice(0, 50) + (v.length > 50 ? '...(' + v.length + ')' : ''));
    }
  } catch (e) {}
  return JSON.stringify(out);
})()
""";
    try {
      final r = await _controller.executeScript(js);
      log('snapshot: $r');
    } catch (e) {
      log('err: $e');
    }
  }

  /// --probe-abr 验证：getPlayInfo → master 文本检查 → hls.js 加载
  /// blob URL → MANIFEST_PARSED（多档 levels）→ 写 probe_abr.log
  Future<void> _runProbeAbr() async {
    void log(String s) {
      try {
        File('probe_abr.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 3));
    final js = """
(async function(){
  var out = {step: 'start'};
  try {
    var tries = 0;
    while (!window.__VSHELL_ADAPTER__ && tries < 60) {
      await new Promise(function (r) { setTimeout(r, 200); });
      tries++;
    }
    if (!window.__VSHELL_ADAPTER__) { out.step = 'ERR:no adapter'; window.__PROBE_ABR__ = out; return; }
    var pi = await window.__VSHELL_ADAPTER__.getPlayInfo('48800003', null);
    out.masterHasStreamInf = !!(pi.master && pi.master.indexOf('#EXT-X-STREAM-INF') !== -1);
    out.masterLen = pi.master ? pi.master.length : 0;
    out.masterHead = pi.master ? pi.master.slice(0, 160).replace(/\\n/g, '|') : '';
    if (!out.masterHasStreamInf) { out.step = 'ERR:no master'; window.__PROBE_ABR__ = out; return; }
    var blob = URL.createObjectURL(new Blob([pi.master], { type: 'application/vnd.apple.mpegurl' }));
    var hls = new Hls();
    await new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout')); }, 20000);
      hls.on(Hls.Events.ERROR, function (e, d) {
        if (d && d.fatal) { clearTimeout(t); reject(new Error(d.details || 'hls error')); }
      });
      hls.on(Hls.Events.MANIFEST_PARSED, function (e, data) {
        clearTimeout(t);
        resolve({ levels: data.levels.length, firstBw: data.levels[0] ? data.levels[0].bitrate : 0 });
      });
      hls.loadSource(blob);
    });
    out.step = 'parsed';
    out.levels = await new Promise(function (r) { setTimeout(function () { r(null); }, 1); });
    window.__PROBE_ABR__ = out;
  } catch (e) { window.__PROBE_ABR__ = { step: 'ERR:' + String(e) }; }
  return JSON.stringify(window.__PROBE_ABR__);
})()
""";
    try {
      await _controller.executeScript(js);
    } catch (e) {
      log('inject err: $e');
      return;
    }
    for (var i = 0; i < 30; i++) {
      await Future.delayed(const Duration(seconds: 2));
      try {
        final st = await _controller.executeScript(
          "JSON.stringify(window.__PROBE_ABR__ || null)",
        );
        log('poll[$i] $st');
        if (st.contains('parsed') || st.contains('ERR')) return;
      } catch (e) {
        log('poll err: $e');
        return;
      }
    }
    log('FINAL timeout');
  }

  /// --click-char 复现测试：启动后模拟点击导航栏「角色」按钮（用户反馈
  /// 「点击选择角色 → 此页存在问题 Out of Memory」）→ 轮询页面状态写
  /// click_char.log（picker 是否打开 / 错误页 / JS 堆 / location）。
  /// executeScript 抛异常 = 渲染进程已崩溃的直接信号。
  Future<void> _runClickChar() async {
    void log(String s) {
      try {
        File('click_char.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    // 对照实验：--nav-video=<id> 时先导航详情页（主页 destroy 场景——
    // 详情页 notify 只 renderUpRow，不触发主页全墙重建）
    if (widget.navVideo != null) {
      try {
        await _controller.executeScript(
          "location.hash = '#/video/${widget.navVideo}';",
        );
        log('nav: #/video/${widget.navVideo}');
      } catch (e) {
        log('nav inject err: $e');
        return;
      }
      await Future.delayed(const Duration(seconds: 6));
    }
    try {
      final btns = await _controller.executeScript("""
(function(){
  var out = {step: 'start'};
  try {
    var V = window.VShell || {};
    // 1) 导航栏「角色列表」弹窗
    var target = document.querySelector('.vshell-nav-btn[title*="角色"]');
    if (target) target.click();
    out.list = !!document.querySelector('.vshell-char-picker');
    // 2) 关闭
    if (V.charPicker && V.charPicker.close) V.charPicker.close();
    out.closed = !document.querySelector('.vshell-char-picker');
    // 3) conflict 弹窗（详情页角色行同款：12 角色行渲染 + blur backdrop）
    if (V.charPicker && V.charPicker.conflict) {
      V.charPicker.conflict('${widget.navVideo ?? '48800003'}', '冲突测试标题', ['行为大赏', '热门集锦']);
    }
    out.conflict = !!document.querySelector('.vshell-char-picker');
    out.rows = document.querySelectorAll('.vshell-char-picker .vshell-tag-row').length;
    // 4) 点「完成」按钮 = applyAndClose → resolveConflict → persistVideo
    //    （7 键 store.set → localStorage 全量重写 + 桥推送 → Dart 写盘）
    var doneBtn = document.querySelector('.vshell-char-picker .vshell-tag-foot .vshell-btn-primary');
    out.doneBtn = !!doneBtn;
    if (doneBtn) doneBtn.click();
    out.afterDone = !!document.querySelector('.vshell-char-picker');
    out.btns = Array.prototype.slice.call(document.querySelectorAll('.vshell-nav-btn'))
      .map(function(b){ return b.title || ''; });
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('click: $btns');
    } catch (e) {
      log('click inject err: $e');
      return;
    }
    for (var i = 0; i < 15; i++) {
      await Future.delayed(const Duration(seconds: 2));
      try {
        final st = await _controller.executeScript(
          "JSON.stringify({href: location.href, picker: !!document.querySelector('.vshell-char-picker'), errPage: document.body.innerText.slice(0,50), jsHeap: (performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576)+'MB' : 'na')})",
        );
        log('poll[$i] $st');
      } catch (e) {
        log('poll[$i] ERR(renderer down?): $e');
      }
    }
    log('FINAL');
  }

  /// --open-settings：启动后打开设置面板（数据源项验证）→ 写 settings.log：
  /// 面板是否打开、数据源项行数、插件行（sourceList 异步）、添加按钮存在。
  Future<void> _runOpenSettings() async {
    void log(String s) {
      try {
        File('settings.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    try {
      final dom = await _controller.executeScript("""
(function(){
  var V = window.VShell || {};
  var out = {};
  out.vKeys = Object.keys(V).join(',');
  out.ds = (V.dataSource && V.dataSource.get) ? V.dataSource.get() : 'no-ds';
  try {
    var a = V.siteAdapters ? V.siteAdapters.current() : 'no-adapters';
    out.adapter = a ? a.meta.id : 'null';
  } catch (e) { out.adapterErr = String(e); }
  out.hasAdapterGlobal = !!window.__VSHELL_ADAPTER__;
  out.readyState = document.readyState;
  out.bodyKids = document.body.childElementCount;
  out.hasApp = !!document.querySelector('.vshell-app');
  out.navbar = !!document.querySelector('.vshell-navbar');
  out.outlet = !!document.querySelector('.vshell-outlet');
  out.htmlClass = document.documentElement.className;
  out.jsErr = window.__VS_ERR__ || null;
  out.vshellStyle = !!document.getElementById('vshell-style');
  out.lastScriptSrc = document.scripts.length ? document.scripts[document.scripts.length - 1].src : null;
  out.lastScriptLen = document.scripts.length ? (document.scripts[document.scripts.length - 1].textContent || '').length : -1;
  out.boot = window.__BOOT__ || null;
  return JSON.stringify(out);
})()
""");
      log('dom: $dom');
    } catch (e) {
      log('dom inject err: $e');
    }
    try {
      final sp = await SharedPreferences.getInstance();
      final keys = sp.getKeys().where((k) => k.contains('dataSource')).toList();
      log('sp keys(dataSource): $keys');
      // 写读一致性测试
      await sp.setString('vshell.probeDS', '[{"id":"x"}]');
      log('write-read: ${sp.getString('vshell.probeDS')}');
      final direct = await VsStore.instance.get('dataSources');
      log('dart store get dataSources: $direct');
    } catch (e) {
      log('dart store get err: $e');
    }
    try {
      // 两段式：executeScript 不等 Promise → 先注入轮询槽，后读
      await _controller.executeScript(
        "window.__SL = 'pending'; window.__SL_ERR = null; window.__VS_PLATFORM__.sourceList().then(function(l){ window.__SL = l; }).catch(function(e){ window.__SL_ERR = String(e); }); 'started';",
      );
    } catch (e) {
      log('bridge inject err: $e');
    }
    await Future.delayed(const Duration(seconds: 3));
    try {
      final bridge = await _controller.executeScript(
        "JSON.stringify({sl: window.__SL, err: window.__SL_ERR})",
      );
      log('bridge: $bridge');
    } catch (e) {
      log('bridge read err: $e');
    }
    try {
      final st = await _controller.executeScript("""
(function(){
  var out = {step: 'start'};
  try {
    var V = window.VShell || {};
    if (!V.settingsPanel || !V.settingsPanel.open) { out.err = 'no settingsPanel'; return JSON.stringify(out); }
    V.settingsPanel.open();
    out.open = !!document.querySelector('.vshell-settings-modal');
    out.secs = Array.prototype.slice.call(document.querySelectorAll('.vshell-settings-sec'))
      .map(function(s){ return (s.querySelector('.vshell-settings-sec-title')||{}).textContent || ''; });
    out.sources = document.querySelectorAll('.vshell-settings-sources .vshell-radio').length;
    out.sourceTexts = Array.prototype.slice.call(document.querySelectorAll('.vshell-settings-sources .vshell-radio'))
      .map(function(r){ return r.textContent.slice(0, 40); });
    out.checked = (function(){
      var c = document.querySelector('.vshell-settings-sources .vshell-radio.is-checked');
      return c ? c.textContent.slice(0,40) : null;
    })();
    out.addBtn = !!document.querySelector('.vshell-settings-source-add');
    out.platform = !!(window.__VS_PLATFORM__);
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('settings: $st');
    } catch (e) {
      log('settings inject err: $e');
    }
    // 二次采样（异步插件行 sourceList().then 渲染）
    await Future.delayed(const Duration(seconds: 2));
    try {
      final st = await _controller.executeScript(
        "JSON.stringify({rows: document.querySelectorAll('.vshell-settings-sources .vshell-radio').length, texts: Array.prototype.slice.call(document.querySelectorAll('.vshell-settings-sources .vshell-radio')).map(function(r){return r.textContent.slice(0,40);}), checked: (function(){var c=document.querySelector('.vshell-settings-sources .vshell-radio.is-checked'); return c?c.textContent.slice(0,40):null;})()})",
      );
      log('settings2: $st');
      // 热更按钮验证（v0.5.6 用户需求）：插件行 reload 按钮数量 + 图标
      final hr = await _controller.executeScript(
        "JSON.stringify({reloadBtns: document.querySelectorAll('.vshell-settings-source-reload').length, reloadIcon: !!(document.querySelector('.vshell-settings-source-reload .codicon-refresh')), kkavRow: (function(){var r=Array.prototype.slice.call(document.querySelectorAll('.vshell-settings-sources .vshell-radio')).filter(function(x){return x.textContent.indexOf('kkav')>=0;})[0]; return r ? {btns: r.querySelectorAll('button').length, hasReload: !!r.querySelector('.vshell-settings-source-reload'), hasPriv: !!r.querySelector('.vshell-settings-source-priv'), hasDel: !!r.querySelector('.vshell-settings-source-del')} : null;})()})",
      );
      log('hotreload: $hr');
    } catch (e) {
      log('settings2 err: $e');
    }
    // 切换插件源：set('testplug') + ensureLoaded（读文件注入 script）→ reload
    try {
      await _controller.executeScript("""
(function(){
  try {
    var V = window.VShell || {};
    if (!V.dataSource) { window.__SW = {err: 'no dataSource'}; return; }
    V.dataSource.set('acfun');
    window.__SW = {set: 'acfun'};
    setTimeout(function(){ location.reload(); }, 200);
  } catch (e) { window.__SW = {err: String(e)}; }
})()
""");
    } catch (e) {
      log('switch inject err: $e');
    }
    await Future.delayed(const Duration(seconds: 3));
    try {
      final sw = await _controller.executeScript(
        "JSON.stringify({sw: window.__SW, cur: (window.VShell && window.VShell.dataSource) ? window.VShell.dataSource.get() : 'na'})",
      );
      log('switch: $sw');
    } catch (e) {
      log('switch read err: $e');
    }
    log('FINAL');
  }

  /// --settings-delay-probe（v0.5.7 用户需求）：设置改动**退出时生效**验证——
  /// ①点击数据源行只改勾选、页面不 reload；②关闭面板 → 遮罩 + reload；
  /// ③reload 后新页面框架（导航栏）仍在、无 js 错误。写 settings-delay.log。
  /// 数据源行 toggle 两次（净变化为零），不污染用户启用集。
  Future<void> _runSettingsDelayProbe() async {
    void log(String s) {
      try {
        File(
          'settings-delay.log',
        ).writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    var s1 = '';
    try {
      s1 = await _controller.executeScript("""
(function(){
  var out = {};
  window.__SDP = 'alive';   // reload 哨兵（reload 后此标记消失）
  var V = window.VShell || {};
  // render() 重建行后旧元素失效 → 每次按文本重新定位
  function findRow(key) {
    var rows = Array.prototype.slice.call(
      document.querySelectorAll('.vshell-settings-sources .vshell-radio'));
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].textContent.indexOf(key) >= 0) return rows[i];
    }
    return null;
  }
  try {
    if (!V.settingsPanel || !V.settingsPanel.open) { out.err = 'no settingsPanel'; return JSON.stringify(out); }
    V.settingsPanel.open();
    var rows = Array.prototype.slice.call(
      document.querySelectorAll('.vshell-settings-sources .vshell-radio'));
    out.rows = rows.length;
    out.hint = !!document.querySelector('.vshell-settings-sources-hint');
    if (!rows.length) { out.err = 'no rows'; return JSON.stringify(out); }
    var first = rows[0];
    var key = first.textContent.slice(0, 8);
    var c0 = first.className.indexOf('is-checked') >= 0;
    out.enBefore = (V.multisource && V.multisource.enabled) ? JSON.stringify(V.multisource.enabled()) : null;
    out.kBefore = (V.multisource && V.multisource.k) ? V.multisource.k() : null;
    first.click();                                   // toggle（开→关 / 关→开）
    var cur = findRow(key);
    var c1 = cur ? cur.className.indexOf('is-checked') >= 0 : 'gone';
    out.click1 = {before: c0, after: c1, changed: c0 !== c1,
                  stillAlive: window.__SDP === 'alive'};   // 未立即 reload
    if (cur) cur.click();                            // 还原（净变化为零）
    var cur2 = findRow(key);
    var c2 = cur2 ? cur2.className.indexOf('is-checked') >= 0 : 'gone';
    out.click2 = {restored: c2 === c0,
                  stillAlive: window.__SDP === 'alive'};
    var closeBtn = document.querySelector('.vshell-tag-foot .vshell-btn-primary');
    out.hasClose = !!closeBtn;
    closeBtn.click();                                // 关闭 → dirty → 遮罩 + reload
    out.afterCloseAlive = window.__SDP === 'alive';  // close() 内同步阶段（reload 尚未发生）
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('s1: $s1');
    } catch (e) {
      log('s1 inject err: $e');
    }
    await Future.delayed(const Duration(seconds: 3)); // 等待 dirty reload
    try {
      final s2 = await _controller.executeScript(
        "JSON.stringify({sentinel: window.__SDP || null, boot: window.__BOOT__ || null})",
      );
      log('s2: $s2'); // sentinel null = 页面已 reload ✓
    } catch (e) {
      log('s2 read err: $e');
    }
    await Future.delayed(const Duration(seconds: 4)); // 等新页面 boot
    try {
      final s3 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.readyState = document.readyState;
    out.navbar = !!document.querySelector('.vshell-navbar');
    out.app = !!document.querySelector('.vshell-app');
    out.outlet = !!document.querySelector('.vshell-outlet');
    out.jsErr = window.__VS_ERR__ || null;
    out.boot = window.__BOOT__ || null;
    out.settingsClosed = !document.querySelector('.vshell-settings-modal');
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('s3: $s3');
    } catch (e) {
      log('s3 inject err: $e');
    }
    // 恢复探针前的启用集与 k（s1 已记录；localStorage 立即落盘；不 reload 避免循环）
    try {
      var enBefore = 'null';
      var kBefore = 2.0;
      try {
        final m = jsonDecode(s1) as Map;
        enBefore = (m['enBefore'] is String)
            ? (m['enBefore'] as String)
            : 'null';
        kBefore = (m['kBefore'] is num)
            ? (m['kBefore'] as num).toDouble()
            : 2.0;
      } catch (_) {}
      final s4 = await _controller.executeScript(
        "JSON.stringify({restored:(function(){var V=window.VShell||{};if(!V.multisource)return 'no-ms';"
        "var en = $enBefore;"
        "if(en!==null)V.multisource.setEnabled(en);"
        "V.multisource.setK($kBefore);"
        "return JSON.stringify(V.multisource.enabled());})()})",
      );
      log('s4: $s4');
    } catch (e) {
      log('s4 inject err: $e');
    }
    log('FINAL');
  }

  /// --src-empty-probe（v0.5.7 用户反馈）：取消全部数据源 → 主页空态验证。
  /// ①setEnabled([]) → activeSources() 应为 []（primary 回退 acfun）→ reload；
  /// ②新页面主页应显示空态（无卡片、框架在、无 js 错）；
  /// ③恢复原启用集 → reload → 卡片回来。写 src-empty.log。
  Future<void> _runSrcEmptyProbe() async {
    void log(String s) {
      try {
        File('src-empty.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    var p1 = '';
    try {
      p1 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var V = window.VShell || {};
    if (!V.multisource) { out.err = 'no multisource'; return JSON.stringify(out); }
    out.enBefore = JSON.stringify(V.multisource.enabled());
    V.multisource.setEnabled([]);          // 显式全取消
    out.activeEmpty = JSON.stringify(V.multisource.activeSources());
    out.primary = V.multisource.primary();
    out.k = V.multisource.k();
    // 导航回主页并 reload 应用空集
    V.router.nav('/');
    setTimeout(function(){ location.reload(); }, 300);
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 inject err: $e');
    }
    await Future.delayed(const Duration(seconds: 5)); // 等 reload + 新页面渲染
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var V = window.VShell || {};
    out.active = JSON.stringify(V.multisource.activeSources());
    out.empty = !!document.querySelector('.vshell-empty');
    out.emptyText = (function(){var e=document.querySelector('.vshell-empty'); return e ? e.textContent.slice(0,60) : null;})();
    out.cards = document.querySelectorAll('.vsc-video-card').length;
    out.navbar = !!document.querySelector('.vshell-navbar');
    out.app = !!document.querySelector('.vshell-app');
    out.jsErr = window.__VS_ERR__ || null;
    out.route = location.hash;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 inject err: $e');
    }
    // 恢复原启用集 → reload → 卡片应回来
    var enBefore = 'null';
    try {
      final m = jsonDecode(p1) as Map;
      if (m['enBefore'] is String) enBefore = m['enBefore'] as String;
    } catch (_) {}
    try {
      final p3 = await _controller.executeScript(
        "JSON.stringify({restored:(function(){var V=window.VShell||{};if(!V.multisource)return 'no-ms';"
        "V.multisource.setEnabled($enBefore);"
        "setTimeout(function(){ location.reload(); }, 300);"
        "return JSON.stringify(V.multisource.enabled());})()})",
      );
      log('p3: $p3');
    } catch (e) {
      log('p3 inject err: $e');
    }
    await Future.delayed(const Duration(seconds: 5));
    try {
      final p4 = await _controller.executeScript(
        "JSON.stringify({active: JSON.stringify((window.VShell&&VShell.multisource)?VShell.multisource.activeSources():null), cards: document.querySelectorAll('.vsc-video-card').length, navbar: !!document.querySelector('.vshell-navbar'), jsErr: window.__VS_ERR__||null})",
      );
      log('p4: $p4');
    } catch (e) {
      log('p4 inject err: $e');
    }
    log('FINAL');
  }

  /// --priv-lock-probe（v0.5.7 用户澄清）：隐私源 = **启动时自动取消加载，
  /// 允许手动加载**验证——①冷启动：enabled 已清洗（不含隐私）、activeSources
  /// 排除隐私；②手动：勾选隐私源（写 skipPrivCheck）→ activeSources 含隐私、
  /// ensureLoaded 允许、设置面板行可勾选。写 priv-lock.log。
  Future<void> _runPrivLockProbe() async {
    void log(String s) {
      try {
        File('priv-lock.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    var p1 = '';
    try {
      p1 = await _controller.executeScript("""
(function(){
  var out = {};
  window.__PL = 'pending';   // ensureLoaded 异步结果哨兵
  try {
    var V = window.VShell || {};
    if (!V.dataSource || !V.multisource) { out.err = 'no ds/ms'; return JSON.stringify(out); }
    out.priv = {};
    ['acfun','bilibili','kkav','testplug','hlstest','17c'].forEach(function(id){
      out.priv[id] = V.dataSource.isPrivate(id);
    });
    // ①冷启动（探针进程 sessionStorage 空）：启动清洗已把隐私源剔出启用集
    window.__PRIV_EN_ORIG = JSON.stringify(V.multisource.enabled() || null);   // 清洗后值（恢复用）
    out.enStart = JSON.stringify(V.multisource.enabled());
    out.activeStart = JSON.stringify(V.multisource.activeSources());
    // ②手动加载：勾选隐私源（写 skipPrivCheck 标记）→ 激活集应含隐私源
    var en = (V.multisource.enabled() || []);
    if (en.indexOf('kkav') < 0) en.push('kkav');
    V.multisource.setEnabled(en);
    try { sessionStorage.setItem('vshell.skipPrivCheck', '1'); } catch (e) {}
    out.activeManual = JSON.stringify(V.multisource.activeSources());
    // 手动加载路径：ensureLoaded(隐私源) → 应允许（true 或注入）
    V.dataSource.ensureLoaded('kkav').then(function(r){ window.__PL = r; });
    // 设置面板：隐私源行应可勾选
    if (V.settingsPanel && V.settingsPanel.open) {
      V.settingsPanel.open();
      out.panel = true;
    } else { out.panel = false; }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 inject err: $e');
    }
    await Future.delayed(const Duration(seconds: 3));
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.ens = window.__PL;
    out.kkavInAdapters = (function(){
      var a=(window.VShell&&VShell.siteAdapters)?VShell.siteAdapters.all():[];
      for(var i=0;i<a.length;i++){ if(a[i].meta&&a[i].meta.id==='kkav') return true; }
      return false;
    })();
    // 设置面板隐私源行：应显示可勾选，点击后勾选态变化（手动加载 UI）
    var rows = Array.prototype.slice.call(
      document.querySelectorAll('.vshell-settings-sources .vshell-radio'));
    var kk = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].textContent.indexOf('kkav') >= 0) { kk = rows[i]; break; }
    }
    out.kkavRow = !!kk;
    if (kk) {
      out.kkavChecked0 = kk.className.indexOf('is-checked') >= 0;
      kk.click();                                    // 手动勾选（已勾则取消）
      var kk2 = null;
      var rows2 = Array.prototype.slice.call(
        document.querySelectorAll('.vshell-settings-sources .vshell-radio'));
      for (var j = 0; j < rows2.length; j++) {
        if (rows2[j].textContent.indexOf('kkav') >= 0) { kk2 = rows2[j]; break; }
      }
      out.kkavChecked1 = kk2 ? kk2.className.indexOf('is-checked') >= 0 : 'gone';
    }
    // 恢复探针前状态：enabled 还原 + 清手动标记（冷启动清洗语义回到起点）
    var V2 = window.VShell || {};
    if (V2.multisource) {
      var orig = __PRIV_EN_ORIG;
      if (orig !== null && orig !== undefined) V2.multisource.setEnabled(JSON.parse(orig));
      try { sessionStorage.removeItem('vshell.skipPrivCheck'); } catch (e) {}
    }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 inject err: $e');
    }
    log('FINAL');
  }

  /// --sections-probe（v0.5.7 用户反馈）：分类**按数据源分多个卡片**验证——
  /// 临时多源环境（enabled=acfun,bilibili,testplug）→ reload → 检查
  /// .vshell-sections-group 数量/标题/组内 chips/无源名后缀 → 恢复原配置。
  /// 写 sections.log。
  Future<void> _runSectionsProbe() async {
    void log(String s) {
      try {
        File('sections.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    var p1 = '';
    try {
      p1 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var V = window.VShell || {};
    if (!V.multisource) { out.err = 'no multisource'; return JSON.stringify(out); }
    out.enBefore = JSON.stringify(V.multisource.enabled());
    V.multisource.setEnabled(['acfun','bilibili','testplug']);   // 多源临时环境
    V.router.nav('/');
    setTimeout(function(){ location.reload(); }, 300);
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 inject err: $e');
    }
    await Future.delayed(const Duration(seconds: 5));
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var V = window.VShell || {};
    out.active = V.multisource ? JSON.stringify(V.multisource.activeSources()) : null;
    var groups = Array.prototype.slice.call(document.querySelectorAll('.vshell-sections-group'));
    out.groupCount = groups.length;
    out.groups = groups.map(function(g){
      return {
        title: ((g.querySelector('.vshell-sections-group-title')||{}).textContent || '').trim(),
        chips: g.querySelectorAll('.vshell-section-chip').length,
        chipTexts: Array.prototype.slice.call(g.querySelectorAll('.vshell-section-chip'))
          .slice(0, 3).map(function(c){ return c.textContent.slice(0, 16); }),
      };
    });
    out.chipHasSrcSuffix = (function(){
      var c = document.querySelector('.vshell-section-chip');
      return c ? !!c.querySelector('.vshell-section-chip-src') : null;
    })();
    // v0.5.7 用户反馈：每个源 = 独立卡片——容器去卡片化、分组自带卡片几何
    var secs = document.querySelector('.vshell-sections');
    var g0 = document.querySelector('.vshell-sections-group');
    if (secs) {
      var cs = getComputedStyle(secs);
      out.secIsMulti = secs.className.indexOf('is-multi') >= 0;
      out.secTransparent = cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent';
      out.secShadowNone = cs.boxShadow === 'none';
    }
    if (g0) {
      var cg = getComputedStyle(g0);
      out.groupHasBg = cg.backgroundColor !== 'rgba(0, 0, 0, 0)' && cg.backgroundColor !== 'transparent';
      out.groupHasShadow = cg.boxShadow !== 'none';
      out.groupHasBorder = cg.borderTopWidth !== '0px';
      out.groupHasRadius = parseFloat(cg.borderTopLeftRadius) >= 6;
    }
    out.jsErr = window.__VS_ERR__ || null;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 inject err: $e');
    }
    // 恢复原启用集
    var enBefore = 'null';
    try {
      final m = jsonDecode(p1) as Map;
      if (m['enBefore'] is String) enBefore = m['enBefore'] as String;
    } catch (_) {}
    try {
      final p3 = await _controller.executeScript(
        "JSON.stringify({restored:(function(){var V=window.VShell||{};if(!V.multisource)return 'no-ms';"
        "V.multisource.setEnabled($enBefore);"
        "setTimeout(function(){ location.reload(); }, 300);"
        "return JSON.stringify(V.multisource.enabled());})()})",
      );
      log('p3: $p3');
    } catch (e) {
      log('p3 inject err: $e');
    }
    log('FINAL');
  }

  /// --role-null-probe（v0.5.7 用户反馈）：角色页「页面加载失败：Cannot read
  /// properties of null (reading 'search')」修复验证——建测试角色 →
  /// patch siteAdapters.current → null（模拟主源适配器不可用）→ 打开角色页
  /// → 应正常渲染（无"页面加载失败"）→ 清理测试角色。写 role-null.log。
  Future<void> _runRoleNullProbe() async {
    void log(String s) {
      try {
        File('role-null.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    try {
      final p1 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var V = window.VShell || {};
    if (!V.characters || !V.siteAdapters) { out.err = 'no api'; return JSON.stringify(out); }
    out.roleName = '测试角色nullprobe';
    // 测试角色（assignTo 会自动建角色条目 + manual 卡数据；fetchAgg 触发聚合搜索）
    V.characters.assignTo({id: 'role-null-test', sourceId: 'testplug', title: out.roleName},
      out.roleName, {title: out.roleName});
    // 模拟主源适配器不可用（修复前 fetchAgg 在此同步抛 TypeError）
    window.__CUR_ORIG = V.siteAdapters.current;
    V.siteAdapters.current = function () { return null; };
    V.router.nav('/role/' + encodeURIComponent(out.roleName));
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 inject err: $e');
    }
    await Future.delayed(const Duration(seconds: 3));
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var V = window.VShell || {};
    out.rolePage = !!document.querySelector('.vshell-role-page');
    out.hasLoadFail = (function(){
      var es = document.querySelectorAll('.vshell-empty');
      for (var i = 0; i < es.length; i++) {
        if (es[i].textContent.indexOf('页面加载失败') >= 0) return true;
      }
      return false;
    })();
    out.emptyText = (function(){var e=document.querySelector('.vshell-empty'); return e ? e.textContent.slice(0,60) : null;})();
    out.jsErr = window.__VS_ERR__ || null;
    // 恢复环境：patch 还原 + 清理测试角色
    if (window.__CUR_ORIG && V.siteAdapters) V.siteAdapters.current = window.__CUR_ORIG;
    if (V.characters) {
      V.characters.unassign('role-null-test', '测试角色nullprobe', 'testplug');
      V.characters.remove('测试角色nullprobe');
    }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 inject err: $e');
    }
    log('FINAL');
  }

  /// --role-content-probe（v0.5.7 用户反馈：角色页不显示/少内容）——
  /// 隐私源（kkav，未激活）里建测试角色 → 角色页应显示其视频快照
  /// （srcIds 全源查询修复）→ 清理。写 role-content.log。
  Future<void> _runRoleContentProbe() async {
    void log(String s) {
      try {
        File(
          'role-content.log',
        ).writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    try {
      final p1 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var V = window.VShell || {};
    if (!V.characters) { out.err = 'no characters'; return JSON.stringify(out); }
    out.roleName = '测试角色内容probe';
    // 角色建在**隐私源 kkav**（未激活——修复前 find/videosOf 查不到）
    var ok = V.characters.assignTo(
      {id: 'role-content-test', sourceId: 'kkav', title: out.roleName},
      out.roleName, {title: out.roleName});
    out.assignOk = ok;
    out.findBefore = !!V.characters.find(out.roleName);
    out.videosBefore = V.characters.videosOf(out.roleName).length;
    V.router.nav('/role/' + encodeURIComponent(out.roleName));
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 inject err: $e');
    }
    await Future.delayed(const Duration(seconds: 3));
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var V = window.VShell || {};
    out.rolePage = !!document.querySelector('.vshell-role-page');
    out.hasLoadFail = (function(){
      var es = document.querySelectorAll('.vshell-empty');
      for (var i = 0; i < es.length; i++) {
        if (es[i].textContent.indexOf('页面加载失败') >= 0) return true;
      }
      return false;
    })();
    out.notExist = (function(){
      var es = document.querySelectorAll('.vshell-empty');
      for (var i = 0; i < es.length; i++) {
        if (es[i].textContent.indexOf('不存在') >= 0) return true;
      }
      return false;
    })();
    out.cards = document.querySelectorAll('.vsc-video-card').length;
    out.cardsText = Array.prototype.slice.call(document.querySelectorAll('.vsc-video-card'))
      .slice(0, 2).map(function(c){ return (c.textContent || '').slice(0, 24); });
    out.jsErr = window.__VS_ERR__ || null;
    // 清理：解除视频关联 + 删除角色（srcOfRole 全源查定位）
    if (V.characters) {
      V.characters.unassign('role-content-test', '测试角色内容probe', 'kkav');
      V.characters.remove('测试角色内容probe');
    }
    V.router.nav('/');
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 inject err: $e');
    }
    log('FINAL');
  }

  /// --src-empty-ui-probe（v0.5.7 用户反馈：取消所有数据源后主页仍显示卡片）
  /// ——完整模拟用户操作：打开设置面板 → 逐个取消所有勾选（UI 点击）→
  /// 关闭（dirty → reload）→ 检查主页空态 → 恢复原配置。写 src-empty-ui.log。
  Future<void> _runSrcEmptyUiProbe() async {
    void log(String s) {
      try {
        File(
          'src-empty-ui.log',
        ).writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    var p1 = '';
    try {
      p1 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var V = window.VShell || {};
    if (!V.settingsPanel || !V.multisource) { out.err = 'no api'; return JSON.stringify(out); }
    window.__EN_BEFORE2 = JSON.stringify(V.multisource.enabled());
    out.enBefore = JSON.stringify(V.multisource.enabled());
    V.settingsPanel.open();
    out.opened = !!document.querySelector('.vshell-settings-modal');
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 inject err: $e');
    }
    // v0.5.7 时序修复：轮询等插件行异步渲染（sourceList 桥），行数稳定再操作
    var rowsReady = '';
    try {
      rowsReady = await _controller.executeScript("""
(function(){
  var V = window.VShell || {};
  var t0 = Date.now();
  var last = -1;
  var stableSince = 0;
  var done = false;
  var timer = setInterval(function () {
    try {
      var n = document.querySelectorAll('.vshell-settings-sources .vshell-radio').length;
      if (n === last) {
        if (!stableSince) stableSince = Date.now();
        if (stableSince && Date.now() - stableSince >= 500) done = true;
      } else { last = n; stableSince = 0; }
    } catch (e) { done = true; }
    if (done || Date.now() - t0 > 8000) {
      clearInterval(timer);
      var rows = Array.prototype.slice.call(
        document.querySelectorAll('.vshell-settings-sources .vshell-radio'));
      window.__ROW_WAIT = JSON.stringify({
        ms: Date.now() - t0,
        rows: rows.length,
        texts: rows.map(function (r) { return r.textContent.slice(0, 14); }),
        checked: rows.filter(function (r) { return r.className.indexOf('is-checked') >= 0; })
                      .map(function (r) { return r.textContent.slice(0, 14); }),
      });
    }
  }, 100);
  return JSON.stringify({ waitStarted: true });
})()
""");
      // 等待轮询完成（最多 9s）
      var waited = 0;
      while (waited < 9000) {
        await Future.delayed(const Duration(milliseconds: 500));
        waited += 500;
        final wr = await _controller.executeScript(
          "JSON.stringify({v: window.__ROW_WAIT || null})",
        );
        if (wr is String && wr.contains('"v":{"ms"')) break;
      }
      rowsReady = await _controller.executeScript(
        "JSON.stringify({v: window.__ROW_WAIT || null})",
      );
      log('rowsReady: $rowsReady');
    } catch (e) {
      log('rowsWait err: $e');
    }
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var V = window.VShell || {};
    // 诊断 A：直调 setEnabled([]) 验证 store 层（UI 之外）
    var testEn = V.multisource.enabled();
    V.multisource.setEnabled([]);
    out.directSet = { before: JSON.stringify(testEn),
                      after: JSON.stringify(V.multisource.enabled()) };
    V.multisource.setEnabled(Array.isArray(testEn) ? testEn : []);
    // 诊断 B：UI 点击（记录点击行）
    var rows = Array.prototype.slice.call(
      document.querySelectorAll('.vshell-settings-sources .vshell-radio'));
    var checked = rows.filter(function (r) { return r.className.indexOf('is-checked') >= 0; });
    out.checkedRows = checked.map(function (r) { return r.textContent.slice(0, 16); });
    if (checked.length) {
      var target = checked[0];
      var v0 = JSON.stringify(V.multisource.enabled());
      var label = target.textContent.slice(0, 16);
      target.click();
      out.uiClick = { row: label, enBefore: v0,
                      enAfter: JSON.stringify(V.multisource.enabled()),
                      rowGone: !document.body.contains(target) };
    }
    out.enNow = JSON.stringify(V.multisource.enabled());
    // 继续取消剩余勾选（全部取消 → 验证主页空态）
    var guard = 0;
    while (guard++ < 12) {
      var rr = Array.prototype.slice.call(
        document.querySelectorAll('.vshell-settings-sources .vshell-radio'));
      var cc = rr.filter(function (r) { return r.className.indexOf('is-checked') >= 0; });
      if (!cc.length) break;
      cc[0].click();
    }
    out.enAll = JSON.stringify(V.multisource.enabled());
    out.checkedLeft = Array.prototype.slice.call(
      document.querySelectorAll('.vshell-settings-sources .vshell-radio'))
      .filter(function (r) { return r.className.indexOf('is-checked') >= 0; }).length;
    // 关闭设置 → dirty → 遮罩 + reload
    var closeBtn = document.querySelector('.vshell-tag-foot .vshell-btn-primary');
    out.hasClose = !!closeBtn;
    closeBtn.click();
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 inject err: $e');
    }
    await Future.delayed(const Duration(seconds: 5)); // reload + 新页面
    // 恢复原配置（reload 后 window 上下文重置——从 Dart 侧持有 p1 值注入；
    // enBefore 为 null（未配置=默认全部）时**不恢复**，避免 setEnabled(null)→[]）
    var enBefore = '';
    try {
      final m = jsonDecode(p1) as Map;
      if (m['enBefore'] is String && m['enBefore'] != 'null') {
        enBefore = m['enBefore'] as String;
      }
    } catch (_) {}
    try {
      final p3 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var V = window.VShell || {};
    out.active = V.multisource ? JSON.stringify(V.multisource.activeSources()) : null;
    out.en = V.multisource ? JSON.stringify(V.multisource.enabled()) : null;
    out.adapterCur = V.siteAdapters ? (function(){ try { var a = V.siteAdapters.current(); return a ? (a.id || 'obj') : 'null'; } catch(e){ return 'throw:'+e; } })() : null;
    out.empty = !!document.querySelector('.vshell-empty');
    out.emptyText = (function(){var e=document.querySelector('.vshell-empty'); return e ? e.textContent.slice(0,140) : null;})();
    out.cards = document.querySelectorAll('.vsc-video-card').length;
    out.pages = document.querySelectorAll('.vshell-page').length;
    out.navbar = !!document.querySelector('.vshell-navbar');
    out.route = location.hash;
    out.jsErr = window.__VS_ERR__ || null;
    // 诊断：testplug 适配器加载状态（current()=null 的根因）
    out.registry = (function(){ try { return JSON.stringify((V.store && V.store.get('dataSources')) || null); } catch(e){ return 'throw:'+e; } })();
    out.platList = (function(){
      try {
        var p = window.__VS_PLATFORM__;
        if (!p || !p.sourceList) return 'no bridge';
        var r = null;
        p.sourceList().then(function (list) { window.__SRCLIST = JSON.stringify(list); });
        return 'pending';
      } catch(e){ return 'throw:'+e; }
    })();
    out.adapterFor = (function(){ try { var a = V.siteAdapters && V.siteAdapters.adapterFor('testplug'); return a ? 'obj' : 'null'; } catch(e){ return 'throw:'+e; } })();
    // 恢复原配置
    if (V.multisource && '$enBefore' !== '') {
      V.multisource.setEnabled($enBefore);
      setTimeout(function(){ location.reload(); }, 300);
    }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p3: $p3');
    } catch (e) {
      log('p3 inject err: $e');
    }
    // p3b：sourceList 桥异步结果（注册表内容）
    await Future.delayed(const Duration(seconds: 2));
    try {
      final p3b = await _controller.executeScript(
        "JSON.stringify({srcList: window.__SRCLIST || null})",
      );
      log('p3b: $p3b');
    } catch (e) {
      log('p3b err: $e');
    }
    // p4：恢复原配置 reload 后——testplug 适配器应加载成功（写穿修复验证）
    await Future.delayed(const Duration(seconds: 4));
    try {
      final p4 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var V = window.VShell || {};
    out.en = V.multisource ? JSON.stringify(V.multisource.enabled()) : null;
    out.adapterFor = (function(){ try { var a = V.siteAdapters && V.siteAdapters.adapterFor('testplug'); return a ? 'obj' : 'null'; } catch(e){ return 'throw:'+e; } })();
    out.cards = document.querySelectorAll('.vsc-video-card').length;
    out.emptyText = (function(){var e=document.querySelector('.vshell-empty'); return e ? e.textContent.slice(0,40) : null;})();
    out.pages = document.querySelectorAll('.vshell-page').length;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p4: $p4');
    } catch (e) {
      log('p4 err: $e');
    }
    log('FINAL');
  }

  /// --ghost-probe（v0.5.7 用户反馈：部分幽灵卡片封面不显示、点进详情崩
  /// "Cannot set properties of null (setting 'sourceId')"）
  /// ——验证：①主页幽灵缓存清理（testplug 空 feed → 缓存清 → 空态）
  /// ②详情 null 防御（testplug 详情 reject → 合理错误提示，非 sourceId 崩）。
  /// 写 ghost.log。
  Future<void> _runGhostProbe() async {
    void log(String s) {
      try {
        File('ghost.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    try {
      final p1 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var V = window.VShell || {};
    out.en = V.multisource ? JSON.stringify(V.multisource.enabled()) : null;
    out.active = V.multisource ? JSON.stringify(V.multisource.activeSources()) : null;
    out.route = location.hash;
    out.cards = document.querySelectorAll('.vsc-video-card').length;
    out.nocover = document.querySelectorAll('.vsc-video-card.is-local-nocover').length;
    out.emptyText = (function(){var e=document.querySelector('.vshell-empty'); return e ? e.textContent.slice(0,50) : null;})();
    out.jsErr = window.__VS_ERR__ || null;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 err: $e');
    }
    // p2：testplug 插件源详情（enabled=[] → 应提示"数据源未启用"而非崩）
    try {
      await _controller.executeScript(
        "location.hash = '#/video/testplug:9001'; 'ok'",
      );
    } catch (e) {
      log('nav err: $e');
    }
    await Future.delayed(const Duration(seconds: 3));
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.route = location.hash;
    out.emptyText = (function(){var e=document.querySelector('.vshell-empty'); return e ? e.textContent.slice(0,80) : null;})();
    out.hasDetailPage = !!document.querySelector('.vshell-page-detail');
    out.jsErr = window.__VS_ERR__ || null;
    out.loadFail = (function(){var e=document.querySelector('.vshell-empty'); return e ? /详情加载失败/.test(e.textContent) : false;})();
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 err: $e');
    }
    // p3：角色页——全源快照卡 + src-disabled 标注（enabled=[] 时插件源卡置灰）
    try {
      final nav3 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var V = window.VShell || {};
    var roles = (V.characters && V.characters.listAll) ? V.characters.listAll() : [];
    out.roles = roles.length;
    if (roles.length) {
      window.__ROLE_TEST = roles[0].name;
      location.hash = '#/role/' + encodeURIComponent(roles[0].name);
    } else {
      // 无角色 → assignTo 建测试角色（kkav 隐私插件源 → src-disabled 应命中）
      var ok = false;
      try {
        if (V.characters && V.characters.assignTo) {
          V.characters.assignTo(
            { id: 'ghost-t1', sourceId: 'kkav', title: '幽灵测试视频' },
            '幽灵测试角色', {});
          ok = true;
        }
      } catch (e2) { out.assignErr = String(e2); }
      out.assigned = ok;
      location.hash = '#/role/' + encodeURIComponent('幽灵测试角色');
    }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p3 nav: $nav3');
    } catch (e) {
      log('p3 err: $e');
    }
    await Future.delayed(const Duration(seconds: 3));
    try {
      final p3 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.route = location.hash;
    out.cards = document.querySelectorAll('.vsc-video-card').length;
    out.srcDisabled = document.querySelectorAll('.vsc-video-card.src-disabled').length;
    out.nocover = document.querySelectorAll('.vsc-video-card.is-local-nocover').length;
    out.jsErr = window.__VS_ERR__ || null;
    // 点击第一张 src-disabled 卡（模拟用户点击）
    var d = document.querySelector('.vsc-video-card.src-disabled');
    if (d) {
      var a = d.querySelector('a.vsc-video-media');
      out.clicked = !!(a && a.href);
      if (a) { location.hash = a.getAttribute('href'); }
    }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p3: $p3');
    } catch (e) {
      log('p3 err: $e');
    }
    // p4：详情页提示（应为"数据源未启用/隐私未加载"，非"视频不存在"）
    await Future.delayed(const Duration(seconds: 3));
    try {
      final p4 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.route = location.hash;
    out.emptyText = (function(){var e=document.querySelector('.vshell-empty'); return e ? e.textContent.slice(0,80) : null;})();
    out.hasDetailPage = !!document.querySelector('.vshell-page-detail');
    out.jsErr = window.__VS_ERR__ || null;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p4: $p4');
    } catch (e) {
      log('p4 err: $e');
    }
    // 回主页
    try {
      await _controller.executeScript("location.hash = '#/'; 'ok'");
    } catch (e) {
      log('back err: $e');
    }
    await Future.delayed(const Duration(seconds: 3));
    try {
      final p5 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.route = location.hash;
    out.cards = document.querySelectorAll('.vsc-video-card').length;
    out.emptyText = (function(){var e=document.querySelector('.vshell-empty'); return e ? e.textContent.slice(0,50) : null;})();
    out.jsErr = window.__VS_ERR__ || null;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p5: $p5');
    } catch (e) {
      log('p5 err: $e');
    }
    log('FINAL');
  }

  /// --iso-audit-probe：数据隔离审计（用户质疑：单源好、多源炸、现在单源也炸，
  /// 怀疑数据隔离问题）。p1 盘点全部 scoped 键内容；p2 现状(enabled=[])；
  /// p3 模拟单源 ['acfun']；p4 模拟多源全开；p5 恢复 enabled=[]。写 iso-audit.log。
  Future<void> _runIsoAuditProbe() async {
    void log(String s) {
      try {
        File('iso-audit.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    String probeJs() {
      return """
(function(){
  var out = {};
  try {
    out.route = location.hash;
    out.active = (window.VShell && VShell.multisource) ? VShell.multisource.activeSources() : 'NO_MS';
    out.primary = (window.VShell && VShell.multisource) ? VShell.multisource.primary() : 'NO_MS';
    out.watchN = (window.VShell && VShell.saved) ? VShell.saved.listWatch().length : -1;
    out.favN = (window.VShell && VShell.saved) ? VShell.saved.listFav().length : -1;
    out.blN = (window.VShell && VShell.blacklist) ? VShell.blacklist.list().length : -1;
    out.charN = (window.VShell && VShell.characters) ? VShell.characters.list().length : -1;
    out.cards = document.querySelectorAll('.vsc-video-card').length;
    out.emptyText = (function(){var e=document.querySelector('.vshell-empty'); return e ? e.textContent.slice(0,40) : null;})();
    out.jsErr = window.__VS_ERR__ || null;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""";
    }

    try {
      await Future.delayed(const Duration(seconds: 8));
      // p1：盘点 scoped 键内容
      try {
        final p1 = await _controller.executeScript("""
(function(){
  var out = {keys: []};
  try {
    var pat = /(saved|blacklist|watched|watch|characters|videoChars|charVideos|charFollows|charRemoved|charManuals|charConflicts|charLocks|searchCache)/;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && pat.test(k)) {
        var raw = localStorage.getItem(k) || '';
        var v = null;
        try { v = JSON.parse(raw); } catch (e) { v = raw; }
        var summary = '';
        if (v && typeof v === 'object' && !Array.isArray(v) && v.watch && v.fav) {
          summary = 'watch:' + v.watch.length + ',fav:' + v.fav.length;
        } else if (Array.isArray(v)) {
          summary = 'n=' + v.length + ' ' + JSON.stringify(v.slice(0, 2)).substring(0, 100);
        } else if (v && typeof v === 'object') {
          summary = 'obj ' + JSON.stringify(v).substring(0, 100);
        } else {
          summary = String(raw).substring(0, 60);
        }
        out.keys.push({ k: k, len: raw.length, s: summary });
      }
    }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
        log('p1: $p1');
      } catch (e) {
        log('p1 err: $e');
      }
      // p2：现状 enabled=[]（用户配置）
      try {
        final p2 = await _controller.executeScript(probeJs());
        log('p2: $p2');
      } catch (e) {
        log('p2 err: $e');
      }
      // p3：模拟单源 ['acfun'] → reload
      await _controller.executeScript(
        "VShell.multisource.setEnabled(['acfun']); location.reload();",
      );
      await Future.delayed(const Duration(seconds: 8));
      try {
        final p3 = await _controller.executeScript(probeJs());
        log('p3: $p3');
      } catch (e) {
        log('p3 err: $e');
      }
      // p4：模拟多源全开 → reload
      await _controller.executeScript(
        "VShell.multisource.setEnabled(['acfun','bilibili','kkav','17c','testplug','hlstest']); location.reload();",
      );
      await Future.delayed(const Duration(seconds: 8));
      try {
        final p4 = await _controller.executeScript(probeJs());
        log('p4: $p4');
      } catch (e) {
        log('p4 err: $e');
      }
      // p5：恢复 enabled=[] → reload
      await _controller.executeScript(
        "VShell.multisource.setEnabled([]); location.reload();",
      );
      await Future.delayed(const Duration(seconds: 8));
      try {
        final p5 = await _controller.executeScript(probeJs());
        log('p5: $p5');
      } catch (e) {
        log('p5 err: $e');
      }
    } catch (e) {
      log('probe err: $e');
    }
    log('FINAL');
  }

  /// --clear-cache-probe（v0.5.7 用户要求：缓存应绑定数据源、未激活的源不该
  /// 有缓存；先列出当前全部缓存再清空验证）。写 clear-cache.log。
  /// 清的是 vshell.searchCache.*（主页/搜索/角色聚合缓存，按源 scopedKey 隔离）；
  /// 用户数据（saved/watched/blacklist/characters 等）不动。
  Future<void> _runClearCacheProbe() async {
    void log(String s) {
      try {
        File(
          'clear-cache.log',
        ).writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    // p1：列出全部 localStorage 键（缓存清单）
    try {
      final p1 = await _controller.executeScript("""
(function(){
  var out = {keys: [], total: 0};
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      var v = localStorage.getItem(k);
      out.keys.push({k: k, len: v ? v.length : 0});
      out.total += v ? v.length : 0;
    }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 err: $e');
    }
    // p2：清缓存——searchCache 全部键（带前缀 + 旧版无前缀）+ 探针残留键
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {removed: [], probeRemoved: [], kept: []};
  try {
    var toDel = [];
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && (k.indexOf('vshell.searchCache') === 0 || k.indexOf('searchCache.') === 0)) {
        toDel.push(k);
        localStorage.removeItem(k);
      }
    }
    out.removed = toDel;
    // 探针残留键（开发期测试写入，非用户数据）——显式列表，避免转义歧义
    var probeNames = ['vshell.t0','vshell.t1','vshell.t2','vshell.t3','vshell.t4','vshell.t5','vshell.t6','vshell.probeDS','vshell.probeDS_zz','vshell.diagTest','vshell.afterTest','vshell.bridgeProbe2','vshell.mem','vshell.shots.gap'];
    for (var j = localStorage.length - 1; j >= 0; j--) {
      var pk = localStorage.key(j);
      if (pk && probeNames.indexOf(pk) >= 0) {
        out.probeRemoved.push(pk);
        localStorage.removeItem(pk);
      }
    }
    var b = window.__VS_STORE_BRIDGE__;
    if (b && b.del) {
      toDel.concat(out.probeRemoved).forEach(function (k) { try { b.del(k); } catch (e) {} });
    }
    for (var m = 0; m < localStorage.length; m++) {
      out.kept.push(localStorage.key(m));
    }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 err: $e');
    }
    // reload 验证
    try {
      await _controller.executeScript("location.reload(); 'ok'");
    } catch (e) {
      log('reload err: $e');
    }
    await Future.delayed(const Duration(seconds: 6));
    try {
      final p3 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.route = location.hash;
    out.cards = document.querySelectorAll('.vsc-video-card').length;
    out.emptyText = (function(){var e=document.querySelector('.vshell-empty'); return e ? e.textContent.slice(0,50) : null;})();
    out.jsErr = window.__VS_ERR__ || null;
    var left = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && (k.indexOf('vshell.searchCache') === 0 || k.indexOf('searchCache.') === 0)) left.push(k);
    }
    out.cacheLeft = left;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p3: $p3');
    } catch (e) {
      log('p3 err: $e');
    }
    // p4：延迟复查——验证是否有残留进程（如提升权限的旧实例）把已删缓存写回
    await Future.delayed(const Duration(seconds: 6));
    try {
      final p4 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var left = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && (k.indexOf('vshell.searchCache') === 0 || k.indexOf('searchCache.') === 0)) left.push(k);
    }
    out.cacheLeft = left;
    out.total = localStorage.length;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p4: $p4');
    } catch (e) {
      log('p4 err: $e');
    }
    log('FINAL');
  }

  /// --ui-clear-cache-probe：设置面板「清除缓存」按钮 UI 全流程验证（用户需求：
  /// 手动清除缓存按钮）。流程：造测试缓存键 → 打开设置面板 → 点按钮两次
  /// （二次确认）→ 断言 searchCache 键全删、用户数据键保留 → reload 后复查
  /// 无复活 + 页面正常。写 ui-clear-cache.log。
  Future<void> _runUiClearCacheProbe() async {
    void log(String s) {
      try {
        File(
          'ui-clear-cache.log',
        ).writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 5));
    // p1：造测试键 + 打开设置面板 + 点按钮（两次：确认态 → 执行）
    try {
      final p1 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    // 造测试缓存键（带前缀 + 无前缀遗留）
    localStorage.setItem('vshell.searchCache.zztest',
      '{"items":[{"id":"zz1","title":"ZZ"}],"pn":1,"hasMore":false,"savedAt":1}');
    localStorage.setItem('searchCache.zzlegacy',
      '{"items":[{"id":"zz2","title":"ZZL"}],"pn":1,"hasMore":false,"savedAt":1}');
    // 造一个真实用户数据键供保留断言（不覆盖已有数据）
    var before = {realCache: 0, savedOk: false};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('vshell.searchCache.') === 0 && k.indexOf('zz') < 0) before.realCache++;
      if (k === 'vshell.saved.acfun') before.savedOk = true;
    }
    out.before = before;
    // 打开设置面板（executeScript 环境无模块闭包 V——用 window.VShell）
    if (window.VShell && window.VShell.settingsPanel && window.VShell.settingsPanel.open) {
      window.VShell.settingsPanel.open();
    }
    var btns = document.querySelectorAll('.vshell-settings-clear-cache');
    out.btnFound = btns.length > 0;
    if (btns.length > 0) {
      var b = btns[0];
      out.btnText0 = b.textContent;
      b.click();   // 第一次：进入确认态
      out.isConfirm1 = b.classList.contains('is-confirm');
      out.btnText1 = b.textContent;
      b.click();   // 第二次：执行清除（同步删键 + toast + 350ms 后 reload）
      out.isConfirm2 = b.classList.contains('is-confirm');
      out.btnText2 = b.textContent;
    }
    // 同步检查删除结果（reload 在 350ms 后才发生，此处不受影响）
    var zzLeft = [], realLeft = [], savedStill = false;
    for (var j = 0; j < localStorage.length; j++) {
      var k2 = localStorage.key(j);
      if (!k2) continue;
      if (k2.indexOf('vshell.searchCache.zz') === 0 || k2.indexOf('searchCache.zz') === 0) zzLeft.push(k2);
      else if (k2.indexOf('vshell.searchCache.') === 0 || k2.indexOf('searchCache.') === 0) realLeft.push(k2);
      if (k2 === 'vshell.saved.acfun') savedStill = true;
    }
    out.zzLeft = zzLeft;
    out.realCacheLeft = realLeft;
    out.savedStill = savedStill;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 err: $e');
    }
    // reload 由按钮触发（350ms 后）——等待页面重建
    await Future.delayed(const Duration(seconds: 7));
    // p2：reload 后复查——测试键无复活、页面正常、用户数据键保留
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var zzLeft = [], savedStill = false, total = 0;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k) continue;
      total++;
      if (k.indexOf('searchCache.zz') >= 0) zzLeft.push(k);
      if (k === 'vshell.saved.acfun') savedStill = true;
    }
    out.zzLeft = zzLeft;
    out.savedStill = savedStill;
    out.total = total;
    out.route = location.hash;
    out.navbar = !!document.querySelector('.vshell-navbar, .vshell-topbar, .vshell-nav');
    out.jsErr = window.__VS_ERR__ || null;
    out.emptyText = (function(){var e=document.querySelector('.vshell-empty'); return e ? e.textContent.slice(0,50) : null;})();
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 err: $e');
    }
    log('FINAL');
  }

  /// --settings-flash-probe：设置面板闪动修复验证（用户反馈：①更改数据源后
  /// 自动回到主页 ②点击数据源按钮后设置浮窗/底下页面闪动）。流程：打开设置
  /// 面板 → 注入 onChange trace → 点击 acfun 行 → 断言 notify 被抑制
  /// （trace==0）、数据源区行数不变（局部 toggle 不重绘）、body 不变（页面
  /// 不重渲染）→ close（dirty → 回 #/ + reload）→ 新页面断言 hash=='#/'、
  /// __VS_SETTINGS_OPEN__ 清除 → 恢复原启用集 → 复查。写 settings-flash.log。
  Future<void> _runSettingsFlashProbe() async {
    void log(String s) {
      try {
        File(
          'settings-flash.log',
        ).writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 5));
    // p0：记录原始启用集
    try {
      final p0 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var m = window.VShell && window.VShell.multisource;
    out.enabledBefore = JSON.stringify(m ? m.enabled() : null);
    out.hash0 = location.hash;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p0: $p0');
    } catch (e) {
      log('p0 err: $e');
    }
    // p1：打开设置面板（同步建 DOM；插件行 sourceList 异步，稍后等）
    try {
      final p1 = await _controller.executeScript("""
(function(){
  try {
    window.VShell.settingsPanel.open();
    return 'opened';
  } catch (e) { return 'open err: ' + String(e); }
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 err: $e');
    }
    await Future.delayed(const Duration(milliseconds: 900));
    // p2：核心断言——注入 trace 监听 → 点击 acfun 行 → 同步检查：
    //  trace==0（notify 被 __VS_SETTINGS_OPEN__ 抑制，页面无重渲染）、
    //  rowsBefore==rowsAfter（局部 toggle 不重绘数据源区，插件行不闪没）、
    //  bodyLen 不变（页面 DOM 未被重渲染）、openFlag==true（标记已设）
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    window.__VS_NOTIFY_TRACE__ = 0;
    if (window.VShell.multisource && window.VShell.multisource.onChange) {
      window.VShell.multisource.onChange(function () { window.__VS_NOTIFY_TRACE__++; });
    }
    out.openFlag = window.__VS_SETTINGS_OPEN__ === true;
    var rows0 = document.querySelectorAll('.vshell-settings-sources .vshell-radio').length;
    var body0 = document.body.innerHTML.length;
    var first = document.querySelector('.vshell-settings-sources .vshell-radio');
    out.rowLabel = first ? first.textContent.trim() : null;
    out.checkedBefore = first ? first.classList.contains('is-checked') : null;
    first.click();
    var rows1 = document.querySelectorAll('.vshell-settings-sources .vshell-radio').length;
    var body1 = document.body.innerHTML.length;
    out.rowsBefore = rows0;
    out.rowsAfter = rows1;
    out.sameRows = rows0 === rows1;
    out.bodyLenBefore = body0;
    out.bodyLenAfter = body1;
    out.sameBody = body0 === body1;
    out.rowToggled = first.classList.contains('is-checked');
    out.traceAfterClick = window.__VS_NOTIFY_TRACE__;
    out.enabledNow = JSON.stringify(window.VShell.multisource.enabled());
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 err: $e');
    }
    // p3：close()（dirty → switchOverlay + 200ms 后回 #/ + reload）
    try {
      final p3 = await _controller.executeScript("""
(function(){
  try {
    window.VShell.settingsPanel.close();
    return 'closed';
  } catch (e) { return 'close err: ' + String(e); }
})()
""");
      log('p3: $p3');
    } catch (e) {
      log('p3 err: $e');
    }
    await Future.delayed(const Duration(seconds: 5));
    // p4：reload 后——hash 应回到 '#/'（用户需求①）、框架在、标记已清除、
    // 启用集应用了 p2 的勾选（中间态，p6 恢复）
    try {
      final p4 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.hash = location.hash;
    out.navbar = !!document.querySelector('.vshell-navbar, .vshell-topbar, .vshell-nav');
    out.openFlag = window.__VS_SETTINGS_OPEN__ === true;
    out.trace = window.__VS_NOTIFY_TRACE__ === undefined ? 'gone' : window.__VS_NOTIFY_TRACE__;
    out.enabled = JSON.stringify(window.VShell.multisource.enabled());
    out.emptyText = (function(){var e=document.querySelector('.vshell-empty'); return e ? e.textContent.slice(0,50) : null;})();
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p4: $p4');
    } catch (e) {
      log('p4 err: $e');
    }
    // p5：恢复原启用集——重新打开设置 → 点击 acfun 行（toggle 回）→ close
    try {
      final p5 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    window.VShell.settingsPanel.open();
    var rows = document.querySelectorAll('.vshell-settings-sources .vshell-radio');
    var target = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].textContent.indexOf('AcFun') >= 0) { target = rows[i]; break; }
    }
    out.found = !!target;
    out.checked = target ? target.classList.contains('is-checked') : null;
    if (target) target.click();
    out.afterClick = target ? target.classList.contains('is-checked') : null;
    window.VShell.settingsPanel.close();
    return JSON.stringify(out);
  } catch (e) { return 'restore err: ' + String(e); }
})()
""");
      log('p5: $p5');
    } catch (e) {
      log('p5 err: $e');
    }
    await Future.delayed(const Duration(seconds: 5));
    // p6：恢复后复查——启用集应等于 p0 原始值
    try {
      final p6 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.hash = location.hash;
    out.enabled = JSON.stringify(window.VShell.multisource.enabled());
    out.jsErr = window.__VS_ERR__ || null;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p6: $p6');
    } catch (e) {
      log('p6 err: $e');
    }
    // p7：恢复原始 enabled 键值（p0 为 null=未配置；点击流程只能增删列表，
    // 不能恢复"未配置"——用 store.del 双删（mem 缓存 + localStorage 落盘）+
    // reload 让启动逻辑重跑）
    try {
      final p7 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.enabledBefore = JSON.stringify(window.VShell.multisource.enabled());
    window.VShell.store.del('enabledSources');
    // 等落盘宏任务执行后再 reload（store.del 的 localStorage 删除是异步的）
    setTimeout(function () { location.reload(); }, 300);
    return JSON.stringify(out);
  } catch (e) { return 'p7 err: ' + String(e); }
})()
""");
      log('p7: $p7');
    } catch (e) {
      log('p7 err: $e');
    }
    await Future.delayed(const Duration(seconds: 4));
    // p8：最终态——enabled 应为 null（未配置=默认全部），主页正常
    try {
      final p8 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.hash = location.hash;
    out.enabled = JSON.stringify(window.VShell.multisource.enabled());
    out.navbar = !!document.querySelector('.vshell-navbar, .vshell-topbar, .vshell-nav');
    out.jsErr = window.__VS_ERR__ || null;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p8: $p8');
    } catch (e) {
      log('p8 err: $e');
    }
    log('FINAL');
  }

  /// --role-href-probe：角色页聚合卡 sourceId 标注修复验证（用户反馈：角色
  /// 主页很多视频卡片点进去「详情加载失败：视频不存在或已失效」）。流程：
  /// 临时建测试角色（关键词"游戏"宽泛触发聚合）→ 导航角色页 → 等聚合 →
  /// 读卡片 data-src/href 分布（断言 noSrc==0、非 local 卡 href 带源前缀）→
  /// 点一张 bilibili 卡 → 读详情页是否正常（修复前必"详情加载失败"）→
  /// 删除测试角色回主页。写 role-href.log。
  Future<void> _runRoleHrefProbe() async {
    void log(String s) {
      try {
        File('role-href.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 5));
    // p0：记录+设置启用集（保证 activeSources 含 acfun/bilibili）→
    // mock 两源 adapter.search（确定性，不依赖网络）→ 建测试角色
    try {
      final p0 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var MS = window.VShell.multisource;
    out.enabledBefore = JSON.stringify(MS.enabled());
    window.__PROBE_EN_BEFORE__ = MS.enabled();
    MS.setEnabled(['acfun', 'bilibili']);
    out.enabledAfter = JSON.stringify(MS.enabled());
    var SA = window.VShell.siteAdapters;
    var ac = SA.adapterFor('acfun');
    if (ac) {
      try { ac.search = function (kw, page) { return Promise.resolve({ items: [
        { id: 'ac-1', title: '游戏测试A1', stat: { view: 300 }, pic: '' },
        { id: 'ac-2', title: '游戏测试A2', stat: { view: 200 }, pic: '' },
        { id: 'ac-3', title: '游戏测试A3', stat: { view: 100 }, pic: '' },
      ], hasMore: false }); }; } catch (e) { out.acMockErr = String(e); }
    }
    var bl = SA.adapterFor('bilibili');
    if (bl) {
      try { bl.search = function (kw, page) { return Promise.resolve({ items: [
        { id: 'bv-1', title: '游戏测试B1', stat: { view: 290 }, pic: '' },
        { id: 'bv-2', title: '游戏测试B2', stat: { view: 190 }, pic: '' },
        { id: 'bv-3', title: '游戏测试B3', stat: { view: 90 }, pic: '' },
      ], hasMore: false }); }; } catch (e) { out.blMockErr = String(e); }
    }
    out.acfunAdapter = !!ac;
    out.biliAdapter = !!bl;
    var C = window.VShell.characters;
    C.add({ name: '聚合探针角色probeagg', keywords: ['游戏'] });
    out.found = !!C.find('聚合探针角色probeagg');
    // v0.5.9：验证调试 toast（wrapDebug 包装 search → 右下角弹 [源] search）
    try {
      var probeA = window.VShell.siteAdapters.adapterFor('bilibili');
      if (probeA && probeA.search) probeA.search('调试词', 1);
      var th = document.querySelector('.vshell-toast-host');
      out.toastText = th ? th.textContent.slice(0, 120) : null;
    } catch (e) { out.toastErr = String(e); }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p0: $p0');
    } catch (e) {
      log('p0 err: $e');
    }
    // p1：导航角色页
    try {
      final p1 = await _controller.executeScript("""
(function(){
  location.hash = '#/role/' + encodeURIComponent('聚合探针角色probeagg');
  return location.hash;
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 err: $e');
    }
    await Future.delayed(const Duration(seconds: 5));
    // p2：读卡片 data-src / href 分布 + 诊断
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.activeSources = JSON.stringify(window.VShell.multisource.activeSources());
    var ac = window.VShell.siteAdapters.adapterFor('acfun');
    out.acSearchIsMock = !!(ac && ac.search && ac.search.toString().indexOf('ac-probe-1') >= 0);
    var bl = window.VShell.siteAdapters.adapterFor('bilibili');
    out.blSearchIsMock = !!(bl && bl.search && bl.search.toString().indexOf('BV-probe-1') >= 0);
    out.cacheHit = window.__VS_ROLE_CACHE_HIT__;
    out.bodyText = document.body.innerText.slice(0, 200);
    var cards = document.querySelectorAll('article.vsc-video-card');
    var total = 0, withSrc = 0, noSrc = 0, prefixed = 0, noPrefix = 0;
    var bySrc = {};
    var order = [];
    for (var i = 0; i < cards.length; i++) {
      total++;
      var src = cards[i].getAttribute('data-src') || '';
      var a = cards[i].querySelector('a.vsc-video-media');
      var href = a ? (a.getAttribute('href') || '') : '';
      var hasPrefix = href.indexOf(':') > 0;
      if (src) withSrc++; else noSrc++;
      if (hasPrefix) prefixed++; else noPrefix++;
      bySrc[src || '(empty)'] = (bySrc[src || '(empty)'] || 0) + 1;
      order.push(cards[i].getAttribute('data-id'));
    }
    out.total = total; out.withSrc = withSrc; out.noSrc = noSrc;
    out.prefixed = prefixed; out.noPrefix = noPrefix; out.bySrc = bySrc;
    out.order = order;
    // v0.5.9：断言缓存键绑定激活源集合（键含 '@acfun,bilibili'）
    var rawCache = null;
    try { rawCache = localStorage.getItem('vshell.searchCache.acfun'); } catch (e) {}
    var parsed = {};
    try { parsed = rawCache ? JSON.parse(rawCache) : {}; } catch (e) {}
    out.cacheKeys = Object.keys(parsed);
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 err: $e');
    }
    // p3：点一张 bilibili 卡（修复前的崩点：src=null → acfun 查 bilibili id）
    try {
      final p3 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var cards = document.querySelectorAll('article.vsc-video-card');
    var target = null;
    // 优先 bilibili 卡（非主源，最能暴露 bug），否则任意非 local 卡
    for (var i = 0; i < cards.length; i++) {
      if ((cards[i].getAttribute('data-src') || '') === 'bilibili') { target = cards[i]; break; }
    }
    if (!target) {
      for (var j = 0; j < cards.length; j++) {
        var s = cards[j].getAttribute('data-src') || '';
        if (s && s !== 'local') { target = cards[j]; break; }
      }
    }
    if (!target) { out.clicked = false; return JSON.stringify(out); }
    var a = target.querySelector('a.vsc-video-media');
    out.clickedSrc = target.getAttribute('data-src');
    out.clickedHref = a ? a.getAttribute('href') : null;
    if (a) a.click();
    out.clicked = true;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p3: $p3');
    } catch (e) {
      log('p3 err: $e');
    }
    await Future.delayed(const Duration(seconds: 2));
    // p4：读详情页路由状态（验证 href → 路由 → src 解析链路）
    try {
      final p4 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.hash = location.hash;
    out.isDetail = location.hash.indexOf('#/video/') === 0;
    var empty = document.querySelector('.vshell-page-detail .vshell-empty');
    out.emptyText = empty ? empty.textContent.slice(0,60) : null;
    out.hasLayout = !!document.querySelector('.vshell-detail-layout');
    out.jsErr = window.__VS_ERR__ || null;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p4: $p4');
    } catch (e) {
      log('p4 err: $e');
    }
    // p5：删除测试角色 + 恢复启用集 + 回主页
    try {
      final p5 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.removed = window.VShell.characters.remove('聚合探针角色probeagg');
    var prev = window.__PROBE_EN_BEFORE__;
    if (prev === null || prev === undefined) {
      window.VShell.store.del('enabledSources');
      out.restored = 'null';
    } else {
      window.VShell.multisource.setEnabled(prev);
      out.restored = JSON.stringify(prev);
    }
    location.hash = '#/';
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p5: $p5');
    } catch (e) {
      log('p5 err: $e');
    }
    log('FINAL');
  }

  /// --srcfeed-probe：source-feed 数据源层验证（增量拉取 + 缓存分片 + 相对路径
  /// + multiwall 轮转混插）。流程：设置多源（acfun+bilibili）→ 导航主页 →
  /// 等首屏 → 断言缓存分片键 vshell.wall.home.<源> 存在、pic 相对路径化、
  /// 卡片 abcabc 交错（拼接处无同源）、净新增插队头 → 恢复启用集。写 srcfeed.log。
  Future<void> _runSrcFeedProbe() async {
    void log(String s) {
      try {
        File('srcfeed.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 5));
    // p1：记录并设置启用集 → 清旧 wall 缓存（确定性验证分片重建）→ 回主页
    try {
      final p1 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var MS = window.VShell.multisource;
    var S = window.VShell.store;
    out.enabledBefore = JSON.stringify(MS.enabled());
    window.__PROBE_EN_BEFORE__ = MS.enabled();
    MS.setEnabled(['acfun', 'bilibili']);
    out.enabledAfter = JSON.stringify(MS.enabled());
    out.active = JSON.stringify(MS.activeSources());
    // 清旧 wall 分片（确定性：确保本次从空缓存冷启动）
    ['wall.home.acfun', 'wall.home.bilibili'].forEach(function (k) {
      try { S.del(k); } catch (e) {}
    });
    out.feedExists = !!(window.VShell.sourceFeed && window.VShell.sourceFeed.create);
    out.mwExists = !!(window.VShell.multiwall && window.VShell.multiwall.create);
    location.hash = '#/';
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 err: $e');
    }
    await Future.delayed(const Duration(seconds: 2));
    // p1b：直接测 acfun/bilibili 适配器 getHomeFeed（排除 multiwall 干扰）
    try {
      final p1b = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var ac = window.VShell.siteAdapters.adapterFor('acfun');
    var bl = window.VShell.siteAdapters.adapterFor('bilibili');
    out.acExists = !!ac;
    out.blExists = !!bl;
    if (ac && ac.getHomeFeed) {
      ac.getHomeFeed(1).then(function (r) {
        window.__PROBE_AC_RES__ = r && r.items ? r.items.length : 'null';
        window.__PROBE_AC_PIC__ = (r && r.items && r.items[0]) ? r.items[0].pic : null;
      }, function (e) {
        window.__PROBE_AC_ERR__ = String(e);
      });
    }
    if (bl && bl.getHomeFeed) {
      bl.getHomeFeed(1).then(function (r) {
        window.__PROBE_BL_RES__ = r && r.items ? r.items.length : 'null';
      }, function (e) {
        window.__PROBE_BL_ERR__ = String(e);
      });
    }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p1b: $p1b');
    } catch (e) {
      log('p1b err: $e');
    }
    await Future.delayed(const Duration(seconds: 6));
    // p2：读卡片交错 + 缓存分片键 + 相对路径
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.acRes = window.__PROBE_AC_RES__ !== undefined ? window.__PROBE_AC_RES__ : 'pending';
    out.acErr = window.__PROBE_AC_ERR__ || null;
    out.acPic = window.__PROBE_AC_PIC__ || null;
    out.blRes = window.__PROBE_BL_RES__ !== undefined ? window.__PROBE_BL_RES__ : 'pending';
    out.blErr = window.__PROBE_BL_ERR__ || null;
    out.active = JSON.stringify(window.VShell.multisource.activeSources());
    out.jsErr = window.__VS_ERR__ || null;
    var cards = document.querySelectorAll('article.vsc-video-card');
    var order = [];
    for (var i = 0; i < cards.length; i++) {
      order.push(cards[i].getAttribute('data-src') || '?');
    }
    out.cardCount = cards.length;
    out.order = order;
    // 拼接处无同源（相邻两卡不同源，除非单源）
    var adjacentSame = 0;
    for (var j = 1; j < order.length; j++) {
      if (order[j] === order[j-1] && order[j] !== '?') adjacentSame++;
    }
    out.adjacentSame = adjacentSame;
    // 缓存分片键
    out.cacheKeys = [];
    for (var l = 0; l < localStorage.length; l++) {
      var k = localStorage.key(l);
      if (k && k.indexOf('vshell.wall.home.') === 0) out.cacheKeys.push(k);
    }
    // 相对路径：读 acfun 分片里 pic 是否已相对化（不以 http 开头）
    out.relPic = null;
    out.absPic = null;
    try {
      var raw = localStorage.getItem('vshell.wall.home.acfun');
      var d = raw ? JSON.parse(raw) : null;
      if (d && d.items && d.items.length) {
        out.cacheBaseUrl = d.baseUrl || '';
        out.cacheItemCount = d.items.length;
        out.relPic = (d.items[0].pic && d.items[0].pic.indexOf('http') !== 0) ? d.items[0].pic : null;
        out.absPic = (d.items[0].pic && d.items[0].pic.indexOf('http') === 0) ? d.items[0].pic : null;
      }
    } catch (e) { out.cacheErr = String(e); }
    // 诊断：mem 态（store.get）vs localStorage 态
    out.memWallHome = null;
    try {
      var mv = window.VShell.store.get('wall.home.acfun');
      out.memWallHome = mv ? (Array.isArray(mv.items) ? mv.items.length : 'no-items') : 'null';
    } catch (e) { out.memErr = String(e); }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 err: $e');
    }
    // p3：恢复启用集
    try {
      final p3 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var prev = window.__PROBE_EN_BEFORE__;
    if (prev === null || prev === undefined) {
      window.VShell.store.del('enabledSources');
      out.restored = 'null';
    } else {
      window.VShell.multisource.setEnabled(prev);
      out.restored = JSON.stringify(prev);
    }
    location.hash = '#/';
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p3: $p3');
    } catch (e) {
      log('p3 err: $e');
    }
    log('FINAL');
  }

  /// --role-feed-probe：角色页 source-feed 改造验证（v0.6.0 用户「任何视频墙
  /// 都这样处理」——角色页聚合放弃播放量降序，改数据源返回顺序 + abcabc
  /// 轮转）。流程：mock acfun/bilibili adapter.search（确定性，不依赖网络）→
  /// 建测试角色（关键词命中 mock 数据）→ 导航角色页 → 读卡片顺序（断言
  /// abcabc 交错、非 view 降序）+ 分片键 + jsErr → 清理。写 role-feed.log。
  Future<void> _runRoleFeedProbe() async {
    void log(String s) {
      try {
        File('role-feed.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 5));
    // p1：mock 两源 adapter.search + 建测试角色 + 导航角色页
    try {
      final p1 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var MS = window.VShell.multisource;
    out.enabledBefore = JSON.stringify(MS.enabled());
    window.__PROBE_EN_BEFORE__ = MS.enabled();
    MS.setEnabled(['acfun', 'bilibili']);
    var SA = window.VShell.siteAdapters;
    // mock：acfun 返回 view 降序（100/90/80）、bilibili 返回 view 降序（95/85/75）
    // 若角色页仍按播放量降序 → 顺序应是 100,95,90,85,80,75；若 abcabc 交错
    // 按数据源返回顺序 → ac1,bv1,ac2,bv2,ac3,bv3（每源内部 view 降序但交错）
    var ac = SA.adapterFor('acfun');
    if (ac) {
      ac.search = function (kw, page) { return Promise.resolve({ items: [
        { id: 'ac-1', title: '角色探针 游戏A1', stat: { view: 100 }, pic: '' },
        { id: 'ac-2', title: '角色探针 游戏A2', stat: { view: 90 }, pic: '' },
        { id: 'ac-3', title: '角色探针 游戏A3', stat: { view: 80 }, pic: '' },
      ], hasMore: false }); };
    }
    var bl = SA.adapterFor('bilibili');
    if (bl) {
      bl.search = function (kw, page) { return Promise.resolve({ items: [
        { id: 'bv-1', title: '角色探针 游戏B1', stat: { view: 95 }, pic: '' },
        { id: 'bv-2', title: '角色探针 游戏B2', stat: { view: 85 }, pic: '' },
        { id: 'bv-3', title: '角色探针 游戏B3', stat: { view: 75 }, pic: '' },
      ], hasMore: false }); };
    }
    out.acExists = !!ac; out.blExists = !!bl;
    // 清旧角色页分片（确定性）
    try { window.VShell.store.del('wall.role.角色探针角色.角色探针'); } catch (e) {}
    var C = window.VShell.characters;
    C.add({ name: '角色探针角色', keywords: ['角色探针'] });
    out.found = !!C.find('角色探针角色');
    window.VShell.router.nav('/role/' + encodeURIComponent('角色探针角色'));
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 err: $e');
    }
    await Future.delayed(const Duration(seconds: 5));
    // p2：读卡片顺序 + 分片键 + jsErr + 清理
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.rolePage = !!document.querySelector('.vshell-role-page');
    out.jsErr = window.__VS_ERR__ || null;
    var cards = document.querySelectorAll('.vshell-role-body .vsc-video-card');
    var order = [];
    for (var i = 0; i < cards.length; i++) {
      order.push(cards[i].getAttribute('data-id'));
    }
    out.cardCount = cards.length;
    out.order = order;
    // 交错断言：ac-1,bv-1,ac-2,bv-2,ac-3,bv-3（abcabc）而非 100,95,90...
    // 分片键
    out.cacheKeys = [];
    for (var l = 0; l < localStorage.length; l++) {
      var k = localStorage.key(l);
      if (k && k.indexOf('vshell.wall.role.') === 0) out.cacheKeys.push(k);
    }
    out.hasLoadFail = (function(){
      var es = document.querySelectorAll('.vshell-empty');
      for (var i = 0; i < es.length; i++) {
        if (es[i].textContent.indexOf('页面加载失败') >= 0) return true;
      }
      return false;
    })();
    // 清理
    var V = window.VShell;
    if (V.characters) V.characters.remove('角色探针角色');
    var prev = window.__PROBE_EN_BEFORE__;
    if (prev === null || prev === undefined) {
      V.store.del('enabledSources');
    } else {
      V.multisource.setEnabled(prev);
    }
    V.router.nav('/');
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 err: $e');
    }
    log('FINAL');
  }

  /// --home-diag-probe：主页诊断（用户要求执行一段控制台诊断脚本——数据源
  /// id / 17c 诊断钩子 / home 搜索缓存 / 首页 feed 首屏）。探针将脚本结果
  /// 写入 home-diag.log，供读取（vshell 是 WebView2 应用，无法直接开控制台，
  /// 只能经 executeScript 注入后写文件）。
  Future<void> _runHomeDiagProbe() async {
    void log(String s) {
      try {
        File('home-diag.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    // 等页面稳定（app.js boot 的 refreshRegistry/onChange 链会触发一次 reload，
    // 5 秒时注入可能正好撞上 reload 窗口 → window 变量被清空 → p2 null）
    await Future.delayed(const Duration(seconds: 12));

    // 诊断脚本封装为 window 函数，p2 丢失时可重跑（reload 后重注入）
    const String diagJs = r'''
(function(){
  var V = window.VShell;
  var out = {};
  out.ds = V.dataSource.get();
  out.diag = window.__VS_17C_DIAG__;
  try {
    var c = V.searchCache.get('home');
    out.cacheHome = c ? {items: c.items.length, pn: c.pn} : null;
  } catch (e) { out.cacheHome = 'ERR:' + e.message; }
  out.cur = (function(){ try { var a = V.siteAdapters.current(); return a ? (a.meta && a.meta.id) || 'adapter' : null; } catch (e) { return 'ERR:' + e.message; } })();
  out.activeSources = (function(){ try { return V.multisource.activeSources(); } catch (e) { return 'ERR:' + e.message; } })();
  out.enabled = (function(){ try { return V.multisource.enabled(); } catch (e) { return 'ERR:' + e.message; } })();
  window.__HOME_DIAG_OUT__ = out;
  window.__HOME_DIAG_DONE__ = false;
  try {
    V.siteAdapters.current().getHomeFeed(1).then(function(r){
      window.__HOME_DIAG_OUT__.feed = {items: r.items.length, hasMore: r.hasMore, first: r.items[0] ? r.items[0].id : null};
      window.__HOME_DIAG_DONE__ = true;
    }).catch(function(e){
      window.__HOME_DIAG_OUT__.feed = 'ERR: ' + (e && e.message || e);
      window.__HOME_DIAG_DONE__ = true;
    });
  } catch (e) {
    window.__HOME_DIAG_OUT__.feed = 'SYNCERR: ' + e.message;
    window.__HOME_DIAG_DONE__ = true;
  }
  return JSON.stringify(out);
})()
''';

    try {
      final p1 = await _controller.executeScript(diagJs);
      log('p1: $p1');
    } catch (e) {
      log('p1 err: $e');
    }
    // 等待异步 getHomeFeed 完成（轮询最多 10 次 × 1s）
    for (var i = 0; i < 10; i++) {
      await Future.delayed(const Duration(seconds: 1));
      try {
        final d = await _controller.executeScript(
          'window.__HOME_DIAG_DONE__ === true ? "done" : "pending"',
        );
        if (d == '"done"') break;
      } catch (_) {}
    }
    try {
      var p2 = await _controller.executeScript(
        'JSON.stringify(window.__HOME_DIAG_OUT__ || null)',
      );
      // reload 丢失兜底：重跑脚本再读（最多 2 次）
      if (p2 == 'null' || p2 == null) {
        for (var r = 0; r < 2 && (p2 == 'null' || p2 == null); r++) {
          await Future.delayed(const Duration(seconds: 3));
          try {
            await _controller.executeScript(diagJs);
          } catch (_) {}
          await Future.delayed(const Duration(seconds: 4));
          try {
            p2 = await _controller.executeScript(
              'JSON.stringify(window.__HOME_DIAG_OUT__ || null)',
            );
          } catch (_) {}
        }
      }
      log('p2: $p2');
    } catch (e) {
      log('p2 err: $e');
    }
    log('FINAL');
  }

  /// --assign-src-probe：角色跨源添加语义验证（用户需求：只有「a 源视频的
  /// 添加角色入口」能触发把 b 源角色 c 登记进 a 源角色列表；无其他路径）。
  /// 流程：hlstest 源建角色 → acfun 视频选该角色 → 断言复制进 acfun 列表且
  /// hlstest 数据不变 → reload 复查持久化 → 清理测试数据。写 assign-src.log。
  Future<void> _runAssignSrcProbe() async {
    void log(String s) {
      try {
        File('assign-src.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 5));
    // p1：跨源添加主流程
    try {
      final p1 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var C = window.VShell.characters;
    var S = window.VShell.store;
    var hlstestBefore = (S.get('characters.hlstest') || []).length;
    // ① 先在 hlstest 源建立角色（模拟 b 源已有角色 c）
    C.assignTo({id: 'srciso-h0', sourceId: 'hlstest', title: 't'}, 'srciso-角色', {});
    // ② a 源（acfun）视频的添加角色入口选择 b 源角色 → 应复制登记进 acfun 列表
    C.assignTo({id: 'srciso-a1', sourceId: 'acfun', title: 't'}, 'srciso-角色', {});
    // ③ 同源：hlstest 视频再赋同角色 → 不重复建（数量 +1 而非 +2）
    C.assignTo({id: 'srciso-h1', sourceId: 'hlstest', title: 't'}, 'srciso-角色', {});
    var hlstestAfter = (S.get('characters.hlstest') || []).length;
    out.hlstestDelta = hlstestAfter - hlstestBefore;   // 期望 1
    out.acfunHas = (S.get('characters.acfun') || [])
      .some(function(x){ return x.name === 'srciso-角色'; });   // 期望 true（复制登记）
    out.acfunKw = (function(){
      var arr = S.get('characters.acfun') || [];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].name === 'srciso-角色') return (arr[i].keywords || []).join(',');
      }
      return null;
    })();   // 期望 'srciso-角色'（关键词复制）
    out.acfunVc = (S.get('videoChars.acfun') || {})['srciso-a1'] || null;   // 期望 'srciso-角色'
    out.hlstestVcA1 = (S.get('videoChars.hlstest') || {})['srciso-a1'] || null;  // 期望 null（不写 b 源）
    out.hlstestVcH1 = (S.get('videoChars.hlstest') || {})['srciso-h1'] || null;  // 期望 'srciso-角色'（同源正常）
    out.getCharA = C.getChar('srciso-a1', 'acfun');    // 期望 'srciso-角色'
    out.getCharH = C.getChar('srciso-h1', 'hlstest');  // 期望 'srciso-角色'
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 err: $e');
    }
    // 等落盘后 reload 验证持久化
    await Future.delayed(const Duration(seconds: 2));
    try {
      await _controller.executeScript("location.reload(); 'ok'");
    } catch (e) {
      log('reload err: $e');
    }
    await Future.delayed(const Duration(seconds: 6));
    // p2：reload 后复查
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.acfunHas = (window.VShell.store.get('characters.acfun') || [])
      .some(function(x){ return x.name === 'srciso-角色'; });
    out.getCharA = window.VShell.characters.getChar('srciso-a1', 'acfun');
    out.acfunVc = (window.VShell.store.get('videoChars.acfun') || {})['srciso-a1'] || null;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 err: $e');
    }
    // p3：清理测试数据（两源角色 + 测试视频赋值痕迹）
    try {
      final p3 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var S = window.VShell.store;
    function scrub(srcId) {
      ['characters','videoChars','charConflicts','charLocks','charManuals',
       'charVideos','charFollows','charRemoved'].forEach(function(b){
        var v = S.get(b + '.' + srcId);
        if (!v) return;
        var dirty = false;
        if (b === 'characters' && Array.isArray(v)) {
          var nx = v.filter(function(x){ return !x || x.name !== 'srciso-角色'; });
          if (nx.length !== v.length) { v = nx; dirty = true; }
        } else if (b === 'charVideos' && typeof v === 'object') {
          if (v['srciso-角色']) { delete v['srciso-角色']; dirty = true; }
        } else if (typeof v === 'object') {
          ['srciso-a1','srciso-h1','srciso-h0'].forEach(function(id){
            if (id in v) { delete v[id]; dirty = true; }
          });
        }
        if (dirty) S.set(b + '.' + srcId, v);
      });
    }
    scrub('acfun');
    scrub('hlstest');
    out.acfunClean = !(S.get('characters.acfun') || [])
      .some(function(x){ return x.name === 'srciso-角色'; });
    out.hlstestClean = !(S.get('characters.hlstest') || [])
      .some(function(x){ return x.name === 'srciso-角色'; });
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p3: $p3');
    } catch (e) {
      log('p3 err: $e');
    }
    log('FINAL');
  }

  /// --role-list-probe：角色列表显示范围验证（用户需求：任何入口——导航
  /// 角色按钮/添加角色/解决冲突/更换角色/角色管理——只显示**当前激活源**
  /// 的角色，多源并集、无数据源为空）。流程：enabled=[] 断言空列表 →
  /// 启用 acfun → reload 断言只含 acfun 源角色（隐私源 kkav 角色不出现）
  /// → UI 弹窗行数一致 → 恢复 enabled=[]。写 role-list.log。
  Future<void> _runRoleListProbe() async {
    void log(String s) {
      try {
        File('role-list.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 5));
    // p1：无数据源（enabled=[]）→ 列表为空
    try {
      final p1 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.enabled = window.VShell.store.get('enabledSources');
    out.listLen = window.VShell.characters.list().length;
    // UI 弹窗（更换角色场景）行数
    window.VShell.charPicker.edit('rlist-ui-1', 't', '更改角色', {}, 'acfun');
    var rows = document.querySelectorAll('.vshell-char-picker .vshell-tag-row').length;
    out.uiRows = rows;
    if (window.VShell.charPicker._close) { try { window.VShell.charPicker._close(); } catch (e) {} }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p1: $p1');
    } catch (e) {
      log('p1 err: $e');
    }
    // p2：启用 acfun → reload
    try {
      await _controller.executeScript(
        "window.VShell.multisource.setEnabled(['acfun']); location.reload(); 'ok'",
      );
    } catch (e) {
      log('p2 set err: $e');
    }
    await Future.delayed(const Duration(seconds: 7));
    try {
      final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var C = window.VShell.characters;
    out.enabled = window.VShell.store.get('enabledSources');
    out.listLen = C.list().length;
    out.acfunChars = (window.VShell.store.get('characters.acfun') || []).length;
    out.kkavChars = (window.VShell.store.get('characters.kkav') || []).length;
    // 列表 = 激活源（acfun）并集：长度应等于 acfun 源角色数（kkav 未激活不入列）
    out.listEqAcfun = out.listLen === out.acfunChars;
    // 列表里不能出现 kkav 独有角色名（kkav 有角色时才有效对照）
    out.kkavOnlyLeak = (function(){
      var names = {};
      C.list().forEach(function(c){ names[c.name] = true; });
      var kkav = window.VShell.store.get('characters.kkav') || [];
      var leak = 0;
      kkav.forEach(function(c){
        if (c && c.name && names[c.name] && !(window.VShell.store.get('characters.acfun') || []).some(function(x){return x.name===c.name;})) leak++;
      });
      return leak;
    })();
    // UI 弹窗行数一致
    window.VShell.charPicker.edit('rlist-ui-2', 't', '更改角色', {}, 'acfun');
    out.uiRows = document.querySelectorAll('.vshell-char-picker .vshell-tag-row').length;
    if (window.VShell.charPicker._close) { try { window.VShell.charPicker._close(); } catch (e) {} }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2: $p2');
    } catch (e) {
      log('p2 err: $e');
    }
    // p2b：多源并集——追加启用 bilibili → 列表 = acfun + bilibili 并集
    try {
      await _controller.executeScript(
        "window.VShell.multisource.setEnabled(['acfun','bilibili']); location.reload(); 'ok'",
      );
    } catch (e) {
      log('p2b set err: $e');
    }
    await Future.delayed(const Duration(seconds: 7));
    try {
      final p2b = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var C = window.VShell.characters;
    out.enabled = window.VShell.store.get('enabledSources');
    out.listLen = C.list().length;
    out.acfunChars = (window.VShell.store.get('characters.acfun') || []).length;
    out.biliChars = (window.VShell.store.get('characters.bilibili') || []).length;
    out.kkavChars = (window.VShell.store.get('characters.kkav') || []).length;
    // 并集 = acfun + bilibili（同名合并后 ≤ 两者之和；kkav 未激活不入列）
    out.listEqUnion = out.listLen === out.acfunChars + out.biliChars;
    out.kkavOnlyLeak = (function(){
      var names = {};
      C.list().forEach(function(c){ names[c.name] = true; });
      var kkav = window.VShell.store.get('characters.kkav') || [];
      var ac = window.VShell.store.get('characters.acfun') || [];
      var bi = window.VShell.store.get('characters.bilibili') || [];
      var leak = 0;
      kkav.forEach(function(c){
        if (c && c.name && names[c.name]
            && !ac.some(function(x){return x.name===c.name;})
            && !bi.some(function(x){return x.name===c.name;})) leak++;
      });
      return leak;
    })();
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p2b: $p2b');
    } catch (e) {
      log('p2b err: $e');
    }
    // p3：恢复 enabled=[] → reload → 列表为空
    try {
      await _controller.executeScript(
        "window.VShell.multisource.setEnabled([]); location.reload(); 'ok'",
      );
    } catch (e) {
      log('p3 set err: $e');
    }
    await Future.delayed(const Duration(seconds: 7));
    try {
      final p3 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.enabled = window.VShell.store.get('enabledSources');
    out.listLen = window.VShell.characters.list().length;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('p3: $p3');
    } catch (e) {
      log('p3 err: $e');
    }
    log('FINAL');
  }

  /// --detail-disabled-probe：enabled=[]（用户配置）时验证：
  /// ①未启用**内置源**（acfun）详情页显示「数据源未启用」而非「详情加载失败」
  /// ②角色页卡片 src-disabled 置灰（含内置源）③未启用插件源（hlstest）同样提示。
  /// 写 detail-disabled.log。
  Future<void> _runDetailDisabledProbe() async {
    void log(String s) {
      try {
        File(
          'detail-disabled.log',
        ).writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    try {
      await Future.delayed(const Duration(seconds: 8));
      try {
        final p1 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.enabled = (V.store && V.store.get('enabledSources')) || null;
    out.active = (V.multisource && V.multisource.activeSources()) || [];
    out.route = location.hash;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
        log('p1: $p1');
      } catch (e) {
        log('p1 err: $e');
      }
      // 未启用内置源详情页
      await _controller.executeScript(
        "location.hash = '#/video/acfun:48810171';",
      );
      await Future.delayed(const Duration(seconds: 4));
      try {
        final p2 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.route = location.hash;
    out.emptyText = (function(){var e=document.querySelector('.vshell-empty'); return e ? e.textContent.slice(0,60) : null;})();
    out.skeleton = !!document.querySelector('.vshell-detail-skeleton');
    out.jsErr = window.__VS_ERR__ || null;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
        log('p2: $p2');
      } catch (e) {
        log('p2 err: $e');
      }
      // 角色页卡片置灰（含内置源）
      await _controller.executeScript("location.hash = '#/characters';");
      await Future.delayed(const Duration(seconds: 4));
      try {
        final p3 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    var cards = document.querySelectorAll('.vsc-video-card');
    out.cards = cards.length;
    out.srcDisabled = document.querySelectorAll('.vsc-video-card.src-disabled').length;
    out.srcDist = {};
    cards.forEach(function (c) {
      var s = c.getAttribute('data-src') || '?';
      out.srcDist[s] = (out.srcDist[s] || 0) + 1;
    });
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
        log('p3: $p3');
      } catch (e) {
        log('p3 err: $e');
      }
      // 未启用插件源详情页
      await _controller.executeScript(
        "location.hash = '#/video/hlstest:hl-1';",
      );
      await Future.delayed(const Duration(seconds: 4));
      try {
        final p4 = await _controller.executeScript("""
(function(){
  var out = {};
  try {
    out.route = location.hash;
    out.emptyText = (function(){var e=document.querySelector('.vshell-empty'); return e ? e.textContent.slice(0,60) : null;})();
    out.jsErr = window.__VS_ERR__ || null;
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
        log('p4: $p4');
      } catch (e) {
        log('p4 err: $e');
      }
    } catch (e) {
      log('probe err: $e');
    }
    log('FINAL');
  }

  /// 修复前 executeScript 版高频调用会持续涨（WebView2 已知泄漏），
  /// postWebMessage 版应稳定。写 scroll_stress.log。
  Future<void> _runScrollStress() async {
    void log(String s) {
      try {
        File(
          'scroll_stress.log',
        ).writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 4));
    log('stress start');
    for (var i = 0; i < 300; i++) {
      await _controller
          .postWebMessage(
            jsonEncode({'t': 'scroll', 'dy': 100.0, 'x': 700.0, 'y': 400.0}),
          )
          .catchError((_) {});
      await Future.delayed(const Duration(milliseconds: 15));
      if (i % 50 == 0) log('stress $i/300');
    }
    // 回读滚动位置（单次 executeScript，低频无害）——验证 postWebMessage
    // 通道真的滚动了页面。注意：body 不滚（.vshell-outlet 是滚动容器，
    // window.scrollY 恒 0 属正常）——必须读容器 scrollTop
    try {
      final sy = await _controller.executeScript("""
(function(){
  var out = {y: window.scrollY, h: document.body.scrollHeight};
  var list = document.querySelectorAll('.vshell-outlet, .vshell-page, .vshell-wall-host, .vshell-feed');
  out.cnt = list.length;
  out.maxTop = 0;
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (e.scrollTop > out.maxTop) out.maxTop = e.scrollTop;
  }
  out.top = (document.querySelector('.vshell-outlet') || {}).scrollTop || 0;
  return JSON.stringify(out);
})()
""");
      log('scroll after: $sy');
    } catch (e) {
      log('scroll read err: $e');
    }
    log('stress done');
  }

  /// --store-probe：量化 localStorage 各键大小（找"点完成"OOM 的大对象）。
  /// store.js 每次 set 都 JSON.stringify 整个 mem 对象写 localStorage——
  /// 若 mem 巨大（base64 封面/缓存累积），保存瞬间字符串复制峰值 → OOM。
  Future<void> _runStoreProbe() async {
    void log(String s) {
      try {
        File(
          'store_probe.log',
        ).writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 5));
    try {
      final st = await _controller.executeScript("""
(function(){
  var out = {total: 0, keys: {}, memLen: -1};
  try {
    var memRaw = localStorage.getItem('vshell.mem');
    out.memLen = memRaw ? memRaw.length : -1;
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = localStorage.getItem(k);
      var len = v ? v.length : 0;
      out.keys[k] = len;
      out.total += len;
    }
  } catch (e) { out.err = String(e); }
  return JSON.stringify(out);
})()
""");
      log('localStorage: $st');
    } catch (e) {
      log('probe err: $e');
    }
    log('probe done');
  }

  /// --oom-probe：OOM 崩前采样。
  /// JS 侧每 500ms 采样（JS 堆/DOM 节点/墙卡片数/墙是否连接）经
  /// postWebMessage({t:'probe'}) 推给 Dart 落盘 oom_probe.log——
  /// 渲染进程崩溃前最后几条采样 = 暴涨域的直接证据
  /// （heap 涨=JS 分配；nodes 涨=DOM 构建；wallConn=false=游离墙重建）。
  Future<void> _runOomProbe() async {
    void log(String s) {
      try {
        File('oom_probe.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    // 页面 2MB bundle 加载可能慢于 3s——10s 保险，且 executeScript 失败重试
    await Future.delayed(const Duration(seconds: 10));
    // 版本检查：确认 install/web/vshell.user.js 是差量修复版
    try {
      final ver = await _controller.executeScript("""
JSON.stringify({
  updateChars: typeof (window.VShell && VShell.wall && VShell.wall.updateChars),
  cardUpdateChar: !!(document.querySelector('.vsc-video-card') || {}).__updateChar
})
""");
      log('ver: $ver');
    } catch (e) {
      log('ver check err: $e');
      return;
    }
    // 对照实验：--nav-video=<id> 时先导航详情页（主页 destroy 场景——
    // 详情页 notify 只 renderUpRow，不触发主页全墙重建）
    if (widget.navVideo != null) {
      try {
        await _controller.executeScript(
          "location.hash = '#/video/${widget.navVideo}';",
        );
        log('nav: #/video/${widget.navVideo}');
      } catch (e) {
        log('nav inject err: $e');
        return;
      }
      await Future.delayed(const Duration(seconds: 6));
    }
    try {
      await _controller.executeScript("""
(function(){
  if (window.__OOM_PROBE_STARTED__) return;
  window.__OOM_PROBE_STARTED__ = true;
  var n = 0;
  var timer = setInterval(function(){
    n++;
    var nodes = 0, cards = 0, heap = -1, wallConn = -1;
    try { nodes = document.querySelectorAll('*').length; } catch (e) {}
    try { cards = document.querySelectorAll('.vsc-video-card').length; } catch (e) {}
    try { heap = performance.memory ? performance.memory.usedJSHeapSize : -1; } catch (e) {}
    try {
      var wall = document.querySelector('.vshell-wall-host');
      wallConn = wall ? (wall.isConnected ? 1 : 0) : -1;
    } catch (e) {}
    window.chrome.webview.postMessage({t:'probe', n:n, nodes:nodes, cards:cards, heap:heap, wallConn:wallConn});
    if (n > 160) clearInterval(timer);
  }, 500);
})()
""");
      log('probe injected');
    } catch (e) {
      log('probe inject err: $e');
      return;
    }
    await Future.delayed(const Duration(seconds: 3));
    try {
      await _controller.executeScript("""
(function(){
  var V = window.VShell || {};
  if (V.charPicker && V.charPicker.conflict) {
    V.charPicker.conflict('48800003', '探针冲突标题', ['行为大赏', '热门集锦']);
  }
  return !!document.querySelector('.vshell-char-picker');
})()
""");
      log('conflict opened');
    } catch (e) {
      log('conflict open err: $e');
      return;
    }
    // 手动单次 localStorage 全量写（模拟批处理后 persistVideo 的 flush——
    // 验证"1 次 715KB setItem 是否就是 OOM 源"）
    try {
      final r = await _controller.executeScript("""
(function(){
  var raw = localStorage.getItem('vshell.mem');
  localStorage.setItem('vshell.mem', raw);
  return 'written ' + (raw ? raw.length : 0);
})()
""");
      log('manual write: $r');
    } catch (e) {
      log('manual write err: $e');
    }
    await Future.delayed(const Duration(seconds: 3));
    try {
      final r = await _controller.executeScript("""
(function(){
  var b = document.querySelector('.vshell-char-picker .vshell-tag-foot .vshell-btn-primary');
  if (!b) return 'no-btn';
  var card0 = document.querySelector('.vsc-video-card');
  var timings = {};
  // monkey-patch 分段计时：resolveConflict（保存链）与 updateChars（差量链）
  if (window.VShell && VShell.characters && VShell.characters.resolveConflict) {
    var orc = VShell.characters.resolveConflict;
    VShell.characters.resolveConflict = function () {
      var t0 = performance.now();
      var r = orc.apply(this, arguments);
      timings.resolveConflict = Math.round((performance.now() - t0) * 10) / 10;
      return r;
    };
  }
  if (window.VShell && VShell.wall && VShell.wall.updateChars) {
    var ouc = VShell.wall.updateChars;
    VShell.wall.updateChars = function (host) {
      var t0 = performance.now();
      var r = ouc.call(this, host);
      timings.updateChars = Math.round((performance.now() - t0) * 10) / 10;
      return r;
    };
  }
  var before = {
    t: Math.round(performance.now()),
    heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
    cards: document.querySelectorAll('.vsc-video-card').length,
    nodes: document.querySelectorAll('*').length
  };
  var t0 = performance.now();
  b.click();
  var clickMs = Math.round(performance.now() - t0);
  var cardAfter = document.querySelector('.vsc-video-card');
  var after = {
    heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
    cards: document.querySelectorAll('.vsc-video-card').length,
    nodes: document.querySelectorAll('*').length,
    wallKids: (document.querySelector('.vshell-wall') || {}).childElementCount || -1,
    sameCard: card0 === cardAfter
  };
  return JSON.stringify({before: before, clickMs: clickMs, after: after, timings: timings});
})()
""");
      log('done click: $r');
    } catch (e) {
      log('done click err: $e');
      return;
    }
    for (var i = 0; i < 10; i++) {
      await Future.delayed(const Duration(seconds: 2));
      try {
        await _controller.executeScript('1+1');
        log('alive[$i]');
      } catch (e) {
        log('down[$i]: $e');
        return;
      }
    }
    log('oom probe FINAL');
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'vshell',
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: const Color(0xFF181818),
        body: _ready
            ? Listener(
                onPointerSignal: (signal) {
                  if (signal is PointerScrollEvent) {
                    final dy = signal.scrollDelta.dy * 1.5;
                    final p = signal.localPosition;
                    // 滚动桥：postWebMessage（无返回值通道）——executeScript
                    // 每次滚轮调用有 WebView2 已知内存泄漏（16:53 事件日志
                    // RADAR_PRE_LEAK_64 实锤：高频滚动 → 渲染进程内存涨 →
                    // 点击弹窗时分配失败 → "此页存在问题 Out of Memory"）
                    _controller
                        .postWebMessage(
                          jsonEncode({
                            't': 'scroll',
                            'dy': dy,
                            'x': p.dx,
                            'y': p.dy,
                          }),
                        )
                        .catchError((_) {});
                  }
                },
                child: Webview(_controller),
              )
            : const Center(
                child: SizedBox(
                  width: 28,
                  height: 28,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Color(0xFF0078D4),
                  ),
                ),
              ),
      ),
    );
  }

  /// --case-probe：角色识别大小写不敏感实测。
  /// 注入临时测试角色（关键词含大写混合 'AcFun'/'Ai'）→ matchTitle 五种标题
  /// （小写/大写/混合/不完整/无关）→ 清理测试角色 → 写 case_probe.log（工作目录）。
  Future<void> _runCaseProbe() async {
    void log(String s) {
      try {
        File('case_probe.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 8));
    try {
      final res = await _controller.executeScript("""
(function () {
  try {
    var C = window.VShell.characters;
    var out = {};
    var added = C.add({
      name: 'ZZCaseProbe', keywords: ['AcFun', 'Ai'], icon: null
    });
    out.added = added;
    var m1 = C.matchTitle('acfun 年度精选');   // 小写标题
    var m2 = C.matchTitle('ai 助手演示');       // 小写标题
    var m3 = C.matchTitle('ACFUN 大写标题');    // 大写标题
    var m4 = C.matchTitle('AcF 混合不完整');    // 不完整词
    var m5 = C.matchTitle('无关标题');          // 无关
    out.m1 = m1.length; out.m2 = m2.length; out.m3 = m3.length;
    out.m4 = m4.length; out.m5 = m5.length;
    out.names = [m1[0] && m1[0].name, m2[0] && m2[0].name, m3[0] && m3[0].name];
    var removed = C.remove('ZZCaseProbe');
    out.removed = removed;
    out.after = C.list().every(function (c) { return c.name !== 'ZZCaseProbe'; });
    window.__CASE_PROBE__ = out;
  } catch (e) {
    window.__CASE_PROBE__ = { error: String(e) };
  }
})();
""");
      log('probe exec: $res');
      await Future.delayed(const Duration(milliseconds: 600));
      final val = await _controller.executeScript(
        'JSON.stringify(window.__CASE_PROBE__)',
      );
      log('probe result: $val');
      log('DONE');
    } catch (e) {
      log('probe error: $e');
    }
  }

  /// --nav-probe：移动端导航布局探针——视口宽/devicePixelRatio/768 断点
  /// 匹配/actions 容器存在性与 computed style（fixed?）/brand display
  /// → 写 nav_probe.log（工作目录）。
  Future<void> _runNavProbe() async {
    void log(String s) {
      try {
        File('nav_probe.log').writeAsStringSync('$s\n', mode: FileMode.append);
      } catch (_) {}
    }

    await Future.delayed(const Duration(seconds: 8));
    try {
      final res = await _controller.executeScript("""
(function () {
  try {
    var nav = document.querySelector('.vshell-navbar');
    var actions = document.querySelector('.vshell-nav-actions');
    var brand = document.querySelector('.vshell-nav-brand');
    var out = {
      w: window.innerWidth,
      dpr: window.devicePixelRatio,
      mq768: window.matchMedia('(max-width: 768px)').matches,
      mq400: window.matchMedia('(max-width: 400px)').matches,
      nav: !!nav,
      actions: !!actions,
      actionsPos: actions ? getComputedStyle(actions).position : null,
      actionsDisplay: actions ? getComputedStyle(actions).display : null,
      actionsBottom: actions ? getComputedStyle(actions).bottom : null,
      brandDisplay: brand ? getComputedStyle(brand).display : null,
      brandHidden: brand ? getComputedStyle(brand).display === 'none' : null,
      modeOrder: nav ? getComputedStyle(nav.querySelector('.vshell-nav-mode')).order : null,
      layoutOrder: nav ? getComputedStyle(nav.querySelector('.vshell-nav-layout')).order : null,
      centerOrder: nav ? getComputedStyle(nav.querySelector('.vshell-nav-center')).order : null,
      homeDisplay: nav ? getComputedStyle(nav.querySelector('.vshell-nav-home')).display : null,
      sb: (function () {
        var el = document.querySelector('.vshell-nav-search');
        if (!el) return 'null';
        var r = el.getBoundingClientRect();
        var cs = getComputedStyle(el);
        return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height),
          x: Math.round(r.x), y: Math.round(r.y), display: cs.display,
          flex: cs.flex, minW: cs.minWidth, wStyle: cs.width });
      })(),
      center: (function () {
        var el = document.querySelector('.vshell-nav-center');
        if (!el) return 'null';
        var r = el.getBoundingClientRect();
        return JSON.stringify({ w: Math.round(r.width), x: Math.round(r.x),
          y: Math.round(r.y), display: getComputedStyle(el).display,
          pos: getComputedStyle(el).position });
      })()
    };
    window.__NAV_PROBE__ = out;
  } catch (e) {
    window.__NAV_PROBE__ = { error: String(e) };
  }
})();
""");
      log('probe exec: $res');
      await Future.delayed(const Duration(milliseconds: 600));
      final val = await _controller.executeScript(
        'JSON.stringify(window.__NAV_PROBE__)',
      );
      log('probe result: $val');
      log('DONE');
    } catch (e) {
      log('probe error: $e');
    }
  }
}

/// 演示数据注入（--demo-data：待看/收藏假数据，web harness 对比用）
void _injectDemoData(AppState s) {
  VideoItem v(String id, String title, {int dur = 300, int view = 0}) =>
      VideoItem(
        id: id,
        title: title,
        duration: dur,
        viewCount: view,
        ownerName: '演示UP主',
        pubdate: 1724419200,
      );
  s.toggleWatch(v('1001', 'Demo Card 1 云涯屋咯~看完一起发财', dur: 289, view: 4325));
  s.toggleWatch(
    v('1002', 'Demo Card 2 成年人都知道怎么选！欢乐八点档-1751', dur: 351, view: 12033),
  );
  s.toggleWatch(v('1003', 'Demo Card 3 猛男往事第一集', dur: 599, view: 8921));
  s.toggleWatch(v('1004', 'Demo Card 4 测试视频', dur: 122, view: 567));
  s.toggleFav(v('2001', '收藏 Demo 1 好看视频合集', dur: 480, view: 2300));
  s.toggleFav(v('2002', '收藏 Demo 2 音乐现场', dur: 780, view: 5600));
  s.toggleFav(v('2003', '收藏 Demo 3 美食制作', dur: 900, view: 8900));
}

class VshellApp extends StatelessWidget {
  final AcfunSource source;
  final String? directVideoId;
  final String? directPage;
  final bool feedMode;
  final bool demoData;
  const VshellApp({
    super.key,
    required this.source,
    this.directVideoId,
    this.directPage,
    this.feedMode = false,
    this.demoData = false,
  });

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(
          create: (_) {
            final s = AppState(source);
            if (feedMode) s.setFeedMode(true);
            if (demoData) _injectDemoData(s);
            if (directVideoId != null && directVideoId!.isNotEmpty) {
              s.go(PageType.detail, id: directVideoId);
            }
            if (directPage == 'characters') {
              s.go(PageType.characters);
            } else if (directPage != null && directPage!.startsWith('role:')) {
              s.go(PageType.role, name: directPage!.substring('role:'.length));
            } else if (directPage == 'settings') {
              s.go(PageType.settings);
            } else if (directPage == 'local') {
              s.go(PageType.local);
            } else if (directPage == 'downloads') {
              s.go(PageType.downloads);
            } else if (directPage == 'watchlist') {
              s.go(PageType.watchlist);
            } else if (directPage == 'favorites') {
              s.go(PageType.favorites);
            } else if (directPage == 'blacklist') {
              s.go(PageType.blacklist);
            } else if (directPage == 'aggregate') {
              s.go(PageType.aggregate);
            }
            return s;
          },
        ),
        ChangeNotifierProvider.value(value: DownloadManager.instance),
      ],
      child: Consumer<AppState>(
        builder: (context, state, _) => MaterialApp(
          title: 'vshell',
          debugShowCheckedModeBanner: false,
          theme: VsTheme.dark(),
          home: const Shell(),
        ),
      ),
    );
  }
}






