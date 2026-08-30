/// 视频卡片（像素级复刻 web 版 .vsc-video-card）
/// 对照 vshell/src/styles/components.css：
/// - 卡片容器：border 1px sideBar-border + radius 8 + bg #181818 + shadow-lg
/// - 媒体区 16:9 + shade 渐变（transparent 55% → editor-background）+ 时长/播放数
/// - 右上 3x3 圆点 / 左上 40x40 角色角标 / hover 滑入操作层（28x28）
/// - 文字区：标题两行占位（1.8 行高）+ meta 单行两端（owner 左 / 日期右）
/// - cover 布局：body 隐藏、标题浮层 top 渐变、底部 44px 渐变、右下 [日期][时长]
library;

import 'vs_border_painter.dart';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';

import '../../data/models.dart';
import '../../services/characters.dart';
import '../../state/app_state.dart';
import '../../theme/vs_icons.dart';
import '../../theme/vs_theme.dart';
import 'char_picker_dialog.dart';
import 'vs_toast.dart';
import 'package:provider/provider.dart';

/// web 布局切换：.vshell-wall.is-cover（封面布局）/ 默认 standard
enum CardLayout { standard, cover }

class VideoCard extends StatefulWidget {
  final VideoItem item;
  final VoidCallback? onTap;
  final bool showOwner; // 角色主页等隐藏 owner
  final bool showDate;
  final bool featured; // 代表作金点
  final bool showFeatureBtn; // 角色主页：hover 显示代表作星标
  final VoidCallback? onFeatureTap;
  final CardLayout layout; // web .vshell-wall.is-cover
  final int index; // 入场动画延迟（web --i * 22ms）

  const VideoCard({
    super.key,
    required this.item,
    this.onTap,
    this.showOwner = true,
    this.showDate = true,
    this.featured = false,
    this.showFeatureBtn = false,
    this.onFeatureTap,
    this.layout = CardLayout.standard,
    this.index = 0,
  });

  @override
  State<VideoCard> createState() => _VideoCardState();
}

class _VideoCardState extends State<VideoCard> {
  bool _hover = false;

  /// 预览静音态（web 卡片 video 默认 muted；Flutter 暂无 hover 预览播放，
  /// 按钮保留视觉与状态，预览功能裁剪见 _audit_gap_list.md C6）
  bool _muted = true;

  /// 预览播放态/进度（web is-previewing 时 2px 进度条浮现；Flutter 暂无预览）
  bool _previewing = false;
  double _previewProgress = 0;

  /// 圆点 3x3 布局（web 版 MARK_POS：5 2 1 / 6 4 3 / 9 8 7）
  /// 顺序：本地 → 收藏 → 代表作 → 待看（连续填 1..n）
  static const _gridPos = <int, (int, int)>{
    1: (0, 2), // 右上
    2: (0, 1),
    3: (1, 2), // 中右
    4: (1, 1),
    5: (0, 0),
    6: (1, 0),
    7: (2, 2),
    8: (2, 1),
    9: (2, 0),
  };

