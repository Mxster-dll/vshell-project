/* ============================================================
 * cardgap — 卡片间距（v0.5.6 用户需求：设置面板拖动条）
 * 一个设置项同时控制两处：
 *   - 视频卡片间距（.vshell-wall gap）
 *   - 分类卡片下边距（.vshell-sections margin-bottom）
 * 共用 CSS 变量 --vshell-card-gap（0-24px，默认 6）。
 * 存储：store 键 'gridGap'（与旧 Flutter 键互通，双向桥自动同步）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var KEY = 'gridGap';
  var MIN = 0, MAX = 24, DEF = 6;
  var gap = DEF;
  var listeners = [];

  function clamp(v) {
    v = parseInt(v, 10);
    if (isNaN(v)) return DEF;
    return Math.min(MAX, Math.max(MIN, v));
  }

  function apply() {
    document.documentElement.style.setProperty('--vshell-card-gap', gap + 'px');
  }

  try {
    var saved = V.store.get(KEY);
    if (saved !== null && saved !== undefined && saved !== '') {
      gap = clamp(saved);
    }
  } catch (e) { /* noop */ }
  apply();

  function persist() {
    try { V.store.set(KEY, gap); } catch (e) { /* noop */ }
    listeners.forEach(function (fn) { try { fn(gap); } catch (e) { /* noop */ } });
  }

  V.cardGap = {
    /** 当前间距 px（0-24） */
    get: function () { return gap; },
    /** 设置并持久化；同值也重应用（外部 CSS 可能已重置变量） */
    set: function (v) {
      v = clamp(v);
      if (v === gap) { apply(); return; }
      gap = v;
      apply();
      persist();
    },
    /** 变更监听：onChange(fn) → 注销函数 */
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
  };
})();
