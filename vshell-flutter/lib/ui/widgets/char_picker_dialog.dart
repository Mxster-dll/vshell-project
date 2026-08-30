/// 角色选择浮窗（复刻 web 版 char-picker.js）
/// - 两列长条行：头像 + 名称 + 关键词；冲突角色红标；当前选中对勾
/// - 底部：还原（仅手动指定时）/ 取消 / 完成；顶部可即时添加角色
/// 返回语义：'__unassign__'=已还原自然匹配；角色名=已指定；null=取消
library;

import 'dart:convert';
import 'dart:ui';

import 'package:flutter/material.dart';

import '../../services/characters.dart';
import '../../theme/char_banners.dart';
import '../../theme/vs_icons.dart';
import '../../theme/vs_theme.dart';

const String kCharUnassign = '__unassign__';
const String kCharRolePrefix = '__role__:';

Future<String?> showCharPicker(
  BuildContext context, {
  required String videoId,
  required String title,
  List<String>? conflictNames,
}) {
  return showGeneralDialog<String>(
    context: context,
    barrierDismissible: true,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    // web 弹窗 backdrop：blur(3px) + rgba(0,0,0,0.5)（css:4265）
    barrierColor: const Color(0x80000000),
    transitionDuration: const Duration(milliseconds: 150),
    pageBuilder: (ctx, _, __) => Material(
      type: MaterialType.transparency,
      child: Stack(
        children: [
          Positioned.fill(
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 3, sigmaY: 3),
              child: const SizedBox.expand(),
            ),
          ),
          Center(
            child: _CharPickerDialog(
              videoId: videoId,
              title: title,
              conflictNames: conflictNames,
            ),
          ),
        ],
      ),
    ),
  );
}

class _CharPickerDialog extends StatefulWidget {
  final String videoId;
  final String title;
  final List<String>? conflictNames;

  const _CharPickerDialog({
    required this.videoId,
    required this.title,
    this.conflictNames,
  });

  @override
  State<_CharPickerDialog> createState() => _CharPickerDialogState();
}

class _CharPickerDialogState extends State<_CharPickerDialog> {
  final _svc = CharactersService.instance;
  final _kwCtrl = TextEditingController();
  String? _selected;

  @override
  void initState() {
    super.initState();
    _selected = _svc.charOf(widget.videoId);
  }

  @override
  void dispose() {
    _kwCtrl.dispose();
    super.dispose();
  }

  bool get _isConflict => widget.conflictNames != null;

  void _addChar(String name) {
    final n = name.trim();
    if (n.isEmpty) return;
    _svc.addChar(n);
    setState(() => _selected = n);
    _kwCtrl.clear();
  }

  void _finish() {
    // 无选中 → 设为无角色（移除）
    _svc.assign(widget.videoId, _selected);
    Navigator.of(context).pop(_selected);
  }

  void _openRolePage() {
    final name = _selected;
    if (name == null) return;
    Navigator.of(context).pop('$kCharRolePrefix$name');
  }

  void _restore() {
    // 还原自然匹配（去除手动指定）：删 manual/lock → 自然重评（可能回到冲突）
    _svc.unassign(widget.videoId, widget.title);
    Navigator.of(context).pop(kCharUnassign);
  }

