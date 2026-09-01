/* ============================================================
 * smoothscroll — 视频墙平滑滚动（v0.6.73 用户需求：任何视频墙
 * 都添加平滑滚动效果）
 *
 * 桌面滚轮默认是行级硬跳（每格一步，不流畅）。本模块把滚动改为
 * rAF + easeOutCubic 插值：wheel 增量累积到目标值，动画帧逐步
 * 逼近（240ms 过渡），视觉上平滑跟手。
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

  var DUR = 240;   // 单次过渡时长 ms（跟手 + 平滑的折中）

  var states = (typeof WeakMap === 'function') ? new WeakMap() : null;
  function getState(el) {
    if (states) {
      var s = states.get(el);
      if (!s) {
        s = { from: 0, target: 0, start: 0, raf: 0 };
        states.set(el, s);
      }
      return s;
    }
    if (!el.__vsSmooth) el.__vsSmooth = { from: 0, target: 0, start: 0, raf: 0 };
    return el.__vsSmooth;
  }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }   // easeOutCubic
  function maxTop(el) { return Math.max(0, el.scrollHeight - el.clientHeight); }
  function clampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function step(el, s, now) {
    var t = Math.min(1, (now - s.start) / DUR);
    el.scrollTop = s.from + (s.target - s.from) * ease(t);
    if (t >= 1) {
      s.raf = 0;
    } else {
      s.raf = requestAnimationFrame(function (n) { step(el, s, n); });
    }
  }

  /** 平滑滚动：dy = 目标增量（像素）。容器不可滚/无增量返回 false。 */
  function scrollBy(el, dy) {
    if (!el || !dy || el.scrollHeight <= el.clientHeight + 1) return false;
    var s = getState(el);
    if (s.raf) {
      // 动画进行中：从当前帧位置重基，目标继续累积（滚轮连续输入跟手）
      s.from = el.scrollTop;
      s.target = clampNum(s.target + dy, 0, maxTop(el));
      s.start = performance.now();
    } else {
      s.from = el.scrollTop;
      s.target = clampNum(el.scrollTop + dy, 0, maxTop(el));
      s.start = performance.now();
      var elRef = el, sRef = s;
      s.raf = requestAnimationFrame(function (n) { step(elRef, sRef, n); });
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
