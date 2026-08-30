/// 角色管理面板浮窗（web char-panel.js 完整复刻，v0.5.6 版）
/// VS Code Modern 两栏：head（tag icon + 标题）+
/// body（side 220px：添加行 + 角色列表；main：详情头卡 + 关键词 +
/// 添加关键词）+ 底部完成按钮；v0.5.5 后右上 x 与右栏操作按钮已删，
/// 关闭走完成/点外部；v0.5.6 十七轮：关闭后回到角色列表浮窗。
library;

import 'dart:convert';
import 'dart:ui';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';

import '../../services/characters.dart';
import '../../services/image_util.dart';
import '../../theme/char_banners.dart';
import '../../theme/vs_icons.dart';
import '../../theme/vs_theme.dart';
import 'char_list_dialog.dart';
import 'vs_toast.dart';

/// 打开角色管理面板（web charPanel.open；关闭后回到角色列表浮窗——
/// 列表是管理入口，web v0.5.6 十七轮）
Future<void> showCharPanel(BuildContext context) async {
  await showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
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
          const Center(child: CharPanelDialog()),
        ],
      ),
    ),
  );
  // 关闭后回角色列表（web：close() → charPicker.list()）
  if (context.mounted) await showCharListDialog(context);
}

/// 角色管理面板本体（浮窗与 --page=characters 页面共用；asPage 时
/// 无浮窗关闭语义——完成按钮隐藏）
class CharPanelDialog extends StatefulWidget {
  const CharPanelDialog({super.key, this.asPage = false});

  final bool asPage;

  @override
  State<CharPanelDialog> createState() => _CharPanelDialogState();
}

class _CharPanelDialogState extends State<CharPanelDialog> {
  final _svc = CharactersService.instance;
  final _addCtrl = TextEditingController();
  final _kwCtrl = TextEditingController();
  String? _sel;

  @override
  void initState() {
    super.initState();
    final chars = _svc.chars;
    if (chars.isNotEmpty) _sel = chars.first.name;
  }

  @override
  void dispose() {
    _addCtrl.dispose();
    _kwCtrl.dispose();
    super.dispose();
  }

  Character? get _current => _sel == null ? null : _svc.find(_sel!);

  void _refresh() => setState(() {});

  void _addChar(String v) {
    final name = v.trim();
    if (name.isEmpty) return;
    if (_svc.find(name) != null) {
      VsToast.show(context, '角色已存在：$name');
    } else {
      _svc.addChar(name);
      VsToast.show(context, '已添加角色：$name');
    }
    _sel = name;
    _addCtrl.clear();
    _refresh();
  }

  void _removeChar(Character c) {
    _svc.removeChar(c.name);
    if (_sel == c.name) _sel = null;
    final rest = _svc.chars;
    if (rest.isNotEmpty) _sel ??= rest.first.name;
    _refresh();
  }

  Future<void> _pickImage(bool banner) async {
    final c = _current;
    if (c == null) return;
    const typeGroup = XTypeGroup(
      label: '图片',
      extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
    );
    final file = await openFile(acceptedTypeGroups: [typeGroup]);
    if (file == null || !mounted) return;
    final bytes = await file.readAsBytes();
    if (!mounted) return;
    try {
      final dataUrl = await imageToDataUrl(bytes,
          targetW: banner ? 640 : 128, targetH: banner ? 360 : 128);
      if (banner) {
        _svc.setBanner(c.name, dataUrl);
      } else {
        _svc.setIcon(c.name, dataUrl);
      }
      _refresh();
    } catch (e) {
      if (mounted) VsToast.error(context, '图片处理失败：$e');
    }
  }

  void _addKw(String kw) {
    final c = _current;
    if (c == null || kw.trim().isEmpty) return;
    final kws = [...c.keywords];
    if (!kws.contains(kw.trim())) kws.add(kw.trim());
    _svc.setKeywords(c.name, kws);
    _kwCtrl.clear();
    _refresh();
  }

