/// 角色默认背景图（web src/core/char-banners.js 完整移植，v0.5.6 第五轮）
/// 8 张手绘抽象几何图案（640x360 16:9，深色渐变底 + 亮色图案，与
/// has-bg 提亮文字逻辑兼容）；bannerFor(name) 按角色名 hash 稳定分配
/// （同名同图）；自定义背景图（character.banner）优先，未设置时用默认。
library;

import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/widgets.dart';

/// 按角色名取默认背景图案索引（JS: h=((h<<5)-h+c)|0 每轮 32 位截断）
int bannerIndexFor(String name) {
  var h = 0;
  for (final c in name.codeUnits) {
    h = (h * 31 + c) & 0xFFFFFFFF;
    if (h >= 0x80000000) h -= 0x100000000; // 转有符号（JS |0 语义）
  }
  return h.abs() % _banners.length;
}

/// 角色背景：CustomPaint 绘制默认图案（cover 语义：等比放大居中裁切）。
/// 用法：包在 Stack 底层 + ClipRect（painter 会画出边界外的部分）。
class CharBannerPaint extends CustomPainter {
  CharBannerPaint(this.index);

  final int index;

  static const _vw = 640.0;
  static const _vh = 360.0;

  @override
  void paint(Canvas canvas, Size size) {
    final s = math.max(size.width / _vw, size.height / _vh);
    canvas.save();
    canvas.translate((size.width - _vw * s) / 2, (size.height - _vh * s) / 2);
    canvas.scale(s);
    _banners[index % _banners.length](canvas);
    canvas.restore();
  }

  @override
  bool shouldRepaint(CharBannerPaint old) => old.index != index;
}

/// 直接返回一个可作背景层的 widget（铺满父级）
// ignore: non_constant_identifier_names
Widget charBannerLayer(String name) {
  return CustomPaint(
    size: Size.infinite,
    painter: CharBannerPaint(bannerIndexFor(name)),
  );
}

/// 各图案绘制函数（viewBox 640x360 坐标；参数照抄 char-banners.js SVG）
final List<void Function(Canvas)> _banners = [
  // 1 靛蓝圆环
  (c) {
    _grad(c, 0xFF25376B, 0xFF101A3A, true);
    _circle(c, 200, 150, 110, stroke: 6, opacity: 0.30);
    _circle(c, 200, 150, 72, stroke: 4, opacity: 0.20);
    _circle(c, 200, 150, 36, stroke: 3, opacity: 0.35);
    _dot(c, 480, 250, 14, 0.45);
    _dot(c, 520, 90, 8, 0.30);
    _dot(c, 120, 280, 6, 0.25);
  },
  // 2 紫罗兰山峦
  (c) {
    _grad(c, 0xFF3B2A5E, 0xFF1A1230, false);
    _poly(c, [(0, 300), (140, 150), (280, 300)], 0.12);
    _poly(c, [(180, 300), (360, 110), (540, 300)], 0.18);
    _poly(c, [(380, 300), (520, 170), (640, 300)], 0.26);
    _circle(c, 470, 80, 34, stroke: 3, opacity: 0.35);
    _circle(c, 470, 80, 22, stroke: 2, opacity: 0.25);
  },
  // 3 青绿波浪
  (c) {
    _grad(c, 0xFF1D4A4D, 0xFF0D2628, true);
    _wave(c, 130, 5, 0.22);
    _wave(c, 190, 4, 0.16);
    _wave(c, 250, 3, 0.10);
    _dot(c, 150, 70, 10, 0.40);
    _dot(c, 520, 60, 6, 0.30);
  },
  // 4 橙红三角
  (c) {
    _grad(c, 0xFF6B2D23, 0xFF331209, true);
    _tri(c, 320, 60, 540, 300, 100, 300, stroke: 6, opacity: 0.30);
    _tri(c, 320, 110, 480, 300, 160, 300, stroke: 4, opacity: 0.18);
    _line(c, 320, 60, 320, 300, 3, 0.15);
    _dot(c, 560, 80, 12, 0.40);
    _dot(c, 80, 100, 7, 0.28);
  },
  // 5 玫红点阵
  (c) {
    _grad(c, 0xFF5E2640, 0xFF2B0F1E, true);
    // 4 行：y=70/210 五列（r10 0.35 与 r6 0.22 交替）、y=140/280 四列错位
    const rows = <List<(double, double, double, double)>>[
      [(80, 70, 10, 0.35), (200, 70, 6, 0.22), (320, 70, 10, 0.35), (440, 70, 6, 0.22), (560, 70, 10, 0.35)],
      [(140, 140, 6, 0.22), (260, 140, 10, 0.35), (380, 140, 6, 0.22), (500, 140, 10, 0.35)],
      [(80, 210, 10, 0.35), (200, 210, 6, 0.22), (320, 210, 10, 0.35), (440, 210, 6, 0.22), (560, 210, 10, 0.35)],
      [(140, 280, 6, 0.22), (260, 280, 10, 0.35), (380, 280, 6, 0.22), (500, 280, 10, 0.35)],
    ];
    for (final row in rows) {
      for (final (x, y, r, o) in row) {
        _dot(c, x, y, r, o);
      }
    }
  },
  // 6 墨绿网格
  (c) {
    _grad(c, 0xFF1F4A2E, 0xFF0C2414, true);
    final g = Paint()
      ..color = const Color(0xFFFFFFFF).withValues(alpha: 0.14)
      ..strokeWidth = 2;
    for (final x in [160.0, 320.0, 480.0]) {
      c.drawLine(Offset(x, 0), Offset(x, 360), g);
    }
    for (final y in [120.0, 240.0]) {
      c.drawLine(Offset(0, y), Offset(640, y), g);
    }
    final frame = Paint()
      ..color = const Color(0xFFFFFFFF).withValues(alpha: 0.35)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5;
    c.drawRect(const Rect.fromLTWH(240, 80, 160, 160), frame);
    _dot(c, 500, 280, 16, 0.30);
  },
  // 7 灰蓝斜线
  (c) {
    _grad(c, 0xFF2C3A52, 0xFF131B2A, true);
    final starts = [(-60.0, 260.0), (40.0, 360.0), (140.0, 460.0), (240.0, 560.0), (340.0, 660.0), (440.0, 760.0)];
    for (final p in starts) {
      _line(c, p.$1, p.$2, p.$1 + 320, p.$2 - 320, 3, 0.18);
    }
    _circle(c, 160, 120, 40, stroke: 4, opacity: 0.35);
    _dot(c, 500, 230, 12, 0.40);
  },
  // 8 金棕方块
  (c) {
    _grad(c, 0xFF5C4A22, 0xFF2B2010, true);
    final sizes = [300.0, 200.0, 100.0];
    final opacities = [0.15, 0.25, 0.40];
    for (var i = 0; i < 3; i++) {
      final s = sizes[i] / 2;
      final p = Paint()
        ..color = const Color(0xFFFFFFFF).withValues(alpha: opacities[i])
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4;
      final r = Rect.fromCenter(
          center: const Offset(320, 150), width: sizes[i], height: sizes[i]);
      c.save();
      c.translate(r.center.dx, r.center.dy);
      c.rotate(math.pi / 4);
      c.drawRect(Rect.fromCenter(center: Offset.zero, width: s * 2, height: s * 2), p);
      c.restore();
    }
    _dot(c, 520, 280, 10, 0.35);
    _dot(c, 100, 90, 7, 0.25);
  },
];

