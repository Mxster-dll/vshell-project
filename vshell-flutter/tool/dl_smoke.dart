/// 下载引擎冒烟测试：真实 AcFun m3u8 解析 + 并发分片下载 + ffmpeg 合并
/// dart run tool/dl_smoke.dart
library;

import 'dart:io';

import 'package:vshell/data/acfun_source.dart';
import 'package:vshell/services/hls_downloader.dart';

Future<void> main() async {
  var ok = true;
  void check(String name, bool cond, [String? detail]) {
    print('${cond ? "PASS" : "FAIL"}  $name${detail != null ? "  ($detail)" : ""}');
    if (!cond) ok = false;
  }

  try {
    // 1. 取真实 m3u8
    final src = AcfunSource();
    final pi = await src.playInfo('48797236');
    check('playInfo m3u8', pi.m3u8Url.contains('.m3u8'), pi.m3u8Url.substring(0, 80));

    // 2. 解析 m3u8
    final dl = HlsDownloader.instance;
    final pl = await dl.parseM3u8(pi.m3u8Url);
    check('parseM3u8 segments', pl.segments.isNotEmpty, '${pl.segments.length} segments');
    // AcFun 直接给媒体 m3u8（非 master），variants 允许为空
    print('  variants: ${pl.variants.length} (媒体 m3u8 无变体为预期)');
    print('  first seg: ${pl.segments.first.substring(0, 100)}...');

    // 3. 下载前 3 个分片（并发，按序保存）
    final tmp = await Directory.systemTemp.createTemp('vshell_dltest_');
    final segs = pl.segments.take(3).toList();
    final files = <File>[];
    final task = HlsTask();
    await Future.wait(List.generate(segs.length, (i) async {
      final f = File('${tmp.path}/seg_$i.ts');
      final sink = f.openWrite();
      final req = await HttpClient().getUrl(Uri.parse(segs[i]));
      req.headers.set('Referer', 'https://www.acfun.cn/');
      final res = await req.close();
      await res.pipe(sink);
      await sink.close();
      return f;
    }));
    for (var i = 0; i < segs.length; i++) {
      files.add(File('${tmp.path}/seg_$i.ts'));
    }
    final sizes = files.map((f) => f.lengthSync()).toList();
    check('segments downloaded', sizes.every((s) => s > 0), sizes.join(','));
    final total = sizes.fold<int>(0, (a, b) => a + b);
    print('  3 segments total: ${total} bytes');

    // 4. TS 头校验（0x47 sync byte）
    final head = await files.first.openRead(0, 4).fold<List<int>>([], (a, b) => a..addAll(b));
    check('TS sync byte 0x47', head.isNotEmpty && head[0] == 0x47,
        head.isNotEmpty ? '0x${head[0].toRadixString(16)}' : 'empty');

    // 5. ffmpeg 探测 + 合并（如果可用）
    final hasFfmpeg = await dl.detectFfmpeg();
    check('ffmpeg detect', hasFfmpeg, dl.ffmpegPath ?? 'none');
    if (hasFfmpeg) {
      final segFiles = files.map((f) => f.path).toList()..sort();
      final listFile = File('${tmp.path}/list.txt');
      await listFile.writeAsString(
          segFiles.map((f) => "file '${f.replaceAll("'", r"'\''")}'").join('\n'));
      final out = await Process.run(dl.ffmpegPath!, [
        '-y', '-f', 'concat', '-safe', '0', '-i', listFile.path,
        '-c', 'copy', '${tmp.path}/out.mp4',
      ]);
      check('ffmpeg concat', out.exitCode == 0, out.exitCode == 0 ? '' : '${out.stderr}'.substring(0, 200));
      final outFile = File('${tmp.path}/out.mp4');
      check('merged mp4', await outFile.exists() && await outFile.length() > 0,
          '${await outFile.length()} bytes');
    }

    // 清理
    try {
      tmp.delete(recursive: true);
    } catch (_) {}
  } catch (e) {
    check('unexpected error', false, '$e');
  }

  print(ok ? '\nALL PASS' : '\nSOME FAILED');
}
