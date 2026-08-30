/// 应用壳：顶部导航栏（web 版 navbar.js 完整复刻：56px 毛玻璃 + brand 发光点 +
/// 居中搜索组合 + 右侧按钮组）+ 内容区路由
library;

import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../main.dart';
import '../../services/characters.dart';
import '../state/app_state.dart';
import '../theme/vs_icons.dart';
import '../theme/vs_theme.dart';
import 'pages/agg_search_page.dart';
import 'pages/blacklist_page.dart';
import 'pages/characters_page.dart';
import 'pages/detail_page.dart';
import 'pages/downloads_page.dart';
import 'pages/home_page.dart';
import 'pages/local_page.dart';
import 'pages/role_page.dart';
import 'pages/search_page.dart';
import 'pages/settings_page.dart';
import 'pages/watchlist_page.dart';
import 'widgets/char_list_dialog.dart';
import 'widgets/thumb_host.dart';
import 'widgets/vs_toast.dart';

class Shell extends StatefulWidget {
  const Shell({super.key});

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  bool _navScrolled = false;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      backgroundColor: VsTheme.bg,
      body: Stack(
        children: [
          // 内容区：web .vshell-outlet 语义——顶部 56px 让位（导航栏 fixed
          // 悬浮不占文档流，内容在其下方独立滚动，滚动条从导航栏下方开始）；
          // feed 全屏时占满（web :has(.vshell-feed) padding 56px 0 0 +
          // overflow hidden，导航栏隐藏）
          Positioned.fill(
            child: NotificationListener<ScrollNotification>(
              onNotification: (n) {
                if (n.metrics.axis == Axis.vertical) {
                  // web navbar.js：root.classList.toggle('is-scrolled', y > 0)
                  final s = n.metrics.pixels > 2;
                  if (s != _navScrolled) setState(() => _navScrolled = s);
                }
                return false;
              },
              child: Padding(
                padding:
                    EdgeInsets.only(top: state.feedFullscreen ? 0 : 56),
                child: _body(state),
              ),
            ),
          ),
          // 悬浮导航栏（web .vshell-navbar position:fixed top:0 z-60；
          // 毛玻璃盖在内容上方；feed 全屏时隐藏）
          if (!state.feedFullscreen)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: _NavBar(scrolled: _navScrolled),
            ),
          // 全局隐藏视频宿主（本地视频封面截帧用）
          const Positioned(
            left: 0,
            top: 0,
            child: ThumbHost(),
          ),
        ],
      ),
    );
  }

  Widget _body(AppState state) {
    final Widget page = switch (state.page) {
      PageType.home => const HomePage(),
      PageType.search => SearchPage(keyword: state.searchKeyword),
      PageType.aggregate => const AggSearchPage(),
      PageType.watchlist => const WatchlistPage(watchOnly: true),
      PageType.favorites => const WatchlistPage(watchOnly: false),
      PageType.downloads => const DownloadsPage(),
      PageType.local => const LocalPage(),
      PageType.settings => const SettingsPage(),
      PageType.blacklist => const BlacklistPage(),
      PageType.characters => const CharactersPage(),
      PageType.role => RolePage(name: state.roleName),
      PageType.detail => DetailPage(videoId: state.detailId ?? ''),
    };
    // web 页面入场：vshell-page-in 0.22s（opacity 0→1 + translateY(8px)）
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 220),
      switchInCurve: Curves.easeOut,
      switchOutCurve: Curves.easeIn,
      transitionBuilder: (child, anim) => FadeTransition(
        opacity: anim,
        child: SlideTransition(
          position:
              Tween(begin: const Offset(0, 8 / 900), end: Offset.zero).animate(anim),
          child: child,
        ),
      ),
      child: KeyedSubtree(key: ValueKey('page-${state.page}'), child: page),
    );
  }
}

/// 导航栏（web .vshell-navbar 复刻）
/// 高 56 / rgba(24,24,24,0.85) 毛玻璃 / gap 10 / padding 8 16 /
/// 左 brand+视图按钮 / 中绝对居中 home+搜索框 / 右按钮组 / 滚动阴影
class _NavBar extends StatelessWidget {
  const _NavBar({required this.scrolled});

