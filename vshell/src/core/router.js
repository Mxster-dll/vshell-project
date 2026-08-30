/* ============================================================
 * router — hash 路由
 * 路由表：'/' 主页 | '/category/:tid' 分类墙 | '/video/:id' 详情
 *        '/watchlist' 待看/收藏 | '/downloads' 下载管理 | '/search?q='
 * 页面切换动画 + scroll 复位 + 历史前进后退
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  /** 解析 #/path?query → { path, segs, query } */
  function parse(hash) {
    var h = (hash || '').replace(/^#/, '') || '/';
    var qIdx = h.indexOf('?');
    var path = qIdx >= 0 ? h.slice(0, qIdx) : h;
    var qs = qIdx >= 0 ? h.slice(qIdx + 1) : '';
    // v0.5.6 第十三轮：segs 统一安全解码——调用方（video-card href /
    // feed url / role nav）都经 encodeURIComponent 或浏览器自动编码，
    // 不在此解码会导致参数携带 %3A/%E4%B8%AD 等编码态（本地视频 id
    // 'local:xxx' 被编码成 'local%3Axxx' 后匹配不到 /^local:/ → 误走
    // 网站 API → -400）。query 已有解码，此处只补 segs。
    var segs = path.split('/').filter(Boolean).map(function (s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    });
    var query = {};
    if (qs) {
      qs.split('&').forEach(function (kv) {
        var i = kv.indexOf('=');
        if (i > 0) query[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
        else if (kv) query[decodeURIComponent(kv)] = '';
      });
    }
    return { path: path, segs: segs, query: query };
  }

  /** 解析成路由描述：{ name, params, query }
   *  v0.5.7 多源：/category/<源>/<key>（旧格式 /category/<key> → 主源）；
   *  /video/<源>:<id>（旧格式 /video/<id> → 主源） */
  function resolve(hash) {
    var p = parse(hash);
    var segs = p.segs;
    if (segs.length === 0) return { name: 'home', params: {}, query: p.query };
    switch (segs[0]) {
      case 'category':
        if (segs.length >= 3) {
          return { name: 'category', params: { src: segs[1], tid: segs[2] }, query: p.query };
        }
        return { name: 'category', params: { tid: segs[1] }, query: p.query };
      case 'video': {
        var vid = segs[1] || '';
        var src = null;
        if (vid.indexOf(':') > 0) {
          var ci = vid.indexOf(':');
          src = vid.slice(0, ci);
          vid = vid.slice(ci + 1);
        }
        return { name: 'video', params: { id: vid, src: src }, query: p.query };
      }
      case 'watchlist': return { name: 'watchlist', params: {}, query: p.query };
      case 'fav': return { name: 'watchlist', params: { type: 'fav' }, query: p.query };
      case 'downloads': return { name: 'downloads', params: {}, query: p.query };
      case 'search': return { name: 'search', params: {}, query: p.query };
      case 'tagsearch': return { name: 'searchtags', params: {}, query: p.query };
      case 'blacklist': return { name: 'blacklist', params: {}, query: p.query };
      case 'settings': return { name: 'settings', params: {}, query: p.query };   // v0.5.12：设置页
      case 'role': return { name: 'role', params: { name: segs[1] }, query: p.query };   // v0.5.6：角色主页
      default: return { name: 'home', params: {}, query: p.query };
    }
  }

  function nav(path) {
    var target = '#' + path;
    if (location.hash === target) {
      // 同路由重复导航：重新触发渲染
      emit();
    } else {
      location.hash = target;
    }
  }

  var handlers = {};
  function on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); }

  function emit() {
    var route = resolve(location.hash);
    var list = handlers[route.name] || [];
    // 依次调用，页面自己负责挂载与清理
    list.forEach(function (fn) {
      try { fn(route); } catch (e) { console.error('[vshell] route handler error', route, e); }
    });
  }

  var started = false;
  function start() {
    if (started) return;
    started = true;
    window.addEventListener('hashchange', emit);
    // 首帧
    if (location.hash === '') {
      // 保持空 hash → 主页
      history.replaceState(null, '', '#/');
    }
    emit();
  }

  V.router = {
    parse: parse,
    resolve: resolve,
    nav: nav,
    on: on,
    start: start,
  };
})();
