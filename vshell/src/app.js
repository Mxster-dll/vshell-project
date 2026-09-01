/* ============================================================
 * app — 启动器：整页接管 + 路由分发 + 页面生命周期
 * 流程：适配器匹配 → 清空原站 body → .vshell-app（navbar + outlet）
 *       → 主题/下载器/FAB 初始化 → hash 路由分发
 * 初始 URL 直达：/video/BVxxxx → #/video/BVxxxx
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  // 滚动位置由本项目自己管理（recordScroll/restoreScroll 按路由保存恢复），
  // 禁用 Chromium 的 scroll restoration——否则页面加载/hash 导航时浏览器
  // 会把 scrollTop 拉回上次会话值（实测 676 干扰，与项目恢复双重打架，
  // 并打断平滑滚动动画）
  try { history.scrollRestoration = 'manual'; } catch (e) { /* 忽略 */ }

  var PAGE_NAMES = ['home', 'category', 'video', 'watchlist', 'downloads', 'search', 'searchtags', 'blacklist', 'role', 'settings'];
  var current = null;
  var prevRoute = null;
  var switching = false;   // v0.5.6：数据源切换加载动画标记（start 读 → boot 收尾）
  // v0.5.6 追加：routeName → scrollTop。离开页面时记录，返回该页时恢复——
  // 用户需求：从详情页/角色主页返回列表页，保留原页的滚动进度/位置
  // （而不是重建后回到顶部）。滚动容器 = .vshell-page（内部滚动）；
  // feed 刷模式 = .vshell-feed 自身滚动（页面 overflow hidden）。
  var scrollState = {};

  function pageScroll() {
    var sc = document.querySelector('.vshell-page');
    if (!sc) return 0;
    var feed = sc.querySelector('.vshell-feed');
    return feed ? feed.scrollTop : sc.scrollTop;
  }
  function restoreScroll(y) {
    var sc = document.querySelector('.vshell-page');
    if (!sc) return;
    var feed = sc.querySelector('.vshell-feed');
    var el = feed || sc;
    // v0.5.6 第四轮：feed 有 scroll-behavior:smooth（components.css）——
    // 直接赋 scrollTop 会触发平滑滚动动画（用户反馈：返回后看到滚动到
    // 正确位置的动画）→ 恢复瞬间强制 auto（inline 覆盖 CSS），设置后还原
    var prev = el.style.scrollBehavior;
    el.style.scrollBehavior = 'auto';
    // v0.5.6 第二十五轮：**恢复期间临时禁用 scroll-snap**——feed 模式
    // scroll-snap-type:y mandatory（components.css）会在**设置 scrollTop
    // 时立即把位置吸附到最近的 slide 边界**（r11 探针"设 1300 得 946"
    // 即吸附证据）→ 用户滚到的非 snap 点位置，返回后整体偏移（用户
    // 反馈：页面略微上移 50px）。设完还原 scrollSnapType 不会触发
    // 重新吸附（snap 只在滚动操作时对齐）
    var prevSnap = el.style.scrollSnapType;
    el.style.scrollSnapType = 'none';
    // v0.5.6 第二十五轮：恢复期间临时禁用 scroll anchoring（CSS 层
    // overflow-anchor:none 已全局禁用，此处双保险）
    var prevAnchor = el.style.overflowAnchor;
    el.style.overflowAnchor = 'none';
    el.scrollTop = y;
    el.style.overflowAnchor = prevAnchor;
    el.style.scrollSnapType = prevSnap;
    el.style.scrollBehavior = prev;
  }
  /** v0.5.6 第二十五轮：恢复成功后下一帧校准——浏览器布局/锚定微调可能
   *  在恢复后把 scrollTop 推偏（CDP 实测 850→968）；CSS 已禁用锚定，
   *  此处最后防线：不等则强制回 saved（临时禁锚定再设） */
  function calibrate(y) {
    requestAnimationFrame(function () {
      var sc2 = document.querySelector('.vshell-page');
      if (!sc2) return;
      var f2 = sc2.querySelector('.vshell-feed');
      var e2 = f2 || sc2;
      if (e2.scrollTop !== y) {
        var pa = e2.style.overflowAnchor;
        e2.style.overflowAnchor = 'none';
        e2.scrollTop = y;
        e2.style.overflowAnchor = pa;
      }
    });
  }

  function render(route) {
    // 离开前记录当前页滚动位置（destroy 清 DOM 后 scrollTop 会归零，必须先读）
    if (current && prevRoute) {
      try { scrollState[prevRoute.name] = pageScroll(); } catch (e) { /* noop */ }
    }
    if (current && current.destroy) {
      try { current.destroy(); } catch (e) { console.error('[vshell] destroy error', e); }
    }
    current = null;
    var outlet = document.querySelector('.vshell-outlet');
    if (!outlet) return;
    outlet.innerHTML = '';
    // v0.5.6 第十轮（用户需求 2）：只有「返回按钮」返回时才恢复原页滚动
    // 位置；点导航栏顶部按钮直接进入 → 不恢复（到顶端）。返回按钮
    // （详情页/角色主页）点击时置 window.__VS_KEEP_SCROLL__ = true，
    // render 消费后清除；否则丢弃记录的滚动值。
    var saved = scrollState[route.name];
    var keep = !!window.__VS_KEEP_SCROLL__;
    window.__VS_KEEP_SCROLL__ = false;
    // 调试钩子（harness r25 诊断返回恢复路径用，无害保留）
    window.__VS_LAST_SAVED__ = saved;
    window.__VS_LAST_KEEP__ = keep;
    // v0.5.6 第十一轮（用户需求 5）：恢复期间目标页先隐藏（.is-restoring），
    // 恢复成功/超时才显示——此前轮询期间页面已渲染可见：先闪主页顶端、
    // 播卡片入场动画，然后才跳转目标位置（用户反馈不流畅）。隐藏时同步
    // 禁掉卡片入场动画（CSS：.is-restoring .vsc-video-card{animation:none}）
    // v0.5.6 第十五轮需求 5（返回要"非常干净"）：is-restoring **必须在
    // mount 之前**加在 outlet 上——mount 会同步渲染卡片并**立即播放入场
    // 动画**，此前加在 .vshell-page 上（mount 之后）等于让动画先播了一遍
    // 再隐藏（用户仍看到闪动/中间画面）
    var keepMode = !!(saved && keep);
    if (keepMode) outlet.classList.add('is-restoring');
    var page = V.pages[route.name];
    if (!page) {
      route = { name: 'home', params: {}, query: {} };
      page = V.pages.home;
    }
    try {
      current = page.mount(outlet, route.params || {}, route.query || {});
    } catch (e) {
      console.error('[vshell] page mount error', route, e);
      outlet.appendChild(V.wall.empty('页面加载失败：' + e.message, 'codicon-error'));
    }
    prevRoute = route;
    var pgEl = outlet.querySelector('.vshell-page');
    var reveal = function () {
      if (outlet) outlet.classList.remove('is-restoring');
      if (pgEl && pgEl.parentNode) {
        pgEl.classList.remove('is-restoring');
        // v0.5.6 第十三轮需求 9：is-restoring 移除后卡片的 animation 属性
        // 从 none 恢复成 vshell-rise → **重播**入场动画（用户反馈：返回
        // 主页还是会触发全部卡片的加载动画）——永久加 no-anim 抑制。
        // 此后再有重建（refreshFromNet 墙模式 render()）也走 is-restoring
        // 分支的同类处理（见 home.js/search.js）
        try {
          pgEl.querySelectorAll('.vsc-video-card').forEach(function (c) {
            c.classList.add('no-anim');
          });
        } catch (e) { /* noop */ }
      }
      // v0.5.6 第十五轮需求 5：返回后短窗内网络刷新（refreshFromNet）重建
      // 的新卡同样禁止入场动画（video-card.js create 检查该标记）——
      // 否则缓存渲染（动画A）→ 网络数据到达重建（动画B），返回过程
      // 始终有"卡片加载动画"
      window.__VS_SILENT__ = true;
      setTimeout(function () { window.__VS_SILENT__ = false; }, 1500);
    };
    if (keepMode) {
      // v0.5.6 第十四轮需求 5：**先同步试恢复**——缓存命中时 mount 已
      // 同步渲染出数据，立即恢复滚动成功 → 不隐藏、不轮询、直接显示
      // 正确位置（零过渡、零闪帧）；只有数据未就绪（异步挂载）才走
      // 隐藏 + 轮询路径
      restoreScroll(saved);
      var sc0 = document.querySelector('.vshell-page');
      var feed0 = sc0 && sc0.querySelector('.vshell-feed');
      var cur0 = feed0 ? feed0.scrollTop : (sc0 ? sc0.scrollTop : 0);
      if (cur0 === saved) {
        delete scrollState[route.name];
        window.__VS_RESTORE_PATH__ = 'sync';
        reveal();
        calibrate(saved);   // v0.5.6 第二十五轮：下一帧校准（锚定/布局微调防线）
        return;
      }
      if (pgEl) pgEl.classList.add('is-restoring');
      // 恢复滚动位置：mount 后 DOM 高度未就绪立即设置无效；首页等异步
      // 数据页（数据到达才挂 feed/墙）需要轮询等待。恢复成功（scrollTop
      // 到位）才清除记录；3s 超时放弃（避免无限轮询）。
      var t0 = Date.now();
      var tryRestore = function () {
        if (scrollState[route.name] !== saved) return;
        restoreScroll(saved);
        var sc = document.querySelector('.vshell-page');
        var feed = sc && sc.querySelector('.vshell-feed');
        var cur = feed ? feed.scrollTop : (sc ? sc.scrollTop : 0);
        if (cur === saved) {
          delete scrollState[route.name];
          window.__VS_RESTORE_PATH__ = 'poll';
          reveal();
          calibrate(saved);
          return;
        }
        if (Date.now() - t0 < 3000) setTimeout(tryRestore, 300);
        else { window.__VS_RESTORE_PATH__ = 'timeout'; reveal(); }
      };
      setTimeout(tryRestore, 50);
    } else {
      delete scrollState[route.name];
      window.scrollTo(0, 0);
      reveal();
    }
  }

  /** 禁用原站全部样式表（保留 vshell 注入的 style）：
   *  原站 CSS（如 bilibili 全局 a/h1/div 规则）会穿透 .vshell 容器，
   *  导致深色模式下标题/文字被原站浅色主题规则染成深色 —— 整页接管后
   *  原站 CSS 不再需要，一律停用。
   *  持续化：原站 SPA 在接管后仍会异步注入 <style>/<link>
   *  （含原站深色模式滚动条规则——用户反馈"还有一个深色模式的滚动条"），
   *  MutationObserver 监控 head 子树 + 防抖重扫，新注入的原站样式立即禁用 */
  function killSiteStyles() {
    var killTimer = null;
    var sweep = function () {
      var sheets = document.styleSheets;
      for (var i = 0; i < sheets.length; i++) {
        try {
          var s = sheets[i];
          var node = s.ownerNode;
          if (node && node.id === 'vshell-style') continue;
          s.disabled = true;
        } catch (e) { /* 跨域样式表仅置 disabled */ }
      }
    };
    sweep();
    var mo = new MutationObserver(function () {
      clearTimeout(killTimer);
      killTimer = setTimeout(sweep, 300);
    });
    mo.observe(document.head, { childList: true, subtree: true });
  }

  /** 拦截原站媒体（双声音 bug 根因）：
   *  原站 SPA 脚本在我们接管（清空 body）后仍会继续初始化播放器，
   *  后台挂出原站 <video>/<audio>，与 vshell 播放器叠声。
   *  三招：现存媒体停播 → capture 阶段拦 play/playing → MutationObserver
   *  移除新插入的非 vshell 媒体（原站 JS 建一个杀一个）
   *  注意：isVshell 只认 .vshell-app 容器——.vshell 类挂在 <html> 上，
   *  是所有元素的祖先，closest('.vshell') 永远命中会导致拦截失效 */
  function killSiteMedia() {
    var isVshell = function (el) {
      return el && el.closest && el.closest('.vshell-app');
    };
    var stopMedia = function (m) {
      try { m.pause(); } catch (e) { /* noop */ }
      try { m.removeAttribute('src'); m.load(); } catch (e) { /* noop */ }
    };
    document.querySelectorAll('video, audio').forEach(function (m) {
      if (!isVshell(m)) stopMedia(m);
    });
    var onPlay = function (e) {
      var t = e.target;
      if (t && (t.tagName === 'VIDEO' || t.tagName === 'AUDIO') && !isVshell(t)) {
        stopMedia(t);
      }
    };
    document.addEventListener('play', onPlay, true);
    document.addEventListener('playing', onPlay, true);
    var mo = new MutationObserver(function (muts) {
      muts.forEach(function (mu) {
        mu.addedNodes.forEach(function (n) {
          if (!n || n.nodeType !== 1) return;
          if (isVshell(n)) return;
          var ms = (n.tagName === 'VIDEO' || n.tagName === 'AUDIO') ? [n] : [];
          if (n.querySelectorAll) {
            ms = ms.concat(Array.prototype.slice.call(n.querySelectorAll('video, audio')));
          }
          ms.forEach(function (m) { if (!isVshell(m)) stopMedia(m); });
        });
      });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  /** 拦截原站动态脚本（控制台刷屏/后台空转根因）：
   *  整页接管（清空 body）后原站 SPA JS 仍持续初始化组件、动态加载
   *  chunk/埋点脚本（s1.hdslb.com reporter-pb 无限重试、data.bilibili.com
   *  log/web 反复上报——net::ERR_BLOCKED_BY_CLIENT + [Mirror Manager]
   *  Middleware task failed 刷屏）。原站 JS 已无 DOM 可用，任何新增脚本
   *  都是无用功：MutationObserver 移除新增 <script> 阻止加载/执行。
   *  注意：观察器在 vshell 自身注入之后注册——自身 script 不在"新增"里，
   *  不会误杀；已注册的原站定时器无法撤销（无 API），但新 chunk/新重试
   *  循环被阻断，噪音大幅收敛 */
  function killSiteScripts() {
    var isVshellScript = function (s) {
      return s && s.src && /vshell|userscript/i.test(s.src);
    };
    var mo = new MutationObserver(function (muts) {
      muts.forEach(function (mu) {
        mu.addedNodes.forEach(function (n) {
          if (!n || n.nodeType !== 1) return;
          var list = [];
          if (n.tagName === 'SCRIPT') list.push(n);
          if (n.querySelectorAll) {
            list = list.concat(Array.prototype.slice.call(n.querySelectorAll('script')));
          }
          list.forEach(function (s) {
            if (!isVshellScript(s)) {
              try { s.remove(); } catch (e) { /* noop */ }
            }
          });
        });
      });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  /** 静音原站（控制台刷屏根治）：
   *  整页接管后原站 SPA JS 仍在后台空转——已执行的代码无法撤销，但它会
   *  持续发起埋点/上报请求（data.bilibili.com/log/web、s1.hdslb.com/
   *  bfs/seed/jinkela/reporter-pb、broadcast.chat.bilibili.com 推送）并因
   *  失败无限重试（[Mirror Manager] Middleware task failed 刷屏——重试
   *  循环在原站 JS 内部的 Promise 队列里，不经过 DOM script 标签，
   *  killSiteScripts 拦不到）。三层静音：
   *   ① fetch/XHR/WebSocket 对埋点域名直接拒绝（请求根本不发出 →
   *      网络错误日志消失）；不影响 vshell 自身请求（api.bilibili.com
   *      与 *.bilivideo.com 不拦——播放与下载依赖）；
   *   ② console.error/warn 过滤原站噪音关键词（不碰 vshell 自身日志）；
   *   ③ killSiteScripts 继续拦 DOM 脚本注入 */
  function quietSite() {
    // ⚠️ Tampermonkey 有 @grant 时脚本跑在 isolated world——对 window.fetch/
    // XMLHttpRequest.prototype/console 的赋值只影响自己 world 的副本，
    // 原站 JS（页面 world）不受影响 → 劫持必须作用在 unsafeWindow（页面 world）。
    // harness（页面直接 <script src>）无 unsafeWindow → fallback window。
    var w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    var NOISE_RE = /(^|\/)(data\.bilibili\.com|s1\.hdslb\.com\/bfs\/seed|broadcast\.chat\.bilibili\.com)/i;
    var NOISE_CONSOLE_RE = /(Mirror Manager|Middleware task|Tech report|reporter-pb|log-reporter|ERR_BLOCKED_BY_CLIENT|Failed to load|pollingWhenHidden|fetchHeaderLocsInfo|Permissions policy|Deprecated API)/i;
    // ① fetch：模拟成功响应（reject 会触发原站 catch→重试循环；成功则队列清空停止）
    var origFetch = w.fetch;
    if (origFetch) {
      w.fetch = function (input, init) {
        // 兼容 URL 对象/Request（log-reporter 实测以 new URL 传参——
        // 只查 .url 会漏 → 请求照发）
        var u = typeof input === 'string' ? input
          : (input && (input.url || input.href)) || '';
        if (NOISE_RE.test(u)) {
          return Promise.resolve(new Response('{}', {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' },
          }));
        }
        return origFetch.call(this, input, init);
      };
    }
    // ① XHR：模拟成功响应（abort 触发 onerror → 原站无限重试；200 则走成功路径）
    var origOpen = w.XMLHttpRequest.prototype.open;
    w.XMLHttpRequest.prototype.open = function (method, url) {
      this.__vsNoise = NOISE_RE.test(String(url));
      return origOpen.apply(this, arguments);
    };
    var origSend = w.XMLHttpRequest.prototype.send;
    w.XMLHttpRequest.prototype.send = function () {
      if (this.__vsNoise) {
        var self = this;
        try {
          Object.defineProperty(self, 'readyState', { get: function () { return 4; }, configurable: true });
          Object.defineProperty(self, 'status', { get: function () { return 200; }, configurable: true });
          Object.defineProperty(self, 'responseText', { get: function () { return '{}'; }, configurable: true });
        } catch (e) { /* noop */ }
        queueMicrotask(function () {
          try {
            if (typeof self.onreadystatechange === 'function') self.onreadystatechange();
            if (typeof self.onload === 'function') self.onload();
            if (typeof self.onloadend === 'function') self.onloadend();
          } catch (e) { /* noop */ }
        });
        return;
      }
      return origSend.apply(this, arguments);
    };
    // ① sendBeacon：log-reporter 埋点 POST 走它（keepalive，fetch/XHR 劫持拦不到）
    var origBeacon = w.navigator.sendBeacon;
    if (origBeacon) {
      w.navigator.sendBeacon = function (url, data) {
        if (NOISE_RE.test(String(url))) return true;   // 返回 true = 模拟发送成功，原站不重试
        return origBeacon.call(this, url, data);
      };
    }
    // ① WebSocket（broadcast 推送）
    var OrigWS = w.WebSocket;
    if (OrigWS) {
      w.WebSocket = function (url, protocols) {
        if (NOISE_RE.test(String(url))) {
          // 直接构造已关闭假实例：原站 onclose/onerror 拿到 readyState 3 即止
          return {
            readyState: 3,
            close: function () {},
            send: function () {},
            addEventListener: function () {},
            removeEventListener: function () {},
          };
        }
        return protocols ? new OrigWS(url, protocols) : new OrigWS(url);
      };
      w.WebSocket.prototype = OrigWS.prototype;
      w.WebSocket.CONNECTING = 0;
      w.WebSocket.OPEN = 1;
      w.WebSocket.CLOSING = 2;
      w.WebSocket.CLOSED = 3;
    }
    // ① reporter-pb 等动态 script 加载失败：document 捕获阶段拦 error 事件
    //    （load/error 不冒泡但会走捕获路径；stopPropagation 阻止到达 script.onerror → 原站不再重试）
    w.document.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t.tagName === 'SCRIPT' && NOISE_RE.test(t.src || '')) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
    // ② console 过滤（只消原站噪音，vshell 自身日志照常）
    ['error', 'warn'].forEach(function (level) {
      var orig = w.console[level];
      if (!orig) return;
      w.console[level] = function () {
        var msg = '';
        try {
          msg = Array.prototype.slice.call(arguments).map(function (a) {
            return typeof a === 'string' ? a : (a && a.message) || '';
          }).join(' ');
        } catch (e) { /* noop */ }
        if (NOISE_CONSOLE_RE.test(msg)) return;
        return orig.apply(w.console, arguments);
      };
      w.console[level].__vsQuiet = true;   // 探针识别标记（被包装）
    });
  }

  function boot() {
    // v0.5.7 用户需求：无适配器（数据源不可用/插件注入失败）**不放弃接管**——
    // 框架（导航栏/主题等）照常渲染，内容区由各页面自行显示空态
    // （"只有显示内容的地方为空，基本框架还是要有的"）。

    // v0.5.6 用户需求：收藏/待看/黑名单/角色/代表作/搜索缓存按数据源隔离。
    // 各数据模块在依赖序中早于 data-source，加载期 scopedKey 回退 'acfun'——
    // 此处按真实数据源统一 reload 对齐；并挂切换监听（settings-panel 切源
    // 走整页 reload，此监听覆盖未来不做整页切换的调用方）。
    ['saved', 'watched', 'blacklist', 'characters', 'searchCache'].forEach(function (m) {
      if (V[m] && V[m].reload) { try { V[m].reload(); } catch (e) { /* noop */ } }
    });
    if (V.dataSource && V.dataSource.onChange) {
      V.dataSource.onChange(function () {
        ['saved', 'watched', 'blacklist', 'characters', 'searchCache'].forEach(function (m) {
          if (V[m] && V[m].reload) { try { V[m].reload(); } catch (e) { /* noop */ } }
        });
      });
    }
    // v0.5.7 多源：激活集/预取倍率变化 → 数据模块重载（并集视图缓存失效）
    if (V.multisource && V.multisource.onChange) {
      V.multisource.onChange(function () {
        ['saved', 'watched', 'blacklist', 'characters', 'searchCache'].forEach(function (m) {
          if (V[m] && V[m].reload) { try { V[m].reload(); } catch (e) { /* noop */ } }
        });
      });
    }

    // 整页接管
    quietSite();                          // 最先：网络层静音（拦埋点/重试请求 + console 过滤）
    killSiteStyles();
    killSiteScripts();                    // 拦原站动态脚本（chunk/埋点重试刷屏）
    killSiteMedia();                      // 先杀现存媒体 + 装拦截（原站 SPA 可能重建播放器）
    document.documentElement.classList.add('vshell');
    // 清原站 html/body 的 inline style：残留 overflow/height 等会把滚动容器
    // 从 viewport 拽到 body（产生第二条默认样式滚动条，遮住自定义滚动条）
    document.documentElement.removeAttribute('style');
    var app = V.utils.el('div', { className: 'vshell-app' });
    document.body.removeAttribute('style');
    document.body.innerHTML = '';
    document.body.appendChild(app);

    var navbarHost = V.utils.el('div', { className: 'vshell-navbar-host' });
    var outlet = V.utils.el('main', { className: 'vshell-outlet' });
    app.appendChild(navbarHost);
    app.appendChild(outlet);

    V.navbar.mount(navbarHost);
    V.theme.apply();
    V.theme.watchSystem();
    V.downloader.init();
    V.fab.init();
    // v0.5.6 第十二轮需求 2：本地视频数据源预恢复（IDB File → objectURL；
    // 异步，不阻塞启动；首次进入主页时主页缓存/刷新会合并本地项）
    if (V.localVideos && V.localVideos.init) V.localVideos.init();
    // v0.5.6 第二十七轮需求 3：视频嗅探（FetchV 式）——挂载
    // PerformanceObserver + MutationObserver + 初始扫描
    if (V.sniffer && V.sniffer.init) V.sniffer.init();
    // 滚动条已回退浏览器原生（用户需求 2026-08），不再自绘

    // 初始 URL 直达详情
    if (!location.hash) {
      var m = location.pathname.match(/\/video\/(BV[0-9A-Za-z]{10})/);
      if (m) history.replaceState(null, '', '#/video/' + m[1]);
    }

    PAGE_NAMES.forEach(function (name) { V.router.on(name, render); });
    V.router.start();
    // v0.6.1 聚合：启动先清未激活源（隐私源）的自动聚合数据，再补扫
    // 历史缓存（phash 自动并入，后台串行节流，延迟 2s 避开首屏渲染）
    if (V.aggregations && V.aggregations.cleanInactive) {
      setTimeout(function () {
        V.aggregations.cleanInactive();
        if (V.aggregations.scanCache) V.aggregations.scanCache();
      }, 2000);
    }
    // 切换遮罩收尾：首帧渲染提交后隐藏（60ms 让浏览器提交帧）
    if (switching && V.switchOverlay) {
      setTimeout(function () { V.switchOverlay.hide(); }, 60);
    }
    // v0.6.69 兜底：CSS 变量（卡片间距/大小）在 boot 完成后再应用一次
    // ——确保启动后 --vshell-card-gap/--vshell-card-min 一定在 documentElement 上
    try { if (V.cardGap && V.cardGap.apply) V.cardGap.apply(); } catch (e) { /* noop */ }
    try { if (V.cardSize && V.cardSize.apply) V.cardSize.apply(); } catch (e) { /* noop */ }
  }

  /** 启动：插件数据源时先 ensureLoaded（读文件注入适配器）再 boot——
   *  boot 在 DOMContentLoaded 执行，而插件注入是异步桥调用，直接 boot
   *  会因适配器未注册而 current()=null 放弃接管（页面空白）。
   *  v0.5.7 多源：所有激活插件源（隐私已由 multisource 排除）并行注入，
   *  全部就绪后 boot；单源时退化为原逻辑 */
  function start() {
    // v0.5.7 用户澄清：隐私源 = 启动时自动取消加载（设置里显示未勾选），
    // 但**允许手动加载**。冷启动（sessionStorage 无 skipPrivCheck 标记）时
    // 把隐私源从启用集剔除——下次启动隐私源不再自动挂载；本会话用户手动
    // 勾选隐私源（设置面板会写标记）→ 不清洗，手动加载生效。
    try {
      var skipPriv = sessionStorage.getItem('vshell.skipPrivCheck') === '1';
      if (!skipPriv && V.multisource && V.dataSource && V.dataSource.isPrivate) {
        var en = V.multisource.enabled();
        if (Array.isArray(en) && en.length) {
          var cleaned = en.filter(function (id) { return !V.dataSource.isPrivate(id); });
          if (cleaned.length !== en.length) {
            // 用户需求（v0.5.11）：取消全部隐私源后若没有任何数据源 →
            // 兜底启用第一个非隐私源（与 activeSources() 的运行时兜底一致，
            // 但启用集持久化层也要落盘，否则下次启动仍是空集）
            if (!cleaned.length) {
              var fb = V.dataSource.firstNonPrivate ? V.dataSource.firstNonPrivate() : null;
              if (fb) cleaned = [fb];
            }
            V.multisource.setEnabled(cleaned);
          }
        }
      }
    } catch (e) { /* noop */ }
    // 数据源切换加载动画（v0.5.6 用户需求）：settings-panel 切换时写
    // sessionStorage 标记 + 旧页面遮罩；此处（boot 前）接管遮罩直到首帧
    // 渲染完成（boot 的 body.innerHTML='' 不影响——遮罩挂 documentElement）
    try {
      switching = sessionStorage.getItem('vshell.switching') === '1';
      if (switching) sessionStorage.removeItem('vshell.switching');
    } catch (e) { /* noop */ }
    if (switching && V.switchOverlay) V.switchOverlay.show('正在加载数据源…');

    // v0.5.7 用户要求：**缓存绑定数据源**——未激活源的 searchCache 键
    // 启动即清（searchCache 按源 scopedKey 隔离；取消某源后其残留缓存
    // 不再显示旧内容）。无前缀遗留键（旧版 searchCache.*）一并清。
    // 放在 prep 之前同步执行，不依赖注册表刷新/插件加载完成。
    try {
      var act = {};
      (V.multisource ? V.multisource.activeSources() : []).forEach(function (s) { act[s] = true; });
      for (var ci = localStorage.length - 1; ci >= 0; ci--) {
        var ck = localStorage.key(ci);
        if (!ck) continue;
        var sid = null;
        if (ck.indexOf('vshell.searchCache.') === 0) {
          sid = ck.substring(18);
        } else if (ck.indexOf('searchCache.') === 0) {
          sid = ck.substring(12);   // 旧版无前缀遗留键
        }
        if (sid !== null && !act[sid]) {
          localStorage.removeItem(ck);
          var b = window.__VS_STORE_BRIDGE__;
          if (b && b.del) { try { b.del(ck); } catch (e) { /* noop */ } }
        }
      }
    } catch (e) { /* noop */ }

    // v0.5.7 数据隔离审计修复：**无前缀旧键迁移**——早期版本的部分源数据
    // 困在无前缀键（store 现统一 'vshell.' 前缀读写）→ 一次性迁移到带前缀
    // 对应键。searchCache 不迁移（上面缓存清理已删无前缀遗留；缓存随时重建）。
    // v0.5.8 修复：带前缀键已有**但为空壳**（'[]'/'{}'）而无前缀有真实数据
    // → 用无前缀数据覆盖——否则（v25 实测）loadAll 的 migrateScoped 先建了
    // 空带前缀键 → 迁移块「已有则删无前缀」→ 旧数据丢失。
    function isEmptyShell(raw) {
      if (raw === null) return true;
      var t = String(raw).trim();
      return t.length <= 2 || t === '[]' || t === '{}';
    }
    try {
      var scopedRe = /^(saved|blacklist|watched|characters|videoChars|charConflicts|charLocks|charManuals|charVideos|charFollows|charRemoved)\.(.+)$/;
      for (var mi = localStorage.length - 1; mi >= 0; mi--) {
        var mk = localStorage.key(mi);
        if (!mk || mk.indexOf('vshell.') === 0) continue;
        var mm = scopedRe.exec(mk);
        if (!mm) continue;
        var full = 'vshell.' + mk;
        try {
          var legacyRaw = localStorage.getItem(mk);
          if (!isEmptyShell(legacyRaw)) {
            var curRaw = localStorage.getItem(full);
            if (isEmptyShell(curRaw)) localStorage.setItem(full, legacyRaw);
          }
          localStorage.removeItem(mk);
          var bb = window.__VS_STORE_BRIDGE__;
          if (bb && bb.del) { try { bb.del(mk); } catch (e) { /* noop */ } }
        } catch (e) { /* noop */ }
      }
    } catch (e) { /* noop */ }
    // 旧版待看键 vshell.watch（{id: item} 对象格式，待看早已并入 saved.<源>）
    // → 并入 saved.acfun.watch（去重）后删除，避免历史数据遗失
    try {
      var oldW = localStorage.getItem('vshell.watch');
      if (oldW) {
        var ow = JSON.parse(oldW);
        if (ow && typeof ow === 'object') {
          var sa = JSON.parse(localStorage.getItem('vshell.saved.acfun') || '{"watch":[],"fav":[]}');
          if (sa && Array.isArray(sa.watch)) {
            var ids = {};
            sa.watch.forEach(function (w) { if (w && w.id) ids[w.id] = true; });
            Object.keys(ow).forEach(function (id) {
              var it = ow[id] || {};
              if (!ids[id]) {
                sa.watch.push({
                  id: id, title: it.title || id, pic: it.cover || it.pic || '',
                  duration: it.duration || 0, pubdate: it.pubdate || 0,
                  owner: { name: it.ownerName || '', face: '' },
                  stat: { view: 0 }, sourceId: 'acfun', addedAt: Date.now(),
                });
              }
            });
            localStorage.setItem('vshell.saved.acfun', JSON.stringify(sa));
          }
        }
        localStorage.removeItem('vshell.watch');
      }
    } catch (e) { /* noop */ }
    // 再算激活源（含新插件）→ 注入 → boot
    var prep = V.multisource && V.multisource.refreshRegistry
      ? V.multisource.refreshRegistry().catch(function () { return false; })
      : Promise.resolve(false);
    prep.then(function () {
      var pluginIds = [];
      try {
        var srcIds = V.multisource ? V.multisource.activeSources()
          : [(V.dataSource && V.dataSource.get) ? V.dataSource.get() : 'acfun'];
        pluginIds = srcIds.filter(function (id) {
          return V.dataSource && V.dataSource.isPlugin && V.dataSource.isPlugin(id);
        });
      } catch (e) { /* noop */ }
      if (pluginIds.length) {
        var pend = [];
        pluginIds.forEach(function (id) {
          if (V.dataSource.ensureLoaded) pend.push(V.dataSource.ensureLoaded(id));
        });
        Promise.all(pend).then(function () { boot(); });
        return;
      }
      boot();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
    window.__BOOT__ = window.__BOOT__ || {};
    window.__BOOT__.mounted = 'listener';
  } else {
    window.__BOOT__ = window.__BOOT__ || {};
    window.__BOOT__.mounted = 'direct';
    start();
  }
})();