  final bool scrolled;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      height: 56,
      decoration: BoxDecoration(
        color: VsTheme.navBarBg,
        boxShadow: scrolled
            ? [
                BoxShadow(
                  color: VsTheme.navScrollShadow,
                  blurRadius: 10,
                  offset: const Offset(0, 2),
                )
              ]
            : null,
      ),
      child: ClipRect(
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Stack(
            children: [
              // 左区：brand + theme/mode/layout 视图按钮
              //（web gap 10；theme/mode、mode/layout 间 margin-left:-6 → 组内 4px）
              Positioned(
                left: 16,
                top: 0,
                bottom: 0,
                child: Row(
                  children: [
                    const _Brand(),
                    const SizedBox(width: 10),
                    _ViewBtn(
                      icon: _ThemeIcon(light: state.themeLight),
                      tooltip: state.themeLight ? '切换到深色模式' : '切换到浅色模式',
                      onTap: () => state.toggleTheme(),
                    ),
                    const SizedBox(width: 4),
                    _ViewBtn(
                      icon: Icon(state.feedMode ? VsIcons.playCircle : VsIcons.array,
                          size: 16, color: VsTheme.fg),
                      tooltip: state.feedMode
                          ? '当前：抖音刷视图（点击切换视频墙）'
                          : '当前：视频墙视图（点击切换抖音刷）',
                      onTap: () {
                        state.setFeedMode(!state.feedMode);
                        if (state.page != PageType.home) state.go(PageType.home);
                      },
                    ),
                    const SizedBox(width: 4),
                    // 抖音刷模式下布局按钮无意义 → 隐藏（web v0.3.97）
                    if (!state.feedMode)
                      _ViewBtn(
                        icon: Icon(VsIcons.layout, size: 16, color: VsTheme.fg),
                        tooltip: state.coverLayout ? '切换为标准布局' : '切换为封面布局',
                        onTap: () => state.setCoverLayout(!state.coverLayout),
                      ),
                  ],
                ),
              ),
              // 中区（绝对居中）：home 36x36 + 搜索框 520x30
              Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _HomeBtn(onTap: () => state.go(PageType.home)),
                    const SizedBox(width: 8),
                    _SearchBox(
                      onSearch: (kw) {
                        // web：Enter/搜索按钮 → /tagsearch 聚合搜索页
                        // （多标签随机混流；空标签页显示空态）
                        state.go(PageType.aggregate);
                      },
                    ),
                  ],
                ),
              ),
              // 右区：角色/待看/收藏/本地/下载/设置（web 顺序 tag/watch/fav/black/local/dl + 设置扩展）
              Positioned(
                right: 16,
                top: 0,
                bottom: 0,
                child: Row(
                  children: [
                    // 角色：打开角色列表浮窗（web v0.5.6 第十一轮需求 1）
                    _NavBtn(VsIcons.account, '角色', tooltip: '角色列表', onTap: () {
                      showCharListDialog(context);
                    }),
                    _NavBtn(VsIcons.bookmark, '待看', onTap: () => state.go(PageType.watchlist)),
                    _NavBtn(VsIcons.star, '收藏', onTap: () => state.go(PageType.favorites)),
                    _NavBtn(VsIcons.circleSlash, '黑名单', onTap: () => state.go(PageType.blacklist)),
                    _NavBtn(VsIcons.fileMedia, '本地', onTap: () => state.go(PageType.local)),
                    _NavBtn(VsIcons.download, '下载', onTap: () => state.go(PageType.downloads)),
                    // 设置（用户要求新增）
                    _NavBtn(VsIcons.gear, '设置', onTap: () => state.go(PageType.settings)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 导航按钮（web .vshell-nav-btn：34 高 / radius 8 / gap 6 / padding 0 10 /
/// icon 16 + text 12px / hover toolbar-hoverBackground 120ms；web 无 active 态）
class _NavBtn extends StatefulWidget {
  const _NavBtn(this.icon, this.label, {this.tooltip, this.onTap});

  final IconData icon;
  final String label;
  final String? tooltip;
  final VoidCallback? onTap;

  @override
  State<_NavBtn> createState() => _NavBtnState();
}

class _NavBtnState extends State<_NavBtn> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: widget.tooltip ?? widget.label,
      child: MouseRegion(
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: _hover ? VsTheme.toolbarHover : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
            ),
            // 用户要求：导航按钮只显示图标，不显示文字标签
            child: Icon(widget.icon, size: 16, color: VsTheme.fg),
          ),
        ),
      ),
    );
  }
}

/// 视图按钮（theme/mode/layout 共用：34 高 radius 8 hover toolbarHover，无 active 态）
class _ViewBtn extends StatefulWidget {
  const _ViewBtn({required this.icon, required this.tooltip, required this.onTap});

  final Widget icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  State<_ViewBtn> createState() => _ViewBtnState();
}

class _ViewBtnState extends State<_ViewBtn> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: widget.tooltip,
      child: MouseRegion(
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: _hover ? VsTheme.toolbarHover : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(child: widget.icon),
          ),
        ),
      ),
    );
  }
}

/// 品牌：发光蓝点 + VShell + 版本号（web .vshell-nav-brand，ver 与 web v0.5.6 对齐）
class _Brand extends StatelessWidget {
  const _Brand();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // 发光点（activityBarBadge-background #0078D4 + glow）
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: VsTheme.accent,
            borderRadius: BorderRadius.circular(3),
            boxShadow: [
              BoxShadow(color: VsTheme.accent, blurRadius: 8),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Text('VShell',
            style: TextStyle(
                color: VsTheme.fg,
                fontSize: 14,
                fontWeight: FontWeight.w600,
                fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback)),
        const SizedBox(width: 6),
        Text('v0.5.6',
            style: TextStyle(
                color: VsTheme.fgDim,
                fontSize: 11,
                fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback)),
      ],
    );
  }
}

/// 主页按钮（web .vshell-nav-home：36x36 radius 8 icon 18 hover toolbarHover + scale 1.06）
class _HomeBtn extends StatefulWidget {
  const _HomeBtn({required this.onTap});

  final VoidCallback onTap;

  @override
  State<_HomeBtn> createState() => _HomeBtnState();
}

