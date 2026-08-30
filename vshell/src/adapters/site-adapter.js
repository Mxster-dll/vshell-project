/* ============================================================
 * site-adapter — 站点适配器接口契约 + 注册表
 *
 * 通用视频网站套壳的「通用」所在：任何站点实现以下接口即可接入。
 * v0.5.10 独立化：**无内置数据源**——acfun/bilibili 也作为独立插件
 * 文件（用户通过设置面板「添加数据源」注册，startup ensureLoaded 注入）。
 * current()/adapterFor() 纯注册表匹配（按 meta.id）。
 * 契约（全部返回 Promise）：
 *   meta: { id, name, match(location) }
 *   getHomeSections()        → [{ key, title, subs: [{ key, title }] }]   主页大分类+小分类
 *   getCategoryVideos(key, page)  → { items: VideoItem[], hasMore }       分类视频墙（key=小分类）
 *   getHomeFeed(page)        → { items: VideoItem[], hasMore }            主页视频墙
 *   getVideoDetail(id)       → VideoDetail                               详情页
 *   getPlayInfo(id)          → { type:'dash'|'durl', dash?, durl?, duration }  播放/下载源
 *   getRelated(id)           → VideoItem[]                               相关推荐
 *   search(keyword, page)    → { items: VideoItem[], hasMore }            搜索
 *   parseVideoId(input)      → id | null                                 从 URL/文本提取视频 id
 *
 * VideoItem: { id, title, pic, duration, pubdate?, owner:{name, face?},
 *              stat:{view, like?, danmaku?} }
 *   - pubdate: 秒级时间戳（卡片显示日期；缺失则省略）
 *   - stat.danmaku: 弹幕数（卡片图片区左下显示「播放 · 弹幕」；缺失则只显示播放）
 *   - owner.face: 头像 URL（详情页 UP 主行；缺失用图标占位）
 *   - pic/owner.face 可为完整 URL 或相对路径（v0.6.0 相对路径方案）：
 *     源返回可附 baseUrl（当前域名，见下）；source-feed 缓存时把以 baseUrl
 *     开头的 URL 相对化（去域名存相对路径），域名变了下次拉数据自动带新
 *     域名拼回。未提供 baseUrl 时 source-feed 从 items[].pic 自动提取域名。
 *
 * 【v0.6.0 可选返回 baseUrl】所有契约方法（getHomeFeed/search/getCategoryVideos/
 *   getRelated 等返回 {items, hasMore} 的方法）可额外返回 baseUrl 字段——
 *   数据源当前域名（如 'https://imgs.aixifan.com'）。用于缓存相对路径化。
 *   不返回也兼容（source-feed 自动提取）。
 * VideoDetail: VideoItem + { desc, cid, pages? }
 *   pages: [{ cid, page, part, duration }]（分 P；缺失则单 P）
 *
 * 【插件数据源文件格式】（v0.5.6 用户需求：Flutter 添加数据源只记本地文件
 *  路径，切换/启动时读文件注入执行）。文件 = 一个 IIFE，末尾注册：
 *
 *   (function () {
 *     'use strict';
 *     var V = window.VShell;
 *     V.siteAdapters.register({
 *       meta: { id: 'mysite', name: '我的站' },     // id = dataSource 值
 *       getHomeSections: function () { return Promise.resolve([]); },
 *       getCategoryVideos: function (key, page) { ... },
 *       getHomeFeed: function (page) {
 *         return V.net.fetch('https://api.mysite.com/feed?p=' + page)
 *           .then(function (r) {
 *             var j = JSON.parse(r.text);           // V.net.fetch 双路径：
 *             return {                              // 原生 fetch → 失败降级
 *               items: j.list.map(function (v) {    // Flutter 桥代理（无 CORS）
 *                 return { id: v.vid, title: v.title, pic: v.cover,
 *                          duration: v.dur, owner: { name: v.author },
 *                          stat: { view: v.views } };
 *               }),
 *               hasMore: j.has_more,
 *             };
 *           });
 *       },
 *       getVideoDetail: function (id) { ... },
 *       getPlayInfo: function (id) { ... },
 *       getRelated: function (id) { ... },
 *       search: function (q, page) { ... },
 *       parseVideoId: function (s) { ... },
 *     });
 *   })();
 *
 *  注意：域名可变（用户自行维护更新逻辑）——base URL 从 V.net.fetch 的
 *  参数/文件内配置读取即可，改文件即生效（下次切换/启动注入新版）。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var adapters = [];

  function register(adapter) {
    adapters.push(adapter);
  }

  // ---- v0.6.0 封面解密器注册表 ----
  // 加密封面数据源（如 17c：封面是密文，需 fetch + XOR + blob 才可显示）。
  // blob URL 是会话级对象，无法持久化进 source-feed 缓存（重启失效 → 封面
  // 黑）。约定：这类源返回的 pic 存「原始加密 URL」（可持久化），渲染层
  // （video-card）发现该源注册了解密器 → 懒解密：pic 先空，异步解密后回填。
  //   registerPicDecryptor(id, fn)：fn(rawUrl) → Promise<displayUrl | null>
  //   picDecryptorFor(id) → fn | null
  var picDecryptors = {};
  function registerPicDecryptor(id, fn) {
    if (id && typeof fn === 'function') picDecryptors[String(id)] = fn;
  }
  function picDecryptorFor(id) {
    return (id && picDecryptors[String(id)]) || null;
  }

  // ---- v0.5.9 调试：数据源请求 toast（用户需求：调试时右下角弹信息）----
  // 包装适配器契约方法，调用时 V.toast 右下角提示 [源名] 方法名。
  // 开关：window.__VS_REQ_DEBUG__ === false 关闭（默认开启）。
  var DEBUG_METHODS = ['getHomeSections', 'getCategoryVideos', 'getHomeFeed',
    'getVideoDetail', 'getPlayInfo', 'getRelated', 'search', 'parseVideoId'];
  var wrappedCache = new WeakMap();

  function reqDebugOn() {
    return window.__VS_REQ_DEBUG__ !== false;
  }
  function reqToast(name, method, arg0) {
    try {
      var V = window.VShell;
      if (!V || !V.toast || !V.toast.info) return;
      var label = '[' + name + '] ' + method;
      if (method === 'search' && arg0 !== undefined && arg0 !== null && arg0 !== '') {
        label += ' · ' + String(arg0).slice(0, 20);
      }
      V.toast.info(label);
    } catch (e) { /* noop */ }
  }
  function wrapDebug(adapter, id) {
    if (!adapter || typeof adapter !== 'object') return adapter;
    if (!reqDebugOn()) return adapter;
    if (wrappedCache.has(adapter)) return wrappedCache.get(adapter);
    var name = (adapter.meta && adapter.meta.name) || id || 'unknown';
    var wrapped = new Proxy(adapter, {
      get: function (target, prop) {
        var value = target[prop];
        if (DEBUG_METHODS.indexOf(prop) >= 0 && typeof value === 'function') {
          return function () {
            reqToast(name, prop, arguments[0]);
            return value.apply(target, arguments);
          };
        }
        return value;
      },
    });
    wrappedCache.set(adapter, wrapped);
    return wrapped;
  }

  /** 当前站点适配器（v0.5.6 数据源设置决策；v0.5.10 独立化：**无内置源**）：
   *  所有源（含 acfun/bilibili）都是插件——按 meta.id 在注册表匹配。
   *  插件文件已由 data-source.ensureLoaded 注入注册；未加载/不存在 → null，
   *  页面显示无数据源空态。
   *  v0.5.7 多源：ds = multisource.primary()（激活集第一个，隐私已排除）；
   *  multisource 未就绪（加载早期）回退 dataSource.get() */
  function current() {
    var ds = null;
    if (V.multisource && typeof V.multisource.primary === 'function') {
      ds = V.multisource.primary();
    } else if (V.dataSource && V.dataSource.get) {
      ds = V.dataSource.get();
    }
    if (ds == null) return null;
    for (var i = 0; i < adapters.length; i++) {
      if (adapters[i].meta && adapters[i].meta.id === ds) return wrapDebug(adapters[i], ds);
    }
    return null;   // 插件源未注入/不存在
  }

  /** v0.5.7 多源：按源 id 取适配器（详情页/收藏等按视频归属源路由）。
   *  未注入/不存在 → null。v0.5.10 独立化：acfun/bilibili 也是插件，
   *  无特殊分支，纯注册表匹配。 */
  function adapterFor(id) {
    if (!id) return null;
    for (var i = 0; i < adapters.length; i++) {
      if (adapters[i].meta && adapters[i].meta.id === id) return wrapDebug(adapters[i], id);
    }
    return null;
  }

  V.siteAdapters = {
    register: register,
    current: current,
    adapterFor: adapterFor,
    all: function () { return adapters.slice(); },
    registerPicDecryptor: registerPicDecryptor,
    picDecryptorFor: picDecryptorFor,
  };
})();
