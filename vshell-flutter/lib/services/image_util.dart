/// 图片工具：解码 → cover 等比裁切缩放 → PNG base64 dataURL
/// （shared_preferences 存不了原图，头像 128、背景 640x360 足够）
library;

import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

/// 把图片字节解码并按目标尺寸 cover 裁切缩放，输出 'data:image/png;base64,...'
Future<String> imageToDataUrl(Uint8List bytes,
    {required int targetW, required int targetH}) async {
  final codec = await ui.instantiateImageCodec(bytes);
  final frame = await codec.getNextFrame();
  final img = frame.image;
  final sw = img.width.toDouble();
  final sh = img.height.toDouble();
  // cover：等比放大到填满目标框，居中裁切
  final scale =
      (targetW / sw > targetH / sh) ? targetW / sw : targetH / sh;
  final dw = sw * scale;
  final dh = sh * scale;
  final sx = (dw - targetW) / 2 / scale;
  final sy = (dh - targetH) / 2 / scale;
  final recorder = ui.PictureRecorder();
  final canvas = ui.Canvas(recorder);
  canvas.drawImageRect(
    img,
    ui.Rect.fromLTWH(sx, sy, targetW / scale, targetH / scale),
    ui.Rect.fromLTWH(0, 0, targetW.toDouble(), targetH.toDouble()),
    ui.Paint(),
  );
  final pic = recorder.endRecording();
  final out = await pic.toImage(targetW, targetH);
  final data = await out.toByteData(format: ui.ImageByteFormat.png);
  img.dispose();
  out.dispose();
  return 'data:image/png;base64,${base64Encode(data!.buffer.asUint8List())}';
}