class _HomeBtnState extends State<_HomeBtn> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: '主页',
      child: MouseRegion(
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: AnimatedScale(
            scale: _hover ? 1.06 : 1.0,
            duration: const Duration(milliseconds: 120),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 120),
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: _hover ? VsTheme.toolbarHover : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(VsIcons.home, size: 18, color: VsTheme.fg),
            ),
          ),
        ),
      ),
    );
  }
}

/// 搜索框（web .vshell-nav-search 完整复刻：min(520px,44vw) 宽 / 30 高 /
/// radius 8 / input-background / 1px input-border / padding 0 6px 0 3px /
/// hover 背景 #181818；有胶囊未聚焦同 hover 底）
///
/// 胶囊编辑器（web .vshell-st-editor）：[输入框][胶囊]... 交替 + 末尾
/// 自适应输入框；Enter 全量封装 + 搜索、Ctrl+Enter 单封装、Backspace/
/// Delete 删相邻胶囊并合并、方向键跨输入框；胶囊 hover 右上角圆形删除钮。
/// 聚焦 → 弹出浮层（角色快捷区，web .vshell-nav-popover + tagpop）。
class _SearchBox extends StatefulWidget {
  const _SearchBox({required this.onSearch});

  final void Function(String) onSearch;

  @override
  State<_SearchBox> createState() => _SearchBoxState();
}

