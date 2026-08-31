/* ============================================================
 * videotable — 每源视频 id 表（v0.6.23 grilling 定稿）
 *
 * 用户拍板（以 id 为核心的机制）：
 *   - 每源一表：vshell.videos.<srcId>，内容 {裸id: 条目}
 *   - 条目字段：title / cover / view / danmaku / pubdate / duration /
 *     owner{name,face} / desc(简介，仅详情写入) / firstDetailAt(首次详情标记)
 *   - 写规则：
 *       · 预览（feed 拉取/卡片渲染）upsert——**stat 无条件更新**（播放量是
 *         动态数据，任何渠道加载到都要更新）；**静态字段仅首次有效写**
 *         （空标题/占位封面不写，等下次有效数据；已有值不再被预览覆盖）
 *       · 详情加载完成 → **全量覆盖**（标题/封面/时长/UP/简介——详情永远
 *         最准，能自愈首次预览写入的坏数据）+ 打 firstDetailAt
 *   - 读规则：详情页占位统一读表（表无则骨架）；**读限启用源**——未启用
 *     源的 id 即使表里有也不用于占位（与「数据源未启用」空态一致）
 *   - 表**永不清理**（懒写入，只存被加载过的 id；组 id / 本地视频不落表）
 *   - 存可持久化 pic/face（相对路径/加密 URL——**不存 blob 会话 URL**）；
 *     占位渲染时走 V.aggregations.picUrlOf 拼当前 baseUrl + 解密
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var KEY = 'videos';
  var mem = {};         // srcId → { id → entry }
  var loaded = {};      // srcId → bool（已从 localStorage 读）
  var dirtySrcs = {};   // srcId → true（待落盘）
  var persistTimer = null;

  function fullKey(srcId) {
    try { return V.store.scopedKey(KEY, srcId); }
    catch (e) { return KEY + '.' + srcId; }
  }

  function table(srcId) {
    if (!loaded[srcId]) {
      var m = null;
      try { m = V.store.get(fullKey(srcId)); } catch (e) { /* noop */ }
      mem[srcId] = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
      loaded[srcId] = true;
    }
    return mem[srcId];
  }

  /** 批量落盘（防抖：合并同 tick 的多次写入） */
  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(function () {
      persistTimer = null;
      var srcs = Object.keys(dirtySrcs);
      dirtySrcs = {};
      srcs.forEach(function (srcId) {
        try { V.store.set(fullKey(srcId), mem[srcId] || {}); } catch (e) { /* quota */ }
      });
    }, 0);
  }

  function isValidTitle(t) {
    return typeof t === 'string' && t.trim().length > 0;
  }
  function isValidPic(p) {
    return typeof p === 'string' && p.length > 0 && p.indexOf('blob:') !== 0;
  }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : undefined; }

  /** 预览 upsert：stat 无条件覆盖；静态字段仅首次有效写（已有值不覆盖） */
  function upsert(srcId, item) {
    if (!item || !item.id) return;
    var t = table(srcId);
    var id = String(item.id);
    var e = t[id] || {};
    // 动态字段：无条件更新
    var st = item.stat;
    if (st && typeof st === 'object') {
      var vv = num(st.view); if (vv !== undefined) e.view = vv;
      var dd = num(st.danmaku); if (dd !== undefined) e.danmaku = dd;
    }
    // 静态字段：仅首次有效写（详情 touchDetail 走全量覆盖，不受此限）
    if (e.title === undefined && isValidTitle(item.title)) e.title = item.title;
    if (e.cover === undefined && isValidPic(item.pic)) e.cover = item.pic;
    if (e.cover === undefined && isValidPic(item.cover)) e.cover = item.cover;
    if (e.pubdate === undefined && num(item.pubdate) !== undefined) e.pubdate = item.pubdate;
    if (e.duration === undefined && num(item.duration) !== undefined) e.duration = item.duration;
    if (e.owner === undefined && item.owner && isValidTitle(item.owner.name)) {
      e.owner = { name: item.owner.name, face: isValidPic(item.owner.face) ? item.owner.face : '' };
    }
    t[id] = e;
    dirtySrcs[srcId] = true;
    schedulePersist();
  }

  /** 批量 upsert（feed 拉取后调用） */
  function upsertBatch(srcId, items) {
    if (!items || !items.length) return;
    var any = false;
    (items || []).forEach(function (it) {
      if (it && it.id) { upsert(srcId, it); any = true; }
    });
    return any;
  }

  /** 详情加载完成：全量覆盖（标题/封面/时长/UP/简介 + firstDetailAt） */
  function touchDetail(srcId, id, detail) {
    if (!detail || typeof detail !== 'object') return;
    var t = table(srcId);
    var e = t[String(id)] || {};
    if (isValidTitle(detail.title)) e.title = detail.title;
    if (isValidPic(detail.pic)) e.cover = detail.pic;
    if (num(detail.pubdate) !== undefined) e.pubdate = detail.pubdate;
    if (num(detail.duration) !== undefined) e.duration = detail.duration;
    if (detail.owner && isValidTitle(detail.owner.name)) {
      e.owner = { name: detail.owner.name, face: isValidPic(detail.owner.face) ? detail.owner.face : '' };
    }
    if (typeof detail.desc === 'string' && detail.desc.trim().length > 0) e.desc = detail.desc;
    if (detail.stat && typeof detail.stat === 'object') {
      var vv = num(detail.stat.view); if (vv !== undefined) e.view = vv;
      var dd = num(detail.stat.danmaku); if (dd !== undefined) e.danmaku = dd;
    }
    e.firstDetailAt = Date.now();
    t[String(id)] = e;
    dirtySrcs[srcId] = true;
    schedulePersist();
  }

  /** 读表（不落盘）：返回条目或 null */
  function get(srcId, id) {
    if (!id) return null;
    var t = table(srcId);
    var e = t[String(id)];
    return e ? e : null;
  }

  /** 详情占位查询：读限启用源（未启用源 → null）；返回 {title,pic,view,
   *  danmaku,pubdate,duration,owner} 或 null（表无条目） */
  function queryDetail(srcId, id) {
    if (srcId === 'local') return null;
    var act = [];
    try { act = V.multisource.activeSources(); } catch (e) { /* noop */ }
    if (act.indexOf(srcId) < 0) return null;   // 读限启用源
    var e = get(srcId, id);
    if (!e) return null;
    return {
      title: e.title || '',
      pic: e.cover || '',
      view: e.view,
      danmaku: e.danmaku,
      pubdate: e.pubdate,
      duration: e.duration,
      owner: e.owner || null,
    };
  }

  V.videoTable = {
    upsert: upsert,
    upsertBatch: upsertBatch,
    touchDetail: touchDetail,
    get: get,
    queryDetail: queryDetail,
  };
})();
