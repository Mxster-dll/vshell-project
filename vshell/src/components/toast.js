/* ============================================================
 * toast — 轻提示（右下角滑入，自动消失）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var host = null;
  function ensureHost() {
    if (!host) {
      host = V.utils.el('div', { className: 'vshell-toast-host' });
      document.querySelector('.vshell-app').appendChild(host);
    }
    return host;
  }

  function show(msg, type) {
    type = type || 'info';
    var node = V.utils.el('div', { className: 'vshell-toast vshell-toast-' + type }, msg);
    ensureHost().appendChild(node);
    requestAnimationFrame(function () { node.classList.add('vshell-toast-in'); });
    setTimeout(function () {
      node.classList.remove('vshell-toast-in');
      node.classList.add('vshell-toast-out');
      setTimeout(function () { node.remove(); }, 300);
    }, 2400);
    return node;
  }

  V.toast = { show: show, info: function (m) { return show(m, 'info'); }, error: function (m) { return show(m, 'error'); }, ok: function (m) { return show(m, 'ok'); } };
})();
