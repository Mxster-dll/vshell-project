/// 本地视频封面截帧（桌面端：media_kit/libmpv 直接截帧，无需渲染挂载）
/// 用法：captureThumb(filePath) → JPEG dataURL 或 null
/// 策略：打开文件 → 等时长 → seek 到 10%（至少 1s，避开黑场）→ 播放等待帧就绪 → screenshot
library;

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:media_kit/media_kit.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// 截帧诊断日志（追加写应用数据目录 vshell_thumb.log）
Future<void> thumbLog(String msg) async {
  try {
    final sup = await getApplicationSupportDirectory();
    final f = File(p.join(sup.path, 'vshell_thumb.log'));
    await f.writeAsString(
        '${DateTime.now().toIso8601String()} $msg\n',
        mode: FileMode.append);
  } catch (_) {}
}

/// 截帧结果：封面 dataURL + 探测到的时长（秒，0=未知）
class ThumbResult {
  const ThumbResult(this.cover, this.durationSec);
  final String cover;
  final int durationSec;
}

class ThumbCapture {
  ThumbCapture._();

  /// 截取视频某帧为 JPEG dataURL。fraction 默认 0.1（10% 位置）。
  /// 失败返回 null（卡片显示占位，不阻塞导入）。
  static Future<ThumbResult?> captureThumb(
    String filePath, {
    double fraction = 0.1,
    Duration timeout = const Duration(seconds: 12),
  }) async {
    final player = Player();
    try {
      await thumbLog('thumb start: $filePath');
      final uri = 'file://${filePath.replaceAll('\\', '/')}';
      await player.open(Media(uri), play: false);
      await thumbLog('thumb opened');
      // 时长（部分格式慢，超时兜底；stream.duration 是 Stream，first 取首值）
      Duration dur = Duration.zero;
      try {
        dur = await player.stream.duration.first
            .timeout(const Duration(seconds: 6));
      } catch (_) {
        await thumbLog('thumb dur timeout, state=${player.state.duration}');
      }
      final probedSec = dur.inSeconds;
      if (dur.inSeconds <= 0) dur = const Duration(seconds: 10);
      // 目标位置：fraction，至少 1s，不超过时长一半
      var targetSec = (dur.inSeconds * fraction).round();
      if (targetSec < 1) targetSec = 1;
      if (targetSec >= dur.inSeconds - 1) {
        targetSec = (dur.inSeconds / 2).round().clamp(1, dur.inSeconds - 1);
      }
      await player.seek(Duration(seconds: targetSec));
      // 播放让解码器出帧（screenshot 需要已解码帧）
      await player.setVolume(0);
      await player.play();
      // 轮询截帧：最多 3 个候选位置（黑帧/未就绪时换位）
      Uint8List? shot;
      final deadline = DateTime.now().add(timeout);
      var tries = 0;
      while (DateTime.now().isBefore(deadline) && tries < 8) {
        await Future.delayed(const Duration(milliseconds: 300));
        tries++;
        try {
          shot = await player.screenshot(format: 'image/jpeg');
        } catch (e) {
          await thumbLog('thumb shot err: $e');
          shot = null;
        }
        if (shot != null && shot.isNotEmpty && shot.length > 2000) {
          break; // 非黑帧（纯黑 JPEG 很小）
        }
        await thumbLog('thumb dark/short: ${shot?.length}');
        // 换一个位置重试
        targetSec += 3;
        if (targetSec >= dur.inSeconds - 1) targetSec = 1;
        try {
          await player.seek(Duration(seconds: targetSec));
        } catch (_) {}
      }
      if (shot == null || shot.isEmpty || shot.length <= 2000) {
        await thumbLog('thumb FAILED after tries');
        return null;
      }
      await thumbLog('thumb OK ${shot.length}B');
      return ThumbResult(
        'data:image/jpeg;base64,${base64Encode(shot)}',
        probedSec,
      );
    } catch (e) {
      await thumbLog('thumb EXC: $e');
      return null;
    } finally {
      try {
        await player.dispose();
      } catch (_) {}
    }
  }
}
