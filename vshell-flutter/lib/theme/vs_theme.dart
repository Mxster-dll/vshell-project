/// VS Code Modern UI 主题（Flutter ThemeData，token 全部取自 vs_tokens.dart）
/// 深色：#181818 底 / 浅色：#FFFFFF 底（vs-light token），主色 #0078D4，codicon 图标。
/// 颜色为 getter，跟随 [VsTheme.light] 切换；radius 为固定常量。
library;

import 'package:flutter/material.dart';

class VsTheme {
  VsTheme._();

  /// 全局主题模式（true = 浅色）。切换后需重建 MaterialApp。
  static bool light = false;

  // ---------- 颜色（跟随 light 模式） ----------

  /// 窗口/页面背景（.vshell 根容器：dark #181818 / light #FFFFFF）
  static Color get bg => light ? const Color(0xFFFFFFFF) : const Color(0xFF181818);

  /// 卡片/浮层表面
  static Color get surface => light ? const Color(0xFFF3F3F3) : const Color(0xFF1F1F1F);
  /// editor-background（shade 渐变终点）
  static Color get editorBg => light ? const Color(0xFFFFFFFF) : const Color(0xFF1F1F1F);

  /// 边框
  static Color get border => light ? const Color(0xFFD4D4D4) : const Color(0xFF2B2B2B);

  /// 主色（focusBorder / button / progressBar / 进度条）
  static const Color accent = Color(0xFF0078D4);

  /// 错误红（errorForeground：dark #F85149 / light #F85149，light_modern 同为 #F85149）
  static Color get error => const Color(0xFFF85149);

  /// 正文（dark #CCCCCC / light #333333）
  static Color get fg => light ? const Color(0xFF333333) : const Color(0xFFCCCCCC);

  /// 次要文字（dark #9D9D9D / light #616161）
  static Color get fgDim => light ? const Color(0xFF616161) : const Color(0xFF9D9D9D);

  static Color get linkBlue => light ? const Color(0xFF006AB1) : const Color(0xFF4daafc);

  /// dropdown-border（dark #3C3C3C / light #CECECE，css light_modern dropdown-border）
  static Color get dropdownBorder =>
      light ? const Color(0xFFCECECE) : const Color(0xFF3C3C3C);

  /// badge-background / badge-foreground（web meta-tag、日期徽章）
  static Color get badgeBg => const Color(0xFF616161);
  static Color get badgeFg => const Color(0xFFF8F8F8);

  /// 列表选中（dark 深蓝 #04395E / light 浅蓝 #D6EBFF）
  static Color get listActive => light ? const Color(0xFFD6EBFF) : const Color(0xFF04395E);

  /// 列表选中前景（dark 白 / light 黑——web light list-activeSelectionForeground #000000）
  static Color get activeFg => light ? const Color(0xFF000000) : const Color(0xFFFFFFFF);

  /// 列表悬停（dark #2A2D2E / light #E8E8E8）
  static Color get listHover => light ? const Color(0xFFE8E8E8) : const Color(0xFF2A2D2E);

  /// 收藏红点/激活（saved-mark is-fav = errorForeground #F85149，dark/light 同）
  static const Color favRed = Color(0xFFF85149);

  /// 待看蓝点（saved-mark is-watch = charts-blue：dark #59A4F9 / light #0063d3）
  static Color get watchBlue => light ? const Color(0xFF0063d3) : const Color(0xFF59A4F9);

  /// 本地绿点（saved-mark is-local = terminal-ansiGreen：dark #0DBC79 / light #107C10）
  static Color get localGreen => light ? const Color(0xFF107C10) : const Color(0xFF0DBC79);

  /// 代表作金点（is-featured-mark = editorLightBulb fallback #ffcc00，未定义恒用 fallback）
  static const Color featGold = Color(0xFFFFCC00);

  /// 黑名单橙（feed 黑名单激活 = charts.orange；CSS 变量实际值 #EA5C0055
  /// 即 33% 透明橙，dark/light 同）
  static const Color chartsOrange = Color(0x55EA5C00);

  /// 输入框底色（dark #313131 / light #FFFFFF）
  static Color get inputBg => light ? const Color(0xFFFFFFFF) : const Color(0xFF313131);

  /// 输入框边框（dark #3C3C3C / light #CECECE，css light_modern input-border）
  static Color get inputBorder =>
      light ? const Color(0xFFCECECE) : const Color(0xFF3C3C3C);

  /// 浮层/对话框底色（dark #252526 / light #F3F3F3）
  static Color get overlayBg => light ? const Color(0xFFF3F3F3) : const Color(0xFF252526);

  /// 编辑器浮件底 editorWidget-background（web toast/modal/fab/dl-card 底：dark #202020 / light #F8F8F8）
  static Color get widgetBg => light ? const Color(0xFFF8F8F8) : const Color(0xFF202020);

  /// 浮件边框 widget-border（dark #313131 / light #D4D4D4）
  static Color get widgetBorder =>
      light ? const Color(0xFFD4D4D4) : const Color(0xFF313131);

  /// 次要按钮底（button.secondaryBackground：dark #3A3A3A / light #E8E8E8）
  static Color get btnSecondary =>
      light ? const Color(0xFFE8E8E8) : const Color(0xFF3A3A3A);

  /// 工具栏悬停底 toolbar-hoverBackground（半透明：dark #5a5d5e50=rgba(90,93,94,0.3137) / light #b8b8b850）
  static Color get toolbarHover =>
      light ? const Color(0x50B8B8B8) : const Color(0x505A5D5E);

