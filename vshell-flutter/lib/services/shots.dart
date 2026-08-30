/// 分镜识别（移植 web 版 shots.js 语义）
/// 纯客户端像素分析：播放中按间隔截帧 → RGB 直方图(48 bin)+亮度 →
/// 相邻帧差异评分 → 「连续两个采样间隔持续高差异」判定分镜转换
/// （持续判定过滤单帧闪光/字幕抖动；淡入淡出属分镜保留；确认后重置基线）
///
/// 两种模式：
///  - attach：边播边分析——播放器 position 驱动采样，节点渐进出现
///  - scan：隐藏快扫——ThumbHost 隐藏播放器 4x 倍速完整扫一遍，
///           进入详情页（无缓存时）即得全量节点，不打扰主播放器
/// 结果按视频 id 持久化（VsStore 'shots3.<id>'，[{t,s}] 升序）
library;

import 'dart:typed_data';
import 'dart:ui' as ui;

import 'vs_store.dart';

/// 分镜节点
class ShotNode {
  final double t; // 秒
  final double s; // 差异度 0-1
  const ShotNode(this.t, this.s);
}

/// 帧特征（RGB 直方图 48 bin + 平均亮度）
class ShotFeat {
  final Uint32List hist;
  final double lum;
  final double t;
  ShotFeat(this.hist, this.lum, this.t);
}

/// 从 RGBA 帧数据降采样提取特征（64x36 采样网格，轻量）
ShotFeat sampleRgba(Uint8List rgba, int w, int h, double t) {
  final hist = Uint32List(48);
  final gw = w ~/ 64 < 1 ? 1 : w ~/ 64; // 采样步长
  final gh = h ~/ 36 < 1 ? 1 : h ~/ 36;
  var lumSum = 0.0;
  var n = 0;
  var row = 0;
  while (row < h) {
    var col = 0;
    var base = row * w * 4;
    while (col < w) {
      final i = base + col * 4;
      final r = rgba[i];
      final g = rgba[i + 1];
      final b = rgba[i + 2];
      hist[r >> 4]++;
      hist[16 + (g >> 4)]++;
      hist[32 + (b >> 4)]++;
      lumSum += r * 0.299 + g * 0.587 + b * 0.114;
      n++;
      col += gw;
    }
    row += gh;
  }
  return ShotFeat(hist, n > 0 ? lumSum / n / 255 : 0, t);
}

/// 相邻帧差异评分（0-1）
double shotDiff(ShotFeat a, ShotFeat b) {
  var sum = 0;
  for (var i = 0; i < 48; i++) {
    sum += (a.hist[i] - b.hist[i]).abs();
  }
  final histL1 = sum / (2 * 2304); // 2*(64*36)
  final lumD = (a.lum - b.lum).abs();
  return histL1 * 0.7 + lumD * 0.3;
}

const double kShotThreshold = 0.35; // 差异阈值（抑制运动场景误检）

/// 分镜分析状态机（对硬切/淡入淡出/白闪稳健）
/// ingest(feat) → 返回新确认的分镜时间数组（可能空）
class ShotAnalyzer {
  ShotFeat? _prev;
  double _pendingT = -1;
  ShotFeat? _pendingFrame;
  int _pendingCount = 0;
  final List<ShotNode> shots = []; // 原始点集全保留（间隔约束在渲染层）

  /// 喂一帧特征，返回新确认节点时间
  List<double> ingest(ShotFeat feat) {
    final out = <double>[];
    final prev = _prev;
    if (prev != null) {
      final s = shotDiff(prev, feat);
      if (s > kShotThreshold) {
        if (_pendingT < 0) {
          _pendingT = prev.t; // 切换候选：起始帧时间
          _pendingFrame = prev;
          _pendingCount = 0;
        } else if (++_pendingCount >= 3 /* MAX_PENDING */) {
          if (s > kShotThreshold * 1.5) {
            // 持续大差异 = 快剪 → 直接确认
            _tryPush(_pendingT, s, out);
          }
          // 持续中等差异 = 摇镜/渐变 → 放弃候选
          _pendingT = -1;
          _pendingFrame = null;
        }
      } else if (_pendingT >= 0) {
        // 切换结束（差异回落）——闪回过滤：回落帧须与起始帧差异仍大
        final pf = _pendingFrame;
        if (pf != null && shotDiff(feat, pf) > kShotThreshold * 0.8) {
          _tryPush(_pendingT, shotDiff(feat, pf), out);
        }
        _pendingT = -1;
        _pendingFrame = null;
      }
    }
    _prev = feat;
    return out;
  }

  void _tryPush(double t, double s, List<double> out) {
    final node = ShotNode((t * 100).round() / 100, s);
    shots.add(node);
    out.add(node.t);
  }
}

