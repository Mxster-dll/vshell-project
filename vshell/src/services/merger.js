/* ============================================================
 * merger — 浏览器内合并 视频轨+音频轨（两条 fMP4 m4s）→ 单个 mp4
 *
 * 方案：字节级 remux（无损不转码，时间戳零改动）
 *   1. 拆解两条源：ftyp + moov + (moof/mdat)*
 *   2. 重建 moov：原样保留视频 trak；把音频 trak 原样并入（仅 patch
 *      tkhd.track_id）；mvex 重建并并入音频 trex（patch track_id）
 *   3. moof/mdat 原样透传（仅 patch 音频 moof 的 tfhd.track_id）
 *   4. 拼接：ftyp + 新 moov + 视频 payload + 音频 payload
 * 不依赖 mp4box 解析（纯字节操作）；失败抛 Error（调用方降级双文件）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  /* ---------- 字节工具 ---------- */
  function u32(buf, off) {
    return (buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3];
  }
  function setU32(buf, off, val) {
    buf[off] = (val >>> 24) & 0xff;
    buf[off + 1] = (val >>> 16) & 0xff;
    buf[off + 2] = (val >>> 8) & 0xff;
    buf[off + 3] = val & 0xff;
  }
  function concatParts(parts) {
    var total = 0;
    for (var i = 0; i < parts.length; i++) total += parts[i].byteLength;
    var out = new Uint8Array(total);
    var off = 0;
    for (var j = 0; j < parts.length; j++) {
      out.set(new Uint8Array(parts[j]), off);
      off += parts[j].byteLength;
    }
    return out.buffer;
  }

  /** 遍历顶层 box：返回 [{type, start, end}]（start/end 为绝对偏移） */
  function topLevel(ab) {
    var u = new Uint8Array(ab);
    var boxes = [];
    var pos = 0;
    while (pos + 8 <= u.length) {
      var size = u32(u, pos);
      var type = String.fromCharCode(u[pos + 4], u[pos + 5], u[pos + 6], u[pos + 7]);
      var end = size === 1 ? pos + (u[pos + 8] * Math.pow(2, 56) + 8) : pos + size;
      if (size === 0) end = u.length;
      boxes.push({ type: type, start: pos, end: end });
      if (end <= pos || end >= u.length && size !== 0 && size !== 1) break;
      pos = end;
      if (pos >= u.length) break;
    }
    return boxes;
  }
  /** 在 [start,end) 范围内找第一个指定类型的子 box（返回其字节片段视图） */
  function childBox(u, start, end, type) {
    var pos = start;
    while (pos + 8 <= end) {
      var size = u32(u, pos);
      var t = String.fromCharCode(u[pos + 4], u[pos + 5], u[pos + 6], u[pos + 7]);
      var boxEnd = size === 1 ? pos + (u[pos + 8] * Math.pow(2, 56) + 8) : pos + size;
      if (size === 0) boxEnd = end;
      if (t === type) return { start: pos, end: boxEnd };
      if (boxEnd <= pos) break;
      pos = boxEnd;
    }
    return null;
  }
  /** 子 box 列表（视图） */
  function childBoxes(u, start, end) {
    var out = [];
    var pos = start;
    while (pos + 8 <= end) {
      var size = u32(u, pos);
      var t = String.fromCharCode(u[pos + 4], u[pos + 5], u[pos + 6], u[pos + 7]);
      var boxEnd = size === 1 ? pos + (u[pos + 8] * Math.pow(2, 56) + 8) : pos + size;
      if (size === 0) boxEnd = end;
      out.push({ type: t, start: pos, end: boxEnd });
      if (boxEnd <= pos) break;
      pos = boxEnd;
    }
    return out;
  }
  /** 重建容器 box：header(size+type) + children 字节 */
  function rebuildBox(type, childrenBytes) {
    var total = 8;
    for (var i = 0; i < childrenBytes.length; i++) total += childrenBytes[i].byteLength;
    var out = new Uint8Array(total);
    setU32(out, 0, total);
    for (var k = 0; k < 4; k++) out[4 + k] = type.charCodeAt(k);
    var off = 8;
    for (var j = 0; j < childrenBytes.length; j++) {
      out.set(new Uint8Array(childrenBytes[j]), off);
      off += childrenBytes[j].byteLength;
    }
    return out.buffer;
  }

  /** tkhd.track_id（trak 内 tkhd fullbox 后：+8 header +4 ver/flags +4 ctime +4 mtime → +20） */
  function patchTkhdTrackId(trakBytes, newId) {
    var u = new Uint8Array(trakBytes);
    var tkhd = childBox(u, 8, u.length, 'tkhd'); // 跳过 trak 自身 8 字节头
    if (tkhd) setU32(u, tkhd.start + 20, newId);
    return trakBytes;
  }
  /** trex.track_id（+8 header +4 ver/flags → +12） */
  function patchTrexTrackId(trexBytes, newId) {
    var u = new Uint8Array(trexBytes);
    setU32(u, 12, newId);
    return trexBytes;
  }
  /** payload（moov 之后的所有 moof/mdat）中每个 moof→traf→tfhd 的 track_id 1→2 */
  function patchMoofTrackIds(payload, fromId, toId) {
    var u = new Uint8Array(payload);
    var boxes = topLevel(payload);
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b.type !== 'moof') continue;
      var trafs = childBoxes(u, b.start + 8, b.end);
      for (var j = 0; j < trafs.length; j++) {
        if (trafs[j].type !== 'traf') continue;
        var tfhd = childBox(u, trafs[j].start + 8, trafs[j].end, 'tfhd');
        if (!tfhd) continue;
        if (u32(u, tfhd.start + 12) === fromId) setU32(u, tfhd.start + 12, toId);
      }
    }
    return payload;
  }

  /* ---------- 合并主流程 ---------- */
  function mergeTracks(opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      try {
        var video = opts.video;
        var audio = opts.audio;
        if (!video) return reject(new Error('视频轨为空'));

        var vBoxes = topLevel(video);
        var vMoov = null, vFtypEnd = 0;
        for (var i = 0; i < vBoxes.length; i++) {
          if (vBoxes[i].type === 'ftyp') vFtypEnd = vBoxes[i].end;
          if (vBoxes[i].type === 'moov') vMoov = vBoxes[i];
        }
        if (!vMoov) return reject(new Error('视频轨缺少 moov（非 fMP4？）'));

        var vu = new Uint8Array(video);
        var moovChildren = childBoxes(vu, vMoov.start + 8, vMoov.end);
        var vTrak = null, vMvex = null, vTid = 1;
        for (var m = 0; m < moovChildren.length; m++) {
          if (moovChildren[m].type === 'trak' && !vTrak) vTrak = moovChildren[m];
          if (moovChildren[m].type === 'mvex' && !vMvex) vMvex = moovChildren[m];
        }
        if (!vTrak) return reject(new Error('视频轨无 trak'));
        if (!vMvex) return reject(new Error('视频轨无 mvex（非碎片化，无法合并）'));
        // 读取视频 trak id
        var vTkhd = childBox(vu, vTrak.start + 8, vTrak.end, 'tkhd');
        if (vTkhd) vTid = u32(vu, vTkhd.start + 20);

        if (opts.onProgress) opts.onProgress(0.3);

        // 音频 trak / trex
        var aTrakBytes = null, aTrexBytes = null, aTid = 1;
        if (audio) {
          var aBoxes = topLevel(audio);
          var aMoov = null;
          for (var j = 0; j < aBoxes.length; j++) if (aBoxes[j].type === 'moov') aMoov = aBoxes[j];
          if (!aMoov) return reject(new Error('音频轨缺少 moov'));
          var au = new Uint8Array(audio);
          var aChildren = childBoxes(au, aMoov.start + 8, aMoov.end);
          var aTrak = null, aMvex = null;
          for (var n = 0; n < aChildren.length; n++) {
            if (aChildren[n].type === 'trak' && !aTrak) aTrak = aChildren[n];
            if (aChildren[n].type === 'mvex' && !aMvex) aMvex = aChildren[n];
          }
          if (!aTrak) return reject(new Error('音频轨无 trak'));
          var aTkhd = childBox(au, aTrak.start + 8, aTrak.end, 'tkhd');
          if (aTkhd) aTid = u32(au, aTkhd.start + 20);
          aTrakBytes = videoToBuf(au.subarray(aTrak.start, aTrak.end));
          patchTkhdTrackId(aTrakBytes, newTrackId(vTid, aTid));
          if (aMvex) {
            var aMvexChildren = childBoxes(au, aMvex.start + 8, aMvex.end);
            for (var p = 0; p < aMvexChildren.length; p++) {
              if (aMvexChildren[p].type === 'trex') {
                var tr = au.subarray(aMvexChildren[p].start, aMvexChildren[p].end);
                aTrexBytes = videoToBuf(tr);
                patchTrexTrackId(aTrexBytes, newTrackId(vTid, aTid));
                break;
              }
            }
          }
        }

        if (opts.onProgress) opts.onProgress(0.6);

        // 重建 moov：mvhd/其他 + 视频 trak + 音频 trak + 重建 mvex（并入音频 trex）
        var newMoovChildren = [];
        var mvexBytes = null;
        for (var q = 0; q < moovChildren.length; q++) {
          var c = moovChildren[q];
          if (c.type === 'trak') {
            newMoovChildren.push(vu.subarray(c.start, c.end));
          } else if (c.type === 'mvex') {
            // 稍后重建
          } else {
            newMoovChildren.push(vu.subarray(c.start, c.end));
          }
        }
        if (aTrakBytes) newMoovChildren.push(aTrakBytes);
        // 重建 mvex：原 mvex children + 音频 trex
        var mvexChildrenBytes = [];
        if (vMvex) {
          var vmChildren = childBoxes(vu, vMvex.start + 8, vMvex.end);
          for (var r = 0; r < vmChildren.length; r++) {
            mvexChildrenBytes.push(vu.subarray(vmChildren[r].start, vmChildren[r].end));
          }
        }
        if (aTrexBytes) mvexChildrenBytes.push(aTrexBytes);
        mvexBytes = rebuildBox('mvex', mvexChildrenBytes);
        newMoovChildren.push(mvexBytes);

        var newMoov = rebuildBox('moov', newMoovChildren);

        if (opts.onProgress) opts.onProgress(0.8);

        // payload 透传 + 音频 moof track_id patch
        var vPayload = video.slice(vMoov.end);
        var aPayload = audio ? audio.slice(aMoovEndOf(audio)) : null;
        if (aPayload) patchMoofTrackIds(aPayload, aTid, newTrackId(vTid, aTid));

        var out = concatParts([
          video.slice(0, vMoov.start),   // ftyp（或 moov 前的任何 box）
          newMoov,
          vPayload,
          aPayload ? aPayload : new ArrayBuffer(0),
        ]);

        if (opts.onProgress) opts.onProgress(1);
        resolve(out);
      } catch (e) {
        reject(e);
      }
    });
  }

  function aMoovEndOf(ab) {
    var boxes = topLevel(ab);
    for (var i = 0; i < boxes.length; i++) if (boxes[i].type === 'moov') return boxes[i].end;
    return 0;
  }
  function videoToBuf(ua) {
    var buf = new ArrayBuffer(ua.length);
    new Uint8Array(buf).set(ua);
    return buf;
  }
  function newTrackId(vTid, aTid) {
    if (aTid !== vTid) return aTid;
    return vTid === 1 ? 2 : 1;
  }

  V.merger = { mergeTracks: mergeTracks };
})();
