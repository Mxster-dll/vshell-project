/* ============================================================
 * multisource — 多数据源核心（v0.5.7 用户需求：多数据源同时激活）
 *
 * 语义（用户拍板）：
 *   1. 设置面板多选勾选启用源（store 'enabledSources' 数组）；启动挂载 =
 *      勾选 ∩ 非隐私；隐私源永不挂载；全部隐私/无 → 第一个非隐私源
 *      （data-source.firstNonPrivate；v0.5.10 独立化：注册表空/全隐私
 *      → 空集，不兜底内置）
 *   2. 主源 = 激活源第一个（单源时代兼容：URL 旧格式/默认回退）
 *   3. 多源墙预取倍率 k（store 'prefetchK'，默认 2.0，设置面板可调）：
 *      渲染窗口 = a*k（a = 当前视口一页可显示视频数）——只渲染窗口内
 *      的视频，余下存源队列；滚动补卡时源队列空 → 请求该源下一页。
 *   4. onChange：激活集/隐私/k 变化通知（页面重挂）。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var ENABLED_KEY = 'enabledSources';
  var K_KEY = 'prefetchK';
  var DEF_K = 2.0;
  var listeners = [];

  /** 全部候选源（v0.5.10 独立化：**无内置源**——只读注册表 dataSources；
   *  acfun/bilibili 也须由用户手动添加文件后出现） */
  function allCandidates() {
    var all = [];
    try {
      var reg = V.store.get('dataSources');
      if (Array.isArray(reg)) {
        reg.forEach(function (r) { if (r && r.id) all.push(r.id); });
      }
    } catch (e) { /* noop */ }
    return all;
  }

  /** 勾选启用集：null = 未配置（默认全部）；[] = 显式全取消（**真无数据源**，
   *  v0.5.7 用户反馈：取消所有数据源后不应再有卡片）；['a',...] = 显式列表 */
  function enabled() {
    try {
      var v = V.store.get(ENABLED_KEY);
      if (v === undefined || v === null) return null;
      return Array.isArray(v) ? v : null;
    } catch (e) { return null; }
  }
  function setEnabled(list) {
    var en = Array.isArray(list) ? list.filter(function (x) { return typeof x === 'string' && x; }) : [];
    try { V.store.set(ENABLED_KEY, en); } catch (e) { /* noop */ }
    notify();
    return en;
  }
  function isEnabled(id) {
    var en = enabled();
    return en ? en.indexOf(id) >= 0 : true;
  }

  /** 激活源集合：未配置 → 全部候选；显式全取消 → []（真无数据源，不再兜底）；
   *  勾选列表 → 候选 ∩ 勾选。
   *  隐私源（v0.5.7 用户澄清）：**仅冷启动排除**（sessionStorage 无
   *  skipPrivCheck 标记 = 进程冷启动）——启动不自动挂载隐私源；本会话用户
   *  手动勾选过隐私源（写标记）→ 不再排除（允许手动加载）。 */
  function activeSources() {
    var ds = V.dataSource;
    var isPriv = ds && typeof ds.isPrivate === 'function'
      ? function (id) { try { return ds.isPrivate(id); } catch (e) { return false; } } : function () { return false; };
    var skipPriv = false;
    try { skipPriv = sessionStorage.getItem('vshell.skipPrivCheck') === '1'; } catch (e) { /* noop */ }
    var en = enabled();
    var list;
    if (en === null) {
      list = allCandidates();
    } else if (!en.length) {
      return [];   // v0.5.7：用户显式取消全部勾选 → 真无数据源
    } else {
      list = allCandidates().filter(function (id) { return en.indexOf(id) >= 0; });
    }
    if (!skipPriv) {
      list = list.filter(function (id) { return !isPriv(id); });
      if (!list.length) {
        var fb = (ds && typeof ds.firstNonPrivate === 'function')
          ? ds.firstNonPrivate() : null;
        if (fb) list = [fb];
        // v0.5.10：注册表空/全隐私 → 保持空（真无数据源，不兜底内置）
      }
    }
    return list;
  }

  /** 主源（激活源第一个；旧链接/无源上下文回退。
   *  v0.5.10 独立化：无内置默认——空集/注册表空 → null） */
  function primary() {
    var a = activeSources();
    return a && a.length ? a[0] : null;
  }

  /** 预取倍率 k（默认 2.0） */
  function k() {
    var v = V.store.get(K_KEY);
    return (typeof v === 'number' && v > 0 && isFinite(v)) ? v : DEF_K;
  }
  function setK(v) {
    var n = (typeof v === 'number' && v > 0 && isFinite(v)) ? v : DEF_K;
    try { V.store.set(K_KEY, n); } catch (e) { /* noop */ }
    notify();
    return n;
  }

  /** 页容量 a 估算：视口高 ÷ 卡片行高 × 每行卡数（至少 4）。
   *  卡片高约 200 逻辑px；宽 <768 单列，<1440 双列，否则 3 列。 */
  function pageCapacity() {
    var vw = window.innerWidth || 1440;
    var vh = window.innerHeight || 900;
    var cols = vw < 768 ? 1 : (vw < 1440 ? 2 : 3);
    var rows = Math.max(1, Math.ceil(vh / 210));
    return Math.max(4, rows * cols);
  }

  /** 渲染窗口预算 = a*k（浮点参与计算，向上取整） */
  function windowSize() {
    return Math.max(4, Math.round(pageCapacity() * k()));
  }

  /** 复合键：源id:视频id（跨源同 id 是不同实体） */
  function key(srcId, id) {
    return String(srcId) + ':' + String(id);
  }

  /** 并集读取（v0.5.7 用户需求：待看/收藏/黑名单等按源分别保存、
   *  显示时一起显示）：遍历所有激活源的作用域键（base.<源>），合并
   *  去重（复合键），并给每个 item 标注 sourceId（归属源）。
   *  单源时行为与原 scopedKey 读取一致。 */
  function unionGet(base) {
    var out = [];
    var seen2 = {};
    var ids = activeSources();
    ids.forEach(function (id) {
      try {
        var v = V.store.get(V.store.scopedKey(base, id));
        if (Array.isArray(v)) {
          v.forEach(function (it) {
            if (!it) return;
            if (!it.sourceId) it.sourceId = id;   // 标注归属（旧数据按键名归属）
            var k2 = key(id, it.id);
            if (seen2[k2]) return;
            seen2[k2] = true;
            out.push(it);
          });
        }
      } catch (e) { /* noop */ }
    });
    return out;
  }

  /** 按归属源写入/删除（v0.5.7）：item 有 sourceId → 写该源作用域键；
   *  缺省 → 主源（兼容旧调用）。返回写入后的数组。 */
  function unionSet(base, items) {
    var bySrc = {};
    var ids = activeSources();
    ids.forEach(function (id) { bySrc[id] = []; });
    var first = ids.length ? ids[0] : null;
    (items || []).forEach(function (it) {
      var sid = (it && it.sourceId && bySrc[it.sourceId]) ? it.sourceId : first;
      if (!sid) return;   // 无激活源 → 无处可写（v0.5.10 无内置源空态）
      bySrc[sid].push(it);
    });
    ids.forEach(function (id) {
      try { V.store.set(V.store.scopedKey(base, id), bySrc[id]); } catch (e) { /* noop */ }
    });
    return items || [];
  }

  function notify() {
    // v0.5.8 用户反馈「点击数据源按钮后，设置浮窗会闪动，底下的页面也会闪动」：
    // 设置面板操作期间（勾选/删源/改 k 只改状态，退出时整页 reload 生效）
    // **不广播 onChange**——否则 app.js/home.js/searchtags.js 的数据模块
    // 重载 → characters notify → 页面重渲染闪动。一处集中抑制，全调用方生效。
    if (window.__VS_SETTINGS_OPEN__) return;
    listeners.forEach(function (f) { try { f(); } catch (e) { /* noop */ } });
  }
  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /** 注册表同步（v0.5.7）：web localStorage dataSources 是权威（activeSources
   *  用），但插件添加走 VsStore 桥（sourceAdd/sourceList）——两侧会分叉
   *  （补缺式 syncFromSync 不覆盖已有键）。启动时从桥拉 VsStore 注册表，
   *  并集合并回 web 侧（保留 web 独有项如旧测试插件），有新增 → notify。
   *  v0.5.7 修复：**web 独有项写穿回 VsStore**（__VS_STORE_BRIDGE__.push）——
   *  否则 Dart 侧 sourceList（设置面板缺行）/sourceLoad（ensureLoaded 读不到
   *  path）与 web 注册表分叉，插件源在 UI 上无法取消/重载。 */
  function refreshRegistry() {
    var p = window.__VS_PLATFORM__;
    if (!p || !p.sourceList) return Promise.resolve(false);
    return p.sourceList().then(function (list) {
      list = Array.isArray(list) ? list : [];
      var cur = [];
      try {
        var v = V.store.get('dataSources');
        if (Array.isArray(v)) cur = v;
      } catch (e) { /* noop */ }
      var byId = {};
      cur.forEach(function (s) { if (s && s.id) byId[s.id] = s; });
      var changed = false;
      list.forEach(function (s) {
        if (s && s.id && !byId[s.id]) { byId[s.id] = s; changed = true; }
      });
      var hasWebExtra = cur.some(function (s) {
        return s && s.id && !list.some(function (x) { return x && x.id === s.id; });
      });
      if (changed || hasWebExtra) {
        var merged = Object.keys(byId).map(function (id) { return byId[id]; });
        try {
          V.store.set('dataSources', merged);
          var b = window.__VS_STORE_BRIDGE__;
          if (b && b.push) b.push('dataSources', JSON.stringify(merged));
        } catch (e) { /* noop */ }
        notify();
      }
      return changed || hasWebExtra;
    }).catch(function () { return false; });
  }

  /** 激活源集合串（排序 join）——缓存键维度（v0.5.9 用户需求：搜索缓存
   *  跟着数据源走；激活集变化 → 键变化 → 旧交错缓存不命中，重新 abc 混插） */
  function activeKey() {
    try { return activeSources().slice().sort().join(','); }
    catch (e) { return ''; }
  }

  V.multisource = {
    activeSources: activeSources,
    activeKey: activeKey,             // v0.5.9：激活源集合串（缓存键维度）
    allCandidates: allCandidates,   // v0.5.7 角色页修复：全部候选源（含隐私，本地数据全量可见）
    primary: primary,
    enabled: enabled,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    k: k,
    setK: setK,
    pageCapacity: pageCapacity,
    windowSize: windowSize,
    key: key,
    unionGet: unionGet,
    unionSet: unionSet,
    refreshRegistry: refreshRegistry,
    onChange: onChange,
  };
})();
