/* ============================================================
 * downloader — 多线程分块下载引擎
 * - 传输：GM_xmlhttpRequest（绕 CORS + Referer），Range 分块
 * - 并发：每任务 config.threads 个 worker，视频轨优先
 * - 写盘：merge 模式 → 内存缓冲 → mp4box 合并 → 单文件；
 *          twofile 模式 → FSA 目录流式并发写盘（真并发）；非 FSA → Blob
 * - 断点续传：分块 bitmap 持久化（GM_setValue）；页面重载后恢复任务
 *   需用户重新选择保存位置（FSA 手柄不可跨页存活）
 * - 失败自动重试（每块 config.retries 次，指数退避）
 * - 事件：'update'（任务进度/状态变化）→ FAB/下载页/导航徽章
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var KEY = 'downloads'; // store 内部自动加 'vshell.' 前缀
  var REFERER = 'https://www.bilibili.com/';
  var CHUNK = 2 * 1024 * 1024; // 2MB/块

  function fmtBytes(n) {
    n = n || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }
  V.utils.fmtBytes = V.utils.fmtBytes || fmtBytes;

  var config = {
    threads: 4,                      // 每任务并发数（1/2/4/8）
    chunkSize: CHUNK,
    mergeLimit: 1 * 1024 * 1024 * 1024, // 总量 >1GB → 双文件流式（内存保护）
    retries: 3,
  };

  var em = new V.utils.Emitter();
  var byId = {};
  var tasks = [];      // 持久化任务数组（含运行时字段，save 时剥离 _ 前缀）
  var writers = {};    // id → { final | video | audio: writer }
  var buffers = {};    // id → { video: Uint8Array, audio: Uint8Array }
  var queues = {};     // id → [{track, idx}]
  var timers = {};     // id → tick timer
  var writeChains = {}; // id → { video: Promise, audio: Promise }
  var saveTimer = null;

  /* ---------- 持久化 ---------- */
  function clean(t) {
    var c = {};
    for (var k in t) if (k[0] !== '_') c[k] = t[k];
    return c;
  }
  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      // medl 任务（嗅探直链下载）不持久化：跨会话无恢复意义（URL 可能
      // 过期/需登录态），且其生命周期由 AbortController 管理
      V.store.set(KEY, tasks.filter(function (t) { return t.mode !== 'medl'; }).map(clean));
    }, 1200);
  }
  function load() {
    var arr = V.store.get(KEY);
    if (!Array.isArray(arr)) return;
    arr.forEach(function (t) { byId[t.id] = t; tasks.push(t); });
  }

  /* ---------- 辅助 ---------- */
  function setBit(bitmap, i) {
    return bitmap.slice(0, i) + '1' + bitmap.slice(i + 1);
  }
  function trackTotal(task) {
    return task.tracks.reduce(function (s, t) { return s + (t.size || 0); }, 0);
  }
  function trackDone(task) {
    return task.tracks.reduce(function (s, t) { return s + (t.doneBytes || 0); }, 0);
  }
  function updateProgress(task) {
    if (!task.tracks || !task.tracks.length) return;   // medl 任务用自身 progress
    var total = trackTotal(task);
    task.progress = total ? Math.min(1, trackDone(task) / total) : 0;
  }
  function emit(task) {
    em.emit('update', { task: task, tasks: tasks });
  }

  /* ---------- 大小探测：Range 0-0 优先（真站 CDN 实测 HEAD 常 404，Range 稳定 206），
     HEAD 兜底，再不行拉首块 1MB 从 Content-Range 学总大小（用户反馈：无法获取文件大小） ---------- */
  function probeSize(url) {
    return probeRange(url)
      .catch(function () { return probeHead(url); })
      .catch(function () { return probeFirstChunk(url); });
  }
  function probeFirstChunk(url) {
    // 拉 1MB 首块：即使 206 不带 Content-Range 也能学到总大小；块数据丢弃
    return V.utils.gmFetch({
      url: url, method: 'GET',
      headers: { 'Range': 'bytes=0-1048575', 'Referer': REFERER },
      responseType: 'arraybuffer', timeout: 45000,
    }).then(function (res) {
      var cr = (res.responseHeaders || {})['content-range'] || '';
      var m = cr.match(/\/(\d+)\s*$/);
      if (m) return parseInt(m[1], 10);
      var cl = parseInt((res.responseHeaders || {})['content-length'] || '', 10);
      if (isFinite(cl) && cl > 0) return cl;
      throw new Error('无法获取文件大小');
    });
  }
  function probeRange(url) {
    return V.utils.gmFetch({
      url: url, method: 'GET',
      headers: { 'Range': 'bytes=0-0', 'Referer': REFERER },
      responseType: 'arraybuffer', timeout: 20000,
    }).then(function (res) {
      var cr = (res.responseHeaders || {})['content-range'] || '';
      var m = cr.match(/\/(\d+)\s*$/);
      if (m) return parseInt(m[1], 10);
      // 206 但无 Content-Range 不可靠（不能回退 byteLength——那只是 1 字节探测体）
      throw new Error('无 Content-Range（可能需登录或触发风控）');
    });
  }
  function probeHead(url) {
    var headers = { 'Referer': REFERER };
    return V.utils.gmFetch({ url: url, method: 'HEAD', headers: headers, timeout: 20000 })
      .then(function (res) {
        var cl = parseInt((res.responseHeaders || {})['content-length'] || '', 10);
        if (isFinite(cl) && cl > 0) return cl;
        throw new Error('HEAD 无 Content-Length');
      });
  }

  /* ---------- 嗅探直链下载（medl 任务） ----------
   * 点击视频下载按钮后：先嗅探当前视频的媒体地址 → 交给 medl 引擎
   * （m3u8 转 MP4 / 直链并发分块）→ 进度走同一个任务列表/下载面板。
   * 任务不持久化、不支持断点/暂停（medl 无分段续传），可取消。 */
  var medlCtrl = {};   // task.id -> AbortController
  function addMedl(url, opts) {
    if (!url) { V.toast.error('缺少下载地址'); return null; }
    var task = {
      id: 'dlm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      mode: 'medl',
      kind: (opts && opts.kind) || 'media',
      title: (opts && opts.title) || 'video',
      pic: (opts && opts.pic) || '',
      url: url,
      status: 'downloading', error: null,
      progress: 0, speed: 0, createdAt: Date.now(),
      tracks: [], files: [],
    };
    byId[task.id] = task;
    tasks.push(task);
    var ctrl = null;
    try { ctrl = new AbortController(); medlCtrl[task.id] = ctrl; } catch (e) { /* noop */ }
    var lastBytes = 0, lastTs = Date.now();
    var settled = false;
    em.emit('update', { task: task, tasks: tasks });
    V.toast.info('开始下载（嗅探直链）：' + (task.title || ''));
    V.medl.download(url, {
      name: task.title || 'video',
      signal: ctrl ? ctrl.signal : undefined,
      onProgress: function (pct, bytes) {
        if (settled) return;
        task.progress = Math.min(1, (pct || 0) / 100);
        if (typeof bytes === 'number') {
          var now = Date.now();
          var dt = (now - lastTs) / 1000;
          if (dt >= 0.9) {
            task.speed = (bytes - lastBytes) / dt;
            lastBytes = bytes;
            lastTs = now;
          }
        }
        em.emit('update', { task: task, tasks: tasks });
      },
    }).then(function (res) {
      if (task.status === 'canceled') {   // cancel 先行（保存对话框异步返回 null 时防覆盖）
        delete medlCtrl[task.id];
        return;
      }
      settled = true;
      delete medlCtrl[task.id];
      task.status = 'done';
      task.progress = 1;
      task.speed = 0;
      task.files = [{ name: (task.title || 'video') + (task.kind === 'm3u8' ? '.mp4' : '') }];
      em.emit('update', { task: task, tasks: tasks });
      V.toast.ok('下载完成：' + (task.title || ''));
    }).catch(function (err) {
      if (settled) return;
      settled = true;
      delete medlCtrl[task.id];
      if (task.status === 'canceled') {
        em.emit('update', { task: task, tasks: tasks });
        return;
      }
      task.status = 'failed';
      task.progress = task.progress || 0;
      task.speed = 0;
      task.error = (err && err.message) || String(err);
      em.emit('update', { task: task, tasks: tasks });
      V.toast.error('下载失败：' + (task.title || '') + '（' + task.error + '）');
    });
    return task;
  }

  /* ---------- 任务生命周期 ---------- */
  function makeTracks(pi) {
    // durl 模式：分段 mp4/flv（未登录低清等）——单视频轨、段序列映射下载
    if (pi && pi.type === 'durl' && pi.durl && pi.durl.length) {
      var segs = pi.durl.map(function (s) { return { url: s.url, size: s.size || 0 }; });
      return [{
        kind: 'video',
        url: segs[0].url,
        segments: segs,                        // 多段：分块偏移经段映射（fetchRange）
        size: segs.reduce(function (s, x) { return s + (x.size || 0); }, 0),
        codecs: '', width: 0, height: 0,
      }];
    }
    var tracks = [];
    var v = pi && pi.dash && pi.dash.video;
    if (v && v.url) {
      tracks.push({ kind: 'video', url: v.url, size: 0, codecs: v.codecs || '', width: v.width, height: v.height });
    }
    var a = pi && pi.dash && pi.dash.audio;
    if (a && a.url) {
      tracks.push({ kind: 'audio', url: a.url, size: 0, codecs: a.codecs || '' });
    }
    return tracks;
  }
  function initTrackChunks(t) {
    t.chunkSize = config.chunkSize;
    t.nChunks = t.size ? Math.ceil(t.size / t.chunkSize) : 0;
    t.bitmap = new Array(t.nChunks + 1).join('0');
    t.doneBytes = 0;
    t.doneChunks = 0;
  }
  function rebuildQueue(task) {
    var q = [];
    task.tracks.forEach(function (t) {
      for (var i = 0; i < t.nChunks; i++) {
        if (t.bitmap[i] === '0') q.push({ track: t, idx: i });
      }
    });
    queues[task.id] = q;
  }

  /**
   * add(opts) — 必须在用户手势中调用（内部弹保存选择器）
   * opts: { bvid, cid, title, pic, playInfo }
   * 返回 Promise<task|null>（null = 用户取消选择）
   */
  function add(opts) {
    var pi = opts.playInfo;
    var tracks = makeTracks(pi);
    if (!tracks.length) { V.toast.error('无可用下载源'); return Promise.resolve(null); }

    var task = {
      id: 'dl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      bvid: opts.bvid, cid: opts.cid,
      title: opts.title, pic: opts.pic,
      qualityLabel: '',
      mode: 'merge', status: 'queued', error: null,
      progress: 0, speed: 0, createdAt: Date.now(),
      tracks: tracks, files: [],
    };
    var safe = V.utils.sanitizeFilename(opts.title) || 'video';
    task.qualityLabel = V.player.QN_LABEL[(pi.dash && pi.dash.video && pi.dash.video.id)] || '自动';

    // 探测大小（合并前先拿尺寸）：已有大小（如 durl 的 playurl 返回 size）
    // 跳过探测；探测失败保留原值（曾把 durl 已有 size 覆盖为 0 → “无法获取文件大小”）
    var probes = tracks.map(function (t) {
      if (t.size) return Promise.resolve();
      if (t.segments && t.segments.length) {
        // durl：playurl 未给 size → 逐段探测后合计
        var segProbes = t.segments.map(function (s) {
          if (s.size) return Promise.resolve();
          return probeSize(s.url).then(function (sz) { s.size = sz; })
            .catch(function () { s.size = 0; });
        });
        return Promise.all(segProbes).then(function () {
          t.size = t.segments.reduce(function (sum, s) { return sum + (s.size || 0); }, 0);
          t.url = t.segments[0].url;
        });
      }
      return probeSize(t.url).then(function (s) { t.size = s; })
        .catch(function () { t.size = 0; });
    });
    return Promise.all(probes).then(function () {
      var total = tracks.reduce(function (s, t) { return s + (t.size || 0); }, 0);
      var isDurl = tracks.some(function (t) { return t.segments && t.segments.length; });
      // durl：分段原格式（无独立音轨，无需合并）；dash：MP4Box 合并 / 超限双文件
      var canMerge = !opts.forceTwofile && !isDurl && typeof MP4Box !== 'undefined' && total <= config.mergeLimit;
      task.mode = canMerge ? 'merge' : 'twofile';
      if (opts.forceTwofile) {
        // 显式双文件（旧入口保留）
      } else if (!canMerge && !isDurl) {
        // 合并不了 → 提示原因 + 默认分开下载（用户需求：不弹选项、自动降级）
        V.toast.info(total > config.mergeLimit
          ? '文件较大（超过 1GB），已自动改为分开下载（视频 + 音频）'
          : '合并不可用（MP4Box 缺失），已自动改为分开下载（视频 + 音频）');
      }
      tracks.forEach(initTrackChunks);
      if (tracks.some(function (t) { return t.nChunks === 0; })) {
        V.toast.error('无法获取文件大小（可能需登录或触发风控）');
        return null;
      }

      var pick = canMerge
        ? V.fswriter.pickSaveFile(safe + '.mp4').then(function (w) {
            if (!w) return null;
            writers[task.id] = { final: w };
            task.files = [{ name: w.name, bytes: total }];
            return task;
          })
        : V.fswriter.pickSaveDir().then(function (dir) {
            // 双文件：FSA 目录流式 / 降级 Blob 内存
            var wset = {};
            task.tracks.forEach(function (t) {
              // durl 原格式单文件（safe.mp4）；dash 双文件（_video/_audio）
              var name = (t.segments && t.segments.length)
                ? safe + '.mp4'
                : safe + '_' + t.kind + (t.kind === 'audio' ? '.m4a' : '.m4s');
              wset[t.kind] = dir ? V.fswriter.createDirWriter(dir, name)
                                 : V.fswriter.createBlobWriter(name);
              task.files.push({ name: name, bytes: t.size });
            });
            writers[task.id] = wset;
            return task;
          });
      return pick.then(function (taskOrNull) {
        if (!taskOrNull) return null;
        // merge 模式：预分配缓冲
        if (taskOrNull.mode === 'merge') {
          var b = {};
          tracks.forEach(function (t) {
            if (t.size) b[t.kind] = new Uint8Array(t.size);
          });
          buffers[taskOrNull.id] = b;
        }
        byId[taskOrNull.id] = taskOrNull;
        tasks.push(taskOrNull);
        taskOrNull.status = 'downloading';
        startWorkers(taskOrNull);
        scheduleSave();
        em.emit('update', { task: taskOrNull, tasks: tasks });
        V.toast.info('开始下载：' + (taskOrNull.title || ''));
        return taskOrNull;
      });
    });
  }

  /* ---------- worker ---------- */
  function nextJob(task) {
    var q = queues[task.id];
    while (q && q.length) {
      var job = q.shift();
      if (job.track.bitmap[job.idx] === '0') return job;
    }
    return null;
  }
  function startWorkers(task) {
    rebuildQueue(task);
    var n = Math.min(config.threads, queues[task.id].length);
    for (var i = 0; i < n; i++) workerLoop(task);
  }
  function workerLoop(task) {
    if (task.status !== 'downloading') return;
    var job = nextJob(task);
    if (!job) return; // 队列空：完成判定在 onChunkData
    fetchChunk(task, job).then(function () {
      if (task.status === 'downloading') workerLoop(task);
    });
  }
  function fetchChunk(task, job) {
    var t = job.track;
    var start = job.idx * t.chunkSize;
    var end = Math.min(start + t.chunkSize - 1, t.size - 1);
    var attempt = 0;
    return new Promise(function (resolve) {
      function tryOnce() {
        if (task.status !== 'downloading') return resolve();
        fetchRange(task, t, start, end).then(function (buf) {
          if (task.status !== 'downloading') return resolve();
          if (!buf || !buf.byteLength) throw new Error('空响应');
          onChunkData(task, t, job.idx, buf);
          resolve();
        }).catch(function (err) {
          attempt++;
          if (attempt <= config.retries && task.status === 'downloading') {
            setTimeout(tryOnce, 500 * attempt);
          } else {
            failTask(task, '分块下载失败：' + ((err && err.message) || err));
            resolve();
          }
        });
      }
      tryOnce();
    });
  }

  /* 段映射 Range 拉取：durl 多段时把全局字节偏移映射到段内请求；
   * 跨段 chunk 递归拆两次请求后拼接。单段/无 segments 时等价普通请求 */
  function fetchRange(task, t, start, end) {
    var url = t.url, off = 0, segSize = t.size;
    if (t.segments && t.segments.length > 1) {
      var acc = 0;
      for (var i = 0; i < t.segments.length; i++) {
        var sz = t.segments[i].size || 0;
        if (start < acc + sz) {
          url = t.segments[i].url;
          off = acc;
          segSize = sz;
          break;
        }
        acc += sz;
      }
    }
    var e = Math.min(end, off + segSize - 1);
    return V.utils.gmFetch({
      url: url,
      headers: { 'Range': 'bytes=' + (start - off) + '-' + (e - off), 'Referer': REFERER },
      responseType: 'arraybuffer', timeout: 45000,
    }).then(function (res) {
      var buf = res.response;
      if (res.status === 200) buf = buf.slice(start - off, e - off + 1); // 服务器忽略 Range
      if (e >= end) return buf;
      // 跨段：递归拉剩余部分并拼接
      return fetchRange(task, t, e + 1, end).then(function (buf2) {
        var out = new Uint8Array(buf.byteLength + buf2.byteLength);
        out.set(new Uint8Array(buf), 0);
        out.set(new Uint8Array(buf2), buf.byteLength);
        return out.buffer;
      });
    });
  }

  function writeTo(task, kind, buf, off) {
    var w = writers[task.id];
    if (!w) return Promise.resolve();
    var ww = w.final || w[kind];
    if (!ww) return Promise.resolve();
    var chain = writeChains[task.id] = writeChains[task.id] || {};
    chain[kind] = (chain[kind] || Promise.resolve()).then(function () {
      return ww.write(buf, off);
    }).catch(function (err) {
      failTask(task, '写入文件失败：' + ((err && err.message) || err));
    });
    return chain[kind];
  }
  function onChunkData(task, track, idx, buf) {
    var off = idx * track.chunkSize;
    // 落盘（fsa/blob 串行链，保证顺序与失败捕获）
    writeTo(task, track.kind, buf, off);
    // merge 模式内存缓冲
    if (buffers[task.id] && buffers[task.id][track.kind]) {
      buffers[task.id][track.kind].set(new Uint8Array(buf), off);
    }
    track.bitmap = setBit(track.bitmap, idx);
    track.doneBytes += buf.byteLength;
    track.doneChunks++;
    updateProgress(task);
    scheduleSave();
    emit(task);
    checkComplete(task);
  }
  function checkComplete(task) {
    if (task.status !== 'downloading') return;
    var allDone = task.tracks.every(function (t) { return t.doneChunks >= t.nChunks; });
    if (allDone) finishTask(task);
  }

  /* ---------- 收尾：合并 / 关流 ---------- */
  function finishTask(task) {
    task.status = 'merging';
    emit(task);
    var wset = writers[task.id];
    var chains = writeChains[task.id] || {};
    var pending = Object.keys(chains).map(function (k) { return chains[k]; });
    Promise.all(pending).then(function () {
      if (task.status !== 'merging') return; // 已被取消
      if (task.mode === 'merge') {
        mergeAndSave(task);
      } else {
        // 双文件：关流（FSA close / Blob 触发下载）
        var closes = task.tracks.map(function (t) {
          var w = wset[t.kind];
          return w ? w.close() : Promise.resolve();
        });
        return Promise.all(closes).then(function () {
          task.status = 'done';
          task.progress = 1;
          cleanupRuntime(task);
          scheduleSave();
          emit(task);
          V.toast.ok('下载完成：' + (task.title || ''));
        });
      }
    });
  }
  function mergeAndSave(task) {
    var b = buffers[task.id] || {};
    var videoBuf = b.video && b.video.buffer;
    var audioBuf = b.audio && b.audio.buffer;
    var w = writers[task.id] && writers[task.id].final;
    if (!w) { failTask(task, '保存目标丢失'); return; }
    V.merger.mergeTracks({ video: videoBuf, audio: audioBuf, onProgress: function () { emit(task); } })
      .then(function (merged) {
        return w.write(merged, 0).then(function () { return w.close(); });
      })
      .then(function () {
        task.status = 'done';
        task.progress = 1;
        cleanupRuntime(task);
        scheduleSave();
        emit(task);
        V.toast.ok('下载完成（已合并 MP4）：' + (task.title || ''));
      })
      .catch(function (err) {
        // 合并失败 → 提示 + 默认分开保存（用户需求：合并不了提示一下，然后分开下）
        V.toast.error('MP4 合并失败，已改为分开保存（视频 + 音频）');
        var videoOnly = b.video && b.video.buffer;
        if (videoOnly) {
          w.write(videoOnly, 0).then(function () { return w.close(); }).then(function () {
            task.status = 'done';
            task.progress = 1;
            cleanupRuntime(task);
            scheduleSave();
            emit(task);
            if (b.audio) {
              V.utils.downloadBlob(new Blob([b.audio.buffer], { type: 'audio/mp4' }), (V.utils.sanitizeFilename(task.title) || 'video') + '_audio.m4a');
            }
          }).catch(function (e2) {
            failTask(task, '降级保存失败：' + ((e2 && e2.message) || e2));
          });
        } else {
          failTask(task, '合并失败：' + ((err && err.message) || err));
        }
      });
  }

  function cleanupRuntime(task) {
    clearInterval(timers[task.id]);
    delete timers[task.id];
    delete queues[task.id];
    delete writeChains[task.id];
    // 缓冲释放（大内存）
    setTimeout(function () {
      delete buffers[task.id];
      delete writers[task.id];
    }, 5000);
  }

  /* ---------- 控制 ---------- */
  function failTask(task, msg) {
    if (task.status === 'done' || task.status === 'canceled' || task.status === 'failed') return;
    task.status = 'failed';
    task.error = msg;
    clearInterval(timers[task.id]);
    delete timers[task.id];
    scheduleSave();
    emit(task);
    V.toast.error(msg);
  }
  function pause(id) {
    var t = byId[id];
    if (!t || t.mode === 'medl') return;   // medl 任务不支持暂停
    if (t.status !== 'downloading' && t.status !== 'merging') return;
    t.status = 'paused';
    clearInterval(timers[id]);
    delete timers[id];
    scheduleSave();
    emit(t);
  }
  function resume(id) {
    var t = byId[id];
    if (!t || t.mode === 'medl' || t.status !== 'paused') return;
    var wset = writers[id];
    if (!wset) {
      // 页面重载后：需要重新选择保存位置（手势）
      repickAndResume(t);
      return;
    }
    t.status = 'downloading';
    startWorkers(t);
    startTick(t);
    scheduleSave();
    emit(t);
  }
  function repickAndResume(task) {
    var safe = V.utils.sanitizeFilename(task.title) || 'video';
    if (task.mode === 'merge') {
      V.fswriter.pickSaveFile(safe + '.mp4').then(function (w) {
        if (!w) return;
        writers[task.id] = { final: w };
        // 缓冲已丢 → 全量重下
        var b = {};
        task.tracks.forEach(function (t) { if (t.size) b[t.kind] = new Uint8Array(t.size); });
        buffers[task.id] = b;
        task.tracks.forEach(function (t) {
          t.bitmap = new Array(t.nChunks + 1).join('0');
          t.doneBytes = 0; t.doneChunks = 0;
        });
        task.error = null;
        task.status = 'downloading';
        startWorkers(task);
        startTick(task);
        scheduleSave();
        emit(task);
      });
    } else {
      V.fswriter.pickSaveDir().then(function (dir) {
        if (!dir) return;
        var wset = {};
        var proms = task.tracks.map(function (t) {
          var name = safe + '_' + t.kind + (t.kind === 'audio' ? '.m4a' : '.m4s');
          var w = V.fswriter.createDirWriter(dir, name);
          wset[t.kind] = w;
          return w.existingSize().then(function (ex) {
            if (ex > 0) {
              // 跳过已完整落盘的块
              t.tracks.forEach(function () {});
              for (var i = 0; i < t.nChunks; i++) {
                var off = i * t.chunkSize;
                var len = Math.min(t.chunkSize, t.size - off);
                if (off + len <= ex) {
                  t.bitmap = setBit(t.bitmap, i);
                  t.doneBytes += len;
                  t.doneChunks++;
                } else break;
              }
            }
          });
        });
        return Promise.all(proms).then(function () {
          writers[task.id] = wset;
          task.error = null;
          task.status = 'downloading';
          startWorkers(task);
          startTick(task);
          scheduleSave();
          emit(task);
        });
      });
    }
  }
  function cancel(id) {
    var t = byId[id];
    if (!t) return;
    t.status = 'canceled';
    clearInterval(timers[id]);
    delete timers[id];
    delete queues[id];
    if (t.mode === 'medl') {
      var c = medlCtrl[id];
      if (c && c.abort) { try { c.abort(); } catch (e) { /* noop */ } }
      delete medlCtrl[id];
      scheduleSave();
      emit(t);
      V.toast.info('已取消：' + (t.title || ''));
      return;
    }
    var wset = writers[id];
    if (wset) {
      Object.keys(wset).forEach(function (k) {
        var w = wset[k];
        if (w && w.abort) w.abort().catch(function () {});
      });
    }
    delete writers[id];
    delete buffers[id];
    scheduleSave();
    emit(t);
    V.toast.info('已取消：' + (t.title || ''));
  }
  function retry(id) {
    var t = byId[id];
    if (!t || (t.status !== 'failed' && t.status !== 'canceled')) return;
    t.error = null;
    if (t.mode === 'medl') {
      // medl 任务：移除旧任务 → 用原 URL 重新发起（新 AbortController）
      tasks = tasks.filter(function (x) { return x.id !== id; });
      delete byId[id];
      em.emit('update', { task: null, tasks: tasks });
      addMedl(t.url, { title: t.title, pic: t.pic, kind: t.kind });
      return;
    }
    var wset = writers[id];
    if (!wset) {
      // 重载后 writers 丢失 → 重新选择保存位置
      t.status = 'paused';
      repickAndResume(t);
      return;
    }
    // 仅重排队列（bitmap 保留已完成块；merge 模式缓冲仍在）
    t.status = 'downloading';
    startWorkers(t);
    startTick(t);
    scheduleSave();
    emit(t);
  }
  function remove(id) {
    var t = byId[id];
    if (!t) return;
    if (t.status === 'downloading' || t.status === 'merging') cancel(id);
    tasks = tasks.filter(function (x) { return x.id !== id; });
    delete byId[id];
    scheduleSave();
    em.emit('update', { task: null, tasks: tasks });
  }
  function clearDone() {
    tasks = tasks.filter(function (t) {
      return t.status === 'downloading' || t.status === 'merging' || t.status === 'paused';
    });
    byId = {};
    tasks.forEach(function (t) { byId[t.id] = t; });
    scheduleSave();
    em.emit('update', { task: null, tasks: tasks });
  }

  /* ---------- 速度 tick ---------- */
  function startTick(task) {
    if (timers[task.id]) return;
    var last = trackDone(task);
    var lastTs = Date.now();
    timers[task.id] = setInterval(function () {
      var now = trackDone(task);
      var dt = (Date.now() - lastTs) / 1000;
      if (dt > 0) {
        task.speed = (now - last) / dt;
        last = now;
        lastTs = Date.now();
        if (task.status === 'downloading') emit(task);
      }
    }, 1000);
  }

  /* ---------- 启动恢复 ---------- */
  function init() {
    load();
    tasks.forEach(function (t) {
      // 页面重载后：无 writer → 标记中断待恢复
      if (t.status === 'downloading' || t.status === 'merging') {
        t.status = 'paused';
        t.error = '已中断：请继续下载并重新选择保存位置';
      }
      updateProgress(t);
    });
    scheduleSave();
    em.emit('update', { task: null, tasks: tasks });
  }

  V.downloader = {
    config: config,
    init: init,
    list: function () { return tasks.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }); },
    get: function (id) { return byId[id]; },
    add: add,
    addMedl: addMedl,
    pause: pause,
    resume: resume,
    cancel: cancel,
    retry: retry,
    remove: remove,
    clearDone: clearDone,
    on: function (fn) { em.on('update', fn); },
    fmtBytes: fmtBytes,
  };
})();
