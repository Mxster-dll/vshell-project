/* ============================================================
 * switchoverlay — 数据源切换加载遮罩（v0.5.6 用户需求：
 * "点击切换数据源后，页面显示加载动画"）
 *
 * 流程：
 *   1. settings-panel 点击切换 → show('正在切换数据源…') +
 *      sessionStorage 写切换标记 → location.reload()
 *   2. 新页面 start()（DOMContentLoaded，boot 前）检测标记 →
 *      show('正在加载数据源…')（遮罩挂 documentElement——
 *      boot 的 body.innerHTML='' 不会清掉）→ 消费标记
 *   3. boot 完成 + router.start() 首帧渲染后 hide()
 *
 * 遮罩挂 documentElement 且在 .vshell 类加在 html 之前可能先显示，
 * 颜色一律写 var(--token, fallback) 兜底。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var MARK = 'vshell.switching';
  var el = null;

  function ensure() {
    if (el && el.parentNode) return el;
    el = document.createElement('div');
    el.className = 'vshell-switch-overlay';
    var sp = document.createElement('div');
    sp.className = 'vshell-switch-spinner';
    var tx = document.createElement('div');
    tx.className = 'vshell-switch-text';
    el.appendChild(sp);
    el.appendChild(tx);
    document.documentElement.appendChild(el);
    return el;
  }

  function show(msg) {
    var e = ensure();
    var t = e.querySelector('.vshell-switch-text');
    if (t) t.textContent = msg || '正在加载…';
    e.classList.add('is-shown');
  }

  function hide() {
    if (el) el.classList.remove('is-shown');
  }

  V.switchOverlay = {
    show: show,
    hide: hide,
    MARK: MARK,
  };
})();
