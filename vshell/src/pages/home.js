/* ============================================================
 * home — 主页
 * 结构：分类卡片（多源并集 chips）→ 视频主体
 * 双视图（v0.3.85）：墙（视频卡片网格 + 无限滚动）/
 *   刷（共享 V.feed 抖音视图 + 滑到底无限加载）
 * 模式由全局 V.viewMode 控制；feed 模式下隐藏分类区（沉浸式）
 * v0.5.7 多源（用户需求）：
 *   - 分类区 = 所有激活源分类并集（chip 标注来源，点击进带源的
 *     /category/<源>/<key>）
 *   - 墙 = multiwall（激活源 >1 时：各源 getHomeFeed 轮转交替 + a*k
 *     预取窗口；单源时退化为原逻辑含 home 缓存）
 *   - feed（刷）模式保持主源单源（多源滑动流实现复杂，未纳入本轮）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  function mount(outlet) {
    var adapter = V.siteAdapters.current();
    var srcIds = V.multisource.activeSources();
    // v0.5.7 用户反馈：取消所有数据源 → 无激活源 → 内容区空态（框架保留）
    if (!srcIds.length) {
      var emptyPage = V.utils.el('div', { className: 'vshell-page vshell-page-home' });
      emptyPage.appendChild(V.utils.el('div', { className: 'vshell-empty' }, [
        V.utils.el('div', { className: 'vshell-empty-icon codicon codicon-radio-tower' }),
        V.utils.el('div', { className: 'vshell-empty-text' }, '没有可用的数据源'),
        V.utils.el('div', { className: 'vshell-empty-text' }, '在设置中启用至少一个数据源后，这里会显示内容'),
      ]));
      outlet.appendChild(emptyPage);
      return;
    }
    var multi = srcIds.length > 1;
    var state = { feed: [], pn: 1, loading: false, hasMore: true, done: false };
    var sentinelEl = null;
    var feedInst = null;
    var mwInst = null;

    var page = V.utils.el('div', { className: 'vshell-page vshell-page-home' });

    // ---- 分类导航（v0.5.7 用户反馈：多源时**按数据源分多个独立分类卡片**——
    //      每个源一个卡片（组标题 = 源名，卡片几何在 .vshell-sections-group）；
    //      单源保持单卡片平铺；点击进 /category/<源>/<key>） ----
    var navBox = V.utils.el('div', {
      className: 'vshell-sections' + (multi ? ' is-multi' : ''),
    });
    var grid = V.utils.el('div', { className: 'vshell-sections-grid' });
    navBox.appendChild(grid);
    page.appendChild(navBox);

    // 多源：按 srcIds 顺序预建分组容器（异步填充 chips，组序稳定）
    var sectionGroups = {};
    if (multi) {
      srcIds.forEach(function (id) {
        var a0 = V.siteAdapters.adapterFor(id);
        if (!a0 || typeof a0.getHomeSections !== 'function') return;
        var group = V.utils.el('div', { className: 'vshell-sections-group' });
        group.appendChild(V.utils.el('div', { className: 'vshell-sections-group-title' }, [
          V.utils.el('span', { className: 'codicon ' + ((a0.meta && a0.meta.icon) || 'codicon-database') }),
          V.utils.el('span', null, (a0.meta && a0.meta.name) || id),
        ]));
        var gInner = V.utils.el('div', { className: 'vshell-sections-grid' });
        group.appendChild(gInner);
        navBox.appendChild(group);
        sectionGroups[id] = gInner;
      });
    }

    function mountSections() {
      srcIds.forEach(function (id) {
        var a = V.siteAdapters.adapterFor(id);
        if (!a || typeof a.getHomeSections !== 'function') return;
        a.getHomeSections().then(function (sections) {
          if (state.done || !sections) return;
          var target = sectionGroups[id] || grid;
          sections.forEach(function (sec) {
            if (!sec || !sec.key) return;
            var chip = V.utils.el('button', {
              className: 'vshell-section-chip',
              type: 'button',
              title: sec.title,
              'aria-label': '进入分类 ' + sec.title,
              'data-src': id,   // v0.5.7 多源：分类归属源
              onclick: function () {
                V.router.nav('/category/' + id + '/' + encodeURIComponent(sec.key));
              },
            }, [
              V.utils.el('span', { className: 'codicon ' + (sec.icon || 'codicon-layers') }),
              V.utils.el('span', null, sec.title),
            ]);
            target.appendChild(chip);
          });
        }).catch(function () { /* 单源分类失败静默（其他源照常） */ });
      });
    }

    // ---- 视频主体 ----
    var wallHost = V.utils.el('div', { className: 'vshell-wall-host' });
    var loadingMore = V.utils.el('div', { className: 'vshell-wall-loading', hidden: '' }, [
      V.utils.el('span', { className: 'vshell-spinner' }),
      V.utils.el('span', { className: 'vshell-wall-loading-text' }, '加载中…'),
    ]);
    page.appendChild(wallHost);
    page.appendChild(loadingMore);
    outlet.appendChild(page);

    // ================= 视频墙（v0.6.0 单源/多源统一走 multiwall → source-feed）
    //      单源退化为顺序取；多源 abcabc 轮转混插。缓存分片 vshell.wall.home.<源>）
    function mountMultiWall() {
      mwInst = V.multiwall.create(wallHost, {
        cacheKey: 'wall.home',
        fetch: function (srcId, pn) {
          var a = V.siteAdapters.adapterFor(srcId);
          if (!a || typeof a.getHomeFeed !== 'function') {
            // adapter 未就绪 → 返回 null（source-feed 视为「可重试失败」，不
            // 持久化 hasMore:false；否则被误判「源已耗尽」→ 主页永久空态）
            return Promise.resolve(null);
          }
          return a.getHomeFeed(pn).then(function (res) {
            return res || null;   // 失败也返回 null（可重试），不落坏缓存
          });
        },
        filter: function (items) {
          return V.blacklist ? V.blacklist.filter(items) : items;
        },
        doneCb: function () { loadingMore.hidden = true; },
      });
      return { destroy: function () { if (mwInst) { try { mwInst.destroy(); } catch (e) { /* noop */ } mwInst = null; } } };
    }

    // ================= 单源逻辑（原实现：缓存/刷新/feed） =================
    /** 拉下一页（墙 sentinel 与 feed 滑底共用）；返回 {items,start} | null */
    function fetchNext() {
      if (state.loading || !state.hasMore || state.done) return Promise.resolve(null);
      if (!adapter || typeof adapter.getHomeFeed !== 'function') return Promise.resolve(null);
      state.loading = true;
      loadingMore.hidden = false;
      // v0.5.7：插件 adapter 可能同步抛（内部对象未就绪）——Promise.resolve()
      // 包裹把同步抛变异步 reject，落到下方 .catch 呈现错误态而非整页崩溃
      return Promise.resolve().then(function () {
        return adapter.getHomeFeed(state.pn);
      }).then(function (res) {
        if (state.done) return null;
        var items = V.blacklist ? V.blacklist.filter(res.items) : res.items;
        var start = state.feed.length;
        var known = {};
        state.feed.forEach(function (it) { if (it && it.id) known[it.id] = true; });
        var fresh = items.filter(function (it) { return it && it.id && !known[it.id]; });
        state.feed = state.feed.concat(fresh);
        state.hasMore = res.hasMore;
        state.pn++;
        state.loading = false;
        loadingMore.hidden = true;
        if (V.searchCache) {
          if (state.pn === 2) V.searchCache.set('home', state.feed, 1, state.hasMore);
          else V.searchCache.append('home', fresh, state.pn - 1, state.hasMore);
        }
        return { items: fresh, start: start, hasMore: res.hasMore };
      }).catch(function (e) {
        if (state.done) return null;
        state.loading = false;
        loadingMore.hidden = true;
        if (!state.feed.length) {
          wallHost.innerHTML = '';
          wallHost.appendChild(V.wall.empty('加载失败：' + e.message, 'codicon-error'));
        }
        return null;
      });
    }

    /** 网络首页拉取 → 增量合并（缓存命中时由 mount 调用） */
    function refreshFromNet() {
      if (!adapter || typeof adapter.getHomeFeed !== 'function') return;
      var restoring = page.classList.contains('is-restoring')
        || (page.parentNode && page.parentNode.classList.contains('is-restoring'));
      // v0.5.7：同 fetchNext——同步抛变异步 reject，网络失败静默（缓存兜底）
      Promise.resolve().then(function () {
        return adapter.getHomeFeed(1);
      }).then(function (res) {
        if (state.done) return;
        var items = V.blacklist ? V.blacklist.filter(res.items) : res.items;
        var sc = document.querySelector('.vshell-page');
        var feedEl = sc && sc.querySelector('.vshell-feed');
        var scrollEl = feedEl || sc;
        var st = scrollEl ? scrollEl.scrollTop : 0;
        var merged = V.searchCache
          ? V.searchCache.refresh('home', items, res.hasMore)
          : items;
        var known = {};
        state.feed.forEach(function (it) { if (it && it.id) known[it.id] = true; });
        var fresh = merged.filter(function (it) { return it && it.id && !known[it.id]; });
        state.feed = merged;
        state.hasMore = res.hasMore;
        window.__VS_HOME_ST__ = st;
        if (V.viewMode.get() === 'feed' && feedInst && feedInst.updateItems) {
          feedInst.updateItems(fresh);
        } else {
          render();
          try {
            if (scrollEl && scrollEl.isConnected) scrollEl.scrollTop = st;
          } catch (e) { /* noop */ }
          window.__VS_HOME_AFTER__ = scrollEl ? scrollEl.scrollTop : -1;
          if (restoring) {
            try {
              page.querySelectorAll('.vsc-video-card').forEach(function (c) {
                c.classList.add('no-anim');
              });
            } catch (e) { /* noop */ }
          }
        }
      }).catch(function () { /* 网络失败静默（缓存兜底） */ });
    }

    // ---- 刷视图（单源；滑到底拉下一页追加 slide） ----
    function renderFeed() {
      wallHost.innerHTML = '';
      feedInst = V.feed.mount(wallHost, {
        items: state.feed,
        getMore: fetchNext,
      });
    }

    function render() {
      if (state.done) return;
      if (feedInst) { try { feedInst.destroy(); } catch (e) { /* noop */ } feedInst = null; }
      if (mwInst) { try { mwInst.destroy(); } catch (e) { /* noop */ } mwInst = null; }
      if (V.viewMode.get() === 'feed') {
        // 刷模式：单源滑动流（feed 实例），保持原逻辑
        if (!adapter || typeof adapter.getHomeFeed !== 'function') {
          wallHost.innerHTML = '';
          wallHost.appendChild(V.wall.empty('数据源不可用', 'codicon-error'));
          return;
        }
        renderFeed();
      } else {
        mountMultiWall();   // v0.6.0：墙模式单源/多源统一走 source-feed
      }
    }

    // ---- 初始化 ----
    mountSections();
    // v0.6.0：墙模式统一走 multiwall（source-feed 内部读缓存分片 + 增量拉取），
    // feed 模式（刷）保持单源原逻辑（searchCache 'home' + 网络刷新）。
    if (V.viewMode.get() === 'feed') {
      if (!adapter || typeof adapter.getHomeFeed !== 'function') {
        var na = V.utils.el('div', { className: 'vshell-empty' }, [
          V.utils.el('div', { className: 'vshell-empty-icon codicon codicon-error' }),
          V.utils.el('div', { className: 'vshell-empty-text' }, '数据源不可用'),
          V.utils.el('div', { className: 'vshell-empty-text' }, '在设置中重新加载该数据源，或启用其他数据源'),
        ]);
        wallHost.appendChild(na);
      } else {
        var cached = V.searchCache ? V.searchCache.get('home') : null;
        if (cached) {
          state.feed = cached.items.slice();
          state.pn = cached.pn;
          state.hasMore = cached.hasMore;
          render();
          refreshFromNet();
        } else {
          fetchNext().then(function (r) {
            if (state.done) return;
            render();
          });
        }
      }
    } else {
      render();
    }

    // 角色变更 → 差量刷新（multiwall 与单源墙同款）
    function refresh() {
      if (state.done) return;
      if (mwInst && mwInst.updateChars && mwInst.updateChars()) return;
      if (V.wall && V.wall.updateChars(wallHost)) return;
      if (sentinelEl) { try { sentinelEl.el.remove(); } catch (e) { /* noop */ } sentinelEl = null; }
      render();
    }
    var offTags = V.characters ? V.characters.onChange(function () {
      if (V.viewMode.get() === 'feed' && feedInst && feedInst.updateRole) {
        feedInst.updateRole();
        return;
      }
      refresh();
    }) : null;
    var offLayout = V.wall ? V.wall.onLayoutChange(refresh) : null;
    var offMode = V.viewMode ? V.viewMode.onChange(render) : null;
    // v0.5.7 多源：源集合/隐私/k 变化 → 重建
    var offMulti = V.multisource ? V.multisource.onChange(function () {
      if (state.done) return;
      srcIds = V.multisource.activeSources();
      multi = srcIds.length > 1;
      grid.innerHTML = '';
      mountSections();
      render();
    }) : null;

    return {
      destroy: function () {
        state.done = true;
        if (offTags) { try { offTags(); } catch (e) { /* noop */ } offTags = null; }
        if (offLayout) { try { offLayout(); } catch (e) { /* noop */ } offLayout = null; }
        if (offMode) { try { offMode(); } catch (e) { /* noop */ } offMode = null; }
        if (offMulti) { try { offMulti(); } catch (e) { /* noop */ } offMulti = null; }
        if (feedInst) { try { feedInst.destroy(); } catch (e) { /* noop */ } feedInst = null; }
        if (mwInst) { try { mwInst.destroy(); } catch (e) { /* noop */ } mwInst = null; }
        if (sentinelEl) sentinelEl.el.remove();
        page.remove();
      },
    };
  }

  V.pages = V.pages || {};
  V.pages.home = { mount: mount };
})();
