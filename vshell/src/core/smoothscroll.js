/* ============================================================
 * smoothscroll — 视频墙平滑滚动（v0.6.74→v0.6.75 用户需求：任何
 * 视频墙都添加平滑滚动效果；经用户建议参考成熟实现，照抄 Lenis
 * （github.com/darkroomengineering/lenis）核心算法重写）
 *
 * Lenis LERP 模式（DeepWiki 确认）：
 *   value = value + (target - value) * lerp
 *   lerpFactor = 1 - (1 - lerp)^(dt / 16.6667)   // 帧率补偿
 *   velocity = delta / dt                         // 速度跟踪
 *   停止：|target - value| <= 0.5 或 velocity <= 0.001
 *
 * 特性（与 Lenis 一致的"丝滑"体验）：
 *  - 虚拟位置 s.pos：动画独立于真实 scrollTop（不受外部改动干扰），
 *    动画未跑时校准到真实位置；
 *  - 纯指数趋近、无即时跳变：快速滚动时 diff 累积大 → 每帧位移大 →
 *    视觉为连续加速的惯性滚动（无逐格跳感——v0.6.74 等效 lerp 0.34
 *    每格动画独立+50% 即时跳是"不顺滑"的根源）；
 *  - 默认 lerp = 0.1（Lenis 默认值）：停止后快速收敛，无长尾随。
 *
 * 两个入口统一走 V.smoothScroll.scrollBy：
 *  - Flutter 壳滚轮桥（scrollbridge.js 的 __VS_SCROLL__）——
 *    WebView2 composition controller 下滚轮经 Dart onPointerSignal
 *    转发，页面收不到原生 wheel，这是主通道；
 *  - 原生 wheel 事件兜底（模态框/内嵌滚动容器直接命中时）。
 *
 * 排除：修饰键（ctrl/meta/alt 缩放）、输入框/播放器内、
 * 抖音刷 feed（自带 scroll-snap，平滑会破坏吸附）。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  // Lenis 默认 0.1 对我们场景（滚轮每格 ~60px 小步）太慢（700ms/格）。
  // 0.25：单格 ~240ms 到位、前 100ms 移动 75%——跟手且连续惯性
  //（滚快时 diff 大 → 每帧位移大 → 连续加速无逐格感）
  var LERP = 0.25;

  var states = (typeof WeakMap === 'function') ? new WeakMap() : null;
  function getState(el) {
    if (states) {
      var s = states.get(el);
      if (!s) {
        s = { target: 0, pos: 0, vel: 0, raf: 0, last: 0 };
        states.set(el, s);
      }
      return s;
    }
    if (!el.__vsSmooth) el.__vsSmooth = { target: 0, pos: 0, vel: 0, raf: 0, last: 0 };
    return el.__vsSmooth;
  }
  function maxTop(el) { return Math.max(0, el.scrollHeight - el.clientHeight); }
  function clampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** Lenis damp：帧率补偿的指数趋近 */
  function damp(current, target, dt) {
    var f = 1 - Math.pow(1 - LERP, dt / 16.6667);
    return current + (target - current) * f;
  }

  function tick(el, s, now) {
    var dt = Math.min(64, Math.max(1, now - (s.last || now)));   // ms
    if (!(dt > 0)) dt = 16;   // 防御：now 缺失/NaN 时按一帧计
    s.last = now;
    var prev = s.pos;
    s.pos = damp(s.pos, s.target, dt);
    s.vel = (s.pos - prev) / dt;     // px/ms
    el.scrollTop = s.pos;
    if (Math.abs(s.target - s.pos) <= 0.5 || s.vel <= 0.001) {
      el.scrollTop = s.target;
      s.raf = 0;
      return;
    }
    s.raf = requestAnimationFrame(function (n) { tick(el, s, n); });
  }

  /** 平滑滚动：dy = 目标增量（像素）。容器不可滚/无增量返回 false。 */
  function scrollBy(el, dy) {
    if (!el || !dy || el.scrollHeight <= el.clientHeight + 1) return false;
    var s = getState(el);
    if (!s.raf) {
      // 动画未跑：以真实滚动位置为基准校准虚拟位置
      s.pos = el.scrollTop;
      s.target = el.scrollTop;
    }
    s.target = clampNum(s.target + dy, 0, maxTop(el));
    if (!s.raf) {
      var elRef = el, sRef = s;
      s.last = 0;
      s.raf = requestAnimationFrame(function (n) { tick(elRef, sRef, n); });
    }
    return true;
  }

  // 原生 wheel 兜底：沿命中元素找最近可滚容器（与 scrollbridge 同思路），
  // 排除 feed（scroll-snap）与输入/播放器；修饰键让原生（缩放等）。
  document.addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var guard = e.target && e.target.closest
      ? e.target.closest('input, textarea, select, [contenteditable], video')
      : null;
    if (guard) return;
    var el = e.target;
    while (el && el !== document.documentElement) {
      if (el.scrollHeight > el.clientHeight + 1) {
        var ov = '';
        try { ov = window.getComputedStyle(el).overflowY; } catch (err) { ov = ''; }
        if (ov === 'auto' || ov === 'scroll' || ov === 'overlay') break;
      }
      el = el.parentElement;
    }
    if (!el || el === document.documentElement) return;
    if (el.classList && el.classList.contains('vshell-feed')) return;   // 刷页 snap 原生
    var dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= el.clientHeight;
    if (Math.abs(dy) < 0.5) return;
    e.preventDefault();
    scrollBy(el, dy);
  }, true);

  V.smoothScroll = {
    scrollBy: scrollBy,
  };
})();
