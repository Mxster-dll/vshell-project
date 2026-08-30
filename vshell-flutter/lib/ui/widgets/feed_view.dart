/// 抖音刷模式（web 版 feed.js 移植）
/// 纵向大卡列表：每卡 16:9 封面 + 信息行；鼠标悬停卡内实时预览播放（静音），
/// 移开恢复封面；滚动到底加载更多；共享单个媒体播放器。
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:provider/provider.dart';
import 'package:window_manager/window_manager.dart';

import '../../data/models.dart';
import '../../main.dart';
import '../../services/characters.dart';
import '../../state/app_state.dart';
import '../../theme/vs_icons.dart';
import '../../theme/vs_theme.dart';
import 'vs_toast.dart';
import 'char_picker_dialog.dart';

class FeedView extends StatefulWidget {
  const FeedView({
    super.key,
    required this.items,
    required this.onLoadMore,
    required this.onOpen,
    required this.playUrlOf,
    this.done = false,
  });

  final List<VideoItem> items;
  final Future<void> Function() onLoadMore;
  final void Function(VideoItem) onOpen;

  /// 取播放直链（hover 预览用）；返回 null 表示无法预览
  final Future<String?> Function(VideoItem item) playUrlOf;
  final bool done;

  @override
  State<FeedView> createState() => _FeedViewState();
}

class _FeedViewState extends State<FeedView> with WindowListener {
  late final PageController _scroll;
  late final Player _player;
  VideoController? _vc;
  String? _hoverId;
  int _token = 0;
  bool _hoverBusy = false;
  bool _fullscreen = false;
  AppState? _appState;
  Timer? _uiTimer;
  bool _uiHidden = false;

  /// 鼠标静止 700ms 隐藏信息浮层/动作列（web v0.3.92：与播放器控件
  /// 隐藏节奏一致；悬停中（移动）持续重置 → is-peeked 语义等效）
  void _pokeUi() {
    _uiTimer?.cancel();
    _uiTimer = Timer(const Duration(milliseconds: 700), () {
      if (mounted) setState(() => _uiHidden = true);
    });
    if (_uiHidden) setState(() => _uiHidden = false);
  }

  @override
  void initState() {
    super.initState();
    _player = Player();
    _player.setVolume(0); // 预览静音
    _scroll = PageController();
    _scroll.addListener(_onScroll);
    windowManager.addListener(this);
    if (kFeedFsTest) {
      // 立即写一条（确认 FeedView 挂载）
      try {
        File(
          '${Platform.environment['TEMP'] ?? '.'}${Platform.pathSeparator}vshell_fs.log',
        ).writeAsStringSync(
          '${DateTime.now().toIso8601String()} FeedView.initState kFeedFsTest=$kFeedFsTest\n',
          mode: FileMode.append,
        );
      } catch (_) {}
      _autoFsTest();
    }
  }

  /// 自动全屏测试（--feed-fs-test）：3s 全屏 → 验证状态 → 6s 退出 → 写 vshell_fs.log
  Future<void> _autoFsTest() async {
    final log = File(
      '${Platform.environment['TEMP'] ?? '.'}${Platform.pathSeparator}vshell_fs.log',
    );
    void w(String s) {
      try {
        log.writeAsStringSync(
          '${DateTime.now().toIso8601String()} $s\n',
          mode: FileMode.append,
        );
      } catch (_) {}
    }

    w('started; kFeedFsTest=$kFeedFsTest');
    try {
      await Future.delayed(const Duration(seconds: 3));
      w('pre-fullscreen: _fullscreen=$_fullscreen');
      await windowManager.setFullScreen(true);
      w('setFullScreen(true) called; local=_fullscreen=$_fullscreen');
      await Future.delayed(const Duration(seconds: 3));
      w(
        'after 3s fullscreen: _fullscreen=$_fullscreen '
        'appState.feedFullscreen=${_appState?.feedFullscreen}',
      );
      await windowManager.setFullScreen(false);
      await Future.delayed(const Duration(seconds: 2));
      w(
        'after exit: _fullscreen=$_fullscreen '
        'appState.feedFullscreen=${_appState?.feedFullscreen}',
      );
      w('DONE');
    } catch (e, st) {
      w('ERROR $e\n$st');
    }
  }

  @override
  void dispose() {
    _uiTimer?.cancel();
    windowManager.removeListener(this);
    if (_fullscreen) {
      // 离开 feed（切页/切模式）时退出全屏
      _appState?.setFeedFullscreen(false);
      windowManager.setFullScreen(false);
    }
    _token++;
    _scroll.dispose();
    _player.dispose();
    super.dispose();
  }

