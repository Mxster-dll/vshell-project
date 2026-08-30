/* ============================================================
 * blacklist — 黑名单独立页（v0.3.85，用户拍板：独立页面 #/blacklist）
 * 三视图：列表（原弹窗行样式）/ 墙（卡片网格，屏蔽按钮反转为解除）/
 *   刷（共享 V.feed，动作列=待看/收藏/解除）
 * 模式由全局 V.viewMode 控制；数据 V.blacklist（自动持久化）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  function mount(outlet) {
    var done = false;
    var feedInst = null;

    var page = V.utils.el('div', { className: 'vshell-page vshell-page-blacklist' });
    var head = V.utils.el('div', { className: 'vshell-page-head' }, [
      V.utils.el('button', {
        className: 'vshell-icon-btn vshell-page-back',
        type: 'button', 'aria-label': '返回',
        onclick: function () {
          if (history.length > 1) history.back();
          else V.router.nav('/');
        },
      }, V.utils.el('span', { className: 'codicon codicon-arrow-left' })),
      V.utils.el('h1', { className: 'vshell-page-title' }, '黑名单'),
    ]);
    page.appendChild(head);

    var body = V.utils.el('div', { className: 'vshell-blacklist-body' });
    page.appendChild(body);
    outlet.appendChild(page);

    // ---- 列表视图（原弹窗行样式） ----
    function renderList() {
      var list = V.blacklist.list();
      if (!list.length) {
        body.appendChild(V.utils.el('div', { className: 'vshell-modal-sub' },
          '还没有屏蔽的视频——卡片左下角的屏蔽按钮可隐藏单个视频'));
        return;
      }
      list.forEach(function (b) {
        body.appendChild(V.utils.el('div', { className: 'vshell-tag-row' }, [
          V.utils.el('span', { className: 'codicon codicon-circle-slash vshell-blacklist-row-icon' }),
          V.utils.el('span', { className: 'vshell-tag-row-name' }, b.title || b.id),
          V.utils.el('button', {
            className: 'vshell-tag-row-del codicon codicon-close',
            title: '解除屏蔽',
            'aria-label': '解除屏蔽 ' + (b.title || b.id),
            onclick: function () { V.blacklist.remove(b.id, b.sourceId); },
          }),
        ]));
      });
    }

    // ---- 墙视图（卡片左下角按钮反转为「解除屏蔽」） ----
    function renderWall() {
      var list = V.blacklist.list();
      if (!list.length) {
        body.appendChild(V.wall.empty('黑名单是空的', 'codicon-circle-slash'));
        return;
      }
      body.appendChild(V.wall.grid(list, { blacklistMode: true }));
    }

    // ---- 刷视图 ----
    function renderFeed() {
      var list = V.blacklist.list();
      if (!list.length) {
        body.appendChild(V.wall.empty('黑名单是空的', 'codicon-circle-slash'));
        return;
      }
      // v0.3.96：统一使用默认四按钮（详情/待看/收藏/黑名单）——
      // 黑名单页里「黑名单」按钮恒高亮（isBlocked），点击 = 解除屏蔽。
      // v0.3.97：传 inList → feed 内部延迟移除（解除后直到刷走才删）
      feedInst = V.feed.mount(body, {
        items: list,
        inList: function (it) { return V.blacklist.isBlocked(it.id); },
      });
    }

    function render() {
      if (done) return;
      if (feedInst) { try { feedInst.destroy(); } catch (e) { /* noop */ } feedInst = null; }
      body.innerHTML = '';
      var mode = V.viewMode.get();
      if (mode === 'feed') renderFeed();
      else if (mode === 'wall') renderWall();
      else renderList();
    }

    // 数据变化（解除屏蔽）→ 重渲染；模式切换 → 重渲染；布局切换（v0.3.87）→ 重渲染
    // v0.3.97：黑名单变化——feed 视图下不重建（feed 内部延迟移除：
    // 解除后直到该 slide 被刷走才删），仅列表清空时渲染空态；
    // 墙/列表视图照常整体重渲染
    var offBlack = V.blacklist.onChange(function () {
      if (done) return;
      if (V.viewMode.get() === 'feed') {
        if (!V.blacklist.list().length) render();
        return;
      }
      render();
    });
    var offMode = V.viewMode ? V.viewMode.onChange(function () { render(); }) : null;
    var offLayout = V.wall ? V.wall.onLayoutChange(function () { render(); }) : null;
    // v0.5.6 追加：角色改动——feed 模式差量刷新（重建会回到列表第一个）
    var offChars = V.characters ? V.characters.onChange(function () {
      if (done) return;
      if (V.viewMode.get() === 'feed' && feedInst && feedInst.updateRole) {
        feedInst.updateRole();
        return;
      }
      // v0.5.6 OOM 修复：角色变更差量更新（不重建墙——poster/video 元素
      // 重建解码峰值曾致渲染进程 OOM）
      if (V.wall && V.wall.updateChars(body)) return;
      render();
    }) : null;

    render();

    return {
      destroy: function () {
        done = true;
        if (offBlack) { try { offBlack(); } catch (e) { /* noop */ } offBlack = null; }
        if (offMode) { try { offMode(); } catch (e) { /* noop */ } offMode = null; }
        if (offLayout) { try { offLayout(); } catch (e) { /* noop */ } offLayout = null; }
        if (offChars) { try { offChars(); } catch (e) { /* noop */ } offChars = null; }
        if (feedInst) { try { feedInst.destroy(); } catch (e) { /* noop */ } feedInst = null; }
        page.remove();
      },
    };
  }

  V.pages = V.pages || {};
  V.pages.blacklist = { mount: mount };
})();