void _grad(Canvas c, int from, int to, bool diag) {
  final rect = const Rect.fromLTWH(0, 0, 640, 360);
  final paint = Paint()
    ..shader = LinearGradient(
      begin: diag ? Alignment.topLeft : Alignment.topCenter,
      end: diag ? Alignment.bottomRight : Alignment.bottomCenter,
      colors: [Color(from), Color(to)],
    ).createShader(rect);
  c.drawRect(rect, paint);
}

void _dot(Canvas c, double x, double y, double r, double opacity) {
  c.drawCircle(
      Offset(x, y), r, Paint()..color = const Color(0xFFFFFFFF).withValues(alpha: opacity));
}

void _circle(Canvas c, double x, double y, double r,
    {required double stroke, required double opacity}) {
  c.drawCircle(
    Offset(x, y),
    r,
    Paint()
      ..color = const Color(0xFFFFFFFF).withValues(alpha: opacity)
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke,
  );
}

void _poly(Canvas c, List<(double, double)> pts, double opacity) {
  final p = Path()
    ..moveTo(pts.first.$1, pts.first.$2);
  for (final pt in pts.skip(1)) {
    p.lineTo(pt.$1, pt.$2);
  }
  p.close();
  c.drawPath(p, Paint()..color = const Color(0xFFFFFFFF).withValues(alpha: opacity));
}

void _tri(Canvas c, double x1, double y1, double x2, double y2, double x3, double y3,
    {required double stroke, required double opacity}) {
  final p = Path()
    ..moveTo(x1, y1)
    ..lineTo(x2, y2)
    ..lineTo(x3, y3)
    ..close();
  c.drawPath(
    p,
    Paint()
      ..color = const Color(0xFFFFFFFF).withValues(alpha: opacity)
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke,
  );
}

void _line(Canvas c, double x1, double y1, double x2, double y2, double w, double opacity) {
  c.drawLine(
    Offset(x1, y1),
    Offset(x2, y2),
    Paint()
      ..color = const Color(0xFFFFFFFF).withValues(alpha: opacity)
      ..strokeWidth = w,
  );
}

/// 波浪：M0 y Q 80 (y-60) 160 y T 320 y T 480 y T 640 y（T = 反射控制点）
void _wave(Canvas c, double y, double w, double opacity) {
  final p = Path()
    ..moveTo(0, y)
    ..quadraticBezierTo(80, y - 60, 160, y)
    ..quadraticBezierTo(240, y + 60, 320, y)
    ..quadraticBezierTo(400, y - 60, 480, y)
    ..quadraticBezierTo(560, y + 60, 640, y);
  c.drawPath(
    p,
    Paint()
      ..color = const Color(0xFFFFFFFF).withValues(alpha: opacity)
      ..style = PaintingStyle.stroke
      ..strokeWidth = w,
  );
}