class _SearchBoxState extends State<_SearchBox>
    with SingleTickerProviderStateMixin {
  final _boxKey = GlobalKey();
  final List<_StInput> _mids = []; // 中间输入框（chips.length + 1 个）
  final _last = _StInput(); // 末尾自适应输入框
  final _midScroll = ScrollController(); // 中间内容横滚（就近聚焦偏移）
  bool _hover = false;
  bool _focused = false; // 浮层展开态（web focus-within）
  OverlayEntry? _pop;
  final _popKey = GlobalKey(); // 浮层内点击不关闭 barrier
  // 浮层显隐动画（web vshell-pop-in 140ms 淡入 / pop-out 140ms 淡出上移 4px）
  late final AnimationController _popCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 140),
      value: 1);
  bool _closing = false; // 浮层正在消失（web __leaving：防重入 + 可取消）
  // 当前聚焦的输入框（web openTagPop 记录 focusedInp：展开/收起时手动
  // 同步焦点到同一输入框，避免树切换导致焦点丢失闪动）
  _StInput? _focusedInput;

  @override
  void initState() {
    super.initState();
    _mids.add(_StInput()); // 首输入框（无胶囊时也占位）
    _watchFocus(_last);
    _last.controller.addListener(_onAnyText);
    // 全局键盘回调：捕获 Enter/Backspace/Delete/方向键（TextField 内部
    // 已处理字符输入，无冲突；web st-editor onInputKeydown 语义）
    HardwareKeyboard.instance.addHandler(_globalKey);
    // --search-pop 自动聚焦测试（浮层验证）
    if (kSearchPopTest) {
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) _last.focus.requestFocus();
      });
    }
    // --search-hover 纯悬停测试（不聚焦，强制所有输入框 hover 态）
    if (kSearchHoverTest) {
      Future.delayed(const Duration(seconds: 2), () {
        if (!mounted) return;
        setState(() {
          _hover = true;
          for (final m in _mids) {
            m.hover = true;
          }
          _last.hover = true;
        });
      });
    }
    // --char-list 自动打开角色列表浮窗（遮罩验证）
    if (kCharListTest) {
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted && context.mounted) showCharListDialog(context);
      });
    }
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_globalKey);
    _midScroll.dispose();
    // 同步移除浮层（动画版 _closePop 的 whenComplete 依赖 mounted）
    _pop?.remove();
    _pop = null;
    _popCtrl.dispose();
    for (final m in _mids) {
      m.dispose();
    }
    _last.dispose();
    super.dispose();
  }

  Duration? _lastEnter;

  /// 全局按键（web onInputKeydown）：仅当焦点在编辑器某输入框时处理
  bool _globalKey(KeyEvent event) {
    if (event is! KeyDownEvent) return false;
    final f = FocusManager.instance.primaryFocus;
    if (f == null) return false;
    _StInput? inp;
    for (final m in _mids) {
      if (m.focus == f) {
        inp = m;
        break;
      }
    }
    if (inp == null && _last.focus == f) inp = _last;
    if (inp == null) return false;
    return _onKey(inp, f, event) == KeyEventResult.handled;
  }

  void _watchFocus(_StInput it) {
    it.focus.addListener(() {
      if (it.focus.hasFocus) _focusedInput = it;
      final any = _mids.any((m) => m.focus.hasFocus) || _last.focus.hasFocus;
      if (any && !_focused) {
        setState(() => _focused = true);
        _openPop();
      }
    });
  }

  void _onAnyText() {
    // 用户需求：输入框宽恒 1px（不随文本扩宽）
    for (final m in _mids) {
      m.width = 1.0;
    }
    if (mounted) setState(() {});
  }

  /// 文本真实渲染宽度（web canvas measureText 语义；12px 编辑器字体）
  double _textW(String s) {
    if (s.isEmpty) return 8; // web max(8, ceil(0)+2)
    final tp = TextPainter(
      text: TextSpan(
          text: s,
          style: const TextStyle(
              fontSize: 12, fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback)),
      textDirection: TextDirection.ltr,
    )..layout();
    return tp.width + 2;
  }

  // ---------- 数据（chips = AppState.searchTags） ----------
  List<String> get _chips => context.watch<AppState>().searchTags;

  void _syncMids(int chipCount) {
    final target = chipCount + 1;
    while (_mids.length < target) {
      final it = _StInput();
      _mids.add(it);
      it.controller.addListener(_onAnyText);
      _watchFocus(it);
    }
    while (_mids.length > target) {
      final it = _mids.removeLast();
      it.controller.removeListener(_onAnyText);
      it.dispose();
    }
  }

  // ---------- 编辑器操作（web st-editor.js 语义） ----------
  /// 封装：输入框文本 → 胶囊（插到该框前 = 列表尾部），清空框文本
  void _wrap(_StInput it, String kw) {
    final v = kw.trim();
    if (v.isEmpty) return;
    final state = context.read<AppState>();
    final added = state.addSearchTag(v);
    it.controller.clear();
    it.width = 1.0;
    if (added) {
      VsToast.show(context, '已添加搜索标签：$v');
    } else {
      VsToast.show(context, '搜索标签已存在：$v');
    }
  }

  /// Enter 语义（web handleEnter）：ctrl=false 全量封装所有输入框 +
  /// 搜索；ctrl=true 只封装当前框
  void _handleEnter(bool ctrl, _StInput inp) {
    if (ctrl) {
      _wrap(inp, inp.controller.text);
      return;
    }
    for (final it in _mids) {
      _wrap(it, it.controller.text);
    }
    _wrap(_last, _last.controller.text);
    final state = context.read<AppState>();
    widget.onSearch(state.searchTags.join(' '));
    _closePop();
  }

  /// Backspace（光标前为空）：删前一胶囊 + 前一输入框内容并入当前框
  void _backspace(_StInput inp) {
    final i = _mids.indexOf(inp);
    if (i <= 0) return; // 首框前无元素
    final state = context.read<AppState>();
    final chips = state.searchTags;
    if (i - 1 >= chips.length) return;
    final front = _mids[i - 1];
    inp.controller.text =
        [front.controller.text, inp.controller.text].where((s) => s.isNotEmpty).join(' ');
    front.controller.removeListener(_onAnyText);
    front.dispose();
    _mids.removeAt(i - 1);
    state.removeSearchTag(chips[i - 1]);
    inp.focus.requestFocus();
  }

  /// Delete（光标后为空）：删后一胶囊 + 后一输入框内容并入当前框
  void _delete(_StInput inp) {
    final i = _mids.indexOf(inp);
    final state = context.read<AppState>();
    final chips = state.searchTags;
    if (i < 0 || i >= chips.length) return; // 末尾框/无后胶囊
    final after = _mids[i + 1];
    inp.controller.text =
        [inp.controller.text, after.controller.text].where((s) => s.isNotEmpty).join(' ');
    after.controller.removeListener(_onAnyText);
    after.dispose();
    _mids.removeAt(i + 1);
    state.removeSearchTag(chips[i]);
    inp.focus.requestFocus();
  }

  /// 键盘处理（web onInputKeydown）
  KeyEventResult _onKey(_StInput inp, FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final k = event.logicalKey;
    if (k == LogicalKeyboardKey.enter) {
      // 长按自动重复节流（web e.repeat 语义）
      if (_lastEnter != null &&
          event.timeStamp - _lastEnter! < const Duration(milliseconds: 150)) {
        return KeyEventResult.handled;
      }
      _lastEnter = event.timeStamp;
      final ctrl = HardwareKeyboard.instance.isControlPressed ||
          HardwareKeyboard.instance.isMetaPressed;
      _handleEnter(ctrl, inp);
      return KeyEventResult.handled;
    }
    if (k == LogicalKeyboardKey.backspace &&
        inp.controller.selection.isCollapsed &&
        inp.controller.selection.baseOffset == 0) {
      _backspace(inp);
      return KeyEventResult.handled;
    }
    if (k == LogicalKeyboardKey.delete &&
        inp.controller.selection.isCollapsed &&
        inp.controller.selection.baseOffset == inp.controller.text.length) {
      _delete(inp);
      return KeyEventResult.handled;
    }
    // 方向键跨输入框
    if (k == LogicalKeyboardKey.arrowLeft &&
        inp.controller.selection.isCollapsed &&
        inp.controller.selection.baseOffset == 0) {
      final i = _mids.indexOf(inp);
      if (i > 0) {
        final prev = _mids[i - 1];
        prev.focus.requestFocus();
        prev.controller.selection = TextSelection.collapsed(
            offset: prev.controller.text.length);
        return KeyEventResult.handled;
      }
    }
    if (k == LogicalKeyboardKey.arrowRight &&
        inp.controller.selection.isCollapsed &&
        inp.controller.selection.baseOffset == inp.controller.text.length) {
      final i = _mids.indexOf(inp);
      if (i >= 0 && i < _mids.length - 1) {
        final next = _mids[i + 1];
        next.focus.requestFocus();
        next.controller.selection = const TextSelection.collapsed(offset: 0);
        return KeyEventResult.handled;
      }
      if (i == _mids.length - 1) {
        _last.focus.requestFocus();
        _last.controller.selection = const TextSelection.collapsed(offset: 0);
        return KeyEventResult.handled;
      }
    }
    return KeyEventResult.ignored;
  }

  /// 中间内容宽度估算（chips + 中间输入框；web textW 语义）
  double _midContentWidth() {
    var w = 0.0;
    for (var i = 0; i < _mids.length; i++) {
      w += _mids[i].width;
      if (i < _chips.length) {
        w += _textW(_chips[i]) + 16; // chip 文本 + padding 16（gap=0）
      }
    }
    return w;
  }

  // ---------- 浮层（web .vshell-nav-popover：覆盖搜索框、head 含编辑器） ----------
  void _openPop() {
    if (_closing) {
      // web openTagPop：浮层消失中再次聚焦 → 取消 leaving 恢复显示
      _closing = false;
      _popCtrl.forward();
      return;
    }
    if (_pop != null) return;
    final overlay = Overlay.of(context);
    _pop = OverlayEntry(builder: (ctx) {
      final box = _boxKey.currentContext?.findRenderObject() as RenderBox?;
      final pos = box == null
          ? Offset.zero
          : box.localToGlobal(Offset.zero, ancestor: overlay.context.findRenderObject());
      final w = box?.size.width ?? 520;
      return Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              key: _popKey,
              behavior: HitTestBehavior.translucent,
              onTap: () => _closePop(),
            ),
          ),
          // 浮层卡片：覆盖搜索框位置（top/left/right:-1px 外扩盖边框），
          // head = 胶囊编辑器 + clear + divider + searchBtn（web 覆盖式 head）；
          // 显隐动画：pop-in 140ms 纯淡入 / pop-out 140ms 淡出上移 4px
          Positioned(
            top: pos.dy - 1,
            left: pos.dx - 1,
            width: w + 2,
            child: FadeTransition(
              opacity: _popCtrl,
              child: SlideTransition(
                // ReverseAnimation：显示时位移 0（pop-in 纯淡入），
                // 关闭（reverse）时 0 → -4px 上移（web pop-out forwards）
                position: Tween(
                        begin: const Offset(0, -4 / 900), end: Offset.zero)
                    .animate(ReverseAnimation(_popCtrl)),
                child: _buildPopCard(),
              ),
            ),
          ),
        ],
      );
    });
    overlay.insert(_pop!);
    _popCtrl.value = 0;
    _popCtrl.forward();
    // 手动同步焦点（web DOM 移动保留焦点；Flutter 编辑器从框内切到浮层
    // head 会卸载重挂——post-frame 把焦点同步回"展开前聚焦的同一输入框"，
    // 与切换同帧完成（build 后 paint 前），避免焦点丢失的中间帧闪动）
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _pop != null && !_closing) {
        (_focusedInput ?? _last).focus.requestFocus();
      }
    });
  }

  /// 关闭浮层（web closeTagPop：leaving 140ms 淡出上移 → 150ms 后移除；
  /// __leaving 防重入）
  void _closePop() {
    if (_pop == null) return;
    if (_closing) return;
    _closing = true;
    if (_focused) setState(() => _focused = false);
    _popCtrl.reverse().whenComplete(() {
      if (!mounted) return;
      _pop?.remove();
      _pop = null;
      _closing = false;
      _popCtrl.value = 1;
      // 手动同步焦点回框内编辑器：浮层移除后框内 _editorRow 重新挂载
      // （_staticEditor → _editorRow 切换），post-frame 把焦点同步回
      // 收起前聚焦的同一输入框——与切换同帧完成，避免焦点丢失闪动
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) (_focusedInput ?? _last).focus.requestFocus();
      });
    });
  }

  /// 浮层卡片（web .vshell-nav-popover：surface-bg、border、r8、shadow-lg、
  /// padding 0 3px 3px、flex column gap 6；vshell-pop-in 140ms）
  /// 注意：OverlayEntry 直插 root Overlay，无 Material 祖先——
  /// TextField 断言需要 Material，最外层必须包透明 Material
  Widget _buildPopCard() {
    return Material(
      type: MaterialType.transparency,
      child: Container(
      decoration: BoxDecoration(
        color: VsTheme.surface,
        border: Border.all(color: VsTheme.border),
        borderRadius: BorderRadius.circular(8),
        boxShadow: const [
          BoxShadow(color: Color(0x24000000), blurRadius: 12),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(3, 0, 3, 3),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ---- head：编辑器 + clear + divider + searchBtn（高 30 = 搜索框）----
          SizedBox(
            height: 30,
            child: Row(
              children: [
                Expanded(child: _editorRow()),
                _clearBtn(),
                _divider(),
                _searchBtn(),
              ],
            ),
          ),
          const SizedBox(height: 6),
          // ---- body：角色快捷区（web .vshell-nav-tagpop） ----
          _buildPopBody(),
        ],
      ),
      ),
    );
  }

  /// 浮层 body：角色快捷区（web .vshell-nav-tagpop：v0.5.0 标签→角色）
  Widget _buildPopBody() {
    final svc = CharactersService.instance;
    final chars = svc.chars;
    final body = chars.isEmpty
        ? Padding(
            padding: const EdgeInsets.all(8),
            child: Text(
              '暂无角色。可在导航栏「角色」面板中添加。',
              style: TextStyle(
                  color: VsTheme.fgDim, fontSize: 12, height: 1.5),
            ),
          )
        : Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final ch in chars)
                _TagPopChip(
                  name: ch.name,
                  onTap: () {
                    final state = context.read<AppState>();
                    final added = state.addSearchTag(ch.name);
                    VsToast.show(context, added ? '已添加搜索标签：${ch.name}' : '搜索标签已存在：${ch.name}');
                    _last.focus.requestFocus();
                  },
                ),
            ],
          );
    // web body：max-height min(420px, 60vh) 滚动
    return ConstrainedBox(
      constraints: BoxConstraints(
          maxHeight: math.min(420, MediaQuery.sizeOf(context).height * 0.6)),
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 3),
        child: body,
      ),
    );
  }

  // ---------- 渲染 ----------
  @override
  Widget build(BuildContext context) {
    final chips = _chips;
    _syncMids(chips.length);
    return LayoutBuilder(builder: (c, cons) {
      // web width: min(520px, 44vw)
      final w = (cons.maxWidth * 0.44).clamp(120.0, 520.0);
      return MouseRegion(
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: AnimatedContainer(
          key: _boxKey,
          duration: const Duration(milliseconds: 160),
          width: w,
          height: 30,
          decoration: BoxDecoration(
            // hover 或有胶囊未聚焦 → 背景 #181818（web）
            color: _focused
                ? VsTheme.inputBg
                : (_hover || chips.isNotEmpty ? VsTheme.bg : VsTheme.inputBg),
            border: Border.all(color: VsTheme.inputBorder),
            borderRadius: BorderRadius.circular(8),
          ),
          padding: const EdgeInsets.only(left: 3, right: 6),
          child: Row(
            children: [
              // 胶囊编辑器：浮层展开时编辑器渲染在浮层 head（覆盖式），
              // 框内只留静态胶囊摘要（web 覆盖式 head 语义）
              Expanded(
                child: _pop != null ? _staticEditor() : _editorRow(),
              ),
            ],
          ),
        ),
      );
    });
  }

  /// 胶囊编辑器主体（web .vshell-st-editor：flex:1 可横滚；
  /// 中间输入框 + 胶囊交替，末尾自适应输入框 is-last）
  Widget _editorRow() {
    final chips = _chips;
    return GestureDetector(
      // 点击空白/缝隙 → 按水平距离就近聚焦输入框（web v0.3.60）
      onTapUp: (d) => _focusNearest(d.localPosition),
      child: LayoutBuilder(builder: (c, cons) {
        // 末尾框宽 = 编辑器剩余（web is-last flex:1 语义）；
        // 中间内容宽估算（TextPainter）
        final midW = _midContentWidth();
        final lastW =
            (cons.maxWidth - midW).clamp(60.0, cons.maxWidth);
        return Row(
          children: [
            // 中间内容（非 flex：按内容宽；超宽时可横滚）
            Flexible(
              fit: FlexFit.loose,
              child: SingleChildScrollView(
                controller: _midScroll,
                scrollDirection: Axis.horizontal,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (var i = 0; i < _mids.length; i++) ...[
                      _inputField(_mids[i], i),
                      if (i < chips.length) _chip(chips[i], i),
                    ],
                  ],
                ),
              ),
            ),
            // 末尾自适应输入框（web is-last flex:1 min-width 60；高度自适应）
            SizedBox(
              width: lastW,
              child: _inputField(_last, _mids.length, isLast: true),
            ),
          ],
        );
      }),
    );
  }

  /// 就近聚焦（web editor click：按 |(left+width/2)-x| 最近输入框）。
  /// 纯数学定位——GlobalKey 挂在 LayoutBuilder 动态子树会导致
  /// retakeInactiveElement 撕裂 element 树（LateInitializationError: _children）
  void _focusNearest(Offset lp) {
    _StInput? best;
    var bestD = double.infinity;
    // 中间框中心（视口内 x = 累计宽 + 半宽 - 横滚偏移）
    final off = _midScroll.hasClients ? _midScroll.offset : 0.0;
    var x = 0.0;
    for (var i = 0; i < _mids.length; i++) {
      final c = x + _mids[i].width / 2 - off;
      final d = (lp.dx - c).abs();
      if (d < bestD) {
        bestD = d;
        best = _mids[i];
      }
      x += _mids[i].width;
      if (i < _chips.length) x += _chipW(_chips[i]);
    }
    // 末尾框中心 = 编辑器宽 - 末尾框半宽（编辑器宽 ≈ 搜索框宽 - padding 9）
    final boxW =
        (_boxKey.currentContext?.findRenderObject() as RenderBox?)?.size.width ??
            520;
    final editorW = boxW - 9;
    final midW = _midContentWidth();
    final lastW = (editorW - midW).clamp(60.0, editorW);
    final lc = editorW - lastW / 2;
    final ld = (lp.dx - lc).abs();
    if (ld < bestD) best = _last;
    if (best != null) {
      best!.focus.requestFocus();
      best.controller.selection =
          TextSelection.collapsed(offset: best.controller.text.length);
    }
  }

  /// 胶囊渲染宽估算（与 _midContentWidth 一致：文本 + padding 16；gap=0）
  double _chipW(String kw) => _textW(kw) + 16;

  /// 浮层展开时框内静态胶囊摘要（编辑器渲染在浮层 head；本视图被覆盖）
  Widget _staticEditor() {
    final chips = _chips;
    return GestureDetector(
      onTap: () => _last.focus.requestFocus(),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < chips.length; i++) _chip(chips[i], i),
          ],
        ),
      ),
    );
  }

  Widget _inputField(_StInput it, int idx, {bool isLast = false}) {
    // 用户需求（调试态）：gap=0；输入框被 box 包裹——box 上下 padding=0、
    // 常态左右 padding=2、hover 时=4；输入框宽 1px。
    // box/input 用不同颜色调试（TEMP-DIAG，确认结构后移除）：
    // box = 红 0x66FF0000，input = 绿 0x6600FF00
    const boxDiag = Color(0x66FF0000);
    const inputDiag = Color(0x6600FF00);
    // 局部 setState（StatefulBuilder）：浮层展开后编辑器在 OverlayEntry
    // 树里，外层 setState 不重建浮层——hover pad 变化必须局部生效；
    // pad 必须在 builder 内计算（局部重建时才能读到最新 hover）
    return StatefulBuilder(
      builder: (ctx, setLocal) {
        final pad = (it.focus.hasFocus || it.hover) ? 4.0 : 2.0;
        return MouseRegion(
        onEnter: (_) {
          it.hover = true;
          setLocal(() {});
        },
        onExit: (_) {
          it.hover = false;
          setLocal(() {});
        },
        child: Container(
          color: boxDiag, // box 背景（含 padding 区）
          child: AnimatedPadding(
            duration: const Duration(milliseconds: 120),
            padding: EdgeInsets.symmetric(horizontal: pad), // 上下 0
            child: Container(
              color: inputDiag, // input 背景
              child: SizedBox(
          width: isLast ? null : it.width,
          // 占满输入区高度（用户要求）：输入区 = 搜索框容器高 30px，
          // 文字 textAlignVertical.center 垂直居中
          height: 30,
          child: TextField(
            controller: it.controller,
            focusNode: it.focus,
            textAlignVertical: TextAlignVertical.center,
            expands: true,
            maxLines: null,
            // 光标高度与居中（关键）：用 TextStyle.height 而非 strut——
            // textAlignVertical.center 的对齐基准 = TextPainter.height，
            // strut 行盒不计入 TextPainter.height（offset 按字体默认行高
            // ~13.3 算，光标却按 strut 行盒 20 画 → 光标偏下 ~3 逻辑）；
            // TextStyle.height 直接设行盒 20 = 12×1.667，TextPainter.height
            // 与光标高度同源 → 精确居中。20 ≈ 输入框 2/3（web 22px 框内
            // 15px 光标 68% 比例）
            style: const TextStyle(
              fontSize: 12,
              height: 1.667,
              fontFamily: VsTheme.fontFamily,
              fontFamilyFallback: VsTheme.fontFamilyFallback,
            ),
            decoration: const InputDecoration(
              // 显式关闭 Theme inputDecorationTheme(filled:true, inputBg)
              // 的继承——否则每个 TextField 画 inputBg 背景，宽输入框
              // 会盖住 box 调试色/后续正常背景
              filled: false,
              isDense: true,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              contentPadding: EdgeInsets.zero,
            ),
          ),
        ),
        ),
      ),
      ),
    );
      },
    );
  }

  /// 胶囊（web .vshell-st-chip：22 高、r6、toolbar-hover、12px；
  /// hover 右上 12x12 圆删除钮骑跨 -4px）
  Widget _chip(String kw, int idx) {
    return _HoverBubble(
        builder: (hover, child) => GestureDetector(
          onTap: () {
            // 点击胶囊 → 焦点移到其后的输入框（web）
            final target = idx + 1 < _mids.length ? _mids[idx + 1] : _last;
            target.focus.requestFocus();
          },
          child: Container(
            height: 22,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: VsTheme.toolbarHover,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 140),
                  child: Text(
                    kw,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 12,
                        height: 1,
                        fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
                  ),
                ),
                if (hover)
                  Positioned(
                    top: -4,
                    right: -4,
                    child: _HoverBubble(
                      builder: (delHover, _) => GestureDetector(
                        onTap: () =>
                            context.read<AppState>().removeSearchTag(kw),
                        child: Container(
                          width: 12,
                          height: 12,
                          decoration: BoxDecoration(
                            color: delHover
                                ? VsTheme.error
                                : VsTheme.inputBg,
                            shape: BoxShape.circle,
                            border: delHover
                                ? null
                                : Border.all(color: VsTheme.border),
                            boxShadow: const [
                              BoxShadow(
                                  color: Color(0x59000000),
                                  blurRadius: 2,
                                  offset: Offset(0, 1)),
                            ],
                          ),
                          child: Icon(VsIcons.close,
                              size: 8,
                              color: delHover ? Colors.white : VsTheme.fg),
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

  /// 清空按钮（web .vshell-nav-clear：14x14 圆、icon 8px、hover 红）
  Widget _clearBtn() {
    return Padding(
      padding: const EdgeInsets.only(right: 3),
      child: _HoverBubble(
        builder: (hover, child) => GestureDetector(
          onTap: () {
            context.read<AppState>().clearSearchTags();
            for (final m in _mids) {
              m.controller.clear();
              m.width = 1.0;
            }
            _last.controller.clear();
          },
          child: Container(
            width: 14,
            height: 14,
            decoration: BoxDecoration(
              color: hover ? VsTheme.toolbarHover : Colors.transparent,
              shape: BoxShape.circle,
            ),
            child: Icon(VsIcons.close,
                size: 8,
                color: hover ? VsTheme.error : VsTheme.fgDim),
          ),
        ),
      ),
    );
  }

  /// 竖分割线（web .vshell-nav-divider：1x16 sideBar-border）
  Widget _divider() {
    return Container(
      width: 1,
      height: 16,
      margin: const EdgeInsets.only(right: 3),
      color: VsTheme.border,
    );
  }

  /// 搜索按钮（web .vshell-nav-search-btn：20x20 r5、hover toolbar-hover、
  /// icon 12px；点击 = 单独按 Enter）
  Widget _searchBtn() {
    return Padding(
      padding: const EdgeInsets.only(right: 3),
      child: _HoverBubble(
        builder: (hover, child) => GestureDetector(
          onTap: () => _handleEnter(false, _last),
          child: Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: hover ? VsTheme.toolbarHover : Colors.transparent,
              borderRadius: BorderRadius.circular(5),
            ),
            child: Icon(VsIcons.search,
                size: 12, color: VsTheme.fg),
          ),
        ),
      ),
    );
  }
}

/// 输入框控制（controller + focus + 中间框宽度 + hover）
class _StInput {
  final controller = TextEditingController();
  final focus = FocusNode();
  bool hover = false;
  double width = 1.0; // 输入框宽 1px（用户需求）

  void dispose() {
    controller.dispose();
    focus.dispose();
  }
}

/// 浮层角色快捷 chip（web .vshell-nav-tagpop-chip：26 高、r6、
/// sideBar-border + toolbar-hover、hover list-hover + focusBorder、
/// addicon charts-blue 12px + name 12px）
class _TagPopChip extends StatefulWidget {
  const _TagPopChip({required this.name, required this.onTap});

  final String name;
  final VoidCallback onTap;

  @override
  State<_TagPopChip> createState() => _TagPopChipState();
}

class _TagPopChipState extends State<_TagPopChip> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          height: 26,
          padding: const EdgeInsets.only(left: 5, right: 10),
          decoration: BoxDecoration(
            color: _hover ? VsTheme.listHover : VsTheme.toolbarHover,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(
                color: _hover ? VsTheme.accent : VsTheme.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(VsIcons.add, size: 12, color: VsTheme.watchBlue),
              const SizedBox(width: 3),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 160),
                child: Text(
                  widget.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 12, color: VsTheme.fg,
                      fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// hover 状态小工具（120ms 语义）
class _HoverBubble extends StatefulWidget {
  const _HoverBubble({required this.builder});

  final Widget Function(bool hover, Widget child) builder;

  @override
  State<_HoverBubble> createState() => _HoverBubbleState();
}

class _HoverBubbleState extends State<_HoverBubble> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: widget.builder(_hover, const SizedBox.shrink()),
    );
  }
}

/// 主题切换图标（web 自绘太阳/月亮 SVG——codicon 无 sun/moon，CustomPaint 复刻）
class _ThemeIcon extends StatelessWidget {
  const _ThemeIcon({required this.light});

  final bool light;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size(16, 16),
      painter: _ThemeIconPainter(light: light, color: VsTheme.fg),
    );
  }
}

class _ThemeIconPainter extends CustomPainter {
  _ThemeIconPainter({required this.light, required this.color});

  final bool light;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    if (light) {
      // 太阳：圆 + 8 射线
      canvas.drawCircle(c, 3.4, paint);
      final ray = Paint()
        ..color = color
        ..strokeWidth = 1.6
        ..strokeCap = StrokeCap.round;
      for (var i = 0; i < 8; i++) {
        final a = i * math.pi / 4;
        final r0 = 5.6;
        final r1 = 7.6;
        canvas.drawLine(
          c + Offset(math.cos(a) * r0, math.sin(a) * r0),
          c + Offset(math.cos(a) * r1, math.sin(a) * r1),
          ray,
        );
      }
    } else {
      // 月亮：圆 + 缺口
      final p2 = Paint()
        ..color = VsTheme.bg
        ..style = PaintingStyle.fill;
      canvas.drawCircle(c, 5.6, paint);
      canvas.drawCircle(c + const Offset(2.2, -1.2), 4.4, p2);
    }
  }

  @override
  bool shouldRepaint(_ThemeIconPainter old) =>
      old.light != light || old.color != color;
}
