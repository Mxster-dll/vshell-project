/* ============================================================
 * aggregations — 视频聚合（组 = 虚拟条目）
 * 用户需求（grilling 定稿）：
 *   1) 判定：封面 phash 高度相似 → 自动并入；自动化只有并入、永不自动拆
 *   2) 层面：数据层真合并——组 id，成员=(源,id) 跨源集合；收藏/待看/
 *      黑名单/角色归属存组 id（组级一条）
 *   3) 卡片：单卡显示主成员封面+标题 + 右上角组角标（新颜色）
 *   4) 详情：单详情 + 顶部源切换器（未激活源置灰）
 *   5) 主成员：质量优先（番号>标题长>封面非占位>更新时间>源序）
 *   6) 播放排序：完整版(part=1)优先（内按时长）→ 默认(0) → 片段(part=2)
 *      → 时长不可比 → 源注册表顺序
 *   7) 片段标记：纯手动（part: 0=默认 1=完整版 2=片段）
 *   8) 自动时机：后台增量（scheduleScan，video-card 渲染时懒扫）+ 启动
 *      补扫历史缓存（scanCache）；匹配方向：视频 vs 组、视频 vs 视频
 * 存储：localStorage 'vshell.aggregations'（web 权威 + __VS_STORE_BRIDGE__ 写穿）
 *   结构：{ groups: { 'grp:xxx': {id,title,cover,coverSrc,repPhash,auto,members,updatedAt} },
 *           pending: { 'src:id': {h:[h1,h2],t,c,d} } }   // 未入组视频的 phash 索引
 * 命名空间：VShell.aggregations（依赖 V.md5 / V.store / V.multisource / V.siteAdapters）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};
  var KEY = 'aggregations';
  var GID_PREFIX = 'grp:';
  var PHASH_DIST = 10;          // 64 位汉明距离阈值（~15%）
  var listeners = [];
  var map = null;               // 惰性加载
  var scanned = {};             // 'src:id' → 已入队/已算（会话级去重）
  var scanQueue = [];
  var scanRunning = false;

  function isGroupId(id) {
    return typeof id === 'string' && id.indexOf(GID_PREFIX) === 0;
  }

  function load() {
    if (map) return map;
    map = V.store.get(KEY, {});
    if (!map.groups) map.groups = {};
    if (!map.pending) map.pending = {};
    return map;
  }
  function persist() {
    V.store.set(KEY, map);
    try {
      if (window.__VS_STORE_BRIDGE__ && window.__VS_STORE_BRIDGE__.push) {
        window.__VS_STORE_BRIDGE__.push(KEY, JSON.stringify(map));
      }
    } catch (e) { /* noop */ }
  }
  function notify() {
    if (window.__VS_SETTINGS_OPEN__) return;
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) { /* noop */ }
    }
  }
  function onChange(fn) { listeners.push(fn); }

  function gidOf(members) {
    var list = members.map(function (m) { return m.src + ':' + m.id; }).sort();
    var h = '';
    try { h = V.md5(list.join(',')); } catch (e) { /* noop */ }
    return GID_PREFIX + (h || String(Math.random()).slice(2)).slice(0, 10);
  }

  function groupOf(srcId, id) {
    load();
    var gs = map.groups;
    for (var g in gs) {
      var gd = gs[g];
      for (var i = 0; i < gd.members.length; i++) {
        if (gd.members[i].src === srcId && String(gd.members[i].id) === String(id)) return gd;
      }
    }
    return null;
  }
  function getGroup(gid) { load(); return map.groups[gid] || null; }

  // ---- 主成员质量比较（决策 5：番号>标题长>封面非占位>更新时间>源序）----
  var CODE_RE = /[A-Za-z]{2,6}\s*-?\s*\d{2,6}/;
  function qualityScore(meta) {
    var s = 0;
    var title = meta && meta.title ? String(meta.title) : '';
    if (CODE_RE.test(title)) s += 10000;                              // 番号
    s += Math.min(1000, title.length);                                // 标题长
    if (meta && meta.cover) s += 500;                                 // 封面非占位
    if (meta && meta.pubdate) s += 100;                               // 更新时间
    return s;
  }
  function srcOrder(srcId) {
    try {
      var cand = V.multisource && V.multisource.allCandidates
        ? V.multisource.allCandidates() : [];
      var i = cand.indexOf(srcId);
      return i < 0 ? 999 : i;
    } catch (e) { return 999; }
  }

  // ---- 创建 / 合并 ----
  /** members=[{src,id,part?,title?,cover?}]
   *  opts: { title, cover, coverSrc, auto, id,
   *          memberMeta: { 'src:id': {title,cover,pubdate,src} },  // 质量比较元数据
   *          memberPhash: { 'src:id': [h1,h2] } }                  // best 的 phash 作为 repPhash */
  function createGroup(members, opts) {
    load();
    opts = opts || {};
    var seen = {};
    var ms = [];
    members.forEach(function (m) {
      var k = m.src + ':' + m.id;
      if (seen[k]) return;
      seen[k] = 1;
      ms.push({ src: m.src, id: String(m.id), part: m.part || 0 });
    });
    if (!ms.length) return null;
    var gid = opts.id || gidOf(ms);
    // 质量优先选主成员（有 memberMeta 时）
    var best = ms[0], bestKey = best.src + ':' + best.id;
    var bestMeta = opts.memberMeta ? (opts.memberMeta[bestKey] || {}) : {};
    if (opts.memberMeta) {
      var bs = null, bsKey = '', bsScore = -1;
      ms.forEach(function (m) {
        var mm = opts.memberMeta[m.src + ':' + m.id];
        if (!mm) return;
        var sc = qualityScore(mm);
        if (sc > bsScore || (sc === bsScore && (bs ? srcOrder(m.src) < srcOrder(bs.src) : true))) {
          bs = m; bsKey = m.src + ':' + m.id; bsScore = sc;
        }
      });
      if (bs) { best = bs; bestKey = bsKey; bestMeta = opts.memberMeta[bsKey] || {}; }
    }
    var repPh = (opts.memberPhash && opts.memberPhash[bestKey]) || opts.repPhash || 0;
    var g = {
      id: gid,
      title: opts.title || bestMeta.title || (best.title || best.id),
      cover: opts.cover || bestMeta.cover || (best.cover || ''),
      coverSrc: opts.coverSrc || best.src,
      repPhash: repPh,
      auto: !!opts.auto,
      members: ms,
      updatedAt: Date.now(),
    };
    map.groups[gid] = g;
    persist(); notify();
    return gid;
  }

  function addToGroup(gid, member) {
    load();
    var g = map.groups[gid];
    if (!g) return false;
    for (var i = 0; i < g.members.length; i++) {
      if (g.members[i].src === member.src && String(g.members[i].id) === String(member.id)) return false;
    }
    g.members.push({ src: member.src, id: String(member.id), part: member.part || 0 });
    g.updatedAt = Date.now();   // 主成员不改（决策 5）
    delete map.pending[member.src + ':' + member.id];
    persist(); notify();
    return true;
  }

  function removeMember(gid, srcId, id) {
    load();
    var g = map.groups[gid];
    if (!g) return false;
    g.members = g.members.filter(function (m) {
      return !(m.src === srcId && String(m.id) === String(id));
    });
    g.updatedAt = Date.now();
    if (!g.members.length) delete map.groups[gid];
    persist(); notify();
    return true;
  }

  function mergeGroups(gidA, gidB, opts) {
    load();
    var a = map.groups[gidA], b = map.groups[gidB];
    if (!a || !b || gidA === gidB) return false;
    b.members.forEach(function (m) {
      var k = m.src + ':' + m.id;
      var dup = a.members.some(function (x) { return x.src === m.src && String(x.id) === String(m.id); });
      if (!dup) a.members.push(m);
      delete map.pending[k];
    });
    if (opts) {
      if (opts.title) a.title = opts.title;
      if (opts.cover) { a.cover = opts.cover; a.coverSrc = opts.coverSrc || a.coverSrc; }
    }
    a.updatedAt = Date.now();
    delete map.groups[gidB];
    persist(); notify();
    return true;
  }

  function setTitleCover(gid, title, cover, coverSrc) {
    load();
    var g = map.groups[gid];
    if (!g) return false;
    if (title !== undefined) g.title = title;
    if (cover !== undefined) { g.cover = cover; g.coverSrc = coverSrc || g.coverSrc; }
    g.updatedAt = Date.now();
    persist(); notify();
    return true;
  }

  function setPart(gid, srcId, id, part) {
    load();
    var g = map.groups[gid];
    if (!g) return false;
    for (var i = 0; i < g.members.length; i++) {
      var m = g.members[i];
      if (m.src === srcId && String(m.id) === String(id)) {
        m.part = part;
        g.updatedAt = Date.now();
        persist(); notify();
        return true;
      }
    }
    return false;
  }

  /** 删除整组（二期「解除聚合」/管理面板用） */
  function removeGroup(gid) {
    load();
    if (!map.groups[gid]) return false;
    delete map.groups[gid];
    persist(); notify();
    return true;
  }

  // ---- 播放排序（决策 6/7：完整版→默认→片段，内按时长，时长不可比→源序）----
  function orderMembers(gid) {
    var g = getGroup(gid);
    if (!g) return [];
    var list = g.members.slice();
    list.sort(function (a, b) {
      var pa = a.part === 1 ? 2 : (a.part === 2 ? 0 : 1);
      var pb = b.part === 1 ? 2 : (b.part === 2 ? 0 : 1);
      if (pa !== pb) return pb - pa;
      var da = a.duration || 0, db = b.duration || 0;
      if (da && db && da !== db) return db - da;
      if (!!da !== !!db) return da ? -1 : 1;
      return srcOrder(a.src) - srcOrder(b.src);
    });
    return list;
  }

  // ---- phash（64 位感知哈希；cors fetch → blob URL，避开画布污染）----
  // WebView2 实测：no-cors opaque response 的 blob() 为空（size 0）——
  // cors 优先（图床通常放行），失败再试 no-cors（部分图床仍可读）
  function loadBlobUrl(url) {
    try {
      return fetch(url, { mode: 'cors' }).then(function (r) {
        if (!r.ok) return null;
        return r.blob().then(function (b) {
          if (!b || !b.size) return null;
          return URL.createObjectURL(b);
        });
      }).catch(function () {
        try {
          return fetch(url, { mode: 'no-cors' }).then(function (r2) {
            return r2.blob().then(function (b2) {
              if (!b2 || !b2.size) return null;
              return URL.createObjectURL(b2);
            });
          }).catch(function () { return null; });
        } catch (e) { return Promise.resolve(null); }
      });
    } catch (e) { return Promise.resolve(null); }
  }
  function phashOf(url) {
    return loadBlobUrl(url).then(function (objUrl) {
      if (!objUrl) return null;
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          try {
            var c = document.createElement('canvas');
            c.width = 16; c.height = 16;
            var ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, 16, 16);
            var d = ctx.getImageData(0, 0, 16, 16).data;
            var grays = [];
            for (var i = 0; i < 256; i++) grays.push(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
            var mean = 0;
            for (var j = 0; j < 256; j++) mean += grays[j];
            mean /= 256;
            var h1 = 0, h2 = 0;
            for (var k = 0; k < 256; k++) {
              if (grays[k] >= mean) {
                if (k < 128) h1 |= (1 << (k % 32));
                else h2 |= (1 << ((k - 128) % 32));
              }
            }
            try { URL.revokeObjectURL(img.src); } catch (e) { /* noop */ }
            resolve([h1 >>> 0, h2 >>> 0]);
          } catch (e) { resolve(null); }
        };
        img.onerror = function () { resolve(null); };
        img.src = objUrl;
      });
    });
  }
  function hamming(a, b) {
    if (!a || !b) return 999;
    var x = a[0] ^ b[0], y = a[1] ^ b[1];
    var n = 0;
    while (x) { n += x & 1; x >>>= 1; }
    while (y) { n += y & 1; y >>>= 1; }
    return n;
  }
  /** v0.6.3 低信息 phash 判定：64 位中 1 的占比 ∈ [15%, 85%] 才算有效。
   *  全 1 / 全 0 / 接近纯色（图床对失效封面统一返回的白色占位图、纯黑、
   *  空画布等）→ 所有视频算出同一 phash → 误聚合（曾出现 539 个 kkav
   *  视频并为一组）。这类封面无法表达内容，不参与自动聚合。 */
  function phashInfoValid(h) {
    if (!h) return false;
    var n = 0;
    var v1 = (h[0] || 0) >>> 0, v2 = (h[1] || 0) >>> 0;
    while (v1) { n += v1 & 1; v1 >>>= 1; }
    while (v2) { n += v2 & 1; v2 >>>= 1; }
    var ratio = n / 64;
    return ratio >= 0.15 && ratio <= 0.85;
  }

  /** 解析可绘制封面 URL：17c 加密图先解密（picDecryptor）；相对路径拼 baseUrl */
  function resolvePicUrl(srcId, item, baseUrl) {
    var pic = item.pic || item.cover || '';
    if (!pic) return Promise.resolve(null);
    try {
      if (V.siteAdapters && V.siteAdapters.picDecryptorFor) {
        var dec = V.siteAdapters.picDecryptorFor(srcId);
        if (dec) {
          return dec(pic).then(function (u) { return u || null; }).catch(function () { return null; });
        }
      }
    } catch (e) { /* noop */ }
    if (/^https?:\/\//.test(pic) || /^blob:/.test(pic) || /^data:/.test(pic)) return Promise.resolve(pic);
    if (baseUrl && /^\//.test(pic)) return Promise.resolve(baseUrl.replace(/\/+$/, '') + pic);
    return Promise.resolve(pic);
  }
  /** v0.6.2 从墙缓存分片（vshell.wall.*.<srcId>）查该源的 baseUrl（相对路径封面拼域名用） */
  function wallBaseUrl(srcId) {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var lk = localStorage.key(i);
        if (lk && lk.indexOf('vshell.wall.') === 0 && lk.indexOf('.' + srcId) === lk.length - srcId.length - 1) {
          try {
            var data = JSON.parse(localStorage.getItem(lk));
            if (data && data.baseUrl) return data.baseUrl;
          } catch (e) { /* noop */ }
        }
      }
    } catch (e) { /* noop */ }
    return '';
  }
  /** 成员/组封面 → 可绘制 URL（自动解密 + 拼 baseUrl）；不可用返回 null
   *  v0.6.2 二期：建组/合并/组列表弹窗封面回填用 */
  function picUrlOf(srcId, item) {
    return resolvePicUrl(srcId, item, wallBaseUrl(srcId));
  }

  // ---- 自动扫描（决策 8：后台增量 + 启动补扫；只并不拆）----
  /** 激活源集合（未激活源——含隐私源——数据不在视野内，禁止自动聚合） */
  function activeSrcSet() {
    try {
      var a = V.multisource ? V.multisource.activeSources() : ['acfun'];
      var s = {};
      a.forEach(function (x) { s[x] = 1; });
      s['local'] = 1;
      return s;
    } catch (e) { return { acfun: 1, local: 1 }; }
  }
  /** 从墙缓存分片（vshell.wall.*.<srcId>）查成员标题（主成员换源时用） */
  function titleFromCache(srcId, vid) {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var lk = localStorage.key(i);
        if (lk && lk.indexOf('vshell.wall.') === 0 && lk.indexOf('.' + srcId) === lk.length - srcId.length - 1) {
          try {
            var data = JSON.parse(localStorage.getItem(lk));
            if (data && data.items) {
              for (var j = 0; j < data.items.length; j++) {
                if (data.items[j] && String(data.items[j].id) === String(vid) && data.items[j].title) {
                  return data.items[j].title;
                }
              }
            }
          } catch (e) { /* noop */ }
        }
      }
    } catch (e) { /* noop */ }
    return '';
  }
  /** v0.6.1 启动清理：auto 组移除未激活源成员（隐私源语义：不加载不显示），
   *  空组删除、主成员落回激活源、pending 未激活源索引清除 */
  function cleanInactive() {
    load();
    var active = activeSrcSet();
    var changed = false;
    Object.keys(map.groups).forEach(function (g) {
      var gd = map.groups[g];
      if (!gd.auto) return;
      // v0.6.3：低信息 repPhash（封面解析成图床默认白图/纯色 → 大量视频
      // 同一 phash 误聚合，曾 539 个 kkav 视频并为一组）→ 整组作废删除，
      // 成员释放回单卡（phash 无效无法判断相似性，宁可拆开不误并）
      if (!phashInfoValid(gd.repPhash)) {
        delete map.groups[g];
        changed = true;
        return;
      }
      var before = gd.members.length;
      gd.members = gd.members.filter(function (m) { return active[m.src]; });
      if (!gd.members.length) { delete map.groups[g]; changed = true; return; }
      if (gd.members.length !== before) changed = true;
      if (!active[gd.coverSrc]) {
        gd.coverSrc = gd.members[0].src;
        gd.cover = '';   // 主成员换源，封面暂缺（组卡用占位+标题）
        // 标题也换：新主成员标题从缓存取（避免残留未激活源的标题）
        var nt = titleFromCache(gd.members[0].src, gd.members[0].id);
        if (nt) gd.title = nt;
      }
    });
    Object.keys(map.pending).forEach(function (k) {
      var ci = k.indexOf(':');
      var sid = ci < 0 ? k : k.slice(0, ci);
      if (!active[sid]) { delete map.pending[k]; changed = true; }
    });
    if (changed) persist();
    return changed;
  }
  function scheduleScan(item, baseUrl) {
    if (!item || !item.id || !item.sourceId) return;
    if (!activeSrcSet()[item.sourceId]) return;   // 未激活源不自动聚合
    var k = item.sourceId + ':' + item.id;
    if (scanned[k]) return;
    scanned[k] = 1;
    scanQueue.push({ item: item, srcId: item.sourceId, baseUrl: baseUrl });
    pumpScan();
  }
  function pumpScan() {
    if (scanRunning || !scanQueue.length) return;
    scanRunning = true;
    var job = scanQueue.shift();
    setTimeout(function () {
      doScan(job).then(function () { scanRunning = false; pumpScan(); });
    }, 250);   // 节流，避免首屏抢 CPU
  }
  function doScan(job) {
    var item = job.item, srcId = job.srcId;
    if (!srcId) return Promise.resolve();
    if (groupOf(srcId, item.id)) return Promise.resolve();
    return resolvePicUrl(srcId, item, job.baseUrl).then(function (u) {
      if (!u) return;
      return phashOf(u).then(function (h) {
        if (!h || !phashInfoValid(h)) return;   // v0.6.3：低信息 phash（默认占位图）不聚合
        var gs = map.groups;
        for (var g in gs) {                                    // 视频 vs 组内成员
          var gd = gs[g];
          if (gd.repPhash && phashInfoValid(gd.repPhash) && hamming(h, gd.repPhash) <= PHASH_DIST) {
            addToGroup(g, { src: srcId, id: item.id });
            return;
          }
        }
        var pend = map.pending;
        for (var k in pend) {                                  // 视频 vs 视频 → 自动建组
          var p = pend[k];
          if (p && p.h && phashInfoValid(p.h) && hamming(h, p.h) <= PHASH_DIST) {
            var ci = k.indexOf(':');
            var m2 = { src: k.slice(0, ci), id: k.slice(ci + 1) };
            var meta = {};
            meta[srcId + ':' + item.id] = { title: item.title, cover: item.pic || item.cover, pubdate: item.pubdate, src: srcId };
            meta[k] = { title: p.t, cover: p.c, pubdate: p.d, src: m2.src };
            var mph = {};
            mph[srcId + ':' + item.id] = h;
            mph[k] = p.h;
            createGroup(
              [{ src: srcId, id: item.id, title: item.title, cover: item.pic || item.cover },
               { src: m2.src, id: m2.id, title: p.t, cover: p.c }],
              { auto: true, memberMeta: meta, memberPhash: mph });
            delete map.pending[k];
            return;
          }
        }
        map.pending[srcId + ':' + item.id] = { h: h, t: item.title, c: item.pic || item.cover, d: item.pubdate };
        persist();
      });
    });
  }

  /** 启动补扫历史缓存（vshell.wall.* 分片 items；只扫**激活源**——
   *  未激活/隐私源数据不在视野内，禁止自动聚合） */
  function scanCache() {
    var active = activeSrcSet();
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var lk = localStorage.key(i);
        if (lk && lk.indexOf('vshell.wall.') === 0) {
          try {
            var data = JSON.parse(localStorage.getItem(lk));
            var base = data && data.baseUrl ? data.baseUrl : '';
            var srcId = lk.slice('vshell.wall.'.length);
            srcId = srcId.substring(srcId.lastIndexOf('.') + 1);
            if (!active[srcId]) continue;
            if (data && data.items && data.items.length) {
              data.items.forEach(function (it) {
                if (it && it.id) scheduleScan({ id: it.id, sourceId: srcId, title: it.title, pic: it.pic || it.cover, pubdate: it.pubdate }, base);
              });
            }
          } catch (e) { /* noop */ }
        }
      }
    } catch (e) { /* noop */ }
  }

  V.aggregations = {
    isGroupId: isGroupId,
    groupOf: groupOf,
    getGroup: getGroup,
    getGroups: function () { load(); return map.groups; },
    createGroup: createGroup,
    addToGroup: addToGroup,
    removeMember: removeMember,
    mergeGroups: mergeGroups,
    setTitleCover: setTitleCover,
    setPart: setPart,
    removeGroup: removeGroup,
    orderMembers: orderMembers,
    scheduleScan: scheduleScan,
    scanCache: scanCache,
    cleanInactive: cleanInactive,
    phashOf: phashOf,
    resolvePicUrl: resolvePicUrl,   // v0.6.2 导出：弹窗/UI 封面解析
    picUrlOf: picUrlOf,             // v0.6.2 导出：自动查 baseUrl 的封面解析
    onChange: onChange,
    notify: notify,
    count: function () { load(); return Object.keys(map.groups).length; },
  };
})();