  @override
  Widget build(BuildContext context) {
    final it = widget.item;
    final state = context.watch<AppState>();
    final isWatch = state.isWatch(it.id);
    final isFav = state.isFav(it.id);
    // 角色匹配（角标显示；charFor 写内存态，不持久化）
    final charMatch = CharactersService.instance.charFor(it.id, it.title);

    // 可见圆点（连续填位）
    final marks = <Color>[];
    if (it.local) marks.add(VsTheme.localGreen);
    if (isFav) marks.add(VsTheme.favRed);
    if (widget.featured) marks.add(VsTheme.featGold);
    if (isWatch) marks.add(VsTheme.watchBlue);

    final cover = widget.layout == CardLayout.cover;
    final hasTagIcon = charMatch.kind != 'none';
    final isBlacklisted = state.isBlacklisted(it.id);
    // 物理像素单位（分隔线/边框对齐用）
    final dpr = MediaQuery.devicePixelRatioOf(context);

    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: _Rise(
          index: widget.index,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              // 内容层：Container（decoration 背景/圆角/阴影 + antiAlias 裁剪）
              Positioned.fill(
                child: Container(
                  decoration: BoxDecoration(
                    // mimic: web border 1px solid sideBar-border + radius 8 +
                    // shadow 0 0 12px rgba(0,0,0,0.14)（Flutter 高斯视觉重，
                    // 弱化为 0x1A + blur 5）。
                    // 边框由 VsBorderPainter 画（物理像素对齐 1px 四边均匀；
                    // Border.all 在 DPI 1.5 下光栅化取整 1-2 物理像素 = 粗）
                    color: VsTheme.bg,
                    // 临时试验：内容圆角 10.2（用户要求看效果；弧线仍 8.2）
                    borderRadius: BorderRadius.circular(10.2),
                    boxShadow: const [
                      // mimic: web shadow-lg 0 0 12px rgba(0,0,0,0.14)（alpha 相同
                      // 0x24；高斯 blur8 视觉 ≈ CSS 12px 线性扩散）
                      BoxShadow(color: Color(0x24000000), blurRadius: 8),
                    ],
                  ),
                  // antiAlias：图片圆角平滑（无 hardEdge 像素化阶梯/凸出）；
                  // 过渡带被同半径弧线（r12.3）覆盖主体，仅剩 0.17px 微过渡
                  clipBehavior: Clip.antiAlias,
                  child: Container(
                    color: VsTheme.bg, // 卡片底（内容区底色）
                    // 内容由外层 Container 的 r8 圆角直接裁剪（图片边缘贴
                    // 到 r8 → 被边框线（r7.667）覆盖 → 圆角紧贴无深色缝；
                    // 不再用 ClipRRect(r7) 内缩 0.667 逻辑造成缝隙）
                    child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // ---- 媒体区 16:9（web border-bottom 1px sideBar-border）----
                      // Expanded 填满 cell 剩余（cell 高公式 = w*9/16 保证 16:9；
                      // 不用 AspectRatio——浮点除法路径差异会导致 0.875px overflow）
                      Expanded(
                        child: Stack(
                          fit: StackFit.expand,
                          // Stack 默认 clipBehavior=hardEdge 会裁掉 shade 的
                          // bottom:-2 溢出 → 渐变末行缺失（亮线根因）
                          clipBehavior: Clip.none,
                          children: [
                            // 图片底部收缩 1 物理 px（web media overflow:hidden 语义：
                            // 图片止于分隔线顶，1px 线下方无图片透出——
                            // 线 1 逻辑 = 1.5 物理，底行只有 50% 线强度，
                            // 不收缩则图片底缘 0.5px 透出成"亮线"）
                            Positioned(
                              left: 0,
                              top: 0,
                              right: 0,
                              bottom: 1 / dpr,
                              child: _cover(it),
                            ),
                            // 渐变层（shade/渐变条/标题浮层）统一管理
                            Stack(
                              fit: StackFit.expand,
                              children: [
                                  // shade：transparent 55% → editor-background
                                  // 底边行（行 781）由底边框线盖住，无需溢出
                                  Positioned(
                                    left: 0,
                                    top: 0,
                                    right: 0,
                                    bottom: 0,
                                    child: AnimatedOpacity(
                                      opacity: _hover ? 0 : 1,
                                      duration:
                                          const Duration(milliseconds: 120),
                                      child: DecoratedBox(
                                        decoration: BoxDecoration(
                                          gradient: LinearGradient(
                                            begin: Alignment.topCenter,
                                            end: Alignment.bottomCenter,
                                            colors: [
                                              Colors.transparent,
                                              // 末端用 web 渲染值 #1A1A1A
                                              const Color(0xFF1A1A1A),
                                            ],
                                            stops: const [0.55, 1],
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  // cover 布局：底部 44px 渐变条（hover 淡出）
                                  if (cover)
                                    Positioned(
                                      left: 0,
                                      right: 0,
                                      bottom: 0,
                                      child: AnimatedOpacity(
                                        opacity: _hover ? 0 : 1,
                                        duration: const Duration(
                                            milliseconds: 120),
                                        child: SizedBox(
                                          height: 44,
                                          width: double.infinity,
                                          child: DecoratedBox(
                                            decoration: BoxDecoration(
                                              gradient: LinearGradient(
                                                begin: Alignment.topCenter,
                                                end: Alignment.bottomCenter,
                                                colors: [
                                                  Colors.transparent,
                                                  Color(0x8C000000), // 0.55 黑
                                                ],
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  // cover 布局：标题浮层（top 渐变；hover 隐藏）
                                  if (cover)
                                    Positioned(
                                      left: 0,
                                      top: 0,
                                      right: 0,
                                      child: AnimatedOpacity(
                                        opacity: _hover ? 0 : 1,
                                        duration:
                                            const Duration(milliseconds: 120),
                                        child: Container(
                                          padding: EdgeInsets.only(
                                            left: hasTagIcon ? 54.0 : 10,
                                            right: 10,
                                            top: 10,
                                            bottom: 20,
                                          ),
                                          decoration: const BoxDecoration(
                                            gradient: LinearGradient(
                                              begin: Alignment.topCenter,
                                              end: Alignment.bottomCenter,
                                              colors: [
                                                Color(0xCC000000), // 0.8
                                                Color(0x66000000), // 0.4
                                                Colors.transparent,
                                              ],
                                            ),
                                          ),
                                          child: Text(
                                            it.title,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 13,
                                              fontWeight: FontWeight.w600,
                                              height: 1.35,
                                              fontFamily: VsTheme.fontFamily,
                                              fontFamilyFallback: VsTheme
                                                  .fontFamilyFallback,
                                              shadows: [
                                                Shadow(
                                                  color: Color(0xE6000000),
                                                  blurRadius: 3,
                                                  offset: Offset(0, 1),
                                                ),
                                                Shadow(
                                                  color: Color(0x73000000),
                                                  blurRadius: 10,
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                              ),
                            // 左上：角色角标（40x40；hover 隐藏让位给收藏按钮）
                            // 用户要求：头像在渐变阴影上方 → 置于标题浮层之后
                            if (!_hover && hasTagIcon)
                              Positioned(
                                left: 8,
                                top: 8,
                                child: _CharBadge(
                                  charMatch: charMatch,
                                  onTap: () => _openCharPicker(charMatch),
                                ),
                              ),
                            // 右上：3x3 圆点（hover 隐藏）
                            Positioned(
                              top: 8,
                              right: 8,
                              child: AnimatedOpacity(
                                opacity: _hover ? 0 : 1,
                                duration: const Duration(milliseconds: 120),
                                child: _DotsGrid(marks: marks),
                              ),
                            ),
                            // 左下：播放/弹幕（hover 隐藏）
                            Positioned(
                              left: 4,
                              bottom: 4,
                              child: AnimatedOpacity(
                                opacity: _hover ? 0 : 1,
                                duration: const Duration(milliseconds: 120),
                                child: Row(
                                  children: [
                                    const Icon(
                                      VsIcons.play,
                                      size: 12,
                                      color: Colors.white,
                                    ),
                                    const SizedBox(width: 3),
                                    _statText(it.viewText),
                                    if (it.danmakuCount > 0) ...[
                                      const SizedBox(width: 8),
                                      const Icon(
                                        VsIcons.comment,
                                        size: 12,
                                        color: Colors.white,
                                      ),
                                      const SizedBox(width: 3),
                                      _statText(
                                        it.danmakuCount >= 10000
                                            ? '${(it.danmakuCount / 10000).toStringAsFixed(1)}万'
                                            : '${it.danmakuCount}',
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ),
                            // 右下：时长（纯文字无底色；hover 隐藏）
                            if (it.duration > 0)
                              Positioned(
                                right: 4,
                                bottom: 4,
                                child: AnimatedOpacity(
                                  opacity: _hover ? 0 : 1,
                                  duration: const Duration(milliseconds: 120),
                                  child: cover
                                      ? Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            if (widget.showDate &&
                                                it.pubdate > 0) ...[
                                              Text(
                                                _fmtDate(it.pubdate),
                                                style: const TextStyle(
                                                  color: Colors.white,
                                                  fontSize: 11,
                                                  fontFamily:
                                                      VsTheme.fontFamily,
                                                  fontFamilyFallback: VsTheme
                                                      .fontFamilyFallback,
                                                ),
                                              ),
                                              const SizedBox(width: 6),
                                            ],
                                            Text(
                                              it.durationText,
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 11,
                                                fontFamily: VsTheme.fontFamily,
                                                fontFamilyFallback:
                                                    VsTheme.fontFamilyFallback,
                                              ),
                                            ),
                                          ],
                                        )
                                      : Text(
                                          it.durationText,
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 11,
                                            fontFamily: VsTheme.fontFamily,
                                            fontFamilyFallback:
                                                VsTheme.fontFamilyFallback,
                                          ),
                                        ),
                                ),
                              ),
                            // hover 操作层（web .vsc-video-actions：inset 0、opacity + translateY(-4px)
                            // 120ms 滑入；watch 右上 / star 左上 / feature 左中）
                            Positioned(
                              left: 4,
                              top: 4,
                              child: _HoverReveal(
                                show: _hover,
                                offset: const Offset(0, -0.14),
                                child: _ActionBtn(
                                  // web：star 未激活=heart 空心、激活=heart-filled 实心
                                  icon: isFav
                                      ? VsIcons.heartFilled
                                      : VsIcons.heart,
                                  active: isFav,
                                  activeColor: VsTheme.favRed,
                                  activeHoverColor: const Color(0xFFcd3131),
                                  tooltip: isFav ? '取消收藏' : '收藏',
                                  onTap: () => state.toggleFav(it),
                                ),
                              ),
                            ),
                            if (widget.showFeatureBtn &&
                                widget.onFeatureTap != null)
                              Positioned(
                                left: 40, // 4 + 28 + 8
                                top: 4,
                                child: _HoverReveal(
                                  show: _hover,
                                  offset: const Offset(0, -0.14),
                                  child: _ActionBtn(
                                    icon: widget.featured
                                        ? VsIcons.starFull
                                        : VsIcons.star,
                                    active: widget.featured,
                                    // web：feature 激活 = button-background（蓝，非金）
                                    activeColor: VsTheme.accent,
                                    activeHoverColor: VsTheme.accentHover,
                                    tooltip: widget.featured
                                        ? '取消代表作'
                                        : '设为代表作',
                                    onTap: widget.onFeatureTap!,
                                  ),
                                ),
                              ),
                            Positioned(
                              right: 4,
                              top: 4,
                              child: _HoverReveal(
                                show: _hover,
                                offset: const Offset(0, -0.14),
                                child: _ActionBtn(
                                  // web：watch 未激活=add(+)、激活=check(✓)
                                  icon: isWatch ? VsIcons.check : VsIcons.add,
                                  active: isWatch,
                                  // web：watch 激活 = button-background（蓝）
                                  activeColor: VsTheme.accent,
                                  activeHoverColor: VsTheme.accentHover,
                                  // 用户要求：只显示图标，不显示 tooltip 汉字
                                  tooltip: null,
                                  onTap: () => state.toggleWatch(it),
                                ),
                              ),
                            ),
                            // 静音（右下）/黑名单（左下）：28x28 r4、自底滑入 120ms
                            Positioned(
                              right: 4,
                              bottom: 4,
                              child: _HoverReveal(
                                show: _hover,
                                offset: const Offset(0, 0.14),
                                child: _CornerBtn(
                                  icon: _muted ? VsIcons.mute : VsIcons.unmute,
                                  tooltip: _muted ? '取消静音' : '静音',
                                  onTap: () => setState(() => _muted = !_muted),
                                ),
                              ),
                            ),
                            Positioned(
                              left: 4,
                              bottom: 4,
                              child: _HoverReveal(
                                show: _hover,
                                offset: const Offset(0, 0.14),
                                child: _CornerBtn(
                                  icon: VsIcons.circleSlash,
                                  tooltip: isBlacklisted ? '移出黑名单' : '加入黑名单',
                                  hoverColor: VsTheme.error,
                                  onTap: () => state.toggleBlacklist(it),
                                ),
                              ),
                            ),
                            // 卡片预览进度条（web 2px 贴底、track rgba(255,255,255,0.28)、
                            // fill kk-progress-color，仅预览播放时显示）
                            if (_previewing)
                              Positioned(
                                left: 0,
                                right: 0,
                                bottom: 0,
                                child: Container(
                                  height: 2,
                                  color: const Color(0x47FFFFFF),
                                  alignment: Alignment.centerLeft,
                                  child: FractionallySizedBox(
                                    alignment: Alignment.centerLeft,
                                    widthFactor: _previewProgress,
                                    child: Container(color: VsTheme.accent),
                                  ),
                                ),
                              ),
                            // 图片与信息区分隔线（standard 布局；用户要求加回；
                            // web media border-bottom 1px sideBar-border）
                            if (!cover)
                              Positioned(
                                left: 0,
                                right: 0,
                                bottom: 0,
                                child: IgnorePointer(
                                  child: Container(
                                    height: 1,
                                    color: VsTheme.border,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      // ---- 文字区（standard；cover 布局隐藏；web body flex:1 →
                      // meta 贴底）----
                      if (!cover)
                        Container(
                          // 固定高 92（= 各页网格比例公式 w/(w*9/16+92) 的文字区高）：
                          // Column 撑满 + spaceBetween → 标题顶 / meta 底
                          //（web title flex:1 + meta 贴底语义；不能 Expanded——
                          // 与媒体区组合触发 Windows 渲染黑屏，实测）
                          height: 92,
                          padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            // 替代 Spacer（Spacer/Expanded 与媒体区组合触发 Windows 渲染黑屏，实测）
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              // 标题：两行占位（1.8 行高 → 3.6em 固定高度）
                              Text(
                                it.title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: VsTheme.fg,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  height: 1.8,
                                  fontFamily: VsTheme.fontFamily,
                                  fontFamilyFallback:
                                      VsTheme.fontFamilyFallback,
                                ),
                              ),
                              // meta：单行两端（角色/冲突 左 / 日期右；min-height 16px）
                              // web .vsc-video-meta-owner（v0.5.4 起原 UP 位置显示角色）：
                              // 有角色 → [account icon + 角色名] 点击进角色主页；
                              // 冲突 → 红字「冲突」；无 → 只日期靠右（.no-owner flex-end）
                              Container(
                                margin: const EdgeInsets.only(top: 4),
                                constraints: const BoxConstraints(
                                  minHeight: 16,
                                ),
                                child: Row(
                                  children: [
                                    if (widget.showOwner &&
                                        charMatch.kind == 'conflict')
                                      Expanded(
                                        child: _OwnerName(
                                          name: '冲突',
                                          conflict: true,
                                          onTap: () =>
                                              _openCharPicker(charMatch),
                                        ),
                                      )
                                    else if (widget.showOwner &&
                                        charMatch.kind == 'char' &&
                                        charMatch.char != null)
                                      Expanded(
                                        child: _OwnerName(
                                          name: charMatch.char!.name,
                                          conflict: false,
                                          // web：角色名点击 → 角色主页
                                          onTap: () =>
                                              context.read<AppState>().go(
                                                PageType.role,
                                                name: charMatch.char!.name,
                                              ),
                                        ),
                                      )
                                    else
                                      // 无角色时占位（Expanded 替代 Spacer——
                                      // Spacer/Expanded 与媒体区组合触发 Windows 渲染黑屏）
                                      const Expanded(child: SizedBox.shrink()),
                                    if (widget.showDate && it.pubdate > 0)
                                      Text(
                                        _fmtDate(it.pubdate),
                                        style: TextStyle(
                                          color: VsTheme.fgDim,
                                          fontSize: 11,
                                          fontFamily: VsTheme.fontFamily,
                                          fontFamilyFallback:
                                              VsTheme.fontFamilyFallback,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              ),
              // 物理像素对齐边框线（覆盖整卡：媒体区+文字区；1px 物理对齐
              // 细线四边均匀；bottom:-1 扩展画布容纳底边界行，挂载 Stack
              // 需 Clip.none；位于内容 Container 之外不受其圆角裁剪）
              Positioned(
                left: 0,
                top: 0,
                right: 0,
                bottom: -1,
                child: IgnorePointer(
                  child: CustomPaint(
                    painter: VsBorderPainter(
                      color: VsTheme.border,
                      lineWidth:
                          1 / MediaQuery.devicePixelRatioOf(context),
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

  Future<void> _openCharPicker(CharMatch m) async {
    final it = widget.item;
    final res = await showCharPicker(
      context,
      videoId: it.id,
      title: it.title,
      conflictNames: m.kind == 'conflict'
          ? m.conflicts.map((c) => c.name).toList()
          : null,
    );
    if (res == null || !mounted) return;
    // 进入角色主页
    if (res.startsWith(kCharRolePrefix)) {
      final name = res.substring(kCharRolePrefix.length);
      context.read<AppState>().go(PageType.role, name: name);
      return;
    }
    setState(() {}); // 刷新角标
    final svc = CharactersService.instance;
    final msg = res == kCharUnassign
        ? '已还原为自然匹配'
        : (svc.charOf(it.id) == null ? '已设为无角色' : '已指定角色：$res');
    VsToast.show(context, msg);
  }

  Widget _cover(VideoItem it) {
    if (it.cover.isEmpty) {
      return _placeholder();
    }
    // 本地视频封面：data URL（截帧）→ Image.memory
    if (it.cover.startsWith('data:')) {
      try {
        final bytes = base64Decode(it.cover.split(',')[1]);
        return Image.memory(bytes, fit: BoxFit.cover);
      } catch (_) {
        return _placeholder();
      }
    }
    return Image.network(
      it.cover,
      fit: BoxFit.cover,
      loadingBuilder: (c, child, p) {
        if (p == null) return child;
        return _placeholder();
      },
      errorBuilder: (c, e, s) => _placeholder(),
    );
  }

  /// 本地无封面占位（web .vsc-video-placeholder：
  /// linear-gradient(160deg, #2a2d2e, #181818) + file-media 34px 0.55）
  Widget _placeholder() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF2A2D2E), Color(0xFF181818)],
        ),
      ),
      child: const Center(
        child: Icon(VsIcons.fileMedia, size: 34, color: Color(0x8C9D9D9D)),
      ),
    );
  }

  Widget _statText(String s) => Text(
    s,
    style: const TextStyle(
      color: Colors.white,
      fontSize: 11,
      fontFamily: VsTheme.fontFamily,
      fontFamilyFallback: VsTheme.fontFamilyFallback,
      shadows: [Shadow(color: Colors.black, blurRadius: 2)],
    ),
  );

  static String _fmtDate(int ts) {
    final d = DateTime.fromMillisecondsSinceEpoch(ts * 1000);
    final now = DateTime.now();
    if (d.year == now.year) {
      return '${d.month}-${d.day.toString().padLeft(2, '0')}';
    }
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }
}

/// 入场动画（web vshell-rise 0.32s cubic-bezier(0.2,0.8,0.3,1)，
/// delay = index * 22ms 仅初始播放一次；窗口最小化时 Ticker 自动暂停）
class _Rise extends StatefulWidget {
  final Widget child;
  final int index;
  const _Rise({required this.child, this.index = 0});

  @override
  State<_Rise> createState() => _RiseState();
}

class _RiseState extends State<_Rise> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 320),
  );
  late final Animation<double> _a = CurvedAnimation(
    parent: _c,
    curve: const Cubic(0.2, 0.8, 0.3, 1),
  );

  @override
  void initState() {
    super.initState();
    if (widget.index <= 0) {
      _c.forward();
    } else {
      Future.delayed(Duration(milliseconds: widget.index * 22), () {
        if (mounted) _c.forward();
      });
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _a,
      child: ScaleTransition(
        scale: Tween(begin: 0.98, end: 1.0).animate(_a),
        child: widget.child,
      ),
    );
  }
}

/// 角色角标（左上角 40x40）：已赋予=头像/首字；冲突=红底 circle-slash
/// web：bg rgba(0,0,0,0.45) + border rgba(255,255,255,0.25) + radius 8
///      is-letter 白底黑字 15px 600
class _CharBadge extends StatelessWidget {
  final CharMatch charMatch;
  final VoidCallback onTap;

  const _CharBadge({required this.charMatch, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isConflict = charMatch.kind == 'conflict';
    final c = charMatch.char;
    Widget inner;
    if (isConflict) {
      inner = const Icon(
        VsIcons.circleSlash,
        size: 19,
        color: Color(0xFFF85149),
      );
    } else if (c != null && c.icon.isNotEmpty && c.icon.startsWith('data:')) {
      try {
        final b64 = c.icon.split(',')[1];
        inner = ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: Image.memory(
            base64Decode(b64),
            width: 36,
            height: 36,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _letter(c),
          ),
        );
      } catch (_) {
        inner = _letter(c);
      }
    } else {
      inner = _letter(c);
    }
    return Tooltip(
      message: isConflict ? '角色冲突，点击解决' : '角色：${c?.name}，点击更改',
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: isConflict
                ? const Color(0x73F85149) // 红 tint 底
                : const Color(0x73000000), // rgba(0,0,0,0.45)
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isConflict
                  ? const Color(0x59F85149)
                  : const Color(0x40FFFFFF), // rgba(255,255,255,0.25)
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x66000000),
                blurRadius: 4,
                offset: Offset(0, 1),
              ),
              BoxShadow(color: Color(0x24000000), blurRadius: 12),
            ],
          ),
          child: Center(child: inner),
        ),
      ),
    );
  }

  Widget _letter(Character? c) {
    // is-letter：白底 + 黑字 15px 600
    return Container(
      width: 40,
      height: 40,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.all(Radius.circular(8)),
      ),
      alignment: Alignment.center,
      child: Text(
        c == null || c.name.isEmpty
            ? '?'
            : c.name.characters.first.toUpperCase(),
        style: const TextStyle(
          color: Color(0xFF181818),
          fontSize: 15,
          fontWeight: FontWeight.w600,
          height: 1,
          fontFamily: VsTheme.fontFamily,
          fontFamilyFallback: VsTheme.fontFamilyFallback,
        ),
      ),
    );
  }
}

/// 3x3 圆点网格（顺序填位；web 8px 定位 + shadow 0 1px 3px rgba(0,0,0,0.5)+shadow-lg）
class _DotsGrid extends StatelessWidget {
  final List<Color> marks;
  const _DotsGrid({required this.marks});

  @override
  Widget build(BuildContext context) {
    if (marks.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      width: 24,
      height: 24,
      child: Stack(
        children: [
          for (var i = 0; i < marks.length && i < 9; i++)
            Positioned(
              left: _VideoCardState._gridPos[i + 1]!.$2 * 9.0,
              top: _VideoCardState._gridPos[i + 1]!.$1 * 9.0,
              child: Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(
                  color: marks[i],
                  shape: BoxShape.circle,
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x80000000),
                      blurRadius: 3,
                      offset: Offset(0, 1),
                    ),
                    BoxShadow(color: Color(0x24000000), blurRadius: 12),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// hover 显示包装（web .vsc-video-actions：opacity + translateY 120ms；
/// 隐藏态 IgnorePointer 不参与命中）
class _HoverReveal extends StatelessWidget {
  final bool show;
  final Offset offset; // 隐藏偏移（相对子组件尺寸，向上为负）
  final Widget child;

  const _HoverReveal({
    required this.show,
    required this.offset,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      ignoring: !show,
      child: AnimatedOpacity(
        opacity: show ? 1 : 0,
        duration: const Duration(milliseconds: 120),
        child: AnimatedSlide(
          offset: show ? Offset.zero : offset,
          duration: const Duration(milliseconds: 120),
          child: child,
        ),
      ),
    );
  }
}

/// hover 收藏/待看/代表作小按钮
/// web：28x28、radius 4、icon 16 白、bg toolbar-hoverBackground（半透明）、
///      hover toolbar-activeBackground；active 实底（watch/feature=#0078D4，
///      star=#F85149 hover #cd3131）
class _ActionBtn extends StatefulWidget {
  final IconData icon;
  final bool active;
  final Color activeColor;
  final Color activeHoverColor;
  final String? tooltip; // null = 不显示 tooltip（用户要求只显示图标）
  final VoidCallback onTap;

  const _ActionBtn({
    required this.icon,
    required this.active,
    required this.activeColor,
    required this.activeHoverColor,
    this.tooltip,
    required this.onTap,
  });

  @override
  State<_ActionBtn> createState() => _ActionBtnState();
}

class _ActionBtnState extends State<_ActionBtn> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final active = widget.active;
    final btn = MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: active
                ? (_hover ? widget.activeHoverColor : widget.activeColor)
                : (_hover ? VsTheme.toolbarActive : VsTheme.toolbarHover),
            borderRadius: BorderRadius.circular(VsTheme.radiusSmall),
          ),
          child: Icon(widget.icon, size: 16, color: Colors.white),
        ),
      ),
    );
    final tip = widget.tooltip;
    if (tip == null) return btn;
    return Tooltip(message: tip, child: btn);
  }
}

/// 卡片角部钮（web mute/blacklist：28x28 r4、bg toolbar-hover、icon 16 foreground
/// 色；hover 底 toolbar-active，可选 icon hover 变红——黑名单）
class _CornerBtn extends StatefulWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final Color? hoverColor; // 黑名单 hover → errorForeground

  const _CornerBtn({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.hoverColor,
  });

  @override
  State<_CornerBtn> createState() => _CornerBtnState();
}

class _CornerBtnState extends State<_CornerBtn> {
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
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: _hover ? VsTheme.toolbarActive : VsTheme.toolbarHover,
              borderRadius: BorderRadius.circular(VsTheme.radiusSmall),
            ),
            child: Icon(
              widget.icon,
              size: 16,
              color: _hover && widget.hoverColor != null
                  ? widget.hoverColor
                  : VsTheme.fg,
            ),
          ),
        ),
      ),
    );
  }
}

/// meta 左侧 owner（web .vsc-video-meta-owner：v0.5.4 起原 UP 位置显示角色名
/// [account icon 12 + 名 11px]、hover 变 foreground；冲突=红字「冲突」errorForeground
/// + 600；角色名点击 → 角色主页；冲突点击 → 角色选择器）
class _OwnerName extends StatefulWidget {
  final String name;
  final bool conflict;
  final VoidCallback onTap;

  const _OwnerName({
    required this.name,
    required this.conflict,
    required this.onTap,
  });

  @override
  State<_OwnerName> createState() => _OwnerNameState();
}

class _OwnerNameState extends State<_OwnerName> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final color = widget.conflict
        ? VsTheme.error
        : (_hover ? VsTheme.fg : VsTheme.fgDim);
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(VsIcons.account, size: 12, color: color),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                widget.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: color,
                  fontSize: 11,
                  fontWeight: widget.conflict
                      ? FontWeight.w600
                      : FontWeight.w400,
                  fontFamily: VsTheme.fontFamily,
                  fontFamilyFallback: VsTheme.fontFamilyFallback,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
