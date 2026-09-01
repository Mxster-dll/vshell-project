/* ============================================================
 * smoothscroll — 视频墙平滑滚动（v0.6.81 忠实移植 Lenis）
 *
 * 用户反复反馈弹簧-阻尼方案（v0.6.76-80：STIFF/DAMP/jerk/MAXV 四个
 * 机制叠加）行为"很奇怪"——最终按用户要求直接读 Lenis 2.x 完整源码
 * （github.com/darkroomengineering/lenis，packages/core/src/lenis.ts
 * + animate.ts + maths.ts）移植其核心算法：
 *
 *   // lenis raf（每帧）：
 *   this.animate.advance(deltaTime * 0.001)   // deltaTime 秒
 *   // animate.ts（lerp 模式）：
 *   this.value = damp(this.value, this.to, this.lerp * 60, deltaTime)
 *   if (Math.round(this.value) === Math.round(this.to)) { 完成 }
 *   // maths.ts damp（帧率补偿指数趋近）：
 *   value = current + (target - current) * (1 - (1 - lerp)^(dt*60))
 *
 * 特性（Lenis 原生，天然满足用户语义）：
 *  - 滚轮（scrollBy）只改 target（"鼠标滚轮每次滚动只会影响目标位置"）；
 *  - 速度 = 剩余距离 × lerp——目标变化时速度平滑调整，无加速度累积
 *    （不会"突然加速"）、无过冲、无振荡（"速度平滑变化"）；
 *  - 像素级取整停止：无亚像素尾巴（不拖泥带水）；
 *  - 追加输入（滚动中再滚）时速度跳变 = lerp × diff跳变，lerp 小
 *    则跳变小，视觉平滑（无需 jerk 限制）。
 *
 * 两个入口统一走 V.smoothScroll.scrollBy：
 *  - Flutter 壳滚轮桥（scrollbridge.js 的 __VS_SCROLL__）——主通道；
 *  - 原生 wheel 事件兜底（模态框/内嵌滚动容器直接命中时，同时设置
 *    __VS_USER_SCROLLING__ 用户滚动标记防 scroll guard 误拉回）。
 *
 * 排除：修饰键（ctrl/meta/alt 缩放）、输入框/播放器内、
 * 抖音刷 feed（自带 scroll-snap，平滑会破坏吸附）。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  // Lenis 默认 lerp=0.1（丝滑）；我们滚轮每格 ~60px 小步，取 0.12 略快
  // 仍保持"稳"（追加输入速度跳变小）。可 0.08-0.2 微调手感。
  var LERP = 0.12;

  var states = (typeof WeakMap === 'function') ? new WeakMap() : null;
  function getState(el) {
    if (states) {
      var s = states.get(el);
      if (!s) {
        s = { target: 0, pos: 0, raf: 0, last: 0 };
        states.set(el, s);
      }
      return s;
    }
    if (!el.__vsSmooth) el.__vsSmooth = { target: 0, pos: 0, raf: 0, last: 0 };
    return el.__vsSmooth;
  }
  function maxTop(el) { return Math.max(0, el.scrollHeight - el.clientHeight); }
  function clampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** Lenis maths.damp：帧率补偿指数趋近（dt 秒，60 帧基准） */
  function damp(current, target, lerp, dtS) {
    var f = 1 - Math.pow(1 - lerp, dtS * 60);
    return current + (target - current) * f;
  }

  function tick(el, s, now) {
    var dt;
    if (!s.last) { s.last = now; dt = 16; }   // 首帧：按一帧计
    else { dt = Math.min(64, Math.max(1, now - s.last)); }
    if (!(dt > 0)) dt = 16;   // 防御：now 缺失/NaN 时按一帧计
    s.last = now;
    s.pos = damp(s.pos, s.target, LERP, dt / 1000);
    el.scrollTop = s.pos;
    // Lenis 停止条件：像素级取整相等即完成（无亚像素尾巴）
    if (Math.round(s.pos) === Math.round(s.target)) {
      el.scrollTop = s.target;
      s.raf = 0;
      return;
    }
    s.raf = requestAnimationFrame(function (n) { tick(el, s, n); });
  }

  /** 平滑滚动：dy = 目标增量（像素）。容器不可滚/无增量返回 false。
   *  滚轮只影响 target（用户语义）；动画未跑时校准虚拟位置到真实位置。 */
  function scrollBy(el, dy) {
    if (!el || !dy || el.scrollHeight <= el.clientHeight + 1) return false;
    var s = getState(el);
    if (!s.raf) {
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
    // 原生 wheel = 用户滚动（scroll guard 豁免标记）
    window.__VS_USER_SCROLLING__ = true;
    e.preventDefault();
    scrollBy(el, dy);
  }, true);

  V.smoothScroll = {
    scrollBy: scrollBy,
  };
})();
