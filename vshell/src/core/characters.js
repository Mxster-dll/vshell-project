/* ============================================================
 * characters — 角色系统（v0.5.0，标签功能全面升级）
 *
 * 背景：不同 UP 可能创作同一角色；有的视频平台没有「UP」概念
 * → 为通用性统一用「角色」指代增强后的标签功能。
 *
 * 三个 store 键（store 自动加 vshell. 前缀）：
 *  - 'characters'：角色列表 [{name, icon, keywords:[...]}]
 *    keywords = 自定义关键词列表（**含角色名**，匹配只认关键词）
 *  - 'videoChars'：{videoId: roleName}——已被赋予的角色
 *    （自动匹配赋予 / 手动赋予 / 冲突解析选定，统一存这里）
 *  - 'charConflicts'：{videoId: [roleName,...]}——冲突态
 *    （标题一次性匹配多个角色 → 不自动赋予，标记冲突）
 *  - 'charLocks'（v0.5.6）：{videoId: true}——**人工锁定**：手动赋予/
 *    冲突解析选定的视频不再被 charFor 自动重评升级为冲突
 *    （用户报：解决冲突选了角色但立即又变回冲突态，结果不生效）
 *  - 'charVideos'（v0.5.6）：{roleName: [videoMeta,...]}——该角色名下
 *    的视频快照（角色主页「手动添加」列表数据源；assign/resolveConflict
 *    时由调用方传入 meta：{id,bvid,title,cover,url,addedAt}）
 *
 * 自动赋予（卡片**第一次**加载时，charFor 调用）：
 *  - videoChars 已有该视频 → 直接返回已赋予角色（不再匹配）
 *  - charConflicts 已有 → 返回冲突态（不再重新匹配）
 *  - 否则按标题关键词匹配：0 命中 → 无角色（不存，角色/关键词
 *    变化后可重新匹配）；1 命中 → 自动赋予（存 videoChars）；
 *    ≥2 命中 → 冲突（存 charConflicts）
 *
 * 手动管理（详情页弹窗，用户拍板）：
 *  - assign(id, name|null)：显式赋予 / 移除（同时清冲突态）
 *  - resolveConflict(id, name|null)：冲突解析（选定 / 放弃）
 *
 * 旧数据迁移：v0.5.0 前 store 'tags'（字符串数组或 [{name,icon}]）
 * → 自动迁移为 [{name, icon, keywords:[name]}] 并删除 tags 键。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var KEY = 'characters';
  var VKEY = 'videoChars';
  var CKEY = 'charConflicts';
  var LKEY = 'charLocks';           // v0.5.6：人工锁定（resolve/assign 后不再重评）
  var MKEY = 'charManuals';         // v0.5.6 第五轮：{id: {name, at}} 手动指定记录
  var VIDSKEY = 'charVideos';       // v0.5.6：角色名下视频快照（角色主页）
  var FKEY = 'charFollows';         // v0.5.6 第十一轮：{roleName: true} 关注的角色
  var RKEY = 'charRemoved';         // v0.5.6 第二十七轮：{id: true} **手动移除标记**——
                                    // assign/resolveConflict 传 null（用户显式设为
                                    // 无角色）后，charFor 不再按标题自然赋予/冲突
                                    // （否则标题命中关键词 → 移除立即"复活"）
  var LEGACY_KEY = 'tags';          // v0.5.0 前的标签键（迁移后删除）

  /** 数据源作用域键：v0.5.6 用户需求——角色/赋值/代表作等按数据源隔离
   *  （vshell.characters.acfun / vshell.videoChars.bilibili / ...）
   *  v0.5.7 多源：主源键（primaryId）见下方定义（覆盖此无参版） */
  function sk(base) { return V.store.scopedKey(base); }

  var chars = [];                   // 内存态 [{name, icon, keywords}]
  var videoChars = {};              // {id: roleName}
  var conflicts = {};               // {id: [roleName,...]}
  var locks = {};                   // {id: true}（人工锁定）
  var manuals = {};                 // {id: {name, at}}（手动指定——与自然赋予区分）
  var charVideos = {};              // {roleName: [videoMeta,...]}
  var follows = {};                 // {roleName: true}（关注集合，v0.5.6 第十一轮）
  var removedIds = {};              // {id: true}（手动移除标记，v0.5.6 第二十七轮）
  var listeners = [];

  function normalize(t) {
    if (!t || typeof t !== 'object') return null;
    var name = String(t.name || '').trim();
    if (!name) return null;
    var kws = Array.isArray(t.keywords)
      ? t.keywords.map(function (k) { return String(k).trim(); }).filter(Boolean)
      : [];
    if (!kws.length) kws = [name];          // 关键词缺省 = 角色名
    // v0.5.9：排除词——标题含任一排除词 → 视频墙/角色页匹配不命中
    var excls = Array.isArray(t.exclusions)
      ? t.exclusions.map(function (x) { return String(x).trim(); }).filter(Boolean)
      : [];
    excls = excls.filter(function (x, i, a) { return a.indexOf(x) === i; });
    // v0.5.6 第四轮：banner（角色主页背景图）/ featured（代表作 videoId）随角色持久化
    // v0.5.6 第十轮：featuredMeta（代表作视频快照，marquee 卡数据源）
    // v0.5.6 第二十轮需求 4：**多个代表作**——featured 由单值改数组，
    // featuredMetas 改 {id: 快照} 映射；兼容旧单值数据（自动迁移）
    var fds = Array.isArray(t.featured)
      ? t.featured.map(function (x) { return String(x); }).filter(Boolean)
      : (t.featured ? [String(t.featured).trim()].filter(Boolean) : []);
    var fms = {};
    if (t.featuredMetas && typeof t.featuredMetas === 'object') {
      if (t.featuredMetas.id && t.featuredMetas.title) {
        // 旧格式：单个快照对象（含 id 字段）→ {id: obj}
        fms[String(t.featuredMetas.id)] = t.featuredMetas;
      } else {
        // 新格式：{id: 快照} 映射
        for (var fk in t.featuredMetas) {
          if (t.featuredMetas[fk] && t.featuredMetas[fk].id) fms[fk] = t.featuredMetas[fk];
        }
      }
    }
    return {
      name: name,
      icon: String(t.icon || ''),
      keywords: kws,
      exclusions: excls,
      banner: String(t.banner || ''),
      featured: fds,
      featuredMetas: fms,
    };
  }

  /* ---------- 恢复 + 旧数据迁移（按当前数据源作用域键） ---------- */
  /** v0.5.7 多源：主源 = multisource.primary()（激活集第一个）；加载早期
   *  multisource 未就绪 → dataSource.get()（兼容单源时代） */
  function primaryId() {
    try {
      if (V.multisource && typeof V.multisource.primary === 'function') {
        return V.multisource.primary();
      }
    } catch (e) { /* noop */ }
    return (V.dataSource && V.dataSource.get) ? V.dataSource.get() : 'acfun';
  }
  function sk(b) { return V.store.scopedKey(b, primaryId()); }
  function loadAll() {
    // 旧无后缀键 → 当前源键（一次性迁移；新键已有数据则跳过）
    ['characters', 'videoChars', 'charConflicts', 'charLocks',
     'charManuals', 'charVideos', 'charFollows', 'charRemoved'
    ].forEach(function (b) { V.store.migrateScoped(b, sk(b)); });

    try {
      var saved = V.store.get(sk(KEY));
      if (Array.isArray(saved)) {
        chars = saved.map(normalize).filter(function (c) { return c && c.name; });
      } else {
        // 迁移旧 'tags'（字符串数组或 [{name, icon}]）→ [{name, icon, keywords:[name]}]
        var legacy = V.store.get(LEGACY_KEY);
        if (Array.isArray(legacy)) {
          chars = legacy.map(function (t) {
            if (typeof t === 'string') return { name: t, icon: '', keywords: [t] };
            var n = String(t && t.name || '').trim();
            return { name: n, icon: String(t && t.icon || ''), keywords: [n] };
          }).filter(function (c) { return c.name; });
          try { V.store.set(sk(KEY), chars); V.store.del(LEGACY_KEY); } catch (e) { /* noop */ }
        }
      }
    } catch (e) { /* noop */ }
    try {
      var vc = V.store.get(sk(VKEY));
      if (vc && typeof vc === 'object') videoChars = vc;
    } catch (e) { /* noop */ }
    try {
      var cf = V.store.get(sk(CKEY));
      if (cf && typeof cf === 'object') conflicts = cf;
    } catch (e) { /* noop */ }
    try {
      var lk = V.store.get(sk(LKEY));
      if (lk && typeof lk === 'object') locks = lk;
    } catch (e) { /* noop */ }
    try {
      var mn = V.store.get(sk(MKEY));
      if (mn && typeof mn === 'object') manuals = mn;
    } catch (e) { /* noop */ }
    try {
      var cv = V.store.get(sk(VIDSKEY));
      if (cv && typeof cv === 'object') charVideos = cv;
    } catch (e) { /* noop */ }
    try {
      var fl = V.store.get(sk(FKEY));
      // 关注集合必须是 {roleName: true} 对象。历史数据曾误存为数组
      // （VsStore 同步的 "[]" 补缺 + 早期 push 用法）——数组的字符串键
      // JSON.stringify 时被丢弃，关注信息实际从未持久化。数组一律当
      // 空集合丢弃（历史数组无角色名映射，无法恢复）。
      if (fl && typeof fl === 'object' && !Array.isArray(fl)) follows = fl;
      else follows = {};
    } catch (e) { /* noop */ }
    try {
      var rm = V.store.get(sk(RKEY));
      if (Array.isArray(rm)) {
        // 历史数据兼容：数组格式 → 对象。**数组索引赋值会造出
        // length=48800004 的稀疏数组**（ac 号是数字索引），JSON.stringify
        // 遍历 length 级数 → 点「完成」卡 1.8s（实测根因）。只保留实际元素。
        var rmObj = {};
        var rmKeys = Object.keys(rm);
        for (var rmi = 0; rmi < rmKeys.length; rmi++) rmObj[rmKeys[rmi]] = true;
        removedIds = rmObj;
      } else if (rm && typeof rm === 'object') {
        removedIds = rm;
      }
    } catch (e) { /* noop */ }
  }

  loadAll();

  /** v0.5.7 多源：按源数据访问层。
   *  主源数据保留在模块级状态（chars/videoChars/...，兼容既有函数）；
   *  其他激活源的 8 键经 srcDataOf(srcId) 惰性读取（模块级缓存，
   *  invalidateSrc 失效）。所有"读多源"的 API（list/charFor/featuredOf/
   *  videosOf/find/setFeatured...）在此层上做并集或按源路由。 */
  var srcCache = {};
  function srcKeys(srcId) {
    return {
      chars: V.store.scopedKey(KEY, srcId),
      vc: V.store.scopedKey(VKEY, srcId),
      cf: V.store.scopedKey(CKEY, srcId),
      lk: V.store.scopedKey(LKEY, srcId),
      mn: V.store.scopedKey(MKEY, srcId),
      cv: V.store.scopedKey(VIDSKEY, srcId),
      fl: V.store.scopedKey(FKEY, srcId),
      rm: V.store.scopedKey(RKEY, srcId),
    };
  }
  function srcDataOf(srcId) {
    if (srcCache[srcId]) return srcCache[srcId];
    var k = srcKeys(srcId);
    var d = {
      chars: [], videoChars: {}, conflicts: {}, locks: {}, manuals: {},
      charVideos: {}, follows: {}, removedIds: {},
    };
    try {
      var saved = V.store.get(k.chars);
      if (Array.isArray(saved)) d.chars = saved.map(normalize).filter(function (c) { return c && c.name; });
      else d.chars = [];
    } catch (e) { /* noop */ }
    try { var vc = V.store.get(k.vc); if (vc && typeof vc === 'object') d.videoChars = vc; } catch (e) { /* noop */ }
    try { var cf = V.store.get(k.cf); if (cf && typeof cf === 'object') d.conflicts = cf; } catch (e) { /* noop */ }
    try { var lk = V.store.get(k.lk); if (lk && typeof lk === 'object') d.locks = lk; } catch (e) { /* noop */ }
    try { var mn = V.store.get(k.mn); if (mn && typeof mn === 'object') d.manuals = mn; } catch (e) { /* noop */ }
    try { var cv = V.store.get(k.cv); if (cv && typeof cv === 'object') d.charVideos = cv; } catch (e) { /* noop */ }
    try { var fl = V.store.get(k.fl); if (fl && typeof fl === 'object' && !Array.isArray(fl)) d.follows = fl; } catch (e) { /* noop */ }
    try {
      var rm = V.store.get(k.rm);
      if (Array.isArray(rm)) {
        var rmObj = {};
        var rmKeys = Object.keys(rm);
        for (var rmi = 0; rmi < rmKeys.length; rmi++) rmObj[rmKeys[rmi]] = true;
        d.removedIds = rmObj;
      } else if (rm && typeof rm === 'object') d.removedIds = rm;
    } catch (e) { /* noop */ }
    srcCache[srcId] = d;
    return d;
  }
  function invalidateSrc(srcId) { delete srcCache[srcId]; }
  function invalidateAllSrc() { srcCache = {}; }

  /** 激活源快照（multisource 未就绪回退主源） */
  /** 查询用源集（v0.5.7 用户反馈：角色页内容少——角色/视频快照在隐私源
   *  时查不到——角色数据查询用**全部候选源**（内置+注册表，含隐私），
   *  本地快照全量可见；挂载/激活仍走 multisource.activeSources） */
  function srcIds() {
    try {
      var all = V.multisource.allCandidates();
      if (Array.isArray(all) && all.length) return all;
    } catch (e) { /* noop */ }
    try { return V.multisource.activeSources(); } catch (e) { return ['acfun']; }
  }
  /** 列表显示源集（v0.5.8 用户需求：角色列表**任何入口**——导航角色按钮/
   *  添加角色/解决冲突/更换角色/角色管理——只显示**当前激活源**的角色：
   *  多源并集、无数据源显示为空；查询用全候选源 srcIds 不变） */
  function listSrcIds() {
    try {
      var act = V.multisource.activeSources();
      if (Array.isArray(act)) return act.slice();
    } catch (e) { /* noop */ }
    return [];
  }
  /** 主源数据（模块级状态 = 主源；与 srcDataOf 一致） */
  function mainData() {
    return {
      chars: chars, videoChars: videoChars, conflicts: conflicts, locks: locks,
      manuals: manuals, charVideos: charVideos, follows: follows, removedIds: removedIds,
    };
  }
  function dataOf(srcId) {
    return srcId === primaryId() ? mainData() : srcDataOf(srcId);
  }

  /** 并集角色列表（v0.5.7 同名全局合并：显示条目 = 首个源条目 +
   *  featured 并集；条目挂 __srcs 供按源写操作）
   *  v0.5.8：显示源集收窄为**激活源**（listSrcIds）——任何列表入口只显示
   *  当前数据源角色，多源并集、无数据源空列表 */
  function listAll() {
    var ids = listSrcIds();
    var byName = {};
    var order = [];
    ids.forEach(function (id) {
      var d = dataOf(id);
      d.chars.forEach(function (c) {
        if (!c || !c.name) return;
        if (!byName[c.name]) {
          byName[c.name] = {
            name: c.name,
            icon: c.icon || '',
            keywords: (c.keywords || []).slice(),
            exclusions: (c.exclusions || []).slice(),
            banner: c.banner || '',
            featured: (c.featured || []).slice(),
            featuredMetas: c.featuredMetas ? Object.assign({}, c.featuredMetas) : {},
            __srcs: [id],
          };
          order.push(c.name);
        } else {
          var m = byName[c.name];
          if (!m.icon && c.icon) m.icon = c.icon;
          if (!m.banner && c.banner) m.banner = c.banner;
          if (c.keywords && c.keywords.length) {
            c.keywords.forEach(function (k) {
              if (k && m.keywords.indexOf(k) < 0) m.keywords.push(k);
            });
          }
          // v0.5.9：排除词并集（跨源同名角色合并——任一源排除词都生效）
          if (c.exclusions && c.exclusions.length) {
            c.exclusions.forEach(function (x) {
              if (x && m.exclusions.indexOf(x) < 0) m.exclusions.push(x);
            });
          }
          // featured 并集（跨源代表作聚合）
          if (Array.isArray(c.featured)) {
            c.featured.forEach(function (fid) {
              if (fid && m.featured.indexOf(fid) < 0) {
                m.featured.push(fid);
                if (c.featuredMetas && c.featuredMetas[fid]) m.featuredMetas[fid] = c.featuredMetas[fid];
              }
            });
          }
          if (m.__srcs.indexOf(id) < 0) m.__srcs.push(id);
        }
      });
    });
    return order.map(function (n) { return byName[n]; });
  }

  /** 角色名所属源（并集；找不到 → null） */
  function srcOfRole(name) {
    var ids = srcIds();
    for (var i = 0; i < ids.length; i++) {
      var d = dataOf(ids[i]);
      for (var k = 0; k < d.chars.length; k++) {
        if (d.chars[k].name === name) return ids[i];
      }
    }
    return null;
  }

  /** 重新加载当前数据源数据 + 广播（数据源切换后由 app.js 统一调用） */
  function reload() {
    invalidateAllSrc();
    loadAll();
    notify();
    return chars.slice();
  }

  function persist() {
    try { V.store.set(sk(KEY), chars); } catch (e) { /* noop */ }
    notify();
  }
  function persistVideo() {
    try {
      V.store.set(sk(VKEY), videoChars);
      V.store.set(sk(CKEY), conflicts);
      V.store.set(sk(LKEY), locks);
      V.store.set(sk(MKEY), manuals);
      V.store.set(sk(VIDSKEY), charVideos);
      V.store.set(sk(FKEY), follows);
      V.store.set(sk(RKEY), removedIds);
    } catch (e) { /* noop */ }
  }
  /** 广播变更（角色列表与视频赋值的 UI 联动）
   *  v0.5.3：assign/resolveConflict 也广播——用户操作后详情页 UP 行
   *  /卡片角标即时刷新（此前只 persist 广播，赋值变更静默——需求 1 根因）。
   *  注意：charFor 自动赋予**不**广播（加载期批量匹配会雪崩重建） */
  function notify() {
    listeners.forEach(function (fn) { try { fn(chars.slice()); } catch (e) { /* noop */ } });
  }

  /** 全部角色（副本）——v0.5.7 多源：所有激活源并集（同名合并） */
  function list() { return listAll(); }

  /** 添加角色（name 必填去重；keywords 缺省 = [name]）；返回是否新增 */
  function add(role) {
    var n = normalize(role);
    if (!n) return false;
    if (chars.every(function (c) { return c.name !== n.name; })) {
      chars.unshift(n);                     // 新角色置顶（v0.3.74 惯例）
      persist();
      return true;
    }
    return false;
  }

  /** 删除角色（同步清理该角色所在源的赋予/冲突记录；v0.5.7 按源） */
  function remove(name) {
    var sid = srcOfRole(name);
    if (!sid) return false;
    var d = dataOf(sid);
    var i = -1;
    for (var k = 0; k < d.chars.length; k++) if (d.chars[k].name === name) { i = k; break; }
    if (i < 0) return false;
    d.chars.splice(i, 1);
    var dirty = false;
    Object.keys(d.videoChars).forEach(function (id) {
      if (d.videoChars[id] === name) { delete d.videoChars[id]; dirty = true; }
    });
    Object.keys(d.conflicts).forEach(function (id) {
      var arr = d.conflicts[id];
      if (arr && arr.indexOf(name) >= 0) {
        arr = arr.filter(function (x) { return x !== name; });
        if (arr.length > 1) d.conflicts[id] = arr;
        else delete d.conflicts[id];
        dirty = true;
      }
    });
    Object.keys(d.locks).forEach(function (id) {
      if (!d.videoChars[id]) { delete d.locks[id]; dirty = true; }   // 无归属角色的锁清理
    });
    Object.keys(d.manuals).forEach(function (id) {
      if (!d.videoChars[id] || d.videoChars[id] === name) { delete d.manuals[id]; dirty = true; }
    });
    if (d.charVideos[name]) { delete d.charVideos[name]; dirty = true; }   // 角色主页数据
    if (d.follows[name]) { delete d.follows[name]; dirty = true; }         // 关注
    persistSrcData(sid, d);
    if (dirty) notify();
    return true;
  }

  /** 改名（v0.5.9）：角色名迁移到 newName——chars 条目改名 + 关键词里等于
   *  旧名的项跟随（默认关键词 = 角色名语义）+ videoChars 赋值替换 +
   *  conflicts 数组替换 + manuals 手动标记替换 + charVideos 键迁移 +
   *  follows 关注键迁移。目标名在任意源已存在 → 拒绝（并集同名合并会混淆）。
   *  返回是否成功。 */
  function rename(oldName, newName) {
    if (!oldName || !newName) return false;
    var nn = String(newName).trim();
    if (!nn || nn === oldName) return false;
    var sid = srcOfRole(oldName);
    if (!sid) return false;
    var ids = srcIds();
    for (var s = 0; s < ids.length; s++) {
      var dd = dataOf(ids[s]);
      for (var k = 0; k < dd.chars.length; k++) {
        if (dd.chars[k].name === nn) return false;   // 已有同名 → 拒绝
      }
    }
    var d = dataOf(sid);
    var c = null;
    d.chars.forEach(function (x) { if (x.name === oldName) c = x; });
    if (!c) return false;
    c.name = nn;
    c.keywords = (c.keywords || []).map(function (k) { return k === oldName ? nn : k; });
    var dirty = false;
    Object.keys(d.videoChars).forEach(function (id) {
      if (d.videoChars[id] === oldName) { d.videoChars[id] = nn; dirty = true; }
    });
    Object.keys(d.conflicts).forEach(function (id) {
      var arr = d.conflicts[id];
      if (arr && arr.indexOf(oldName) >= 0) {
        d.conflicts[id] = arr.map(function (x) { return x === oldName ? nn : x; });
        dirty = true;
      }
    });
    Object.keys(d.manuals).forEach(function (id) {
      if (d.manuals[id] && d.manuals[id].name === oldName) {
        d.manuals[id].name = nn; dirty = true;
      }
    });
    if (d.charVideos && d.charVideos[oldName]) {
      d.charVideos[nn] = d.charVideos[oldName];
      delete d.charVideos[oldName];
      dirty = true;
    }
    if (d.follows && d.follows[oldName]) {
      d.follows[nn] = true;
      delete d.follows[oldName];
      dirty = true;
    }
    persistSrcData(sid, d);
    if (dirty) notify();
    return true;
  }

  /** 清空全部 */
  function clear() {
    if (chars.length) { chars = []; persist(); }
    return chars.slice();
  }

  /** 配图：setIcon(name, iconURL)（v0.5.7 按角色所属源） */
  function setIcon(name, icon) {
    var sid = srcOfRole(name);
    if (!sid) return false;
    var d = dataOf(sid);
    var found = false;
    d.chars.forEach(function (c) {
      if (c.name === name) { c.icon = String(icon || '').trim(); found = true; }
    });
    if (found) { persistSrcData(sid, d); notify(); }
    return found;
  }

  /** 主页背景图：setBanner(name, url)（角色主页 banner；空 = 清除；v0.5.7 按源） */
  function setBanner(name, url) {
    var sid = srcOfRole(name);
    if (!sid) return false;
    var d = dataOf(sid);
    var found = false;
    d.chars.forEach(function (c) {
      if (c.name === name) { c.banner = String(url || '').trim(); found = true; }
    });
    if (found) { persistSrcData(sid, d); notify(); }
    return found;
  }

  /** 代表作（v0.5.6 第二十轮需求 4：支持**多个**——toggle 语义；v0.5.7 按源）：
   *  setFeatured(name, videoId, meta?)——videoId 已在列表 → 移除（含快照）；
   *  不在 → 加入（meta 快照随存，marquee 卡直接渲染）；videoId 空 = 清空全部。
   *  返回设置后的状态（true = 现在是代表作）。 */
  function setFeatured(name, videoId, meta) {
    var sid = srcOfRole(name);
    if (!sid) return false;
    var d = dataOf(sid);
    var c = null;
    d.chars.forEach(function (x) { if (x.name === name) c = x; });
    if (!c) return false;
    var next = false;
    var s2 = String(videoId || '').trim();
    if (!Array.isArray(c.featured)) c.featured = [];
    if (!c.featuredMetas || typeof c.featuredMetas !== 'object') c.featuredMetas = {};
    if (!s2) {
      c.featured = [];
      c.featuredMetas = {};
      next = false;
    } else {
      var i = c.featured.indexOf(s2);
      if (i >= 0) {
        c.featured.splice(i, 1);
        delete c.featuredMetas[s2];
        next = false;
      } else {
        c.featured.push(s2);
        if (meta && meta.id) c.featuredMetas[s2] = meta;
        next = true;
      }
    }
    persistSrcData(sid, d);
    notify();
    return next;
  }

  /** v0.5.6 第十九轮需求 2：查某视频是否为某角色的代表作——**全局生效**：
   *  所有显示圆点的卡片（主页/搜索/待看/收藏/角色页）都显示代表作金点，
   *  不只在角色主页。返回角色名（null = 不是代表作）。
   *  v0.5.6 第二十轮需求 4：多代表作——featured 数组 includes
   *  v0.5.7 多源：所有激活源查（跨源聚合） */
  function featuredOf(id) {
    if (!id) return null;
    var sid = String(id);
    var ids = srcIds();
    for (var s = 0; s < ids.length; s++) {
      var d = dataOf(ids[s]);
      for (var k = 0; k < d.chars.length; k++) {
        var f = d.chars[k].featured;
        if (Array.isArray(f) ? f.indexOf(sid) >= 0 : f === sid) return d.chars[k].name;
      }
    }
    return null;
  }

  /** 关键词：setKeywords(name, [kw,...])（trim+去重；v0.5.5 不再自动并入角色名——
   *  新角色默认 keywords=[name]，但角色名关键词可删去，匹配只认关键词；v0.5.7 按源） */
  function setKeywords(name, kws) {
    var sid = srcOfRole(name);
    if (!sid) return false;
    var d = dataOf(sid);
    var found = false;
    d.chars.forEach(function (c) {
      if (c.name === name) {
        var arr = Array.isArray(kws) ? kws : [];
        c.keywords = arr.map(function (k) { return String(k).trim(); })
          .filter(Boolean)
          .filter(function (k, i, a) { return a.indexOf(k) === i; });
        found = true;
      }
    });
    if (found) { persistSrcData(sid, d); notify(); }
    return found;
  }

  /** 排除词：setExclusions(name, [excl,...])（trim+去重；v0.5.9——
   *  标题含任一排除词 → 视频墙/角色页匹配不命中） */
  function setExclusions(name, excls) {
    var sid = srcOfRole(name);
    if (!sid) return false;
    var d = dataOf(sid);
    var found = false;
    d.chars.forEach(function (c) {
      if (c.name === name) {
        var arr = Array.isArray(excls) ? excls : [];
        c.exclusions = arr.map(function (x) { return String(x).trim(); })
          .filter(Boolean)
          .filter(function (x, i, a) { return a.indexOf(x) === i; });
        found = true;
      }
    });
    if (found) { persistSrcData(sid, d); notify(); }
    return found;
  }

  /** 标题关键词匹配（按源）：返回命中的角色对象数组（列表顺序；一个角色只算一次） */
  function matchTitle(title) {
    if (!title) return [];
    return matchTitleOn(mainData(), title);
  }
  function matchTitleOn(d, title) {
    if (!title || !d.chars.length) return [];
    var low = String(title).toLowerCase();
    var out = [];
    d.chars.forEach(function (c) {
      var hit = c.keywords.some(function (k) {
        return k && low.indexOf(String(k).toLowerCase()) >= 0;
      });
      // v0.5.9：排除词——关键词命中但标题含任一排除词 → 不命中
      if (hit && (c.exclusions || []).some(function (x) {
        return x && low.indexOf(String(x).toLowerCase()) >= 0;
      })) hit = false;
      if (hit) out.push({
        name: c.name,
        icon: c.icon,
        keywords: c.keywords.slice(),
        exclusions: (c.exclusions || []).slice(),
      });
    });
    return out;
  }

  /** 已赋予角色名（无 → null；v0.5.7 srcId 缺省主源） */
  function getChar(id, srcId) {
    var d = dataOf(srcId && srcId !== 'local' ? srcId : primaryId());
    return id ? d.videoChars[id] || null : null;
  }

  /** 冲突角色名数组（无 → null；v0.5.7 srcId 缺省主源） */
  function getConflict(id, srcId) {
    if (!id) return null;
    var d = dataOf(srcId && srcId !== 'local' ? srcId : primaryId());
    var arr = d.conflicts[id];
    return arr && arr.length ? arr.slice() : null;
  }

  /** 写回某源的角色数据（8 键；srcDataOf 的镜像） */
  function persistSrcData(srcId, d) {
    try {
      var k = srcKeys(srcId);
      V.store.set(k.chars, d.chars);
      V.store.set(k.vc, d.videoChars);
      V.store.set(k.cf, d.conflicts);
      V.store.set(k.lk, d.locks);
      V.store.set(k.mn, d.manuals);
      V.store.set(k.cv, d.charVideos);
      V.store.set(k.fl, d.follows);
      V.store.set(k.rm, d.removedIds);
    } catch (e) { /* noop */ }
    invalidateSrc(srcId);
  }

  /** 角色解析核心（按源数据上运行；v0.5.7 从 charFor 抽出）：
   *  自动赋予/冲突判定（持久化经 persistFn）。语义与原 charFor 一致。 */
  function charForOn(d, id, title, persistFn) {
    if (!id) return { kind: 'none' };
    var name = d.videoChars[id];
    var hits = matchTitleOn(d, title);
    if (name) {
      var found = null;
      d.chars.forEach(function (c) { if (c.name === name) found = c; });
      if (!found) return { kind: 'none' };
      if (d.locks[id]) return { kind: 'char', char: found };
      if (hits.length >= 2 && hits.some(function (h) { return h.name === name; })) {
        d.conflicts[id] = hits.map(function (h) { return h.name; });
        persistFn();
        return { kind: 'conflict', chars: d.conflicts[id].slice() };
      }
      return { kind: 'char', char: found };
    }
    if (d.removedIds[id]) return { kind: 'none' };
    if (d.conflicts[id]) return { kind: 'conflict', chars: d.conflicts[id].slice() };
    if (hits.length === 1) {
      d.videoChars[id] = hits[0].name;
      persistFn();
      return { kind: 'char', char: hits[0] };
    }
    if (hits.length > 1) {
      d.conflicts[id] = hits.map(function (h) { return h.name; });
      persistFn();
      return { kind: 'conflict', chars: d.conflicts[id].slice() };
    }
    return { kind: 'none' };
  }

  /** 角色解析（卡片/头像显示用）：
   *  v0.5.7 多源：按 item.sourceId 路由到对应源数据（自动赋予/冲突写
   *  该源键）；item 无 sourceId / local → 主源（原逻辑）。 */
  function charFor(id, item) {
    var sid = item && item.sourceId && item.sourceId !== 'local' ? item.sourceId : null;
    if (!sid) return charForOn(mainData(), id, item && item.title, persistVideo);
    var d = dataOf(sid);
    return charForOn(d, id, item && item.title, function () { persistSrcData(sid, d); });
  }

  /** 归一化视频快照（角色主页「手动添加」数据；meta 缺失时只保 id） */
  function normMeta(id, meta) {
    meta = meta || {};
    return {
      id: id,
      bvid: String(meta.bvid || meta.id || ''),
      title: String(meta.title || ''),
      cover: String(meta.cover || ''),
      url: String(meta.url || ''),
      pubdate: String(meta.pubdate || ''),   // v0.5.6 第八轮：快照带日期（角色主页卡右下角）
      local: !!meta.local,   // v0.5.6 第二十轮需求 1：快照保留本地标记（marquee 圆点）
      addedAt: meta.addedAt || Date.now(),
    };
  }

  /** 记录/移除视频到角色名下（charVideos 快照；角色主页数据源）——
   *  v0.5.7 按源版（操作 d.charVideos） */
  function touchVideoOn(d, name, id, meta, isRemove) {
    if (!name || !id) return;
    var cv = d.charVideos || (d.charVideos = {});
    var arr = cv[name] || (cv[name] = []);
    var i = -1;
    for (var k = 0; k < arr.length; k++) if (arr[k].id === id) { i = k; break; }
    if (isRemove) {
      if (i >= 0) arr.splice(i, 1);
    } else if (i < 0) {
      arr.unshift(normMeta(id, meta));       // 新视频置顶
    } else if (meta && (meta.title || meta.cover)) {
      arr[i] = normMeta(id, meta);           // 已有 → 更新快照
    }
    if (!arr.length) delete cv[name];
  }
  function touchVideo(name, id, meta, isRemove) {
    touchVideoOn(mainData(), name, id, meta, isRemove);
  }

  /** 显式赋予/移除核心（按源数据上运行；assign/resolveConflict/assignTo 共用） */
  function assignOn(d, id, name, meta) {
    var prev = d.videoChars[id];
    if (name) {
      d.videoChars[id] = name;
      d.locks[id] = true;                       // 人工锁定
      d.manuals[id] = { name: name, at: Date.now() };   // 手动指定标记
      touchVideoOn(d, name, id, meta, false);
      d.removedIds[id] = false;                 // 重新赋予清除移除标记（值标记防 dictionary 退化）
    } else {
      delete d.videoChars[id];
      delete d.locks[id];
      delete d.manuals[id];
      d.removedIds[id] = true;                  // 手动移除：此后不再自然赋予/冲突（防复活）
    }
    if (prev && prev !== name) touchVideoOn(d, prev, id, null, true);   // 换角色/移除 → 旧角色列表移除
    delete d.conflicts[id];
  }

  /** 显式赋予/移除：assign(id, name|null, meta?, srcId?)（清冲突态；人工锁定）
   *  v0.5.3：操作后广播（详情页 UP 行/卡片角标即时刷新，用户需求 1）
   *  v0.5.6：meta 可选——有则写入角色视频快照（角色主页）；无则只记录 id
   *  （展示时从 saved 兜底查元数据）。人工赋予 → locks[id]（不再重评冲突）
   *  v0.5.7：srcId 指定归属源（缺省主源） */
  function assign(id, name, meta, srcId) {
    if (!id) return;
    var sid = srcId && srcId !== 'local' ? srcId : primaryId();
    var d = dataOf(sid);
    assignOn(d, id, name, meta);
    persistSrcData(sid, d);
    notify();
  }

  /** v0.5.7 多源跨源赋予：给 item（归属源 a）的视频添加角色 name——
   *  目标源 = **视频归属源 a**（用户拍板 v0.5.8：角色列表按视频源管理——
   *  a 源视频上使用角色 → 该角色登记进 a 源列表；**唯一**跨源添加途径）。
   *  - a 源已有该角色 → 直接赋予（写 a 源键）
   *  - a 源无（弹窗并集列表里选的是其他源的角色 c / 全新名字）→ 在 a 源
   *    **建立**角色：icon/banner/keywords 从全源同名角色复制（无同名 →
   *    keywords=[name]；featured 不复制——代表作按源隔离），再赋予。
   *  其他源数据**完全不碰**。除本入口外无任何路径会跨源添加角色：
   *  charFor 自动匹配按源隔离（a 源视频只匹配 a 源角色）；assign/
   *  resolveConflict 的 srcId 由调用方传视频源；角色级操作（icon/banner/
   *  keywords/featured/follow）按 srcOfRole 角色所属源路由。返回是否成功。 */
  function assignTo(item, name, meta) {
    var id = item && (item.id || item.bvid);
    if (!id || !name) return false;
    var vidSrc = (item.sourceId && item.sourceId !== 'local') ? item.sourceId : primaryId();
    var d = dataOf(vidSrc);
    var exists = d.chars.some(function (c) { return c.name === name; });
    if (!exists) {
      // 全源查找同名角色（只读复制元数据，不修改源数据）
      var srcChar = null;
      var ids = srcIds();
      for (var s = 0; s < ids.length && !srcChar; s++) {
        var sd = dataOf(ids[s]);
        sd.chars.forEach(function (c) {
          if (!srcChar && c.name === name) srcChar = c;
        });
      }
      d.chars.unshift({
        name: name,
        icon: srcChar ? srcChar.icon || '' : '',
        banner: srcChar ? srcChar.banner || '' : '',
        keywords: srcChar && srcChar.keywords && srcChar.keywords.length
          ? srcChar.keywords.slice() : [name],
        // v0.5.9：跨源建立时排除词一并复制（匹配语义保持一致）
        exclusions: srcChar && srcChar.exclusions ? srcChar.exclusions.slice() : [],
      });
    }
    assignOn(d, id, name, meta);
    persistSrcData(vidSrc, d);
    notify();
    return true;
  }

  /** 冲突解析：选定角色（或 null=放弃，保持无角色）——广播同 assign
   *  v0.5.6：选定即**人工锁定**（不再被 charFor 重评回冲突）；meta 写入快照
   *  v0.5.7：srcId 指定归属源（缺省主源） */
  function resolveConflict(id, name, meta, srcId) {
    if (!id) return;
    var sid = srcId && srcId !== 'local' ? srcId : primaryId();
    var d = dataOf(sid);
    var prev = d.videoChars[id];
    delete d.conflicts[id];
    if (name) {
      d.videoChars[id] = name;
      d.locks[id] = true;
      d.manuals[id] = { name: name, at: Date.now() };
      touchVideoOn(d, name, id, meta, false);
      d.removedIds[id] = false;
    } else {
      delete d.videoChars[id];
      delete d.locks[id];
      delete d.manuals[id];
      d.removedIds[id] = true;
    }
    if (prev && prev !== name) touchVideoOn(d, prev, id, null, true);
    persistSrcData(sid, d);
    notify();
  }

  /** v0.5.6 第五轮：该视频角色是否为**手动指定**（assign/resolveConflict/
   *  观看 5s 自动转手动；与自然赋予区分——即使结果一致也不同）
   *  v0.5.7：srcId 缺省主源 */
  function isManual(id, srcId) {
    if (!id) return false;
    var d = dataOf(srcId && srcId !== 'local' ? srcId : primaryId());
    return !!d.manuals[id];
  }

  /** v0.5.6 第五轮：还原角色——去除手动指定（删 manual/lock/赋予/冲突），
   *  然后按标题自然重评（可能恢复自然角色 / 冲突 / 无角色）。
   *  返回是否曾为手动指定。title 缺省则只清理不重评。
   *  v0.5.7：srcId 缺省主源 */
  function unassign(id, title, srcId) {
    if (!id) return false;
    var sid = srcId && srcId !== 'local' ? srcId : primaryId();
    var d = dataOf(sid);
    var had = !!d.manuals[id];
    delete d.manuals[id];
    delete d.locks[id];
    delete d.videoChars[id];
    delete d.conflicts[id];
    d.removedIds[id] = false;                    // v0.5.6 第二十七轮：还原 = 允许自然重评（值标记防 dictionary 退化）
    if (had && title) charForOn(d, id, title, function () {});   // 先自然重评（写回自然角色/冲突）
    persistSrcData(sid, d);
    notify();                                           // 再广播（UI 读到最终态）
    return had;
  }

  /** v0.5.6 第五轮：观看满 5s 自动将自然角色转为手动指定（用户需求）——
   *  隐式操作（不广播）；悬停预览不走 watched 路径天然豁免。
   *  v0.5.7：srcId 缺省主源 */
  function autoToManual(id, srcId) {
    if (!id) return false;
    var sid = srcId && srcId !== 'local' ? srcId : primaryId();
    var d = dataOf(sid);
    if (d.manuals[id]) return false;
    var name = d.videoChars[id];
    if (!name) return false;
    d.manuals[id] = { name: name, at: Date.now() };
    d.locks[id] = true;                       // 转手动后不再自动重评
    persistSrcData(sid, d);
    return true;
  }

  /** 按名查找角色（角色主页用；无 → null）——v0.5.7 多源：所有激活源
   *  （同名取第一个源条目；条目挂 __src 所属源） */
  function find(name) {
    if (!name) return null;
    var ids = srcIds();
    for (var s = 0; s < ids.length; s++) {
      var d = dataOf(ids[s]);
      for (var k = 0; k < d.chars.length; k++) {
        if (d.chars[k].name === name) {
          var c = d.chars[k];
          if (!c.__src) c.__src = ids[s];
          return c;
        }
      }
    }
    return null;
  }

  /** 角色名下视频快照（副本；角色主页「手动添加」数据源）
   *  v0.5.7 多源：所有激活源同名角色的 charVideos 并集（复合键去重）
   *  旧快照字段兜底同原逻辑 */
  function videosOf(name) {
    var out = [];
    var seen = {};
    var ids = srcIds();
    ids.forEach(function (id) {
      var d = dataOf(id);
      var arr = d.charVideos[name];
      if (!arr) return;
      arr.forEach(function (m) {
        if (!m) return;
        var k2 = V.multisource.key(id, m.id);
        if (seen[k2]) return;
        seen[k2] = true;
        var cp = Object.assign({}, m);
        if (!cp.sourceId) cp.sourceId = id;
        out.push(cp);
      });
    });
    if (V.saved && V.saved.listWatch && V.saved.listFav) {
      var pool = V.saved.listWatch().concat(V.saved.listFav());
      out.forEach(function (m) {
        if (!m) return;
        if (!m.pubdate || !m.cover) {
          for (var i = 0; i < pool.length; i++) {
            if (pool[i] && pool[i].id === m.id) {
              if (!m.pubdate && pool[i].pubdate) m.pubdate = pool[i].pubdate;
              if (!m.cover && pool[i].pic) m.cover = pool[i].pic;
              if (m.pubdate && m.cover) break;
            }
          }
        }
      });
    }
    return out;
  }

  /** v0.5.6 第十一轮：关注/取消关注角色（浮窗/feed/详情 + 按钮）——
   *  返回新状态（true=已关注）。关注是角色级偏好，与视频无关。
   *  v0.5.7：按角色所属源读写 */
  function toggleFollow(name) {
    if (!name) return false;
    var sid = srcOfRole(name) || primaryId();
    var d = dataOf(sid);
    var next = !d.follows[name];
    if (next) d.follows[name] = true;
    else delete d.follows[name];
    persistSrcData(sid, d);
    notify();                                  // 关注按钮状态即时刷新
    return next;
  }
  function isFollowed(name) {
    if (!name) return false;
    var sid = srcOfRole(name);
    return sid ? !!dataOf(sid).follows[name] : false;
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

  V.characters = {
    list: list,
    reload: reload,                       // v0.5.6：数据源切换重载
    add: add,
    remove: remove,
    clear: clear,
    setIcon: setIcon,
    setBanner: setBanner,                 // v0.5.6 第四轮：角色主页背景图
    setFeatured: setFeatured,             // v0.5.6 第四轮：代表作 videoId
    featuredOf: featuredOf,               // v0.5.6 第十九轮：全局代表作圆点
    setKeywords: setKeywords,
    setExclusions: setExclusions,       // v0.5.9：排除词（标题命中即不匹配）
    rename: rename,                     // v0.5.9：角色改名（全关联迁移）
    matchTitle: matchTitle,
    getChar: getChar,
    getConflict: getConflict,
    charFor: charFor,
    assign: assign,
    assignTo: assignTo,               // v0.5.7 多源：跨源赋予（目标源=角色所属源，缺则建）
    resolveConflict: resolveConflict,
    isManual: isManual,               // v0.5.6 第五轮：手动指定标记
    unassign: unassign,               // v0.5.6 第五轮：还原角色（去除手动指定）
    autoToManual: autoToManual,       // v0.5.6 第五轮：观看 5s 自然转手动
    find: find,                       // v0.5.6：按名查找（角色主页）
    videosOf: videosOf,               // v0.5.6：角色名下视频快照
    toggleFollow: toggleFollow,       // v0.5.6 第十一轮：关注/取消关注
    isFollowed: isFollowed,           // v0.5.6 第十一轮：是否已关注
    onChange: onChange,

    /** v0.6.4 聚合合并：成员（及被合并组 extraGids）的角色设置迁移到组
     *  （videoChars/charConflicts 的 'grp' 源键，组 id 'grp:xxx'）；
     *  多角色 → charConflicts 正常冲突流程（卡片红字 → 弹窗选择）。
     *  成员原角色保留（解除聚合后可恢复）。仅手动合并路径调用。 */
    absorbToGroup: function (gid, members, extraGids) {
      var sid = 'grp';
      var d = srcDataOf(sid);
      var names = [];
      function addName(n) {
        if (n && typeof n === 'string' && names.indexOf(n) === -1) names.push(n);
      }
      function collectConflict(arr) {
        if (Array.isArray(arr)) arr.forEach(addName);
      }
      if (d.videoChars[gid]) addName(d.videoChars[gid]);
      collectConflict(d.conflicts[gid]);
      (members || []).forEach(function (m) {
        try { addName(srcDataOf(m.src).videoChars[String(m.id)]); } catch (e) { /* noop */ }
      });
      (extraGids || []).forEach(function (og) {
        try {
          if (d.videoChars[og]) addName(d.videoChars[og]);
          collectConflict(d.conflicts[og]);
        } catch (e) { /* noop */ }
      });
      if (!names.length) return;   // 无角色，不动
      if (names.length === 1) {
        d.videoChars[gid] = names[0];
        delete d.conflicts[gid];
      } else {
        d.conflicts[gid] = names;
        delete d.videoChars[gid];
      }
      (extraGids || []).forEach(function (og) {
        delete d.videoChars[og];
        delete d.conflicts[og];
      });
      persistSrcData(sid, d);
    },
  };
})();
