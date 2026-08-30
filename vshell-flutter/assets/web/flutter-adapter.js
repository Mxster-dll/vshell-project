/* ============================================================
 * flutter-adapter — 桥到 Flutter 后端（平台分发：WebView2 / inappwebview）
 * 契约与 site-adapter 一致（9 方法，全部 Promise）：
 *   getHomeSections / getCategoryVideos / getHomeFeed /
 *   getVideoDetail / getPlayInfo / getRelated / search / parseVideoId
 * JS 侧：postNative({id, method, args}) →
 *   Windows：window.chrome.webview.postMessage(对象)
 *   Android：window.flutter_inappwebview.postMessage(JSON 字符串)
 * Dart 侧监听 → 后端处理（AcFun API/持久化等）→ evaluateJavascript 回调
 *   __VS_FLUTTER_RESOLVE__(id, ok, json)
 * ============================================================ */
(function () {
  'use strict';
  var seq = 0;
  var pending = {}; // id → {resolve, reject}

  // 平台分发：返回 {postMessage(obj)} 兼容对象（WebView2）
  function bridge() {
    if (typeof window.chrome !== 'undefined' && window.chrome.webview) {
      return window.chrome.webview; // Windows WebView2
    }
    return null;
  }

  // Android（flutter_inappwebview）：callHandler 直接返回结果（Dart 回调
  // 返回值 {ok,result|error} 自动序列化回 JS Promise）——无需 RESOLVE 回调
  function isInApp() {
    return typeof window.flutter_inappwebview !== 'undefined' &&
      window.flutter_inappwebview.callHandler;
  }

  function call(method, args) {
    return new Promise(function (resolve, reject) {
      var id = 'f' + (++seq);
      if (isInApp()) {
        window.flutter_inappwebview
          .callHandler('vsBridge', JSON.stringify({
            id: id, method: method, args: args || []
          }))
          .then(function (res) {
            if (res && res.ok) resolve(res.result);
            else reject(new Error((res && res.error) || 'flutter error'));
          })
          .catch(function (e) { reject(e); });
        return;
      }
      var wv = bridge();
      if (!wv) {
        reject(new Error('flutter bridge not available'));
        return;
      }
      pending[id] = { resolve: resolve, reject: reject };
      try {
        wv.postMessage({ id: id, method: method, args: args || [] });
      } catch (e) {
        delete pending[id];
        reject(e);
      }
    });
  }

  // Dart → JS 响应入口（Dart 侧 executeJavaScript 调用）
  window.__VS_FLUTTER_RESOLVE__ = function (id, ok, json) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    if (ok) {
      p.resolve(json ? JSON.parse(json) : null);
    } else {
      p.reject(new Error(json || 'flutter error'));
    }
  };

  window.__VSHELL_ADAPTER__ = {
    meta: {
      id: 'flutter',
      name: 'Flutter 后端',
      match: function () { return true; },
    },
    getHomeSections: function () { return call('getHomeSections'); },
    getCategoryVideos: function (key, page) {
      return call('getCategoryVideos', [key, page]);
    },
    getHomeFeed: function (page) { return call('getHomeFeed', [page]); },
    getVideoDetail: function (id) { return call('getVideoDetail', [id]); },
    getPlayInfo: function (id, cid) { return call('getPlayInfo', [id, cid]); },
    getRelated: function (id) { return call('getRelated', [id]); },
    search: function (q, page) { return call('search', [q, page]); },
    parseVideoId: function (s) { return call('parseVideoId', [s]); },
    // ---- 下载桥（性能敏感路径原生化）：medl 委托 Flutter 引擎 ----
    downloadStart: function (args) { return call('downloadStart', [args.url, args.name]); },
    downloadCancel: function (id) { return call('downloadCancel', [id]); },
  };

  // ---- 下载事件分发（Flutter → JS）：Dart 侧 DownloadManager 状态变化
  // 经 executeScript 调 window.__VS_DL__(taskId, json) → 分发给 medl 桥任务
  // 注册的监听（__VS_DL_EVENTS__[taskId] = {onProgress, onDone, onError}）。
  // json: {status, progress(0-100), error, savePath} ----
  window.__VS_DL__ = function (taskId, json) {
    var ev = window.__VS_DL_EVENTS__ && window.__VS_DL_EVENTS__[taskId];
    if (!ev) return;
    var d;
    try { d = JSON.parse(json); } catch (e) { return; }
    if (d.status === 'done') {
      if (ev.onDone) ev.onDone();
    } else if (d.status === 'failed' || d.status === 'canceled') {
      if (ev.onError) ev.onError(new Error(d.error || d.status));
    } else {
      if (ev.onProgress && typeof d.progress === 'number') {
        ev.onProgress(d.progress);
      }
    }
  };

  // ---- 持久化桥：V.store.set/del 写穿到 Flutter VsStore（shared_preferences，
  // 键名 'vshell.' 前缀两边一致 → 与原生版数据共享）。fire-and-forget。 ----
  // 平台分发：Android callHandler / Windows WebView2 postMessage
  function postNativeFire(msg) {
    if (isInApp()) {
      try {
        window.flutter_inappwebview
          .callHandler('vsBridge', JSON.stringify(msg));
        return true;
      } catch (e) { return false; }
    }
    var wv = bridge();
    if (!wv) return false;
    try {
      wv.postMessage(msg);
      return true;
    } catch (e) { return false; }
  }
  window.__VS_STORE_BRIDGE__ = {
    push: function (key, raw) {
      postNativeFire({ id: 's' + (++seq), method: 'storeSet', args: [key, raw] });
    },
    del: function (key) {
      postNativeFire({ id: 's' + (++seq), method: 'storeDel', args: [key] });
    },
  };

  // ---- 平台能力桥（v0.5.6 插件数据源）：netFetch 通用 HTTP 代理（规避
  // WebView2 CORS）+ 插件数据源注册表（Flutter 只记本地文件路径）----
  // netFetch 返回 {ok, status, text, finalUrl, headers}（finalUrl=重定向最终
  // URL，headers=响应头普通对象）——纯透传，Dart 侧字段变更自动带出。
  window.__VS_PLATFORM__ = {
    netFetch: function (url, opts) { return call('netFetch', [url, opts || {}]); },
    sourceAdd: function () { return call('sourceAdd'); },
    sourceList: function () { return call('sourceList'); },
    sourceRemove: function (id) { return call('sourceRemove', [id]); },
    sourceLoad: function (id) { return call('sourceLoad', [id]); },
  };
})();
