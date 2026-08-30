/// vshell 全局 toast（复刻 web .vshell-toast：
/// 右下 fixed（right 20 / bottom 76）、max-width 320、radius 8、
/// editorWidget-background 底 + 1px widget-border + 左侧 3px 主题色条、
/// shadow 0 6px 20px rgba(0,0,0,0.35)、220ms 右滑入、2400ms 自动消失）
library;

import 'package:flutter/material.dart';

import '../../theme/vs_theme.dart';

class VsToast {
  VsToast._();

  static void show(
    BuildContext context,
    String message, {
    Color? accentColor,
    Duration duration = const Duration(milliseconds: 2400),
  }) {
    final overlay = Overlay.of(context, rootOverlay: true);
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => _VsToastWidget(
        message: message,
        accentColor: accentColor ?? VsTheme.accent,
        onRemove: () {
          if (entry.mounted) entry.remove();
        },
      ),
    );
    overlay.insert(entry);
    Future.delayed(duration, () {
      if (entry.mounted) entry.remove();
    });
  }

  /// 错误 toast（左条 errorForeground）
  static void error(BuildContext context, String message) =>
      show(context, message, accentColor: VsTheme.error);
}

class _VsToastWidget extends StatefulWidget {
  final String message;
  final Color accentColor;
  final VoidCallback onRemove;

  const _VsToastWidget(
      {required this.message,
      required this.accentColor,
      required this.onRemove});

  @override
  State<_VsToastWidget> createState() => _VsToastWidgetState();
}

class _VsToastWidgetState extends State<_VsToastWidget>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
  );

  @override
  void initState() {
    super.initState();
    _c.forward();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      right: 20,
      bottom: 76,
      child: IgnorePointer(
        child: FadeTransition(
          opacity: _c,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0.3, 0),
              end: Offset.zero,
            ).animate(CurvedAnimation(parent: _c, curve: Curves.easeOut)),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 320),
              padding: const EdgeInsets.fromLTRB(12, 10, 14, 10),
              decoration: BoxDecoration(
                color: VsTheme.widgetBg,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: VsTheme.border),
                boxShadow: const [
                  BoxShadow(
                      color: Color(0x59333333),
                      blurRadius: 20,
                      offset: Offset(0, 6)),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // 左侧 3px 主题色条
                  Container(
                    width: 3,
                    height: 16,
                    decoration: BoxDecoration(
                      color: widget.accentColor,
                      borderRadius: BorderRadius.circular(1.5),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      widget.message,
                      style: TextStyle(
                          color: VsTheme.fg,
                          fontSize: 13,
                          fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
