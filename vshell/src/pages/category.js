/* ============================================================
 * category — 分类视频墙页
 * tid=0 → 全站热门（popular 无限滚动）；主分区/子分区 → 榜单数据
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  function mount(outlet, params) {
    // v0.5.7 多源：URL 带源（/category/<源>/<key>）→ 该源适配器；
    // 旧格式（无源）→ 主源
    var srcId = params && params.src ? params.src : V.multisource.primary();
    var adapter = V.siteAdapters.adapterFor(srcId);
    if (!adapter) {
      outlet.appendChild(V.wall.empty('数据源不可用', 'codicon-error'));
      return { destroy: function () {} };
    }
    var tid = params.tid || '0';
    var state = { items: [], loading: false, hasMore: false, done: false };
    var sentinelEl = null;
    var feed = null;

    var page = V.utils.el('div', { className: 'vshell-page vshell-page-category' });

    // 头部：返回 + 分类名（多源时标注来源）
    var titleTxt = adapter.getSectionName ? (adapter.getSectionName(tid) || '分类') : '分类';
    if (params && params.src && V.multisource.activeSources().length > 1) {
      titleTxt = ((adapter.meta && adapter.meta.name) || params.src) + ' · ' + titleTxt;
    }
    var head = V.utils.el('div', { className: 'vshell-page-head' }, [
      V.utils.el('button', {
        className: 'vshell-icon-btn vshell-page-back',
        type: 'button', 'aria-label': '返回',
        onclick: function () {
          if (history.length > 1) history.back();
          else V.router.nav('/');
        },
      }, V.utils.el('span', { className: 'codicon codicon-arrow-left' })),
      V.utils.el('h1', { className: 'vshell-page-title' }, titleTxt),
    ]);
    page.appendChild(head);

    var wallHost = V.utils.el('div', { className: 'vshell-wall-host' });
    var loadingEl = V.utils.el('div', { className: 'vshell-wall-loading', hidden: '' }, [
      V.utils.el('span', { className: 'vshell-spinner' }),
    ]);
    page.appendChild(wallHost);
    page.appendChild(loadingEl);
    outlet.appendChild(page);

    /** v0.6.0 数据源层：分类墙改走 source-feed（增量拉取 + 缓存分片 +
     *  相对路径）。单源墙退化为顺序取，行为与原翻页一致。 */
    function mountFeed() {
      feed = V.sourceFeed.create({
        srcId: srcId,
        cacheKey: 'wall.category.' + tid,   // 分类键含 tid（不同分类独立分片）
        fetchFn: function (page) {
          if (!adapter) return Promise.resolve(null);   // 未就绪 → 可重试
          var p = (tid === '0' || tid === undefined)
            ? adapter.getHomeFeed(page)
            : adapter.getCategoryVideos(tid, page);
          return p.then(function (res) { return res || null; });   // 失败不落坏缓存
        },
        filter: function (items) {
          return V.blacklist ? V.blacklist.filter(items) : items;
        },
        onDrain: function () {
          loadingEl.hidden = true;
          if (sentinelEl) { try { sentinelEl.el.remove(); } catch (e) { /* noop */ } sentinelEl = null; }
        },
      });
      feed.init().then(function () {
        if (state.done) return;
        fillWindow();
        renderWall();
        // 首屏不足一窗 → 主动预取
        if (state.items.length < V.multisource.windowSize()) more();
      });
    }

    function fillWindow() {
      var target = state.items.length + V.multisource.windowSize();
      while (state.items.length < target) {
        var it = feed.take();
        if (!it) break;
        state.items.push(it);
      }
    }

    function more() {
      if (state.loading || state.done) return;
      state.loading = true;
      loadingEl.hidden = false;
      var added = [];
      fillWindow();
      // 队列空 → 预取 → 再取
      feed.ready().then(function (has) {
        if (state.done) { state.loading = false; return; }
        var before = state.items.length;
        fillWindow();
        added = state.items.slice(before);
        if (added.length) appendItems(before);
        state.loading = false;
        loadingEl.hidden = true;
        if (!feed.hasMore() && !feed.size()) {
          if (sentinelEl) { try { sentinelEl.el.remove(); } catch (e) { /* noop */ } sentinelEl = null; }
        }
      });
    }
    /** 增量追加；墙不存在（首次/异常清空后）→ 全量重建 */
    function appendItems(start) {
      var wall = wallHost.querySelector('.vshell-wall');
      if (!wall || !state.items.length) { renderWall(); return; }
      V.wall.appendCards(wall, state.items.slice(start), start);
    }
    function renderWall() {
      wallHost.innerHTML = '';
      if (state.items.length) {
        wallHost.appendChild(V.wall.grid(state.items));
        if (sentinelEl) { try { sentinelEl.el.remove(); } catch (e) { /* noop */ } sentinelEl = null; }
        sentinelEl = V.wall.sentinel(function () { more(); });
        wallHost.appendChild(sentinelEl.el);
      } else {
        wallHost.appendChild(V.wall.empty('该分类暂无内容', 'codicon-inbox'));
      }
    }

    mountFeed();

    // v0.1.9：tag 变更 → 重渲染墙（胶囊即时出现/消失）
    function refresh() {
      if (state.done) return;
      if (sentinelEl) { try { sentinelEl.el.remove(); } catch (e) { /* noop */ } sentinelEl = null; }
      renderWall();
    }
    // v0.5.6 OOM 修复：角色变更差量更新（不重建墙——poster/video 元素
    // 重建解码峰值曾致渲染进程 OOM）；布局切换仍走 refresh 全量
    var offTags = V.characters ? V.characters.onChange(function () {
      if (state.done) return;
      if (V.wall && V.wall.updateChars(wallHost)) return;
      refresh();
    }) : null;
    // v0.3.36：卡片布局切换 → 重渲染墙
    var offLayout = V.wall ? V.wall.onLayoutChange(refresh) : null;

    return {
      destroy: function () {
        state.done = true;
        if (feed) { try { feed.destroy(); } catch (e) { /* noop */ } feed = null; }
        if (offTags) { try { offTags(); } catch (e) { /* noop */ } offTags = null; }
        if (offLayout) { try { offLayout(); } catch (e) { /* noop */ } offLayout = null; }
        if (sentinelEl) sentinelEl.el.remove();
        page.remove();
      },
    };
  }

  V.pages = V.pages || {};
  V.pages.category = { mount: mount };
})();
