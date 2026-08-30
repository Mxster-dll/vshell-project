/* ============================================================
 * store — GM_setValue 持久化封装 + 导入/导出
 * 命名空间：VShell.store
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};
  var PREFIX = 'vshell.';

  function hasGM() {
    return typeof GM_setValue === 'function' && typeof GM_getValue === 'function';
  }

  var mem = {};
  if (!hasGM()) {
    // 分键存储：从全部 vshell.* 独立键加载（v0.5.6 OOM 修复第二版）
    try {
      for (var li = 0; li < localStorage.length; li++) {
        var lk = localStorage.key(li);
        if (lk && lk.indexOf(PREFIX) === 0) {
          var lv = localStorage.getItem(lk);
          if (lv !== null) mem[lk] = lv;
        }
      }
    } catch (e) { mem = {}; }
  }
  // v0.5.6 OOM 修复（第二版）：从单键全量写迁移到**分键存储**——
  // 每个 vshell.<key> 独立 localStorage key，set/del 只写单个小键
  // （<1KB），不再 JSON.stringify 整个 mem（715KB+，含 base64 封面）。
  // 此前点「完成」时 persistVideo 的 7 连全量写（即使批处理合并成 1 次
  // 715KB setItem）在 WebView2 渲染进程实测 OOM 崩溃（"此页存在问题
  // Out of Memory"）；分键后单键写入永不触发。启动时一次性迁移旧单键。
  if (!hasGM()) {
    var legacyRaw = null;
    try { legacyRaw = localStorage.getItem('vshell.mem'); } catch (e) { /* noop */ }
    if (legacyRaw) {
      try {
        var legacy = JSON.parse(legacyRaw);
        Object.keys(legacy).forEach(function (k) {
          if (k.indexOf(PREFIX) === 0 && !(k in mem)) {
            mem[k] = legacy[k];
            try { localStorage.setItem(k, legacy[k]); } catch (e2) { /* quota */ }
          }
        });
        localStorage.removeItem('vshell.mem');
      } catch (e) { /* 旧格式损坏则保留不动 */ }
    }
  }

  /** get(key, def) — 读取（自动 JSON 解析） */
  function get(key, def) {
    var full = PREFIX + key;
    if (hasGM()) {
      var raw = GM_getValue(full, undefined);
      if (raw === undefined) return def;
      try { return JSON.parse(raw); } catch (e) { return raw; }
    }
    if (full in mem) {
      try { return JSON.parse(mem[full]); } catch (e) { return mem[full]; }
    }
    return def;
  }

  /** 浅拷贝普通对象/数组——规避两类 V8 慢路径：
   *  ① dictionary-mode 对象的 JSON.stringify（反复 delete 后退化）；
   *  ② **稀疏数组**（length 巨大的数组，如 removedIds 历史数据被当数组
   *  索引赋值后 length=48800004）——slice/stringify 遍历 length 级数。
   *  都用 Object.keys（只返回实际元素）重建紧凑结构。其他类型原样返回。 */
  function normalize(v) {
    if (Array.isArray(v)) {
      var ks = Object.keys(v);
      var out = new Array(ks.length);
      for (var ai = 0; ai < ks.length; ai++) out[ai] = v[ks[ai]];
      return out;
    }
    if (v && typeof v === 'object' && v.constructor === Object) {
      var o = {};
      var ko = Object.keys(v);
      for (var ni = 0; ni < ko.length; ni++) o[ko[ni]] = v[ko[ni]];
      return o;
    }
    return v;
  }

  /** set(key, value) — 写入（自动 JSON 序列化；分键存储：单键 <1KB） */
  function set(key, value) {
    var full = PREFIX + key;
    var raw = JSON.stringify(normalize(value));
    if (hasGM()) {
      GM_setValue(full, raw);
    } else {
      mem[full] = raw;
      schedulePersist(full);
    }
  }

  function del(key) {
    var full = PREFIX + key;
    if (hasGM()) {
      GM_deleteValue(full);
    } else {
      delete mem[full];
      schedulePersist(full);
    }
  }

  // v0.5.6 性能修复：localStorage 落盘延迟到宏任务（setTimeout 0）批量合并。
  // WebView2 的 localStorage.setItem 每次同步开销约 150-200ms（实测
  // persistVideo 7 连写 = resolveConflict 同步阻塞 1.5s → 点「完成」卡顿）。
  // 同步路径只更新内存 mem（get 从 mem 读，语义不变），落盘在渲染帧后执行。
  var pendingKeys = [];
  var persistTimer = null;
  function flushPersist() {
    persistTimer = null;
    var keys = pendingKeys;
    pendingKeys = [];
    for (var fi = 0; fi < keys.length; fi++) {
      var fk = keys[fi];
      try {
        if (fk in mem) localStorage.setItem(fk, mem[fk]);
        else localStorage.removeItem(fk);
      } catch (e) { /* quota */ }
    }
  }
  function schedulePersist(full) {
    if (pendingKeys.indexOf(full) < 0) pendingKeys.push(full);
    if (persistTimer) return;
    persistTimer = setTimeout(flushPersist, 0);
  }

  /** 全量导出为 JSON 字符串（含全部 vshell.* 键） */
  function exportJSON() {
    var out = {};
    if (hasGM()) {
      var list = typeof GM_listValues === 'function' ? GM_listValues() : [];
      list.forEach(function (k) {
        if (k.indexOf(PREFIX) === 0) {
          var raw = GM_getValue(k, undefined);
          if (raw !== undefined) {
            try { out[k.slice(PREFIX.length)] = JSON.parse(raw); }
            catch (e) { out[k.slice(PREFIX.length)] = raw; }
          }
        }
      });
    } else {
      Object.keys(mem).forEach(function (k) {
        if (k.indexOf(PREFIX) === 0) {
          try { out[k.slice(PREFIX.length)] = JSON.parse(mem[k]); }
          catch (e) { out[k.slice(PREFIX.length)] = mem[k]; }
        }
      });
    }
    return JSON.stringify(out, null, 2);
  }

  /** 从 JSON 字符串导入（合并覆盖） */
  function importJSON(text) {
    var data = JSON.parse(text);
    var count = 0;
    Object.keys(data).forEach(function (k) {
      set(k, data[k]);
      count++;
    });
    return count;
  }

  /** 下载 JSON 到本地 */
  function downloadJSON(filename) {
    var blob = new Blob([exportJSON()], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'vshell-backup.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /** 从文件选择器读入并导入 */
  function importFromFile() {
    return new Promise(function (resolve, reject) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = function () {
        var f = input.files && input.files[0];
        if (!f) return reject(new Error('未选择文件'));
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var n = importJSON(String(reader.result));
            resolve(n);
          } catch (e) { reject(e); }
        };
        reader.onerror = function () { reject(new Error('读取失败')); };
        reader.readAsText(f);
      };
      input.click();
    });
  }

  /** 数据源作用域键：base + '.' + 数据源 id（v0.5.6 用户需求：
   *  收藏/待看/黑名单/角色/代表作按数据源隔离存储）。
   *  srcId 缺省 → dataSource.get()（兼容单源语义；模块加载期 V.dataSource
   *  尚未就绪 → 回退 'acfun'，app.js boot 时统一 reload 对齐真实源）。
   *  v0.5.7 多源：srcId 显式传入（按视频归属源读写）。 */
  function scopedKey(base, srcId) {
    var src = srcId || 'acfun';
    try {
      if (!srcId && V.dataSource && typeof V.dataSource.get === 'function') {
        var s = V.dataSource.get();
        if (typeof s === 'string' && s) src = s;
      }
    } catch (e) { /* noop */ }
    return base + '.' + src;
  }

  /** 旧数据（无后缀键）→ 当前源键的一次性迁移。幂等：
   *  新键已有数据 → **删除无后缀残留**（防 __VS_SYNC__ 补缺重建后
   *  切源时被误迁移到新源）并返回 false；旧键不存在 → 不动。
   *  发生迁移返回 true。 */
  function migrateScoped(base, scoped) {
    var old = get(base, undefined);
    if (old === undefined) return false;
    var nv = get(scoped, undefined);
    if (nv !== undefined) {
      del(base);
      return false;
    }
    set(scoped, old);
    del(base);
    return true;
  }

  // 数据源作用域键集合（v0.5.6 用户需求：收藏/待看/黑名单/角色/代表作/
  // 搜索缓存按数据源隔离）——__VS_SYNC__ 补缺时这些键落到当前源键。
  var SCOPED_BASES = ['saved', 'watched', 'blacklist', 'characters',
    'videoChars', 'charConflicts', 'charLocks', 'charManuals', 'charVideos',
    'charFollows', 'charRemoved', 'searchCache'];

  /** Flutter VsStore 启动快照（window.__VS_SYNC__，main.dart 经
   *  addScriptToExecuteOnDocumentCreated 注入）→ **补缺式**同步：
   *  本地已有键（web 运行时数据，最新）不覆盖；缺失键从快照补齐。
   *  数据源作用域键补到**当前源**的 scopedKey（此时 data-source 模块
   *  已就绪；否则无后缀键会被重建，下次切源时被 migrateScoped 误迁）。
   *  调用时机：data-source.js 模块末尾（早于 app.js boot 的 reload）。 */
  function syncFromSync(sync) {
    if (!sync || typeof sync !== 'object') return 0;
    var n = 0;
    Object.keys(sync).forEach(function (k) {
      var full = SCOPED_BASES.indexOf(k) >= 0 ? scopedKey(k) : (PREFIX + k);
      if (full in mem) return;          // 本地优先
      try {
        var raw = JSON.stringify(sync[k]);
        mem[full] = raw;
        try { localStorage.setItem(full, raw); } catch (e) { /* quota */ }
        n++;
      } catch (e) { /* noop */ }
    });
    return n;
  }

  V.store = {
    get: get,
    set: set,
    del: del,
    scopedKey: scopedKey,
    migrateScoped: migrateScoped,
    syncFromSync: syncFromSync,
    exportJSON: exportJSON,
    importJSON: importJSON,
    downloadJSON: downloadJSON,
    importFromFile: importFromFile,
  };
})();
