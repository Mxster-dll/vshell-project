/* ============================================================
 * watchlist — 待看 / 收藏
 * 双视图：刷（类抖音，共享 V.feed 组件）/ 墙（视频卡片网格）
 * 模式由全局 V.viewMode 控制（导航栏左侧按钮切换，统一默认墙）
 * 数据：V.saved（GM 持久化）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  function mount(outlet, params) {
    params = params || {};
    var standaloneFav = params.type === 'fav';   // 独立收藏页（#/fav）
    var adapter = V.siteAdapters.current();
    var done = false;
    var tab = standaloneFav ? 'fav' : 'watch';   // 'watch' | 'fav'
    var page = null;
    var feedInst = null;

    page = V.utils.el('div', { className: 'vshell-page vshell-page-watchlist' });
    outlet.appendChild(page);

    var body = V.utils.el('div', { className: 'vshell-watchlist-body' });
    page.appendChild(body);

    function listFor() {
      return tab === 'watch' ? V.saved.listWatch() : V.saved.listFav();
    }

    function renderAll() {
      if (done) return;
      if (feedInst) { try { feedInst.destroy(); } catch (e) { /* noop */ } feedInst = null; }
      body.innerHTML = '';

      var items = listFor();
      if (!items.length) {
        var go = V.utils.el('a', {
          className: 'vshell-btn vshell-btn-primary', href: '#/',
        }, '去逛逛');
        body.appendChild(V.wall.empty(
          tab === 'watch' ? '待看列表是空的' : '还没有收藏视频',
          tab === 'watch' ? 'codicon-bookmark' : 'codicon-heart', go));
        return;
      }
      if (V.viewMode.get() === 'wall') {
        body.appendChild(V.wall.grid(items));
      } else {
        // v0.3.97：列表驱动 feed 传 inList——取消待看不立即移除，
        // 由 feed 内部延迟到滑走后删除
        feedInst = V.feed.mount(body, {
          items: items,
          inList: function (it) {
            return listFor().some(function (x) {
              return x.id === it.id && (x.sourceId || '') === (it.sourceId || '');
            });
          },
        });
      }
    }

    // v0.3.90：差量更新——卡片上的待看/收藏按钮点击已自更新按钮状态，
    // 只有「当前列表移除该项」才需动 DOM；整体重渲染会重播所有卡片
    // 入场动画（用户反馈：加入收藏/待看后全部卡片动画重播）。
    V.saved.on(function (data, info) {
      if (done) return;
      if (info && info.kind === 'face') {
        // 头像回填：仅刷新对应 slide 头像（feed 视图；墙视图无头像）
        if (feedInst && feedInst.updateFace) feedInst.updateFace(info.id);
        return;
      }
      if (info && info.op === 'remove') {
        // 该项从当前列表移除 → 差量删除对应卡片/slide
        // v0.5.7 多源：按（源,id）匹配（跨源同 id 是不同卡片）
        var still = listFor().some(function (it) { return it.id === info.id && (it.sourceId || '') === (info.src || ''); });
        if (still) return;                 // 移除的是另一个列表的项（如待看页取消收藏）
        if (feedInst) {
          // v0.3.97：feed 视图不立即删除——feed 内部标记 pendingRemove，
          // 直到该 slide 被刷走才移除；这里只兜底「列表清空 → 空态」
          if (!listFor().length) renderAll();
          return;
        }
        var sel = '.vsc-video-card[data-id="' + info.id + '"]' + (info.src ? '[data-src="' + info.src + '"]' : '');
        var c = body.querySelector(sel);
        if (c) { c.remove(); }
        if (!listFor().length) renderAll();   // 列表空 → 空态
        return;
      }
      if (info && info.op === 'add') {
        // 加入：卡片按钮点击时按钮状态已自更新 → 不动（无动画重播）；
        // 但外部加入（非本页按钮点击，如探针/未来功能）且 DOM 无此卡 → 需渲染
        var sel2 = '.vsc-video-card[data-id="' + info.id + '"]' + (info.src ? '[data-src="' + info.src + '"]' : '');
        var c2 = body.querySelector(sel2);
        var s2 = feedInst && feedInst.findSlide ? feedInst.findSlide(info.id) : null;
        if (!c2 && !s2 && listFor().length) renderAll();
        return;
      }
      renderAll();   // 兜底（无 info 的旧式变更）
    });
    // v0.1.9：tag 变更 → 重渲染（墙视图卡片胶囊即时刷新）
    // v0.5.5 用户需求：抖音刷（feed）模式下角色改动不再重建 feed
    // （重建会回到列表第一个）——改为差量刷新各 slide 的头像与角色名
    var offTags = V.characters ? V.characters.onChange(function () {
      if (done) return;
      if (V.viewMode.get() === 'feed' && feedInst && feedInst.updateRole) {
        feedInst.updateRole();
        return;
      }
      // v0.5.6 OOM 修复：角色变更差量更新（不重建墙——poster/video 元素
      // 重建解码峰值曾致渲染进程 OOM）
      if (V.wall && V.wall.updateChars(body)) return;
      renderAll();
    }) : null;
    // v0.3.85：全局视图模式切换 → 重渲染
    var offMode = V.viewMode ? V.viewMode.onChange(function () {
      if (!done) renderAll();
    }) : null;
    // v0.3.87：卡片布局切换（standard/cover）→ 重渲染墙（用户反馈：待看/收藏
    // 页响应不了布局切换按钮——home/category/search 有注册，此页漏了）
    var offLayout = V.wall ? V.wall.onLayoutChange(function () {
      if (!done) renderAll();
    }) : null;

    renderAll();

    // 头像回填：旧数据（saved.js 白名单补 face 前存的）无 face →
    // 错开 300ms 逐个调 getVideoDetail 补拉，成功后 setFace 触发重渲染
    backfillFaces();

    function backfillFaces() {
      var items = listFor();
      var pending = items.filter(function (it) { return !(it.owner && it.owner.face); }).slice(0, 10);
      if (!pending.length || !adapter || !adapter.getVideoDetail) return;
      pending.forEach(function (it, i) {
        setTimeout(function () {
          if (done) return;
          adapter.getVideoDetail(it.id).then(function (d) {
            if (done || !d || !d.owner || !d.owner.face) return;
            V.saved.setFace(it.id, d.owner.face);
          }).catch(function () { /* 网络失败静默，下次进入再试 */ });
        }, 300 * (i + 1));
      });
    }

    return {
      destroy: function () {
        done = true;
        if (offTags) { try { offTags(); } catch (e) { /* noop */ } offTags = null; }
        if (offMode) { try { offMode(); } catch (e) { /* noop */ } offMode = null; }
        if (offLayout) { try { offLayout(); } catch (e) { /* noop */ } offLayout = null; }
        if (feedInst) { try { feedInst.destroy(); } catch (e) { /* noop */ } feedInst = null; }
        page.remove();
      },
    };
  }

  V.pages = V.pages || {};
  V.pages.watchlist = { mount: mount };
})();
