/* ============================================================
 * viewmode — 全局视图模式（v0.3.85，用户需求）
 * 抖音刷（feed）/ 视频墙（wall）双模式，导航栏左侧按钮切换，
 * 受影响的页面：主页 / 搜索 / 待看 / 收藏 / 黑名单
 *
 * 用户拍板：统一默认墙（所有页面默认视频墙视图）
 * 存储：store 键 'viewmode'（'feed' | 'wall'；旧 watchview 键废弃不再读取）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var KEY = 'viewmode';
  var mode = 'wall';            // 统一默认墙
  var listeners = [];

  try {
    var saved = V.store.get(KEY);
    if (saved === 'feed' || saved === 'wall') mode = saved;
  } catch (e) { /* noop */ }

  function persist() {
    try { V.store.set(KEY, mode); } catch (e) { /* noop */ }
    listeners.forEach(function (fn) { try { fn(mode); } catch (e) { /* noop */ } });
  }

  V.viewMode = {
    /** 当前模式：'feed' | 'wall' */
    get: function () { return mode; },
    set: function (m) {
      m = m === 'feed' ? 'feed' : 'wall';
      if (m === mode) return;
      mode = m;
      persist();
    },
    /** 切换并返回新模式 */
    toggle: function () {
      mode = mode === 'feed' ? 'wall' : 'feed';
      persist();
      return mode;
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
