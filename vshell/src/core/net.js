/* ============================================================
 * net — 插件数据源的网络层（v0.5.6 用户需求：适配器 JS 调用目标网站接口）
 *
 * V.net.fetch(url, opts) 双路径：
 *   ① 原生 fetch（同源 / 目标站放行 CORS 时直接可用，最快）
 *   ② 网络层失败（CORS TypeError / 断网）→ 自动降级 Flutter 桥代理
 *      （__VS_PLATFORM__.netFetch → dio 请求，无 CORS 限制）
 *
 * 返回统一：{ ok, status, text, finalUrl, headers }
 *   - finalUrl = 跟随重定向后的最终 URL（原生 fetch 用 r.url，桥路径由
 *     flutter-adapter 透传 Dart 侧 resp.realUri）
 *   - headers = 响应头普通对象（原生 fetch 由 Headers 遍历转换）
 * 网络层失败时 reject（调用方可 .catch 处理）。
 * opts: { method, headers, body, query, timeout(ms) }
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  function platform() {
    return window.__VS_PLATFORM__ || null;
  }

  function fetchNative(url, opts) {
    var init = {
      method: opts.method || 'GET',
      headers: opts.headers || {},
      body: opts.body,
      signal: AbortSignal.timeout(opts.timeout || 15000),
    };
    if (init.method === 'GET' && opts.query) {
      var qs = Object.keys(opts.query).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(opts.query[k]);
      }).join('&');
      if (qs) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs;
    }
    return fetch(url, init).then(function (r) {
      return r.text().then(function (t) {
        var h = {};
        r.headers.forEach(function (v, k) { h[k] = v; });
        return { ok: r.ok, status: r.status, text: t, finalUrl: r.url, headers: h };
      });
    });
  }

  function fetchBridge(url, opts) {
    var p = platform();
    if (!p || !p.netFetch) return Promise.reject(new Error('no bridge'));
    return p.netFetch(url, opts).then(function (r) {
      if (!r || !r.ok) {
        var e = new Error((r && r.error) || ('HTTP ' + (r && r.status)));
        e.status = r && r.status;
        throw e;
      }
      return r;
    });
  }

  /** 双路径：原生 fetch 网络层失败 → 桥代理。HTTP 4xx/5xx 属正常响应
   *  （目标站语义），不降级。 */
  function fetchAny(url, opts) {
    opts = opts || {};
    return fetchNative(url, opts).catch(function () {
      return fetchBridge(url, opts);
    });
  }

  V.net = { fetch: fetchAny };
})();
