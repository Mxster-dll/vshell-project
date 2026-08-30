/* ============================================================
 * utils — 通用工具（无依赖）
 * 命名空间：window.VShell
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  /** el(tag, attrs, children) — 快速创建元素。attrs 里 className/onclick 等直接赋值；children 为字符串或节点数组 */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'style' && typeof attrs[k] === 'object') {
          Object.assign(node.style, attrs[k]);
        } else if (k === 'dataset') {
          Object.assign(node.dataset, attrs[k]);
        } else if (k === 'class' || k === 'className') {
          node.className = attrs[k];
        } else if (k === 'textContent') {
          /* v0.3.72 关键修复：textContent 必须走 property 赋值——
             setAttribute('textContent') 只建同名 HTML 属性、不设置文本，
             导致所有用 attrs.textContent 的按钮（分区 chip 等）渲染成
             无文字的空按钮（真实站"分类显示为空"的真根因） */
          node.textContent = attrs[k];
        } else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2), attrs[k]);
        } else {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children != null) {
      if (Array.isArray(children)) {
        children.forEach(function (c) { appendChild(node, c); });
      } else {
        appendChild(node, children);
      }
    }
    return node;
  }

  /** 递归挂载（支持嵌套数组 children，如条件分支内联数组） */
  function appendChild(node, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) {
      c.forEach(function (x) { appendChild(node, x); });
      return;
    }
    if (typeof c === 'string' || typeof c === 'number') {
      node.appendChild(document.createTextNode(String(c)));
    } else {
      node.appendChild(c);
    }
  }

  /** 时间格式化：mm:ss / h:mm:ss
   *  v0.3.41 防御：入参可能是 "mm:ss" 字符串（真实站搜索接口 duration 原样
   *  传入时）——先解析为秒，避免 NaN → 00:00（适配器层也有 toSec 归一化，
   *  这里是兜底，任何数据源都安全） */
  function fmtTime(sec) {
    if (typeof sec === 'string' && sec.indexOf(':') !== -1) {
      var parts = sec.split(':').map(Number);
      var s = 0;
      for (var i = 0; i < parts.length; i++) s = s * 60 + (parts[i] || 0);
      sec = s;
    }
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s2 = sec % 60;
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s2) : pad(m) + ':' + pad(s2);
  }

  /** 数字缩写：1.2万 / 3.4亿 */
  function fmtCount(n) {
    n = Number(n) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    return String(n);
  }

  /** 下载文件名清洗：去掉非法字符，限制长度 */
  function sanitizeFilename(name, maxLen) {
    maxLen = maxLen || 80;
    var s = String(name || 'video')
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (s.length > maxLen) s = s.slice(0, maxLen);
    return s || 'video';
  }

  /** 简易事件总线 */
  function Emitter() {
    this._map = {};
  }
  Emitter.prototype.on = function (ev, fn) {
    (this._map[ev] = this._map[ev] || []).push(fn);
    return this;
  };
  Emitter.prototype.off = function (ev, fn) {
    var arr = this._map[ev];
    if (arr) this._map[ev] = arr.filter(function (f) { return f !== fn; });
    return this;
  };
  Emitter.prototype.emit = function (ev) {
    var arr = this._map[ev];
    if (!arr) return this;
    var args = Array.prototype.slice.call(arguments, 1);
    arr.slice().forEach(function (fn) {
      try { fn.apply(null, args); } catch (e) { console.error('[vshell] emit error', ev, e); }
    });
    return this;
  };

  /** debounce */
  function debounce(fn, ms) {
    var t = null;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /** GM_xmlhttpRequest Promise 封装（responseType arraybuffer / json / text） */
  function gmFetch(opts) {
    return new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest !== 'function') {
        // harness / 非油猴环境降级为 fetch
        var m = opts.method || 'GET';
        var init = { method: m, headers: opts.headers || {} };
        if (opts.responseType === 'arraybuffer') init.headers['Accept'] = '*/*';
        fetch(opts.url, init).then(function (r) {
          if (!r.ok) return reject(new Error('HTTP ' + r.status));
          if (opts.responseType === 'arraybuffer') return r.arrayBuffer();
          if (opts.responseType === 'json') return r.json();
          return r.text();
        }).then(function (data) {
          resolve({ status: 200, response: data, responseHeaders: '' });
        }).catch(reject);
        return;
      }
      GM_xmlhttpRequest({
        method: opts.method || 'GET',
        url: opts.url,
        headers: opts.headers || {},
        responseType: opts.responseType || 'text',
        timeout: opts.timeout || 20000,
        onload: function (res) {
          if (res.status >= 200 && res.status < 300) {
            // TM 的 responseHeaders 是原始字符串 → 解析成小写键对象
            var h = {};
            String(res.responseHeaders || '').split('\n').forEach(function (line) {
              var i = line.indexOf(':');
              if (i > 0) h[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
            });
            res.responseHeaders = h;
            resolve(res);
          } else {
            reject(new Error('HTTP ' + res.status + ' ' + opts.url));
          }
        },
        onerror: function () { reject(new Error('network error ' + opts.url)); },
        ontimeout: function () { reject(new Error('timeout ' + opts.url)); },
      });
    });
  }

  /** 触发浏览器下载（Blob / 降级路径） */
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 4000);
  }

  /** 转义 HTML */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  V.utils = {
    el: el,
    fmtTime: fmtTime,
    fmtCount: fmtCount,
    sanitizeFilename: sanitizeFilename,
    Emitter: Emitter,
    debounce: debounce,
    gmFetch: gmFetch,
    downloadBlob: downloadBlob,
    esc: esc,
  };
})();