  void _removeKw(String kw) {
    final c = _current;
    if (c == null) return;
    _svc.setKeywords(c.name, c.keywords.where((k) => k != kw).toList());
    _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final chars = _svc.chars;
    final cur = _current;
    return Container(
      width: 640,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        // web modal 基础：widgetBg + 1px widget-border + r12 + shadow-lg
        color: VsTheme.widgetBg,
        borderRadius: BorderRadius.circular(VsTheme.radiusXLarge),
        border: Border.all(color: VsTheme.widgetBorder),
        boxShadow: const [
          BoxShadow(
              color: Color(0x80000000),
              blurRadius: 50,
              offset: Offset(0, 16)),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ---- head（web .vshell-char-head：gap 8、padding 12/16、
          // border-bottom sideBar-border）----
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: VsTheme.border)),
            ),
            child: Row(
              children: [
                Icon(VsIcons.tag, size: 15, color: VsTheme.fgDim),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '角色管理',
                    style: TextStyle(
                      color: VsTheme.fg,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
                    ),
                  ),
                ),
              ],
            ),
          ),
          // ---- body（web .vshell-char-body：min-h 320 / max-h 62vh）----
          ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 320, maxHeight: 560),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ---- side 220（web .vshell-char-side：border-right、
                // padding 8、flex column gap 6）----
                Container(
                  width: 220,
                  decoration: BoxDecoration(
                    border: Border(right: BorderSide(color: VsTheme.border)),
                  ),
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    children: [
                      // 添加行（web .vshell-char-addrow：gap 4）
                      Row(
                        children: [
                          Expanded(
                            child: SizedBox(
                              height: 28,
                              child: TextField(
                                controller: _addCtrl,
                                onSubmitted: _addChar,
                                style: TextStyle(
                                    color: VsTheme.fg, fontSize: 13),
                                decoration: InputDecoration(
                                  hintText: '添加角色…',
                                  hintStyle: TextStyle(
                                      color: VsTheme.placeholder,
                                      fontSize: 13),
                                  isDense: true,
                                  contentPadding:
                                      const EdgeInsets.symmetric(
                                          horizontal: 8, vertical: 4),
                                  filled: true,
                                  fillColor: VsTheme.inputBg,
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(4),
                                    borderSide:
                                        BorderSide(color: VsTheme.inputBorder),
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(4),
                                    borderSide:
                                        BorderSide(color: VsTheme.inputBorder),
                                  ),
                                  focusedBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(4),
                                    borderSide:
                                        BorderSide(color: VsTheme.inputBorder),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 4),
                          // 添加按钮（web .vshell-btn-primary + tag-add）
                          GestureDetector(
                            onTap: () => _addChar(_addCtrl.text),
                            child: Container(
                              width: 28,
                              height: 28,
                              decoration: BoxDecoration(
                                color: VsTheme.accent,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Icon(VsIcons.add,
                                  size: 14, color: Colors.white),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      // 列表（web .vshell-char-list：flex1、gap 2）
                      Expanded(
                        child: chars.isEmpty
                            ? Padding(
                                padding: const EdgeInsets.all(12),
                                child: Text(
                                  '还没有角色——输入名称添加，视频标题命中关键词自动赋予角色',
                                  style: TextStyle(
                                      color: VsTheme.fgDim,
                                      fontSize: 12,
                                      height: 1.6),
                                ),
                              )
                            : ListView.builder(
                                padding: EdgeInsets.zero,
                                itemCount: chars.length,
                                itemBuilder: (c, i) {
                                  final ch = chars[i];
                                  return _row(ch);
                                },
                              ),
                      ),
                    ],
                  ),
                ),
                // ---- main（web .vshell-char-main：flex1、padding 16、
                // flex column gap 14、overflow-y auto）----
                Expanded(
                  child: cur == null
                      ? Padding(
                          padding: const EdgeInsets.all(16),
                          child: Text('还没有角色——左侧输入名称添加',
                              style: TextStyle(
                                  color: VsTheme.fgDim, fontSize: 12)),
                        )
                      : SingleChildScrollView(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // 详情头卡（web .vshell-char-detail-head：
                              // flex column gap 12）
                              _idRow(cur),
                              const SizedBox(height: 12),
                              // 关键词 sec（web .vshell-char-sec：
                              // border-top + pt 12）
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.only(top: 12),
                                decoration: BoxDecoration(
                                  border: Border(
                                      top: BorderSide(color: VsTheme.border)),
                                ),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text('关键词',
                                        style: TextStyle(
                                            color: VsTheme.fgDim,
                                            fontSize: 11)),
                                    const SizedBox(height: 8),
                                    Wrap(
                                      spacing: 6,
                                      runSpacing: 6,
                                      children: [
                                        for (final kw in cur.keywords)
                                          _kwChip(cur, kw),
                                      ],
                                    ),
                                    // 添加关键词行（web .vshell-char-kwadd：
                                    // gap 6、mt 8）
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        Expanded(
                                          child: SizedBox(
                                            height: 28,
                                            child: TextField(
                                              controller: _kwCtrl,
                                              onSubmitted: _addKw,
                                              style: TextStyle(
                                                  color: VsTheme.fg,
                                                  fontSize: 13),
                                              decoration: InputDecoration(
                                                hintText: '添加关键词…',
                                                hintStyle: TextStyle(
                                                    color:
                                                        VsTheme.placeholder,
                                                    fontSize: 13),
                                                isDense: true,
                                                contentPadding:
                                                    const EdgeInsets
                                                        .symmetric(
                                                        horizontal: 8,
                                                        vertical: 4),
                                                filled: true,
                                                fillColor: VsTheme.inputBg,
                                                border:
                                                    OutlineInputBorder(
                                                  borderRadius:
                                                      BorderRadius.circular(4),
                                                  borderSide: BorderSide(
                                                      color:
                                                          VsTheme.inputBorder),
                                                ),
                                                enabledBorder:
                                                    OutlineInputBorder(
                                                  borderRadius:
                                                      BorderRadius.circular(4),
                                                  borderSide: BorderSide(
                                                      color:
                                                          VsTheme.inputBorder),
                                                ),
                                                focusedBorder:
                                                    OutlineInputBorder(
                                                  borderRadius:
                                                      BorderRadius.circular(4),
                                                  borderSide: BorderSide(
                                                      color:
                                                          VsTheme.inputBorder),
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 6),
                                        GestureDetector(
                                          onTap: () =>
                                              _addKw(_kwCtrl.text),
                                          child: Container(
                                            width: 28,
                                            height: 28,
                                            decoration: BoxDecoration(
                                              color: VsTheme.accent,
                                              borderRadius:
                                                  BorderRadius.circular(4),
                                            ),
                                            child: const Icon(VsIcons.add,
                                                size: 14,
                                                color: Colors.white),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                ),
              ],
            ),
          ),
          // ---- 底部完成（web .vshell-tag-foot：右下 primary；
          // asPage 时隐藏——页面无浮窗关闭语义）----
          if (!widget.asPage)
            Container(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              decoration: BoxDecoration(
                border: Border(top: BorderSide(color: VsTheme.border)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Container(
                      height: 32,
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: VsTheme.accent,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Text('完成',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback)),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  /// 左列表行（web .vshell-char-row：44 高、r4、hover list-hover、
  /// selected list-active 白字、thumb 30、row-del 10x10 常驻）
  Widget _row(Character ch) {
    final active = ch.name == _sel;
    return GestureDetector(
      onTap: () => setState(() => _sel = ch.name),
      child: Container(
        height: 44,
        margin: const EdgeInsets.only(bottom: 2),
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: BoxDecoration(
          color: active ? VsTheme.listActive : Colors.transparent,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: Colors.transparent),
        ),
        child: Row(
          children: [
            _thumb(ch, 30),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                ch.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: active ? VsTheme.activeFg : VsTheme.fg,
                  fontSize: 13,
                  fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
                ),
              ),
            ),
            // 行删除钮（web .vshell-char-row-del：常驻、10x10、r4、
            // hover 红 + toolbar-active）
            _HoverBox(
              builder: (hover, child) => GestureDetector(
                onTap: () => _removeChar(ch),
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: hover
                        ? VsTheme.toolbarActive
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(2),
                  ),
                  child: Icon(VsIcons.close,
                      size: 10,
                      color: hover ? VsTheme.error : VsTheme.fgDim),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 详情头卡（web .vshell-char-detail-idrow：min-h 88、padding 14/16、
  /// r8、border panel-border、bg editor-background + 背景图/默认 SVG +
  /// 暗遮罩 0.35→0.72；banner-set 24x24 右上；bigthumb 64x64）
  Widget _idRow(Character c) {
    return Container(
      width: double.infinity,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: VsTheme.border),
        color: VsTheme.editorBg,
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // 背景：自定义 banner 优先，无则默认手绘 SVG（web JS 4110）
          Positioned.fill(
            child: c.banner.isNotEmpty
                ? Image.memory(
                    base64Decode(c.banner.split(',')[1]),
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => charBannerLayer(c.name),
                  )
                : charBannerLayer(c.name),
          ),
          // 暗遮罩（web JS detail-idrow：rgba(0,0,0,0.35)→0.72；
          // 上下溢出 2px 由外层 Clip.antiAlias 裁掉——消除渐变末端亮线缝隙）
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
                  colors: [Color(0x59000000), Color(0xB8000000)],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Row(
              children: [
                // 大头像（web bigthumb-wrap：64x64 r8、hover 压暗+edit）
                _HoverBox(
                  builder: (hover, child) => GestureDetector(
                    onTap: () => _pickImage(false),
                    child: Stack(
                      children: [
                        _thumb(c, 64, radius: 8),
                        if (hover)
                          Positioned.fill(
                            child: Container(
                              decoration: BoxDecoration(
                                color: const Color(0x73000000),
                                borderRadius:
                                    BorderRadius.circular(8),
                              ),
                              child: const Icon(VsIcons.edit,
                                  size: 16, color: Colors.white),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    c.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      shadows: const [
                        Shadow(
                            color: Color(0x99000000),
                            blurRadius: 4,
                            offset: Offset(0, 1)),
                      ],
                      fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
                    ),
                  ),
                ),
              ],
            ),
          ),
          // banner-set（web .vshell-char-banner-set：24x24 右上、
          // rgba(0,0,0,0.45) r6、hover 0.65）
          Positioned(
            top: 8,
            right: 8,
            child: _HoverBox(
              builder: (hover, child) => GestureDetector(
                onTap: () => _pickImage(true),
                child: Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: hover
                        ? const Color(0xA6000000)
                        : const Color(0x73000000),
                    borderRadius: BorderRadius.circular(6),
                    boxShadow: const [
                      BoxShadow(
                          color: Color(0x66000000),
                          blurRadius: 3,
                          offset: Offset(0, 1)),
                    ],
                  ),
                  child: const Icon(VsIcons.fileMedia,
                      size: 13, color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 关键词 chip（web .vshell-char-kwchip：24 高、padding 0 10、r8、
  /// toolbar-hover 底、12px；删除钮 = 搜索胶囊同款 12x12 圆骑跨
  /// top/right -4，hover chip 显示，hover 红）
  Widget _kwChip(Character c, String kw) {
    return _HoverBox(
      builder: (chipHover, child) => Container(
        height: 24,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: VsTheme.toolbarHover,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Text(
              kw,
              style: TextStyle(
                  color: VsTheme.fg,
                  fontSize: 12,
                  height: 1,
                  fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
            ),
            if (chipHover)
              Positioned(
                top: -4,
                right: -4,
                child: GestureDetector(
                  onTap: () => _removeKw(kw),
                  child: Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      color: VsTheme.inputBg,
                      shape: BoxShape.circle,
                      border: Border.all(color: VsTheme.border),
                      boxShadow: const [
                        BoxShadow(
                            color: Color(0x59000000),
                            blurRadius: 2,
                            offset: Offset(0, 1)),
                      ],
                    ),
                    child: const Icon(VsIcons.close,
                        size: 8, color: Colors.white),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _thumb(Character c, double size, {double radius = 4}) {
    Widget inner;
    if (c.icon.isNotEmpty && c.icon.startsWith('data:')) {
      try {
        inner = ClipRRect(
          borderRadius: BorderRadius.circular(radius),
          child: Image.memory(
            base64Decode(c.icon.split(',')[1]),
            width: size,
            height: size,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _letter(c, size, radius),
          ),
        );
      } catch (_) {
        inner = _letter(c, size, radius);
      }
    } else {
      inner = _letter(c, size, radius);
    }
    return SizedBox(width: size, height: size, child: inner);
  }

  Widget _letter(Character c, double size, double radius) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: size >= 64 ? Colors.white : VsTheme.btnSecondary,
        borderRadius: BorderRadius.circular(radius),
        border: size >= 64 ? Border.all(color: VsTheme.border) : null,
      ),
      child: Text(
        c.name.isEmpty ? '?' : c.name.characters.first.toUpperCase(),
        style: TextStyle(
          color: size >= 64 ? const Color(0xFF181818) : Colors.white,
          fontSize: size >= 64 ? 28 : size * 0.45,
          fontWeight: FontWeight.w600,
          height: 1,
          fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
        ),
      ),
    );
  }
}

/// hover 状态小工具（web 120ms transition 语义）
class _HoverBox extends StatefulWidget {
  const _HoverBox({required this.builder});

  final Widget Function(bool hover, Widget child) builder;

  @override
  State<_HoverBox> createState() => _HoverBoxState();
}

class _HoverBoxState extends State<_HoverBox> {
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
