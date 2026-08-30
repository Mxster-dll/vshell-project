/* ============================================================
 * theme — Dark/Light 双主题（vscode-modern-ui token）
 * 根元素 .vshell 上切换 .theme-dark / .theme-light
 * 首启跟随系统 prefers-color-scheme，手动切换持久化
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var KEY = 'theme'; // 'dark' | 'light' | 'system'

  function systemTheme() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }

  function resolve() {
    var saved = V.store.get(KEY, 'system');
    if (saved === 'dark' || saved === 'light') return saved;
    return systemTheme();
  }

  var mq = null;
  function apply() {
    var root = document.querySelector('.vshell');
    if (!root) return;
    var t = resolve();
    root.classList.remove('theme-dark', 'theme-light');
    root.classList.add(t === 'light' ? 'theme-light' : 'theme-dark');
    root.setAttribute('data-theme', t);
    // 通知播放器等组件
    document.dispatchEvent(new CustomEvent('vshell:theme', { detail: { theme: t } }));
  }

  function current() {
    return resolve();
  }

  function set(mode) {
    V.store.set(KEY, mode); // 'dark' | 'light' | 'system'
    apply();
  }

  function toggle() {
    set(current() === 'dark' ? 'light' : 'dark');
  }

  /** 监听系统主题变化（仅当设置是 system 时） */
  function watchSystem() {
    if (!window.matchMedia) return;
    mq = window.matchMedia('(prefers-color-scheme: light)');
    var handler = function () {
      if (V.store.get(KEY, 'system') === 'system') apply();
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  }

  V.theme = {
    apply: apply,
    current: current,
    set: set,
    toggle: toggle,
    watchSystem: watchSystem,
  };
})();