  @override
  void onWindowEvent(String eventName) {
    // window_manager 0.4.3 用字符串事件名
    if (eventName == kWindowEventEnterFullScreen) {
      if (!_fullscreen) setState(() => _fullscreen = true);
      _appState?.setFeedFullscreen(true);
    } else if (eventName == kWindowEventLeaveFullScreen) {
      // Esc 或系统退出全屏
      if (_fullscreen) setState(() => _fullscreen = false);
      _appState?.setFeedFullscreen(false);
    }
  }

  Future<void> _toggleFullscreen() async {
    if (_fullscreen) {
      await windowManager.setFullScreen(false);
    } else {
      await windowManager.setFullScreen(true);
    }
  }

  void _onScroll() {
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 700) {
      widget.onLoadMore();
    }
  }

  Future<void> _onHover(VideoItem it) async {
    final t = ++_token;
    _hoverBusy = true;
    setState(() => _hoverId = it.id);
    String? url;
    try {
      url = await widget.playUrlOf(it);
    } catch (_) {
      url = null;
    }
    if (!mounted || t != _token || url == null || url.isEmpty) {
      _hoverBusy = false;
      return;
    }
    try {
      await _player.open(Media(url));
      if (!mounted || t != _token) return;
      _vc ??= VideoController(_player);
      setState(() {}); // Video 挂载
      await _player.play();
      if (t != _token) {
        await _player.pause();
      }
    } catch (_) {
      // 预览失败静默（封面兜底）
    } finally {
      _hoverBusy = false;
    }
  }

  void _onLeave() {
    _token++;
    setState(() => _hoverId = null);
    _player.pause();
  }

  @override
  Widget build(BuildContext context) {
    _appState ??= context.read<AppState>();
    // web .vshell-feed：黑底整屏滑卡（非全屏占导航栏下全高、全屏占满全窗；
    // scroll-snap y mandatory → Flutter PageView 垂直整页吸附）
    return Container(
      color: Colors.black,
      child: MouseRegion(
        onHover: (_) => _pokeUi(),
        child: PageView.builder(
          controller: _scroll,
          scrollDirection: Axis.vertical,
          onPageChanged: _onPageChanged,
          itemCount: widget.items.length + (widget.done ? 0 : 1),
          itemBuilder: (c, i) {
            if (i >= widget.items.length) {
              return const Center(
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              );
            }
            final it = widget.items[i];
            // web .vshell-feed-slide：height 100%、无间隔、无圆角
            return _FeedCard(
              item: it,
              isHover: _hoverId == it.id,
              hovering: _hoverBusy && _hoverId == it.id,
              video: _hoverId == it.id ? _vc : null,
              fullscreen: _fullscreen,
              uiHidden: _uiHidden,
              onPoke: _pokeUi,
              onToggleFullscreen: _toggleFullscreen,
              onHover: () => _onHover(it),
              onLeave: _onLeave,
              onTap: () => widget.onOpen(it),
              onOpen: () => widget.onOpen(it),
            );
          },
        ),
      ),
    );
  }

  /// 翻页（web IntersectionObserver 语义）：播放当前卡；接近底部加载更多
  void _onPageChanged(int i) {
    if (i < widget.items.length) _onHover(widget.items[i]);
    if (i >= widget.items.length - 3) widget.onLoadMore();
  }
}

class _FeedCard extends StatelessWidget {
  const _FeedCard({
    required this.item,
    required this.isHover,
    required this.hovering,
    required this.video,
    required this.fullscreen,
    required this.uiHidden,
    required this.onPoke,
    required this.onToggleFullscreen,
    required this.onHover,
    required this.onLeave,
    required this.onTap,
    required this.onOpen,
  });

  final VideoItem item;
  final bool isHover;
  final bool hovering;
  final VideoController? video;
  final bool fullscreen;
  final bool uiHidden;
  final VoidCallback onPoke;
  final VoidCallback onToggleFullscreen;
  final VoidCallback onHover;
  final VoidCallback onLeave;
  final VoidCallback onTap;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final svc = CharactersService.instance;
    final cm = svc.charFor(item.id, item.title);
    final charName = cm.kind == 'char' ? cm.char!.name : null;
    final isConflict = cm.kind == 'conflict';

