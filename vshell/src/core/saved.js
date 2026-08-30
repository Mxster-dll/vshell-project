/* ============================================================
 * saved — 待看 / 收藏 数据模块
 * 持久化：分键存储 vshell.saved.<源> → { watch: [], fav: [] }
 * item 存精简元数据：{id,title,pic,duration,pubdate,owner:{name,face},
 *   stat:{view},tid,tname}（face 用于待看页头像，pubdate 用于卡片日期）
 * v0.5.7 多源（用户需求）：按源分别保存（scopedKey 已隔离）、显示时
 * 一起显示（并集）：
 *   - listWatch/listFav = 所有激活源并集（item 标注 sourceId，复合键去重）
 *   - toggleWatch/toggleFav 按 item.sourceId 写对应源键（缺省主源）
 *   - isWatch/isFav 按（源,id）查
 * 变更时 emit 'change'（watchlist 页重渲染、卡片刷新）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var KEY = 'saved'; // store 内部自动加 'vshell.' 前缀
  var MAX_WATCH = 500; // 防撑爆存储
  var MAX_FAV = 500;

  function srcOf(item) {
    // v0.6.1 聚合：组 id（grp:xxx）的收藏/待看存 'grp' 源键（组级一条）
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

  /** 单源数据（读写用） */
  function loadSrc(srcId) {
    V.store.migrateScoped(KEY, sk(srcId));   // 旧无后缀键 → 该源键（一次性）
    var raw = V.store.get(sk(srcId));
    if (raw && typeof raw === 'object' && Array.isArray(raw.watch) && Array.isArray(raw.fav)) {
      return raw;
    }
    return { watch: [], fav: [] };
  }
  function persistSrc(srcId, d) {
    V.store.set(sk(srcId), d);
  }

  /** 并集视图（显示用）：所有激活源合并（复合键去重 + sourceId 标注）。
   *  模块级缓存（toggle/reload/源变更时失效）——watchlist 渲染高频调用，
   *  避免每次读全部源的 localStorage。 */
  var unionCache = null;
  function unionData() {
    if (unionCache) return unionCache;
    var out = { watch: [], fav: [] };
    var seenW = {}, seenF = {};
    var ids = V.multisource ? V.multisource.activeSources() : ['acfun'];
    // v0.6.1 聚合：组级收藏/待看（saved.grp 键）并入并集（有数据才显示）
    var gd = V.store.get(sk('grp'));
    if (gd && ((gd.watch && gd.watch.length) || (gd.fav && gd.fav.length))) {
      ids = ids.concat('grp');
    }
    ids.forEach(function (id) {
      var d = loadSrc(id);
      d.watch.forEach(function (it) {
        if (!it) return;
        if (!it.sourceId) it.sourceId = id;
        var k = ckey(id, it.id);
        if (seenW[k]) return;
        seenW[k] = true;
        out.watch.push(it);
      });
      d.fav.forEach(function (it) {
        if (!it) return;
        if (!it.sourceId) it.sourceId = id;
        var k = ckey(id, it.id);
        if (seenF[k]) return;
        seenF[k] = true;
        out.fav.push(it);
      });
    });
    unionCache = out;
    return out;
  }
  function invalidateUnion() { unionCache = null; }

  var em = new V.utils.Emitter();
  var data = unionData();

  /** 重新加载（数据源/激活集变化后由 app.js 或 multisource.onChange 调用） */
  function reload() {
    invalidateUnion();
    data = unionData();
    V.saved.data = data;
    emit({ kind: 'source' });
    return data;
  }

  function emit(info) {
    em.emit('change', data, info || null);
  }

  function indexOf(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }

  function add(list, item, max) {
    if (indexOf(list, item.id) !== -1) return false;
    list.unshift({
      id: item.id,
      title: item.title,
      pic: item.pic,
      duration: item.duration,
      pubdate: item.pubdate || 0,   // 卡片日期
      owner: {
        name: item.owner && item.owner.name,
        face: item.owner && item.owner.face,   // 待看页头像（曾丢失导致永远 fallback）
      },
      stat: { view: item.stat && item.stat.view },
      tid: item.tid,
      tname: item.tname,
      sourceId: srcOf(item),        // v0.5.7 多源：归属源
      addedAt: Date.now(),
    });
    if (list.length > max) list.length = max;
    return true;
  }
  function remove(list, id) {
    var i = indexOf(list, id);
    if (i === -1) return false;
    list.splice(i, 1);
    return true;
  }

  V.saved = {
    data: data,
    reload: reload,
    on: function (fn) { em.on('change', fn); },

    isWatch: function (id, srcId) {
      var sid = sidOf(id, srcId);
      return indexOf(loadSrc(sid).watch, id) !== -1;
    },
    isFav: function (id, srcId) {
      var sid = sidOf(id, srcId);
      return indexOf(loadSrc(sid).fav, id) !== -1;
    },
    toggleWatch: function (item) {
      var sid = srcOf(item);
      var d = loadSrc(sid);
      if (remove(d.watch, item.id)) { persistSrc(sid, d); invalidateUnion(); data = unionData(); V.saved.data = data; emit({ id: item.id, kind: 'watch', op: 'remove', src: sid }); return false; }
      add(d.watch, item, MAX_WATCH); persistSrc(sid, d); invalidateUnion(); data = unionData(); V.saved.data = data; emit({ id: item.id, kind: 'watch', op: 'add', src: sid }); return true;
    },
    toggleFav: function (item) {
      var sid = srcOf(item);
      var d = loadSrc(sid);
      if (remove(d.fav, item.id)) { persistSrc(sid, d); invalidateUnion(); data = unionData(); V.saved.data = data; emit({ id: item.id, kind: 'fav', op: 'remove', src: sid }); return false; }
      add(d.fav, item, MAX_FAV);
      // v0.3.17：已移除「收藏自动取消待看」互斥逻辑（用户撤销 v0.3.0 需求 5）
      persistSrc(sid, d); invalidateUnion(); data = unionData(); V.saved.data = data; emit({ id: item.id, kind: 'fav', op: 'add', src: sid }); return true;
    },
    listWatch: function () { return unionData().watch; },
    listFav: function () { return unionData().fav; },

    /** 回填头像（旧数据无 face 时由 watchlist 页补拉）：
     *  在（源,表）两维找 item，更新 owner.face + persist + emit */
    setFace: function (id, face, srcId) {
      if (!face) return false;
      var hit = false;
      var sid = srcId || (V.multisource ? V.multisource.primary() : 'acfun');
      var d = loadSrc(sid);
      [d.watch, d.fav].forEach(function (list) {
        var i = indexOf(list, id);
        if (i !== -1 && !list[i].owner.face) {
          list[i].owner.face = face;
          hit = true;
        }
      });
      if (hit) { persistSrc(sid, d); data = unionData(); V.saved.data = data; emit({ id: id, kind: 'face' }); }
      return hit;
    },
  };
})();
