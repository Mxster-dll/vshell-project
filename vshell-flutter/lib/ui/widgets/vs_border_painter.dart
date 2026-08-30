import 'dart:math' as math;

import 'package:flutter/widgets.dart';

/// 物理像素对齐的四边边框线：线宽 = 1/devicePixelRatio（逻辑）→ 光栅化
/// 恰为 1 物理像素全强度——解决 Border.all/环方案在非整数 DPI 下
/// 四边 1-2 物理像素随机取整的问题。
///
/// 关键设计：
/// - 顶/左/右线 = 1 物理 px 非 AA（锐利），圆角弧 = 1px AA × 2 遍
///   （单遍 AA 强度被分散 ~60%，2 遍叠加 ~84-100%，宽度保持 1px
///   与直线一致；3px 弧线视觉粗）
/// - 底边线画在 align(h-1) = 卡片底边界行：物理高 h*1.5 非整数时
///   底边界行中心恰在渲染边界（内容图层半覆盖 = 亮线根因），底边线
///   盖住该行（与顶边框盖顶部边界行对称）。挂载处需 bottom:-1 扩展
///   画布容纳（Positioned(left:0, top:0, right:0, bottom:-1)），
///   且 painter 必须在内容 Container 之外（其圆角裁剪会裁掉扩展画布）
class VsBorderPainter extends CustomPainter {
  final Color color;
  final double lineWidth;
  final double radius;
  VsBorderPainter({
    required this.color,
    required this.lineWidth,
    this.radius = 8,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final lw = lineWidth;
    final w = size.width;
    final h = size.height;
    // 画布 = 卡片 + 底部扩展 1 逻辑（挂载 bottom:-1）→ 卡片实际高
    final cardH = h - 1;
    final dpr = 1 / lw;
    // 线中心对齐物理像素中心（(v*dpr).floor()+0.5）/dpr。
    // 非整数 DPI 下 1 物理 px 线若落在像素边界间会被光栅化分摊到两行
    // 各 40-60%（实测底边线 43→47 半强度；诊断红 255→154=255×0.6）。
    final inset = 0.5 * lw;
    double align(double v) => ((v * dpr).floorToDouble() + 0.5) / dpr;

    // 四段直线：AA=false 锐利（物理对齐 1px 全强度）
    final linePaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = lw
      ..isAntiAlias = false;
    final top = align(inset);
    final left = align(inset);
    // 底边线 = 卡片内最后一行（与顶线对称；物理高非整数时边界行
    // 半覆盖 = 亮线根因，底边线盖住该行）
    final bottom = align(cardH - inset);
    final right = align(w - inset);
    canvas.drawLine(Offset(radius, top), Offset(w - radius, top), linePaint); // 顶
    canvas.drawLine(Offset(radius, bottom), Offset(w - radius, bottom), linePaint); // 底
    canvas.drawLine(Offset(left, radius), Offset(left, cardH - radius), linePaint); // 左
    canvas.drawLine(Offset(right, radius), Offset(right, cardH - radius), linePaint); // 右

    // 四段圆角弧：AA=true 单遍。半径 = radius + 0.2（≈12.3 物理 vs 图片
    // 圆角 12 物理）：hardEdge 像素化在 58° 弧线处凸出 0.4px（像素中心
    // 判定，实测图片边缘比弧线凸 0.4px = 用户反馈"顶部圆角图片侵入
    // 程度比侧边大"）——弧线带 [11.97, 12.63] 覆盖凸出像素范围
    // [12.10, 12.35]，顶部圆角与侧边视觉一致；弧线内缘 11.97 略盖
    // 图片边缘 0.03px（线在图上，正常）。圆心 = 半径同值（弧线完整
    // 不裁剪，与直线端点由 AA 过渡带平滑衔接）
    // 临时试验：左上角圆心往右下移 0.25、右上角圆心往下移 0.25（用户反馈还是多了）
    final arcR = radius;
    final off = radius;
    final arcPaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = lw
      ..isAntiAlias = true;
    final arcs = [
      (Offset(off + 0.25, off + 0.25), math.pi), // 左上：内收 0.25
      (Offset(w - off - 0.25, off + 0.25), math.pi * 1.5), // 右上：内收 0.25
      (Offset(w - off - 0.25, cardH - off - 0.25), 0.0), // 右下：内收 0.25
      (Offset(off + 0.25, cardH - off - 0.25), math.pi / 2), // 左下：内收 0.25
    ];
    for (final a in arcs) {
      canvas.drawArc(Rect.fromCircle(center: a.$1, radius: arcR),
          a.$2, math.pi / 2, false, arcPaint);
    }
  }

  @override
  bool shouldRepaint(covariant VsBorderPainter old) =>
      old.color != color || old.lineWidth != lineWidth || old.radius != radius;
}
