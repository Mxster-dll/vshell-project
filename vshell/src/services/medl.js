/* ============================================================
 * medl — 媒体直链下载引擎（Media Direct-Link Downloader）
 * v0.5.6 第二十八轮（用户需求：FetchV 式下载引擎）
 *
 * ⚠️ 设计约束（用户明确要求，勿改）：
 * **不使用网站提供的下载引擎/下载接口/解析接口**——如 B 站的
 * playurl/wbi 下载接口、各站的"获取下载地址"API 等一律不碰；
 * 引擎只做两件事：**直接对媒体 URL（video 元素的 src / 用户
 * 粘贴的网址）发起 HTTP 下载** + **m3u8 播放列表解析与分片
 * 合并转 MP4**。因此本引擎对任何直链视频网站通用，不受站点
 * 下载接口限制（下载不了 B 站的 MSE 流是特性不是缺陷）。
 *
 * 能力：
 *  - m3u8 → MP4：解析 m3u8（master/media 两级）→ 多线程并发
 *    下载分片 → TS 分片经 mux.js transmux 为 fMP4、fMP4 分片
 *    原样 → 按序喂 mp4box 合并 → 保存 .mp4（含音轨）
 *  - 直链 → 单文件：并发 Range 分块（多线程）流式写盘
 *
 * 多线程：m3u8 分片并发（默认 6 路）；直链 Range 分块并发
 * （默认 6 路，块 1MB）。AES-128 加密 m3u8 暂不支持（报错）。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var CONCURRENCY = 6;          // 默认并发路数
  var CHUNK = 1024 * 1024;      // 直链分块大小（1MB）
  var HLS_RE = /\.m3u8(\?|#|$)/i;

  /* ---------- m3u8 解析 ---------- */
  /** 解析 m3u8 文本 → {type, variants, segments, map, key}
   *  segments: [{uri, duration, disc}]；variants: [{uri, bandwidth, resolution}]
   *  master（含 #EXT-X-STREAM-INF）→ variants；media → segments */
  function parseM3u8(text, baseUrl) {
    var out = { type: 'media', variants: [], segments: [], map: null, key: null };
    if (!text) return out;
    var lines = String(text).split(/\r?\n/);
    var cur = null;               // 当前 EXTINF 片段的 duration
    var variant = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
        variant = { uri: null, bandwidth: 0, resolution: '' };
        var m = line.match(/BANDWIDTH=(\d+)/i);
        if (m) variant.bandwidth = parseInt(m[1], 10) || 0;
        m = line.match(/RESOLUTION=([\dx]+)/i);
        if (m) variant.resolution = m[1];
        out.type = 'master';
        continue;
      }
      if (line.indexOf('#EXT-X-MAP:') === 0) {
        m = line.match(/URI="([^"]+)"/i);
        if (m) out.map = resolveUrl(m[1], baseUrl);
        continue;
      }
      if (line.indexOf('#EXT-X-KEY:') === 0) {
        m = line.match(/METHOD=([^,]+)/i);
        if (m && m[1].toUpperCase() !== 'NONE') out.key = line;
        continue;
      }
      if (line.indexOf('#EXTINF:') === 0) {
        m = line.match(/#EXTINF:\s*([\d.]+)/i);
        cur = m ? parseFloat(m[1]) : 0;
        continue;
      }
      if (line.charAt(0) === '#') continue;
      // 资源行
      if (variant) {
        variant.uri = resolveUrl(line, baseUrl);
        out.variants.push(variant);
        variant = null;
      } else {
        out.segments.push({ uri: resolveUrl(line, baseUrl), duration: cur || 0 });
        cur = null;
      }
    }
    return out;
  }
  function resolveUrl(u, base) {
    if (!base) return u;
    if (/^(https?:|blob:|data:)/i.test(u)) return u;   // 绝对 URL 原样（含 blob:）
    if (u.charAt(0) === '/') {
      var m = base.match(/^https?:\/\/[^/]+/i);
      return (m ? m[0] : '') + u;
    }
    var slash = base.lastIndexOf('/');
    return (slash >= 0 ? base.slice(0, slash + 1) : base) + u;
  }

  /* ---------- 直链并发分块下载 ---------- */
  /** 多线程 Range 分块拉取整个资源 → 返回 {total, chunks:[{start,data}]}；
   *  供 _testFetchChunks 与下载复用（不写盘，仅网络层） */
  async function fetchChunks(url, opts) {
    var concurrency = (opts && opts.concurrency) || CONCURRENCY;
    var signal = opts && opts.signal;
    var probe = await fetch(url, { credentials: 'include', signal: signal });
    if (!probe.ok) throw new Error('HTTP ' + probe.status + ' ' + probe.statusText);
    var total = Number(probe.headers.get('Content-Length'));
    if (!total) {
      // 无 Content-Length：整流下载（不分块）
      var whole = await probe.arrayBuffer();
      return { total: whole.byteLength, chunks: [{ start: 0, data: whole }] };
    }
    var chunks = [];
    var next = 0;
    var active = 0;
    var fail = null;
    await new Promise(function (resolve) {
      function pump() {
        while (active < concurrency && next < total) {
          var start = next;
          var end = Math.min(total - 1, start + CHUNK - 1);
          next = end + 1;
          active++;
          (function (st, en) {
            fetch(url, { credentials: 'include', headers: { Range: 'bytes=' + st + '-' + en }, signal: signal })
              .then(function (r) {
                if (!r.ok && r.status !== 206) throw new Error('HTTP ' + r.status);
                return r.arrayBuffer();
              })
              .then(function (buf) {
                chunks.push({ start: st, data: buf });
              })
              .catch(function (e) { fail = e; })
              .then(function () {
                active--;
                if (fail) { resolve(); return; }
                if (next < total || active === 0) pump();
                if (next >= total && active === 0) resolve();
              });
          })(start, end);
        }
      }
      pump();
    });
    if (fail) throw fail;
    chunks.sort(function (a, b) { return a.start - b.start; });
    return { total: total, chunks: chunks };
  }

  /* ---------- m3u8 下载：分片并发 → transmux → mp4box 合并 ---------- */
  /** 转 ArrayBuffer（mp4box.appendBuffer 内部用 DataView，拒收 Uint8Array——
   *  mux.js 的 segment.data 是 Uint8Array，真实 TS 流必须转换） */
  function toAB(x) {
    if (!x) return x;
    if (x instanceof ArrayBuffer) return x;
    if (x.buffer instanceof ArrayBuffer) {
      return x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength);
    }
    return x;
  }
  /** 把 fMP4 片段（initSegment + data）提交给 mp4box。
   *  坑1：mp4box.appendBuffer 的 buffer **必须带 fileStart 属性**（否则
   *  'Buffer must have a fileStart property'）；appendBuffer 返回值是
   *  下一个 buffer 应使用的 fileStart（官方 remux demo 用法）
   *  坑2：appendBuffer 拒收 Uint8Array（DataView 构造失败）——先 toAB */
  var fstart = 0;
  function appendFrag(box, initSeg, data) {
    if (initSeg) {
      initSeg = toAB(initSeg);
      initSeg.fileStart = fstart;
      var next = box.appendBuffer(initSeg);
      fstart = (typeof next === 'number' ? next : fstart + initSeg.byteLength);
    }
    if (data) {
      data = toAB(data);
      data.fileStart = fstart;
      var next2 = box.appendBuffer(data);
      fstart = (typeof next2 === 'number' ? next2 : fstart + data.byteLength);
    }
  }
  /** TS 分片 → mux.js transmux → {initSeg, data}（fMP4） */
  function tsToFrag(tsBuf) {
    var Transmuxer = (window.muxjs && window.muxjs.mp4 && window.muxjs.mp4.Transmuxer) || null;
    if (!Transmuxer) throw new Error('mux.js 未加载（TS 分片需要 transmuxer）');
    var out = null;
    var tx = new Transmuxer({ keepOriginalTimestamps: true });
    tx.on('data', function (seg) {
      out = seg;
    });
    tx.push(new Uint8Array(tsBuf));
    tx.flush();
    if (!out || !out.data) throw new Error('transmux 失败');
    return { initSeg: out.initSegment || null, data: out.data };
  }
  /** 下载单个 m3u8 分片（重试 2 次） */
  async function fetchSeg(uri, signal) {
    var lastErr = null;
    for (var tryN = 0; tryN < 3; tryN++) {
      try {
        var r = await fetch(uri, { credentials: 'include', signal: signal });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.arrayBuffer();
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('分片下载失败：' + uri);
  }
  function isTs(buf) {
    if (!buf || buf.byteLength < 188) return false;
    var u = new Uint8Array(buf);
    return u[0] === 0x47 && (u[188] === 0x47 || buf.byteLength <= 188);
  }

  /** 下载 m3u8 并转 MP4（纯网络+合并，**不写盘**——写盘由 download 负责）。
   *  返回 {bytes, buffer, totalInput, segments} */
  async function m3u8ToMp4(playlistUrl, opts) {
    var onProgress = opts && opts.onProgress;
    var signal = opts && opts.signal;
    var resp = await fetch(playlistUrl, { credentials: 'include', signal: signal });
    if (!resp.ok) throw new Error('m3u8 HTTP ' + resp.status);
    var text = await resp.text();
    var parsed = parseM3u8(text, playlistUrl);
    if (parsed.key) throw new Error('AES-128 加密流暂不支持');
    var segs = parsed.segments;
    var mpUrl = playlistUrl;
    if (parsed.type === 'master') {
      // 选最高带宽清晰度
      var best = null;
      for (var i = 0; i < parsed.variants.length; i++) {
        if (!best || parsed.variants[i].bandwidth > best.bandwidth) best = parsed.variants[i];
      }
      if (!best) throw new Error('master 无可用清晰度');
      mpUrl = best.uri;
      var r2 = await fetch(mpUrl, { credentials: 'include', signal: signal });
      if (!r2.ok) throw new Error('媒体列表 HTTP ' + r2.status);
      var t2 = await r2.text();
      parsed = parseM3u8(t2, mpUrl);
      if (parsed.key) throw new Error('AES-128 加密流暂不支持');
      segs = parsed.segments;
    }
    if (!segs.length) throw new Error('播放列表没有分片');
    // 分片并发下载（多线程）
    var concurrency = (opts && opts.concurrency) || CONCURRENCY;
    var bufs = new Array(segs.length);
    var nextIdx = 0;
    var failErr = null;
    await new Promise(function (resolve) {
      var active = 0;
      function pump() {
        while (active < concurrency && nextIdx < segs.length) {
          var idx = nextIdx++;
          active++;
          // 闭包捕获 idx（var 提升竞态：并发回调共享最后值 → bufs 大量 undefined）
          (function (ix) {
            fetchSeg(segs[ix].uri, signal).then(function (b) {
              bufs[ix] = b;
              if (onProgress) onProgress(bufs.filter(Boolean).length, segs.length, '分片');
            }).catch(function (e) { failErr = e; }).then(function () {
              active--;
              if (failErr) { resolve(); return; }
              if (nextIdx < segs.length || active === 0) pump();
              if (nextIdx >= segs.length && active === 0) resolve();
            });
          })(idx);
        }
      }
      pump();
    });
    if (failErr) throw failErr;
    var bytes = 0;
    for (var k = 0; k < bufs.length; k++) bytes += bufs[k].byteLength;
    // init 片段（#EXT-X-MAP，fMP4 流）
    var initBuf = null;
    if (parsed.map) {
      initBuf = await fetchSeg(parsed.map, signal);
    }
    var pendingInit = initBuf;
    // 全部分片归一为 fMP4（TS 分片 transmux；首个 TS 分片同时产出 initSeg）
    for (var j = 0; j < bufs.length; j++) {
      if (isTs(bufs[j])) {
        var frag = tsToFrag(bufs[j]);
        if (!pendingInit && frag.initSeg) pendingInit = frag.initSeg;
        bufs[j] = frag.data;
      }
    }
    // 合并输出：initSegment + 各媒体分片按序拼接（fMP4 序列即合法 MP4——
    // moof 内 trun.data_offset 相对自身 moof 起始，整体平移不破坏偏移）。
    // mp4box 0.5.x 的 save/write 只输出顶层盒子（ftyp+moov），分片 mdat 已
    // 被 processSamples 消费，无法重排——故不用它做合并。
    var parts = [];
    var outLen = 0;
    if (pendingInit) {
      var pi = toAB(pendingInit);
      parts.push(pi);
      outLen += pi.byteLength;
    }
    for (var p = 0; p < bufs.length; p++) {
      var part = toAB(bufs[p]);
      parts.push(part);
      outLen += part.byteLength;
    }
    if (!outLen) throw new Error('MP4 合并失败（输出为空） segments=' + bufs.length);
    var outBuf = new ArrayBuffer(outLen);
    var vu = new Uint8Array(outBuf);
    var off = 0;
    for (var q = 0; q < parts.length; q++) {
      vu.set(new Uint8Array(parts[q]), off);
      off += parts[q].byteLength;
    }
    if (onProgress) onProgress(1, 1, '合并');
    return { bytes: outLen, buffer: outBuf, totalInput: bytes, segments: bufs.length };
  }

  /* ---------- 对外下载入口 ---------- */
  /** 下载任意媒体 URL：
   *   m3u8 → 分片并发 → transmux/合并 → MP4
   *   直链 → 并发 Range 分块 → 流式写盘（保持原容器）
   *   onProgress(pct 0-100, bytes, total)——bytes/total 仅直链分支有
   *   （m3u8 分支传 null）；opts.signal 支持取消（AbortController）
   *   返回 {bytes} 或 null（用户取消） */
  async function download(url, opts) {
    var onProgress = opts && opts.onProgress;
    var name = opts && opts.name;
    var signal = opts && opts.signal;
    if (HLS_RE.test(url)) {
      var out = await m3u8ToMp4(url, {
        concurrency: opts && opts.concurrency,
        signal: signal,
        onProgress: function (done, total, phase) {
          if (onProgress && total) {
            var base = phase === '合并' ? 92 : 0;
            var span = phase === '合并' ? 8 : 92;
            onProgress(Math.round(base + (done / total) * span), null, null);
          }
        },
      });
      var fname = (name || 'video') + '.mp4';
      var writer = await V.fswriter.pickSaveFile(fname);
      if (!writer) return null;
      try {
        await writer.write(out.buffer, 0);
        await writer.close();
        return { bytes: out.bytes, kind: 'm3u8', segments: out.segments };
      } catch (e) {
        try { await writer.abort(); } catch (e2) { /* noop */ }
        throw e;
      }
    }
    // 直链：并发 Range 分块 → FSA / Blob 降级
    var ext = (url.match(/\.([a-z0-9]{2,5})(\?|#|$)/i) || [])[1] || 'mp4';
    var wname = (name || 'video') + '.' + ext.toLowerCase();
    var w = await V.fswriter.pickSaveFile(wname);
    if (!w) return null;
    try {
      var res = await fetchChunks(url, { concurrency: opts && opts.concurrency, signal: signal });
      var acc = 0;
      for (var i = 0; i < res.chunks.length; i++) {
        await w.write(res.chunks[i].data, res.chunks[i].start);
        acc += res.chunks[i].data.byteLength;
        if (onProgress) onProgress(Math.round((acc / res.total) * 100), acc, res.total);
      }
      await w.close();
      return { bytes: res.total, kind: 'direct' };
    } catch (e) {
      try { await w.abort(); } catch (e2) { /* noop */ }
      throw e;
    }
  }

  /** URL 类型探测 */
  function detect(url) {
    if (!url) return 'none';
    if (HLS_RE.test(url)) return 'm3u8';
    return 'media';
  }

  V.medl = {
    download: download,
    detect: detect,
    parseM3u8: parseM3u8,
    CONCURRENCY: CONCURRENCY,
    // 测试钩子：多线程 Range 拉取网络层（不写盘）
    _fetchChunks: fetchChunks,
    _m3u8ToMp4: m3u8ToMp4,
    _isTs: isTs,
    _tsToFrag: tsToFrag,
  };
})();
