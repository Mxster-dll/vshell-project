/* ============================================================
 * shots — 分镜识别（scene/shot boundary detection）
 *
 * 纯客户端像素分析（无需站点 API，通用适配所有站点）：
 * 播放中按 300ms 间隔对视频帧降采样（64x36）→ RGB 直方图 + 亮度
 * → 相邻帧差异评分 → 「连续两个采样间隔持续高差异」判定分镜转换
 * （持续判定天然过滤单帧闪光/字幕抖动；淡入淡出属分镜，保留；
 *  确认后重置基线，渐变切换不会连环触发）
 *
 * 两种工作模式（用户需求：两者结合）：
 *  - attach：边播边分析——主播放器 rVFC/rAF 采样，节点随播放渐进出现
 *  - scan：隐藏快扫——不可见 video 静音 8x 完整扫一遍，
 *          进入详情页（无缓存时）即得全量节点，不打扰主播放器
 * 结果按视频 id 持久化（store 键 shots.<id>，升序节点数组
 * [{t, s}]：t=秒、s=差异度 0-1；旧纯数字缓存读取时自动归一化）
 *
 * 节点渲染 renderNodes(barEl, times, duration)：详情页与刷页播放器
 * 进度条（.vshell-player-bar）同构复用；节点仅显示（用户需求），
 * title 属性附时间提示
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var KEY = 'shots3.';         // store 键前缀（store 自动加 vshell.）
                               // v3：seek 步进采样（直链、全覆盖、不卡）——
                               // 作废 v2（dash 播放模式）的错误/不完整节点
  var SCANNED_KEY = 'scanned.v4.';  // 识别标记键（版本化：0.1.0 的 scanned.v3
                                     // 在 N=0 时也误标 → 旧标记全部失效；
                                     // 0.1.1 起用 v4 键，失败/黑帧不标记可重试）
  var SAMPLE_MS = 300;         // 边播分析采样间隔（真实时间）
  var W = 64, H = 36;          // 降采样分辨率（特征够用、CPU 极轻）
  var TH = 0.35;               // 差异阈值（0-1；0.35 抑制运动场景误检，硬切/淡入淡出仍远高于此）
  var TS = 1.2;                // 最小节点间隔（秒，**可选**：间隔不足的相邻节点
                               // 比较差异度保留强者 + 回溯复活——见 constrain()；
                               // setMinGap(0) 关闭约束）
  var GAP_KEY = 'shots.gap';   // 最小间隔持久化键（store 自动加 vshell. 前缀）
  try { var _g = V.store.get(GAP_KEY); if (typeof _g === 'number') TS = _g; } catch (e) { /* noop */ }
  var MAX_PENDING = 3;         // 切换候选最大持续采样间隔数（防摇镜误检：
                               // 真实分镜在 1-2 个间隔内回落；持续更高=镜头运动/渐变）
  var SCAN_FALLBACK_CAP = 86400; // 快扫覆盖兜底（秒；duration 缺失时用 24h——
                               // 正常情况全覆盖无上限，视频 ended/error 也会结束）

  /* canvas 按 owner 分离（attach/scan 各自实例）：跨域直链 drawImage 后
   * canvas 被污染（tainted）→ getImageData 抛 SecurityError → 采样全挂。
   * 分离后快扫污染自己的 canvas，不连累 attach（主播放器 MSE 同源不污染） */
  var canvases = {};
  function ensureCanvas(owner) {
    if (!canvases[owner]) {
      var c = document.createElement('canvas');
      c.width = W; c.height = H;
      canvases[owner] = { canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }) };
    }
    return canvases[owner];
  }

  /* ---------- 帧特征：RGB 直方图(48 bin) + 平均亮度 ----------
   * owner：'attach'（主播放器 MSE，同源不污染）| 'scan'（跨域直链，
   * 必须 crossorigin 加载 + 独立 canvas） */
  function sample(video, owner) {
    var c = ensureCanvas(owner || 'attach');
    c.ctx.drawImage(video, 0, 0, W, H);
    var d = c.ctx.getImageData(0, 0, W, H).data;
    var hist = new Uint32Array(48);
    var lum = 0;
    for (var i = 0; i < d.length; i += 4) {
      hist[d[i] >> 4]++;
      hist[16 + (d[i + 1] >> 4)]++;
      hist[32 + (d[i + 2] >> 4)]++;
      lum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    }
    return { hist: hist, lum: lum / (W * H) / 255, t: video.currentTime };
  }

  /* ---------- 相邻帧差异评分（0-1） ---------- */
  function diff(a, b) {
    var sum = 0;
    for (var i = 0; i < 48; i++) sum += Math.abs(a.hist[i] - b.hist[i]);
    var histL1 = sum / (2 * (W * H));
    var lumD = Math.abs(a.lum - b.lum);
    return histL1 * 0.7 + lumD * 0.3;
  }

  /* ---------- 分析状态机 ----------
   * ingest(feat) → 返回新确认的分镜时间数组（可能空）
   *
   * 判定逻辑（对硬切 cut / 淡入淡出 / 白闪均稳健）：
   *  - 相邻采样帧差异 > TH → 进入切换候选（记录起始帧时间与特征）
   *  - 之后差异回落 → 切换结束：若「回落帧与切换起始帧」差异仍大
   *    → 确认分镜（取起始帧时间）；若回落帧与起始帧相似 → 闪回
   *    （白闪/抖动：同场景亮度突变后复原）→ 丢弃
   * 硬切：A A | B B → 0.3(A→B) 大差异入候选，0.6(B→B) 回落且
   *  B 与 A 差异大 → 确认 0.3 ✓
   * 渐变：A→…→B → 起始差异入候选，回落到 B 时确认 ✓
   * 白闪：A → F(白) → A → 回落帧 A 与起始帧 A 相似 → 丢弃 ✓ */
  function Analyzer() {
    this.prev = null;
    this.pendingT = -1;
    this.pendingFrame = null;
    this.shots = [];          // 已确认节点 [{t, s}] 升序——**原始点集全保留**
                              // （不做间隔过滤；间隔约束+回溯统一在渲染层 constrain）
  }
  Analyzer.prototype.ingest = function (feat) {
    var out = [];
    if (this.prev) {
      var s = diff(this.prev, feat);
      if (s > TH) {
        if (this.pendingT < 0) {
          this.pendingT = this.prev.t;   // 切换候选：起始帧时间
          this.pendingFrame = this.prev;
          this.pendingCount = 0;
        } else if (++this.pendingCount >= MAX_PENDING) {
          if (s > TH * 1.5) {
            // 持续大差异 = 快剪（每个采样点都在不同场景，等回落不可行）
            // → 直接确认候选（间隔 ~MAX_PENDING 采样）；
            // 白闪（1-2 帧后回原场景）差异持续 < MAX_PENDING → 仍走回落过滤 ✓
            this.tryPush(this.pendingT, s, out);
          }
          // 持续中等差异（≤1.5×TH）= 摇镜/渐变 → 放弃候选
          this.pendingT = -1;
          this.pendingFrame = null;
        }
      } else if (this.pendingT >= 0) {
        // 切换结束（差异回落）——闪回过滤：回落帧须与起始帧差异仍大
        if (diff(feat, this.pendingFrame) > TH * 0.8) {
          this.tryPush(this.pendingT, diff(feat, this.pendingFrame), out);
        }
        this.pendingT = -1;
        this.pendingFrame = null;
      }
    }
    this.prev = feat;
    return out;
  };
  Analyzer.prototype.tryPush = function (t, s, out) {
    // 差异度 s = 确认时的切换强度（回落帧与起始帧差异 / 快剪当前差异）；
    // 原始点全部推入，不做间隔过滤——冲突与回溯由渲染层 constrain 统一处理
    var node = { t: Math.round(t * 100) / 100, s: typeof s === 'number' ? s : 1 };
    this.shots.push(node);
    out.push(node.t);
  };

  /* ---------- 采样驱动：rAF 单通道（rVFC 在不可见元素上不触发——
   * visibility:hidden/opacity:0 的 video 无渲染帧回调；rAF 页面级
   * 恒触发，drawImage 取解码帧与可见性无关），节流 intervalMs 参数化：
   * attach 用 SAMPLE_MS(300ms)；scan 用 SAMPLE_MS/SCAN_RATE（快扫下
   * 每 0.3s 视频时间采一帧，节点定位精度与边播一致 ±0.3s） */
  function createSampler(video, onFrame, intervalMs, owner) {
    var running = true;
    var lastT = 0;
    var iv = intervalMs || SAMPLE_MS;
    function loop(now) {
      if (!running) return;
      if (video.readyState >= 2 && !video.paused && now - lastT >= iv) {
        lastT = now;
        try { onFrame(sample(video, owner || 'attach')); } catch (e) { /* 帧未就绪 */ }
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    return function () { running = false; };
  }

  /* ---------- 缓存 ---------- */
  /* 归一化：旧纯数字缓存 → {t, s}（差异度默认 0.5——无记录时中立值） */
  function normShot(x) {
    if (typeof x === 'number') return { t: x, s: 0.5 };
    return { t: x.t, s: typeof x.s === 'number' ? x.s : 0.5 };
  }
  function get(id) {
    if (!id) return null;
    var v = V.store.get(KEY + id);
    return Array.isArray(v) && v.length
      ? v.map(normShot).sort(function (a, b) { return a.t - b.t; })
      : null;
  }
  /* 合并去重（±0.3s 容差，冲突保留差异度大者）：attach（边播边分析）
     与 scan（快扫）并发写同一缓存键时互不覆盖 */
  function mergeUnique(a, b) {
    var all = (a || []).concat(b || []).map(normShot)
      .sort(function (x, y) { return x.t - y.t; });
    var out = [];
    all.forEach(function (n) {
      var last = out[out.length - 1];
      if (!last || n.t - last.t >= 0.3) out.push(n);
      else if (n.s > last.s) out[out.length - 1] = n;   // 容差内重复：保留差异度大者
    });
    return out;
  }
  function save(id, shots) {
    if (!id || !shots || !shots.length) return;
    V.store.set(KEY + id, mergeUnique(get(id), shots));
  }
  function set(id, shots) { save(id, shots); }
  /* 识别标记：快扫完成即打标（即使 0 节点），同一视频不再重复识别 */
  function markScanned(id) { if (id) V.store.set(SCANNED_KEY + id, true); }
  function isScanned(id) { return !!V.store.get(SCANNED_KEY + id); }

  /* ---------- 边播边分析：attach(player, opts) → detach ----------
   * opts: { id, onUpdate() }
   * 播放到哪里分析到哪里；**产点立即持久化**（渲染统一读缓存——
   * 单一事实源，与快扫节点合并一致，杜绝「两套节点来回切」）；
   * 分析器以已有缓存初始化（重复观看不重复计数） */
  function attach(player, opts) {
    if (!player || !player.video || !opts || !opts.id) return function () {};
    var video = player.video;
    var an = new Analyzer();
    var cached = get(opts.id);
    if (cached) an.shots = cached.slice();
    var stopSampler = createSampler(video, function (feat) {
      var news = an.ingest(feat);
      if (news.length) {
        save(opts.id, an.shots);          // 立即持久化（缓存 = 并集）
        if (opts.onUpdate) opts.onUpdate();
      }
    });
    var onEnded = function () { save(opts.id, an.shots); };
    video.addEventListener('ended', onEnded);
    return function () {
      stopSampler();
      video.removeEventListener('ended', onEnded);
      save(opts.id, an.shots);
    };
  }

  /* ---------- 快扫：scan(playInfo, opts) → stop ----------
   * opts: { id, duration, container, onUpdate(), onProgress(pct), onDone() }
   * container：必传——渲染容器（调用方创建 .vshell-scan-window：
   *   v0.3.99 起 opacity:0.02 + 32x18 + 无阴影——用户不可见但 alpha≠0
   *   保留合成渲染管线。历史教训：opacity:0 / opacity:0.01（旧尺寸
   *   实测）/ 被背景遮挡 都会让 Chromium 跳过 video 帧缓冲更新 →
   *   drawImage 恒黑/旧帧 → 0 节点；完全可见才保证渲染）
   *
   * 驱动方式：**直链 + 8 倍速播放 + 实时采样**（v5）——
   *   v4 用 paused seek 步进：真实 CDN 视频 seek 后解码帧迟迟不就绪
   *   （readyState<2 时 drawImage 抛错）→ 全程只有首帧可采 → 假 0 节点
   *   （用户实测「采样 1 帧」诊断）。v5 弃用 seek：video 以 8x 播放
   *   （直链原生倍速，下载速度不变——dash.js 无 trick play 的 v2 教训
   *   不适用于直链），**播放中的 video 帧一定可用**（与 attach 边播
   *   分析同机制）；v0.4.2 起倍速**自适应无上限**（AIMD：缓冲健康爬升
   *   1.2x/吃紧退避 0.7x，Chromium 钳制 ~16x 自然封顶），采样间隔随
   *   倍速联动（1000/rate）保持视频秒采样密度恒定（±1s 定位）；
   *   缓冲跟不上时自动等缓冲恢复（waiting 不处理即自愈）；
   *   30s 无进展（currentTime 不动）超时兜底（**永不卡死**，部分节点也保存）。
   * 完成打 scanned 标记（黑帧/加载失败**不标记**——可重试）；
   * onProgress：启动立即回调 0，之后 ~2% 粒度实时回调 */
  /** 自适应调速决策（模块级纯函数，供 scan 与 harness 单测）：
   *  AIMD——缓冲健康乘法爬升（×1.2）/ 吃紧快速退避（×0.7）；
   *  无硬上限（Chromium 对 playbackRate 自然钳制 ~16x 即天花板），
   *  软下限 1x（低于实时播放无意义）。 */
  function rateStep(health, r) {
    if (!r || !isFinite(r) || r <= 0) r = 4;
    return health ? r * 1.2 : Math.max(1, r * 0.7);
  }
  function scan(playInfo, opts) {
    var id = opts && opts.id;
    var box = opts && opts.container;
    if (!id || !playInfo || !box) return function () {};
    var video = null;
    var an = new Analyzer();
    var cached = get(id);
    if (cached) an.shots = cached.slice();
    var finished = false;
    var failed = false;               // 加载失败标记（error 事件 → 不 markScanned）
    var blackCount = 0;               // 采样黑帧诊断
    var INIT_RATE = 4;                // 初始倍速（自适应起点；v2 教训：固定 8x 曾致缓冲耗尽卡住——
                                      // 现由自适应器按缓冲健康度自行爬升/退避）
    var CHECK_MS = 500;               // 自适应调速周期（真实 ms）
    var BUFFER_AHEAD = 2;             // 缓冲前瞻阈值（秒）：readyState>=3 或前瞻缓冲>=2s 视为健康
    var PLAYER_AHEAD = 5;             // v0.5.6 第二十六轮需求 3：主播放器前瞻缓冲阈值（秒）——
                                      // 不足即判定加载吃紧，快扫暂停让带宽
    var RATE_UP = 1.2;                // 缓冲健康：乘法爬升（AIMD）
    var RATE_DOWN = 0.7;              // 缓冲吃紧：乘法退避
    var MIN_RATE = 1;                 // 软下限（<1x 无意义）；**无硬上限**——Chromium 对
                                      // playbackRate 自然钳制 ~16x，即自适应天花板
    var SAMPLE_INT = 250;             // 采样基准间隔（真实 ms；4x 时 → 1s 视频秒/采样，±1s 定位）
                                      // 实际间隔随倍速联动（1000/rate）——视频时间采样密度恒定，
                                      // 高速下分镜定位精度不劣化
    var STALL_TIMEOUT = 30000;        // 30s 无进展（currentTime 不动）→ 放弃（部分节点也保存）
    var sampler = null, adjustTimer = null;
    var lastT = 0, stallMs = 0, lastTick = 0;
    var pausedForPlayer = false;   // v0.5.6 第二十六轮需求 3：主播放器加载吃紧时的暂停标记
    var rate = INIT_RATE, rateSum = 0, rateN = 0;        // 当前倍速 + 平均倍速诊断
    var healthN = 0, totalN = 0;                         // 缓冲健康采样率（诊断）
    var sampleCount = 0, diffSum = 0, prevFeat = null;   // 诊断统计
    function cleanup() {
      finished = true;                 // 终止全部回调（采样器/error/ended…防清理后继续推进）
      clearInterval(sampler);
      clearInterval(adjustTimer);
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
      if (video && video.parentNode) video.parentNode.removeChild(video);
      video = null;
    }
    function done(shots) {
      if (finished) return;
      finished = true;
      save(id, shots);
      // 黑帧/加载失败 → 不标记（下次可重试）+ 用户可见诊断；
      // 正常 0 节点（真没分镜）→ 标记（不重复扫）
      if (failed || (blackCount > 30 && (!shots || !shots.length))) {
        try {
          if (V.toast) V.toast.error(failed ? '分镜识别失败：视频源无法后台加载' : '分镜识别失败：后台视频无法渲染，稍后重试');
        } catch (e) { /* noop */ }
        try {
          console.warn('vshell 快扫诊断：' + (failed ? '加载失败' : '黑帧 ' + blackCount + ' 帧') + '，未打标记，可重试');
        } catch (e) { /* noop */ }
      } else {
        markScanned(id);           // 已识别（即使 0 节点也不重复快扫）
        if (rateN > 0) {
          try {
            console.log('vshell 快扫完成：' + (shots ? shots.length : 0) + ' 节点，平均倍速 ' +
              Math.round(rateSum / rateN * 10) / 10 + 'x（自适应），缓冲健康 ' + healthN + '/' + totalN);
          } catch (e) { /* noop */ }
        }
        // 0 节点但采样正常 → 输出诊断（区分「帧未更新」与「真无切换」）
        if (!shots || !shots.length) {
          try {
            var avg = sampleCount > 0 ? Math.round(diffSum / sampleCount * 100) / 100 : -1;
            console.warn('vshell 快扫诊断：完成但 0 节点（采样 ' + sampleCount + ' 帧，黑帧 ' + blackCount +
              '，平均帧间差异 ' + avg + '）' + (avg >= 0 && avg < 0.15 ? '——疑似采样帧未更新（旧帧），节点不可用' : '——视频可能无场景切换'));
          } catch (e) { /* noop */ }
        }
      }
      cleanup();
      if (opts.onDone) opts.onDone();
    }
    try {
      // 容器（调用方创建，opacity 1 + z-index -1 藏于播放器背景之下）挂 video
      video = V.utils.el('video', { muted: '', playsinline: '', preload: 'metadata', crossorigin: 'anonymous' });
      box.appendChild(video);
      // v0.5.6 用户反馈：快扫倍速播放出声——muted 属性在部分环境不
      // 同步 property（video-card.js 同教训），必须显式置 property
      video.muted = true;
      var dur = opts.duration || playInfo.duration || 0;
      var cap = dur || SCAN_FALLBACK_CAP;   // 全覆盖无上限（用户需求）
      var t = 0, lastPct = -1;
      function stamp() {
        try {
          window.__VS_SCAN__ = { mode: 'play', t: Math.round(t * 10) / 10, cap: cap, rate: rate, shots: an.shots.length };
        } catch (e) { /* noop */ }
      }
      function progress() {
        var pct = cap > 0 ? Math.min(100, Math.round(t / cap * 50) * 2) : 100;
        if (opts.onProgress && pct !== lastPct) { lastPct = pct; opts.onProgress(pct); }
      }
      function emitUpdate() {
        if (opts.onUpdate) opts.onUpdate();
      }
      video.addEventListener('error', function () { failed = true; done(an.shots); });
      video.addEventListener('ended', function () { done(an.shots); });
      video.addEventListener('loadedmetadata', function () {
        if (finished) return;
        applyRate();                       // 设倍速 + 起采样器（间隔随倍速联动）
        video.play().catch(function () { /* autoplay 拒绝：stall 计时兜底 */ });
        if (opts.onProgress) opts.onProgress(0);   // 启动即显示
        stamp();
        adjustTimer = setInterval(adjust, CHECK_MS);
      });
      /** 采样器主体（间隔随倍速联动，视频时间采样密度恒定） */
      function samplerTick() {
        if (finished) return;
        // v0.5.6 第二十六轮需求 3：**主视频优先**——任一主播放器
        // （.vshell-player video：详情页播放器 / 抖音刷各 slide 播放器）
        // 加载吃紧（readyState<3 或前瞻缓冲 <5s）时**暂停快扫**（停拉流
        // 让带宽），主视频恢复健康后继续；让位期间不计 stall（防 30s
        // 超时误判放弃）
        if (mainPlayerStrained()) {
          if (!video.paused) video.pause();
          pausedForPlayer = true;
          stallMs = 0;
          return;
        }
        if (pausedForPlayer) {
          pausedForPlayer = false;
          video.play().catch(function () { /* autoplay 拒绝：stall 计时兜底 */ });
        }
        var now = Date.now();
        stallMs += now - lastTick;         // 真实耗时累计（与采样间隔无关）
        lastTick = now;
        if (video.readyState < 2 || video.paused) {
          // 缓冲中/未开始：等待恢复（自愈）；持续无进展则超时兜底
          if (stallMs > STALL_TIMEOUT) { done(an.shots); }
          return;
        }
        t = video.currentTime;
        if (t === lastT) {
          // 真实耗时已在 tick 开头累计；t 未推进说明卡顿/缓冲耗尽
          if (stallMs > STALL_TIMEOUT) { done(an.shots); return; }
        } else {
          stallMs = 0;
          lastT = t;
        }
        progress(); stamp();
        var feat = null;
        try { feat = sample(video, 'scan'); } catch (e) { feat = null; }
        if (feat) {
          if (feat.lum === 0) blackCount++;
          else {
            sampleCount++;
            if (prevFeat) diffSum += diff(prevFeat, feat);
            prevFeat = feat;
          }
          var news = an.ingest(feat);
          if (news.length) {
            save(id, an.shots);            // 产点立即持久化（渲染统一读缓存）
            emitUpdate();
          }
        }
        if (t >= cap - 0.05) { done(an.shots); return; }
      }
      /** 缓冲健康判定：readyState>=3（有当前帧可解码）或前瞻缓冲 ≥ BUFFER_AHEAD 秒 */
      function bufferedHealth() {
        try {
          if (!video || video.readyState >= 3) return true;
          var b = video.buffered;
          if (!b || !b.length) return false;
          var t = video.currentTime;
          for (var i = 0; i < b.length; i++) {
            if (b.start(i) <= t && b.end(i) - t >= BUFFER_AHEAD) return true;
          }
        } catch (e) { /* noop */ }
        return false;
      }
      /** v0.5.6 第二十六轮需求 3：主播放器加载是否吃紧——任一
       *  .vshell-player video readyState<3 或前瞻缓冲不足 PLAYER_AHEAD 秒
       *  → 返回 true（快扫暂停让带宽）。无主播放器（如角色页无播放器）
       *  → false（快扫不受限） */
      function mainPlayerStrained() {
        try {
          var pvs = document.querySelectorAll('.vshell-player video');
          if (!pvs || !pvs.length) return false;
          for (var i = 0; i < pvs.length; i++) {
            var pv = pvs[i];
            if (pv.readyState < 3) return true;
            var b = pv.buffered;
            if (!b || !b.length) return false;
            var t = pv.currentTime;
            var ok = false;
            for (var j = 0; j < b.length; j++) {
              if (b.start(j) <= t && b.end(j) - t >= PLAYER_AHEAD) { ok = true; break; }
            }
            if (!ok) return true;
          }
        } catch (e) { /* noop */ }
        return false;
      }
      /** 应用当前倍速 + 重建采样器（间隔 = 1000/rate，保视频秒密度） */
      function applyRate() {
        try { video.playbackRate = rate; } catch (e) { /* noop */ }
        var ms = Math.max(20, Math.round(1000 / rate));
        if (sampler) { clearInterval(sampler); sampler = null; }
        lastTick = Date.now();
        sampler = setInterval(samplerTick, ms);
      }
      /** 自适应调速：缓冲健康爬升 / 吃紧退避；无硬上限（浏览器钳制 ~16x 即天花板） */
      function adjust() {
        if (finished) return;
        var health = bufferedHealth();
        totalN++;
        if (health) healthN++;
        var r = rateStep(health, rate);
        if (r !== rate) { rate = r; applyRate(); }
        rateSum += rate; rateN++;
      }
      // 直链（绕开 dash.js 缓冲；媒体元素不受 CORS 限制）
      var src = null;
      if (playInfo.type === 'durl' && playInfo.durl && playInfo.durl.length) {
        src = playInfo.durl[0].url;
      } else if (playInfo.dash && playInfo.dash.video) {
        src = playInfo.dash.video.url;
      }
      if (!src) { done(an.shots); return cleanup; }
      video.src = src;
      video.load();
    } catch (e) {
      cleanup();
      if (!finished) { finished = true; if (opts.onDone) opts.onDone(); }
    }
    return cleanup;
  }

  /* ---------- 缓存驱动识别：scanRanges(playInfo, opts) → stop ----------
   * v0.6.98 用户需求：任何时候只要缓存数据有新增，就利用这部分缓存
   * 建立分镜识别。对已缓冲区间（主视频 buffered ∪ 悬停预览 buffered）
   * 串行 seek → 采样分析：已缓冲字节是本地读，seek 即时出帧、不占网络，
   * 比等待播放到该位置更早产出节点。
   * opts: { id, container, ranges:[{s,e}], onProgress(coveredRanges), onDone }
   * 返回 stop()。与快扫（全片 8x 慢扫）并行互补：快扫覆盖全片、本扫描
   * 即时覆盖已缓存区间；节点同存 shots3.<id>（mergeUnique 合并）。
   * 只支持直链源（durl/dash.video）；HLS（17c）无直链 → 空跑安全降级。 */
  function scanRanges(playInfo, opts) {
    var id = opts && opts.id;
    var box = opts && opts.container;
    if (!id || !playInfo || !box) return function () {};
    var ranges = (opts.ranges || []).filter(function (r) {
      return r && isFinite(r.s) && isFinite(r.e) && r.e - r.s >= TS;
    }).sort(function (a, b) { return a.s - b.s; });
    if (!ranges.length) return function () {};
    var video = null;
    var an = new Analyzer();
    var cached = get(id);
    if (cached) an.shots = cached.slice();
    var finished = false;
    var idx = 0;
    var doneRanges = [];          // 已完成的区间（进度覆盖用）
    var RATE = 4;                 // 本地字节 seek 即时，固定 4x 加速
    var SAMPLE_INT = 250;         // 采样间隔（4x → 视频时间 1s/采样，与快扫同密度）
    var sampler = null;
    var lastT = 0;                // 防卡：上一采样视频时间
    var lastAdv = Date.now();     // 防卡：最后一次视频时间推进时刻
    var mdTimer = null;           // loadedmetadata 超时兜底（video 加载异常时释放 busy）

    function covered() {
      var out = doneRanges.slice();
      if (idx < ranges.length) {
        var r = ranges[idx];
        var t = video ? video.currentTime : r.s;
        if (t > r.s + 0.3) out.push({ s: r.s, e: Math.min(t, r.e) });
      }
      return out;
    }
    function progress() {
      if (opts.onProgress) { try { opts.onProgress(covered()); } catch (e) { /* noop */ } }
    }
    function cleanup() {
      finished = true;
      if (mdTimer) { clearTimeout(mdTimer); mdTimer = null; }
      if (sampler) { clearInterval(sampler); sampler = null; }
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
      if (video && video.parentNode) video.parentNode.removeChild(video);
      video = null;
    }
    function finish() {
      if (finished) return;
      finished = true;
      save(id, an.shots);
      if (opts.onDone) { try { opts.onDone(); } catch (e) { /* noop */ } }
      cleanup();
    }
    function startRange() {
      if (finished) return;
      if (idx >= ranges.length) { finish(); return; }
      var r = ranges[idx];
      try { video.currentTime = r.s; } catch (e) { /* noop */ }
      video.play().catch(function () { /* autoplay 拒绝：seek 兜底 */ });
    }
    function samplerTick() {
      if (finished || !video) return;
      if (Date.now() - lastAdv > 15000) { finish(); return; }   // 15s 无推进 → 放弃（防卡死占 busy）
      var r = ranges[idx];
      if (!r) { finish(); return; }
      if (video.readyState < 2) return;
      var t = video.currentTime;
      if (t >= r.e - 0.05) {
        // 区间完成：记入 doneRanges → 下一个
        video.pause();
        doneRanges.push(r);
        idx++;
        progress();
        startRange();
        return;
      }
      if (Math.abs(t - lastT) > 0.05) { lastAdv = Date.now(); lastT = t; }
      // v0.6.99 防卡：autoplay 被拒（无用户交互）时 video 保持 paused——
      // 已缓冲字节是本地读，seek 即时出帧，seek 步进同样能采样，不依赖播放
      if (video.paused) {
        try { video.currentTime = Math.min(r.e - 0.1, t + 1); } catch (e) { /* noop */ }
      }
      var feat = null;
      try { feat = sample(video, 'cachescan'); } catch (e) { feat = null; }
      if (feat) {
        var news = an.ingest(feat);
        if (news.length) save(id, an.shots);
      }
      progress();
    }
    try {
      video = V.utils.el('video', { muted: '', playsinline: '', preload: 'metadata', crossorigin: 'anonymous' });
      box.appendChild(video);
      video.muted = true;
      var src = null;
      if (playInfo.type === 'durl' && playInfo.durl && playInfo.durl.length) src = playInfo.durl[0].url;
      else if (playInfo.dash && playInfo.dash.video) src = playInfo.dash.video.url;
      if (!src) { finish(); return cleanup; }
      // loadedmetadata 超时兜底：video 加载异常（不触发任何事件）时释放 busy
      mdTimer = setTimeout(function () {
        if (!finished && (!video || video.readyState < 2)) finish();
      }, 15000);
      video.addEventListener('loadedmetadata', function () {
        if (finished) return;
        if (mdTimer) { clearTimeout(mdTimer); mdTimer = null; }
        try { video.playbackRate = RATE; } catch (e) { /* noop */ }
        sampler = setInterval(samplerTick, SAMPLE_INT);
        startRange();
      });
      video.addEventListener('error', function () { finish(); });
      video.src = src;
      video.load();
    } catch (e) {
      cleanup();
      if (!finished) { finished = true; if (opts.onDone) opts.onDone(); }
    }
    return cleanup;
  }

  /* ---------- 间隔约束 + 回溯（用户需求 v0.1.6） ----------
   * 两个节点最小间隔 ts（可选；ts<=0 关闭约束）。间隔不足时比较差异度 s，
   * **保留更大的那个**；被顶替的节点进入「坟墓」，之后若它与相邻节点的
   * 间隔重新满足 ts → **复活**（回溯）。
   *
   * 用户例子：a(0,1) b(3,2) c(7,3)，ts=5 —— ab、bc 均 <5，但 ac=7>=5：
   *   放 a → [a]
   *   放 b：b 与 a 间隔 <ts 且 b.s(2) > a.s(1) → a 入坟 → [b]
   *   放 c：c 与 b 间隔 <ts 且 c.s(3) > b.s(2) → b 入坟 → [c]
   *   回溯：a 与 c 间隔 7>=5 → a 复活 → **[a, c]**（两者共存）✓
   *
   * 集中在此执行（缓存保持原始点集）——attach/scan 并发写缓存无删除冲突，
   * 渲染读缓存后约束，结果与插入顺序无关（按 t 升序处理） */
  function constrain(list, ts) {
    if (!list || !list.length) return list || [];
    if (!ts || ts <= 0) return list.slice().sort(function (x, y) { return x.t - y.t; });
    var nodes = list.slice().sort(function (x, y) { return x.t - y.t; });
    var result = [];       // 合法节点（升序）
    var graves = [];       // 被顶替节点（等待复活）
    function revive() {
      var changed = true;
      while (changed) {
        changed = false;
        for (var i = graves.length - 1; i >= 0; i--) {
          var g = graves[i];
          var idx = 0;
          while (idx < result.length && result[idx].t < g.t) idx++;
          var prev = result[idx - 1], next = result[idx];
          if ((!prev || g.t - prev.t >= ts) && (!next || next.t - g.t >= ts)) {
            result.splice(idx, 0, g);
            graves.splice(i, 1);
            changed = true;         // 可能连锁复活 → 循环
          }
        }
      }
    }
    nodes.forEach(function (n) {
      var last = result[result.length - 1];
      if (last && n.t - last.t < ts) {
        if (n.s >= last.s) {        // 强者顶替弱者（相等时新者胜——时间更精确）
          graves.push(last);
          result[result.length - 1] = n;
          revive();
        }
        // 弱者放弃（不再出现）
      } else {
        result.push(n);
        revive();
      }
    });
    return result;
  }

  /* ---------- 节点渲染：renderNodes(barEl, times, duration) ----------
   * **v0.1.7 用户需求：进度条直接渲染成一段一段的**（不做整条+挖空）——
   * 有节点时 bar 进入分段模式（class vshell-bar-segmented）：
   * 轨道/buffer/fill 全部按「节点之间的区间」生成独立段元素，
   * 段间留 2px 空隙（节点处完全断开，露出下层视频）；
   * 播放进度/缓冲由 player.js 调 updateProgress(bar, p, bp) 驱动
   * （段内 fill 宽度 = 段内进度比例，跨节点自动断开）。
   * span 仅作 hover title 命中区（透明不可见）；
   * 渲染前统一执行间隔约束+回溯（constrain，TS 可配置） */
  function renderNodes(bar, times, duration) {
    if (!bar) return;
    ensureHoverGuard(bar);
    // v0.5.6 第二十七轮：**重建前记录真实 :hover 段**——鼠标悬停不动时
    // mousemove 不触发（bar.__vsHoverPct 是旧值/未定义），直接查 DOM 的
    // :hover 最可靠（上一轮只靠 hoverPct，用户实测"动画依旧存在"）
    var hovStart = -1;
    var hovOld = bar.__vshellSegs;
    var hovEl = bar.querySelector('.vshell-player-bar-seg:hover');
    if (hovEl && hovOld) {
      for (var hi = 0; hi < hovOld.length; hi++) {
        if (hovOld[hi].el === hovEl) { hovStart = hovOld[hi].start; break; }
      }
    }
    var host = bar.querySelector('.vshell-player-bar-nodes');
    if (!host) {
      host = V.utils.el('div', { className: 'vshell-player-bar-nodes' });
      bar.appendChild(host);
    }
    host.innerHTML = '';
    // 清除旧分段结构（每次渲染重建）
    var oldSegs = bar.querySelector('.vshell-player-bar-segs');
    if (oldSegs) oldSegs.remove();
    bar.__vshellSegs = null;
    bar.classList.remove('vshell-bar-segmented');
    if (!times || !times.length || !duration || !isFinite(duration) || duration <= 0) return;
    var list = constrain((times || []).map(normShot), TS);
    if (!list.length) return;                      // 约束后无节点 → 整条模式
    var bounds = [0];
    list.forEach(function (n) {
      if (n.t > 0 && n.t < duration) bounds.push(n.t);
    });
    bounds.push(duration);
    if (bounds.length < 3) return;                 // 无有效内部节点 → 整条模式
    bar.classList.add('vshell-bar-segmented');
    var segsHost = V.utils.el('div', { className: 'vshell-player-bar-segs' });
    bar.appendChild(segsHost);
    var segs = [];
    for (var i = 0; i < bounds.length - 1; i++) {
      var s0 = bounds[i] / duration, s1 = bounds[i + 1] / duration;
      var seg = V.utils.el('div', { className: 'vshell-player-bar-seg' }, [
        V.utils.el('div', { className: 'vshell-player-bar-seg-track' }),
        V.utils.el('div', { className: 'vshell-player-bar-seg-buffer' }),
        V.utils.el('div', { className: 'vshell-player-bar-seg-fill' }),
      ]);
      // 段间空隙 2px（节点处断开）：首段 left 无偏移、末段/首段 width 各减 1px
      seg.style.left = 'calc(' + (s0 * 100).toFixed(4) + '% + ' + (i === 0 ? '0px' : '1px') + ')';
      seg.style.width = 'calc(' + ((s1 - s0) * 100).toFixed(4) + '% - ' +
        (i === 0 || i === bounds.length - 2 ? '1px' : '2px') + ')';
      segsHost.appendChild(seg);
      segs.push({
        start: s0, end: s1,
        el: seg,
        fill: seg.querySelector('.vshell-player-bar-seg-fill'),
        buffer: seg.querySelector('.vshell-player-bar-seg-buffer'),
      });
    }
    bar.__vshellSegs = segs;
    // v0.1.8 关键修复：段 DOM 重建后新 fill 初始为 0——若等下一次
    // timeupdate 再设置，会渲染一帧 0 再触发 450ms 过渡（用户实测
    // 「播放中每添加一个新节点就播一次从 0 到当前位置的动画」）。
    // 建完段**立即**同步 fill/buffer 到当前进度（同一任务内=无中间帧
    // → 浏览器捕获的初始样式即目标值 → 无过渡动画）。
    var rootEl = bar.closest('.vshell-player');
    var v = rootEl && rootEl.querySelector('video');
    if (v && v.duration && isFinite(v.duration) && v.duration > 0) {
      var bp = 0;
      if (v.buffered && v.buffered.length) {
        bp = Math.min(1, v.buffered.end(v.buffered.length - 1) / v.duration);
      }
      updateProgress(bar, v.currentTime / v.duration, bp);
    }
    // v0.5.6 第二十六/二十七轮：**重建后恢复悬停展开态**——优先用重建前
    // 读到的真实 :hover 段（hovStart），其次 mousemove 记录的 bar.__vsHoverPct；
    // 包含该比例的新段直接加 .is-hovered（首帧即 8px，无 4→8 过渡）——
    // 否则新节点确认触发整条重建时，悬停段被删掉重建、重新触发展开动画
    var hp = hovStart >= 0 ? hovStart : bar.__vsHoverPct;
    if (typeof hp === 'number' && hp >= 0) {
      for (var i = 0; i < segs.length; i++) {
        if (hp >= segs[i].start && hp <= segs[i].end) { segs[i].el.classList.add('is-hovered'); break; }
      }
    }
    // hover 命中区（透明；title 时间提示）——节点位置居中
    list.forEach(function (n) {
      var t = n.t;
      if (t <= 0 || t >= duration) return;
      var node = V.utils.el('span', {
        className: 'vshell-player-bar-node',
        title: V.utils.fmtTime(t),
      });
      node.style.left = ((t / duration) * 100).toFixed(2) + '%';
      host.appendChild(node);
    });
  }

  /** v0.5.6 第二十六轮需求 2：bar 级悬停守卫（一次性绑定）——
   *  mousemove 记录鼠标比例（供 renderNodes 重建后恢复悬停段展开态），
   *  并清理残留 .is-hovered（物理悬停段由 :hover 规则管理，is-hovered
   *  只用于重建瞬间的首帧展开）；mouseleave 清空记录 + 全部 is-hovered */
  function ensureHoverGuard(bar) {
    if (bar.__vsHoverGuard) return;
    bar.__vsHoverGuard = true;
    bar.addEventListener('mousemove', function (e) {
      var r = bar.getBoundingClientRect();
      if (!r.width) return;
      bar.__vsHoverPct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      var hs = bar.querySelectorAll('.vshell-player-bar-seg.is-hovered');
      for (var i = 0; i < hs.length; i++) hs[i].classList.remove('is-hovered');
    });
    bar.addEventListener('mouseleave', function () {
      bar.__vsHoverPct = -1;
      var hs = bar.querySelectorAll('.vshell-player-bar-seg.is-hovered');
      for (var i = 0; i < hs.length; i++) hs[i].classList.remove('is-hovered');
    });
  }

  /* ---------- 分段进度更新：updateProgress(bar, p, bp) ----------
   * p = 播放进度（0-1），bp = 缓冲末端进度（0-1，**省略则只更新 fill、
   * 不动 buffer**——timeupdate 路径不覆盖缓冲指示，buffer 仅由 progress
   * 事件驱动，避免闪烁错乱）；
   * 返回 true=已分段处理 / false=整条模式（调用方回退原逻辑） */
  function updateProgress(bar, p, bp) {
    var segs = bar && bar.__vshellSegs;
    if (!segs || !segs.length) return false;
    p = Math.max(0, Math.min(1, p));
    var updateBuf = typeof bp === 'number' && isFinite(bp);
    if (updateBuf) bp = Math.max(0, Math.min(1, bp));
    segs.forEach(function (s) {
      var f = 0;
      if (p >= s.end) f = 1;
      else if (p > s.start) f = (p - s.start) / (s.end - s.start);
      s.fill.style.width = (f * 100) + '%';
      if (updateBuf) {
        var b = 0;
        if (bp >= s.end) b = 1;
        else if (bp > s.start) b = (bp - s.start) / (s.end - s.start);
        s.buffer.style.width = (b * 100) + '%';
      }
    });
    return true;
  }

  /* 最小间隔变更监听（播放器滑块 → 页面重新约束渲染节点） */
  var gapListeners = [];
  function setMinGap(ts) {
    TS = (typeof ts === 'number' && isFinite(ts)) ? Math.max(0, ts) : 1.2;
    try { V.store.set(GAP_KEY, TS); } catch (e) { /* noop */ }
    gapListeners.forEach(function (fn) { try { fn(); } catch (e) { /* noop */ } });
    return TS;
  }
  function onGapChange(fn) {
    if (typeof fn !== 'function') return function () {};
    gapListeners.push(fn);
    return function () {
      var i = gapListeners.indexOf(fn);
      if (i >= 0) gapListeners.splice(i, 1);
    };
  }

  V.shots = {
    get: get, set: set,
    isScanned: isScanned,
    clear: function (id) { V.store.del(KEY + id); V.store.del(SCANNED_KEY + id); },
    attach: attach, scan: scan, scanRanges: scanRanges,
    renderNodes: renderNodes,
    updateProgress: updateProgress,
    /* 最小节点间隔（秒，可选；0 关闭约束）；持久化 store 'shots.gap' */
    setMinGap: setMinGap,
    getMinGap: function () { return TS; },
    onGapChange: onGapChange,
    // 测试钩子（harness 用）：算法核心直接喂帧特征
    _testIngest: function (frames) {
      var an = new Analyzer();
      frames.forEach(function (f) { an.ingest(f); });
      return an.shots.map(function (n) { return n.t; });   // 纯 t 序列（断言兼容旧版）
    },
    // 测试钩子：间隔约束+回溯（nodes: [{t,s}] 任意顺序；返回约束后 [{t,s}]）
    _testConstrain: function (nodes, ts) {
      return constrain((nodes || []).map(normShot), ts == null ? TS : ts)
        .map(function (n) { return { t: n.t, s: Math.round(n.s * 100) / 100 }; });
    },
    _testDiff: diff,
    _testThreshold: TH,
    // v0.4.2：自适应调速决策纯函数（harness 单测用）
    _rateStep: function (health, r) {
      return rateStep(health, r);
    },
  };
})();
