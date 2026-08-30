/* ============================================================
 * localvideos — 本地视频数据源（v0.5.6 第十二轮，用户需求 2）
 *
 * 用户需求：「批量导入视频，将文件名作为视频名，然后也要参与搜索/
 * 角色主页的聚合搜索，也可以添加待看…总之与来源于网站的视频没有任何
 * 区别，是一个与网站数据源几乎平级的数据源，唯一的区别是，本地数据源
 * 显示在网站数据源前，然后还有一个小区别，就是视频卡片的右上角…给
 * 所有的本地视频也添加一个小圆点」
 *
 * 实现：
 *  - IndexedDB（vshell-local / files）持久化 File 本体 + 元数据
 *    （File 可结构化克隆；重启后由 init() 重建 objectURL）
 *  - 内存 items = 卡片元数据（id 'local:'+basename+ts、title=文件名
 *    去扩展名、cover=导入截帧 dataURL 320x180 JPEG、url=objectURL、
 *    pubdate、duration、local:true、stat.view、size、addedAt）
 *  - 注入点（页面层合并）：home 第一页前置、search 命中合并、
 *    role.js searchAll（kwHit 精确过滤）、searchtags bootstrap、
 *    detail 页 'local:' id 特判、feed loadPlayInfo 直链分支
 *  - 卡片：.is-local 圆点（video-card.js savedMarks，绿色）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var DB_NAME = 'vshell-local';
  var STORE = 'files';
  var items = [];        // 内存元数据（含会话级 objectURL）
  var db = null;
  var loaded = false;
  var readyChain = null;

  function openDb() {
    if (!window.indexedDB) return Promise.resolve(null);
    return new Promise(function (resolve) {
      try {
        var req = window.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          var d = req.result;
          if (!d.objectStoreNames.contains(STORE)) {
            d.createObjectStore(STORE, { keyPath: 'id' });
          }
        };
        req.onsuccess = function () { db = req.result; resolve(db); };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  function fromRow(r) {
    if (!r) return null;
    var it = {
      id: r.id, title: r.title || '未命名视频',
      cover: r.cover || '', url: '',          // url 会话级 objectURL
      pubdate: r.pubdate || 0, duration: r.duration || 0,
      local: true, stat: { view: r.view || 0 },
      size: r.size || 0, addedAt: r.addedAt || 0,
      _file: r.file || null,                  // 恢复 File 本体（懒截帧用）
    };
    // 恢复播放源：优先 IDB 里的 File 本体 → objectURL（会话级）
    if (r.file && window.URL && URL.createObjectURL) {
      try { it.url = URL.createObjectURL(r.file); } catch (e) { it.url = ''; }
    }
    return it;
  }

  /** 异步恢复（所有读取/写入前先 await；幂等） */
  function loadAll() {
    if (loaded) return Promise.resolve(items);
    if (readyChain) return readyChain;
    readyChain = openDb().then(function (d) {
      loaded = true;
      if (!d) return items;
      return new Promise(function (resolve) {
        try {
          var tx = d.transaction(STORE, 'readonly');
          var req = tx.objectStore(STORE).getAll();
          req.onsuccess = function () {
            items = (req.result || []).map(fromRow).filter(Boolean);
            resolve(items);
          };
          req.onerror = function () { resolve(items); };
        } catch (e) { resolve(items); }
      });
    }).catch(function () { loaded = true; return items; });
    return readyChain;
  }

  /** 导入截帧：video 加载 → seek 中部 → canvas 320x180 JPEG dataURL
   *  v0.5.6 第十三轮加固：seeked 延迟 50ms 再截帧（部分解码器 seeked
   *  回调时首帧尚未渲染 → 黑帧/抛异常被吞 → 封面空）；另加 timeupdate
   *  兜底（个别格式不派发 seeked）
   *  v0.5.6 第十五轮（用户需求 2：本地视频不显示封面）根因：preload=
   *  'metadata' 只加载元数据——**不派发 loadeddata**（帧数据未取），
   *  4s 超时兜底静默放弃 → cover 恒空。改 preload='auto'（拉取帧数据）
   *  + onloadedmetadata 触发 seek（metadata 一定触发，loadeddata 不稳） */
  function makeThumb(file, it) {
    return new Promise(function (resolve) {
      var el = document.createElement('video');
      el.muted = true;
      el.preload = 'auto';
      // v0.5.6 第二十四轮（根因修复）：**视口外媒体节流**——Chromium 对
      // 完全在视口外/不可见的 video 挂起解码渲染（off-screen 媒体省电
      // 策略）：此前 left:-9999px + 2x2px + opacity 0.01 完全离屏 →
      // 解码器不渲染新帧 → drawImage 恒黑帧/旧帧（换时间点也黑）→ 重试
      // 耗尽 → 强制黑帧 → "封面是黑的"。feed 能正常播放正因为它在视口
      // 内可见。修复：截帧 video 移到**视口内右下角**（真实 320x180 尺寸、
      // opacity 0.05 极淡但非 0 → 参与合成 → 不被节流），完成后立即移除
      try {
        el.style.cssText = 'position:fixed;right:6px;bottom:6px;width:320px;height:180px;opacity:0.05;pointer-events:none;z-index:2147483646;background:#000;border-radius:4px;';
        document.body.appendChild(el);
      } catch (e) { /* noop */ }
      // v0.5.6 第十九轮需求 1（用户建议）：截帧时间点按**时长比例**取
      // （第 x 帧，避开第一帧——很多视频片头是黑场/淡入黑帧，此前固定
      // 0.1s + 递增 0.5s 时间点，片头长的视频全部命中黑帧 → 重试耗尽
      // 放弃 → cover 空 → 卡片黑屏）。依次尝试 10%/20%/30%/50%/75%。
      var FALLBACK_RATIOS = [0.2, 0.3, 0.5, 0.75];
      var grabbed = false;
      var finished = false;   // 超时/错误后禁止在途 grab 再写 cover
      var tries = 0;          // 黑帧重试计数（换时间点）
      var sameTries = 0;      // v0.5.6 第二十三轮需求：**同一位置黑帧重试**
      // 计数——Chromium 的 seeked 在 seek 完成时派发，但**帧的实际渲染可能
      // 在 seeked 之后延迟数百 ms**；此前黑帧立即换时间点 → 每次 grab 都
      // 命中"解码器还没渲染出帧"的黑帧 → 8 次换点耗尽 → 强制黑帧 →
      // 封面全黑。同一位置先等 3 轮（每轮 250ms）再换时间点。
      var readyWaits = 0;     // 帧就绪等待计数（v0.5.6 第二十轮需求 3：与黑帧
      // 重试**分开计数**——此前共用 tries，6 次帧就绪等待就把黑帧重试次数
      // 耗尽（tries=6，黑帧分支 tries<8 只剩 2 次），长视频 seek 慢时黑帧
      // 没有机会换时间点 → 封面黑。v0.5.6 第二十一轮：上限 10→40（解码慢
      // 的大文件最多等 6s 帧就绪——强制用黑帧前多给真实解码时间）
      var timer = null;
      var done = function () {
        if (finished) return;
        finished = true;
        if (timer) { clearTimeout(timer); timer = null; }
        try { el.removeAttribute('src'); el.load(); } catch (e) { /* noop */ }
        try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) { /* noop */ }
        resolve();
      };
      var grab = function () {
        if (grabbed || finished) return;
        // v0.5.6 第十七轮需求 3：**等待可绘制帧**（readyState>=2 且
        // videoWidth>0）再截——部分解码器 seeked 回调时帧尚未就绪 →
        // drawImage 黑帧；此时延迟重试（不消耗黑帧重试次数）
        if (el.readyState < 2 || !el.videoWidth) {
          if (readyWaits < 40) { readyWaits++; setTimeout(grab, 150); return; }
          it._thumbDiag.state = 'noframe';   // 帧就绪等待耗尽
          it._thumbDiag.readyState = el.readyState;
        }
        try {
          var cv = document.createElement('canvas');
          cv.width = 320; cv.height = 180;
          var ctx = cv.getContext('2d');
          if (ctx && el.videoWidth) {
            ctx.drawImage(el, 0, 0, 320, 180);
            // v0.5.6 第十六轮需求 3：**黑帧检测**——部分视频 seek 后的首帧
            // 是黑帧（解码器未渲染），中心像素过暗则换时间点重试
            var dark = true;
            try {
              var px = ctx.getImageData(160, 90, 1, 1).data;
              dark = px[0] < 12 && px[1] < 12 && px[2] < 12;
            } catch (e) { dark = false; }
            if (dark) {
              // v0.5.6 第二十三轮：同一位置先等 3 轮（每轮 250ms——解码器
              // 渲染延迟）仍黑才换时间点；换点也最多 8 次
              if (sameTries < 3) {
                sameTries++;
                it._thumbDiag.state = 'wait' + sameTries;
                setTimeout(grab, 250);
                return;
              }
              if (tries < 8) {
                tries++;
                sameTries = 0;
                it._thumbDiag.state = 'black' + tries;
                var ratio = FALLBACK_RATIOS[Math.min(tries - 1, FALLBACK_RATIOS.length - 1)];
                try {
                  var dur2 = el.duration;
                  if (!isFinite(dur2) || dur2 <= 0) dur2 = 10;
                  el.currentTime = Math.max(0.5, dur2 * ratio);
                } catch (e) { /* noop */ }
                setTimeout(grab, 200);
                return;
              }
            }
            // v0.5.6 第十九轮需求 1：**重试耗尽也强制用当前帧**——有画面
            // （即使偏暗）总比 cover 空（黑屏）强；封面黑的另一个常见
            // 原因就是 cover 为空，而非黑帧本身
            grabbed = true;
            it.cover = cv.toDataURL('image/jpeg', 0.72);
            it.duration = Math.round(el.duration || 0);
            it._thumbDiag.state = 'grabbed';
            it._thumbDiag.dark = dark;
          }
        } catch (e) {
          it._thumbDiag.state = 'drawerr';
          it._thumbDiag.err = e.message;
        }
        done();
      };
      // v0.5.6 第二十轮需求 3：6s→15s 超时——seek 到时长比例处的解码可能
      // 很慢（大文件/慢解码器），6s 常常先到 → cover 空 → 卡片黑屏
      // v0.5.6 第二十四轮：元素法超时 15s → 8s（真实可见页面通常 1-3s
      // 出帧；超时后由 WebCodecs 兜底截帧，总时长仍可接受）
      timer = setTimeout(done, 8000);
      // v0.5.6 第二十二轮需求 2：**截帧诊断**——it._thumbDiag 记录失败原因
      // （用户反馈黑封面时可通过 window.__VS_THUMB_DIAG__ 定位：error 码/
      // 超时/黑帧耗尽/无帧就绪），toast 与面板可读
      it._thumbDiag = { state: 'start', ts: Date.now() };
      el.onloadedmetadata = function () {
        it._thumbDiag.state = 'metadata';
        it._thumbDiag.duration = el.duration;
        it._thumbDiag.vw = el.videoWidth;
        try {
          // v0.5.6 第二十一轮需求 1：**先 play 再 seek**——play() 让解码器
          // 立即开始出帧（muted 自动播放合法），seek 完成后 timeupdate 会
          // 持续触发 → 兜底 grab 有真实帧可画；纯靠 seeked 事件时解码慢的
          // 文件可能 seeked 已派发但帧未渲染（readyWaits 等待上限不够）
          try { var pp = el.play(); if (pp && pp.catch) pp.catch(function () { /* noop */ }); } catch (e2) { /* noop */ }
          var dur = el.duration;
          // v0.5.6 第二十一轮需求 1：**非有限时长兜底**——流式/异常文件
          // duration 可能为 Infinity/NaN → Math.min(Inf*0.1,30)=30 → seek
          // 超范围 → 黑帧循环耗尽重试 → 封面黑。非有限时长用固定 2s。
          if (!isFinite(dur) || dur <= 0) dur = 10;
          // 首次截帧点 = min(10%, 30s)，至少 2s——避开第一帧黑场（片头
          // 黑场/淡入），且长视频不 seek 过深（seek 越深越慢）
          el.currentTime = Math.max(2, Math.min(dur * 0.1, 30));
          it._thumbDiag.seekTo = el.currentTime;
        } catch (e) { it._thumbDiag.err = 'seek: ' + e.message; grab(); }
      };
      el.onseeked = function () { setTimeout(grab, 50); };
      el.ontimeupdate = function () {
        if (!grabbed && !finished && el.currentTime >= 0.03) setTimeout(grab, 50);
      };
      el.onerror = function () {
        it._thumbDiag.state = 'error';
        it._thumbDiag.err = el.error ? (el.error.code + ':' + el.error.message) : 'unknown';
        done();
      };
      el.src = it.url;
    });
  }

  /** v0.5.6 第二十四轮：**WebCodecs 兜底截帧**——元素法（makeThumb）依赖
   *  媒体元素渲染，在以下场景会失败：视口不可见/后台标签/自动化窗口
   *  （Chromium 对不可见页面的媒体加载与解码渲染做节流压制）。WebCodecs
   *  （VideoDecoder）是纯解码 API，**不依赖元素可见性**，任何环境可用。
   *  链路：MP4Box demux（vendor 已内联）→ 视频轨 → avcC 提取
   *  （AVCDecoderConfigurationRecord = avcC box payload）→ setExtractionOptions
   *  + start() 取样本 → VideoDecoder 解码 → canvas 320x180 JPEG。
   *  实测（probe.mp4 avc1.64001f 960x540）：mp4box 0.4.x 的 is_sync 标记
   *  可能全 false，但首样本实际是关键帧——首个样本按 'key' 提交即可出帧；
   *  若报 "A key frame is required"（真 delta）则依次换下一个样本。
   *  仅支持 MP4 容器（mp4box 限制）；mkv/webm 等走元素法。 */
  function thumbWebCodecs(file, it) {
    return new Promise(function (resolve) {
      if (typeof MP4Box === 'undefined' || typeof VideoDecoder === 'undefined'
        || typeof EncodedVideoChunk === 'undefined' || typeof DataStream === 'undefined') {
        it._thumbDiag.state = 'wc-unavail';
        resolve(false);
        return;
      }
      var timer = setTimeout(function () {
        it._thumbDiag.state = 'wc-timeout';
        resolve(false);
      }, 10000);
      var finish = function (ok) {
        if (timer) { clearTimeout(timer); timer = null; }
        resolve(ok);
      };
      file.arrayBuffer().then(function (buf) {
        var mp4 = null;
        try { mp4 = MP4Box.createFile(); } catch (e) { it._thumbDiag.state = 'wc-init'; finish(false); return; }
        try { buf.fileStart = 0; } catch (e) { /* noop */ }
        mp4.onError = function (e) {
          it._thumbDiag.state = 'wc-mp4err';
          it._thumbDiag.err = String(e);
          finish(false);
        };
        mp4.onReady = function (info) {
          var tr = info.videoTracks && info.videoTracks[0];
          if (!tr) {
            it._thumbDiag.state = 'wc-no-track';
            finish(false);
            return;
          }
          // AVCDecoderConfigurationRecord：stsd entry 的 avcC box payload
          var descBytes = null;
          try {
            var stsdE = mp4.getTrackById(tr.id).mdia.minf.stbl.stsd.entries[0];
            var avcc = stsdE && (stsdE.avcC || null);
            if (avcc && avcc.write) {
              var ds2 = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
              avcc.write(ds2);
              descBytes = new Uint8Array(ds2.buffer).slice(8);
            }
          } catch (e) { /* noop */ }
          it._thumbDiag.wcCodec = tr.codec;
          it._thumbDiag.wcDescLen = descBytes ? descBytes.byteLength : 0;
          var decoder = null;
          var samples = null;
          var idx = 0;
          var decoded = false;
          var tryNext = function () {
            if (decoded) return;
            if (!samples || idx >= samples.length) {
              it._thumbDiag.state = 'wc-no-key';
              finish(false);
              return;
            }
            var s = samples[idx++];
            try {
              decoder.decode(new EncodedVideoChunk({
                // 首个样本按 'key' 试（实测 mp4box is_sync 标记不可靠）；
                // 报 key-required 错误则换下一个样本
                type: idx === 1 ? 'key' : (s.is_sync ? 'key' : 'delta'),
                timestamp: s.cts,
                duration: s.duration,
                data: s.data,
              }));
              decoder.flush().catch(function () { /* ignore（close 竞态） */ });
            } catch (e) {
              if (e && e.name === 'DataError') {
                tryNext();   // 非关键帧 → 换下一个
              } else {
                it._thumbDiag.state = 'wc-decode';
                it._thumbDiag.err = String(e && e.message || e);
                finish(false);
              }
            }
          };
          decoder = new VideoDecoder({
            output: function (frame) {
              if (decoded) { try { frame.close(); } catch (e) { /* noop */ } return; }
              decoded = true;
              try {
                var cv = document.createElement('canvas');
                cv.width = 320; cv.height = 180;
                var ctx = cv.getContext('2d');
                ctx.drawImage(frame, 0, 0, 320, 180);
                it.cover = cv.toDataURL('image/jpeg', 0.72);
                it.duration = Math.round((tr.duration || 0) / (tr.timescale || 1));
                it._thumbDiag.state = 'wc-ok';
                try { decoder.close(); } catch (e) { /* noop */ }
                finish(true);
              } catch (e) {
                it._thumbDiag.state = 'wc-drawerr';
                it._thumbDiag.err = String(e && e.message || e);
                finish(false);
              } finally {
                try { frame.close(); } catch (e) { /* noop */ }
              }
            },
            error: function (e) {
              if (decoded) return;
              if (e && e.name === 'DataError') {
                tryNext();   // 非关键帧错误 → 下一个样本
              } else {
                it._thumbDiag.state = 'wc-dec-err';
                it._thumbDiag.err = String(e && e.message || e);
                finish(false);
              }
            },
          });
          try {
            decoder.configure({
              codec: tr.codec,
              codedWidth: tr.video.width,
              codedHeight: tr.video.height,
              description: descBytes || undefined,
            });
            mp4.setExtractionOptions(tr.id, null, { nbSamples: 60 });
            mp4.onSamples = function (sid, user, sampleList) {
              if (samples || decoded) return;
              samples = sampleList;
              tryNext();
            };
            mp4.start();
          } catch (e) {
            it._thumbDiag.state = 'wc-cfg';
            it._thumbDiag.err = String(e && e.message || e);
            finish(false);
          }
        };
        try { mp4.appendBuffer(buf); } catch (e) {
          it._thumbDiag.state = 'wc-append';
          it._thumbDiag.err = String(e && e.message || e);
          finish(false);
        }
      }).catch(function (e) {
        it._thumbDiag.state = 'wc-read';
        it._thumbDiag.err = String(e && e.message || e);
        finish(false);
      });
    });
  }

  /** v0.5.6 第二十一轮需求 1：**懒截帧自愈**——cover 空的记录（旧数据/
   *  导入时截帧失败/重启后 File 缺失）在**被读取展示时**后台自动补截帧，
   *  用户无需重新导入。防重入（it._thumbing）；补成功后写回 IDB 并广播
   *  （列表/卡片下次渲染即见封面）。headless/异常环境截帧失败也静默
   *  （不阻塞读取）。 */
  function ensureCover(it) {
    if (!it || it.cover || it._thumbing || finished) return;
    if (!it._file) return;   // 无文件本体（IDB 大文件 quota 失败）→ 无法截帧
    // v0.5.6 第二十三轮：懒截帧路径补 objectURL（fromRow 重建失败时 src 空
    // → 无事件 → 超时 → cover 永远空）
    if (!it.url && window.URL && URL.createObjectURL) {
      try { it.url = URL.createObjectURL(it._file); } catch (e) { /* noop */ }
    }
    it._thumbing = true;
    // v0.5.6 第二十四轮：懒截帧同样双路径（元素法 → WebCodecs 兜底）
    makeThumb(it._file, it).then(function () {
      if (!it.cover) return thumbWebCodecs(it._file, it);
      return false;
    }).then(function () {
      it._thumbing = false;
      if (it.cover) {
        persist(it);
        // v0.5.6 第二十二轮需求 2：**热更新已渲染卡片**——把墙/搜索/角色页
        // 里该本地卡的 video poster 即时换成新封面（懒截帧异步完成时卡片
        // 已渲染，poster 不会自己刷新）
        try {
          document.querySelectorAll('.vsc-video-card[data-id="' + it.id + '"]').forEach(function (c) {
            c.classList.remove('is-local-nocover');
            c.classList.add('has-cover');
            var v = c.querySelector('video');
            if (v) v.poster = it.cover;
          });
        } catch (e) { /* noop */ }
        // 通知 UI 刷新（local-panel 列表等监听）
        var evt = null;
        try { evt = new CustomEvent('vshell-local-cover', { detail: { id: it.id } }); window.dispatchEvent(evt); } catch (e) { /* noop */ }
      }
    });
  }
  var finished = false;

  function persist(it) {
    if (!db) return;
    try {
      var tx = db.transaction(STORE, 'readwrite');
      // v0.5.6 第二十轮需求 3：**元数据与 File 本体分两次 put**——大文件
      // （数百 MB）Blob 持久化可能触发 quota 失败/超时，若与元数据同一条
      // 记录写入，整个事务失败 → 重启后连 cover（封面）都丢 → 卡片黑屏。
      // 先落元数据（file:null，封面/标题/时长全保留），File 再单独补写
      // （失败不影响元数据；重启后该视频不可播但封面正常）。
      tx.objectStore(STORE).put({
        id: it.id, title: it.title, cover: it.cover,
        pubdate: it.pubdate, duration: it.duration, view: it.stat.view,
        size: it.size, addedAt: it.addedAt,
        file: null,
      });
      if (it._file) {
        var tx2 = db.transaction(STORE, 'readwrite');
        tx2.objectStore(STORE).put({
          id: it.id, title: it.title, cover: it.cover,
          pubdate: it.pubdate, duration: it.duration, view: it.stat.view,
          size: it.size, addedAt: it.addedAt,
          file: it._file,
        });
      }
    } catch (e) { /* quota/隐私模式 */ }
  }

  /** 批量导入（input[type=file].files / DataTransfer 拖拽）→ Promise<items>
   *  v0.5.6 第二十四轮：截帧改**串行**（reduce 链）——截帧 video 现在
   *  真实渲染在视口右下角，并行截帧 = 多个视频同时闪烁+抢占解码器；
   *  串行一次只闪一个，解码资源集中，成功率更高 */
  function importFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return f && (f.type ? f.type.indexOf('video/') === 0 : /\.(mp4|webm|mkv|mov|avi|flv|m4v)$/i.test(f.name || ''));
    });
    if (!files.length) return Promise.resolve([]);
    return loadAll().then(function () {
      var out = [];
      var chain = Promise.resolve();
      files.forEach(function (file) {
        chain = chain.then(function () {
          return new Promise(function (resolve) {
            var ts = Date.now();
            var base = (file.name || 'video').replace(/\.[^.]+$/, '');
            var it = {
              id: 'local:' + base + ':' + ts,
              title: base, cover: '',
              url: URL.createObjectURL(file),
              pubdate: Math.floor(ts / 1000), duration: 0,
              local: true, stat: { view: 0 },
              size: file.size || 0, addedAt: ts,
              _file: file,
            };
            it._thumbing = true;   // v0.5.6 第二十一轮：防 ensureCover 重复截帧
            // v0.5.6 第二十四轮：元素法 → 失败自动切 WebCodecs 兜底
            makeThumb(file, it).then(function () {
              if (!it.cover) return thumbWebCodecs(file, it);
              return false;
            }).then(function () {
              items.push(it);
              persist(it);
              out.push(it);
              resolve(it);
            });
          });
        });
      });
      return chain.then(function () { return out; });
    });
  }

  /** 删除本地视频（IDB + 内存 + 释放 objectURL） */
  function remove(id) {
    return loadAll().then(function () {
      items = items.filter(function (it) {
        if (it.id !== id) return true;
        try { if (it.url && URL.revokeObjectURL) URL.revokeObjectURL(it.url); } catch (e) { /* noop */ }
        return false;
      });
      if (db) {
        try {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(id);
        } catch (e) { /* noop */ }
      }
      return true;
    });
  }

  function find(id) {
    var hit = null;
    items.forEach(function (it) { if (it.id === id) hit = it; });
    if (hit) ensureCover(hit);   // v0.5.6 第二十一轮：读取即触发懒截帧
    return hit || null;
  }

  function list() {
    // v0.5.6 第二十一轮：读取即触发懒截帧（cover 空的自愈）
    items.forEach(ensureCover);
    return items.slice();
  }

  /** 标题包含匹配（搜索/聚合注入用；大小写不敏感） */
  function search(q) {
    var low = String(q || '').toLowerCase();
    items.forEach(ensureCover);   // v0.5.6 第二十一轮：同 list
    return items.filter(function (it) { return !low || it.title.toLowerCase().indexOf(low) >= 0; });
  }

  /** 播放源：直链 objectURL（feed/detail 共用；feed 的 applyPi 有
   *  pi.type==='url' 分支直接 player.load(url)） */
  function playInfo(item) {
    var it = item && item.id ? find(item.id) : null;
    if (!it) return Promise.resolve(null);
    return Promise.resolve({
      type: 'url', url: it.url || '', duration: it.duration || 0,
    });
  }

  V.localVideos = {
    init: loadAll,          // 应用启动时预恢复（build 后 app.js 调）
    importFiles: importFiles,
    remove: remove,
    find: find,
    list: list,
    search: search,
    playInfo: playInfo,
  };
})();
