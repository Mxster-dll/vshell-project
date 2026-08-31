/* ============================================================
 * searchtags — 聚合搜索页（用户需求 v0.3.19 起；v0.3.21 混流抽取；
 * v0.6.0 数据源层重构：每（源,标签）一个 source-feed）
 *
 * 数据源 = 激活源 × 搜索标签（每组合独立分页拉取；源优先结构）。
 * 整合模型（v0.6.0 用户拍板「分级请求」）：
 *   - 数据源层：每（源,标签）一个 source-feed（独立预取 + 缓存分片
 *     vshell.wall.st.<标签>.<源> + 增量拉取 + 相对路径）
 *   - 组合层：出卡按【全局源轮转指针】接续（abcabc；拼接处不允许同源，
 *     耗尽源跳过）；源内多标签随机混流（首屏每个源至少出一条）
 *   - 渲染窗口预算 = multisource.windowSize()；滚动补卡时源队列空 →
 *     source-feed 自动增量预取
 *   - 去重：source-feed 内部按源内 id 去重；item 标注 sourceId
 *   - 黑名单全站过滤；搜索标签列表变更 → 整页重渲染
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var MAX_STEPS = 256;   // 单轮取数步数上限（防极端卡死）

  function mount(outlet, params, query) {
    var state = {
      srcs: {},      // srcId → { kws: { kw → source-feed } }
      firstRound: true,   // 首屏轮转：每个激活源至少出一条
      issued: {},    // 首屏已出过货的源（srcId → true）
      loading: false,
      done: false,   // 全部（源,标签）耗尽
      srcRotate: 0,  // 全局源轮转指针（接续轮转）
    };
    var sentinelEl = null;

    /** 激活源快照（多源；单源时退化为原行为） */
    function srcIds() {
      try { return V.multisource.activeSources(); } catch (e) { return ['acfun']; }
    }

    var page = V.utils.el('div', { className: 'vshell-page vshell-page-searchtags' });
    var head = V.utils.el('div', { className: 'vshell-page-head' }, [
      V.utils.el('button', {
        className: 'vshell-icon-btn vshell-page-back',
        type: 'button', 'aria-label': '返回',
        onclick: function () {
          if (history.length > 1) history.back();
          else V.router.nav('/');
        },
      }, V.utils.el('span', { className: 'codicon codicon-arrow-left' })),
      V.utils.el('h1', { className: 'vshell-page-title' }, '聚合搜索'),
      V.utils.el('span', { className: 'vshell-page-sub' }, 'Ctrl+Enter 添加搜索标签，多源轮转混流整合各标签结果'),
    ]);
    page.appendChild(head);

    var wallHost = V.utils.el('div', { className: 'vshell-wall-host' });
    page.appendChild(wallHost);
    outlet.appendChild(page);

    var feedInst = null;   // 抖音刷模式实例
    var feedGen = 0;       // feed 异步挂载竞态守卫

    /** 当前搜索标签列表（快照；去重） */
    function kws() {
      var seen = {};
      var out = [];
      V.searchTags.list().forEach(function (kw) {
        if (!seen[kw]) { seen[kw] = true; out.push(kw); }
      });
      return out;
    }

    /** 初始化取数状态：激活源 × 标签 建 source-feed（源优先）。无标签 → false */
    function initSources() {
      var ks = kws();
      if (!ks.length) return false;
      var ids = srcIds();
      state.srcs = {};
      ids.forEach(function (id) {
        var s = { kws: {} };
        ks.forEach(function (kw) {
          s.kws[kw] = V.sourceFeed.create({
            srcId: id,
            cacheKey: 'wall.st.' + kw,   // 分片键含标签（同源不同标签独立）
            fetchFn: function (page) {
              var a = V.siteAdapters.adapterFor(id);
              if (!a || typeof a.search !== 'function') {
                return Promise.resolve(null);   // 未就绪 → 可重试
              }
              return Promise.resolve().then(function () {
                return a.search(kw, page);
              }).then(function (res) {
                return res || null;   // 失败不落坏缓存
              });
            },
            filter: function (items) {
              return V.blacklist ? V.blacklist.filter(items) : items;
            },
            // v0.6.20 预取刷新后热更新已渲染卡片 stat
            onData: function () {
              if (V.videoCard && V.videoCard.hotUpdateStats && s.kws[kw]) {
                V.videoCard.hotUpdateStats(s.kws[kw].items());
              }
            },
          });
        });
        state.srcs[id] = s;
      });
      state.firstRound = true;
      state.issued = {};
      state.srcRotate = 0;
      window.__VS_AGG_SOURCES__ = ids.length * ks.length;
      return true;
    }

    /** 源内取队首（标签随机混流；跳过空 feed） */
    function takeFromSrc(s) {
      var kKeys = Object.keys(s.kws);
      if (!kKeys.length) return null;
      var start = Math.floor(Math.random() * kKeys.length);
      for (var i = 0; i < kKeys.length; i++) {
        var kw = kKeys[(start + i) % kKeys.length];
        var feed = s.kws[kw];
        var it = feed.take();
        if (it) return it;   // source-feed 内部已标 sourceId
      }
      return null;
    }

    /** 全局源轮转取卡：从指针开始扫一圈，取第一个有货源的队首；
     *  指针移到被取源的下一个（接续轮转 abcabc） */
    function takeOne() {
      var ids = srcIds();
      var n = ids.length;
      for (var i = 0; i < n; i++) {
        var id = ids[(state.srcRotate + i) % n];
        var s = state.srcs[id];
        if (s) {
          var item = takeFromSrc(s);
          if (item) {
            state.srcRotate = (state.srcRotate + i + 1) % n;
            return item;
          }
        }
      }
      return null;
    }

    /** 全部（源,标签）耗尽（feed isDone） */
    function allExhausted() {
      var ids = Object.keys(state.srcs);
      if (!ids.length) return false;
      return ids.every(function (id) {
        var ks = state.srcs[id].kws;
        return Object.keys(ks).every(function (kw) {
          return ks[kw].isDone();
        });
      });
    }

    /** 是否存在未耗尽（还有 hasMore）的 feed（用于判断是否继续等待预取） */
    function anyUndone() {
      var ids = Object.keys(state.srcs);
      for (var i = 0; i < ids.length; i++) {
        var ks = state.srcs[ids[i]].kws;
        for (var k in ks) {
          if (!ks[k].isDone() && ks[k].hasMore()) return true;
        }
      }
      return false;
    }

    /** 渲染窗口目标：当前已渲染 + 一窗 */
    function windowTarget(renderedCount) {
      return renderedCount + V.multisource.windowSize();
    }

    /** 触发所有未耗尽 feed 预取（Promise.all ready） */
    function prefetchAll() {
      var pend = [];
      var ids = Object.keys(state.srcs);
      ids.forEach(function (id) {
        var ks = state.srcs[id].kws;
        Object.keys(ks).forEach(function (kw) {
          pend.push(ks[kw].ready());
        });
      });
      return Promise.all(pend);
    }

    /** 轮换取数（墙模式哨兵触发）：目标 = 窗口预算；源轮转取卡 → 队列不足
     *  → 各 feed ready（预取）→ 再取 */
    function loadMore() {
      if (state.loading || state.done) return;
      if (!kws().length) return;
      state.loading = true;

      var wall = wallHost.querySelector('.vshell-wall');
      if (!wall) { state.loading = false; return; }
      var appended = 0;
      var steps = 0;
      var target = windowTarget(wall.children.length);

      function finish() {
        state.loading = false;
        if (allExhausted()) {
          state.done = true;
          if (sentinelEl) sentinelEl.el.remove();
        } else if (sentinelEl) {
          sentinelEl.retrigger();
          var r = sentinelEl.el.getBoundingClientRect();
          if (r.top < (window.innerHeight || document.documentElement.clientHeight)) {
            setTimeout(loadMore, 30);
          }
        }
      }

      function step() {
        if (appended >= target || allExhausted() || steps >= MAX_STEPS) { finish(); return; }
        steps++;
        // ---- 首屏轮转：每个激活源至少出一条（防单源独占第一页）----
        if (state.firstRound) {
          var idsU = srcIds().filter(function (id) { return !state.issued[id] && state.srcs[id]; });
          if (idsU.length) {
            var readyU = idsU.filter(function (id) {
              return Object.keys(state.srcs[id].kws).some(function (kw) {
                return state.srcs[id].kws[kw].size() > 0;
              });
            });
            if (readyU.length) {
              var idU = readyU[Math.floor(Math.random() * readyU.length)];
              var itemU = takeFromSrc(state.srcs[idU]);
              if (itemU) {
                state.issued[idU] = true;
                V.wall.appendCards(wall, [itemU], wall.children.length);
                appended++;
                step();
                return;
              }
              step();
              return;
            }
            // 未出过货的源暂无货：预取后重试
            if (anyUndone()) {
              prefetchAll().then(function () { step(); });
              return;
            }
            idsU.forEach(function (id) { state.issued[id] = true; });
            step();
            return;
          }
          state.firstRound = false;
        }
        // ---- 源轮转取卡 ----
        var item = takeOne();
        if (item) {
          V.wall.appendCards(wall, [item], wall.children.length);
          appended++;
          step();
          return;
        }
        // 队列耗尽 → 预取再取
        if (anyUndone()) {
          prefetchAll().then(function () { step(); });
          return;
        }
        finish();
      }

      step();
    }

    // ---- 渲染（墙/feed 双模式） ----
    function render() {
      wallHost.innerHTML = '';
      if (!initSources()) {
        wallHost.appendChild(V.wall.empty(
          '还没有搜索标签——在顶部搜索框输入关键词后按 Ctrl+Enter 添加，将多源轮转混流整合各标签的搜索结果',
          'codicon-search'));
        return;
      }
      var wall = V.wall.grid([], { empty: false });
      wallHost.appendChild(wall);
      // 本地视频参与聚合搜索（隐式源 local；标题命中任一关键词即入）
      if (V.localVideos && V.localVideos.list) {
        var ksL = kws();
        V.localVideos.list().forEach(function (lv) {
          if (!lv || !lv.id) return;
          var hit = ksL.some(function (k) {
            return k && lv.title.toLowerCase().indexOf(String(k).toLowerCase()) >= 0;
          });
          if (!hit) return;
          lv.sourceId = 'local';
          V.wall.appendCards(wall, [lv], wall.children.length);
        });
      }
      if (sentinelEl) { try { sentinelEl.el.remove(); } catch (e) { /* noop */ } sentinelEl = null; }
      sentinelEl = V.wall.sentinel(function () { loadMore(); });
      wallHost.appendChild(sentinelEl.el);
      // 并行 init 各 feed（读缓存分片 → 后台增量拉取）→ 首屏取卡
      bootstrap(function () { loadMore(); });
    }

    /** 并行 init 所有 feed（2.5s 超时先开始取卡） */
    function bootstrap(cb) {
      var pending = [];
      var ids = Object.keys(state.srcs);
      ids.forEach(function (id) {
        Object.keys(state.srcs[id].kws).forEach(function (kw) {
          pending.push(state.srcs[id].kws[kw].init());
        });
      });
      if (!pending.length) { cb(); return; }
      var left = pending.length;
      var fired = false;
      var doneOne = function () {
        if (fired) return;
        if (--left <= 0) { fired = true; cb(); }
      };
      setTimeout(function () { if (!fired) { fired = true; cb(); } }, 2500);
      pending.forEach(function (p) { p.then(doneOne); });
    }

    /** feed 模式 getMore：返回一批新 item */
    function feedMore() {
      return new Promise(function (resolve) {
        if (!kws().length || state.done) { resolve(null); return; }
        if (state.loading) { resolve(null); return; }
        state.loading = true;
        var out = [];
        var steps = 0;
        var target = V.multisource.windowSize();
        function finish2() {
          state.loading = false;
          if (allExhausted()) state.done = true;
          resolve(out.length ? { items: out } : null);
        }
        function step2() {
          if ((out.length >= target) || allExhausted() || steps >= MAX_STEPS) { finish2(); return; }
          steps++;
          if (state.firstRound) {
            var idsU = srcIds().filter(function (id) { return !state.issued[id] && state.srcs[id]; });
            if (idsU.length) {
              var readyU = idsU.filter(function (id) {
                return Object.keys(state.srcs[id].kws).some(function (kw) {
                  return state.srcs[id].kws[kw].size() > 0;
                });
              });
              if (readyU.length) {
                var idU = readyU[Math.floor(Math.random() * readyU.length)];
                var itemU = takeFromSrc(state.srcs[idU]);
                if (itemU) { state.issued[idU] = true; out.push(itemU); step2(); return; }
                step2(); return;
              }
              if (anyUndone()) {
                prefetchAll().then(function () { step2(); });
                return;
              }
              idsU.forEach(function (id) { state.issued[id] = true; });
              step2(); return;
            }
            state.firstRound = false;
          }
          var item = takeOne();
          if (item) { out.push(item); step2(); return; }
          if (anyUndone()) {
            prefetchAll().then(function () { step2(); });
            return;
          }
          finish2();
        }
        step2();
      });
    }

    function renderByMode() {
      if (!page.isConnected) return;
      if (feedInst) { try { feedInst.destroy(); } catch (e) { /* noop */ } feedInst = null; }
      var ks = kws();
      if (!ks.length) {
        wallHost.innerHTML = '';
        wallHost.appendChild(V.wall.empty(
          '还没有搜索标签——在顶部搜索框输入关键词后按 Ctrl+Enter 添加，将多源轮转混流整合各标签的搜索结果',
          'codicon-search'));
        return;
      }
      if (V.viewMode && V.viewMode.get() === 'feed') {
        wallHost.innerHTML = '';
        var g = ++feedGen;
        feedMore().then(function (res) {
          if (!page.isConnected || g !== feedGen) return;
          if (res && res.items && res.items.length) {
            feedInst = V.feed.mount(wallHost, { items: res.items, getMore: feedMore });
          } else {
            wallHost.appendChild(V.wall.empty(
              '还没有搜索标签——在顶部搜索框输入关键词后按 Ctrl+Enter 添加，将多源轮转混流整合各标签的搜索结果',
              'codicon-search'));
          }
        });
        return;
      }
      render();
    }
    var offMode = V.viewMode ? V.viewMode.onChange(renderByMode) : null;

    // 搜索标签变更 → 整页重渲染
    var offTags = V.searchTags ? V.searchTags.onChange(function () {
      state.srcs = {}; state.loading = false; state.done = false;
      state.firstRound = true; state.issued = {}; state.srcRotate = 0;
      renderByMode();
    }) : null;

    // 布局切换 → 重建墙（保留已加载数据）
    function refreshLayout() {
      if (!page.isConnected) return;
      renderByMode();
    }
    var offLayout = V.wall ? V.wall.onLayoutChange(refreshLayout) : null;
    // 角色改动差量刷新
    var offChars = V.characters ? V.characters.onChange(function () {
      if (state.done) return;
      if (V.viewMode && V.viewMode.get() === 'feed' && feedInst && feedInst.updateRole) {
        feedInst.updateRole();
        return;
      }
      if (V.wall && V.wall.updateChars(wallHost)) return;
      renderByMode();
    }) : null;
    // 源集合/隐私/k 变化 → 重建
    var offMulti = V.multisource ? V.multisource.onChange(function () {
      if (state.done) return;
      state.srcs = {}; state.loading = false; state.done = false;
      state.firstRound = true; state.issued = {}; state.srcRotate = 0;
      renderByMode();
    }) : null;

    // 初始渲染（feed 模式分流）
    if (V.viewMode && V.viewMode.get() === 'feed') {
      initSources();
      renderByMode();
    } else {
      render();
    }

    return {
      destroy: function () {
        state.done = true;
        if (offTags) { try { offTags(); } catch (e) { /* noop */ } offTags = null; }
        if (offLayout) { try { offLayout(); } catch (e) { /* noop */ } offLayout = null; }
        if (offMode) { try { offMode(); } catch (e) { /* noop */ } offMode = null; }
        if (offChars) { try { offChars(); } catch (e) { /* noop */ } offChars = null; }
        if (offMulti) { try { offMulti(); } catch (e) { /* noop */ } offMulti = null; }
        if (feedInst) { try { feedInst.destroy(); } catch (e) { /* noop */ } feedInst = null; }
        if (sentinelEl) { try { sentinelEl.el.remove(); } catch (e) { /* noop */ } }
        page.remove();
      },
    };
  }

  V.pages = V.pages || {};
  V.pages.searchtags = { mount: mount };
})();
