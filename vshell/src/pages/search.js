/* ============================================================
 * search — 搜索结果页
 * 双视图（v0.3.85）：墙（视频卡片网格 + 无限滚动）/
 *   刷（共享 V.feed 抖音视图 + 滑到底无限加载）
 * 模式由全局 V.viewMode 控制；feed 模式下隐藏页头（沉浸式）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  function mount(outlet, params, query) {
    var adapter = V.siteAdapters.current();
    var q = (query && query.q ? String(query.q) : '').trim();
    var state = { items: [], pn: 1, loading: false, hasMore: true, done: false };
    // v0.5.6 第五轮：搜索结果本地缓存——每次先显示本地内容，再网络增量更新
    var cached = V.searchCache ? V.searchCache.get(q) : null;
    window.__VS_SEARCH_CACHE_HIT__ = !!cached;   // 调试钩子（harness 探针）
    if (cached) {
      state.items = cached.items.slice();
      state.pn = cached.pn || 1;
      state.hasMore = cached.hasMore;
    }
    var sentinelEl = null;
    var feedInst = null;

    var page = V.utils.el('div', { className: 'vshell-page vshell-page-search' });
    var head = V.utils.el('div', { className: 'vshell-page-head' }, [
      V.utils.el('button', {
        className: 'vshell-icon-btn vshell-page-back',
        type: 'button', 'aria-label': '返回',
        onclick: function () {
          if (history.length > 1) history.back();
          else V.router.nav('/');
        },
      }, V.utils.el('span', { className: 'codicon codicon-arrow-left' })),
      V.utils.el('h1', { className: 'vshell-page-title' }, '搜索：' + q),
    ]);
    page.appendChild(head);

    var wallHost = V.utils.el('div', { className: 'vshell-wall-host' });
    var loadingEl = V.utils.el('div', { className: 'vshell-wall-loading', hidden: '' }, [
      V.utils.el('span', { className: 'vshell-spinner' }),
    ]);
    page.appendChild(wallHost);
    page.appendChild(loadingEl);
    outlet.appendChild(page);

    /** 拉下一页（墙 sentinel 与 feed 滑底共用）；返回 {items,start} | null */
    function fetchNext() {
      if (state.loading || !state.hasMore || state.done) return Promise.resolve(null);
      state.loading = true;
      loadingEl.hidden = false;
      // v0.5.7 用户反馈：数据源不可用（adapter null）→ 缓存先显示，加载提示空态
      if (!adapter || typeof adapter.search !== 'function') {
        state.loading = false;
        state.hasMore = false;
        loadingEl.hidden = true;
        if (!state.items.length) {
          wallHost.appendChild(V.wall.empty('数据源不可用，无法搜索', 'codicon-error'));
        }
        return Promise.resolve(null);
      }
      // v0.5.7：插件 adapter 可能同步抛——Promise.resolve() 包裹变异步 reject
      return Promise.resolve().then(function () {
        return adapter.search(q, state.pn);
      }).then(function (res) {
        if (state.done) return null;
        var items = V.blacklist ? V.blacklist.filter(res.items) : res.items;
        // v0.5.6 第十二轮需求 2：本地视频参与搜索（标题命中；首页前置）
        if (state.pn === 1 && V.localVideos && V.localVideos.search && q) {
          items = V.localVideos.search(q).concat(items);
        }
        var start = state.items.length;
        // v0.5.6 第十六轮需求 4：跨页/缓存合并按 id 去重——缓存旧页与网络
        // 新页内容重叠（bilibili 榜/搜索翻页 id 高度重合）时 concat 不去重
        // → 相同视频上下重复出现。返回 fresh（未渲染过的）给墙/feed 追加，
        // 已存在的 id 不再重复插入。
        var known = {};
        state.items.forEach(function (it) { if (it && it.id) known[it.id] = true; });
        var fresh = items.filter(function (it) { return it && it.id && !known[it.id]; });
        state.items = state.items.concat(fresh);
        state.hasMore = res.hasMore;
        state.pn++;
        state.loading = false;
        loadingEl.hidden = true;
        // 本地缓存（v0.5.6 第五轮）：首页替换式、翻页追加式
        if (V.searchCache) {
          if (start === 0) V.searchCache.set(q, state.items, state.pn, state.hasMore);
          else V.searchCache.append(q, fresh, state.pn, state.hasMore);
        }
        return { items: fresh, start: start, hasMore: res.hasMore };
      }).catch(function (e) {
        if (state.done) return null;
        state.loading = false;
        loadingEl.hidden = true;
        if (!state.items.length) {
          wallHost.innerHTML = '';
          wallHost.appendChild(V.wall.empty('搜索失败：' + e.message, 'codicon-error'));
        }
        return null;
      });
    }

    // ---- 墙视图 ----
    function load() {
      fetchNext().then(function (r) {
        if (!r) return;
        appendItems(r.start);
        if (sentinelEl) sentinelEl.retrigger();
        if (!r.hasMore && sentinelEl) sentinelEl.el.remove();
      });
    }
    /** 增量追加；墙不存在（首次/异常清空后）→ 全量重建 */
    function appendItems(start) {
      var wall = wallHost.querySelector('.vshell-wall');
      if (!wall || !state.items.length) { render(); return; }
      V.wall.appendCards(wall, state.items.slice(start), start);
    }
    function renderWall() {
      wallHost.innerHTML = '';
      if (!state.items.length && !state.loading) {
        wallHost.appendChild(V.wall.empty('没有找到与「' + q + '」相关的视频', 'codicon-search'));
        return;
      }
      wallHost.appendChild(V.wall.grid(state.items));
      if (state.hasMore) {
        sentinelEl = V.wall.sentinel(function () { load(); });
        wallHost.appendChild(sentinelEl.el);
      }
    }

    // ---- 刷视图 ----
    function renderFeed() {      wallHost.innerHTML = '';
      if (!state.items.length) {
        wallHost.appendChild(V.wall.empty('没有找到与「' + q + '」相关的视频', 'codicon-search'));
        return;
      }
      feedInst = V.feed.mount(wallHost, {
        items: state.items,
        getMore: fetchNext,
      });
      window.__VS_SEARCH_FEED__ = feedInst;   // 调试钩子（harness 探针）
    }

    function render() {
      if (state.done) return;
      if (feedInst) { try { feedInst.destroy(); } catch (e) { /* noop */ } feedInst = null; }
      if (V.viewMode.get() === 'feed') renderFeed(); else renderWall();
    }

    /** v0.5.6 第五轮：网络首页刷新——命中缓存时挂载即调用：
     *  拉最新第 1 页 → searchCache.refresh 合并（新在前 + 旧去重）
     *  → 更新 state → 增量渲染（feed 不重建 / wall 重建）；
     *  网络失败静默（本地缓存兜底显示）
     *  v0.5.6 第十三轮需求 9：墙模式重建保滚动 + is-restoring 期
     *  重建的卡 no-anim（与 home.js refreshFromNet 同款处理） */
    function refreshFromNet() {
      if (!adapter || typeof adapter.search !== 'function') return;   // v0.5.7：adapter null → 缓存兜底
      var restoring = page.classList.contains('is-restoring');
      // v0.5.7：同 fetchNext——同步抛变异步 reject，网络失败静默（缓存兜底）
      Promise.resolve().then(function () {
        return adapter.search(q, 1);
      }).then(function (res) {
        if (state.done) return;
        var items = V.blacklist ? V.blacklist.filter(res.items) : res.items;
        // v0.5.6 第十六轮需求 5：滚动位置在 .then 里、render() 前记录
        // （与 home.js 同根因：调用时页面隐藏态 scrollTop≈0 → 重建后闪顶）
        var sc = document.querySelector('.vshell-page');
        var feedEl = sc && sc.querySelector('.vshell-feed');
        var scrollEl = feedEl || sc;
        var st = scrollEl ? scrollEl.scrollTop : 0;
        var merged = V.searchCache.refresh(q, items, res.hasMore);
        state.items = merged;
        state.hasMore = res.hasMore || !!cached.hasMore;
        if (V.viewMode && V.viewMode.get() === 'feed' && feedInst && feedInst.updateItems) {
          // 传 merged：updateItems 内部按已渲染 slide id 去重（已有更新 /
          // 新项追加），不会重复；真正的重复源是 fetchNext 跨页 concat
          // 不去重（已修）——缓存旧页与网络新页同 id 重复插入
          feedInst.updateItems(merged);        // 增量：不重建、不丢滚动
        } else {
          render();
          try {
            if (scrollEl && scrollEl.isConnected) scrollEl.scrollTop = st;
          } catch (e) { /* noop */ }
          if (restoring) {
            try {
              page.querySelectorAll('.vsc-video-card').forEach(function (c) {
                c.classList.add('no-anim');
              });
            } catch (e) { /* noop */ }
          }
        }
      }).catch(function () { /* 网络失败：保持本地缓存显示 */ });
    }

    if (!q) {
      wallHost.appendChild(V.wall.empty('请输入搜索关键词', 'codicon-search'));
    } else if (cached) {
      render();              // 先显示本地缓存内容
      refreshFromNet();      // 再拉网络增量更新
    } else {
      fetchNext().then(function (r) {
        if (state.done) return;
        render();
      });
    }

    // v0.1.9：tag 变更 → 重渲染（按当前模式）
    // v0.5.6 追加：feed 模式角色改动差量刷新（重建会回到列表第一个）
    function refresh() {
      if (state.done) return;
      if (sentinelEl) { try { sentinelEl.el.remove(); } catch (e) { /* noop */ } sentinelEl = null; }
      render();
    }
    var offTags = V.characters ? V.characters.onChange(function () {
      if (V.viewMode.get() === 'feed' && feedInst && feedInst.updateRole) {
        feedInst.updateRole();
        return;
      }
      // v0.5.6 OOM 修复：角色变更差量更新（不重建墙——poster/video 元素
      // 重建解码峰值曾致渲染进程 OOM）；布局切换仍走 refresh 全量
      if (V.wall && V.wall.updateChars(wallHost)) return;
      refresh();
    }) : null;
    // v0.3.36：卡片布局切换 → 重渲染墙
    var offLayout = V.wall ? V.wall.onLayoutChange(refresh) : null;
    // v0.3.85：全局视图模式切换 → 重渲染
    var offMode = V.viewMode ? V.viewMode.onChange(refresh) : null;

    return {
      destroy: function () {
        state.done = true;
        if (offTags) { try { offTags(); } catch (e) { /* noop */ } offTags = null; }
        if (offLayout) { try { offLayout(); } catch (e) { /* noop */ } offLayout = null; }
        if (offMode) { try { offMode(); } catch (e) { /* noop */ } offMode = null; }
        if (feedInst) { try { feedInst.destroy(); } catch (e) { /* noop */ } feedInst = null; }
        if (sentinelEl) sentinelEl.el.remove();
        page.remove();
      },
    };
  }

  V.pages = V.pages || {};
  V.pages.search = { mount: mount };
})();
