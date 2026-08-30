/* ============================================================
 * source-feed — 数据源层独立预取队列（v0.6.0 用户需求：数据源隔离 +
 * 增量拉取 + 每源缓存分片）
 *
 * 用户拍板的「分级请求」双层结构的下层：**每个 feed = 一个拉取序列**
 * （一个 fetchFn + 一个缓存分片键）。主页 = 每源一个 feed（getHomeFeed）；
 * 聚合搜索 = 每（源,标签）一个 feed；角色聚合 = 每（源,关键词）一个 feed。
 *
 * 语义（用户拍板 2026-08 grilling）：
 *   - 增量拉取：每次从源**最新页（page 1）重拉**，过滤「已拿过 id」，
 *     只取净新增，凑满 batch 条净新增（默认 10）或 hasMore=false 才停。
 *     净新增按源返回顺序（页码顺序：最新在前）插入队列**头部**。
 *   - 预取阈值：队列剩余 < threshold（默认 10）→ 立刻请求补货；请求期间
 *     组合层来 take 就用已有队列顶出去。
 *   - 增量归并：新请求结果 fresh 与历史 history 按源返回顺序合并——
 *     交集项（cd）用新数据刷新字段、仅新增（ab）插最前、仅缓存（ef）不动。
 *   - 缓存分片：每源存**全部历史**（键 vshell.<cacheKey>.<srcId>），
 *     「已拿过 id」从 history 推导（不冗余单存 id 数组）。
 *   - 相对路径：源返回数据附带 baseUrl（当前域名）→ 持久化时把 pic/face
 *     相对化（去 baseUrl 前缀），加载时用 baseUrl 拼回；不提供 baseUrl 的
 *     源保持完整 URL 原样存储（向后兼容）。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var DEF_THRESHOLD = 10;
  var DEF_BATCH = 10;
  var MAX_PULL_PAGES = 8;   // 单次预取最多拉页数（防死循环）

  /**
   * create(opts) → feed 实例
   *   opts.srcId    数据源 id（标注 sourceId + 缓存分片键尾）
   *   opts.cacheKey 缓存分片 base（如 'wall.home' → 键 vshell.wall.home.<srcId>）
   *   opts.fetchFn(page) → Promise<{items, hasMore, baseUrl?}> | null（失败）
   *   opts.filter(items) → items（黑名单过滤，可选）
   *   opts.threshold 预取阈值（默认 10）
   *   opts.batch    每次凑满净新增数（默认 10）
   *   opts.onDrain() 源耗尽（hasMore=false 且队列空）回调（可选）
   *
   * feed 接口：
   *   init()        → Promise（读缓存分片 + 后台增量拉取）
   *   take()        → item | null（取队头；自动触发预取）
   *   size()        → number（待供应队列剩余）
   *   hasMore()     → bool
   *   isDone()      → bool（hasMore=false 且 size=0）
   *   ready()       → Promise<bool>（队列非空或确定无更多则 resolve true/false；
   *                    否则触发/等待预取）
   *   destroy()
   */
  function create(opts) {
    opts = opts || {};
    var srcId = String(opts.srcId || 'acfun');
    var cacheKey = opts.cacheKey || 'wall';
    var threshold = (typeof opts.threshold === 'number' && opts.threshold > 0)
      ? opts.threshold : DEF_THRESHOLD;
    var batch = (typeof opts.batch === 'number' && opts.batch > 0)
      ? opts.batch : DEF_BATCH;

    var history = [];       // 源返回顺序（最新在前），全部已拿过；持久化 + seen
    var queue = [];         // 待供应（最新在前）；take 从这里 shift
    var seenMap = {};       // id → item（全部已拿过，去重用）
    var cursor = 1;         // 下次网络页码
    var hasMore = true;
    var loading = false;
    var done = false;       // hasMore=false 且 queue 空
    var destroyed = false;
    var baseUrl = '';       // 当前域名（相对路径拼接用；随网络请求更新）
    var inflight = null;    // 在途预取 Promise（防重入）

    function cacheKeyFull() {
      try { return V.store.scopedKey(cacheKey, srcId); }
      catch (e) { return cacheKey + '.' + srcId; }
    }

    /* ---------- 相对路径 ---------- */

    /** 从 items 里自动提取「当前域名」（scheme://host 或 //host）——
     *  数据源域名会变（CDN 轮换），但相对路径不变；每次网络返回的最新
     *  域名作为 baseUrl，供缓存相对化 + 渲染拼回。显式 res.baseUrl 优先。 */
    function extractBaseUrl(items) {
      for (var i = 0; i < (items || []).length; i++) {
        var pic = items[i] && items[i].pic;
        if (pic && typeof pic === 'string') {
          var m = pic.match(/^(https?:\/\/[^\/]+|\/\/[^\/]+)/);
          if (m) return m[1];
        }
      }
      return '';
    }

    /** 完整 URL → 相对路径（仅当 pic/face 以 baseUrl 开头）；无 baseUrl 原样 */
    function toRelative(item) {
      if (!baseUrl || !item) return item;
      var out = {};
      Object.keys(item).forEach(function (k) { out[k] = item[k]; });
      if (out.pic && out.pic.indexOf(baseUrl) === 0) {
        out.pic = out.pic.slice(baseUrl.length) || '/';
      }
      if (out.owner && out.owner.face && out.owner.face.indexOf(baseUrl) === 0) {
        out.owner = { name: out.owner.name, face: out.owner.face.slice(baseUrl.length) || '/' };
      }
      return out;
    }

    /** 相对路径 → 完整 URL（/ 开头拼 baseUrl）；其余原样 */
    function toAbsolute(item) {
      if (!baseUrl || !item) return item;
      if (item.pic && item.pic.charAt(0) === '/') item.pic = baseUrl + item.pic;
      if (item.owner && item.owner.face && item.owner.face.charAt(0) === '/') {
        item.owner.face = baseUrl + item.owner.face;
      }
      return item;
    }

    /* ---------- 缓存分片 ---------- */

    function loadCache() {
      var c = null;
      try {
        V.store.migrateScoped(cacheKey, cacheKeyFull());
        c = V.store.get(cacheKeyFull());
      } catch (e) { /* noop */ }
      if (c && typeof c === 'object') {
        if (typeof c.baseUrl === 'string' && c.baseUrl) baseUrl = c.baseUrl;
        var items = Array.isArray(c.items) ? c.items : [];
        // v0.5.10：缓存加载同样应用 opts.filter（黑名单/排除词）——缓存是
        // 历史拉取结果，可能早于黑名单/排除词变更；不过滤会让被剔除的视频
        // 从缓存复活。仅过滤内存 queue，history 保留（persist 不变，改回条件即可恢复）。
        if (opts.filter) items = opts.filter(items);
        // v0.6.0 自愈：旧版加密封面缓存（pic 为 blob: 会话级 URL，重启失效）
        // 是**毒缓存**——逐条清空 pic 后这些 item 仍在 seenMap（净新增=0），
        // 增量拉取永不刷新其 pic → 封面恒黑。发现任意 blob: pic 即整片作废，
        // 强制 prefetch 重建为可持久化原始 URL。
        var poisoned = items.some(function (it) {
          return it && typeof it.pic === 'string' && it.pic.indexOf('blob:') === 0;
        });
        if (poisoned) items = [];
        history = [];
        seenMap = {};
        items.forEach(function (it) {
          if (!it || !it.id) return;
          it.sourceId = it.sourceId || srcId;   // 归属源标注（旧数据按键名归属）
          toAbsolute(it);
          seenMap[String(it.id)] = it;
          history.push(it);
        });
        if (typeof c.hasMore === 'boolean') {
          hasMore = c.hasMore;
          // v0.6.0 自愈：空 items + hasMore:false 是坏缓存——adapter 未就绪时
          // fetchFn 返回 {items:[],hasMore:false} 被误判为「源已耗尽」持久化，
          // 之后 prefetch() 因 hasMore=false 短路永不拉取 → 主页永久空态。
          // 空缓存不信任「已耗尽」，强制 hasMore=true 让 init 的 prefetch 重试。
          if (!history.length && !hasMore) hasMore = true;
        }
      }
      queue = history.slice();
      return history.length;
    }

    function persist() {
      try {
        var relItems = history.map(toRelative);
        V.store.set(cacheKeyFull(), {
          baseUrl: baseUrl,
          items: relItems,
          hasMore: hasMore,
          savedAt: Date.now(),
        });
      } catch (e) { /* quota */ }
    }

    /* ---------- 预取（增量拉取 + 归并） ---------- */

    /** 拉一页：返回是否拉到净新增；depth = 已拉页数（防死循环——源返回
     *  相同数据（分页失效）或内容恰好全 seen 时，净新增恒 0、hasMore 恒
     *  true → 无限拉页。超过 MAX_PULL_PAGES 页强制停止本轮预取）。 */
    function pullOne(depth) {
      depth = depth || 0;
      if (destroyed || done) return Promise.resolve(null);
      var fn = opts.fetchFn;
      if (typeof fn !== 'function') {
        hasMore = false;
        return Promise.resolve(null);
      }
      if (depth >= MAX_PULL_PAGES) {
        // 连续多页无净新增：保留 hasMore（下次滚动再试），强制停止
        if (depth > 0) mergeAndPersist([], []);   // 无新增也持久化 hasMore 态
        return Promise.resolve(null);
      }
      return Promise.resolve().then(function () {
        return fn(cursor);
      }).then(function (res) {
        if (destroyed || done || !res) return null;
        if (typeof res.baseUrl === 'string' && res.baseUrl) baseUrl = res.baseUrl;
        var items = opts.filter ? opts.filter(res.items || []) : (res.items || []);
        if (!baseUrl) baseUrl = extractBaseUrl(items);   // 自动提取当前域名
        var netNew = [];
        var fresh = [];
        var freshSeen = {};
        (items || []).forEach(function (it) {
          if (!it || !it.id) return;
          it.sourceId = it.sourceId || srcId;
          var k = String(it.id);
          var existed = !!seenMap[k];
          seenMap[k] = it;               // 交集 → 字段刷新（新数据覆盖旧字段）
          if (!existed) netNew.push(it); // 净新增
          if (!freshSeen[k]) { freshSeen[k] = true; fresh.push(it); }
        });
        cursor++;
        hasMore = !!res.hasMore;
        if (netNew.length >= batch || !hasMore) {
          return mergeAndPersist(netNew, fresh);
        }
        // 净新增不足 → 继续拉下一页
        return pullOne(depth + 1);
      }).catch(function () {
        // 拉取失败：cursor 不递增，保留重试（下次 take/ready 再触发）
        return null;
      });
    }

    /** 归并 fresh 到 history（源返回顺序）；netNew 插 queue 头；持久化 */
    function mergeAndPersist(netNew, fresh) {
      // history = fresh（按源返回顺序）+ history 中不在 fresh 的（按原序）
      var freshIds = {};
      fresh.forEach(function (it) { freshIds[String(it.id)] = true; });
      var newHistory = fresh.slice();
      history.forEach(function (h) {
        if (!freshIds[String(h.id)]) newHistory.push(h);
      });
      history = newHistory;
      // queue = fresh 中「净新增 或 原 queue 待供应交集」（按 fresh 序）
      //        + 原 queue 中不在 fresh 的（更旧，保持原序）
      var netNewIds = {};
      netNew.forEach(function (it) { netNewIds[String(it.id)] = true; });
      var oldQueueIds = {};
      queue.forEach(function (it) { oldQueueIds[String(it.id)] = true; });
      var newQueue = [];
      fresh.forEach(function (it) {
        var k = String(it.id);
        if (netNewIds[k] || oldQueueIds[k]) newQueue.push(it);
      });
      queue.forEach(function (it) {
        if (!freshIds[String(it.id)]) newQueue.push(it);
      });
      queue = newQueue;
      persist();
      return netNew.length > 0;
    }

    /** 预取（防重入）：凑满 batch 条净新增；返回 Promise<bool>（是否有新增） */
    function prefetch() {
      if (destroyed) return Promise.resolve(false);
      if (done || !hasMore) return Promise.resolve(false);
      if (inflight) return inflight;
      loading = true;
      inflight = pullOne().then(function (got) {
        loading = false;
        inflight = null;
        updateDone();
        if (got) { try { if (opts.onData) opts.onData(); } catch (e) { /* noop */ } }
        return !!got;
      }).catch(function () {
        loading = false;
        inflight = null;
        updateDone();
        return false;
      });
      return inflight;
    }

    function updateDone() {
      if (!hasMore && !queue.length && !loading) {
        if (!done) {
          done = true;
          try { if (opts.onDrain) opts.onDrain(); } catch (e) { /* noop */ }
        }
      }
    }

    /* ---------- 对外接口 ---------- */

    function take() {
      if (destroyed) return null;
      var it = queue.shift();
      // 队列降到阈值以下 → 立刻预取（用户：剩余 < threshold 就请求）
      if (it && queue.length < threshold && hasMore && !loading) {
        prefetch();
      }
      return it || null;
    }

    function size() { return queue.length; }

    function isDone() { return done; }

    /** 队列非空 → 立即 true；确定无更多 → false；否则触发/等待预取 */
    function ready() {
      if (destroyed) return Promise.resolve(false);
      if (queue.length) return Promise.resolve(true);
      if (done || !hasMore) return Promise.resolve(false);
      return prefetch().then(function (got) {
        return queue.length > 0;
      });
    }

    function init() {
      loadCache();
      // 冷启动：缓存立即可用；**总是**后台从最新页（cursor=1）增量拉取——
      // 捕捉源里新发布的、本地没有的视频（「下次访问新数据放前面」）。
      // 注意：不能按 queue.length < threshold 条件触发（缓存恰好 >= threshold
      // 时会跳过预取 → 既不拉新也不 persist → 分片丢失）。
      prefetch();
      return Promise.resolve(history.length);
    }

    function destroy() {
      destroyed = true;
      inflight = null;
    }

    return {
      init: init,
      take: take,
      size: size,
      hasMore: function () { return hasMore; },
      isDone: isDone,
      ready: ready,
      destroy: destroy,
    };
  }

  V.sourceFeed = { create: create };
})();
