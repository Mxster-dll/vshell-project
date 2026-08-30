/* ============================================================
 * blacklist — 视频黑名单（用户需求 v0.3.2）
 *
 * 用户拍板：按单个视频屏蔽 + 全站过滤（主页/分类/搜索/相关推荐
 * 隐藏；已待看/收藏的保留）+ 导航栏按钮弹窗面板管理（可解除）
 *
 * 存储：store 键 'blacklist.<源>'（v0.5.6 按数据源隔离），数组
 * [{id, title, ts}]（title 供管理面板展示；ts 添加时间）
 * v0.5.7 多源（用户需求）：按源分别保存、显示时一起显示——
 *   - all() = 所有激活源并集（item 标注 sourceId）
 *   - add/remove/isBlocked 按 item.sourceId（缺省主源）
 *   - filter(items) 按每 item 的 sourceId 查对应源列表
 * 变更时 emit 'change'（面板重渲染；卡片局部移除不依赖监听）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var KEY = 'blacklist';
  var list = [];        // 并集视图 [{id, title, ts, sourceId}]
  var listeners = [];

  function srcOf(item) {
    // v0.6.1 聚合：组 id（grp:xxx）的黑名单存 'grp' 源键（组级一条）
    if (item && isGroupId(item.id)) return 'grp';
    return (item && item.sourceId) || (V.multisource ? V.multisource.primary() : 'acfun');
  }
  function sk(srcId) { return V.store.scopedKey(KEY, srcId); }
  /** v0.6.1：组 id → 'grp' 源键（查询用） */
  function sidOf(id, srcId) {
    if (isGroupId(id)) return 'grp';
    return srcId || (V.multisource ? V.multisource.primary() : 'acfun');
  }
  function isGroupId(id) {
    return typeof id === 'string' && id.indexOf('grp:') === 0;
  }
  /** 复合键（不依赖 V.multisource——本模块加载期 multisource 未就绪） */
  function ckey(srcId, id) { return String(srcId) + ':' + String(id); }

  function norm(b) {
    if (typeof b === 'string') return { id: b, title: b, ts: 0 };   // 旧格式兼容
    var o = b || {};
    return {
      id: String(o.id || ''),
      title: String(o.title || o.id || ''),
      ts: o.ts || 0,
      pic: o.pic || '',
      owner: o.owner,
      duration: o.duration || 0,
      stat: o.stat,
      tid: o.tid,
      tname: o.tname,
      pubdate: o.pubdate,
      sourceId: o.sourceId || '',
    };
  }
  function loadSrc(srcId) {
    V.store.migrateScoped(KEY, sk(srcId));   // 旧无后缀键 → 该源键（一次性）
    var out = [];
    try {
      var saved = V.store.get(sk(srcId));
      if (Array.isArray(saved)) {
        out = saved.map(norm).filter(function (b) { return b.id; });
      } else if (saved && typeof saved === 'object') {
        // v0.5.7 数据隔离审计：旧版黑名单是**对象格式** {id: {id,title,ts}}，
        // 新代码只认数组 → 数据"消失"。兼容转换（key=视频id）。
        out = Object.keys(saved).map(function (id) {
          var o = saved[id] || {};
          if (typeof o === 'string') return { id: id, title: o, ts: 0 };
          var b = norm(o);
          if (!b.id) b.id = id;
          return b;
        }).filter(function (b) { return b.id; });
      }
    } catch (e) { /* noop */ }
    return out;
  }
  function persistSrc(srcId, items) {
    try { V.store.set(sk(srcId), items); } catch (e) { /* noop */ }
  }

  /** 并集视图（显示/过滤用）；模块级缓存（变更时失效） */
  var unionCache = null;
  function unionList() {
    if (unionCache) return unionCache;
    var out = [];
    var seen = {};
    var ids = V.multisource ? V.multisource.activeSources() : ['acfun'];
    // v0.6.1 聚合：组级黑名单（blacklist.grp 键）并入并集
    var gd = V.store.get(sk('grp'));
    if (gd && gd.length) ids = ids.concat('grp');
    ids.forEach(function (id) {
      loadSrc(id).forEach(function (b) {
        if (!b.sourceId) b.sourceId = id;
        var k = ckey(id, b.id);
        if (seen[k]) return;
        seen[k] = true;
        out.push(b);
      });
    });
    unionCache = out;
    return out;
  }
  function invalidate() { unionCache = null; }

  function notify() {
    listeners.forEach(function (fn) { try { fn(unionList().slice()); } catch (e) { /* noop */ } });
  }

  list = unionList();

  /** 重新加载（数据源/激活集变化后调用） */
  function reload() {
    invalidate();
    list = unionList();
    notify();
    return list;
  }

  /** 是否被屏蔽（按源查；srcId 缺省主源） */
  function isBlocked(id, srcId) {
    if (!id) return false;
    var sid = sidOf(id, srcId);
    var l = loadSrc(sid);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return true;
    return false;
  }

  /** 添加（按 item 归属源写入，去重）；返回 true = 新增
   *  存完整 item 字段白名单（黑名单独立页的墙/刷视图需要渲染卡片） */
  function add(item) {
    var id = item && (item.id || item.bvid);
    if (!id) return false;
    var sid = srcOf(item);
    if (isBlocked(id, sid)) return false;
    var l = loadSrc(sid);
    l.unshift({
      id: id,
      title: item.title || id,
      pic: item.pic || '',
      owner: (item.owner && item.owner.name)
        ? { name: item.owner.name, face: item.owner.face || '' } : undefined,
      duration: item.duration || 0,
      stat: (item.stat && typeof item.stat.view === 'number')
        ? { view: item.stat.view, like: item.stat.like, danmaku: item.stat.danmaku } : undefined,
      tid: item.tid,
      tname: item.tname,
      pubdate: item.pubdate,
      sourceId: sid,
      ts: Date.now(),
    });
    persistSrc(sid, l);
    invalidate();
    list = unionList();
    notify();
    return true;
  }

  /** 解除（按源）；返回 true = 存在并移除 */
  function remove(id, srcId) {
    var sid = sidOf(id, srcId);
    var l = loadSrc(sid);
    for (var i = 0; i < l.length; i++) {
      if (l[i].id === id) { l.splice(i, 1); persistSrc(sid, l); invalidate(); list = unionList(); notify(); return true; }
    }
    return false;
  }

  /** 全部（并集副本，新→旧） */
  function all() { return unionList().slice(); }

  /** 过滤一批 item：剔除被屏蔽的（全站过滤钩子；按每 item 归属源查） */
  function filter(items) {
    if (!items || !items.length) return items;
    return items.filter(function (it) {
      var sid = (it && it.sourceId) || (V.multisource ? V.multisource.primary() : 'acfun');
      return !isBlocked(it && (it.id || it.bvid), sid);
    });
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

  V.blacklist = {
    reload: reload,
    isBlocked: isBlocked,
    add: add,
    remove: remove,
    list: all,
    filter: filter,
    onChange: onChange,
  };
})();
