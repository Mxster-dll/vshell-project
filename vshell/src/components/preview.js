/* ============================================================
 * preview — 卡片悬停预览引擎（配合 vsc-video-card 使用）
 * 行为照搬 skill 范例 examples/video-card.html 的悬停播放，但为
 * 流畅度改用「帧采样」而非真倍速（用户需求：倍速播放不必解码
 * 全部帧）：
 *   - 不调用 play()：video 保持 paused，仅由定时器 seek 到目标
 *     时间点，浏览器只解码 seek 到的帧附近 → 高倍速下不再卡顿
 *   - 采样步进 = 目标倍速 × 采样间隔：rate = min(15, max(0.1, dur/10))
 *     （播放时长 >= 10s 且 <= 15x 时速度越大越好；短视频慢放补足 10s）
 *   - seek 后手动派发 timeupdate 驱动卡片底部进度条
 *     （paused 状态下 seek 不触发原生 timeupdate）
 *   - mouseleave：停止采样、回到首帧
 *   - prefers-reduced-motion 时不自动预览
 * 实现：
 *   - 每张卡片的 <video class="vsc-video"> 由 video-card.js 创建（无 src）
 *   - 源解析：adapter.getPlayInfo(id)（wbi 签名，有缓存）；
 *     dash → V.player.buildMpd 动态 MPD → dash.js 实例（autoplay=false）；
 *     durl → 直链
 *   - 源缓存 Map（失败 60s 冷却，防 bilibili 风控 + 减少重复请求）；
 *     inflight 合并同 id 并发
 *   - gen 计数器防竞态（快速来回 hover 时丢弃过期结果）
 *   - dash 实例 per-enter 创建、leave 即 reset（防泄漏）
 *   - 卡片脱离 DOM（路由切换）自愈复位
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var srcCache = Object.create(null);   // srcId:id → { pi: playInfo|null, t: ts }
  var inflight = Object.create(null);   // srcId:id → Promise
  var gen = 0;                          // 竞态代际
  var active = null;                    // { card, item, video }
  var dashPlayer = null;
  var hlsPlayer = null;
  var watchTimer = null;

  var CACHE_TTL = 10 * 60 * 1000;       // 成功缓存 10min
  var FAIL_TTL = 60 * 1000;             // 失败冷却 60s

  function reduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** 取预览源（缓存 + 并发合并）→ Promise<playInfo|null> */
  function resolveSource(item) {
    var id = item.id;
    // v0.5.6 第十四轮需求 2：本地视频的预览源 = objectURL 直链——
    // 不经网站 adapter（getPlayInfo 对 'local:' id 必然失败 → 悬停黑屏）
    if (id && id.indexOf('local:') === 0 && V.localVideos && V.localVideos.playInfo) {
      return V.localVideos.playInfo(item).then(function (pi) {
        return pi && pi.type === 'url' && pi.url ? pi : null;
      });
    }
    // v0.6.1 多源：按卡片的 sourceId 路由到对应 adapter（不能用 current()——
    // 那是主源；角色页/收藏页的卡可能来自任意源）。缓存键加 srcId 前缀防跨源
    // 同 id 串味（acfun 与 17c 都是纯数字 id，碰撞会拿到错误 playInfo）。
    var srcId = item.sourceId || '';
    var ckey = srcId + ':' + id;
    var hit = srcCache[ckey];
    if (hit) {
      var age = Date.now() - hit.t;
      if (hit.pi || age < FAIL_TTL) return Promise.resolve(hit.pi);
    }
    if (inflight[ckey]) return inflight[ckey];
    var p = Promise.resolve()
      .then(function () {
        var a = V.siteAdapters.adapterFor(srcId);
        if (!a || typeof a.getPlayInfo !== 'function') {
          if (srcId && srcId !== 'local') return null;   // 源未激活/不存在 → 不预览
          a = V.siteAdapters.current();
        }
        return a.getPlayInfo(id);
      })
      .then(function (pi) {
        srcCache[ckey] = { pi: pi || null, t: Date.now() };
        return pi || null;
      }, function () {
        srcCache[ckey] = { pi: null, t: Date.now() };
        return null;
      })
      .then(function (pi) { delete inflight[ckey]; return pi; });
    inflight[ckey] = p;
    return p;
  }

  /** 目标倍速（用户需求：>= 10s 且 <= 15x 时速度越大越好）
   *  → rate = min(15, dur/10)：长视频最高 15x；<10s 短视频自然慢放补足 10s */
  function calcRate(video) {
    var dur = video.duration;
    return (isFinite(dur) && dur > 0)
      ? Math.min(15, Math.max(0.1, dur / 10))
      : 1;
  }

  function setState(mode, rate) {
    try { window.__VS_PREVIEW_STATE__ = { mode: mode, rate: Math.round(rate * 100) / 100 }; } catch (e) { /* debug hook */ }
  }

  /** 预览启动（用户需求：直接倍速播放——视频按 rate 倍速真播放，
   *  画面实时渲染；rate 公式 = min(15, max(0.1, dur/10))）
   *  duration 未就绪（dash MPD 异步）时等 loadedmetadata 再启动 */
  function startPreview(video) {
    var myGen = gen;
    var dur = video.duration;
    if (!isFinite(dur) || dur <= 0) {
      var onMeta = function () {
        video.removeEventListener('loadedmetadata', onMeta);
        if (myGen === gen) startPreview(video);   // 未被 leave/换卡才重启
      };
      video.addEventListener('loadedmetadata', onMeta);
      return;
    }
    var rate = calcRate(video);
    setState('play', rate);
    try { video.playbackRate = rate; } catch (e) { /* noop */ }
    video.play().catch(function () { /* 自动播放策略拒绝则保持封面（等待用户手势） */ });
  }

  /** 加载源（dash → MPD blob + dash.js autoplay=false；durl → 直链；
   *  m3u8 → hls.js）
   *  就绪后 onReady(video) 由调用方启动倍速播放 */
  function attach(video, playInfo, onReady) {
    if (!playInfo) return;
    // v0.5.6 第十四轮需求 2：本地视频直链（type:'url'，objectURL）
    if (playInfo.type === 'url' || playInfo.type === 'durl') {
      var u = playInfo.type === 'url'
        ? playInfo.url
        : (playInfo.durl && playInfo.durl[0] && (playInfo.durl[0].url || playInfo.durl[0].backup_url));
      if (!u) return;
      // v0.6.1：m3u8（HLS）不能喂给原生 <video>（会闪黑——poster 被 src 顶掉
      // 又因无法解码 HLS 而黑屏）→ 走 hls.js（与 detail player 同路径）。
      if (typeof Hls !== 'undefined' && Hls.isSupported() &&
          (/\.m3u8(\?|#|$)/i.test(u) || /^blob:/i.test(u))) {
        destroyHlsPreview();
        var hls = new Hls();
        hls.on(Hls.Events.ERROR, function (e, d) {
          if (d && d.fatal) {
            try { hls.destroy(); } catch (e2) { /* noop */ }
            if (hlsPlayer === hls) hlsPlayer = null;
            if (onReady) onReady(video, true);   // 失败回调（停止加载态）
          }
        });
        hls.loadSource(u);
        hls.attachMedia(video);   // 注意：attach 前不设 video.src
        hlsPlayer = hls;
        if (onReady) onReady(video);
        return;
      }
      video.src = u;
      video.load();
      if (onReady) onReady(video);
      return;
    }
    // DASH
    if (typeof dashjs === 'undefined') return;
    var xml = V.player.buildMpd(playInfo);
    try { window.__VS_LAST_MPD__ = xml; } catch (e) { /* debug hook */ }
    var url = URL.createObjectURL(new Blob([xml], { type: 'application/dash+xml' }));
    dashPlayer = dashjs.MediaPlayer().create();
    dashPlayer.on(dashjs.MediaPlayer.events.ERROR, function () {
      try { dashPlayer.reset(); dashPlayer = null; } catch (e) { /* noop */ }
      if (onReady) onReady(video, true);   // 失败回调（停止加载态）
    });
    // 尊重用户静音偏好：dash 初始化会把 video.muted 同步为其内部默认状态
    // （false）——先记录用户当前状态（卡片创建时 muted 属性=true；用户点过
    // 静音按钮后为 false），initialize 后恢复并同步 dash 内部
    // （用户反馈：取消静音后移出再进又变静音——根因是 dash 覆盖 muted）
    var wasMuted = video.muted;
    dashPlayer.initialize(video, url, false);
    video.muted = wasMuted;
    dashPlayer.setMute(wasMuted);
    if (onReady) onReady(video);
  }

  /** mouseenter 卡片 → 开始预览 */
  function enter(card, item) {
    if (reduceMotion()) return;           // demo：reduced-motion 不自动播放
    var video = card.querySelector('.vsc-video');
    if (!video) return;

    // 快速切换：先停掉上一张
    if (active && active.card !== card) leave(active.card);

    var myGen = ++gen;
    active = { card: card, item: item, video: video };

    video.playbackRate = 1;
    video.currentTime = 0;

    resolveSource(item).then(function (pi) {
      if (myGen !== gen) return;          // 过期（已离开/换卡）
      attach(video, pi, function (v, failed) {
        if (myGen !== gen) return;
        if (failed) { try { v.pause(); } catch (e) { /* noop */ } return; }
        startPreview(v);                  // 直接倍速播放
      });
    });
    // 卡片脱离 DOM（路由切换）自愈复位
    clearTimeout(watchTimer);
    watchTimer = setTimeout(function check() {
      if (!active) return;
      if (!active.card.isConnected) { leave(active.card); return; }
      watchTimer = setTimeout(check, 2000);
    }, 2000);
  }

  /** 销毁 hls.js 预览实例（leave/finish/reset 共用；hls 不随 src 移除释放） */
  function destroyHlsPreview() {
    if (hlsPlayer) {
      try { hlsPlayer.destroy(); } catch (e) { /* noop */ }
      hlsPlayer = null;
    }
  }

  /** mouseleave / 自愈 → 停止预览并复位 */
  function leave(card) {
    if (!active || (card && active.card !== card)) return;
    gen++;
    var video = active.video;
    active = null;
    clearTimeout(watchTimer);
    watchTimer = null;
    if (!video) return;
    try {
      video.pause();
      video.playbackRate = 1;
      video.currentTime = 0;              // 回到首帧（封面）
    } catch (e) { /* noop */ }
    if (dashPlayer) {
      try { dashPlayer.reset(); } catch (e) { /* noop */ }
      dashPlayer = null;
    }
    destroyHlsPreview();
    if (video.src) { video.removeAttribute('src'); try { video.load(); } catch (e) { /* noop */ } }
  }

  /** 播完一遍结束预览（用户需求 4/8）：画面停在最后一帧（不回封面），
   *  移除 is-previewing → 进度条消失、静音按钮下移回原位 */
  function finish(card) {
    if (!active || (card && active.card !== card)) return;
    var video = active.video;
    active = null;
    gen++;
    clearTimeout(watchTimer);
    watchTimer = null;
    if (video) {
      try { video.pause(); } catch (e) { /* noop */ }   // 不 seek 0：画面停最后一帧
    }
    if (dashPlayer) {
      try { dashPlayer.reset(); } catch (e) { /* noop */ }
      dashPlayer = null;
    }
    destroyHlsPreview();
    if (card) card.classList.remove('is-previewing');
  }

  /** 全停（页面级销毁时调用） */
  function reset() {
    if (active) leave(active.card);
    gen++;
    destroyHlsPreview();
    srcCache = Object.create(null);
  }

  V.preview = { enter: enter, leave: leave, finish: finish, reset: reset };
})();
