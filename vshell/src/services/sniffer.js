/* ============================================================
 * sniffer — 视频嗅探下载（v0.5.6 第二十七轮，用户需求：
 * 「内置一个类似于 FetchV 的功能」——嗅探页面上加载的媒体
 * 资源 → 一键下载；下载不了 B 站没关系（MSE/blob 流），
 * 通用直链视频网站均可使用）
 *
 * 数据源：
 *  - video 元素：document.querySelectorAll('video') 的
 *    src/currentSrc（含 vshell 自己的播放器）；blob: URL 尝试
 *    fetch 取 blob（objectURL 直链可成；MSE 流只有当前缓冲，
 *    多数失败 → ok=false 标记「无法直接下载」）
 *  - PerformanceResourceTiming：initiatorType 为 video/audio，
 *    或 URL 扩展名命中媒体后缀（mp4/webm/m4s/ts/mp3/m4a/mov/
 *    mkv/flv/avi/wav/ogg/opus/aac）——被动嗅探：PerformanceObserver
 *    buffered 重放 + 持续收集（页面播放时自动累积）
 *  - scanNow()：手动全量扫描（面板「重新扫描」按钮）
 *
 * download(item)：fetch(url, credentials include) → 分块流式 →
 *  V.fswriter.pickSaveFile（FSA 保存对话框 / Blob 降级）→
 *  进度回调 onProgress(offset, total)
 *
 * 注意：油猴运行在目标页面上下文——同源资源 fetch 无 CORS
 * 问题；跨域 CDN 若页面已能播放，一般同源或已放行 CORS。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var MEDIA_RE = /\.(mp4|webm|m4s|m4a|ts|mov|mkv|flv|avi|wav|ogg|opus|aac|mp3)(\?|#|$)/i;
  var TYPE_EXT = {
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/mp2t': 'ts',
    'video/quicktime': 'mov', 'video/x-matroska': 'mkv', 'video/x-flv': 'flv',
    'video/x-msvideo': 'avi', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
    'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
    'audio/opus': 'opus',
  };

  var items = [];        // [{id, url, type, size, title, source, ok}]
  var seen = {};         // URL 去重键（blob: 按元素维度附加键）
  var listeners = [];
  var seq = 0;
  var ob = null, mo = null, scanTimer = null;

  function notify() {
    var copy = items.slice();
    listeners.forEach(function (fn) { try { fn(copy); } catch (e) { /* noop */ } });
  }
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  function titleFromUrl(url) {
    try {
      var p = String(url).split('?')[0].split('#')[0];
      var seg = p.split('/').filter(Boolean).pop();
      if (seg) return decodeURIComponent(seg);
    } catch (e) { /* noop */ }
    return url;
  }
  function extOf(url, type) {
    var m = String(url).match(/\.([a-z0-9]{2,5})(\?|#|$)/i);
    if (m) return m[1].toLowerCase();
    var t = TYPE_EXT[String(type).split(';')[0].toLowerCase()];
    return t || 'mp4';
  }
  function safeName(s) {
    return String(s || 'video').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 120) || 'video';
  }
  function fmtSize(n) {
    if (!n) return '';
    if (n > 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n > 1024) return (n / 1024).toFixed(0) + ' KB';
    return n + ' B';
  }

  /** 添加一个媒体条目（URL 去重；返回是否新增） */
  function add(url, type, title, source, size) {
    if (!url || !/^(https?:|blob:|data:)/i.test(url)) return false;
    var key = String(url).slice(0, 300);
    if (seen[key]) return false;
    seen[key] = true;
    items.push({
      id: 'sn' + (++seq),
      url: url,
      type: type || '',
      size: size || 0,
      title: title || titleFromUrl(url),
      source: source || '',
      ok: true,
    });
    notify();
    return true;
  }

  /** blob: URL 探测：fetch 拿 blob（objectURL 可成；MSE 失败 → ok=false） */
  function probeBlob(url, title) {
    if (!/^blob:/.test(url)) return;
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }).then(function (b) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].url === url) {
          items[i].size = b.size;
          items[i].ok = b.size > 0;
          notify();
          break;
        }
      }
    }).catch(function () {
      for (var i = 0; i < items.length; i++) {
        if (items[i].url === url) { items[i].ok = false; notify(); break; }
      }
    });
  }

  /** 扫描全部 video 元素（含 vshell 播放器） */
  function scanVideos() {
    var vids = document.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i];
      var src = v.currentSrc || v.src || '';
      var title = v.getAttribute('aria-label')
        || (v.closest && v.closest('[title]') ? v.closest('[title]').getAttribute('title') : '')
        || '';
      if (src) {
        add(src, v.type || '', title, 'video 元素', 0);
        if (/^blob:/.test(src)) probeBlob(src, title);
      }
    }
  }

  /** 扫描 PerformanceResourceTiming（历史 + 新条目） */
  function ingestPerf(e) {
    try {
      var hit = /^(video|audio)$/.test(e.initiatorType || '')
        || MEDIA_RE.test(e.name || '')
        || /^video\//.test(e.responseType || '');
      if (!hit) return;
      var size = e.transferSize > 0 ? e.transferSize : (e.decodedBodySize > 0 ? e.decodedBodySize : 0);
      add(e.name, e.responseType || '', titleFromUrl(e.name), '网络请求', size);
    } catch (err) { /* noop */ }
  }
  function scanPerf() {
    try {
      var es = performance.getEntriesByType('resource');
      for (var i = 0; i < es.length; i++) ingestPerf(es[i]);
    } catch (e) { /* noop */ }
  }

  /** 全量扫描（面板「重新扫描」/ 初次挂载） */
  function scanNow() {
    scanVideos();
    scanPerf();
    return items.length;
  }

  function init() {
    if (ob) return;
    try {
      ob = new PerformanceObserver(function (list) {
        var es = list.getEntries();
        for (var i = 0; i < es.length; i++) ingestPerf(es[i]);
      });
      ob.observe({ entryTypes: ['resource'] });
    } catch (e) { /* noop */ }
    try {
      mo = new MutationObserver(function () {
        // 节流：DOM 变化后 300ms 扫一次（新 video 挂载/换源）
        if (scanTimer) return;
        scanTimer = setTimeout(function () {
          scanTimer = null;
          scanVideos();
        }, 300);
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { /* noop */ }
    scanNow();
  }

  /** 下载：fetch 流式 → fswriter（FSA 保存对话框 / Blob 降级）
   *  返回 true=完成 / false=用户取消 / 抛错=失败 */
  async function download(it, onProgress) {
    if (!it || !it.url) throw new Error('无效的媒体条目');
    var resp = await fetch(it.url, { credentials: 'include' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
    var len = Number(resp.headers.get('Content-Length')) || 0;
    var name = safeName(it.title) + '.' + extOf(it.url, it.type);
    var writer = await V.fswriter.pickSaveFile(name);
    if (!writer) return false;
    try {
      var reader = resp.body.getReader();
      var offset = 0, last = 0;
      while (true) {
        var r = await reader.read();
        if (r.done) break;
        var buf = (r.value.byteOffset === 0 && r.value.byteLength === r.value.buffer.byteLength)
          ? r.value.buffer : r.value.slice().buffer;
        await writer.write(buf, offset);
        offset += r.value.byteLength;
        if (onProgress && (offset - last > 262144 || r.done)) {
          last = offset;
          onProgress(offset, len);
        }
      }
      await writer.close();
      return true;
    } catch (e) {
      try { await writer.abort(); } catch (e2) { /* noop */ }
      throw e;
    }
  }

  function clear() {
    items = [];
    seen = {};
    notify();
  }

  V.sniffer = {
    init: init,
    scanNow: scanNow,
    list: function () { return items.slice(); },
    clear: clear,
    download: download,
    onChange: onChange,
    fmtSize: fmtSize,
  };
})();
