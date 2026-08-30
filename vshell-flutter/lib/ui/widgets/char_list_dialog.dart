/// 角色列表浮窗（web char-picker.js list()：导航栏「角色」按钮入口）
/// v0.5.6 第十一轮：两列长条（背景图 + 暗遮罩 + 左头像 + 白字名）、
/// 右上角「打开角色管理」、每角色右侧关注按钮（已关注置顶 + 红点）、
/// 点击长条进角色主页；v0.5.6 第二十一轮：关注后立即置顶重排
library;

import 'dart:convert';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/characters.dart';
import '../../state/app_state.dart';
import '../../theme/char_banners.dart';
import '../../theme/vs_icons.dart';
import '../../theme/vs_theme.dart';
import 'vs_toast.dart';
import 'char_panel_dialog.dart';

/// 打开角色列表浮窗（导航栏「角色」按钮）
Future<void> showCharListDialog(BuildContext context) {
  // 与 char_picker 一致的 backdrop：blur(3px) + rgba(0,0,0,0.5)
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: const Color(0x80000000),
    transitionDuration: const Duration(milliseconds: 150),
    pageBuilder: (ctx, _, __) => Stack(
      children: [
        Positioned.fill(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 3, sigmaY: 3),
            child: const SizedBox.expand(),
          ),
        ),
        const Center(child: _CharListDialog()),
      ],
    ),
  );
}

class _CharListDialog extends StatefulWidget {
  const _CharListDialog();

  @override
  State<_CharListDialog> createState() => _CharListDialogState();
}

class _CharListDialogState extends State<_CharListDialog> {
  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final svc = CharactersService.instance;
    final app = context.read<AppState>();
    // 已关注置顶（web followed.concat(rest)）
    final chars = svc.followedFirst();

    return Dialog(
      backgroundColor: VsTheme.overlayBg,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      child: Container(
        width: 560,
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 标题行 + 右上角「打开角色管理」（web headerRight）
            Row(
              children: [
                Expanded(
                  child: Text(
                    '角色列表',
                    style: TextStyle(
                      color: VsTheme.fg,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      height: 1.3,
                      fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
                    ),
                  ),
                ),
                // web .vshell-btn-secondary + gear icon → 打开角色管理
                // 面板浮窗（web char-panel：列表 pop → panel 打开；
                // panel 关闭后自动回列表，showCharPanel 内处理）
                GestureDetector(
                  onTap: () async {
                    Navigator.of(context).pop();
                    await showCharPanel(context);
                  },
                  child: Container(
                    height: 32,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: VsTheme.border),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(VsIcons.gear, size: 14, color: VsTheme.fg),
                        const SizedBox(width: 6),
                        Text(
                          '角色管理',
                          style: TextStyle(
                            color: VsTheme.fg,
                            fontSize: 13,
                            fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (chars.isEmpty)
              Padding(
                padding: const EdgeInsets.all(24),
                child: Center(
                  child: Text(
                    '还没有角色——点击右上角「角色管理」添加',
                    style: TextStyle(
                      color: VsTheme.fgDim,
                      fontSize: 12,
                      fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
                    ),
                  ),
                ),
              )
            else
              // 两列长条网格（web .vshell-char-list2：grid 2 列 gap 8
              // max-height 420）
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 420),
                child: GridView.builder(
                  shrinkWrap: true,
                  gridDelegate:
                      const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisExtent: 56,
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                  ),
                  itemCount: chars.length,
                  itemBuilder: (c, i) => _row(svc, app, chars[i]),
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// 角色长条（web charRow + follow）：背景图/默认 SVG + 暗遮罩 +
  /// 36px 圆头像 + 白字名 + 右侧关注按钮 + 已关注红点
  Widget _row(CharactersService svc, AppState app, Character c) {
    final followed = svc.isFollowed(c.name);
    return GestureDetector(
      onTap: () {
        Navigator.of(context).pop();
        app.go(PageType.role, name: c.name);
      },
      child: Container(
        height: 56,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: VsTheme.border),
        ),
        child: Stack(
          // ⑥ 修复：默认 topStart 会把非 Positioned 子项贴顶（控件偏上）
          alignment: Alignment.center,
          children: [
            // 背景：自定义 banner 优先，无则默认手绘 SVG（web JS：
            // bg = c.banner || charBanners.bannerFor(c.name)）
            Positioned.fill(
              child: c.banner.isNotEmpty
                  ? Image.memory(
                      base64Decode(c.banner.split(',')[1]),
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => charBannerLayer(c.name),
                    )
                  : charBannerLayer(c.name),
            ),
            // 暗遮罩（web JS charRow：linear-gradient(180deg,
            // rgba(0,0,0,0.45), rgba(0,0,0,0.78))；上下溢出 2px 由
            // 外层 Clip.antiAlias 裁掉——消除渐变末端亮线缝隙）
            const Positioned(
              left: 0,
              right: 0,
              top: -2,
              bottom: -2,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0x73000000), Color(0xC7000000)],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  _avatar(c),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      c.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        shadows: [
                          Shadow(
                              color: Color(0xD9000000),
                              blurRadius: 3,
                              offset: Offset(0, 1)),
                        ],
                      ),
                    ),
                  ),
                  // 已关注红点（web .vshell-tag-followed-dot：6px
                  // errorForeground，样式同视频卡收藏圆点）
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: followed ? VsTheme.error : Colors.transparent,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  // 关注按钮（web 18px 圆 rgba(0,0,0,0.45)，
                  // 已关注对勾且背景不变 + follow-in 动画）
                  GestureDetector(
                    onTap: () {
                      final wasFollowed = svc.isFollowed(c.name);
                      svc.toggleFollow(c.name);
                      _toast(context, wasFollowed
                          ? '已取消关注：${c.name}'
                          : '已关注角色：${c.name}');
                      // 关注后立即置顶重排（web onFollowed: renderRows）
                      setState(() {});
                    },
                    child: Container(
                      width: 18,
                      height: 18,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: Color(0x73000000),
                      ),
                      child: Center(
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 180),
                          transitionBuilder: (child, anim) =>
                              FadeTransition(
                            opacity: anim,
                            child: SlideTransition(
                              position: Tween(
                                      begin: const Offset(0, 0.1),
                                      end: Offset.zero)
                                  .animate(anim),
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
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _avatar(Character c) {
    Widget inner;
    if (c.icon.isNotEmpty && c.icon.startsWith('data:')) {
      try {
        final b64 = c.icon.split(',')[1];
        inner = ClipOval(
          child: Image.memory(
            base64Decode(b64),
            width: 36,
            height: 36,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _letterAvatar(c),
          ),
        );
      } catch (_) {
        inner = _letterAvatar(c);
      }
    } else {
      inner = _letterAvatar(c);
    }
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
              offset: Offset(0, 1)),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: inner,
    );
  }

  Widget _letterAvatar(Character c) {
    return Container(
      width: 36,
      height: 36,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0x29FFFFFF),
      ),
      child: Text(
        c.name.isEmpty ? '?' : c.name.characters.first.toUpperCase(),
        style: const TextStyle(
            color: Colors.white,
            fontSize: 15,
            fontWeight: FontWeight.w600,
            height: 1),
      ),
    );
  }

  void _toast(BuildContext context, String msg) {
    VsToast.show(context, msg);
  }
}


