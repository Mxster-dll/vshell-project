/* ============================================================
 * data-source — 数据源设置（v0.5.6 用户需求：设置面板「数据源」项）
 *
 * 值 = 适配器 id（任意字符串）：
 *   <插件 id>   数据源（Flutter 添加：只记本地文件路径；切换/启动时
 *               读文件 → script 注入 → 适配器注册到 siteAdapters）
 *
 * v0.5.10 独立化：**无内置数据源**——acfun/bilibili 也作为插件文件
 * （vshell-flutter/acfun.js、bilibili.js）由用户手动添加注册；本模块
 * 不再硬编码任何源 id，isPlugin() 恒 true（全部走文件加载）。
 *
 * 持久化 'dataSource'；site-adapter.current() 按此决策。
 * ensureLoaded()：插件源的文件加载（幂等；切换与启动共用）。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};
  var KEY = 'dataSource';
  var PRIV_KEY = 'privateSources';   // {id: true}——隐私数据源标记（插件通吃）
  var cur = null;
  var loadedIds = {};   // 已注入的插件 id 集合（v0.5.7 多源：所有激活插件都要注入）
  var listeners = [];

  /** 隐私标记（v0.5.6 用户需求：每个数据源一个隐私字段；启动时若上次
   *  打开的是隐私源 → 自动切到第一个非隐私源，避免一启动就暴露） */
  function privMap() {
    var m = {};
    try { var v = V.store.get(PRIV_KEY); if (v && typeof v === 'object') m = v; } catch (e) { /* noop */ }
    return m;
  }
  function isPrivate(id) {
    if (!id) return false;
    return privMap()[id] === true;
  }
  function setPrivate(id, priv) {
    var m = privMap();
    if (priv) m[id] = true; else delete m[id];
    try { V.store.set(PRIV_KEY, m); } catch (e) { /* noop */ }
    listeners.forEach(function (fn) { try { fn(get()); } catch (e) { /* noop */ } });
    return !!priv;
  }
  /** 第一个非隐私数据源：注册表顺序（v0.5.10 独立化：无内置优先）；
   *  全隐私/空注册表 → null（调用方兜底） */
  function firstNonPrivate() {
    var srcs = [];
    try { var v = V.store.get('dataSources'); if (Array.isArray(v)) srcs = v; } catch (e) { /* noop */ }
    for (var j = 0; j < srcs.length; j++) {
      var id = srcs[j] && srcs[j].id;
      if (id && !isPrivate(id)) return id;
    }
    return null;
  }

  function get() {
    if (cur === null) {
      var v = null;
      try { v = V.store.get(KEY); } catch (e) { /* noop */ }
      // v0.5.10 独立化：无内置默认源——未配置时取注册表第一个非隐私；
      // 注册表空 → null（页面显示无数据源空态）
      cur = (typeof v === 'string' && v) ? v : firstNonPrivate();
      // 启动规避（**仅应用冷启动**——sessionStorage 为空时）：
      // 上次打开的是隐私源 → 自动切到第一个非隐私源并持久化。
      // 手动切换（set()）会写 'vshell.skipPrivCheck' 会话标记——本会话内
      // reload 不再规避（用户明确选择隐私源后切换必须生效；sessionStorage
      // 随应用进程退出清空，下次冷启动恢复规避）
      var skip = false;
      try { skip = sessionStorage.getItem('vshell.skipPrivCheck') === '1'; } catch (e) { /* noop */ }
      if (!skip && cur && isPrivate(cur)) {
        cur = firstNonPrivate();
        if (cur) { try { V.store.set(KEY, cur); } catch (e) { /* noop */ } }
      }
    }
    return cur;
  }

  function set(v) {
    var nv = (typeof v === 'string' && v) ? v : firstNonPrivate();
    var changed = nv !== get();
    cur = nv;
    loadedIds = {};   // 切换后重新加载
    try { V.store.set(KEY, nv); } catch (e) { /* noop */ }
    // 手动切换标记：本会话内跳过启动规避（隐私源切换后 reload 不被改回）
    try { sessionStorage.setItem('vshell.skipPrivCheck', '1'); } catch (e) { /* noop */ }
    if (changed) {
      // v0.5.6：数据源切换 → 各数据模块（saved/watched/blacklist/
      // characters/searchcache）reload 到新源作用域键（app.js boot 统一挂监听）
      listeners.forEach(function (fn) { try { fn(nv); } catch (e) { /* noop */ } });
    }
    return nv;
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

  /** v0.5.10 独立化：无内置数据源——所有源都是插件，恒 true。
   *  保留函数（app.js 等按 isPlugin 过滤加载路径）避免改动面扩大。 */
  function isPlugin(id) {
    return !!id;
  }

  /** 插件适配器加载：平台读本地文件 → <script> 注入执行（文件内
   *  V.siteAdapters.register 注册）。
   *  v0.5.7 多源：id 参数化——缺省用当前源；多源启动时对每个激活
   *  插件 id 各调一次（loadedIds 集合幂等）。 */
  function ensureLoaded(id) {
    id = id || get();
    if (!id || loadedIds[id]) return Promise.resolve(false);
    var p = window.__VS_PLATFORM__;
    if (!p || !p.sourceLoad) return Promise.resolve(false);
    return p.sourceLoad(id).then(function (r) {
      if (!r || !r.ok) return false;
      var s = document.createElement('script');
      s.textContent = r.code;
      document.head.appendChild(s);
      s.remove();      // 执行完即移除（适配器已注册）
      loadedIds[id] = true;
      return true;
    }).catch(function () { return false; });
  }

  V.dataSource = {
    get: get,
    set: set,
    isPlugin: isPlugin,
    ensureLoaded: ensureLoaded,
    onChange: onChange,
    isPrivate: isPrivate,               // v0.5.6：隐私标记（插件通吃）
    setPrivate: setPrivate,
    firstNonPrivate: firstNonPrivate,
  };

  // 启动恢复：上次选择的是插件源 → 自动加载对应适配器文件
  ensureLoaded();

  // Flutter VsStore 启动快照 → 补缺式同步（store.syncFromSync）：
  // 此时 data-source 已就绪（get() 惰性初始化在读键时触发）——数据源
  // 作用域键（saved/watched/blacklist/characters 系列/searchCache）补到
  // **当前源**的 scopedKey，全局设置键补原键；app.js boot 的 reload
  // 会按当前源重新读取。本地已有键不覆盖（web 运行时数据优先）。
  try {
    if (window.__VS_SYNC__ && typeof window.__VS_SYNC__ === 'object') {
      V.store.syncFromSync(window.__VS_SYNC__);
    }
  } catch (e) { /* noop */ }
})();
