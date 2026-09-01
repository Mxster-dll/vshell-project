/* ============================================================
 * player — 自研视频播放器（隐藏浏览器原生 UI）
 * - 无 controls 属性，全部自绘：播放/暂停、进度条(可拖拽 seek)、
 *   时间占比(当前/总)、音量、倍速、全屏（detail 启用；tiktok 禁用）
 * - 播放源：durl 直链 <video src> 或 DASH（dash.js 动态构造 MPD）
 * - 移动端：点击切换播放；控制栏自动隐藏
 * - 动画：进度条填充过渡、控制栏淡入淡出、播放按钮脉冲
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var QN_LABEL = { 16: '360P', 32: '480P', 64: '720P', 74: '720P60', 80: '1080P', 112: '1080P+', 116: '1080P60', 120: '4K', 125: 'HDR', 126: '杜比', 127: '8K' };

  /**
   * buildMpd(playInfo) → MPD XML 字符串
   * 构造 video + audio 两个 AdaptationSet（SegmentBase 单文件模式），
   * 供 dash.js 播放 bilibili DASH 源；player 与卡片悬停预览共用
   */
  function buildMpd(playInfo) {
    var d = playInfo.dash;
    var dur = Math.max(1, Math.round((playInfo.duration || 60) * 1000));
    var esc = function (s) {
      return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    };
    var parts = [];
    parts.push('<?xml version="1.0" encoding="UTF-8"?>');
    parts.push('<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" mediaPresentationDuration="PT' + (dur / 1000).toFixed(3) + 'S" minBufferTime="PT1.5S">');
    parts.push('<Period>');
    // 视频轨
    var v = d.video;
    var vInit = v.segmentBase ? v.segmentBase.Initialization || v.segmentBase.initialization : '0-1';
    var vIdx = v.segmentBase ? v.segmentBase.indexRange || v.segmentBase.index_range : '2-3';
    parts.push('<AdaptationSet mimeType="video/mp4" segmentAlignment="true">');
    parts.push('<Representation id="video" mimeType="video/mp4" codecs="' + esc(v.codecs) + '" bandwidth="' + (v.bandwidth || 800000) + '" width="' + (v.width || 1280) + '" height="' + (v.height || 720) + '">');
    parts.push('<BaseURL>' + esc(v.url) + '</BaseURL>');
    parts.push('<SegmentBase indexRange="' + esc(vIdx) + '">');
    parts.push('<Initialization range="' + esc(vInit) + '" />');
    parts.push('</SegmentBase>');
    parts.push('</Representation>');
    parts.push('</AdaptationSet>');
    // 音频轨
    var a = d.audio;
    if (a && a.url) {
      var aInit = a.segmentBase ? a.segmentBase.Initialization || a.segmentBase.initialization : '0-1';
      var aIdx = a.segmentBase ? a.segmentBase.indexRange || a.segmentBase.index_range : '2-3';
      parts.push('<AdaptationSet mimeType="audio/mp4" segmentAlignment="true">');
      parts.push('<Representation id="audio" mimeType="audio/mp4" codecs="' + esc(a.codecs) + '" bandwidth="' + (a.bandwidth || 128000) + '" audioSamplingRate="44100">');
      parts.push('<BaseURL>' + esc(a.url) + '</BaseURL>');
      parts.push('<SegmentBase indexRange="' + esc(aIdx) + '">');
      parts.push('<Initialization range="' + esc(aInit) + '" />');
      parts.push('</SegmentBase>');
      parts.push('</Representation>');
      parts.push('</AdaptationSet>');
    }
    parts.push('</Period>');
    parts.push('</MPD>');
    return parts.join('\n');
  }

  /**
   * create(opts) → player 实例
   * opts: {
   *   mutedAutoplay: bool   —— 抖音刷页：静音自动播放、无全屏按钮
   *   onPlayState: fn(playing) —— 播放状态回调（刷页联动用）
   * }
   */
  function create(opts) {
    opts = opts || {};
    var state = { playing: false, duration: 0, muted: !!opts.mutedAutoplay, rate: 1, fullscreen: false, previewUrl: '' };
    var dashPlayer = null;
    var hlsPlayer = null;   // m3u8（HLS）播放器（hls.js，全局 Hls 由 app.html 加载）

    var root = V.utils.el('div', { className: 'vshell-player' + (opts.mutedAutoplay ? ' vshell-player-muted' : '') });

    var video = V.utils.el('video', {
      className: 'vshell-player-video',
      playsinline: '',
      'x5-playsinline': '',
      webkitPlaysinline: '',
      preload: 'metadata',
      // 禁用浏览器视频浮层（Edge 快速操作 / PiP 按钮）：无原生 UI
      disablepictureinpicture: '',
      controlslist: 'nodownload noremoteplayback noplaybackrate',
    });
    // v0.2.6 加载背景用封面（用户需求：刚进入详情页时不用纯黑）：
    // video.poster 负责源加载前的标准封面；root 背景图兜底
    // （video 未渲染帧时透出，加载失败/黑帧期也可见）
    if (opts.poster) {
      video.poster = opts.poster;
      var esc = String(opts.poster).replace(/"/g, '\\"');
      root.style.backgroundImage = 'url("' + esc + '")';
      root.style.backgroundSize = 'contain';
      root.style.backgroundPosition = 'center';
      root.style.backgroundRepeat = 'no-repeat';
    }
    // 不设置 controls —— 原生 UI 全隐藏

    // 中央播放按钮
    var centerBtn = V.utils.el('button', {
      className: 'vshell-player-center codicon codicon-play',
      'aria-label': '播放/暂停',
      onclick: function () { togglePlay(); },
    });

    // 控制栏
    var controls = V.utils.el('div', { className: 'vshell-player-controls' });

    // 进度条（KKAV 风格：4px 细条 hover 8px、点击/拖动 seek、拖动期 fill 即时跟手）
    var bar = V.utils.el('div', { className: 'vshell-player-bar' }, [
      V.utils.el('div', { className: 'vshell-player-bar-buffer' }),
      V.utils.el('div', { className: 'vshell-player-bar-fill' }),
    ]);
    var barDragging = false;
    var barFill = bar.querySelector('.vshell-player-bar-fill');

    function barPct() {
      return state.duration ? (video.currentTime / state.duration) * 100 : 0;
    }
    /* 分段感知（v0.1.7）：有分镜节点时进度条是「一段一段」的——
     * shots.updateProgress 驱动段内 fill；无节点回退整条 fill */
    function setFillUI(p) {
      if (V.shots && V.shots.updateProgress && bar.__vshellSegs && bar.__vshellSegs.length) {
        V.shots.updateProgress(bar, p, null);
      } else {
        barFill.style.width = (p * 100) + '%';
      }
    }
    function updateBar() {
      setFillUI(barPct() / 100);
    }
    function bufferedPct() {
      var v = video;
      if (!v || !v.buffered || !v.buffered.length || !state.duration) return 0;
      var end = v.buffered.end(v.buffered.length - 1);
      return Math.min(1, end / state.duration);
    }
    function seekToPct(pct) {
      if (!state.duration) return;
      video.currentTime = (pct / 100) * state.duration;
    }
    bar.addEventListener('pointerdown', function (e) {
      barDragging = true;
      bar.classList.add('vshell-player-bar-dragging');
      bar.setPointerCapture(e.pointerId);
      var r = bar.getBoundingClientRect();
      seekToPct(((e.clientX - r.left) / r.width) * 100);
      setFillUI(barPct() / 100);   // 拖动即时反馈（不依赖 timeupdate；分段模式同样生效）
    });
    bar.addEventListener('pointermove', function (e) {
      if (!barDragging) return;
      var r = bar.getBoundingClientRect();
      seekToPct(((e.clientX - r.left) / r.width) * 100);
      setFillUI(barPct() / 100);   // KKAV：拖动期暂停轮询、fill 跟手
    });
    function endDrag() {
      barDragging = false;
      bar.classList.remove('vshell-player-bar-dragging');
      // v0.1.8：seek 完成前保持无过渡（用户需求：点击/拖动进度后 fill 立即
      // 到位，不出现「从 0 动画到目标」——seek 期间媒体位置短暂跳动/重置，
      // 450ms 宽度过渡会把跳动放大成整段动画；seeked 后恢复平滑推进）
      bar.classList.add('vshell-player-bar-seeking');
    }
    bar.addEventListener('pointerup', endDrag);
    bar.addEventListener('pointercancel', endDrag);
    // v0.1.8 二次修复：dash.js seek 是**分步**的（多次 seeked）——若第一次
    // seeked 就移除 seeking，后续步骤的 timeupdate 在过渡恢复后仍会
    // 「从旧值/0 动画到目标」（用户实测「播两次动画」）。方案：
    // ① 每次 seeked 先同步 fill 到目标（此时无过渡 = 直接跳变）；
    // ② seeking 延迟移除（settle 定时器）——覆盖多次 seeked 全程；
    // ③ 期间新 seek（pointerdown）重新计时，连点安全
    var seekSettleTimer = null;
    video.addEventListener('seeked', function () {
      // v0.5.6 第十四轮：预览不再 seek 主视频（独立预览 video）——
      // 主 video 的 seeked 只来自用户操作，正常更新 fill
      if (!barDragging) updateBar();
      if (seekSettleTimer) clearTimeout(seekSettleTimer);
      seekSettleTimer = setTimeout(function () {
        bar.classList.remove('vshell-player-bar-seeking');
        seekSettleTimer = null;
      }, 700);
    });

    // ===== 进度条悬停预览（v0.5.6 第十二轮需求 1） =====
    // 鼠标悬停在进度条上 → 显示「当前鼠标位置的画面」：浮层（canvas 截帧 +
    // 时间戳）跟随指针。
    // v0.5.6 第十四轮需求 1（重写）：预览画面用**独立隐藏 video**（同源
    // 直链：url 型=src；DASH 型=dash.video.url，SegmentBase 单文件可原生
    // 播放）——**主视频不暂停、不 seek，继续正常播放**；只有悬浮小窗
    // 里的画面跟随鼠标。无直链可用时浮层只显示时间戳。
    var seekPrev = null;
    var seekPrevCv = null;
    var seekPrevOn = false;
    var prevVideo = null;        // 独立预览 video（隐藏渲染，可出帧）
    var prevReady = false;       // 预览源已就绪（可 seek/截帧）
    var prevPendingT = null;     // 待 seek 目标（节流：seeked 后再追最新）
    function makeSeekPrev() {
      seekPrevCv = V.utils.el('canvas', {
        className: 'vshell-player-seekprev-canvas', width: 160, height: 90,
      });
      seekPrev = V.utils.el('div', { className: 'vshell-player-seekprev' }, [
        seekPrevCv,
        V.utils.el('span', { className: 'vshell-player-seekprev-time' }, ''),
      ]);
      root.appendChild(seekPrev);
    }
    function drawPrevFrame() {
      if (!seekPrevCv || !prevVideo) return;
      try {
        var pctx = seekPrevCv.getContext('2d');
        if (pctx) pctx.drawImage(prevVideo, 0, 0, seekPrevCv.width, seekPrevCv.height);
      } catch (e) { /* noop */ }
    }
    function ensurePrevVideo() {
      if (prevVideo && prevVideo._src === state.previewUrl) return prevVideo;
      if (prevVideo) { try { prevVideo.remove(); } catch (e) { /* noop */ } prevVideo = null; }
      if (!state.previewUrl) return null;
      prevVideo = document.createElement('video');
      prevVideo.muted = true;
      prevVideo.playsinline = '';
      prevVideo.preload = 'auto';
      // 不能 display:none（不出帧）；1px 视觉隐藏但保持渲染
      prevVideo.style.cssText = 'position:absolute;left:-9999px;top:0;width:160px;height:90px;opacity:0;pointer-events:none;';
      prevVideo._src = state.previewUrl;
      prevReady = false;
      prevVideo.addEventListener('loadeddata', function () {
        prevReady = true;
        if (prevPendingT !== null) {
          try { prevVideo.currentTime = prevPendingT; } catch (e) { /* noop */ }
        }
      });
      prevVideo.addEventListener('seeked', function () {
        drawPrevFrame();
        // 指针已移走：继续追最新目标（浏览器 seek 异步积压节流）
        if (prevPendingT !== null && Math.abs(prevVideo.currentTime - prevPendingT) > 0.05) {
          try { prevVideo.currentTime = prevPendingT; } catch (e) { /* noop */ }
        }
      });
      root.appendChild(prevVideo);
      try { prevVideo.src = state.previewUrl; prevVideo.load(); } catch (e) { /* noop */ }
      return prevVideo;
    }
    function showSeekPrev(pct) {
      if (!state.duration || state.duration <= 0) return;
      if (!seekPrev) makeSeekPrev();
      seekPrevOn = true;
      var t = (pct / 100) * state.duration;
      // 浮层水平跟随指针（半宽 = 实际宽/2 居中），贴近进度条上方；
      // v0.5.6 第十五轮需求 1：clamp 在进度条可视区内——此前
      // calc(pct% - 80px) 在进度条两端会把浮层推出播放器
      // v0.5.6 第十七轮需求 4：**clamp 用浮层实际宽度**——硬编码 168
      // （160+padding8）在 border-box 下多算了 8px → 右侧永远留 8px
      // 空隙（用户：右边距大）。先 is-on 显示再量 offsetWidth
      seekPrev.classList.add('is-on');
      try {
        var pw = seekPrev.offsetWidth || 168;
        var br = bar.getBoundingClientRect();
        var rr = root.getBoundingClientRect();
        var barLeft = br.left - rr.left;
        var x = barLeft + (pct / 100) * br.width;
        seekPrev.style.left = Math.max(barLeft, Math.min(barLeft + br.width - pw, x - pw / 2)) + 'px';
      } catch (e) {
        seekPrev.style.left = 'calc(' + pct + '% - ' + ((seekPrev.offsetWidth || 160) / 2) + 'px)';
      }
      seekPrev.querySelector('.vshell-player-seekprev-time').textContent =
        V.utils.fmtTime(t);
      var pv = ensurePrevVideo();
      if (pv) {
        prevPendingT = t;
        if (prevReady) {
          try {
            if (Math.abs(prevVideo.currentTime - t) > 0.05) prevVideo.currentTime = t;
            else drawPrevFrame();
          } catch (e) { /* noop */ }
        }
      } else {
        seekPrev.classList.add('no-frame');   // 无直链：只显示时间戳
      }
    }
    function hideSeekPrev() {
      seekPrevOn = false;
      prevPendingT = null;
      if (seekPrev) {
        seekPrev.classList.remove('is-on');
        seekPrev.classList.remove('no-frame');
      }
      // 主视频无任何操作（一直在正常播放）
      if (prevVideo) { try { prevVideo.pause(); } catch (e) { /* noop */ } }
    }
    bar.addEventListener('pointermove', function (e) {
      if (barDragging) return;   // 拖动 seek 时不预览（拖动已有即时反馈）
      var r = bar.getBoundingClientRect();
      if (!r.width) return;
      showSeekPrev(((e.clientX - r.left) / r.width) * 100);
    });
    bar.addEventListener('pointerleave', hideSeekPrev);

    // 时间显示
    var time = V.utils.el('span', { className: 'vshell-player-time' },
      '00:00 / 00:00');

    // 播放/暂停按钮
    var playBtn = V.utils.el('button', {
      className: 'vshell-player-btn codicon codicon-play',
      'aria-label': '播放/暂停',
      onclick: function () { togglePlay(); },
    });

    // 音量（muted 模式隐藏）
    var muteBtn = V.utils.el('button', {
      className: 'vshell-player-btn codicon codicon-mute',
      'aria-label': '静音切换',
      onclick: function () { toggleMute(); },
    });
    var volBar = V.utils.el('div', { className: 'vshell-player-vol' }, [
      V.utils.el('div', { className: 'vshell-player-vol-fill' }),
    ]);
    volBar.addEventListener('pointerdown', function (e) {
      var r = volBar.getBoundingClientRect();
      var v = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      video.volume = v;
      volBar.querySelector('.vshell-player-vol-fill').style.width = (v * 100) + '%';
      video.muted = false;
      updateMuteIcon();
    });

    // 倍速
    var rateBtn = V.utils.el('button', {
      className: 'vshell-player-btn vshell-player-rate',
      'aria-label': '倍速',
      textContent: '1.0x',
      onclick: function () {
        var rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
        var i = rates.indexOf(state.rate);
        state.rate = rates[(i + 1) % rates.length];
        video.playbackRate = state.rate;
        rateBtn.textContent = state.rate.toFixed(2).replace(/0$/, '') + 'x';
      },
    });

    // 分镜节点最小间隔（v0.1.6，用户需求：控制栏滑块调 t）——
    // 仅当 shots.js 存在时显示；**指数档位**（0.1s → 10min，约每档 ×1.5~2.5，
    // 最大档 10min=600s），0=关闭约束；拖动 snap 到最近档位；点击恢复默认 1.2s
    var gapWrap = null, gapBtn = null, gapBar = null, gapFill = null, offGapSelf = null;
    if (V.shots && typeof V.shots.setMinGap === 'function') {
      var GAP_STEPS = [0, 0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600]; // 秒
      function fmtGap(v) {
        if (v <= 0) return '关';
        if (v < 60) return (Math.round(v * 10) / 10) + 's';
        var m = Math.floor(v / 60), s = Math.round(v % 60);
        return s ? m + 'm' + s + 's' : m + 'm';
      }
      function stepIndex(v) {   // 最近档位（指数刻度）
        var best = 0, bd = Infinity;
        for (var i = 0; i < GAP_STEPS.length; i++) {
          var d = Math.abs(GAP_STEPS[i] - v);
          if (d < bd) { bd = d; best = i; }
        }
        return best;
      }
      function applyGap(v) {    // 精确设置（点击恢复默认 1.2 用，不 snap）
        V.shots.setMinGap(v);
        refreshGapUI(v);
      }
      function setGapByPos(x) { // 滑块位置 x∈[0,1] → 档位序号（指数档位等距分布）
        var i = Math.round(Math.max(0, Math.min(1, x)) * (GAP_STEPS.length - 1));
        applyGap(GAP_STEPS[i]);
      }
      function refreshGapUI(v) {
        if (gapBtn) gapBtn.textContent = fmtGap(v);
        if (gapFill) gapFill.style.width = (stepIndex(v) / (GAP_STEPS.length - 1) * 100) + '%';
      }
      gapBtn = V.utils.el('button', {
        className: 'vshell-player-btn vshell-player-gap-btn',
        'aria-label': '分镜节点最小间隔',
        title: '分镜节点最小间隔（指数档位 0.1s~10min）；0=关闭；点击恢复默认 1.2s，拖动滑块调节',
        textContent: fmtGap(V.shots.getMinGap()),
        onclick: function () { applyGap(1.2); },   // 点击=恢复默认
      });
      gapBar = V.utils.el('div', { className: 'vshell-player-gap-bar' }, [
        V.utils.el('div', { className: 'vshell-player-gap-fill' }),
      ]);
      gapFill = gapBar.querySelector('.vshell-player-gap-fill');
      refreshGapUI(V.shots.getMinGap());
      // 滑块拖拽（pointer capture）：按下即跳 + 拖动连续调（指数档位 snap）
      gapBar.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        gapBar.setPointerCapture(e.pointerId);
        var r = gapBar.getBoundingClientRect();
        setGapByPos((e.clientX - r.left) / r.width);
        var onMove = function (ev) {
          var rr = gapBar.getBoundingClientRect();
          setGapByPos((ev.clientX - rr.left) / rr.width);
        };
        var end = function () {
          gapBar.removeEventListener('pointermove', onMove);
          gapBar.removeEventListener('pointerup', end);
          gapBar.removeEventListener('pointercancel', end);
        };
        gapBar.addEventListener('pointermove', onMove);
        gapBar.addEventListener('pointerup', end);
        gapBar.addEventListener('pointercancel', end);
      });
      // 外部调用 setMinGap（如 harness/控制台）也同步按钮显示
      offGapSelf = V.shots.onGapChange(function () { refreshGapUI(V.shots.getMinGap()); });
      gapWrap = V.utils.el('div', { className: 'vshell-player-gap' }, [gapBtn, gapBar]);
    }

    // 全屏（详情页 + v0.5.6 第十轮需求 7：抖音刷页也提供——feedFullscreen
    // 模式下点击回调宿主（feed.js）切换 feed 全屏，本播放器不自己全屏）
    var fsBtn = null;
    if (!opts.mutedAutoplay || opts.feedFullscreen) {
      fsBtn = V.utils.el('button', {
        className: 'vshell-player-btn codicon codicon-screen-full',
        'aria-label': '全屏',
        onclick: opts.feedFullscreen
          ? function () { if (opts.onFullscreenToggle) opts.onFullscreenToggle(); }
          : function () { toggleFullscreen(); },
      });
    }

    // 装配：播放钮 + 时间（左下，学 bilibili：时间紧跟播放钮、位于左下角）
    // 音量按钮恒显示（用户需求：待看刷页也要音量钮）——muted 模式下
    // 点击静音钮 = 手势取消静音（与中心播放钮同语义）
    controls.appendChild(playBtn);
    controls.appendChild(time);
    controls.appendChild(muteBtn);
    controls.appendChild(volBar);
    controls.appendChild(rateBtn);
    if (gapWrap) controls.appendChild(gapWrap);
    if (fsBtn) controls.appendChild(fsBtn);

    // 加载态
    var loading = V.utils.el('div', { className: 'vshell-player-loading' }, [
      V.utils.el('div', { className: 'vshell-spinner' }),
    ]);

    root.appendChild(video);
    root.appendChild(centerBtn);
    root.appendChild(controls);
    root.appendChild(bar);   // 进度条：播放器底部独立覆盖条（学 bilibili 位置）
    root.appendChild(loading);

    // ============ 播放源 ============
    /** 复位倍速（每次加载新源必须是原速） */
    function resetRate() {
      state.rate = 1;
      video.playbackRate = 1;
      rateBtn.textContent = '1.0x';
    }

    function setSrc(url) {
      destroyDash();
      destroyHls();
      resetRate();
      // v0.5.6 第十四轮：记录直链供进度条预览的独立 video 使用
      state.previewUrl = url || '';
      // m3u8（HLS）：Chromium 原生 <video> 不播 → 走 hls.js（全局 Hls 已由
      // app.html 加载）。未加载/不支持 MSE 时降级原生 video（报错路径一致）。
      // blob: URL 也走 hls.js（detail.js 的 master ABR 转 blob）
      if (typeof Hls !== 'undefined' && Hls.isSupported() &&
          (/\.m3u8(\?|#|$)/i.test(url) || /^blob:/i.test(url))) {
        // 静音自动播放（抖音刷页）：muted 必须在 hls 初始化前设置
        if (opts.mutedAutoplay) video.muted = true;
        var hls = new Hls();
        hls.on(Hls.Events.ERROR, function (e, d) {
          if (d && d.fatal) {
            try { hls.destroy(); } catch (e2) { /* noop */ }
            hlsPlayer = null;
            video.removeAttribute('src');
            try { V.toast.error('播放错误：' + (d.details || 'hls error')); } catch (err) { /* noop */ }
          }
        });
        hls.on(Hls.Events.MANIFEST_PARSED, function (e, data) {
          state.duration = data.totalduration || state.duration || 0; // 清单总时长
        });
        hls.loadSource(url);
        hls.attachMedia(video);   // 注意：attach 前 video 不能设 src / 不能已绑定别的 hls
        hlsPlayer = hls;
        return;
      }
      video.src = url;
      video.load();
    }

    /** 播放 bilibili DASH：动态构造 MPD（SegmentBase 单文件模式） */
    function setDash(playInfo) {
      destroyDash();
      resetRate();
      var d = playInfo.dash;
      if (!d || !d.video) { throw new Error('DASH 源缺失'); }
      if (typeof dashjs === 'undefined') { throw new Error('dash.js 未加载'); }
      // v0.5.6 第十四轮：DASH 的 SegmentBase 单文件直链可给原生 video
      // 直接播放（预览独立 video 用；无直链则预览只显示时间戳）
      state.previewUrl = (d.video && d.video.url) || '';

      var xml = V.player.buildMpd(playInfo);
      try { window.__VS_LAST_MPD__ = xml; } catch (e) { /* debug hook */ }
      var blob = new Blob([xml], { type: 'application/dash+xml' });
      var url = URL.createObjectURL(blob);

      dashPlayer = dashjs.MediaPlayer().create();
      dashPlayer.on(dashjs.MediaPlayer.events.ERROR, function (e) {
        var msg = e && e.error && (e.error.message || e.error.code) || (e && e.message) || '未知';
        try { V.toast.error('播放错误：' + msg); } catch (err) { /* noop */ }
      });
      // 详情页：不自动播放（等用户点击播放键，规避无手势有声播放被策略拒绝）；
      // 抖音刷页：静音自动播放（策略允许）——muted 必须在 initialize 前设置，
      // dash.js autoplay 时未静音 play() 被拒会静默中止整个加载管线
      if (opts.mutedAutoplay) video.muted = true;
      dashPlayer.initialize(video, url, !!opts.mutedAutoplay);
      dashPlayer.setMute(state.muted);
      state.duration = playInfo.duration || 0;

      if (opts.mutedAutoplay) {
        dashPlayer.play();
        video.play().catch(function () { /* 自动播放策略 */ });
      }
    }

    function destroyDash() {
      if (dashPlayer) {
        try { dashPlayer.reset(); } catch (e) { /* noop */ }
        dashPlayer = null;
      }
    }

    function destroyHls() {
      if (hlsPlayer) {
        try { hlsPlayer.destroy(); } catch (e) { /* noop */ }
        hlsPlayer = null;
      }
    }

    // ============ 控制逻辑 ============
    function togglePlay() {
      if (video.paused) {
        video.play().catch(function () { /* noop */ });
      } else {
        video.pause();
      }
    }
    function toggleMute() {
      video.muted = !video.muted;
      updateMuteIcon();
    }
    function updateMuteIcon() {
      var cls = video.muted || video.volume === 0 ? 'codicon-mute' : 'codicon-unmute';
      muteBtn.className = 'vshell-player-btn codicon ' + cls;
    }
    // 全屏：直接切换，无动画（v0.2.5 回退——用户要求去除所有全屏动画效果）
    function toggleFullscreen() {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(function () { /* noop */ });
      } else {
        root.requestFullscreen().catch(function (e) {
          V.toast.error('全屏失败：' + e.message);
        });
      }
    }

    // ============ 事件 ============
    // v0.2.0 观看历史：正式播放连续满 5s → V.watched.mark（opts.watchId 传入）
    var wm = null, wLast = null;
    if (opts.watchId && V.watched && V.watched.machine) {
      wm = V.watched.machine(opts.watchId);
      video.addEventListener('play', function () {
        if (wm) { wm.onPlay(); wLast = performance.now(); }
      });
      video.addEventListener('timeupdate', function () {
        if (wm && !video.paused && wLast) {
          var n = performance.now();
          wm.onTick(n - wLast);
          wLast = n;
        }
      });
      video.addEventListener('pause', function () {
        if (wm) { wm.onPause(); wLast = null; }
      });
      video.addEventListener('seeked', function () {
        if (wm) wm.onSeek();
      });
    }
    video.addEventListener('play', function () {
      state.playing = true;
      root.classList.add('vshell-player-playing');
      centerBtn.classList.remove('vshell-player-center-show');
      playBtn.className = 'vshell-player-btn codicon codicon-debug-pause';  // codicon 0.0.46-30 无 codicon-pause，暂停图标=debug-pause
      if (opts.onPlayState) opts.onPlayState(true);
      pokeControls();            // 开始播放：显示控件（全屏/刷页按 2.5s 重新计时）
    });
    video.addEventListener('pause', function () {
      state.playing = false;
      root.classList.remove('vshell-player-playing');
      centerBtn.classList.add('vshell-player-center-show');
      playBtn.className = 'vshell-player-btn codicon codicon-play';
      if (opts.onPlayState) opts.onPlayState(false);
      clearTimeout(hideTimer);   // 暂停：取消隐藏计时（控件常驻，防旧计时器把控件藏掉）
      pokeControls();
    });
    video.addEventListener('timeupdate', function () {
      if (!barDragging) updateBar();          // KKAV：拖动期进度条跟手，暂停轮询
      time.textContent = V.utils.fmtTime(video.currentTime) + ' / ' + V.utils.fmtTime(state.duration || video.duration);
    });
    // 缓冲进度（分段模式：各段 buffer 同步；整条模式：buffer 全宽）
    video.addEventListener('progress', function () {
      if (barDragging) return;
      var bp = bufferedPct();
      if (V.shots && V.shots.updateProgress && bar.__vshellSegs && bar.__vshellSegs.length) {
        V.shots.updateProgress(bar, barPct() / 100, bp);
      } else {
        var b = bar.querySelector('.vshell-player-bar-buffer');
        if (b) b.style.width = (bp * 100) + '%';
      }
    });
    video.addEventListener('loadedmetadata', function () {
      state.duration = video.duration || state.duration;
      time.textContent = '00:00 / ' + V.utils.fmtTime(state.duration);
    });
    video.addEventListener('durationchange', function () {
      state.duration = video.duration || state.duration;
      time.textContent = V.utils.fmtTime(video.currentTime) + ' / ' + V.utils.fmtTime(state.duration);
    });
    video.addEventListener('waiting', function () { root.classList.add('vshell-player-buffering'); });
    video.addEventListener('playing', function () { root.classList.remove('vshell-player-buffering'); });
    // v0.1.8 bug 修复：加载动画期间点击暂停 → 视频停在 paused，playing 永不
    // 触发 → 加载动画残留。加载完成（canplay）清除；主动暂停**仅在数据已
    // 就绪时**（readyState>=2 有当前帧）清除——加载中暂停仍保留加载动画
    // （用户实测：加载中暂停后动画消失、再点播放又出现 = 状态来回跳）
    video.addEventListener('canplay', function () { root.classList.remove('vshell-player-buffering'); });
    video.addEventListener('pause', function () {
      if (video.readyState >= 2) root.classList.remove('vshell-player-buffering');
    });
    video.addEventListener('error', function () {
      root.classList.remove('vshell-player-buffering');
      V.toast.error('视频加载失败');
    });

    // 控制栏显示：详情页常驻（用户需求：控件始终可见）；
    // 刷页（mutedAutoplay）+ 全屏：播放中 0.7s 无操作自动隐藏，
    // 鼠标移动/悬停进入立即出现（用户需求：动鼠标就出现）
    // v0.5.6 第十二轮需求 7：全屏态也按正常节奏隐藏（用户澄清——
    // 「抖音刷全屏后控件不隐藏」是问题不是需求，控件应与其他部分
    // 一样正常 700ms 隐藏；原 controlsLock 豁免已移除）
    var hideTimer = null;
    function pokeControls() {
      root.classList.add('vshell-player-controls-visible');
      clearTimeout(hideTimer);
      if (state.playing && !barDragging && (opts.mutedAutoplay || state.fullscreen)) {
        hideTimer = setTimeout(function () {
          peekAt(lastPX, lastPY);   // v0.5.4：隐藏前保留悬停的控件（只隐藏其他）
          root.classList.remove('vshell-player-controls-visible');
        }, 700);
      }
    }
    root.addEventListener('pointermove', pokeControls);
    root.addEventListener('mouseenter', pokeControls);   // 全屏下鼠标从边缘进入 root 区域也立即出现
    root.addEventListener('pointerdown', function (e) {
      if (e.target === root || e.target === video) {
        if (opts.tapToggle) togglePlay();
        pokeControls();
      }
    });

    // v0.5.4 用户需求：自动隐藏时，悬停在任意控件上 → 只隐藏其他控件、
    // 当前悬停的控件不隐藏。实现 = 隐藏前检查（A 方案）：mousemove 记录
    // 最后坐标；hideTimer 到点先 peekAt(最后坐标) 给命中的直接子控件加
    // .is-peeked，再移除 controls-visible（CSS：隐藏态子控件 opacity 0，
    // .is-peeked 唯一显示）。mousemove 本身触发 pokeControls 恢复全部，
    // 故不做隐藏态动态 peek（B 方案无效）。
    // 进度条 bar 是 root 直接子元素不参与（v0.3.95 用户要求进度条不隐藏）。
    var lastPX = -1, lastPY = -1;
    function clearPeek() {
      controls.querySelectorAll('.is-peeked').forEach(function (x) { x.classList.remove('is-peeked'); });
    }
    function peekAt(x, y) {
      clearPeek();
      var kids = controls.children;
      for (var i = 0; i < kids.length; i++) {
        var r = kids[i].getBoundingClientRect();
        if (r.width && r.height && x >= r.left && x <= r.right &&
            y >= r.top && y <= r.bottom) { kids[i].classList.add('is-peeked'); break; }
      }
    }
    root.addEventListener('mousemove', function (e) { lastPX = e.clientX; lastPY = e.clientY; });
    root.addEventListener('mouseleave', clearPeek);

    // 全屏状态同步：进入/退出全屏立即显示控件（进入后按 2.5s 重新计时隐藏）
    // v0.5.6 第十轮：feedFullscreen 模式（抖音刷）——全屏由 feed.js 管理
    // （feed 容器全屏，滚动/控件策略与详情页不同），播放器不认该全屏态
    // （否则每个 slide 的播放器 root 都会被标记 .vshell-player-fullscreen
    // 铺满 slide）；控件隐藏与 feed 全屏无关——正常 700ms 隐藏节奏
    document.addEventListener('fullscreenchange', function () {
      if (opts.feedFullscreen) return;
      state.fullscreen = !!document.fullscreenElement;
      root.classList.toggle('vshell-player-fullscreen', state.fullscreen);
      // 移动端：全屏时隐藏底部工具条（responsive.css .vshell-fs）
      document.documentElement.classList.toggle('vshell-fs', state.fullscreen);
      if (fsBtn) fsBtn.className = 'vshell-player-btn codicon ' + (state.fullscreen ? 'codicon-screen-normal' : 'codicon-screen-full');
      pokeControls();
    });

    // 初始
    video.muted = state.muted;
    video.volume = 0.8;
    updateMuteIcon();
    centerBtn.classList.add('vshell-player-center-show');
    root.classList.add('vshell-player-controls-visible');
    // 点击视频：恢复有声 + 播放/暂停（详情页/抖音页一致；自动播放被
    // 浏览器策略静音兜底后，首次手势应恢复声音——用户需求：不默认静音）
    video.addEventListener('click', function () {
      if (video.muted) {
        video.muted = false;
        updateMuteIcon();
      }
      togglePlay();
    });

    // ============ 实例 API ============
    return {
      root: root,
      video: video,
      load: function (src) { setSrc(src); },
      loadDash: function (playInfo) { setDash(playInfo); },
      play: function () {
        // 有声优先：静音只是无手势自动播放被拒时的兜底（用户需求）
        if (video.muted) {
          video.muted = false;
          updateMuteIcon();
        }
        video.play().catch(function () {
          // 无手势有声播放被浏览器拒绝 → 静音重播兜底
          video.muted = true;
          updateMuteIcon();
          video.play().catch(function () { /* noop */ });
        });
      },
      pause: function () { video.pause(); },
      stop: function () { video.pause(); video.removeAttribute('src'); video.load(); destroyDash(); destroyHls(); },
      get playing() { return state.playing; },
      // v0.6.97 悬停预览（独立隐藏 video）实际加载的缓冲区间——供时间轴缓存条合并
      getPrevBuffered: function () {
        if (!prevVideo || !prevVideo.buffered || !prevVideo.buffered.length) return [];
        var out = [];
        for (var i = 0; i < prevVideo.buffered.length; i++) {
          try { out.push({ s: prevVideo.buffered.start(i), e: prevVideo.buffered.end(i) }); } catch (e) { /* noop */ }
        }
        return out;
      },
      // v0.6.96 进度条悬停通知（非拖动）：cb(pct) 0-100 / 移出 cb(null)
      onBarHover: function (cb) {
        var cur = null;
        bar.addEventListener('pointermove', function (e) {
          if (barDragging) return;
          var r = bar.getBoundingClientRect();
          if (!r.width) return;
          var pct = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
          if (pct !== cur) { cur = pct; if (cb) cb(pct); }
        });
        bar.addEventListener('pointerleave', function () {
          if (cur !== null) { cur = null; if (cb) cb(null); }
        });
      },
      destroy: function () {
        hideSeekPrev();
        if (prevVideo) { try { prevVideo.remove(); } catch (e) { /* noop */ } prevVideo = null; }
        if (seekSettleTimer) { clearTimeout(seekSettleTimer); seekSettleTimer = null; }
        if (offGapSelf) { try { offGapSelf(); } catch (e) {} offGapSelf = null; }
        destroyDash();
        destroyHls();
        video.pause();
        video.removeAttribute('src');
        video.load();
        root.remove();
      },
    };
  }

  V.player = { create: create, buildMpd: buildMpd, QN_LABEL: QN_LABEL };
})();