/// 间隔约束 + 回溯（两节点最小间隔 ts；ts<=0 关闭约束）
/// 间隔不足比较差异度 s 保留强者；被顶替者入坟墓，间隔重新满足时复活
List<ShotNode> constrainShots(List<ShotNode> list, double ts) {
  if (list.isEmpty) return list;
  if (ts <= 0) {
    final c = list.toList()..sort((a, b) => a.t.compareTo(b.t));
    return c;
  }
  final nodes = list.toList()..sort((a, b) => a.t.compareTo(b.t));
  final result = <ShotNode>[];
  final graves = <ShotNode>[];
  void revive() {
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = graves.length - 1; i >= 0; i--) {
        final g = graves[i];
        var idx = 0;
        while (idx < result.length && result[idx].t < g.t) {
          idx++;
        }
        final prev = idx > 0 ? result[idx - 1] : null;
        final next = idx < result.length ? result[idx] : null;
        if ((prev == null || g.t - prev.t >= ts) &&
            (next == null || next.t - g.t >= ts)) {
          result.insert(idx, g);
          graves.removeAt(i);
          changed = true; // 可能连锁复活 → 循环
        }
      }
    }
  }

  for (final n in nodes) {
    final last = result.isNotEmpty ? result[result.length - 1] : null;
    if (last != null && n.t - last.t < ts) {
      if (n.s >= last.s) {
        graves.add(last);
        result[result.length - 1] = n;
        revive();
      }
    } else {
      result.add(n);
      revive();
    }
  }
  return result;
}

/// 缓存：识别结果 + 扫描标记 + 最小间隔
class ShotsStore {
  ShotsStore._();
  static final ShotsStore instance = ShotsStore._();

  static const _key = 'shots3.';
  static const _scannedKey = 'scanned.v4.';
  static const _gapKey = 'shots.gap';
  static const _defaultGap = 1.2;
  double _gap = _defaultGap;

  double get minGap => _gap;

  void load() {
    final g = VsStore.instance.get<num>(_gapKey);
    if (g != null) _gap = g.toDouble();
  }

  Future<void> setMinGap(double ts) async {
    _gap = ts < 0 ? 0 : ts;
    await VsStore.instance.set(_gapKey, _gap);
  }

  List<ShotNode>? get(String id) {
    if (id.isEmpty) return null;
    final v = VsStore.instance.get<List<dynamic>>(_key + id);
    if (v == null || v.isEmpty) return null;
    final out = <ShotNode>[];
    for (final e in v) {
      if (e is num) {
        out.add(ShotNode(e.toDouble(), 0.5));
      } else if (e is Map) {
        final t = e['t'];
        final s = e['s'];
        if (t is num) {
          out.add(ShotNode(t.toDouble(), s is num ? s.toDouble() : 0.5));
        }
      }
    }
    out.sort((a, b) => a.t.compareTo(b.t));
    return out.isEmpty ? null : out;
  }

  /// 合并去重（±0.3s 容差，冲突保留差异度大者）
  static List<ShotNode> _mergeUnique(List<ShotNode> a, List<ShotNode> b) {
    final all = [...a, ...b]..sort((x, y) => x.t.compareTo(y.t));
    final out = <ShotNode>[];
    for (final n in all) {
      final last = out.isNotEmpty ? out[out.length - 1] : null;
      if (last == null || n.t - last.t >= 0.3) {
        out.add(n);
      } else if (n.s > last.s) {
        out[out.length - 1] = n;
      }
    }
    return out;
  }

  Future<void> save(String id, List<ShotNode> shots) async {
    if (id.isEmpty || shots.isEmpty) return;
    final merged = _mergeUnique(get(id) ?? const [], shots);
    await VsStore.instance.set(
        _key + id, merged.map((n) => {'t': n.t, 's': n.s}).toList());
  }

  Future<void> clear(String id) async {
    await VsStore.instance.del(_key + id);
    await VsStore.instance.del(_scannedKey + id);
  }

  bool isScanned(String id) =>
      VsStore.instance.get<bool>(_scannedKey + id) ?? false;

  Future<void> markScanned(String id) =>
      VsStore.instance.set(_scannedKey + id, true);
}

/// UI 侧工具：把截图字节解码为 RGBA（dart:ui，需 Flutter binding）
Future<({Uint8List rgba, int w, int h})?> decodePixels(Uint8List bytes) async {
  try {
    final codec = await ui.instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    final data = await frame.image.toByteData(format: ui.ImageByteFormat.rawRgba);
    codec.dispose();
    frame.image.dispose();
    if (data == null) return null;
    return (rgba: data.buffer.asUint8List(), w: frame.image.width, h: frame.image.height);
  } catch (_) {
    return null;
  }
}
