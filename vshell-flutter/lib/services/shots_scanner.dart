/// 分镜快扫驱动（移植 web 版 shots.js scan()）
/// ThumbHost 隐藏播放器 + 4x 倍速播放 + 实时截帧采样：
/// 播放中的视频帧一定可用（与边播分析同机制），无需 seek 等解码
/// 自适应调速 AIMD：缓冲健康 ×1.2 / 吃紧 ×0.7（下限 1x，无硬上限）
/// 30s 无进展超时兜底（部分节点也保存）；失败不标记可重试
library;

import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

import '../ui/widgets/thumb_host.dart';
import 'shots.dart';
import 'thumb_capture.dart' show thumbLog;

class ShotsScanner {
  ShotsScanner._();
  static final ShotsScanner instance = ShotsScanner._();

  bool _running = false;
  String _runningId = '';

  bool get running => _running;

  /// 快扫：隐藏播放器 4x 完整扫一遍
  /// [url] 媒体 URL（m3u8 或 file://），[id] 视频 id（缓存键）
  /// onUpdate：新节点（每批）→ 通知 UI 刷新
  /// onProgress：0-100；onDone：完成（含失败）
  Future<void> scan(
    String url,
    String id, {
    double? knownDuration,
    ValueChanged<int>? onUpdate,
    ValueChanged<double>? onProgress,
    VoidCallback? onDone,
  }) async {
    if (_running) {
      onDone?.call();
      return;
    }
    _running = true;
    _runningId = id;
    final player = Player();
    VideoController? controller;
    final analyzer = ShotAnalyzer();
    final cached = ShotsStore.instance.get(id);
    if (cached != null) analyzer.shots.addAll(cached);

    var finished = false;
    var failed = false;
    var blackCount = 0;
    var sampleCount = 0;
    var diffSum = 0.0;
    ShotFeat? prevFeat;
    Timer? sampler;
    Timer? adjustTimer;
    var rate = 4.0;
    var lastPos = Duration.zero;
    var lastTick = DateTime.now();
    var stallMs = 0;
    var sampling = false; // 防重入（screenshot 异步期间 Timer 再次触发）

    void cleanup() {
      finished = true;
      sampler?.cancel();
      adjustTimer?.cancel();
      if (controller != null) ThumbHost.removeController(controller!);
      try {
        player.dispose();
      } catch (_) {}
    }

    Future<void> done(List<ShotNode> shots, {bool mark = true}) async {
      if (finished) return;
      finished = true;
      _running = false;
      _runningId = '';
      await ShotsStore.instance.save(id, shots);
      final ok = mark && !(failed && shots.isEmpty);
      await thumbLog(
          'scan done id=$id mark=$mark failed=$failed shots=${shots.length} ok=$ok');
      if (!ok) {
        // 失败/黑帧 → 不标记（可重试）
      } else {
        await ShotsStore.instance.markScanned(id);
        await thumbLog('scan marked id=$id');
      }
      cleanup();
      onDone?.call();
    }

    try {
      controller = VideoController(player);
      ThumbHost.addController(controller);
      await Future.delayed(const Duration(milliseconds: 250)); // 等挂载

      await player.open(Media(url), play: false);
      // 时长（部分源慢，超时兜底）
      Duration dur = Duration.zero;
      try {
        dur = await player.stream.duration.first
            .timeout(const Duration(seconds: 6));
      } catch (_) {}
      if (dur.inSeconds <= 0 && (knownDuration ?? 0) > 0) {
        dur = Duration(seconds: knownDuration!.round());
      }
      if (dur.inSeconds <= 0) dur = const Duration(seconds: 3600); // 兜底 1h
      final cap = dur.inSeconds;
      final capSec = cap.toDouble();

      Future<void> _tick() async {
        final now = DateTime.now();
        stallMs += now.difference(lastTick).inMilliseconds;
        lastTick = now;
        final pos = player.state.position;
        final t = pos.inMilliseconds / 1000;
        if (t == lastPos.inMilliseconds / 1000) {
          if (stallMs > 30000) {
            await done(analyzer.shots);
            return;
          }
        } else {
          stallMs = 0;
          lastPos = pos;
        }
        // 进度
        final pct = (t / capSec * 100).clamp(0.0, 100.0);
        onProgress?.call(pct);
        // 采样
        Uint8List? shot;
        try {
          shot = await player.screenshot(format: 'image/png');
        } catch (_) {
          shot = null;
        }
        if (shot != null && shot.isNotEmpty) {
          final px = await decodePixels(shot);
          if (px != null) {
            final feat = sampleRgba(px.rgba, px.w, px.h, t);
            if (feat.lum == 0) {
              blackCount++;
            } else {
              sampleCount++;
              final pf = prevFeat;
              if (pf != null) diffSum += shotDiff(pf, feat);
              prevFeat = feat;
            }
            final news = analyzer.ingest(feat);
            if (news.isNotEmpty) {
              await ShotsStore.instance.save(id, analyzer.shots);
              onUpdate?.call(news.length);
            }
          }
        }
        if (capSec > 0 && t >= capSec - 0.5) {
          await done(analyzer.shots);
        }
      }

      Future<void> samplerTick() async {
        if (finished || sampling) return;
        sampling = true;
        try {
          await _tick();
        } finally {
          sampling = false;
        }
      }

      void applyRate() {
        try {
          player.setRate(rate);
        } catch (_) {}
        sampler?.cancel();
        sampler = Timer.periodic(Duration(milliseconds: (1000 / rate).round().clamp(20, 1000)), (_) {
          if (finished) return;
          samplerTick();
        });
        lastTick = DateTime.now();
      }

      void adjust() {
        if (finished) return;
        // 缓冲健康：state.buffer >= 2s 视为健康（media_kit 提供缓冲时长）
        final health = player.state.buffer.inSeconds >= 2;
        rate = health ? rate * 1.2 : (rate * 0.7).clamp(1.0, double.infinity);
        applyRate();
      }

      player.stream.error.listen((e) {
        failed = true;
        done(analyzer.shots, mark: false);
      });
      player.stream.completed.listen((_) {
        done(analyzer.shots);
      });

      await player.setVolume(0);
      await player.play();
      try {
        player.setRate(rate);
      } catch (_) {}
      lastTick = DateTime.now();
      sampler = Timer.periodic(const Duration(milliseconds: 250), (_) {
        if (!finished) samplerTick();
      });
      adjustTimer = Timer.periodic(const Duration(milliseconds: 500), (_) => adjust());
      onProgress?.call(0);
    } catch (e) {
      failed = true;
      await done(analyzer.shots, mark: false);
    }
  }

  void cancel() {
    // 当前实现：销毁由 scan 内部完成（cleanup）
    _running = false;
  }
}
