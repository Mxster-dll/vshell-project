/// m3u8 下载引擎：解析 → 并发分片下载 → ffmpeg 合并 MP4
/// - 并发 6 分片（网络优先：分片小、可乱序、进度细粒度）
/// - 有 ffmpeg（PATH 或设置配置）→ 合并 MP4；无 → 拼接 .ts（可播）
/// - 进度回调 (percent, bytes, total)；取消/暂停
library;

import 'dart:async';
import 'dart:io';

import 'package:path/path.dart' as p;

import '../network/net.dart';

class HlsPlaylist {
  final List<String> segments; // 分片绝对 URL（有序）
  final int? bandwidth; // 选中变体带宽
  final int? targetDuration;
  final List<Quality> variants; // master 变体（可选档位）

  const HlsPlaylist({
    required this.segments,
    this.bandwidth,
    this.targetDuration,
    this.variants = const [],
  });
}

class Quality {
  final int bandwidth;
  final String url;
  const Quality({required this.bandwidth, required this.url});
}

/// 下载任务句柄
class HlsTask {
  bool canceled = false;
  bool paused = false;
  Completer<void>? _pauseGate;

  void cancel() {
    canceled = true;
    _resume();
  }

  void pause() {
    paused = true;
    _pauseGate ??= Completer<void>();
  }

  void resume() {
    paused = false;
    _resume();
  }

  void _resume() {
    final g = _pauseGate;
    if (g != null && !g.isCompleted) g.complete();
  }

  Future<void> _waitIfPaused() async {
    while (paused && !canceled) {
      final g = _pauseGate ??= Completer<void>();
      await g.future;
    }
  }
}

class HlsDownloader {
  HlsDownloader._();
  static final HlsDownloader instance = HlsDownloader._();

  static const concurrency = 6;

  /// ffmpeg 可执行路径（null = 未找到）
  String? ffmpegPath;

  Future<bool> detectFfmpeg({String? custom}) async {
    final cands = [if (custom != null && custom.isNotEmpty) custom, 'ffmpeg'];
    for (final c in cands) {
      try {
        final r = await Process.run(c, ['-version']);
        if (r.exitCode == 0) {
          ffmpegPath = c;
          return true;
        }
      } catch (_) {}
    }
    ffmpegPath = null;
    return false;
  }

  /// 解析 m3u8（master 自动选最高带宽变体）
  Future<HlsPlaylist> parseM3u8(String url) async {
    var currentUrl = url;
    var text = await Net.getText(currentUrl, headers: const {
      'Accept': '*/*',
      'Referer': 'https://www.acfun.cn/',
    });
    // master 变体
    final variants = <Quality>[];
    final segRe = RegExp(r'#EXT-X-STREAM-INF:[^\n]*BANDWIDTH=(\d+)[^\n]*\n([^\n]+)');
    for (final m in segRe.allMatches(text)) {
      final bw = int.tryParse(m.group(1)!) ?? 0;
      final u = _resolve(currentUrl, m.group(2)!.trim());
      variants.add(Quality(bandwidth: bw, url: u));
    }
    if (variants.isNotEmpty) {
      variants.sort((a, b) => b.bandwidth.compareTo(a.bandwidth));
      final best = variants.first;
      text = await Net.getText(best.url, headers: const {
        'Accept': '*/*',
        'Referer': 'https://www.acfun.cn/',
      });
      currentUrl = best.url;
    }
    // 分片列表
    final segs = <String>[];
    for (final line in text.split('\n')) {
      final l = line.trim();
      if (l.isEmpty || l.startsWith('#')) continue;
      segs.add(_resolve(currentUrl, l));
    }
    if (segs.isEmpty) {
      throw ApiException('m3u8 无分片（可能被防盗链拦截）', kind: 'parse');
    }
    final td = RegExp(r'#EXT-X-TARGETDURATION:(\d+)').firstMatch(text);
    return HlsPlaylist(
      segments: segs,
      bandwidth: variants.isNotEmpty ? variants.first.bandwidth : null,
      targetDuration: td != null ? int.tryParse(td.group(1)!) : null,
      variants: variants,
    );
  }

  String _resolve(String base, String u) {
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    final i = base.lastIndexOf('/');
    if (i < 0) return u;
    return base.substring(0, i + 1) + u;
  }

