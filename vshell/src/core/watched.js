/* ============================================================
 * watched — 观看历史（用户需求 v0.2.0）
 *
 * 判定规则（用户拍板）：正式播放「连续满 5 秒」算看过——
 *   - 连续：play 开始累计，pause / seek（快进翻走）即中断归零
 *   - 悬停预览（preview.js）不走 player 组件，天然不误记
 *   - 判定状态机 machine(id) 独立可测（onTick 由调用方喂增量毫秒，
 *     harness 可注入模拟时间验证 5s 阈值）
 *
 * 存储：store 键 'watched' = { id: timestamp }（看过时间，毫秒）
 * 用途：视频墙卡片背景区分（看过 #181818 / 未看过 #1f1f1f）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var KEY = 'watched';
  var THRESHOLD = 5000;             // 连续播放 5 秒（用户拍板）
  var data = {};                    // { id: ts }
  var listeners = [];

  /** 数据源作用域键：v0.5.6 用户需求——观看历史按数据源隔离 */
  function sk() { return V.store.scopedKey(KEY); }

  function load() {
    V.store.migrateScoped(KEY, sk());   // 旧无后缀键 → 当前源键（一次性）
    var d = {};
    try {
      var saved = V.store.get(sk());
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) d = saved;
    } catch (e) { /* noop */ }
    return d;
  }

  data = load();

  /** 重新加载当前数据源数据（数据源切换后由 app.js 统一调用） */
  function reload() {
    data = load();
    listeners.forEach(function (fn) { try { fn(); } catch (e) { /* noop */ } });
    return data;
  }

  function persist() {
    try { V.store.set(sk(), data); } catch (e) { /* noop */ }
    listeners.forEach(function (fn) { try { fn(); } catch (e) { /* noop */ } });
  }

  /** 是否看过 */
  function isWatched(id) {
    return !!id && Object.prototype.hasOwnProperty.call(data, id);
  }

  /** 记录看过（幂等）；v0.5.6 第五轮：正式播放满 5s → 自然角色自动转手动
   *  （用户需求：悬停倍速播放不算——preview 不走 watched 路径天然豁免） */
  function mark(id) {
    if (!id) return;
    data[id] = Date.now();
    persist();
    if (V.characters && V.characters.autoToManual) {
      try { V.characters.autoToManual(id); } catch (e) { /* noop */ }
    }
  }

  /** 全部看过 id（按时间升序） */
  function list() {
    return Object.keys(data).sort(function (a, b) { return data[a] - data[b]; });
  }

  /** 清空全部（下载管理页清除按钮） */
  function clear() {
    var n = Object.keys(data).length;
    if (n) { data = {}; persist(); }
    return n;
  }

  /** 变更监听：onChange(fn) → 注销函数 */
  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /**
   * 判定状态机（连续播放满 5s → mark）：
   * machine(id) → { onPlay(), onTick(dtMs), onPause(), onSeek(), done }
   *  - onPlay：开始/恢复播放 → 归零重计（连续语义：暂停即断）
   *  - onTick(dtMs)：播放增量喂入，累计 ≥5000ms 即 mark（只一次）
   *  - onPause / onSeek：中断归零（快进翻走不算）
   */
  function machine(id) {
    var acc = 0;
    var marked = false;
    return {
      onPlay: function () { if (!marked) acc = 0; },
      onTick: function (dt) {
        if (marked || !(dt > 0)) return;
        acc += dt;
        if (acc >= THRESHOLD) { marked = true; mark(id); }
      },
      onPause: function () { if (!marked) acc = 0; },
      onSeek: function () { if (!marked) acc = 0; },
      done: function () { return marked; },
    };
  }

  V.watched = {
    THRESHOLD: THRESHOLD,
    reload: reload,
    isWatched: isWatched,
    mark: mark,
    list: list,
    clear: clear,
    onChange: onChange,
    machine: machine,
  };
})();
