/* ============================================================
 * cardsize — 视频卡片大小（v0.6.69 用户需求：设置项控制卡片大小）
 * 拖动条设置「卡片最小宽度」px，驱动 .vshell-wall 网格：
 *   grid-template-columns: repeat(auto-fill, minmax(var(--vshell-card-min), 1fr))
 * 宽度下限提高 → 列数更少、每张卡更宽；反之更窄更多列。
 * 共用 CSS 变量 --vshell-card-min（240-560px，默认 400，步进 10）。
 * 存储：store 键 'cardSize'。
 * 即时生效（grid auto-fill 随 CSS 变量变化自动重排，无需 reload）。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var KEY = 'cardSize';
  var MIN = 240, MAX = 560, DEF = 400;
  var size = DEF;
  var listeners = [];

  function clamp(v) {
    v = parseInt(v, 10);
    if (isNaN(v)) return DEF;
    return Math.min(MAX, Math.max(MIN, v));
  }

  function apply() {
    document.documentElement.style.setProperty('--vshell-card-min', size + 'px');
  }

  try {
    var saved = V.store.get(KEY);
    if (saved !== null && saved !== undefined && saved !== '') {
      size = clamp(saved);
    }
  } catch (e) { /* noop */ }
  apply();

  function persist() {
    try { V.store.set(KEY, size); } catch (e) { /* noop */ }
    listeners.forEach(function (fn) { try { fn(size); } catch (e) { /* noop */ } });
  }

  V.cardSize = {
    /** 当前卡片最小宽度 px（240-560） */
    get: function () { return size; },
    /** 重新应用当前值（app.js boot 兜底调用——确保启动后变量在位上） */
    apply: apply,
    /** 设置并持久化；同值也重应用（外部 CSS 可能已重置变量） */
    set: function (v) {
      v = clamp(v);
      if (v === size) { apply(); return; }
      size = v;
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