    return MouseRegion(
      onEnter: (_) => onHover(),
      onExit: (_) => onLeave(),
      child: GestureDetector(
        onTap: onTap,
        child: SizedBox.expand(
          child: Stack(
            fit: StackFit.expand,
            children: [
              // ---- 媒体层（web .vshell-feed-media：absolute inset 0 铺满；
              // poster cover opacity 0.55；播放器 contain 黑边铺满）----
              // 封面层
              if (item.cover.isNotEmpty)
                Image.network(
                  item.cover,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    color: const Color(0xFF101010),
                    child: Icon(
                      VsIcons.fileMedia,
                      size: 40,
                      color: VsTheme.fgDim,
                    ),
                  ),
                )
              else
                Container(
                  color: const Color(0xFF101010),
                  child: Icon(
                    VsIcons.fileMedia,
                    size: 40,
                    color: VsTheme.fgDim,
                  ),
                ),
              // 预览视频层（铺满整卡，contain）
              if (video != null && isHover)
                Video(controller: video!, fit: BoxFit.contain),
              if (hovering)
                const Center(
                  child: SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              // ---- 顶部信息浮层（web .vshell-feed-info：全宽渐变
              // transparent→rgba(0,0,0,0.78)、padding 14px 16px 44px、
              // 全屏 scale(1.5) origin top left；鼠标静止 700ms 隐藏）----
              Positioned(
                left: 0,
                right: 0,
                top: 0,
                child: IgnorePointer(
                  ignoring: uiHidden,
                  child: AnimatedOpacity(
                    opacity: uiHidden ? 0 : 1,
                    duration: const Duration(milliseconds: 200),
                    child: Transform.scale(
                      alignment: Alignment.topLeft,
                      scale: fullscreen ? 1.5 : 1.0,
                      child: MouseRegion(
                        onHover: (_) => onPoke(),
                        child: Container(
                          padding: const EdgeInsets.fromLTRB(16, 14, 16, 44),
                          decoration: const BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [Color(0xC7000000), Colors.transparent],
                            ),
                          ),
                          child: ConstrainedBox(
                            // web .vshell-feed-head：内容让位右侧动作列
                            constraints: BoxConstraints(
                              maxWidth: MediaQuery.sizeOf(context).width - 110,
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                // avatar（web 36px 圆形 + border + shadow）
                                _avatar(cm, context),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        item.title,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontSize: fullscreen ? 21 : 14,
                                          height: 1.4,
                                          fontWeight: FontWeight.w600,
                                          shadows: const [
                                            Shadow(
                                              color: Color(0x99000000),
                                              blurRadius: 3,
                                              offset: Offset(0, 1),
                                            ),
                                          ],
                                        ),
                                      ),
                                      // meta：角色名（点击更改）/
                                      // 角色冲突 + 关注按钮
                                      if (charName != null ||
                                          isConflict ||
                                          true)
                                        Padding(
                                          padding: const EdgeInsets.only(
                                            top: 2,
                                          ),
                                          child: Row(
                                            children: [
                                              if (isConflict)
                                                Text(
                                                  '角色冲突',
                                                  style: TextStyle(
                                                    color: VsTheme.error,
                                                    fontSize: fullscreen
                                                        ? 18
                                                        : 12,
                                                    fontWeight: FontWeight.w600,
                                                  ),
                                                )
                                              else if (charName != null) ...[
                                                GestureDetector(
                                                  onTap: () {
                                                    _openCharPicker(
                                                      context,
                                                      svc,
                                                      cm,
                                                    );
                                                  },
                                                  child: Text(
                                                    charName,
                                                    maxLines: 1,
                                                    overflow:
                                                        TextOverflow.ellipsis,
                                                    style: TextStyle(
                                                      color: Colors.white
                                                          .withValues(
                                                            alpha: 0.8,
                                                          ),
                                                      fontSize: fullscreen
                                                          ? 18
                                                          : 12,
                                                    ),
                                                  ),
                                                ),
                                                const SizedBox(width: 6),
                                                // 关注按钮（web 18px 圆
                                                // rgba(0,0,0,0.45)，
                                                // 已关注图标变对勾、
                                                // 背景不变 + follow-in
                                                // 动画）
                                                _followBtn(
                                                  charName,
                                                  svc,
                                                  context,
                                                ),
                                              ],
                                              const SizedBox(width: 8),
                                            ],
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 8),
                                // 复制标题（web 22x22 白 0.85）
                                Tooltip(
                                  message: '复制标题',
                                  child: GestureDetector(
                                    onTap: () {
                                      Clipboard.setData(
                                        ClipboardData(text: item.title),
                                      );
                                      _toast(context, '已复制标题');
                                    },
                                    child: Container(
                                      width: 22,
                                      height: 22,
                                      decoration: BoxDecoration(
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Icon(
                                        VsIcons.copy,
                                        size: 13,
                                        color: Colors.white.withValues(
                                          alpha: 0.85,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                // 全屏按钮
                                Tooltip(
                                  message: fullscreen ? '退出全屏' : '全屏',
                                  child: GestureDetector(
                                    onTap: onToggleFullscreen,
                                    child: Container(
                                      width: 28,
                                      height: 28,
                                      decoration: BoxDecoration(
                                        color: fullscreen
                                            ? VsTheme.listActive
                                            : const Color(0x73000000),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Icon(
                                        fullscreen
                                            ? VsIcons.screenNormal
                                            : VsIcons.screenFull,
                                        size: 16,
                                        color: fullscreen
                                            ? Colors.white
                                            : Colors.white70,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              // 左下：播放量 / 时长（web .vshell-feed-stats 同款白字）
              Positioned(
                left: 10,
                bottom: 8,
                child: Row(
                  children: [
                    const Icon(VsIcons.play, size: 13, color: Colors.white),
                    const SizedBox(width: 3),
                    Text(
                      '${item.viewText}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontFamily: VsTheme.fontFamily,
                        fontFamilyFallback: VsTheme.fontFamilyFallback,
                      ),
                    ),
                    if (item.duration > 0) ...[
                      const SizedBox(width: 10),
                      Text(
                        item.durationText,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontFamily: VsTheme.fontFamily,
                          fontFamilyFallback: VsTheme.fontFamilyFallback,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              // 右侧动作列（web .vshell-feed-actions：44px 圆钮 +
              // 11px 标签，详情/待看/收藏/黑名单；待看=charts-blue、
              // 收藏=errorForeground、黑名单=charts-orange 高亮
              // （icon+label 变色，圆底不变）；hover scale 1.1 +
              // bg 0.45→0.65；鼠标静止隐藏）
              Positioned(
                right: 10,
                bottom: 60,
                child: IgnorePointer(
                  ignoring: uiHidden,
                  child: AnimatedOpacity(
                    opacity: uiHidden ? 0 : 1,
                    duration: const Duration(milliseconds: 200),
                    child: Column(
                      children: [
                        _FeedActionBtn(
                          icon: VsIcons.arrowRight,
                          label: '详情',
                          onTap: onOpen,
                        ),
                        const SizedBox(height: 16),
                        _FeedActionBtn(
                          icon: VsIcons.bookmark,
                          label: '待看',
                          active: state.isWatch(item.id),
                          activeColor: VsTheme.watchBlue,
                          onTap: () {
                            state.toggleWatch(item);
                            _toast(
                              context,
                              state.isWatch(item.id) ? '已加入待看' : '已移除待看',
                            );
                          },
                        ),
                        const SizedBox(height: 16),
                        _FeedActionBtn(
                          icon: VsIcons.heart,
                          label: '收藏',
                          active: state.isFav(item.id),
                          activeColor: VsTheme.favRed,
                          onTap: () {
                            state.toggleFav(item);
                            _toast(
                              context,
                              state.isFav(item.id) ? '已收藏' : '已取消收藏',
                            );
                          },
                        ),
                        const SizedBox(height: 16),
                        _FeedActionBtn(
                          icon: VsIcons.circleSlash,
                          label: '黑名单',
                          active: state.isBlacklisted(item.id),
                          activeColor: VsTheme.chartsOrange,
                          onTap: () {
                            state.toggleBlacklist(item);
                            _toast(
                              context,
                              state.isBlacklisted(item.id)
                                  ? '已加入黑名单'
                                  : '已移出黑名单',
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// 关注按钮（web .vshell-feed-follow：18px 圆 rgba(0,0,0,0.45)、
  /// icon 11px、已关注对勾且背景不变、vshell-follow-in 动画
  /// = 淡入 + translateY 2px 180ms，非放大）
  Widget _followBtn(String name, CharactersService svc, BuildContext ctx) {
    final followed = svc.isFollowed(name);
    return GestureDetector(
      onTap: () {
        onPoke();
        svc.toggleFollow(name);
        _toast(ctx, followed ? '已取消关注 $name' : '已关注 $name');
      },
      child: Container(
        width: 18,
        height: 18,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: const Color(0x73000000), // 背景恒定，不随关注变色
        ),
        child: Center(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            transitionBuilder: (child, anim) => FadeTransition(
              opacity: anim,
              child: SlideTransition(
                position: Tween(
                  begin: const Offset(0, 0.1),
                  end: Offset.zero,
                ).animate(anim),
                child: child,
              ),
            ),
            child: Icon(
              followed ? VsIcons.check : VsIcons.add,
              key: ValueKey(followed),
              size: 11,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }

  /// 头像（web .vshell-feed-avatar：36px 圆形、1px dropdownBorder + 阴影、
  /// bg rgba(255,255,255,0.16)、首字 18px）
  Widget _avatar(CharMatch cm, BuildContext ctx) {
    if (cm.kind == 'char' && cm.char != null) {
      final c = cm.char!;
      if (c.icon.isNotEmpty && c.icon.startsWith('data:')) {
        try {
          final b64 = c.icon.split(',')[1];
          return Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: VsTheme.dropdownBorder),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x80000000),
                  blurRadius: 4,
                  offset: Offset(0, 1),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Image.memory(
              base64Decode(b64),
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => _letterAvatar(c.name),
            ),
          );
        } catch (_) {}
      }
      return _letterAvatar(c.name);
    }
    // 无角色：白底圆形占位（+ 号语义，可点击添加）
    return GestureDetector(
      onTap: () => _openCharPicker(ctx, CharactersService.instance, cm),
      child: Container(
        width: 36,
        height: 36,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: const Color(0x29FFFFFF),
          border: Border.all(color: VsTheme.dropdownBorder),
        ),
        child: const Icon(VsIcons.add, size: 18, color: Colors.white),
      ),
    );
  }

  Widget _letterAvatar(String name) {
    return Container(
      width: 36,
      height: 36,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0x29FFFFFF),
        border: Border.all(color: VsTheme.dropdownBorder),
      ),
      child: Text(
        name.isEmpty ? '?' : name.characters.first.toUpperCase(),
        style: const TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Future<void> _openCharPicker(
    BuildContext context,
    CharactersService svc,
    CharMatch cm,
  ) async {
    final res = await showCharPicker(
      context,
      videoId: item.id,
      title: item.title,
      conflictNames: cm.kind == 'conflict'
          ? cm.conflicts.map((c) => c.name).toList()
          : null,
    );
    if (res == null || !context.mounted) return;
    if (res.startsWith(kCharRolePrefix)) {
      final name = res.substring(kCharRolePrefix.length);
      context.read<AppState>().go(PageType.role, name: name);
      return;
    }
    _toast(context, res == kCharUnassign ? '已还原为自然匹配' : '已指定角色：$res');
  }

  /// 右侧动作按钮（web .vshell-feed-action：44px 圆钮 bg 恒
  /// rgba(0,0,0,0.45) + 11px 标签；hover scale(1.1) + bg 0.65（140ms）；
  /// active 时 icon+label 变激活色、圆底不变）
  void _toast(BuildContext context, String msg) {
    VsToast.show(context, msg);
  }
}

/// feed 右侧动作按钮（web .vshell-feed-action）
class _FeedActionBtn extends StatefulWidget {
  const _FeedActionBtn({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
    this.activeColor,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;

  /// 激活时 icon+label 颜色（web 高亮色，圆底不变）
  final Color? activeColor;

  @override
  State<_FeedActionBtn> createState() => _FeedActionBtnState();
}

class _FeedActionBtnState extends State<_FeedActionBtn> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final activeColor = widget.active
        ? (widget.activeColor ?? Colors.white)
        : null;
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedScale(
              scale: _hover ? 1.1 : 1.0,
              duration: const Duration(milliseconds: 140),
              curve: Curves.easeOut,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 140),
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _hover
                      ? const Color(0xA6000000) // rgba(0,0,0,0.65)
                      : const Color(0x73000000), // rgba(0,0,0,0.45)
                ),
                child: Icon(
                  widget.icon,
                  size: 20,
                  color: activeColor ?? Colors.white,
                ),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              widget.label,
              style: TextStyle(
                color: activeColor ?? Colors.white,
                fontSize: 11,
                fontFamily: VsTheme.fontFamily,
                fontFamilyFallback: VsTheme.fontFamilyFallback,
                shadows: const [
                  Shadow(
                    color: Color(0xB3000000),
                    blurRadius: 2,
                    offset: Offset(0, 1),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
