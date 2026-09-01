/* ============================================================
 * smoothscroll — 视频墙平滑滚动（v0.6.73→v0.6.74 用户需求：任何
 * 视频墙都添加平滑滚动效果；v0.6.74 用户反馈「平滑效果很差，滚动
 * 哪有回弹的」→ 重写动画核心）
 *
 * 桌面滚轮默认是行级硬跳（每格一步，不流畅）。本模块把滚动改为
 * Lenis 式指数趋近（业界标准 smooth-scroll 算法）：
 *   target += dy（滚轮增量累积目标位置，clamp 到边界）
 *   current += (target - current) * (1 - e^(-dt/TAU))（帧时间无关
 *   指数衰减，TAU=60ms）
 * 特性：
 *  - 无过冲/回弹（指数趋近单调收敛，永远不越过目标）；
 *  - 连续滚轮输入自然跟手（target 持续累积，速度随输入变化）；
 *  - 停止滚动即快速收敛（3×TAU ≈ 180ms 到位，无固定时长尾随感
 *    ——v0.6.73 的 240ms easeOutCubic 每段慢启动 + 松手拖尾是
 *    「回弹/很差」的根源，已废弃）。
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

  var TAU = 38;   // 指数衰减时间常数 ms（帧时间无关：f = 1 - e^(-dt/TAU)）
                  // 38ms → 50% 在 26ms、95% 在 114ms：平滑且干脆，无拖尾
  var SNAP = 6;   // 收尾阈值 px：剩余距离小于该值直接落位（消除慢尾巴）

  var states = (typeof WeakMap === 'function') ? new WeakMap() : null;
  function getState(el) {
    if (states) {
      var s = states.get(el);
      if (!s) {
        s = { target: 0, raf: 0, last: 0 };
        states.set(el, s);
      }
      return s;
    }
    if (!el.__vsSmooth) el.__vsSmooth = { target: 0, raf: 0, last: 0 };
    return el.__vsSmooth;
  }
  function maxTop(el) { return Math.max(0, el.scrollHeight - el.clientHeight); }
  function clampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function tick(el, s, now) {
    var cur = el.scrollTop;
    var diff = s.target - cur;
    if (Math.abs(diff) < SNAP) {
      // 收尾：剩余小于阈值直接落位（消除指数衰减的慢尾巴）
      el.scrollTop = s.target;
      s.raf = 0;
      return;
    }
    var dt = Math.min(64, Math.max(1, now - (s.last || now)));
    s.last = now;
    var f = 1 - Math.exp(-dt / TAU);
    el.scrollTop = cur + diff * f;
    s.raf = requestAnimationFrame(function (n) { tick(el, s, n); });
  }

  /** 平滑滚动：dy = 目标增量（像素）。容器不可滚/无增量返回 false。 */
  function scrollBy(el, dy) {
    if (!el || !dy || el.scrollHeight <= el.clientHeight + 1) return false;
    var s = getState(el);
    if (!s.raf) s.target = el.scrollTop;
    s.target = clampNum(s.target + dy, 0, maxTop(el));
    if (!s.raf) {
      var elRef = el, sRef = s;
      s.raf = requestAnimationFrame(function () { tick(elRef, sRef); });
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
