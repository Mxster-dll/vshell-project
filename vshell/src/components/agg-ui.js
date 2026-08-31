/* ============================================================
 * agg-ui — 视频聚合二期交互（v0.6.2）
 *   右键菜单：单卡「新增为组 / 添加到组 / 多选」；组卡「添加到组」
 *   多选模式：「新增为一组 / 新增为多组 / 添加到组 / 取消」
 *   拖拽合并（长按 400ms）：单+单→建组弹窗选标题封面、视频↔组→直接并入、
 *     组+组→合并弹窗选标题封面
 *   组选择弹窗（搜索 + 新建组）
 *   详情页工具：解除聚合（拆出当前源）、成员片段/完整版三态标记
 * 依赖（运行时引用）：V.aggregations / V.router / V.toast / V.utils
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  /* ---------------- 通用 ---------------- */
  function isGrpId(id) { return typeof id === 'string' && /^grp:/.test(id); }

  /** 渲染项 → 成员引用：组卡（_grp / grp: id）→ 组对象；单卡 → {src,id,title,pic,sourceId} */
  function memberOf(item) {
    if (!item || !V.aggregations) return null;
    if (item._grp || isGrpId(item.id)) return V.aggregations.getGroup(item.id) || null;
    return {
      src: item.sourceId || null,
      id: item.id,
      title: item.title,
      pic: item.pic || item.cover || '',
      sourceId: item.sourceId || null,
    };
  }
  function isGrp(m) { return !!m && isGrpId(m.id); }

  function toast(msg, ok) {
    if (!V.toast) return;
    if (ok) V.toast.ok(msg); else V.toast.info(msg);
  }

  /** 操作完成后刷新当前页（router.nav 同 hash → emit 重触发渲染）。
   *  v0.6.2 二期：组操作不再整页重渲染（用户反馈：添加组后页面跳动/滚动丢失），
   *  改由 refreshAfterGroupOp / refreshAfterMerge 局部替换卡片。此函数仅保留
   *  给确实需要全量重挂载的场景。 */
  function refresh() {
    closeMenu();
    exitMultiSelect();
    try { V.router.nav(location.hash); } catch (e) { /* noop */ }
  }

  /** 把单张卡原地替换为组卡（不重渲染页面，保持滚动位置） */
  function replaceWithGroup(card, gid) {
    if (!card || !card.parentNode || !V.aggregations) return;
    var g = V.aggregations.getGroup(gid);
    if (!g) return;
    var opts = {
      layout: V.wall ? V.wall.layout() : 'standard',
      blacklistMode: !!(card.closest && card.closest('.vshell-blacklist-page')),
    };
    var gitem = {
      id: g.id,
      title: g.title || '',
      pic: g.cover || '',
      cover: g.cover || '',
      sourceId: g.coverSrc || null,
      _grp: true,
    };
    var nc;
    try { nc = V.videoCard.create(gitem, opts); } catch (e) { return; }
    var idx = card.style.getPropertyValue('--i');
    if (idx) nc.style.setProperty('--i', idx);   // 继承入场动画序号（防动画重排）
    card.parentNode.replaceChild(nc, card);
  }

  /** 组操作后局部更新当前页墙：
   *  该组成员仍是单卡的 → 替换为组卡（页面已有同组组卡则直接删除单卡）；
   *  不触碰其他卡片，不重渲染，滚动位置保持 */
  function refreshAfterGroupOp(gid) {
    if (!V.aggregations) return;
    var g = V.aggregations.getGroup(gid);
    if (!g) return;
    var members = {};
    (g.members || []).forEach(function (m) { members[m.src + ':' + m.id] = true; });
    var cards = document.querySelectorAll('.vsc-video-card');
    function pageHasGrpCard() {
      var has = false;
      document.querySelectorAll('.vsc-video-card').forEach(function (x) {
        var xi = x.__item;
        if (xi && xi._grp && String(xi.id) === String(gid)) has = true;
      });
      return has;
    }
    var remove = [];
    for (var j = 0; j < cards.length; j++) {
      var c = cards[j];
      var it = c.__orig || c.__item;
      if (!it || !it.id) continue;
      if (it._grp || /^grp:/.test(it.id || '')) continue;
      var src = it.sourceId || c.getAttribute('data-src') || '';
      var isMember = !!members[src + ':' + it.id];
      if (!isMember && !src) {
        // 仅无源快照卡（charVideos/featured 旧数据缺 sourceId）按 id 宽松匹配；
        // 有源卡必须精确 (源,id) 匹配——防同 id 跨源卡误折叠/误删
        for (var k = 0; k < g.members.length; k++) {
          if (String(g.members[k].id) === String(it.id)) { isMember = true; break; }
        }
      }
      if (!isMember) continue;
      if (pageHasGrpCard()) {
        remove.push(c);                     // 已有组卡 → 删单卡（防重复组卡）
      } else {
        replaceWithGroup(c, gid);
      }
    }
    remove.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); });
  }

  /** 合并后局部更新：gidKeep 保留、gidGone 消失——删除页面上 gidGone 的组卡
   *  （若存在），再按 gidKeep 折叠成员单卡 */
  function refreshAfterMerge(gidKeep, gidGone) {
    if (!V.aggregations) return;
    document.querySelectorAll('.vsc-video-card').forEach(function (c) {
      var it = c.__item;
      if (it && it._grp && String(it.id) === String(gidGone)) {
        if (c.parentNode) c.parentNode.removeChild(c);
      }
    });
    refreshAfterGroupOp(gidKeep);
  }

  /* ---------------- 右键菜单 ---------------- */
  var ctx = { menu: null, card: null, onDocDown: null, onEsc: null, onWheel: null };

  function closeMenu() {
    if (!ctx.menu) return;
    ctx.menu.remove();
    ctx.menu = null;
    ctx.card = null;
    if (ctx.onDocDown) window.removeEventListener('pointerdown', ctx.onDocDown, true);
    if (ctx.onEsc) window.removeEventListener('keydown', ctx.onEsc);
    if (ctx.onWheel) window.removeEventListener('wheel', ctx.onWheel);
    ctx.onDocDown = ctx.onEsc = ctx.onWheel = null;
  }

  function openMenu(card, item, pos) {
    if (!V.aggregations) return;
    closeMenu();
    var m = memberOf(item);
    if (!m) return;
    ctx.card = card;
    var host = document.querySelector('.vshell-app') || document.body;
    var menu = V.utils.el('div', { className: 'vshell-ctx-menu' });
    function itemBtn(label, icon, fn) {
      menu.appendChild(V.utils.el('button', {
        className: 'vshell-ctx-item',
        type: 'button',
        onclick: function (e) { e.stopPropagation(); fn(); },
      }, [
        V.utils.el('span', { className: 'codicon ' + icon + ' vshell-ctx-icon' }),
        V.utils.el('span', { className: 'vshell-ctx-label' }, label),
      ]));
    }
    if (isGrp(m)) {
      itemBtn('添加到组', 'codicon-list-unordered', function () { closeMenu(); pickGroup([m]); });
      itemBtn('多选', 'codicon-check-all', function () { closeMenu(); startMultiSelect(card); });
    } else {
      itemBtn('新增为组', 'codicon-add', function () { closeMenu(); createGroupDlg([m]); });
      itemBtn('添加到组', 'codicon-list-unordered', function () { closeMenu(); pickGroup([m]); });
      itemBtn('多选', 'codicon-check-all', function () { closeMenu(); startMultiSelect(card); });
    }
    host.appendChild(menu);
    ctx.menu = menu;
    var w = menu.offsetWidth || 180;
    var h = menu.offsetHeight || 120;
    var x = Math.max(4, Math.min((pos && pos.x) || 100, window.innerWidth - w - 8));
    var y = Math.max(4, Math.min((pos && pos.y) || 100, window.innerHeight - h - 8));
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    ctx.onDocDown = function (e) {
      if (ctx.menu && !ctx.menu.contains(e.target)) closeMenu();
    };
    ctx.onEsc = function (e) { if (e.key === 'Escape') closeMenu(); };
    ctx.onWheel = closeMenu;
    window.addEventListener('pointerdown', ctx.onDocDown, true);
    window.addEventListener('keydown', ctx.onEsc);
    window.addEventListener('wheel', ctx.onWheel);
  }

  /* ---------------- 通用弹窗 ---------------- */
  function modal(title, body, footBtns, cls) {
    var fsEl = document.fullscreenElement
      || document.querySelector('.vshell-feed.is-feed-fullscreen-sim');
    var host = fsEl || document.querySelector('.vshell-app') || document.body;
    var overlay = V.utils.el('div', {
      className: 'vshell-modal-backdrop vshell-picker-backdrop' + (cls ? ' ' + cls : ''),
    });
    var box = V.utils.el('div', { className: 'vshell-modal vshell-agg-modal' });
    box.appendChild(V.utils.el('div', { className: 'vshell-modal-title-row' }, [
      V.utils.el('div', { className: 'vshell-modal-title' }, title),
    ]));
    box.appendChild(body);
    if (footBtns && footBtns.length) {
      box.appendChild(V.utils.el('div', { className: 'vshell-tag-foot' }, footBtns));
    }
    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    host.appendChild(overlay);
    function close() { overlay.remove(); }
    return { overlay: overlay, box: box, close: close };
  }
  function footBtn(label, cls, onClick) {
    return V.utils.el('button', { className: 'vshell-btn ' + cls, type: 'button', onclick: onClick }, label);
  }
  /** 封面元素：完整 URL 直接显示；相对路径/加密图先占位，经
   *  aggregations.picUrlOf（解密 + 拼 baseUrl）异步回填；加载失败回占位。
   *  v0.6.2 二期修复：建组/合并/组列表弹窗封面此前直接 img src=原 pic，
   *  17c 加密图与 source-feed 相对路径封面显示不出来 */
  function coverEl(url, cls, srcId, item) {
    var el = V.utils.el('span', { className: cls });
    function showPlaceholder() {
      el.innerHTML = '';
      el.appendChild(V.utils.el('span', { className: 'codicon codicon-file-media' }));
    }
    function showImg(u) {
      var im = V.utils.el('img', { src: u, alt: '', draggable: 'false' });
      im.addEventListener('error', function () { showPlaceholder(); });
      el.innerHTML = '';
      el.appendChild(im);
    }
    var isAbs = /^(https?:|blob:|data:)/.test(url || '');
    // 有解密器的源（如 17c 加密图）绝不直接显示原 URL（密文乱码）——
    // 先占位，等 picUrlOf 解密出 blob 再回填；解密失败保持占位
    var hasDec = !!(srcId && V.siteAdapters && V.siteAdapters.picDecryptorFor
      && V.siteAdapters.picDecryptorFor(srcId));
    if (url && isAbs && !hasDec) showImg(url);
    else showPlaceholder();
    if (url && srcId && item && V.aggregations && V.aggregations.picUrlOf) {
      V.aggregations.picUrlOf(srcId, item).then(function (u) {
        if (u) { if (u !== url) showImg(u); return; }
        refreshViaDetail();   // 解密失败（auth_key 过期等）→ 详情接口刷新 pic
      }).catch(refreshViaDetail);
    }
    function refreshViaDetail() {
      if (!item || !item.id || !srcId) return;
      var ad;
      try { ad = V.siteAdapters.adapterFor(srcId); } catch (e) { ad = null; }
      if (!ad || typeof ad.getVideoDetail !== 'function') return;
      ad.getVideoDetail(item.id).then(function (d) {
        // 17c 详情 pic 为解密后 blob；acfun 等为完整 URL——均可直接显示
        if (d && d.pic && d.pic !== url) showImg(d.pic);
      }).catch(function () { /* 保持占位 */ });
    }
    return el;
  }

  /* ---------------- 建组弹窗（≥2 成员选标题封面；1 成员直接建） ---------------- */
  function createGroupDlg(members) {
    // v0.6.5 组卡多选后「新增为一组」：组是聚合容器不能当成员——过滤组项
    members = (members || []).filter(function (m) { return !isGrp(m); });
    if (!members.length) return;
    var A = V.aggregations;
    if (members.length === 1) {
      var m0 = members[0];
      if (isGrp(m0)) return;
      var gid = A.createGroup([{ src: m0.src, id: m0.id }], {
        title: m0.title || m0.id,
        cover: m0.pic || '',
        coverSrc: m0.sourceId || m0.src,
        auto: false,
      });
      if (gid) { toast('已创建组：' + (m0.title || ''), true); A.migrateStates(gid); refreshAfterGroupOp(gid); }
      return;
    }
    // ≥2：弹窗选标题封面（默认质量优：有封面 > 标题长）
    var cands = members.map(function (m, i) {
      return { m: m, i: i, sc: (m.pic ? 500 : 0) + Math.min(1000, (m.title || '').length) };
    });
    cands.sort(function (a, b) { return b.sc - a.sc; });
    var defIdx = cands[0].i;
    var body = V.utils.el('div', { className: 'vshell-agg-cand' });
    var list = V.utils.el('div', { className: 'vshell-agg-cand-list' });
    var rows = [];
    members.forEach(function (m, i) {
      var row = V.utils.el('label', {
        className: 'vshell-agg-cand-row' + (i === defIdx ? ' is-on' : ''),
      }, [
        V.utils.el('input', {
          type: 'radio', name: 'aggcand', className: 'vshell-agg-cand-radio',
          checked: i === defIdx ? true : undefined,
        }),
        coverEl(m.pic, 'vshell-agg-cand-cover', m.sourceId || m.src, m),
        V.utils.el('span', { className: 'vshell-agg-cand-info' }, [
          V.utils.el('span', { className: 'vshell-agg-cand-title' }, m.title || '（无标题）'),
          V.utils.el('span', { className: 'vshell-agg-cand-src' }, m.sourceId || m.src || ''),
        ]),
      ]);
      row.addEventListener('click', function () {
        rows.forEach(function (r) { r.classList.remove('is-on'); });
        row.classList.add('is-on');
      });
      rows.push(row);
      list.appendChild(row);
    });
    var cust = V.utils.el('input', {
      className: 'vshell-agg-cand-custom', type: 'text',
      placeholder: '自定义组标题（留空用所选视频标题）',
    });
    body.appendChild(list);
    body.appendChild(cust);
    var dlg = modal('选择组标题与封面', body, [
      footBtn('取消', 'vshell-btn-secondary', function () { dlg.close(); }),
      footBtn('创建组', 'vshell-btn-primary', function () {
        var sel = defIdx;
        rows.forEach(function (r, i) { if (r.classList.contains('is-on')) sel = i; });
        var m = members[sel];
        var gid = A.createGroup(members.map(function (x) { return { src: x.src, id: x.id }; }), {
          title: cust.value.trim() || m.title || m.id,
          cover: m.pic || '',
          coverSrc: m.sourceId || m.src,
          auto: false,
        });
        dlg.close();
        if (gid) { toast('已创建组：' + (cust.value.trim() || m.title || ''), true); A.migrateStates(gid); refreshAfterGroupOp(gid); }
      }),
    ]);
  }

  /* ---------------- 合并组弹窗（选标题封面） ---------------- */
  function mergeGroupsDlg(g1, g2) {
    if (!g1 || !g2 || g1.id === g2.id) return;
    var cands = [g1, g2];
    var body = V.utils.el('div', { className: 'vshell-agg-cand' });
    var list = V.utils.el('div', { className: 'vshell-agg-cand-list' });
    var rows = [];
    cands.forEach(function (g, i) {
      var row = V.utils.el('label', {
        className: 'vshell-agg-cand-row' + (i === 0 ? ' is-on' : ''),
      }, [
        V.utils.el('input', {
          type: 'radio', name: 'aggmerge', className: 'vshell-agg-cand-radio',
          checked: i === 0 ? true : undefined,
        }),
        coverEl(g.cover, 'vshell-agg-cand-cover', g.coverSrc, { pic: g.cover }),
        V.utils.el('span', { className: 'vshell-agg-cand-info' }, [
          V.utils.el('span', { className: 'vshell-agg-cand-title' }, g.title || '（未命名组）'),
          V.utils.el('span', { className: 'vshell-agg-cand-src' },
            (g.members || []).length + ' 个成员'),
        ]),
      ]);
      row.addEventListener('click', function () {
        rows.forEach(function (r) { r.classList.remove('is-on'); });
        row.classList.add('is-on');
      });
      rows.push(row);
      list.appendChild(row);
    });
    var cust = V.utils.el('input', {
      className: 'vshell-agg-cand-custom', type: 'text',
      placeholder: '自定义组标题（留空用所选组标题）',
    });
    body.appendChild(list);
    body.appendChild(cust);
    var dlg = modal('合并组：选择标题与封面', body, [
      footBtn('取消', 'vshell-btn-secondary', function () { dlg.close(); }),
      footBtn('合并', 'vshell-btn-primary', function () {
        var sel = 0;
        rows.forEach(function (r, i) { if (r.classList.contains('is-on')) sel = i; });
        var g = cands[sel];
        var ok = V.aggregations.mergeGroups(g1.id, g2.id, {
          title: cust.value.trim() || g.title,
          cover: g.cover || '',
          coverSrc: g.coverSrc || '',
        });
        dlg.close();
        if (ok) { toast('已合并组', true); V.aggregations.migrateStates(g1.id, [g2.id]); refreshAfterMerge(g1.id, g2.id); }
      }),
    ]);
  }

  /* ---------------- 组选择弹窗（添加到组） ---------------- */
  function pickGroup(items) {
    items = (items || []).filter(Boolean);
    if (!items.length) return;
    var A = V.aggregations;
    var groups = A.getGroups() || {};
    var selfIds = {};
    items.forEach(function (m) { if (isGrp(m)) selfIds[m.id] = true; });
    var ids = Object.keys(groups).filter(function (id) { return !selfIds[id]; });

    var body = V.utils.el('div', { className: 'vshell-agg-pick' });
    var search = V.utils.el('input', {
      className: 'vshell-agg-pick-search', type: 'text', placeholder: '搜索组…',
    });
    var list = V.utils.el('div', { className: 'vshell-agg-pick-list' });
    body.appendChild(search);
    body.appendChild(list);

    function doPick(g) {
      dlg.close();
      var grps = items.filter(isGrp);
      var vids = items.filter(function (m) { return !isGrp(m); });
      var ok = false;
      vids.forEach(function (m) {
        if (A.addToGroup(g.id, { src: m.src, id: m.id })) ok = true;
      });
      if (grps.length) {
        // 组并入目标组：弹窗选标题封面（决策 5）
        mergeGroupsDlg(grps[0], g);
        return;
      }
      if (ok) { toast('已并入组：' + (g.title || ''), true); A.migrateStates(g.id); refreshAfterGroupOp(g.id); }
    }
    function render(q) {
      list.innerHTML = '';
      var vis = ids.filter(function (id) {
        return !q || ((groups[id].title || '').indexOf(q) >= 0);
      });
      if (!vis.length) {
        list.appendChild(V.utils.el('div', { className: 'vshell-agg-pick-empty' }, '没有匹配的组（可新建一个）'));
        return;
      }
      vis.forEach(function (id) {
        var g = groups[id];
        list.appendChild(V.utils.el('button', {
          className: 'vshell-agg-pick-row', type: 'button',
          onclick: function () { doPick(g); },
        }, [
          coverEl(g.cover, 'vshell-agg-pick-cover', g.coverSrc, { pic: g.cover }),
          V.utils.el('span', { className: 'vshell-agg-pick-info' }, [
            V.utils.el('span', { className: 'vshell-agg-pick-title' }, g.title || '（未命名组）'),
            V.utils.el('span', { className: 'vshell-agg-pick-count' },
              (g.members || []).length + ' 个成员'),
          ]),
        ]));
      });
    }
    search.addEventListener('input', function () { render(search.value.trim()); });

    var dlg = modal('添加到组', body, [
      footBtn('新建组', 'vshell-btn-secondary', function () {
        dlg.close();
        if (items.some(isGrp)) { toast('组只能并入已有组'); return; }
        createGroupDlg(items);
      }),
      footBtn('取消', 'vshell-btn-secondary', function () { dlg.close(); }),
    ]);
    render('');
  }

  /* ---------------- 多选模式 ---------------- */
  var multi = { active: false, bar: null, countEl: null, btns: [] };

  function isMultiActive() { return multi.active; }

  function registerCard(card) {
    if (!multi.active || !card || card.__multiReg) return;
    card.__multiReg = true;
    card.__multiOnClick = function (e) {
      if (!multi.active) return;
      var t = e.target;
      if (t && t.closest && t.closest('button')) return;   // 按钮区不切换选中
      e.preventDefault();
      e.stopPropagation();
      toggleCard(card);
    };
    card.addEventListener('click', card.__multiOnClick, true);
  }
  function unregisterCard(card) {
    if (!card || !card.__multiReg) return;
    card.__multiReg = false;
    card.removeEventListener('click', card.__multiOnClick, true);
    card.__multiOnClick = null;
    card.classList.remove('is-multi-selecting');
  }

  function toggleCard(card) {
    card.classList.toggle('is-multi-selecting');
    updateBar();
  }
  function selectedCards() {
    if (!multi.active) return [];
    var out = [];
    document.querySelectorAll('.vsc-video-card.is-multi-selecting').forEach(function (c) { out.push(c); });
    return out;
  }
  function selectedMembers() {
    return selectedCards().map(function (c) {
      return memberOf(c.__item || c.__orig || null);
    }).filter(Boolean);
  }
  function updateBar() {
    if (!multi.bar) return;
    var n = selectedCards().length;
    multi.countEl.textContent = '已选 ' + n + ' 张';
    multi.btns.forEach(function (b) {
      // v0.6.8 取消按钮永不禁用——0 选中时也必须能点（disabled 按钮
      // 真实鼠标点击不触发 onclick，此前导致无法退出多选）
      if (b.dataset.cancel) { b.disabled = false; return; }
      b.disabled = !(n >= 1) || (b.dataset.min2 && n < 2);
    });
  }

  function startMultiSelect(startCard) {
    if (multi.active) return;
    multi.active = true;
    document.body.classList.add('vshell-multi-active');
    document.querySelectorAll('.vsc-video-card').forEach(registerCard);
    // v0.6.5 右键「多选」进入：触发卡一开始就处于选中状态
    if (startCard && startCard.classList) startCard.classList.add('is-multi-selecting');
    var bar = V.utils.el('div', { className: 'vshell-multi-bar' });
    multi.countEl = V.utils.el('span', { className: 'vshell-multi-count' }, '已选 0 张');
    bar.appendChild(multi.countEl);
    multi.btns = [];
    function mk(label, cls, min2, fn) {
      var b = V.utils.el('button', {
        className: 'vshell-btn ' + cls, type: 'button', disabled: 'disabled',
        onclick: function () {
          var ms = selectedMembers();
          if (!ms.length) return;
          exitMultiSelect();
          fn(ms);
        },
      }, label);
      if (min2) b.dataset.min2 = '1';
      multi.btns.push(b);
      bar.appendChild(b);
    }
    mk('新增为一组', 'vshell-btn-primary', true, function (ms) { createGroupDlg(ms); });
    mk('新增为多组', 'vshell-btn', true, function (ms) {
      var n = 0;
      ms.forEach(function (m) {
        if (isGrp(m)) return;   // v0.6.5 组是容器不能当成员，跳过
        var gid = V.aggregations.createGroup([{ src: m.src, id: m.id }], {
          title: m.title || m.id, cover: m.pic || '',
          coverSrc: m.sourceId || m.src, auto: false,
        });
        if (gid) { n++; V.aggregations.migrateStates(gid); refreshAfterGroupOp(gid); }
      });
      if (n) toast('已创建 ' + n + ' 个组', true);
    });
    mk('添加到组', 'vshell-btn', false, function (ms) { pickGroup(ms); });
    // v0.6.8 修复：取消按钮不走 mk 的选中检查——0 个选中（含初始默认选中
    // 被手动取消）时也必须能退出多选状态（updateBar 对其跳过禁用）
    var cancelBtn = V.utils.el('button', {
      className: 'vshell-btn vshell-btn-secondary', type: 'button',
      onclick: function () { exitMultiSelect(); },
    }, '取消');
    cancelBtn.dataset.cancel = '1';   // updateBar 跳过禁用
    multi.btns.push(cancelBtn);
    bar.appendChild(cancelBtn);
    var host = document.querySelector('.vshell-app') || document.body;
    host.appendChild(bar);
    multi.bar = bar;
    updateBar();
  }

  function exitMultiSelect() {
    if (!multi.active && !multi.bar) return;
    multi.active = false;
    document.querySelectorAll('.vsc-video-card').forEach(unregisterCard);
    if (multi.bar) { multi.bar.remove(); multi.bar = null; }
    multi.countEl = null;
    multi.btns = [];
    document.body.classList.remove('vshell-multi-active');
  }

  /* ---------------- 长按拖拽合并 ---------------- */
  var drag = {
    timer: null, started: false, active: false,
    card: null, m: null, ghost: null, target: null,
    sx: 0, sy: 0,
  };

  function dragStart(card, e) {
    if (multi.active || !V.aggregations) return;
    if (e.button !== 0) return;
    var t = e.target;
    if (t && t.closest && t.closest('button')) return;   // 按钮上不拖拽
    var m = memberOf(card.__item || null);
    if (!m) return;
    drag.card = card;
    drag.m = m;
    drag.sx = e.clientX; drag.sy = e.clientY;
    drag.started = false; drag.active = false;
    if (drag.timer) clearTimeout(drag.timer);
    drag.timer = setTimeout(function () {
      if (!drag.card) return;
      drag.started = true; drag.active = true;
      document.body.classList.add('vshell-dragging');
      var g = V.utils.el('div', { className: 'vshell-drag-ghost' });
      if (m.pic) {
        var gim = V.utils.el('img', { src: '', alt: '', draggable: 'false' });
        g.appendChild(gim);
        // v0.6.10 17c 等加密/相对路径封面：ghost 不能直接 img src=原 URL
        //（密文乱码/相对路径无域名）——经 picUrlOf 异步解密+拼域名回填；
        // 解密失败（17c auth_key 过期 403）→ 用成员详情刷新（新 blob）
        if (V.aggregations && V.aggregations.picUrlOf && m.sourceId) {
          V.aggregations.picUrlOf(m.sourceId, { pic: m.pic }).then(function (u) {
            if (u) { gim.src = u; return; }
            refreshGhostCover();
          }).catch(refreshGhostCover);
        } else {
          gim.src = m.pic;
        }
        function refreshGhostCover() {
          var ad;
          try { ad = V.siteAdapters.adapterFor(m.sourceId); } catch (e) { ad = null; }
          if (!ad || typeof ad.getVideoDetail !== 'function') return;
          ad.getVideoDetail(m.id).then(function (d) {
            if (d && d.pic) gim.src = d.pic;
          }).catch(function () { /* 保持空图 */ });
        }
      } else {
        g.appendChild(V.utils.el('span', { className: 'codicon codicon-file-media' }));
      }
      g.appendChild(V.utils.el('span', { className: 'vshell-drag-ghost-title' }, m.title || ''));
      document.body.appendChild(g);
      drag.ghost = g;
      placeGhost(e.clientX, e.clientY);
      window.addEventListener('pointermove', onDragMove, true);
      window.addEventListener('pointerup', onDragEnd, true);
      window.addEventListener('pointercancel', onDragCancel, true);
    }, 400);
    // 400ms 内松开/取消 = 普通点击
    card.addEventListener('pointerup', onQuickUp, { once: true });
    card.addEventListener('pointercancel', onQuickUp, { once: true });
    function onQuickUp() {
      if (!drag.started) { if (drag.timer) clearTimeout(drag.timer); }
    }
  }

  function placeGhost(x, y) {
    if (drag.ghost) {
      drag.ghost.style.left = (x + 12) + 'px';
      drag.ghost.style.top = (y + 12) + 'px';
    }
  }
  function findTarget(x, y) {
    var el = document.elementFromPoint(x, y);
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('vsc-video-card')) return el;
      el = el.parentNode;
    }
    return null;
  }
  function onDragMove(e) {
    if (!drag.active) return;
    e.preventDefault();
    placeGhost(e.clientX, e.clientY);
    var t = findTarget(e.clientX, e.clientY);
    if (t === drag.target) return;
    if (drag.target) drag.target.classList.remove('is-drop-target');
    drag.target = (t && t !== drag.card) ? t : null;
    if (drag.target) drag.target.classList.add('is-drop-target');
  }
  function cancelDrag() {
    window.removeEventListener('pointermove', onDragMove, true);
    window.removeEventListener('pointerup', onDragEnd, true);
    window.removeEventListener('pointercancel', onDragCancel, true);
    if (drag.target) { drag.target.classList.remove('is-drop-target'); drag.target = null; }
    if (drag.ghost) { drag.ghost.remove(); drag.ghost = null; }
    document.body.classList.remove('vshell-dragging');
    drag.active = false; drag.started = false;
    drag.card = null; drag.m = null; drag.timer = null;
  }
  function onDragCancel() { cancelDrag(); }
  function onDragEnd(e) {
    var src = drag.m;
    var tgtCard = drag.target;
    cancelDrag();
    if (!src || !tgtCard) return;
    var tgt = memberOf(tgtCard.__item || null);
    if (!tgt) return;
    var srcG = isGrp(src) ? src : null;
    var tgtG = isGrp(tgt) ? tgt : null;
    if (srcG && tgtG) {
      if (srcG.id !== tgtG.id) mergeGroupsDlg(srcG, tgtG);
    } else if (srcG) {
      addToGroupFlow(srcG.id, tgt);
    } else if (tgtG) {
      addToGroupFlow(tgtG.id, src);
    } else {
      var same = (String(src.id) === String(tgt.id)) && (src.sourceId === tgt.sourceId);
      if (!same) createGroupDlg([src, tgt]);
    }
  }
  function addToGroupFlow(gid, m) {
    if (V.aggregations.addToGroup(gid, { src: m.src, id: m.id })) {
      var g = V.aggregations.getGroup(gid);
      toast('已并入组：' + ((g && g.title) || ''), true);
      V.aggregations.migrateStates(gid);
      refreshAfterGroupOp(gid);
    } else {
      toast('该视频已在组中');
    }
  }

  /* ---------------- 详情页工具 ---------------- */
  /** 解除聚合：拆出当前成员；返回剩余成员数（-1 组不存在；1=拆后仅剩 1 成员） */
  function unmerge(gid, src, id) {
    var A = V.aggregations;
    var g = A.getGroup(gid);
    if (!g) return -1;
    if ((g.members || []).length <= 1) return 1;
    A.removeMember(gid, src, id);
    var g2 = A.getGroup(gid);
    return g2 ? g2.members.length : 0;
  }
  /** 片段/完整版三态循环：0 默认 → 1 完整版 → 2 片段 → 0；返回新 part */
  function markPart(gid, src, id) {
    var A = V.aggregations;
    var g = A.getGroup(gid);
    if (!g) return 0;
    var cur = 0;
    (g.members || []).forEach(function (m) {
      if (m.src === src && String(m.id) === String(id)) cur = m.part || 0;
    });
    var next = (cur + 1) % 3;
    A.setPart(gid, src, id, next);
    return next;
  }

  V.aggUi = {
    openMenu: openMenu,
    closeMenu: closeMenu,
    memberOf: memberOf,
    isGrp: isGrp,
    createGroupDlg: createGroupDlg,
    mergeGroupsDlg: mergeGroupsDlg,
    pickGroup: pickGroup,
    startMultiSelect: startMultiSelect,
    exitMultiSelect: exitMultiSelect,
    isMultiActive: isMultiActive,
    registerCard: registerCard,
    dragStart: dragStart,
    unmerge: unmerge,
    markPart: markPart,
    refresh: refresh,
    refreshAfterGroupOp: refreshAfterGroupOp,   // v0.6.2：局部卡片更新（调试/外部）
    refreshAfterMerge: refreshAfterMerge,
  };
})();
