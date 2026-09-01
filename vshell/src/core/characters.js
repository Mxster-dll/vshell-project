/* ============================================================
 * characters — 角色系统（v0.5.0 标签升级；v0.6.30 多角色重构）
 *
 * 背景：不同 UP 可能创作同一角色；有的视频平台没有「UP」概念
 * → 为通用性统一用「角色」指代增强后的标签功能。
 *
 * store 键（store 自动加 vshell. 前缀，按数据源 scopedKey）：
 *  - 'characters'：角色列表 [{name, icon, keywords:[...], globalExclusions:[...], kwExclusions:{kw:[...]}}]
 *  - 'videoChars'：{videoId: [roleName,...]}——**全部**已赋予角色
 *    （手动赋予 + 自动赋予统一存这里，数组）
 *  - 'charManuals'：{videoId: {names:[手动角色...], at}}——**手动名单**。
 *    角色分两类：手动赋予（用户显式点选 / 播放 5s 升级）与自动赋予
 *    （标题关键词匹配 / 角色页搜索赋予）。自动 = videoChars - manuals。
 *  - 'charVideos'：{roleName: [videoMeta,...]}——**仅手动赋予**写快照
 *    （角色主页「手动添加」段数据源；自动赋予不进快照）
 *  - 'charConflicts'：**废弃**（v0.6.30 无冲突概念——一个视频可属多个
 *    角色，命中多个全部自动赋予；历史键保留不读不写新数据）
 *  - 'charLocks'（历史）：{videoId: true} 人工锁定（保留字段不再读）
 *  - 'charFollows'：{roleName: true} 关注的角色
 *  - 'charRemoved'：{id: true} 手动移除标记（不再自然赋予防复活）
 *
 * 角色赋予模型（用户拍板 v0.6.30）：
 *  - 自动赋予：①标题关键词匹配（charFor 首次加载，命中全部角色）
 *    ②角色页搜索赋予（assignAuto，跨源：a 源视频 → a 源角色；目标源
 *    无同名角色 → 先建副本复制 icon/banner/keywords/exclusions）
 *  - 手动赋予：详情页/卡片弹窗（setManual 整体提交手动名单）；
 *    自动角色不因手动编辑消失（手动增删只动手动名单）
 *  - **升级规则**：视频实际播放连续满 5s（watched 状态机，不累计）
 *    → autoToManual：该视频**所有**角色转为手动（manuals 全量 + 锁定）
 *  - unassign（重置）：清除手动名单 → 按标题自然重评（重新自动赋予）
 *
 * 旧数据迁移：videoChars 单值字符串 → [字符串]；manuals {name} →
 * {names:[name]}；'tags' 旧键 → [{name, icon, keywords:[name]}]。
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
  var RKEY = 'charRemoved';         // v0.5.6 第二十七轮：{id: true} **手动移除标记**——                                    // assign/resolveConflict 传 null（用户显式设为
                                    // 无角色）后，charFor 不再按标题自然赋予/冲突
                                    // （否则标题命中关键词 → 移除立即"复活"）
  var LEGACY_KEY = 'tags';          // v0.5.0 前的标签键（迁移后删除）
  var MAN_KEY = 'manManaged';       // v0.6.64：{id: true} **手动管理视频表**——
                                    // 用户手动操作过角色的视频（手动添加/取消/
                                    // 重置角色）入表；表内视频**不再被自动管理**
                                    // （搜索/匹配不自动赋予角色）。角色页 =
                                    // 表内当前角色（段1）+ 剔除表内后的自动搜索（段2）
  var REX_KEY = 'charRoleExcludes'; // v0.6.65：{角色名: {id: true}} **角色级排除表**
                                    // ——角色页悬停卡排除某视频：从该视频角色列表
                                    // 剔除当前角色 + 自动管理不再加回 + 段2 搜索
                                    // 剔除。**不算手动管理**（不进 manManaged 表）

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
  var managed = {};                 // {id: true}（v0.6.64 手动管理视频表——主源内存态）
  var roleExcludes = {};            // {角色名: {id: true}}（v0.6.65 角色级排除表——主源内存态）
  var listeners = [];

  function normalize(t) {
    if (!t || typeof t !== 'object') return null;
    var name = String(t.name || '').trim();
    if (!name) return null;
    var kws = Array.isArray(t.keywords)
      ? t.keywords.map(function (k) { return String(k).trim(); }).filter(Boolean)
      : [];
    if (!kws.length) kws = [name];          // 关键词缺省 = 角色名
    // v0.5.9 排除词；v0.6.31 显式改名**全局排除词**（globalExclusions）——
    // 标题含任一全局排除词 → 视频墙/角色页匹配整段失败。读时兼容旧
    // exclusions 字段（旧数据自动迁移）。
    var gexcls = Array.isArray(t.globalExclusions) ? t.globalExclusions
      : (Array.isArray(t.exclusions) ? t.exclusions : []);
    gexcls = gexcls.map(function (x) { return String(x).trim(); }).filter(Boolean);
    gexcls = gexcls.filter(function (x, i, a) { return a.indexOf(x) === i; });
    // v0.6.31 **独立词排除**（按关键词绑定）：{ keyword: [排除词...] }——
    // 关键词必须**独立出现**：排除词内部的该关键词不算命中（如关键词
    // string + 排除词 substring → substring 里的 string 不算；标题别处
    // 独立的 string 仍算命中）。只对绑定的关键词生效，其他关键词不受影响。
    var kwe = {};
    if (t.kwExclusions && typeof t.kwExclusions === 'object') {
      Object.keys(t.kwExclusions).forEach(function (kw) {
        var arr = Array.isArray(t.kwExclusions[kw]) ? t.kwExclusions[kw] : [];
        arr = arr.map(function (x) { return String(x).trim(); }).filter(Boolean);
        arr = arr.filter(function (x, i, a) { return a.indexOf(x) === i; });
        if (arr.length) kwe[kw] = arr;
      });
    }
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
      globalExclusions: gexcls,
      kwExclusions: kwe,
      banner: String(t.banner || ''),
      // v0.6.56：背景图焦点（原图归一化 0-1；渲染时以焦点为中心的最大
      // 内接矩形 + 视差水平余量）——缺省 null = 图片中心
      bannerFocus: (t && t.bannerFocus && typeof t.bannerFocus === 'object'
        && typeof t.bannerFocus.cx === 'number' && typeof t.bannerFocus.cy === 'number')
        ? { cx: t.bannerFocus.cx, cy: t.bannerFocus.cy } : null,
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
    try {
      var mm = V.store.get(sk(MAN_KEY));
      if (mm && typeof mm === 'object' && !Array.isArray(mm)) managed = mm;
      else managed = {};
    } catch (e) { /* noop */ }
    try {
      var re = V.store.get(sk(REX_KEY));
      if (re && typeof re === 'object' && !Array.isArray(re)) roleExcludes = re;
      else roleExcludes = {};
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
      mm: V.store.scopedKey(MAN_KEY, srcId),
      re: V.store.scopedKey(REX_KEY, srcId),
    };
  }
  function srcDataOf(srcId) {
    if (srcCache[srcId]) return srcCache[srcId];
    var k = srcKeys(srcId);
    var d = {
      chars: [], videoChars: {}, conflicts: {}, locks: {}, manuals: {},
      charVideos: {}, follows: {}, removedIds: {}, managed: {}, roleExcludes: {},
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
    try {
      var mm = V.store.get(k.mm);
      if (mm && typeof mm === 'object' && !Array.isArray(mm)) d.managed = mm;
    } catch (e) { /* noop */ }
    try {
      var re = V.store.get(k.re);
      if (re && typeof re === 'object' && !Array.isArray(re)) d.roleExcludes = re;
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
      managed: managed, roleExcludes: roleExcludes,
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
            // v0.6.31：全局排除词 + 独立词排除（按关键词绑定）随合并条目输出
            globalExclusions: (c.globalExclusions || []).slice(),
            kwExclusions: c.kwExclusions && typeof c.kwExclusions === 'object'
              ? Object.assign({}, c.kwExclusions) : {},
            banner: c.banner || '',
            // v0.6.56：bannerFocus 跟随 banner（首源即有 banner 的焦点）
            bannerFocus: c.bannerFocus || null,
            featured: (c.featured || []).slice(),
            featuredMetas: c.featuredMetas ? Object.assign({}, c.featuredMetas) : {},
            __srcs: [id],
          };
          order.push(c.name);
        } else {
          var m = byName[c.name];
          if (!m.icon && c.icon) m.icon = c.icon;
          if (!m.banner && c.banner) { m.banner = c.banner; m.bannerFocus = c.bannerFocus || null; }
          if (c.keywords && c.keywords.length) {
            c.keywords.forEach(function (k) {
              if (k && m.keywords.indexOf(k) < 0) m.keywords.push(k);
            });
          }
          // v0.6.31 全局排除词并集（原 v0.5.9 排除词——跨源同名角色合并，
          // 任一源排除词都生效）
          if (c.globalExclusions && c.globalExclusions.length) {
            c.globalExclusions.forEach(function (x) {
              if (x && m.globalExclusions.indexOf(x) < 0) m.globalExclusions.push(x);
            });
          }
          // v0.6.31 独立词排除并集（同名角色同一关键词的独立词排除合并）
          if (c.kwExclusions && typeof c.kwExclusions === 'object') {
            Object.keys(c.kwExclusions).forEach(function (kw) {
              var arr = c.kwExclusions[kw] || [];
              if (!arr.length) return;
              var mArr = m.kwExclusions[kw] || (m.kwExclusions[kw] = []);
              arr.forEach(function (x) {
                if (x && mArr.indexOf(x) < 0) mArr.push(x);
              });
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
      // v0.6.30 多角色数组：从数组移除该角色（空数组删键）
      var arr = d.videoChars[id];
      if (typeof arr === 'string') { if (arr === name) { delete d.videoChars[id]; dirty = true; } return; }
      if (Array.isArray(arr) && arr.indexOf(name) >= 0) {
        arr = arr.filter(function (x) { return x !== name; });
        if (arr.length) d.videoChars[id] = arr; else delete d.videoChars[id];
        dirty = true;
      }
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
    // v0.6.65：角色删除 → 全源清理该角色的排除表条目（角色已不存在，
    // 排除记录失去意义）
    var reIds = srcIds();
    reIds.forEach(function (reId) {
      var rd = dataOf(reId);
      if (rd.roleExcludes && rd.roleExcludes[name]) {
        delete rd.roleExcludes[name];
        if (reId === sid) dirty = true;
        persistSrcData(reId, rd);
      }
    });
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
      // v0.6.30 多角色数组：替换数组中旧名 → 新名
      var arr = d.videoChars[id];
      if (typeof arr === 'string') {
        if (arr === oldName) { d.videoChars[id] = nn; dirty = true; }
        return;
      }
      if (Array.isArray(arr) && arr.indexOf(oldName) >= 0) {
        d.videoChars[id] = arr.map(function (x) { return x === oldName ? nn : x; });
        dirty = true;
      }
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
    // v0.6.65：排除表全源迁移（角色改名 → 排除记录跟随新名）
    var reIds = srcIds();
    reIds.forEach(function (reId) {
      var rd = dataOf(reId);
      if (rd.roleExcludes && rd.roleExcludes[oldName]) {
        rd.roleExcludes[nn] = rd.roleExcludes[oldName];
        delete rd.roleExcludes[oldName];
        if (reId === sid) dirty = true;
        persistSrcData(reId, rd);
      }
    });
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

  /** v0.6.56：背景图焦点（原图归一化 0-1，与 setBanner 配套存）——渲染时
   *  以焦点为中心取最大内接矩形 + 视差水平余量；空 cx/cy = 清空（图片中心） */
  function setBannerFocus(name, cx, cy) {
    var sid = srcOfRole(name);
    if (!sid) return false;
    var d = dataOf(sid);
    var found = false;
    var focus = (typeof cx === 'number' && typeof cy === 'number')
      ? { cx: Math.max(0, Math.min(1, cx)), cy: Math.max(0, Math.min(1, cy)) } : null;
    d.chars.forEach(function (c) {
      if (c.name === name) { c.bannerFocus = focus; found = true; }
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
        // v0.6.31：被删除关键词的独立词排除一并清理
        if (c.kwExclusions && typeof c.kwExclusions === 'object') {
          Object.keys(c.kwExclusions).forEach(function (kw) {
            if (c.keywords.indexOf(kw) < 0) delete c.kwExclusions[kw];
          });
        }
        found = true;
      }
    });
    if (found) { persistSrcData(sid, d); notify(); }
    return found;
  }

  /** 全局排除词：setGlobalExclusions(name, [excl,...])（trim+去重；v0.5.9
   *  排除词 → v0.6.31 显式改名全局排除词——标题含任一 → 视频墙/角色页
   *  匹配整段失败。setExclusions 保留为兼容别名）。 */
  function setGlobalExclusions(name, excls) {
    var sid = srcOfRole(name);
    if (!sid) return false;
    var d = dataOf(sid);
    var found = false;
    d.chars.forEach(function (c) {
      if (c.name === name) {
        var arr = Array.isArray(excls) ? excls : [];
        c.globalExclusions = arr.map(function (x) { return String(x).trim(); })
          .filter(Boolean)
          .filter(function (x, i, a) { return a.indexOf(x) === i; });
        found = true;
      }
    });
    if (found) { persistSrcData(sid, d); notify(); }
    return found;
  }
  /** v0.5.9 旧名兼容别名 */
  function setExclusions(name, excls) { return setGlobalExclusions(name, excls); }

  /** v0.6.31 **独立词排除**：setKeywordExclusions(name, keyword, [excl,...])——
   *  该关键词必须独立出现（排除词内部的该关键词不算命中），只影响绑定的
   *  关键词。list 为空数组 → 解除该关键词的独立词排除。 */
  function setKeywordExclusions(name, keyword, list) {
    var sid = srcOfRole(name);
    if (!sid) return false;
    var d = dataOf(sid);
    var found = false;
    d.chars.forEach(function (c) {
      if (c.name === name) {
        var kw = String(keyword || '').trim();
        if (!kw) return;
        var arr = Array.isArray(list) ? list : [];
        arr = arr.map(function (x) { return String(x).trim(); })
          .filter(Boolean)
          .filter(function (x, i, a) { return a.indexOf(x) === i; });
        if (!c.kwExclusions || typeof c.kwExclusions !== 'object') c.kwExclusions = {};
        if (arr.length) c.kwExclusions[kw] = arr;
        else delete c.kwExclusions[kw];
        found = true;
      }
    });
    if (found) { persistSrcData(sid, d); notify(); }
    return found;
  }

  /* ---------- v0.6.41 全源删除（跨源同名角色删除语义）----------
   * UI 角色条目是**跨源同名合并**显示（listAll：首源条目 + 后续源词 push 到
   * 末尾）。旧 setKeywords/setGlobalExclusions 只写 srcOfRole 返回的**第一个
   * 源**→ 残留源重合并回末尾（用户反馈「点击删除按钮只会放到最后」根因），
   * 且会把合并数组整体写入首源（跨源词污染）。删除类操作必须遍历**所有**
   * 源（srcIds 全候选，含隐私/未激活）删词——任一源有改动才落盘+广播。 */

  /** 删除关键词（全源同名角色同步删；顺带清理该关键词的独立词排除） */
  function removeKeyword(name, k) {
    var kk = String(k == null ? '' : k);
    if (!kk || !name) return false;
    var done = false;
    srcIds().forEach(function (sid) {
      var d = dataOf(sid);
      var c = null;
      d.chars.forEach(function (x) { if (!c && x.name === name) c = x; });
      if (!c) return;
      var changed = false;
      if (Array.isArray(c.keywords) && c.keywords.indexOf(kk) >= 0) {
        c.keywords = c.keywords.filter(function (x) { return x !== kk; });
        changed = true;
        if (c.kwExclusions && typeof c.kwExclusions === 'object') {
          delete c.kwExclusions[kk];       // 同 setKeywords：被删关键词的独立词排除一并清
        }
      }
      if (changed) { persistSrcData(sid, d); done = true; }
    });
    if (done) notify();
    return done;
  }

  /** 删除全局排除词（全源同名角色同步删） */
  function removeGlobalExclusion(name, x) {
    var xx = String(x == null ? '' : x);
    if (!xx || !name) return false;
    var done = false;
    srcIds().forEach(function (sid) {
      var d = dataOf(sid);
      var c = null;
      d.chars.forEach(function (z) { if (!c && z.name === name) c = z; });
      if (!c) return;
      if (Array.isArray(c.globalExclusions) && c.globalExclusions.indexOf(xx) >= 0) {
        c.globalExclusions = c.globalExclusions.filter(function (v) { return v !== xx; });
        persistSrcData(sid, d);
        done = true;
      }
    });
    if (done) notify();
    return done;
  }

  /** 删除独立词排除（全源同名角色、指定关键词绑定列表同步删） */
  function removeKeywordExclusion(name, kw, w) {
    var kk = String(kw == null ? '' : kw);
    var ww = String(w == null ? '' : w);
    if (!name || !kk || !ww) return false;
    var done = false;
    srcIds().forEach(function (sid) {
      var d = dataOf(sid);
      var c = null;
      d.chars.forEach(function (z) { if (!c && z.name === name) c = z; });
      if (!c) return;
      var kwe = c.kwExclusions && typeof c.kwExclusions === 'object' ? c.kwExclusions : null;
      if (!kwe || !Array.isArray(kwe[kk])) return;
      if (kwe[kk].indexOf(ww) < 0) return;
      kwe[kk] = kwe[kk].filter(function (v) { return v !== ww; });
      if (!kwe[kk].length) delete kwe[kk];
      persistSrcData(sid, d);
      done = true;
    });
    if (done) notify();
    return done;
  }

  /** v0.6.31 **独立词命中**（导出供角色页等复用）：标题含关键词且**至少
   *  一次出现**不被任一独立词排除区间覆盖 → true。
   *  lowTitle 已小写；lowKw 已小写；kwExcls = [排除词,...]（原始大小写）。
   *  例：关键词 string、排除词 substring——标题仅「substring」→ string
   *  的出现 [0,6) 被 [0,9) 覆盖 → false；标题「abc string def」→ 独立
   *  出现 → true；标题「substring string」→ 有一次独立 → true。 */
  function kwHitTitle(lowTitle, lowKw, kwExcls) {
    if (!lowKw || !lowTitle || lowTitle.indexOf(lowKw) < 0) return false;
    if (!kwExcls || !kwExcls.length) return true;
    // 关键词全部出现区间（允许重叠：aa 在 aaa 中出现 2 次）
    var kwSpans = [];
    var p = 0;
    while (true) {
      var i = lowTitle.indexOf(lowKw, p);
      if (i < 0) break;
      kwSpans.push([i, i + lowKw.length]);
      p = i + 1;
    }
    if (!kwSpans.length) return false;
    // 全部排除词的区间
    var exSpans = [];
    kwExcls.forEach(function (e) {
      var le = String(e).toLowerCase();
      if (!le) return;
      var q = 0;
      while (true) {
        var j = lowTitle.indexOf(le, q);
        if (j < 0) break;
        exSpans.push([j, j + le.length]);
        q = j + 1;
      }
    });
    // 关键词至少一次出现不被任一排除词区间覆盖
    return kwSpans.some(function (sp) {
      return !exSpans.some(function (ex) {
        return ex[0] <= sp[0] && ex[1] >= sp[1];
      });
    });
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
      var hit = false;
      (c.keywords || []).forEach(function (k) {
        if (!k) return;
        // v0.6.31 独立词排除：该关键词必须独立出现（排除词内部不算）
        var kwe = (c.kwExclusions && c.kwExclusions[k]) || null;
        if (kwHitTitle(low, String(k).toLowerCase(), kwe)) hit = true;
      });
      // v0.6.31 全局排除词（原 v0.5.9 exclusions）——标题含任一 → 整段失败
      if (hit && (c.globalExclusions || []).some(function (x) {
        return x && low.indexOf(String(x).toLowerCase()) >= 0;
      })) hit = false;
      if (hit) out.push({
        name: c.name,
        icon: c.icon,
        keywords: c.keywords.slice(),
        globalExclusions: (c.globalExclusions || []).slice(),
        kwExclusions: c.kwExclusions ? Object.assign({}, c.kwExclusions) : {},
      });
    });
    return out;
  }

  /** 已赋予角色名**数组**（无 → null；v0.6.30 多角色：返回全部角色名；
   *  旧单值数据自动迁移。v0.5.7 srcId 缺省主源） */
  function getChar(id, srcId) {
    var d = dataOf(srcId && srcId !== 'local' ? srcId : primaryId());
    var arr = vcArr(d, id);
    return arr && arr.length ? arr.slice() : null;
  }

  /** v0.6.30：该视频**手动**角色名单（无 → []）——弹窗草稿初始值 */
  function getManual(id, srcId) {
    if (!id) return [];
    var d = dataOf(srcId && srcId !== 'local' ? srcId : primaryId());
    var mn = mNames(d, id);
    return mn ? mn.slice() : [];
  }

  /** 冲突态——v0.6.30 废弃（一个视频可属多个角色，无冲突概念）。
   *  保留函数签名兼容旧调用方，恒返回 null。 */
  function getConflict() {
    return null;
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
      V.store.set(k.mm, d.managed);
      V.store.set(k.re, d.roleExcludes);
    } catch (e) { /* noop */ }
    invalidateSrc(srcId);
  }

  /* ---------- v0.6.30 多角色辅助 ---------- */

  /** 读 videoChars[id] 为数组（旧单值字符串自动迁移为 [字符串]） */
  function vcArr(d, id) {
    if (!id) return null;
    var v = d.videoChars[id];
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v) return [v];
    return null;
  }

  /** 读 manuals[id] 手动名单（兼容旧 {name,at} 单值格式 → [name]） */
  function mNames(d, id) {
    var m = d.manuals[id];
    if (!m) return null;
    if (Array.isArray(m.names) && m.names.length) return m.names;
    if (typeof m.name === 'string' && m.name) return [m.name];
    return null;
  }

  /** 角色名数组 → 角色对象列表（按 chars 列表顺序；找不到的跳过） */
  function resolveChars(d, names) {
    var out = [];
    (names || []).forEach(function (n) {
      for (var i = 0; i < d.chars.length; i++) {
        if (d.chars[i].name === n) { out.push(d.chars[i]); break; }
      }
    });
    return out;
  }

  /** 目标源无同名角色 → 在目标源**建立副本**（全源查同名，复制
   *  icon/banner/keywords/exclusions——用户拍板 v0.6.30：跨源添加时
   *  b 源无此角色则先建 b 源副本再赋予；各源实际数据不合并，仅在
   *  多源整合（listAll）时按名并集） */
  function ensureRoleOn(d, vidSrc, name) {
    var exists = d.chars.some(function (c) { return c.name === name; });
    if (exists) return;
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
      // v0.6.56：跨源副本焦点跟随（渲染用焦点最大矩形）
      bannerFocus: srcChar && srcChar.bannerFocus ? {
        cx: srcChar.bannerFocus.cx, cy: srcChar.bannerFocus.cy,
      } : null,
      keywords: srcChar && srcChar.keywords && srcChar.keywords.length
        ? srcChar.keywords.slice() : [name],
      // v0.6.31：副本同样复制全局排除词 + 独立词排除（跨源匹配语义一致）
      globalExclusions: srcChar && srcChar.globalExclusions
        ? srcChar.globalExclusions.slice() : [],
      kwExclusions: srcChar && srcChar.kwExclusions && typeof srcChar.kwExclusions === 'object'
        ? Object.assign({}, srcChar.kwExclusions) : {},
    });
  }

  /** 角色解析核心（按源数据上运行；v0.5.7 从 charFor 抽出）：
   *  v0.6.30 多角色无冲突：已有角色 → 直接返回全部（不再自动增删）；
   *  无角色 → 标题命中**全部**自动赋予（数组）。返回
   *  { kind:'char', chars:[角色对象...] } 或 { kind:'none' }。 */
  function charForOn(d, id, title, persistFn) {
    if (!id) return { kind: 'none' };
    var arr = vcArr(d, id);
    if (arr && arr.length) {
      return { kind: 'char', chars: resolveChars(d, arr) };
    }
    // v0.6.64：手动管理过的视频不自动赋予（角色只来自用户手动设置）
    if (d.managed && d.managed[id]) return { kind: 'none' };
    // v0.6.63：true = 全视频手动移除（无任何角色）；对象 = 按角色免疫
    // （该角色已从 videoChars 移除，仅阻止重新自动赋予，不拦其他角色）
    if (d.removedIds[id] === true) return { kind: 'none' };
    var hits = matchTitleOn(d, title);
    // v0.6.65：角色级排除——被排除的角色不自动赋予该视频
    if (d.roleExcludes) {
      hits = hits.filter(function (h) {
        return !(d.roleExcludes[h.name] && d.roleExcludes[h.name][id]);
      });
    }
    if (d.removedIds[id] && typeof d.removedIds[id] === 'object') {
      hits = hits.filter(function (h) { return !d.removedIds[id][h.name]; });
    }
    if (hits.length) {
      d.videoChars[id] = hits.map(function (h) { return h.name; });
      persistFn();
      return { kind: 'char', chars: hits };
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

  /** v0.6.30 多角色**整体设置手动名单**（详情页/卡片弹窗提交）：
   *  - list = 新手动角色名数组；原**自动**角色（videoChars 中非原手动的）
   *    保留——手动编辑只动手动名单，自动角色不因手动编辑消失
   *  - 最终 videoChars = 新手动 + 原自动（去重）；全部取消且原手动非空
   *    → 移除标记（防自然复活）
   *  - charVideos 快照 diff：新增手动角色写快照、移出手动角色删快照
   *    （自动角色不写快照——角色页「手动添加」段只含手动赋予）
   *  - 手动名单非空 → manuals[id]={names,at} + locks；空 → 删 manuals/locks
   *  返回最终手动名单。 */
  function setManual(id, list, meta, srcId) {
    if (!id) return [];
    var sid = srcId && srcId !== 'local' ? srcId : primaryId();
    var d = dataOf(sid);
    // v0.6.64：手动操作过角色的视频入**手动管理表**——之后不再被自动
    // 管理（搜索/匹配不自动赋予），角色页自动搜索把它剔除
    d.managed[id] = true;
    var names = Array.isArray(list) ? list.filter(function (n) {
      return n && typeof n === 'string';
    }) : [];
    names = names.filter(function (n, i, a) { return a.indexOf(n) === i; });
    var oldManual = mNames(d, id) ? mNames(d, id).slice() : [];
    // v0.6.63：手动名单里出现曾被免疫的角色 → 解除该角色免疫（显式手动
    // 赋予优先于之前的自动移除标记）；全免疫标记（true）有手动名单时解除
    if (names.length) {
      if (d.removedIds[id] === true) d.removedIds[id] = false;
      if (d.removedIds[id] && typeof d.removedIds[id] === 'object') {
        var rm0 = d.removedIds[id];
        names.forEach(function (n) {
          if (rm0[n]) { delete rm0[n]; }
        });
        if (!Object.keys(rm0).length) d.removedIds[id] = false;
      }
    }
    var arr = vcArr(d, id);
    var autoNames = [];
    if (arr) {
      autoNames = arr.filter(function (n) { return oldManual.indexOf(n) < 0; });
    }
    var finalNames = names.slice();
    autoNames.forEach(function (n) {
      if (finalNames.indexOf(n) < 0) finalNames.push(n);
    });
    if (finalNames.length) {
      d.videoChars[id] = finalNames;
      if (d.removedIds[id] === true) d.removedIds[id] = false;
    } else {
      delete d.videoChars[id];
      if (oldManual.length) d.removedIds[id] = true;   // 全部取消 = 手动移除
    }
    names.forEach(function (n) {
      if (oldManual.indexOf(n) < 0) touchVideoOn(d, n, id, meta, false);
    });
    oldManual.forEach(function (n) {
      if (names.indexOf(n) < 0) touchVideoOn(d, n, id, null, true);
    });
    if (names.length) {
      d.manuals[id] = { names: names.slice(), at: Date.now() };
      d.locks[id] = true;
    } else {
      delete d.manuals[id];
      delete d.locks[id];
    }
    persistSrcData(sid, d);
    notify();
    return names.slice();
  }

  /** 显式赋予/移除——v0.6.30 薄壳：name → setManual([name])（清掉旧手动
   *  名单、保留自动角色）；name 空 → setManual([])（移除全部手动）。
   *  v0.5.6：meta 可选——有则写入角色视频快照（角色主页）。 */
  function assign(id, name, meta, srcId) {
    if (!id) return;
    var sid = srcId && srcId !== 'local' ? srcId : primaryId();
    setManual(id, name ? [name] : [], meta, sid);
  }

  /** v0.5.7 多源跨源赋予：给 item（归属源 a）的视频添加/移除角色 name——
   *  v0.6.30 多角色：**toggle 手动名单**（name 已在手动名单 → 移除，否则加入）。
   *  目标源 = **视频归属源 a**（a 源无同名角色 → ensureRoleOn 建副本复制
   *  icon/banner/keywords/exclusions；其他源数据不碰）。返回是否成功。 */
  function assignTo(item, name, meta) {
    var id = item && (item.id || item.bvid);
    if (!id || !name) return false;
    var vidSrc = (item.sourceId && item.sourceId !== 'local') ? item.sourceId : primaryId();
    var d = dataOf(vidSrc);
    ensureRoleOn(d, vidSrc, name);
    var oldManual = mNames(d, id) ? mNames(d, id).slice() : [];
    var list = oldManual.slice();
    var i = list.indexOf(name);
    if (i >= 0) list.splice(i, 1); else list.push(name);
    setManual(id, list, meta, vidSrc);
    return true;
  }

  /** v0.6.30 **自动赋予**（角色页搜索筛完的视频 / 批量场景）：
   *  - 目标源 = 视频归属源；无同名角色 → 建副本（复制头像/背景/关键词/排除词）
   *  - 写入 videoChars（追加，不动已有角色——多角色共存）
   *  - **不进 manuals（自动角色）**；**不进 charVideos 快照**（角色页
   *    「手动添加」段只含手动赋予）
   *  - 清 removedIds 标记（显式赋予，允许自然匹配）
   *  - 不 notify（批量搜索场景避免雪崩，调用方自行广播）。返回是否成功。 */
  function assignAuto(item, name) {
    var id = item && (item.id || item.bvid);
    if (!id || !name) return false;
    var vidSrc = (item.sourceId && item.sourceId !== 'local') ? item.sourceId : primaryId();
    var d = dataOf(vidSrc);
    ensureRoleOn(d, vidSrc, name);
    // v0.6.64：**手动管理表**——用户手动操作过角色的视频不再自动赋予
    // （视频级标记；取代 v0.6.63 的角色级免疫，语义更强）
    if (d.managed[id]) return false;
    // v0.6.65：**角色级排除**——角色页排除过的视频不再自动赋予该角色
    // （不算手动管理；按（角色,源,id）记录）
    if (d.roleExcludes && d.roleExcludes[name] && d.roleExcludes[name][id]) return false;
    // v0.6.63：尊重手动移除标记——全视频免疫（true）或该角色免疫（对象
    // {name:true}）都不再自动赋予；原逻辑无条件清标记导致用户取消的自动
    // 角色在下次搜索/匹配时被重新加回（用户反馈「取消无效」）
    var rm = d.removedIds[id];
    if (rm === true) return false;
    if (rm && typeof rm === 'object' && rm[name]) return false;
    var arr = vcArr(d, id);
    if (arr) {
      if (arr.indexOf(name) >= 0) return true;      // 已拥有
    } else {
      arr = d.videoChars[id] = [];
    }
    arr.push(name);
    persistSrcData(vidSrc, d);
    return true;
  }

  /** 冲突解析——v0.6.30 废弃（无冲突概念，一个视频可属多个角色）。
   *  旧调用方（char-picker conflict 弹窗）已删除；保留空实现防外部引用崩。 */
  function resolveConflict() { /* noop */ }

  /** v0.6.63：**取消自动角色**（用户需求：自动添加的角色在修改角色页显示
   *  为已勾选、可取消）——从 videoChars 移除该角色 + 持久化**按角色免疫**
   *  标记（removedIds[id] = {name:true}）：之后 assignAuto / charForOn 自动
   *  匹配都不会再把它加回；手动名单（setManual）出现该角色则解除免疫。
   *  返回是否真的移除。 */
  function removeAutoChar(id, name, srcId) {
    if (!id || !name) return false;
    var sid = srcId && srcId !== 'local' ? srcId : primaryId();
    var d = dataOf(sid);
    var arr = vcArr(d, id);
    if (!arr) return false;
    var i = arr.indexOf(name);
    if (i < 0) return false;
    arr.splice(i, 1);
    if (!arr.length) delete d.videoChars[id];
    // v0.6.64：取消自动角色 = 手动管理过 → 入表（不再被自动管理）。
    // v0.6.63 的角色级免疫（对象）保留兼容（既有数据），新逻辑以表为准
    d.managed[id] = true;
    var rm = d.removedIds[id];
    if (rm === true) { /* 全免疫已生效 */ }
    else if (rm && typeof rm === 'object') { rm[name] = true; }
    else { d.removedIds[id] = {}; d.removedIds[id][name] = true; }
    persistSrcData(sid, d);
    notify();
    return true;
  }

  /** v0.6.64：视频是否在**手动管理表**（用户手动操作过角色 → 不再自动管理） */
  function isManaged(id, srcId) {
    if (!id) return false;
    var sid = srcId && srcId !== 'local' ? srcId : primaryId();
    var d = dataOf(sid);
    return !!(d.managed && d.managed[id]);
  }

  /** v0.6.64：手动管理表内视频 id 数组（角色页段1 数据源；按源） */
  function listManaged(srcId) {
    if (!srcId) return [];
    var d = dataOf(srcId);
    return d.managed ? Object.keys(d.managed) : [];
  }

  /* ---------- v0.6.65 角色级排除表 ---------- */

  /** 某源某角色是否排除某视频（排除 = 该角色不再自动赋予该视频 +
   *  从角色列表剔除；**不算手动管理**，不进 manManaged 表） */
  function isRoleExcluded(name, srcId, id) {
    if (!name || !id) return false;
    var sid = srcId && srcId !== 'local' ? srcId : primaryId();
    var d = dataOf(sid);
    return !!(d.roleExcludes && d.roleExcludes[name] && d.roleExcludes[name][id]);
  }

  /** 该角色在某源排除的视频 id 数组（角色页段2 剔除 / 段1 过滤用） */
  function roleExcludedIds(name, srcId) {
    if (!name || !srcId) return [];
    var d = dataOf(srcId);
    if (!d.roleExcludes || !d.roleExcludes[name]) return [];
    return Object.keys(d.roleExcludes[name]);
  }

  /** 设置/清除角色级排除（excl=true 排除；false/undefined 恢复）。
   *  只写排除表（+persist+notify），**不碰** videoChars/manuals——
   *  调用方（角色页悬停按钮）先 removeRoleFromVideo 剔除角色再调此函数 */
  function setRoleExcluded(name, srcId, id, excl) {
    if (!name || !id) return false;
    var sid = srcId && srcId !== 'local' ? srcId : primaryId();
    var d = dataOf(sid);
    var re = d.roleExcludes || (d.roleExcludes = {});
    var per = re[name] || (re[name] = {});
    if (excl) per[id] = true;
    else {
      delete per[id];
      if (!Object.keys(per).length) delete re[name];
    }
    persistSrcData(sid, d);
    notify();
    return true;
  }

  /** 从某视频的**角色列表**剔除指定角色（videoChars 数组移除 + 手动名单
   *  移除 + charVideos 快照移除）。**不标记手动管理**（v0.6.65 语义：
   *  角色页排除不算手动管理，不进 manManaged 表——之后的自动匹配由
   *  排除表单独拦截）。返回是否真的移除。 */
  function removeRoleFromVideo(id, srcId, roleName) {
    if (!id || !roleName) return false;
    var sid = srcId && srcId !== 'local' ? srcId : primaryId();
    var d = dataOf(sid);
    var dirty = false;
    var arr = vcArr(d, id);
    if (arr && arr.indexOf(roleName) >= 0) {
      arr = arr.filter(function (x) { return x !== roleName; });
      if (arr.length) d.videoChars[id] = arr; else delete d.videoChars[id];
      dirty = true;
    }
    var mn = mNames(d, id);
    if (mn && mn.indexOf(roleName) >= 0) {
      mn = mn.filter(function (x) { return x !== roleName; });
      if (mn.length) d.manuals[id] = { names: mn, at: d.manuals[id].at || Date.now() };
      else delete d.manuals[id];
      dirty = true;
    }
    if (d.charVideos && d.charVideos[roleName] && Array.isArray(d.charVideos[roleName])) {
      var before = d.charVideos[roleName].length;
      d.charVideos[roleName] = d.charVideos[roleName].filter(function (m) {
        return !m || m.id !== id;
      });
      if (d.charVideos[roleName].length !== before) {
        if (!d.charVideos[roleName].length) delete d.charVideos[roleName];
        dirty = true;
      }
    }
    if (dirty) {
      persistSrcData(sid, d);
      notify();
    }
    return dirty;
  }

  /** v0.5.6 第五轮：该视频是否有**手动**角色（manuals 名单非空；
   *  与自动赋予区分——自动角色 = videoChars - manuals）。v0.5.7：srcId 缺省主源 */
  function isManual(id, srcId) {
    if (!id) return false;
    var d = dataOf(srcId && srcId !== 'local' ? srcId : primaryId());
    var mn = mNames(d, id);
    return !!(mn && mn.length);
  }

  /** v0.5.6 第五轮：还原角色（重置）——去除手动指定（删 manual/lock/全部
   *  角色），然后按标题自然重评（可能恢复自动角色 / 无角色）。
   *  v0.6.30 多角色：全部角色清除后重评（标题命中全部自动赋予）。
   *  返回是否曾为手动指定。title 缺省则只清理不重评。v0.5.7：srcId 缺省主源 */
  function unassign(id, title, srcId) {
    if (!id) return false;
    var sid = srcId && srcId !== 'local' ? srcId : primaryId();
    var d = dataOf(sid);
    var had = isManual(id, sid);
    var oldManual = had ? mNames(d, id).slice() : [];
    delete d.manuals[id];
    delete d.locks[id];
    delete d.videoChars[id];
    delete d.conflicts[id];
    d.removedIds[id] = false;                    // 还原 = 允许自然重评（值标记防 dictionary 退化）
    // v0.6.64：重置 = 手动操作过 → 入表（不再自动管理；charForOn 已检查
    // managed → 下方自然重评对表内视频自动返回 none，不会重新赋予）
    d.managed[id] = true;
    oldManual.forEach(function (n) { touchVideoOn(d, n, id, null, true); });   // 快照移除
    if (had && title) charForOn(d, id, title, function () {});   // 自然重评（写回自动角色）
    persistSrcData(sid, d);
    notify();                                           // 再广播（UI 读到最终态）
    return had;
  }

  /** v0.5.6 第五轮：观看满 5s 自动将**所有**角色转为手动（用户需求
   *  v0.6.30 明确：一个视频一旦实际播放超 5s，其所有自动赋予的角色
   *  就变成手动赋予的角色）——
   *  幂等（已有手动名单不再重复）；无角色/无自动角色不动作（调用方
   *  watched.mark 在播放满 5s 后触发；无自动角色时计时无需启动，这里
   *  直接短路）。隐式操作（不广播——打开弹窗时实时读到最终态）。
   *  v0.5.7：srcId 缺省主源 */
  function autoToManual(id, srcId) {
    if (!id) return false;
    var sid = srcId && srcId !== 'local' ? srcId : primaryId();
    var d = dataOf(sid);
    if (mNames(d, id) && mNames(d, id).length) return false;      // 已有手动 → 不重复
    var arr = vcArr(d, id);
    if (!arr || !arr.length) return false;              // 无角色 → 无需计时
    d.manuals[id] = { names: arr.slice(), at: Date.now() };
    d.locks[id] = true;
    d.managed[id] = true;                    // v0.6.64：转手动 = 手动管理过 → 入表
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
    setBannerFocus: setBannerFocus,       // v0.6.56：背景图焦点（原图归一化）
    setFeatured: setFeatured,             // v0.5.6 第四轮：代表作 videoId
    featuredOf: featuredOf,               // v0.5.6 第十九轮：全局代表作圆点
    setKeywords: setKeywords,
    setExclusions: setExclusions,       // v0.5.9 旧名别名 → setGlobalExclusions
    setGlobalExclusions: setGlobalExclusions,     // v0.6.31：全局排除词
    setKeywordExclusions: setKeywordExclusions,   // v0.6.31：独立词排除（按关键词绑定）
    removeKeyword: removeKeyword,                 // v0.6.41：全源删关键词
    removeGlobalExclusion: removeGlobalExclusion, // v0.6.41：全源删全局排除词
    removeKeywordExclusion: removeKeywordExclusion, // v0.6.41：全源删独立词排除
    kwHitTitle: kwHitTitle,             // v0.6.31：独立词命中判定（导出供角色页等复用）
    rename: rename,                     // v0.5.9：角色改名（全关联迁移）
    matchTitle: matchTitle,
    getChar: getChar,                     // v0.6.30：返回角色名**数组**
    getManual: getManual,                 // v0.6.30：手动角色名单（弹窗草稿）
    getConflict: getConflict,             // 废弃（恒 null）
    charFor: charFor,                     // v0.6.30：{kind:'char', chars:[...]}
    assign: assign,                       // v0.6.30：setManual 薄壳
    assignTo: assignTo,               // v0.5.7 多源：跨源 toggle 手动（缺则建副本）
    assignAuto: assignAuto,           // v0.6.30：自动赋予（搜索/批量，不写快照）
    removeAutoChar: removeAutoChar,   // v0.6.63：取消自动角色（移除 + 入手动管理表）
    isManaged: isManaged,             // v0.6.64：视频是否手动管理过（表内）
    listManaged: listManaged,         // v0.6.64：手动管理表内视频 id 数组（按源）
    isRoleExcluded: isRoleExcluded,   // v0.6.65：角色级排除（角色名,源,id）
    roleExcludedIds: roleExcludedIds, // v0.6.65：某角色在某源排除的视频 id 数组
    setRoleExcluded: setRoleExcluded, // v0.6.65：设置/清除角色级排除
    removeRoleFromVideo: removeRoleFromVideo, // v0.6.65：从视频角色列表剔除角色（不算手动管理）
    setManual: setManual,             // v0.6.30：整体设置手动名单（弹窗提交）
    resolveConflict: resolveConflict,     // 废弃（空实现兼容）
    isManual: isManual,               // v0.5.6 第五轮：手动名单非空
    unassign: unassign,               // v0.5.6 第五轮：还原角色（去除手动指定）
    autoToManual: autoToManual,       // v0.5.6 第五轮：观看 5s 所有角色转手动
    find: find,                       // v0.5.6：按名查找（角色主页）
    videosOf: videosOf,               // v0.5.6：角色名下视频快照
    toggleFollow: toggleFollow,       // v0.5.6 第十一轮：关注/取消关注
    isFollowed: isFollowed,           // v0.5.6 第十一轮：是否已关注
    onChange: onChange,

    /** v0.6.4 聚合合并：成员（及被合并组 extraGids）的角色设置迁移到组
     *  （videoChars 的 'grp' 源键，组 id 'grp:xxx'）。
     *  v0.6.30 多角色：全部角色直接并成数组（无冲突概念——一个视频
     *  可属多个角色；组卡显示全部）。成员原角色保留（解除聚合后可恢复）。
     *  仅手动合并路径调用。 */
    absorbToGroup: function (gid, members, extraGids) {
      var sid = 'grp';
      var d = srcDataOf(sid);
      var names = [];
      function addName(n) {
        if (n && typeof n === 'string' && names.indexOf(n) === -1) names.push(n);
      }
      function collect(arr) { if (Array.isArray(arr)) arr.forEach(addName); }
      collect(vcArr(d, gid));
      collect(d.conflicts[gid]);
      (members || []).forEach(function (m) {
        try { collect(vcArr(srcDataOf(m.src), String(m.id))); } catch (e) { /* noop */ }
      });
      (extraGids || []).forEach(function (og) {
        try { collect(vcArr(d, og)); collect(d.conflicts[og]); } catch (e) { /* noop */ }
      });
      if (!names.length) return;   // 无角色，不动
      d.videoChars[gid] = names;
      delete d.conflicts[gid];
      (extraGids || []).forEach(function (og) {
        delete d.videoChars[og];
        delete d.conflicts[og];
      });
      persistSrcData(sid, d);
    },
  };
})();