  /// 工具栏激活底 toolbar-activeBackground（dark rgba(106,109,110,0.3137) / light rgba(166,166,166,0.3137)）
  static Color get toolbarActive =>
      light ? const Color(0x50A6A6A6) : const Color(0x506A6D6E);

  /// 主按钮悬停 button-hoverBackground（dark #026EC1 / light #0258A8）
  static Color get accentHover => light ? const Color(0xFF0258A8) : const Color(0xFF026EC1);

  /// 输入占位 input-placeholderForeground（dark #989898 / light #767676）
  static Color get placeholder => light ? const Color(0xFF767676) : const Color(0xFF989898);

  /// 半透明导航栏底色（web .vshell-navbar：dark rgba(24,24,24,0.85) / light rgba(255,255,255,0.85)）
  static Color get navBarBg =>
      light ? const Color(0xD9FFFFFF) : const Color(0xD9181818);

  /// 滚动阴影（web .vshell-navbar.is-scrolled：0 2px 10px rgba(0,0,0,0.45)）
  static const Color navScrollShadow = Color(0x73000000);

  // ---------- 字体回退链（用户指定：Cascadia Code → Consolas → 霞鹜文楷 → 仓耳今楷01） ----------
  /// 主字体；系统缺字时按 [fontFamilyFallback] 依次回退，最后落到系统默认。
  static const String fontFamily = 'Cascadia Code';
  static const List<String> fontFamilyFallback = ['Consolas', '霞鹜文楷', '仓耳今楷01'];

  // ---------- 半径（固定，web cornerRadius 阶梯 css:24-29） ----------

  static const double radiusXSmall = 2;
  static const double radiusSmall = 4;
  static const double radiusMedium = 6;
  static const double radiusLarge = 8;
  static const double radiusXLarge = 12;
  static const double radiusCircle = 9999;

  static ThemeData dark() {
    final base = ThemeData(
      useMaterial3: false,
      brightness: light ? Brightness.light : Brightness.dark,
      fontFamily: VsTheme.fontFamily,
      fontFamilyFallback: VsTheme.fontFamilyFallback,
      scaffoldBackgroundColor: bg,
      canvasColor: bg,
      colorScheme: light
          ? const ColorScheme.light(
              primary: accent,
              secondary: accent,
              surface: Color(0xFFF3F3F3),
              error: Color(0xFFA1260D),
            )
          : const ColorScheme.dark(
              primary: accent,
              secondary: accent,
              surface: Color(0xFF1F1F1F),
              error: Color(0xFFF85149),
            ),
    );
    return base.copyWith(
      textTheme: base.textTheme
          .apply(
            bodyColor: fg,
            displayColor: fg,
            fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
          )
          .copyWith(
            bodySmall: base.textTheme.bodySmall?.copyWith(
              color: fgDim,
              fontSize: 11,
              fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
            ),
            bodyMedium: base.textTheme.bodyMedium?.copyWith(
              color: fg,
              fontSize: 13,
              fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
            ),
            labelMedium: base.textTheme.labelMedium?.copyWith(
              color: fg,
              fontSize: 12,
              fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback,
            ),
          ),
      iconTheme: IconThemeData(color: fg, size: 16),
      dividerColor: border,
      // 滚动条（web .vshell-page 自绘：6px 宽、thumb rgba(121,121,121,0.6) r3、hover 0.8）
      scrollbarTheme: ScrollbarThemeData(
        thickness: const WidgetStatePropertyAll(6),
        thumbColor: WidgetStateProperty.resolveWith((states) {
          final hovered = states.contains(WidgetState.hovered);
          return light
              ? (hovered ? const Color(0xB3646464) : const Color(0x66646464))
              : (hovered ? const Color(0xCC797979) : const Color(0x99797979));
        }),
        radius: const Radius.circular(3),
      ),
      // 工具提示
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: overlayBg,
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(radiusMedium),
        ),
        textStyle: TextStyle(color: fg, fontSize: 12, fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
        waitDuration: const Duration(milliseconds: 400),
      ),
      // 弹窗（角色选择/设置等，复刻 .vshell-modal：widgetBg 底 + radius 12 + widget-border）
      dialogTheme: DialogThemeData(
        backgroundColor: widgetBg,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusXLarge),
          side: BorderSide(color: border),
        ),
        titleTextStyle: TextStyle(
            color: fg, fontSize: 15, fontWeight: FontWeight.w600, fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
        contentTextStyle: TextStyle(color: fg, fontSize: 13, fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
      ),
      // 输入框（搜索框等，复刻 input-background）
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: inputBg,
        hintStyle: TextStyle(color: placeholder, fontSize: 13, fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMedium),
          borderSide: BorderSide(color: inputBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMedium),
          borderSide: BorderSide(color: inputBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMedium),
          borderSide: const BorderSide(color: accent, width: 1),
        ),
        isDense: true,
      ),
      // 按钮
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: accent,
          foregroundColor: Colors.white,
          disabledBackgroundColor:
              light ? const Color(0xFFE0E0E0) : const Color(0xFF3C3C3C),
          disabledForegroundColor:
              light ? const Color(0xFFA0A0A0) : const Color(0xFF6E6E6E),
          textStyle: const TextStyle(fontSize: 13, fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusMedium)),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: fg,
          textStyle: const TextStyle(fontSize: 13, fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusMedium)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: overlayBg,
        contentTextStyle: TextStyle(color: fg, fontSize: 13, fontFamily: VsTheme.fontFamily, fontFamilyFallback: VsTheme.fontFamilyFallback),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMedium),
          side: BorderSide(color: border),
        ),
      ),
    );
  }
}
