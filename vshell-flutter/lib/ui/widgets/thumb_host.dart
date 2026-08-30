/// 全局隐藏视频宿主：为本地视频封面截帧提供真实渲染上下文
/// media_kit 的 Player 必须挂载 Video（render context）才会渲染帧，
/// 裸 Player 的 screenshot-raw 恒返回 null（libmpv 无 VO 渲染）。
/// 用法：Shell 挂 <ThumbHost/>，LocalVideosService 经 thumbFn 注入本类 capture。
library;

import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

import '../../services/thumb_capture.dart';

class ThumbHost extends StatefulWidget {
  const ThumbHost({super.key});

  /// 截帧队列（串行，防并发占用宿主）
  static Future<ThumbResult?> capture(String filePath) => _queue.add(
      () => _captureOne(filePath));

  static final _queue = _SerialQueue();

  /// 宿主当前挂载的 controller 列表（build 里逐个渲染 Video）
  static final List<VideoController> mountedList = [];
  static final ValueNotifier<int> _rev = ValueNotifier<int>(0);

  static void addController(VideoController c) {
    mountedList.add(c);
    _rev.value++;
  }

  static void removeController(VideoController c) {
    mountedList.remove(c);
    _rev.value++;
  }

  static Future<ThumbResult?> _captureOne(String filePath) async {
    final player = Player();
    VideoController? controller;
    try {
      controller = VideoController(player);
      addController(controller);
      // 等 widget 树挂载 Video（渲染上下文就绪）
      await Future.delayed(const Duration(milliseconds: 250));

      final uri = 'file://${filePath.replaceAll('\\', '/')}';
      await player.open(Media(uri), play: false);
      await thumbLog('thumbHost opened: $filePath');

      Duration dur = Duration.zero;
      try {
        dur = await player.stream.duration.first
            .timeout(const Duration(seconds: 6));
      } catch (_) {
        await thumbLog('thumbHost dur timeout, state=${player.state.duration}');
      }
      final probedSec = dur.inSeconds;
      if (probedSec <= 0) dur = const Duration(seconds: 10);

      var targetSec = (probedSec <= 0 ? 10 : probedSec) ~/ 10;
      if (targetSec < 1) targetSec = 1;
      if (targetSec >= probedSec - 1 && probedSec > 2) {
        targetSec = (probedSec / 2).round().clamp(1, probedSec - 1);
      }
      await player.seek(Duration(seconds: targetSec));
      await player.setVolume(0);
      await player.play();

      // 等渲染出帧：轮询截图（最多 8 次 × 300ms，换位重试）
      Uint8List? shot;
      final deadline = DateTime.now().add(const Duration(seconds: 12));
      var tries = 0;
      while (DateTime.now().isBefore(deadline) && tries < 8) {
        await Future.delayed(const Duration(milliseconds: 300));
        tries++;
        try {
          shot = await player.screenshot(format: 'image/jpeg');
        } catch (e) {
          await thumbLog('thumbHost shot err: $e');
          shot = null;
        }
        if (shot != null && shot.isNotEmpty && shot.length > 2000) {
          break; // 非黑帧（纯黑 JPEG 很小）
        }
        await thumbLog('thumbHost dark/short: ${shot?.length}');
        targetSec += 3;
        if (probedSec > 2 && targetSec >= probedSec - 1) targetSec = 1;
        try {
          await player.seek(Duration(seconds: targetSec));
        } catch (_) {}
      }
      if (shot == null || shot.isEmpty || shot.length <= 2000) {
        await thumbLog('thumbHost FAILED after tries');
        return null;
      }
      final r = ThumbResult(
        'data:image/jpeg;base64,${_b64(shot)}',
        probedSec,
      );
      await thumbLog('thumbHost OK ${shot.length}B dur=$probedSec');
      return r;
    } catch (e) {
      await thumbLog('thumbHost EXC: $e');
      return null;
    } finally {
      removeController(controller!);
      try {
        await player.dispose();
      } catch (_) {}
    }
  }

  static String _b64(Uint8List bytes) {
    final sb = StringBuffer();
    const chars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (var i = 0; i < bytes.length; i += 3) {
      final b0 = bytes[i];
      final b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      final b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      sb.write(chars[(b0 >> 2) & 0x3F]);
      sb.write(chars[((b0 << 4) | (b1 >> 4)) & 0x3F]);
      sb.write(i + 1 < bytes.length
          ? chars[((b1 << 2) | (b2 >> 6)) & 0x3F]
          : '=');
      sb.write(i + 2 < bytes.length ? chars[b2 & 0x3F] : '=');
    }
    return sb.toString();
  }

  @override
  State<ThumbHost> createState() => _ThumbHostState();
}

class _ThumbHostState extends State<ThumbHost> {
  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: ThumbHost._rev,
      builder: (c, _, __) {
        final list = List.of(ThumbHost.mountedList);
        if (list.isEmpty) return const SizedBox.shrink();
        return IgnorePointer(
          child: Opacity(
            opacity: 0.01,
            child: SizedBox(
              width: 2,
              height: 2,
              child: ClipRect(
                child: Stack(
                  children: [
                    for (final vc in list) Positioned.fill(child: Video(controller: vc)),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// 简单串行队列（截帧互不并发）
class _SerialQueue {
  Future<void> _tail = Future.value();

  Future<T> add<T>(Future<T> Function() task) {
    final completer = Completer<T>();
    _tail = _tail.then((_) async {
      try {
        completer.complete(await task());
      } catch (e, st) {
        completer.completeError(e, st);
      }
    });
    return completer.future;
  }
}