  @override
  Widget build(BuildContext context) {
    final chars = _svc.followedFirst();
    final conflicts = widget.conflictNames ?? const <String>[];

    return Dialog(
      backgroundColor: VsTheme.overlayBg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: VsTheme.border),
      ),
      child: Container(
        width: 480,
        constraints: const BoxConstraints(maxHeight: 520),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 标题（web：16px 600 lh 1.3）
            Row(
              children: [
                Text(
                  _isConflict ? '解决角色冲突' : '更改角色',
                  style: TextStyle(
                      color: VsTheme.fg,
                      fontSize: 16,
                      height: 1.3,
                      fontWeight: FontWeight.w600),
                ),
                const Spacer(),
                Text(widget.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: VsTheme.fgDim, fontSize: 12)),
              ],
            ),
            const SizedBox(height: 12),
            // 添加角色（web：input 32px radius 6 + 32x32 方按钮）
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 32,
                    child: TextField(
                      controller: _kwCtrl,
                      style: TextStyle(color: VsTheme.fg, fontSize: 13),
                      decoration: InputDecoration(
                        hintText: '添加新角色，回车创建并选中',
                        hintStyle:
                            TextStyle(color: VsTheme.fgDim, fontSize: 12),
                        isDense: true,
                        contentPadding:
                            const EdgeInsets.symmetric(horizontal: 10),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(6),
                          borderSide: BorderSide(color: VsTheme.border),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(6),
                          borderSide: const BorderSide(color: VsTheme.accent),
                        ),
                      ),
                      onSubmitted: _addChar,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: () => _addChar(_kwCtrl.text),
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      // web：button-background #0078D4
                      color: VsTheme.accent,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child:
                        const Icon(VsIcons.add, size: 15, color: Colors.white),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            // 角色列表（两列长条，web：grid 2 列 gap 8 max-height 420）
            Flexible(
              child: GridView.builder(
                shrinkWrap: true,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  mainAxisExtent: 56,
                ),
                itemCount: chars.length,
                itemBuilder: (c, i) => _row(chars[i], conflicts),
              ),
            ),
            const SizedBox(height: 12),
            // 底部（web tag-foot：gap 12 margin-top 14；主按钮右推）
            Row(
              children: [
                if (_svc.isManual(widget.videoId) &&
                    _svc.charOf(widget.videoId) != null)
                  TextButton(
                    onPressed: _restore,
                    style: TextButton.styleFrom(foregroundColor: VsTheme.fgDim),
                    child: const Text('还原自然匹配', style: TextStyle(fontSize: 12)),
                  ),
                const Spacer(),
                if (_selected != null)
                  TextButton(
                    onPressed: _openRolePage,
                    style:
                        TextButton.styleFrom(foregroundColor: VsTheme.linkBlue),
                    child: const Text('进入角色主页', style: TextStyle(fontSize: 12)),
                  ),
                TextButton(
                  onPressed: () => Navigator.of(context).pop(null),
                  style: TextButton.styleFrom(foregroundColor: VsTheme.fgDim),
                  child: const Text('取消', style: TextStyle(fontSize: 12)),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _finish,
                  style: FilledButton.styleFrom(
                    // web：button-background #0078D4（hover #026EC1）
                    backgroundColor: VsTheme.accent,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  ),
                  child: const Text('完成', style: TextStyle(fontSize: 13)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// 长条行（web .vshell-char-picker .vshell-char-list .vshell-tag-row）：
  /// 背景 = 角色背景图（自定义 banner 或默认手绘 SVG，暗渐变遮罩）+
  /// 左侧 36px 圆形头像 + 白字名字；
  /// 选中 = 右上角 18px 蓝底圆徽章 + SVG 平直对勾（不改框线颜色）；
  /// 冲突 = 左侧 3px 红竖条 + 红 tint 蒙层 + 红字；组合态 = 徽章 + 红竖条 + tint + 红字
  Widget _row(Character c, List<String> conflicts) {
    final isConflict = conflicts.contains(c.name);
    final isSelected = _selected == c.name;
    return GestureDetector(
      onTap: () => setState(() => _selected = c.name),
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
            // 冲突红 tint 蒙层（inset 0 0 0 999px rgba(248,81,73,0.16)）
            if (isConflict)
              const Positioned.fill(child: ColoredBox(color: Color(0x29F85149))),
            // 冲突左竖条（inset 3px 0 0 errorForeground）
            if (isConflict)
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                child: Container(width: 3, color: VsTheme.error),
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
                      style: TextStyle(
                        color: isConflict ? VsTheme.error : Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        shadows: const [
                          Shadow(
                              color: Color(0xD9000000),
                              blurRadius: 3,
                              offset: Offset(0, 1)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // 选中徽章（top/right 6、18px 圆、SVG 平直对勾）
            if (isSelected)
              Positioned(
                top: 6,
                right: 6,
                child: Container(
                  width: 18,
                  height: 18,
                  decoration: BoxDecoration(
                    color: VsTheme.listActive,
                    shape: BoxShape.circle,
                  ),
                  child: const CustomPaint(painter: _StraightCheckPainter()),
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
        boxShadow: const [
          BoxShadow(
              color: Color(0x80000000), blurRadius: 4, offset: Offset(0, 1)),
        ],
      ),
      child: inner,
    );
  }

  Widget _letterAvatar(Character c) {
    return Container(
      width: 36,
      height: 36,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
      ),
      child: Text(
        c.name.isEmpty ? '?' : c.name.characters.first.toUpperCase(),
        style: const TextStyle(
            color: Colors.black, fontSize: 15, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// SVG 平直对勾（web：polyline points='2.5,9 6,12.5 13.5,3.5'、stroke #fff 2.2、
/// butt 线帽 + miter 连接——无弧度）
class _StraightCheckPainter extends CustomPainter {
  const _StraightCheckPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = Colors.white
      ..strokeWidth = 2.2
      ..strokeCap = StrokeCap.butt
      ..strokeJoin = StrokeJoin.miter
      ..style = PaintingStyle.stroke;
    final s = size.width / 16.0;
    final path = Path()
      ..moveTo(2.5 * s, 9 * s)
      ..lineTo(6 * s, 12.5 * s)
      ..lineTo(13.5 * s, 3.5 * s);
    canvas.drawPath(path, p);
  }

  @override
  bool shouldRepaint(covariant _StraightCheckPainter oldDelegate) => false;
}
