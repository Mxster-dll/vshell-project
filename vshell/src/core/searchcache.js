/* ============================================================
 * searchcache — 搜索结果本地缓存（v0.5.6 第四轮追加，用户需求）
 *
 * 用户需求：「把所有的搜索结果都本地化存储，然后每次先显示本地
 * 内容，然后动态增量更新」
 *
 * 语义：
 *  - 缓存键 = 搜索词（搜索页 q）/ 关键词组合（聚合搜索页，
 *    kws 排序 join）/ 'role:'+角色名（角色主页聚合）
 *  - 每条 = { items:[视频元数据], pn: 已缓存到的页码, hasMore,
 *    savedAt }
 *  - set()   替换式写（新会话首页数据到达，刷新旧缓存）
 *  - append() 追加式写（加载更多，跨页按 id 去重累积）
 *  - 容量：MAX_ENTRIES 条查询（LRU 删最旧）；单条 MAX_ITEMS 上限
 *  - 存 V.store（GM/localStorage 自动适配）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var CACHE_KEY = 'searchCache';
  var MAX_ENTRIES = 24;
  var MAX_ITEMS = 200;

  /** 数据源作用域键：v0.5.6 用户需求——搜索结果缓存按数据源隔离
   *  （同一搜索词在 acfun/bilibili 结果不同，不可跨源复用） */
  function ck() { return V.store.scopedKey(CACHE_KEY); }

  function load() {
    V.store.migrateScoped(CACHE_KEY, ck());   // 旧无后缀键 → 当前源键（一次性）
    var c = {};
    try {
      var raw = V.store.get(ck());
      if (raw && typeof raw === 'object') c = raw;
    } catch (e) { /* noop */ }
    return c;
  }

  var cache = load();

  /** 重新加载当前数据源缓存（数据源切换后由 app.js 统一调用） */
  function reload() {
    cache = load();
    return cache;
  }

  function save() {
    try { V.store.set(ck(), cache); } catch (e) { /* quota */ }
  }

  /** 缓存键归一化（大小写不敏感；空白 trim） */
  function keyOf(q) {
    return String(q || '').trim().toLowerCase();
  }

  /** 读缓存：{items, pn, hasMore, savedAt} | null（空/无键 → null） */
  function get(q) {
    var e = cache[keyOf(q)];
    if (!e || !e.items || !e.items.length) return null;
    return {
      items: e.items,
      pn: e.pn || 1,
      hasMore: !!e.hasMore,
      savedAt: e.savedAt || 0,
    };
  }

  /** LRU 修剪：超过条目上限删最旧 */
  function trim() {
    var keys = Object.keys(cache);
    if (keys.length <= MAX_ENTRIES) return;
    keys.sort(function (a, b) { return (cache[a].savedAt || 0) - (cache[b].savedAt || 0); });
    keys.slice(0, keys.length - MAX_ENTRIES).forEach(function (x) { delete cache[x]; });
  }

  /** 替换式写（新会话首页数据；fresh 替换旧缓存） */
  function set(q, items, pn, hasMore) {
    var k = keyOf(q);
    if (!k) return;
    cache[k] = {
      items: (items || []).slice(0, MAX_ITEMS),
      pn: pn || 1,
      hasMore: !!hasMore,
      savedAt: Date.now(),
    };
    trim();
    save();
  }

  /** 追加式写（加载更多：旧缓存 + 新页去重累积） */
  function append(q, items, pn, hasMore) {
    var k = keyOf(q);
    if (!k) return;
    var old = get(q);
    var seen = {};
    var out = [];
    (old ? old.items : []).forEach(function (it) {
      if (it && it.id && !seen[it.id]) { seen[it.id] = true; out.push(it); }
    });
    (items || []).forEach(function (it) {
      if (!it || !it.id || seen[it.id]) return;
      seen[it.id] = true;
      out.push(it);
    });
    cache[k] = {
      items: out.slice(0, MAX_ITEMS),
      pn: pn || (old ? old.pn : 1),
      hasMore: !!hasMore,
      savedAt: Date.now(),
    };
    trim();
    save();
  }

  /** 合并首页刷新：网络首页在前 + 缓存剩余项去重追加（保留已加载的多页），
   *  返回合并后的列表并写回缓存。freshHasMore 优先网络值。
   *  v0.5.7：网络**明确返回空**（items 空且 hasMore=false，非失败）→
   *  该查询当前无内容，清缓存——否则历史缓存（如插件旧版数据）残留，
   *  主页永远显示幽灵卡（用户反馈"部分幽灵卡片，封面不显示"）。
   *  网络失败（reject）不经过本函数 → 缓存保留兜底（"先本地后增量"不变）。 */
  function refresh(q, freshItems, freshHasMore) {
    var k = keyOf(q);
    if (!k) return (freshItems || []).slice();
    if ((!freshItems || !freshItems.length) && freshHasMore === false) {
      delete cache[k];
      save();
      return [];
    }
    var old = get(q);
    var seen = {};
    var out = [];
    (freshItems || []).forEach(function (it) {
      if (!it || !it.id) return;
      if (!seen[it.id]) { seen[it.id] = true; out.push(it); }
    });
    (old ? old.items : []).forEach(function (it) {
      if (!it || !it.id || seen[it.id]) return;
      seen[it.id] = true;
      out.push(it);
    });
    var pn = old && old.pn > 1 ? old.pn : 1;
    var hasMore = typeof freshHasMore === 'boolean' ? freshHasMore : (old ? old.hasMore : false);
    cache[k] = {
      items: out.slice(0, MAX_ITEMS),
      pn: pn,
      hasMore: hasMore,
      savedAt: Date.now(),
    };
    trim();
    save();
    return out;
  }

  V.searchCache = {
    get: get,
    set: set,
    append: append,
    refresh: refresh,
    reload: reload,               // v0.5.6：数据源切换重载
  };
})();