  /// 下载 m3u8 → MP4（或 TS）。savePath 含扩展名（.mp4/.ts）。
  /// onProgress(percent 0-100, downloadedBytes, totalBytesOrNull)
  Future<File> downloadM3u8(
    String url, {
    required String savePath,
    required HlsTask task,
    void Function(double pct, int bytes, int? total)? onProgress,
  }) async {
    final pl = await parseM3u8(url);
    final tmpDir = await Directory.systemTemp.createTemp('vshell_hls_');
    try {
      // 1. 并发下载分片
      final segFiles = <String>[];
      var downloaded = 0;
      var total = 0;
      // 先 HEAD 探测总大小（尽力）
      final sizes = <int>[];
      for (final s in pl.segments) {
        sizes.add(await _probeSize(s));
      }
      total = sizes.fold(0, (a, b) => a + b);

      final queue = List<int>.generate(pl.segments.length, (i) => i);
      var next = 0;
      final workers = List.generate(concurrency, (_) async {
        while (true) {
          if (task.canceled) return;
          await task._waitIfPaused();
          final i = next++;
          if (i >= queue.length) return;
          final segUrl = pl.segments[i];
          final f = await _downloadSeg(segUrl, p.join(tmpDir.path, 'seg${i.toString().padLeft(4, '0')}.ts'), task);
          if (f != null) {
            segFiles.add(f.path);
            downloaded += sizes[i] > 0 ? sizes[i] : f.lengthSync();
          }
          onProgress?.call(
              total > 0 ? (downloaded / total * 100).clamp(0, 100).toDouble() : -1,
              downloaded, total > 0 ? total : null);
        }
      });
      await Future.wait(workers);
      if (task.canceled) {
        throw ApiException('已取消', kind: 'canceled');
      }
      // 2. 合并
      final out = await _merge(segFiles, savePath, tmpDir);
      return out;
    } finally {
      try {
        tmpDir.delete(recursive: true);
      } catch (_) {}
    }
  }

  Future<int> _probeSize(String url) async {
    try {
      final cl = await HttpClient()
          .headUrl(Uri.parse(url))
          .timeout(const Duration(seconds: 6));
      final len = int.tryParse(cl.headers.value('content-length') ?? '');
      cl.close();
      return len ?? 0;
    } catch (_) {
      return 0;
    }
  }

  Future<File?> _downloadSeg(String url, String path, HlsTask task) async {
    try {
      final f = File(path);
      final sink = f.openWrite();
      final req = await HttpClient().getUrl(Uri.parse(url)).timeout(const Duration(seconds: 12));
      req.headers.set('Referer', 'https://www.acfun.cn/');
      req.headers.set('User-Agent',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0');
      final res = await req.close().timeout(const Duration(seconds: 12));
      if (res.statusCode != 200 && res.statusCode != 206) {
        await sink.close();
        await f.delete();
        return null;
      }
      await res.pipe(sink);
      await sink.close();
      return f;
    } catch (_) {
      try {
        if (await File(path).exists()) await File(path).delete();
      } catch (_) {}
      return null;
    }
  }

  Future<File> _merge(List<String> segFiles, String savePath, Directory tmpDir) async {
    // 排序（并发完成顺序不定）
    segFiles.sort();
    // 有 ffmpeg → MP4；否则 TS 拼接
    final isMp4 = savePath.toLowerCase().endsWith('.mp4');
    if (isMp4 && ffmpegPath != null) {
      // ffmpeg concat demuxer
      final listFile = File(p.join(tmpDir.path, 'list.txt'));
      await listFile.writeAsString(
          segFiles.map((f) => "file '${f.replaceAll("'", r"'\''")}'").join('\n'));
      final out = await Process.run(ffmpegPath!, [
        '-y', '-f', 'concat', '-safe', '0', '-i', listFile.path,
        '-c', 'copy', '-movflags', '+faststart', savePath,
      ]);
      if (out.exitCode != 0) {
        throw ApiException('ffmpeg 合并失败: ${out.stderr}', kind: 'merge');
      }
      return File(savePath);
    }
    // 无 ffmpeg → 二进制拼接（.ts 或 .mp4 扩展）
    final out = File(savePath);
    final sink = out.openWrite();
    for (final f in segFiles) {
      await sink.addStream(File(f).openRead());
    }
    await sink.close();
    return out;
  }

  /// 直链（mp4 等）并发 Range 下载——后续迭代
  Future<File> downloadDirect(String url, {required String savePath, required HlsTask task, void Function(double, int, int?)? onProgress}) {
    throw UnimplementedError('直链下载后续迭代');
  }
}
