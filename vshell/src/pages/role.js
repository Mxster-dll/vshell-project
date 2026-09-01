/* ============================================================
 * role — 角色主页（v0.5.6，用户需求）
 *
 * 入口：抖音刷页 / 视频详情页点击**已有角色的头像** → #/role/<name>
 * 内容（v0.5.6 第四轮重设计，Fluent + VS Code Modern）：
 *  - 页面头行：返回按钮 + 标题「角色主页」（返回按钮不再叠 banner，
 *    用户需求 2a）
 *  - banner 头部：**可设置背景图**（characters.banner 字段，16:9 裁剪，
 *    用户需求 2b；无图 = 主题渐变）+ 64px 大头像 + 角色名 + 关键词
 *    chips + 统计（手动添加 N · 聚合搜索 M）
 *  - 代表作滚动排（characters.featured 字段，用户需求 2c；第七轮需求 4
 *    改一排循环平滑滚动的视频卡片）：手动添加列表里的卡片 hover 星标
 *    设为/取消代表作；设置后 banner 下方显示滚动排（videosOf 数据源，
 *    代表作卡带徽章 + 取消钮，360px 大卡无缝循环滚动）
 *  - **内容区不分 Tab**（用户需求 1）：手动添加视频（charVideos
 *    快照，置顶）+ 关键词聚合搜索结果（懒加载并行搜索，播放量降序）
 *    **合并一个网格**，按 id 去重；底部「加载更多」= 所有关键词翻
 *    下一页再聚一轮
 *
 * 设计语言：vshell Modern UI（VS Code tokens）+ Fluent 层次——
 *  banner 渐变用主题色、8px 圆角卡片。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  /** v0.6.30 多源同名角色合并：角色页用**合并条目**（listAll = 激活源同名
   *  角色的 keywords/exclusions 并集——搜索时合并关键词和排除词；各源
   *  实际数据不修改，仅整合展示/匹配时合并）。listAll 找不到（角色在未
   *  激活源）→ 兜底 find（单源条目）。 */
  function mergedRole(name) {
    if (!name) return null;
    try {
      var all = V.characters ? V.characters.list() : [];
      for (var i = 0; i < all.length; i++) {
        if (all[i] && all[i].name === name) return all[i];
      }
    } catch (e) { /* noop */ }
    return V.characters && V.characters.find ? V.characters.find(name) : null;
  }

  /** v0.6.46：角色主页「编辑词汇」浮窗——关键词 / 独立词限制 / 全局排除词
   *  三区，样式与交互照搬角色管理页（char-panel renderDetail，v0.6.40-43
   *  全部经验）：
   *  · 显示用合并条目（list()——跨源同名并集），写入用首源原生条目
   *    （find()），删除走全源 API（removeKeyword/removeKeywordExclusion/
   *    removeGlobalExclusion——防「删词后重合并回末尾」）
   *  · 增删后局部重绘词区；浮窗自身订阅 characters.onChange 同步三区
   *    （角色页内容区 onChange 重建在 overlay 之下，互不影响）
   *  · kweOwner 归属关键词为浮窗会话级状态；模块级 wordsDlgClose 保证
   *    同时只有一个浮窗 */
  var wordsDlgClose = null;
  function openWordsDlg(roleName) {
    if (wordsDlgClose) { try { wordsDlgClose(); } catch (e) { /* noop */ } wordsDlgClose = null; }
    if (!V.characters || !V.utils) return null;
    var host = document.querySelector('.vshell-app') || document.body;

    var overlay = V.utils.el('div', {
      className: 'vshell-modal-backdrop vshell-picker-backdrop',
    });
    var box = V.utils.el('div', { className: 'vshell-modal vshell-role-words-box' });
    box.appendChild(V.utils.el('div', { className: 'vshell-modal-title' }, '编辑角色词汇'));
    box.appendChild(V.utils.el('div', { className: 'vshell-modal-sub' }, roleName));

    /* ---- 数据源：显示合并条目 / 写首源原生条目 ---- */
    function curMerged() {
      var all = V.characters.list();
      for (var i = 0; i < all.length; i++) {
        if (all[i] && all[i].name === roleName) return all[i];
      }
      return null;
    }
    function curNative() { return V.characters.find(roleName); }

    /* ===== 关键词区 ===== */
    var kwLine = null, kwInputEl = null;
    function renderKws() {
      if (!kwLine) return;
      kwLine.innerHTML = '';
      var cur = curMerged();
      ((cur && cur.keywords) || []).forEach(function (k) {
        kwLine.appendChild(V.utils.el('span', { className: 'vshell-char-kwchip', title: '关键词' }, [
          V.utils.el('span', { className: 'vshell-char-kwchip-name' }, k),
          V.utils.el('button', {
            className: 'vshell-st-chip-del',
            type: 'button',
            title: '删除关键词',
            'aria-label': '删除关键词 ' + k,
            onclick: function (e) { e.stopPropagation(); removeKw(k); },
          }, V.utils.el('span', { className: 'codicon codicon-close' })),
        ]));
      });
    }
    function removeKw(k) {
      try { V.characters.removeKeyword(roleName, k); } catch (e) { /* noop */ }
      renderKws();
    }
    function doAddKw() {
      var v = kwInputEl.value.trim();
      if (!v) return;
      var cur = curNative();
      var kws = ((cur && cur.keywords) || []).slice();
      if (kws.indexOf(v) < 0) kws.push(v);
      try { V.characters.setKeywords(roleName, kws); } catch (e) { /* noop */ }
      kwInputEl.value = '';
      renderKws();
    }
    var secKws = V.utils.el('div', { className: 'vshell-char-sec' }, [
      V.utils.el('div', { className: 'vshell-char-sec-title' }, '关键词'),
      (function () { kwLine = V.utils.el('div', { className: 'vshell-char-kwline' }); return kwLine; })(),
      (function () {
        var add = V.utils.el('div', { className: 'vshell-char-kwadd' });
        kwInputEl = V.utils.el('input', {
          className: 'vshell-tag-input', type: 'text', placeholder: '添加关键词…',
          'aria-label': '添加关键词',
          onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); doAddKw(); } },
        });
        add.appendChild(kwInputEl);
        add.appendChild(V.utils.el('button', {
          className: 'vshell-tag-add', type: 'button', title: '添加关键词', 'aria-label': '添加关键词',
          onclick: doAddKw,
        }, V.utils.el('span', { className: 'codicon codicon-add' })));
        return add;
      })(),
    ]);
    renderKws();

    /* ===== 独立词限制区 ===== */
    var kweLine = null, kweInputEl = null;
    var kweOwner = null;   // 归属关键词（浮窗会话级，打开即重置）
    var ownerBtn = null;   // 归属胶囊按钮（函数体级——pickOwner 选择后需刷新）
    function renderOwner() {
      if (!ownerBtn) return;
      ownerBtn.innerHTML = '';
      ownerBtn.appendChild(V.utils.el('span', { className: 'vshell-char-kwex-owner-name' },
        kweOwner || '选择关键词'));
      ownerBtn.classList.toggle('is-empty', !kweOwner);
    }
    function renderKwe() {
      if (!kweLine) return;
      kweLine.innerHTML = '';
      var map = {};   // word → [所属关键词...]
      var cur = curMerged();
      var kwe = (cur && cur.kwExclusions) || {};
      Object.keys(kwe).forEach(function (kw) {
        (kwe[kw] || []).forEach(function (w) {
          if (!map[w]) map[w] = [];
          if (map[w].indexOf(kw) < 0) map[w].push(kw);
        });
      });
      Object.keys(map).forEach(function (w) {
        // 高亮区间：所属关键词在限制词内的出现位置
        var hl = [];
        map[w].forEach(function (kw) {
          if (!kw) return;
          var p = 0;
          while (true) {
            var i = w.indexOf(kw, p);
            if (i < 0) break;
            hl.push([i, i + kw.length]);
            p = i + kw.length;
          }
        });
        hl.sort(function (a, b) { return a[0] - b[0]; });
        var merged = [];
        hl.forEach(function (h) {
          if (merged.length && h[0] <= merged[merged.length - 1][1]) {
            merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], h[1]);
          } else merged.push(h.slice());
        });
        var chip = V.utils.el('span', {
          className: 'vshell-char-kwchip vshell-char-kwex-chip',
          title: '独立词限制：' + map[w].join('、'),
        });
        var nameEl = V.utils.el('span', { className: 'vshell-char-kwchip-name' });
        var pos = 0;
        merged.forEach(function (h) {
          if (h[0] > pos) nameEl.appendChild(document.createTextNode(w.slice(pos, h[0])));
          nameEl.appendChild(V.utils.el('span', { className: 'vshell-char-kwex-hl' }, w.slice(h[0], h[1])));
          pos = h[1];
        });
        if (pos < w.length) nameEl.appendChild(document.createTextNode(w.slice(pos)));
        chip.appendChild(nameEl);
        chip.appendChild(V.utils.el('button', {
          className: 'vshell-st-chip-del',
          type: 'button',
          title: '删除独立词限制',
          'aria-label': '删除独立词限制 ' + w,
          onclick: function (e) { e.stopPropagation(); removeKwe(w, map[w]); },
        }, V.utils.el('span', { className: 'codicon codicon-close' })));
        kweLine.appendChild(chip);
      });
    }
    function removeKwe(w, kws) {
      kws.forEach(function (kw) {
        try { V.characters.removeKeywordExclusion(roleName, kw, w); } catch (e) { /* noop */ }
      });
      renderKwe();
    }
    function pickOwner() {
      var cur = curNative();
      var kws = ((cur && cur.keywords) || []).slice();
      if (!kws.length) { V.toast.info('请先在「关键词」区添加关键词'); return; }
      var o = V.utils.el('div', { className: 'vshell-modal-backdrop vshell-picker-backdrop' });
      var b = V.utils.el('div', { className: 'vshell-modal vshell-tag-modal vshell-char-kwex-pick' });
      var listEl = V.utils.el('div', { className: 'vshell-char-kwex-line' });
      kws.forEach(function (kw) {
        var chip = V.utils.el('span', { className: 'vshell-char-kwchip', title: '归属关键词：' + kw },
          V.utils.el('span', { className: 'vshell-char-kwchip-name' }, kw));
        chip.onclick = function () { kweOwner = kw; renderOwner(); close(); };
        listEl.appendChild(chip);
      });
      b.appendChild(listEl);
      function close() {
        if (o.parentNode) o.parentNode.removeChild(o);
        document.removeEventListener('keydown', esc);
      }
      function esc(e) { if (e.key === 'Escape') close(); }
      o.appendChild(b);
      o.addEventListener('mousedown', function (e) { if (e.target === o) close(); });
      document.addEventListener('keydown', esc);
      document.body.appendChild(o);
    }
    function doAddKwe() {
      var v = kweInputEl.value.trim();
      if (!v) return;
      if (!kweOwner) { V.toast.info('请先点击输入框左侧胶囊选择归属关键词'); return; }
      if (v.indexOf(kweOwner) < 0) {
        V.toast.error('独立限制词「' + v + '」未包含所选关键词「' + kweOwner + '」，已取消');
        return;
      }
      var cur = curNative();
      var kwe = (cur && cur.kwExclusions) || {};
      var list = (kwe[kweOwner] || []).slice();
      if (list.indexOf(v) < 0) list.push(v);
      try { V.characters.setKeywordExclusions(roleName, kweOwner, list); } catch (e) { /* noop */ }
      kweInputEl.value = '';
      renderKwe();
    }
    var secKwe = V.utils.el('div', { className: 'vshell-char-sec' }, [
      V.utils.el('div', { className: 'vshell-char-sec-title' }, '独立词限制'),
      (function () { kweLine = V.utils.el('div', { className: 'vshell-char-kwex-line' }); return kweLine; })(),
      (function () {
        var add = V.utils.el('div', { className: 'vshell-char-kwadd' });
        ownerBtn = V.utils.el('button', {
          type: 'button',
          className: 'vshell-char-kwex-owner is-empty',
          title: '选择归属关键词',
          'aria-label': '选择归属关键词',
          onclick: pickOwner,
        });
        renderOwner();
        add.appendChild(ownerBtn);
        kweInputEl = V.utils.el('input', {
          className: 'vshell-tag-input', type: 'text', placeholder: '添加独立词限制…',
          'aria-label': '添加独立词限制',
          onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); doAddKwe(); } },
        });
        add.appendChild(kweInputEl);
        add.appendChild(V.utils.el('button', {
          className: 'vshell-tag-add', type: 'button', title: '添加独立词限制', 'aria-label': '添加独立词限制',
          onclick: doAddKwe,
        }, V.utils.el('span', { className: 'codicon codicon-add' })));
        return add;
      })(),
    ]);
    renderKwe();

    /* ===== 全局排除词区 ===== */
    var exLine = null, exInputEl = null;
    function renderExcls() {
      if (!exLine) return;
      exLine.innerHTML = '';
      var cur = curMerged();
      ((cur && cur.globalExclusions) || []).forEach(function (x) {
        exLine.appendChild(V.utils.el('span', { className: 'vshell-char-kwchip', title: '全局排除词' }, [
          V.utils.el('span', { className: 'vshell-char-kwchip-name' }, x),
          V.utils.el('button', {
            className: 'vshell-st-chip-del',
            type: 'button',
            title: '删除全局排除词',
            'aria-label': '删除全局排除词 ' + x,
            onclick: function (e) { e.stopPropagation(); removeExcl(x); },
          }, V.utils.el('span', { className: 'codicon codicon-close' })),
        ]));
      });
    }
    function removeExcl(x) {
      try { V.characters.removeGlobalExclusion(roleName, x); } catch (e) { /* noop */ }
      renderExcls();
    }
    function doAddExcl() {
      var v = exInputEl.value.trim();
      if (!v) return;
      var cur = curNative();
      var excls = ((cur && cur.globalExclusions) || []).slice();
      if (excls.indexOf(v) < 0) excls.push(v);
      try { V.characters.setGlobalExclusions(roleName, excls); } catch (e) { /* noop */ }
      exInputEl.value = '';
      renderExcls();
    }
    var secExcls = V.utils.el('div', { className: 'vshell-char-sec' }, [
      V.utils.el('div', { className: 'vshell-char-sec-title' }, '全局排除词'),
      (function () { exLine = V.utils.el('div', { className: 'vshell-char-exline' }); return exLine; })(),
      (function () {
        var add = V.utils.el('div', { className: 'vshell-char-kwadd' });
        exInputEl = V.utils.el('input', {
          className: 'vshell-tag-input', type: 'text', placeholder: '添加全局排除词…',
          'aria-label': '添加全局排除词',
          onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); doAddExcl(); } },
        });
        add.appendChild(exInputEl);
        add.appendChild(V.utils.el('button', {
          className: 'vshell-tag-add', type: 'button', title: '添加全局排除词', 'aria-label': '添加全局排除词',
          onclick: doAddExcl,
        }, V.utils.el('span', { className: 'codicon codicon-add' })));
        return add;
      })(),
    ]);
    renderExcls();

    box.appendChild(secKws);
    box.appendChild(secKwe);
    box.appendChild(secExcls);
    box.appendChild(V.utils.el('button', {
      className: 'vshell-btn vshell-btn-primary',
      type: 'button',
      style: 'margin-left:auto;margin-top:20px',
      onclick: closeDlg,
    }, '完成'));
    overlay.appendChild(box);
    host.appendChild(overlay);

    /* ---- 关闭 + 外部 onChange 同步（词区局部重绘）---- */
    var off = null;
    function syncWords() { renderKws(); renderKwe(); renderExcls(); }
    function closeDlg() {
      if (off) { try { off(); } catch (e) { /* noop */ } off = null; }
      document.removeEventListener('keydown', esc);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (wordsDlgClose === closeDlg) wordsDlgClose = null;
    }
    function esc(e) { if (e.key === 'Escape') closeDlg(); }
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeDlg(); });
    document.addEventListener('keydown', esc);
    off = V.characters.onChange(syncWords);
    wordsDlgClose = closeDlg;
    return closeDlg;
  }

  function mount(outlet, params) {
    // v0.5.6 第十三轮需求 8：全屏（抖音刷）下点击进入角色主页 → 自动
    // 退出全屏（原生 fullscreen 走 top layer，角色页会被盖在全屏之下）
    try {
      if (document.fullscreenElement) document.exitFullscreen();
    } catch (e) { /* noop */ }
    // v0.5.6 第十三轮：router 已在 parse 层统一解码 segs，这里不再
    // 二次 decode（encodeURIComponent 过的 name 若含 % 会双解码崩溃）
    var name = params.name || '';
    // v0.6.30：合并条目（多源同名角色的关键词/排除词并集——仅匹配/搜索
    // 时合并，各源实际数据不修改）
    var role = V.characters && V.characters.find ? mergedRole(name) : null;
    var state = { done: false };
    var page = V.utils.el('div', { className: 'vshell-page vshell-role-page' });
    outlet.appendChild(page);

    if (!role) {
      page.appendChild(V.wall.empty('角色「' + name + '」不存在或已被删除', 'codicon-account'));
      return { destroy: function () { state.done = true; page.remove(); } };
    }

    /* ---- 返回按钮（v0.6.53：浮动定位挂 page——参考详情页放置方式，
     *  绝对定位在角色背景左侧，不影响背景卡片位置；标题「角色主页」已删） ---- */
    page.appendChild(V.utils.el('button', {
      className: 'vshell-icon-btn vshell-role-back',
      type: 'button',
      title: '返回',
      'aria-label': '返回',
      onclick: function () {
        // v0.5.6 第十轮需求 2：只有「返回按钮」返回才保留来源页位置
        window.__VS_KEEP_SCROLL__ = true;
        if (history.length > 1) history.back();
        else V.router.nav('/');
      },
    }, V.utils.el('span', { className: 'codicon codicon-arrow-left' })));

    /* ---- banner 头部（背景图可设，用户需求 2b；v0.5.6 第五轮：无自定义
     *  图时用手绘默认 SVG——每个角色都有背景图） ---- */
    /* ---- banner 头部（背景图可设，用户需求 2b；v0.5.6 第五轮：无自定义
     *  图时用手绘默认 SVG——每个角色都有背景图） ----
     *  v0.6.44：banner 右上角「修改背景图」按钮 + 名字右侧「重命名」按钮 +
     *  头像悬停「编辑头像」按钮——与角色管理页同款（共用 core/char-editor.js） */
    var bannerUrl = role.banner
      || (V.charBanners && V.charBanners.bannerFor(role.name));
    var banner = V.utils.el('div', { className: 'vshell-role-banner' });

    /** 应用（或清除）背景图；局部更新，不重建 banner（编辑保存后回调用）。
     *  v0.6.56：焦点最大矩形 + 视差水平余量——以用户选择的中心点（bannerFocus，
     *  缺省图片中心）为焦点，取与卡片同比例的最大内接矩形铺满卡片；水平方向
     *  额外保证至少 PARALLAX_MARGIN 余量供视差平移（图宽 ≥ 卡宽×(1+余量)）。 */
    var PARALLAX_MARGIN = 0.2;   // 视差水平余量 20%（原 115% auto 的 15% 不够用）
    function applyBanner(url) {
      bannerUrl = url || '';
      banner.classList.toggle('has-bg', !!bannerUrl);
      if (bannerUrl) {
        // 背景图 + 暗色渐变遮罩（保证头像/文字可读）
        banner.style.backgroundImage = 'linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.82)), url("'
          + bannerUrl + '")';
        banner.style.backgroundSize = 'cover';
        banner.style.backgroundPosition = 'center';
        // 焦点几何需要图片尺寸——图加载完成后精算。
        // v0.6.57：焦点**实时重读**（find 取最新数据）——pickBanner onSaved
        // 回调里 role 是 mount 快照（bannerFocus 为旧值），直接读快照会导致
        // 「刚设置的中心点不生效、看起来都一样」
        var focus = { cx: 0.5, cy: 0.5 };
        try {
          var liveFocus = V.characters.find(role.name);
          if (liveFocus && liveFocus.bannerFocus) focus = liveFocus.bannerFocus;
        } catch (e) { /* noop */ }
        var probe = new Image();
        probe.onload = function () {
          var W = banner.clientWidth, H = banner.clientHeight;
          if (!W || !H) return;
          var iw = probe.naturalWidth || 1, ih = probe.naturalHeight || 1;
          var ar = W / H;
          var fx = focus.cx * iw, fy = focus.cy * ih;
          // 焦点最大矩形（内接、与卡片同比例；任一边碰图边即停）
          var hw = Math.max(0.001, Math.min(fx, iw - fx, fy * ar, (ih - fy) * ar));
          var rectScale = W / (2 * hw);
          // 视差水平余量下限（图宽 ≥ 卡宽×(1+PARALLAX_MARGIN)）
          var minScale = (1 + PARALLAX_MARGIN) * W / iw;
          var scale = Math.max(rectScale, minScale);
          var bw = iw * scale, bh = ih * scale;
          var px = bw > W ? ((fx * scale - W / 2) / (bw - W)) * 100 : 50;
          var py = bh > H ? ((fy * scale - H / 2) / (bh - H)) * 100 : 50;
          banner.style.backgroundSize = bw + 'px ' + bh + 'px';
          banner.style.backgroundPosition = px + '% ' + py + '%';
          banner._bgPx = px; banner._bgPy = py;   // 视差基准（焦点居中位）
        };
        probe.src = bannerUrl;
        // v0.5.6 第十一轮（用户需求 2）：背景图随鼠标视差——放大留余量
        // （background-size 115%），mousemove 按指针相对位置平移背景，
        // mouseleave 复位到中心；has-bg 才有（渐变无图不视差）
        // v0.5.6 第十二轮（需求 6）：视差**仅水平**——竖直方向不动
        // v0.6.56：视差基准 = 焦点居中 position（px），偏移 ±7% 并夹取 [0,100]
        if (!banner._parallaxOff) {
          var parallax = function (e) {
            var rect = banner.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            var nx = (e.clientX - rect.left) / rect.width - 0.5;   // -0.5..0.5
            var basePx = (typeof banner._bgPx === 'number') ? banner._bgPx : 50;
            var basePy = (typeof banner._bgPy === 'number') ? banner._bgPy : 50;
            var v = Math.min(100, Math.max(0, basePx + nx * 14));
            banner.style.backgroundPosition = v + '% ' + basePy + '%';
          };
          var parallaxOff = function () {
            if (typeof banner._bgPx === 'number' && typeof banner._bgPy === 'number') {
              banner.style.backgroundPosition = banner._bgPx + '% ' + banner._bgPy + '%';
            } else {
              banner.style.backgroundPosition = 'center';
            }
          };
          banner.addEventListener('mousemove', parallax);
          banner.addEventListener('mouseleave', parallaxOff);
          banner._parallax = parallax;
          banner._parallaxOff = parallaxOff;
        }
      } else {
        // 渐变：选中蓝 → 编辑器背景（Fluent accent 层次，双主题自适应）
        banner.style.backgroundImage = '';
        banner.style.background = 'linear-gradient(135deg, var(--vscode-list-activeSelectionBackground), var(--vscode-editor-background) 70%)';
        if (banner._parallaxOff) {
          banner.removeEventListener('mousemove', banner._parallax);
          banner.removeEventListener('mouseleave', banner._parallaxOff);
          banner._parallax = null;
          banner._parallaxOff = null;
        }
      }
    }
    applyBanner(bannerUrl);

    // 头像（v0.6.44：外包按钮 wrap，悬停浮现编辑 icon，点击换头像）
    var avatarBox = null;
    function setAvatar(iconUrl) {
      if (!avatarBox) return;
      var im = avatarBox.querySelector('img');
      if (im) { im.src = iconUrl; }
      else {
        avatarBox.innerHTML = '';
        avatarBox.appendChild(V.utils.el('img', { src: iconUrl, alt: '' }));
      }
    }
    function updateAvatarLetter() {
      if (!avatarBox) return;
      var letter = avatarBox.querySelector('.vshell-role-avatar-letter');
      if (letter) letter.textContent = String(role.name).charAt(0) || '?';
    }
    var avatarSpan = V.utils.el('span', { className: 'vshell-role-avatar' }, (function () {
      avatarBox = V.utils.el('span', { className: 'vshell-role-avatar-box' });
      var fallback = function () {
        avatarBox.innerHTML = '';
        avatarBox.appendChild(V.utils.el('span', { className: 'vshell-role-avatar-letter' },
          String(role.name).charAt(0) || '?'));
      };
      if (role.icon) {
        avatarBox.appendChild(V.utils.el('img', { src: role.icon, alt: '', onerror: fallback }));
      } else {
        fallback();
      }
      return avatarBox;
    })());
    var avatarWrap = V.utils.el('button', {
      className: 'vshell-char-bigthumb-wrap vshell-role-avatar-wrap',
      type: 'button',
      title: '设置角色图片',
      'aria-label': '设置角色图片',
      onclick: function () {
        if (V.charEditor) V.charEditor.pickIcon(role, function (iconUrl) { if (iconUrl) setAvatar(iconUrl); });
      },
    }, [
      avatarSpan,
      V.utils.el('span', { className: 'vshell-char-bigthumb-hover' },
        V.utils.el('span', { className: 'codicon codicon-edit' })),
    ]);

    // 角色名（v0.6.44：右侧重命名按钮，与管理页同款交互：输入框+确认/取消）
    var nameRow = null;
    function renderName(nm) {
      if (!nameRow) return;
      nameRow.innerHTML = '';
      nameRow.appendChild(V.utils.el('div', { className: 'vshell-role-name' }, nm));
      nameRow.appendChild(V.utils.el('button', {
        className: 'vshell-icon-btn vshell-char-name-edit',
        type: 'button',
        title: '重命名角色',
        'aria-label': '重命名角色',
        onclick: startRename,
      }, V.utils.el('span', { className: 'codicon codicon-edit' })));
    }
    function startRename() {
      if (!nameRow) return;
      nameRow.innerHTML = '';
      var inp = V.utils.el('input', {
        className: 'vshell-char-name-input',
        type: 'text',
        value: role.name,
        'aria-label': '角色新名称',
        onkeydown: function (e) {
          if (e.key === 'Enter') { e.preventDefault(); doRename(inp); }
          else if (e.key === 'Escape') { cancelRename(); }
        },
      });
      nameRow.appendChild(inp);
      nameRow.appendChild(V.utils.el('button', {
        className: 'vshell-icon-btn vshell-char-name-confirm',
        type: 'button',
        title: '确认改名',
        'aria-label': '确认改名',
        onclick: function () { doRename(inp); },
      }, V.utils.el('span', { className: 'codicon codicon-check' })));
      nameRow.appendChild(V.utils.el('button', {
        className: 'vshell-icon-btn vshell-char-name-cancel',
        type: 'button',
        title: '取消',
        'aria-label': '取消',
        onclick: cancelRename,
      }, V.utils.el('span', { className: 'codicon codicon-close' })));
      try { inp.focus(); inp.select(); } catch (e) { /* noop */ }
    }
    function doRename(inp) {
      var nn = inp.value.trim();
      if (!nn || nn === role.name) { cancelRename(); return; }
      var oldN = role.name;
      if (!V.characters.rename(oldN, nn)) {
        if (V.toast) V.toast.error('改名失败：名称无效或已存在');
        return;
      }
      role.name = nn;
      if (V.toast) V.toast.ok('已重命名：' + oldN + ' → ' + nn);
      // URL 跟随新名（replaceState 不触发 hashchange → 页面保留、滚动不丢）
      try { history.replaceState(null, '', '#/role/' + encodeURIComponent(nn)); } catch (e) { /* noop */ }
      renderName(nn);
      updateAvatarLetter();
      if (statsEl) statsEl.textContent = '手动添加 ' + V.characters.videosOf(nn).length + ' · 聚合搜索计算中';
    }
    function cancelRename() {
      renderName(role.name);
    }
    nameRow = V.utils.el('div', { className: 'vshell-role-dname-row' });

    var statsEl = null;
    // v0.6.46：关键词行（chips + hover 编辑按钮）——characters.onChange 时局部刷新
    var chipsRowEl = null;
    var chipsEditBtn = null;
    function renderChips() {
      if (!chipsRowEl) return;
      chipsRowEl.innerHTML = '';
      var cur = mergedRole(role.name) || role;
      (cur.keywords || []).filter(Boolean).forEach(function (k) {
        chipsRowEl.appendChild(V.utils.el('span', { className: 'vshell-st-chip' },
          V.utils.el('span', { className: 'vshell-st-chip-label' }, k)));
      });
      if (chipsEditBtn) chipsRowEl.appendChild(chipsEditBtn);
    }
    var head = V.utils.el('div', { className: 'vshell-role-head' }, [
      avatarWrap,
      V.utils.el('div', { className: 'vshell-role-head-info' }, [
        nameRow,
        (function () {
          // v0.6.46：关键词行尾 hover 显示的「编辑词汇」按钮 → 词编辑浮窗
          chipsRowEl = V.utils.el('div', { className: 'vshell-role-chips' });
          chipsEditBtn = V.utils.el('button', {
            className: 'vshell-icon-btn vshell-role-chips-edit',
            type: 'button',
            title: '编辑关键词/排除词',
            'aria-label': '编辑关键词/排除词',
            onclick: function () { openWordsDlg(role.name); },
          }, V.utils.el('span', { className: 'codicon codicon-edit' }));
          renderChips();
          return chipsRowEl;
        })(),
        (function () {
          statsEl = V.utils.el('div', { className: 'vshell-role-stats' }, '手动添加 '
            + V.characters.videosOf(role.name).length + ' · 聚合搜索计算中');
          return statsEl;
        })(),
      ]),
    ]);
    banner.appendChild(head);

    // v0.6.44：banner 右上角「修改背景图」按钮（与管理页 .vshell-char-banner-set 同款）
    banner.appendChild(V.utils.el('button', {
      className: 'vshell-icon-btn vshell-role-banner-edit',
      type: 'button',
      title: role.banner ? '更换主页背景图' : '设置主页背景图',
      'aria-label': '设置主页背景图',
      onclick: function () {
        if (V.charEditor) V.charEditor.pickBanner(role, function (url) { if (url) applyBanner(url); });
      },
    }, V.utils.el('span', { className: 'codicon codicon-file-media' })));

    page.appendChild(banner);
    renderName(role.name);

    /* ---- 代表作横卡（v0.5.6 第四轮，用户需求 2c） ---- */
    var featuredHost = V.utils.el('div', { className: 'vshell-role-featuredhost' });
    page.appendChild(featuredHost);

    /* ---- 内容区（不分 Tab：手动添加 + 聚合合并，用户需求 1） ---- */
    var body = V.utils.el('div', { className: 'vshell-role-body' });
    page.appendChild(body);

    // v0.6.0 数据源隔离重构：聚合搜索改走 source-feed（每（源,关键词）一个
    // feed，数据源返回顺序 + 插入序；放弃播放量降序——用户「任何视频墙都
    // 这样处理」）。feeds = { srcId: { kws: { kw: feed } } }；items = 已取到
    // 的聚合卡（按取卡顺序）；localItems = 本地视频命中关键词（置顶）。
    var agg = { feeds: {}, items: [], localItems: [], manualItems: [], hasMore: true,
      loading: false, failed: false, srcRotate: 0, firstRound: true, issued: {} };
    // v0.6.43：代表作排重建指纹——characters.onChange 无条件调 renderMarquee，
    // 删除关键词/排除词等**无关变更**也会整排重建（innerHTML='' + 重建 mq →
    // 滚动动画重置闪动）。指纹不变时跳过重建。
    var mqFpLast = '';
    var manualCount = V.characters.videosOf(role.name).length;
    // v0.5.6 第五轮：聚合按角色的**所有关键词**搜索；关键词被删光时兜底角色名
    function aggKws() {
      return role.keywords && role.keywords.length ? role.keywords : [role.name];
    }

    function updateStats(aggCount) {
      var st = banner.querySelector('.vshell-role-stats');
      if (st) st.textContent = '手动添加 ' + manualCount + ' · 聚合搜索 ' + aggCount;
    }

    /** 代表作滚动排（v0.5.6 第七轮需求 4：一排循环平滑滚动的视频卡片，
     *  卡片比普通网格卡大——360px 宽）。
     *  数据源 = 手动添加的全部视频（videosOf）；代表作卡 is-featured
     *  徽章 + hover 取消钮；track 内两个等宽 half 复制 → translateX(-50%)
     *  无缝循环（CSS vshell-marquee），hover 暂停，reduced-motion 停动画
     *  v0.5.6 第十轮需求 4/5（重写）：卡片**完全复用普通视频卡片的封面
     *  布局**（V.videoCard.create layout:'cover'），尺寸显著大于普通卡
     *  （480px，CSS .vshell-role-mcard2）；数据源 = featuredMeta 快照卡
     *  置顶 + videosOf 其余去重（聚合搜索设的代表作也能出现在滚动排） */
    function mcard(meta) {
      if (!meta || !meta.id) return null;
      var featured = isFeat(meta.id);
      // v0.5.6 第十二轮需求 8：代表作卡右上角**圆点**（savedMarks
      // is-featured-mark，opts.featured 驱动）；需求 13：**不显示**
      // 「★ 代表作」徽章与 x 取消控件（CSS 规则已删）
      // v0.5.6 第十四轮需求 3：滚动排卡要能看到收藏/待看/代表作按钮
      // （第十三轮 noActions 隐藏过头——黑名单/静音还在但 actions 没了）
      var card = V.videoCard.create(meta, {
        layout: 'cover', noRoleMeta: true, noTagIcon: true, featured: featured,
      });
      card.classList.add('vshell-role-mcard2');
      if (featured) card.classList.add('is-featured');
      // 代表作按钮（星标）与网格卡一致：挂 actions 内（收藏按钮右侧）
      var actionsEl = card.querySelector('.vsc-video-actions');
      if (actionsEl) actionsEl.appendChild(featureBtn(meta));
      return card;
    }
    function renderMarquee() {
      // v0.5.6 第十五轮需求 3：删除最后一个代表作时**先收起再清空**——
      // 若先 innerHTML='' 再移除 has-content，同一帧内行内容高度已归零，
      // grid-template-rows 1fr→0fr 的过渡没有可见高度差（内容瞬间消失，
      // 用户反馈：添加有动画、删除最后一个没有）。先移除 has-content
      // （1fr→0fr 过渡期间内容被 overflow:hidden 压缩 → 平滑收起），
      // 过渡结束后再清空内容。
      var videos = V.characters.videosOf(role.name);
      // v0.5.6 第十六轮需求 2：代表作排"不见了"根因——**判空在 fm 处理
      // 之前**：只有聚合卡设的代表作（没有手动添加视频）时 videosOf 为
      // 空 → 直接走收起分支，featuredMeta 快照根本没有机会展示。
      // fm 提前计算并合并进 videos，再判空。
      // v0.5.6 第二十轮需求 4：**多个代表作**——所有代表作快照（featuredMetas
      // 优先，缺失时从 videosOf 按 id 找）置顶，其余去重
      // v0.6.43：role 是 mount 快照——代表作数据实时重读（角色页内星标
      // 设/取消代表作后 notify→renderMarquee 需反映最新，快照读不到）
      var liveRole = mergedRole(role.name) || role;
      var fds = Array.isArray(liveRole.featured) ? liveRole.featured.slice()
        : (liveRole.featured ? [liveRole.featured] : []);
      var fms = (liveRole.featuredMetas && typeof liveRole.featuredMetas === 'object')
        ? liveRole.featuredMetas : {};
      var fmVideos = [];
      fds.forEach(function (fid) {
        if (!fid) return;
        var fv = (fms[fid] && fms[fid].id) ? fms[fid] : null;
        if (!fv) {
          for (var j = 0; j < videos.length; j++) {
            if (videos[j] && videos[j].id === fid) { fv = videos[j]; break; }
          }
        }
        if (fv) {
          videos = videos.filter(function (v) { return !v || v.id !== fv.id; });
          fmVideos.push(fv);
        }
      });
      // 代表作排只显示「设为代表作」的视频（fmVideos），不显示普通手动
      // 添加的视频——手动添加的视频只出现在下方内容区（mergedItems 的
      // manual 置顶段）。原代码 `fmVideos.concat(videos)` 把手动添加的
      // 全部视频也塞进代表作排，与「代表作」语义冲突。
      videos = fmVideos;
      // v0.6.43：重建前指纹比对——输出只由 fds/fms/fmVideos 决定；删除
      // 关键词/排除词、手动列表变化等无关变更触发 onChange→renderMarquee
      // 时数据未变 → 跳过重建（防滚动动画重置闪动）
      var mqFp = (fds || []).join(',') + '|' + JSON.stringify(fms || {}) + '|'
        + (fmVideos || []).map(function (v) { return v && v.id; }).join(',');
      if (mqFp === mqFpLast) return;
      mqFpLast = mqFp;
      if (!videos.length) {
        // v0.5.6 第十七轮需求 2 根因（实测 mqRightAfter children=0）：
        // 取消代表作时 onclick 内 setFeatured → persist() → notify() →
        // offChars → renderMarquee（**此时 store 已改，role.featuredMeta
        // 已是 null**）→ 收起（remove has-content + 380ms 定时器）→ 返回
        // onclick 继续 → **第二次 renderMarquee**：has-content 已不在 →
        // 旧代码走 else 分支**立即 innerHTML=''** → 绕过 380ms 延迟 →
        // marquee"突然消失"、body 位置突变。修复：**has-content 不在时
        // 同样走延迟清空**（scheduleClean 防重入，多个收起调用共享一个
        // 定时器；定时器到点后若内容已重建（新 marquee）则不清）
        function scheduleClean() {
          if (featuredHost._clean) return;
          featuredHost._clean = true;
          setTimeout(function () {
            featuredHost._clean = false;
            // 到点时仅当仍未重新展示（has-content 不在）才清空——重建
            // 会重新 add has-content → 不清（新内容保留）；没重建 → 清掉
            // 已收起的旧内容。**不能加 !marquee 检查**：旧 marquee 在
            // DOM 时条件恒 false → 内容永远残留（实测 mqCardsAfter=1）
            if (!featuredHost.classList.contains('has-content')) {
              featuredHost.innerHTML = '';
              if (featuredHost._ro) { try { featuredHost._ro.disconnect(); } catch (e) { /* noop */ } featuredHost._ro = null; }
              if (featuredHost._fit) { try { window.removeEventListener('resize', featuredHost._fit); } catch (e) { /* noop */ } featuredHost._fit = null; }
            }
          }, 380);
        }
        featuredHost.classList.remove('has-content');
        if (!featuredHost.children.length) {
          // 首帧空态（从无内容）：无需过渡，直接清（幂等）
          featuredHost.innerHTML = '';
          if (featuredHost._ro) { try { featuredHost._ro.disconnect(); } catch (e) { /* noop */ } featuredHost._ro = null; }
          if (featuredHost._fit) { try { window.removeEventListener('resize', featuredHost._fit); } catch (e) { /* noop */ } featuredHost._fit = null; }
          return;
        }
        scheduleClean();
        return;
      }
      featuredHost.innerHTML = '';
      if (featuredHost._ro) { try { featuredHost._ro.disconnect(); } catch (e) { /* noop */ } featuredHost._ro = null; }
      if (featuredHost._fit) { try { window.removeEventListener('resize', featuredHost._fit); } catch (e) { /* noop */ } featuredHost._fit = null; }
      // v0.5.6 第十二轮需求 5：内容有无切换 → grid-rows 0fr/1fr 平滑过渡
      // （无代表作时收起，body 位置不再剧变）
      featuredHost.classList.add('has-content');
      var cards = videos.map(mcard).filter(Boolean);
      if (!cards.length) return;
      // v0.5.6 第十一轮（用户需求 6）：**不要重复显示**——一排放得下时只
      // 渲染一个 half（静态展示）；放不下才补第二个 half 无缝循环（两个
      // half 各自构建**独立的节点**——共享同一批 DOM 节点时第二个 half
      // 的 appendChild 会把节点从第一个 half 移动走（实测第一个 half
      // 变空；slice() 只拷贝引用，不拷贝节点））
      var half2 = null;
      var makeHalf = function () {
        return V.utils.el('div', { className: 'vshell-role-marquee-half' },
          videos.map(mcard).filter(Boolean));
      };
      var mq = V.utils.el('div', { className: 'vshell-role-marquee' },
        V.utils.el('div', { className: 'vshell-role-marquee-track' }, [makeHalf()]));
      featuredHost.appendChild(mq);
      // v0.5.6 第九轮：一排放得下 → 静态展示；放不下 → 才滚动
      // （is-scrolling 由 JS 按 track.scrollWidth > 容器宽 动态控制）
      var trackEl = mq.querySelector('.vshell-role-marquee-track');
      var fit = function () {
        var need = trackEl.scrollWidth > mq.clientWidth + 1;
        mq.classList.toggle('is-scrolling', need);
        // 需要滚动 → 追加第二个 half（宽度一致，translateX(-50%) 无缝）；
        // 放得下 → 移除第二个 half（只显示一份，用户需求 6）
        if (need && !half2) {
          half2 = makeHalf();
          trackEl.appendChild(half2);
        } else if (!need && half2) {
          half2.remove();
          half2 = null;
        }
      };
      fit();
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(fit);
        ro.observe(mq);
        ro.observe(trackEl);
        featuredHost._ro = ro;   // 重建时 disconnect（挂 host，防泄漏）
      } else {
        featuredHost._fit = fit;
        window.addEventListener('resize', fit);
      }
    }

    /** 是否代表作（v0.5.6 第二十轮需求 4：多值数组判断；兼容旧单值） */
    function isFeat(id) {
      var f = role.featured;
      return Array.isArray(f) ? f.indexOf(id) >= 0 : f === id;
    }

    /** 设为代表作按钮（v0.5.6 第十轮需求 3：风格与收藏/待看统一
     *  ——vsc-video-btn secondary，位置在收藏按钮旁边；
     *  需求 4：手动卡+聚合卡**所有**卡都挂） */
    function featureBtn(item) {
      var on = isFeat(item.id);
      return V.utils.el('button', {
        className: 'vsc-video-btn secondary vsc-video-btn-feature' + (on ? ' is-active' : ''),
        type: 'button',
        title: on ? '取消代表作' : '设为代表作',
        'aria-label': on ? '取消代表作' : '设为代表作',
        onclick: function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (!on) {
            // 视频快照（聚合卡也有 pic 字段）：marquee 封面布局直接可用
            // v0.5.6 第十八轮需求 1：snap 必须带 local——本地视频设代表作
            // 后 fm 快照卡（marquee）没有 local 字段 → 缺本地圆点 → 与
            // 底部视频墙同一视频卡（有 .is-local 点）数量不一致
            var snap = {
              id: item.id, bvid: item.bvid || item.id,
              title: item.title || '', cover: item.cover || item.pic || '',
              url: '#/video/' + (item.sourceId && item.sourceId !== 'local'
                ? item.sourceId + ':' : '') + encodeURIComponent(item.id),
              pubdate: item.pubdate || 0,
              local: !!item.local,
            };
            V.characters.setFeatured(role.name, item.id, snap);
          } else {
            // v0.5.6 第二十轮需求 4：多代表作——toggle 移除（不再清空全部）
            V.characters.setFeatured(role.name, item.id);
          }
          // role 是 chars 成员引用——featureds/featuredMetas 已被 setFeatured
          // 同步，无需手动赋值
          renderMarquee();
          renderMerged();
          V.toast.ok(on ? '已取消代表作' : '已设为代表作');
        },
      }, V.utils.el('span', { className: 'codicon ' + (on ? 'codicon-star-full' : 'codicon-star-empty') }));
    }

    /** v0.6.65：角色页卡左下角「从角色排除」按钮（悬停显示，黑名单钮旁）：
     *  点击 → ①从视频角色列表剔除当前角色（videoChars/manuals/charVideos）
     *  ②写角色级排除表（该角色不再自动赋予此视频、段2 搜索剔除）
     *  ③卡片立即移除。**不算手动管理**（不进 manManaged 表）。 */
    function excludeBtn(it) {
      var b = V.utils.el('button', {
        className: 'vsc-video-blacklist vshell-role-exclude-btn',
        type: 'button',
        title: '从角色「' + role.name + '」排除该视频',
        'aria-label': '从角色「' + role.name + '」排除',
        onclick: function (e) {
          // 按钮嵌在 media <a href="#/video/..."> 内——stopPropagation 只停
          // 冒泡、不阻止 <a> 的**默认导航**（点击后会进详情页，用户实测）。
          // 必须 preventDefault（video-card 其他按钮同款）。
          if (e && e.preventDefault) e.preventDefault();
          if (e && e.stopPropagation) e.stopPropagation();
          var srcId = it && it.sourceId && it.sourceId !== 'local' ? it.sourceId : null;
          if (!srcId) {
            if (V.toast) V.toast.info('本地视频无法排除角色');
            return;
          }
          // 顺序关键：**先写排除表，再剔除角色**——removeRoleFromVideo 内部
          // notify → characters.onChange → 页面重建 → charForOn 自动赋予；
          // 若排除表尚未写入，charForOn 按标题命中会把该角色自动加回
          // （实测 chars 恢复）。排除表先行 → 重建时 charForOn 过滤掉该角色。
          try { V.characters.setRoleExcluded(role.name, srcId, it.id, true); } catch (err) { /* noop */ }
          try { V.characters.removeRoleFromVideo(it.id, srcId, role.name); } catch (err) { /* noop */ }
          if (V.toast) V.toast.ok('已从「' + role.name + '」排除该视频');
          var card = b.closest ? b.closest('.vsc-video-card') : null;
          if (card && card.remove) card.remove();
        },
      }, V.utils.el('span', { className: 'codicon codicon-close' }));
      return b;
    }

    /** 自动无限加载哨兵（v0.5.6 第六轮，用户需求 3）：
     *  - hasMore：挂 IO 哨兵 → 进入视口触发 fetchAgg
     *  - 加载中：spinner 提示
     *  - 失败：可点击重试
     *  - 无更多：结束提示 */
    var sentinelIO = null;
    function setupSentinel() {
      if (sentinelIO) { sentinelIO.disconnect(); sentinelIO = null; }
      var old = body.querySelector('.vshell-role-sentinel, .vshell-role-end, .vshell-role-aggloading');
      if (old) old.remove();
      if (state.done) return;
      if (agg.loading) {
        body.appendChild(V.utils.el('div', { className: 'vshell-role-aggloading' }, [
          V.utils.el('span', { className: 'vshell-spinner' }),
          V.utils.el('span', { className: 'vshell-role-aggloading-text' }, '正在聚合搜索…'),
        ]));
        return;
      }
      if (agg.failed) {
        body.appendChild(V.utils.el('button', {
          className: 'vshell-btn vshell-btn-secondary vshell-role-more',
          type: 'button',
          onclick: function () { agg.failed = false; fetchAgg(); },
        }, '加载失败，点击重试'));
        return;
      }
      if (!agg.hasMore) {
        body.appendChild(V.utils.el('div', { className: 'vshell-role-end' }, '没有更多了'));
        return;
      }
      var sentinel = V.utils.el('div', { className: 'vshell-role-sentinel' });
      body.appendChild(sentinel);
      sentinelIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && !agg.loading && !state.done) fetchAgg();
        });
      }, { rootMargin: '300px 0px' });
      sentinelIO.observe(sentinel);
    }

    /** 合并列表（v0.5.6 第十五轮需求 6：本地视频置顶 + 手动添加置顶 +
     *  聚合结果；按 id 去重）——wall/feed 两模式共用。
     *  顺序：本地（聚合里命中的）→ 手动添加 → 聚合网站结果
     *  v0.6.64 段1/段2：手动添加段 = collectManaged 收集的**手动管理表内**
     *  当前角色视频（段1）；聚合结果 = 搜索结果剔除表内视频后（段2）。
     *  去重键统一 dedupKeyOf（源:id 复合，防跨源同 id 误去重）。 */
    function mergedItems() {
      var manual = agg.manualItems || [];
      var seen = {};
      manual.forEach(function (m) {
        var k = dedupKeyOf(m);
        if (k) seen[k] = true;
      });
      // v0.6.0：本地视频已由 collectLocal 单独收集（命中关键词），置顶；
      // 聚合卡（agg.items）不再含 local 项（source-feed 只拉网络结果）
      var local = agg.localItems.filter(function (lv) {
        return lv && lv.id && !seen[dedupKeyOf(lv)];
      });
      local.forEach(function (lv) { seen[dedupKeyOf(lv)] = true; });
      var rest = [];
      agg.items.forEach(function (it) {
        var k = dedupKeyOf(it);
        if (!(it && it.id && seen[k])) {
          // v0.6.67：排除后重建——agg.items 里**已取出**的卡不再过 feed
          // filter（filter 只作用于 feed 拉取/缓存加载），排除过的视频
          // 会随 renderMerged 重建再次出现（card.remove 后又被加回）。
          // 渲染层兜底再筛一遍角色级排除表。
          if (V.characters && V.characters.isRoleExcluded && it.sourceId
              && it.sourceId !== 'local') {
            try {
              if (V.characters.isRoleExcluded(role.name, it.sourceId, it.id)) return;
            } catch (e) { /* noop */ }
          }
          rest.push(it);
        }
      });
      return local.concat(manual).concat(rest);
    }

    /* ---- 视图模式（v0.5.6 第九轮，用户需求 2：角色页响应导航栏
     *  抖音刷/视频墙按钮）：feed = 纵向滑动流（V.feed 共享组件），
     *  wall = 合并网格（标准/封面布局随 V.wall.layout 切换） ---- */
    var feedInst = null;
    function renderFeed() {
      body.innerHTML = '';
      var items = mergedItems();
      if (!items.length && !agg.hasMore) {
        body.appendChild(V.wall.empty('没有找到与「' + role.name + '」相关的视频', 'codicon-search'));
        return;
      }
      feedInst = V.feed.mount(body, {
        items: items,
        getMore: fetchAgg,     // 滑到底 → 聚合翻页（fetchAgg 尾部增量 updateItems）
      });
    }

    /** 增量追加聚合新卡（v0.5.6 第八轮需求 2：复用主页视频墙的平滑加载——
     *  不重建网格，只在 wall 尾部 append 新增 id 的卡（新卡带入场动画，
     *  旧卡 DOM 不动 → 滚动位置保持、页面不跳动）；
     *  v0.5.6 第九轮：feed 模式走 feedInst.updateItems（同样增量），
     *  尚未挂载（首帧空态）时先 renderFeed 重建 */
    function appendAggItems(items) {
      if (V.viewMode && V.viewMode.get() === 'feed') {
        if (!feedInst || !feedInst.updateItems) renderFeed();
        if (feedInst && feedInst.updateItems) feedInst.updateItems(items || []);
        return;
      }
      var host = body.querySelector('.vshell-role-gridhost');
      var wrap = host ? host.querySelector('.vshell-wall') : null;
      if (!wrap || !items || !items.length) {
        renderMerged();
        return;
      }
      // v0.6.0：聚合卡按 source-feed 取卡顺序（数据源返回顺序 + abcabc 轮转）
      // 追加，不再做播放量降序/本地置顶排序（本地视频已在 collectLocal 置顶）
      var fresh = items.slice();
      var added = 0;
      fresh.forEach(function (it) {
        if (!it || !it.id || renderedIds[it.id]) return;
        renderedIds[it.id] = true;
        // v0.5.6 第十二轮需求 8：代表作圆点
        // v0.6.32：增量追加卡同样排除当前角色头像
        var card = V.videoCard.create(it, {
          noRoleMeta: true, excludeRole: role.name, layout: V.wall.layout(),
          featured: isFeat(it.id),
        });
        card.style.setProperty('--i', String(added % 12));
        // 第十轮需求 4：增量追加的聚合卡同样挂代表作按钮（actions 内）
        var actionsEl = card.querySelector('.vsc-video-actions');
        if (actionsEl) {
          actionsEl.appendChild(featureBtn(it));
          actionsEl.appendChild(excludeBtn(it));   // v0.6.65：从角色排除
        }
        wrap.appendChild(card);
        added++;
      });
      setupSentinel();
    }

    /** 合并网格（手动添加置顶 + 聚合结果，去重）
     *  v0.5.6 第七轮需求 3：只新增卡片播放入场动画——renderedIds 记录
     *  已渲染 id，重建时旧卡加 .no-anim（animation:none），新卡保留
     *  vshell-rise；需求 5：角色主页卡片不显示角色名/icon（noRoleMeta）
     *  v0.5.6 第九轮：卡片布局随 V.wall.layout（标准/封面）切换 */
    var renderedIds = {};
    function renderMerged() {
      body.innerHTML = '';
      var merged = mergedItems();
      var host = V.utils.el('div', { className: 'vshell-role-gridhost' });
      body.appendChild(host);
      if (!merged.length) {
        // 空态：加载中 spinner；无更多 = 空态文案；有更多 = 哨兵继续（无空态文案）
        if (agg.loading) {
          host.appendChild(V.utils.el('div', { className: 'vshell-role-aggloading' }, [
            V.utils.el('span', { className: 'vshell-spinner' }),
            V.utils.el('span', { className: 'vshell-role-aggloading-text' }, '正在聚合搜索…'),
          ]));
          return;
        }
        if (!agg.hasMore) {
          host.appendChild(V.wall.empty('没有找到与「' + role.name + '」相关的视频', 'codicon-search'));
          return;
        }
        setupSentinel();
        return;
      }
      var l = V.wall.layout();
      var wrap = V.utils.el('div', { className: 'vshell-wall' + (l === 'cover' ? ' is-cover' : '') });
      merged.forEach(function (it, i) {
        // v0.5.6 第十二轮需求 8：代表作卡右上角圆点（savedMarks is-featured-mark）
        // v0.6.32：视频墙左上角排除**当前角色**头像（多角色视频显示其他角色）
        var card = V.videoCard.create(it, {
          noRoleMeta: true, excludeRole: role.name, layout: l, featured: isFeat(it.id),
        });
        card.style.setProperty('--i', String(i % 12));
        if (renderedIds[it.id]) card.classList.add('no-anim');
        else renderedIds[it.id] = true;
        // v0.5.6 第十轮需求 4：**所有**卡（手动+聚合）都可设代表作——
        // 按钮挂悬停操作层 actions 内（收藏按钮旁边，需求 3）
        var actionsEl = card.querySelector('.vsc-video-actions');
        if (actionsEl) {
          actionsEl.appendChild(featureBtn(it));
          actionsEl.appendChild(excludeBtn(it));   // v0.6.65：从角色排除
        }
        wrap.appendChild(card);
      });
      host.appendChild(wrap);
      // v0.5.6 第六轮：自动无限加载（用户需求 3）——底部哨兵 IO 触发
      // fetchAgg；无更多/加载中/失败各显不同哨兵态
      setupSentinel();
    }
    function renderByMode() {
      if (state.done) return;
      if (feedInst) { try { feedInst.destroy(); } catch (e) { /* noop */ } feedInst = null; }
      if (V.viewMode && V.viewMode.get() === 'feed') renderFeed();
      else renderMerged();
    }

    /** 聚合搜索：所有关键词同页码并行 → 合并去重（id）→ 播放量降序
     *  返回 { items, hasMore }；单关键词失败忽略（不拖垮整体）
     *  v0.5.6 第五轮：结果再按关键词**精确过滤**（用户需求 3）——bilibili
     *  搜索是模糊匹配（标题/简介/标签），角色主页要求精确：标题必须包含
     *  角色的任一关键词，否则剔除（手动添加的视频不走聚合，不受影响） */
    /** 关键词命中（v0.6.31 独立词语义）：标题含关键词且**至少一次出现**
     *  不被该关键词的独立词排除覆盖；无独立词排除时退化为包含判断。 */
    function kwHit(title, kws) {
      if (!title) return false;
      var low = String(title).toLowerCase();
      var kweMap = (role && role.kwExclusions) || {};
      return kws.some(function (k) {
        if (!k) return false;
        var lk = String(k).toLowerCase();
        var kwe = kweMap[k] || null;
        return V.characters && V.characters.kwHitTitle
          ? V.characters.kwHitTitle(low, lk, kwe)
          : low.indexOf(lk) >= 0;
      });
    }

    /** v0.6.31 全局排除词命中——标题含任一全局排除词 → true（聚合/本地都要剔除） */
    function exclHit(title, excls) {
      if (!title || !excls || !excls.length) return false;
      var low = String(title).toLowerCase();
      return excls.some(function (x) {
        return x && low.indexOf(String(x).toLowerCase()) >= 0;
      });
    }

    /* ---- v0.6.0 数据源层：每（源,关键词）一个 source-feed ---- */

    /** 初始化 feeds：激活源 × 角色关键词（源优先）。关键词被删光兜底角色名 */
    function initFeeds() {
      var kws = aggKws();
      var ids = [];
      try { ids = V.multisource.activeSources(); } catch (e) { /* noop */ }
      agg.feeds = {};
      ids.forEach(function (id) {
        var a = V.siteAdapters.adapterFor(id);
        if (!a || typeof a.search !== 'function') return;
        var s = { kws: {} };
        kws.forEach(function (kw) {
          s.kws[kw] = V.sourceFeed.create({
            srcId: id,
            cacheKey: 'wall.role.' + role.name + '.' + kw,   // 分片键含角色+关键词
            fetchFn: function (page) {
              // 精确过滤（需求 3）：bilibili 搜索是模糊匹配，角色主页要求标题
              // 必须含关键词。放进 fetchFn 后的 filter；source-feed 内部 filter
              // 只做黑名单，这里在结果层再精确过滤一次。
              return Promise.resolve().then(function () {
                return a.search(kw, page);
              }).then(function (res) {
                if (!res) return null;   // 失败/未就绪 → null（可重试），不落坏缓存
                var kwsNow = aggKws();
                // v0.5.9：全局排除词——标题含任一全局排除词的视频不进角色页
                res.items = (res.items || []).filter(function (it) {
                  return it && it.id && kwHit(it.title, kwsNow)
                    && !exclHit(it.title, role.globalExclusions);
                });
                return res;
              }).catch(function () { return null; });
            },
            filter: function (items) {
              var kwsNow = aggKws();
              var out = V.blacklist ? V.blacklist.filter(items) : items;
              // v0.6.58：缓存加载（loadCache）路径也做**关键词精确过滤**——
              // 原 fetchFn 只滤网络拉取，旧缓存里含无关标题的视频（历史
              // 版本未过滤/关键词变更前写入）会直接灌入显示（实测 kkav
              // 「杨幂/棒棒糖/清纯大学生」等不含关键词的卡）
              var excls = role.globalExclusions;
              out = (out || []).filter(function (it) {
                return it && it.id && kwHit(it.title, kwsNow)
                  && !(excls && excls.length && exclHit(it.title, excls));
              });
              // v0.6.64 段2：**剔除手动管理表内视频**（它们不再自动管理，
              // 已由段1 单独收集展示）——filter 在网络拉取与缓存加载两路
              // 都执行，保证搜索结果不重复出现已手动管理的视频
              if (out.length && V.characters && V.characters.isManaged) {
                out = out.filter(function (it) {
                  try { return !V.characters.isManaged(it.id, id); }
                  catch (e) { return true; }
                });
              }
              // v0.6.65：**剔除角色级排除的视频**（角色页悬停卡排除——
              // 不算手动管理，独立排除表；网络+缓存两路都执行）
              if (out.length && V.characters && V.characters.isRoleExcluded) {
                out = out.filter(function (it) {
                  try { return !V.characters.isRoleExcluded(role.name, id, it.id); }
                  catch (e) { return true; }
                });
              }
              // v0.6.30 用户拍板：「搜索完成并筛后，为每个列表中的视频添加
              // 当前的角色」——网络拉取与缓存加载两路都补赋（跨源：a 源
              // 视频 → a 源角色，目标源无同名先建副本复制头像/背景/关键词/
              // 排除词；只写 videoChars **不进** charVideos 手动段快照，
              // 角色页「手动添加」段只含手动赋予）。assignAuto 幂等。
              if (out.length && V.characters && V.characters.assignAuto) {
                out.forEach(function (it) {
                  try { V.characters.assignAuto(it, role.name); } catch (e) { /* noop */ }
                });
              }
              return out;
            },
            // v0.6.20 预取刷新后热更新已渲染卡片 stat
            onData: function () {
              if (V.videoCard && V.videoCard.hotUpdateStats && s.kws[kw]) {
                V.videoCard.hotUpdateStats(s.kws[kw].items());
              }
            },
          });
        });
        agg.feeds[id] = s;
      });
      agg.firstRound = true;
      agg.issued = {};
      agg.srcRotate = 0;
    }

    /** 源内取队首（关键词随机混流；跳过空 feed） */
    function takeFromSrc(s) {
      var kKeys = Object.keys(s.kws);
      if (!kKeys.length) return null;
      var start = Math.floor(Math.random() * kKeys.length);
      for (var i = 0; i < kKeys.length; i++) {
        var kw = kKeys[(start + i) % kKeys.length];
        var it = s.kws[kw].take();
        if (it) return it;   // source-feed 内部已标 sourceId
      }
      return null;
    }

    /** 全局源轮转取卡（abcabc 接续） */
    function takeOne() {
      var ids = Object.keys(agg.feeds);
      var n = ids.length;
      for (var i = 0; i < n; i++) {
        var id = ids[(agg.srcRotate + i) % n];
        var s = agg.feeds[id];
        if (s) {
          var item = takeFromSrc(s);
          if (item) {
            agg.srcRotate = (agg.srcRotate + i + 1) % n;
            return item;
          }
        }
      }
      return null;
    }

    /** 全部（源,关键词）耗尽 */
    function allExhausted() {
      var ids = Object.keys(agg.feeds);
      if (!ids.length) return true;
      return ids.every(function (id) {
        var ks = agg.feeds[id].kws;
        return Object.keys(ks).every(function (kw) { return ks[kw].isDone(); });
      });
    }

    /** 是否存在未耗尽 feed（用于决定是否继续预取） */
    function anyUndone() {
      var ids = Object.keys(agg.feeds);
      for (var i = 0; i < ids.length; i++) {
        var ks = agg.feeds[ids[i]].kws;
        for (var k in ks) {
          if (!ks[k].isDone() && ks[k].hasMore()) return true;
        }
      }
      return false;
    }

    /** 触发所有未耗尽 feed 预取 */
    function prefetchAll() {
      var pend = [];
      var ids = Object.keys(agg.feeds);
      ids.forEach(function (id) {
        var ks = agg.feeds[id].kws;
        Object.keys(ks).forEach(function (kw) { pend.push(ks[kw].ready()); });
      });
      return Promise.all(pend);
    }

    /** v0.6.64 段1：**手动管理过的视频**（manManaged 表）里搜当前角色
     *  （videoChars 含 role.name）——这些视频不再参与自动管理，因此聚合
     *  搜索结果（段2）要剔除表内视频，段1 单独收集展示。元数据优先取
     *  charVideos 快照（手动赋予时存的 title/pic），缺失回退 videotable。
     *  渲染位置：本地视频之后、聚合段2之前（mergedItems 拼接）。 */
    function collectManaged() {
      agg.manualItems = [];
      var ids = [];
      try { ids = V.multisource.activeSources(); } catch (e) { /* noop */ }
      var snapById = {};
      try {
        (V.characters.videosOf(role.name) || []).forEach(function (m) {
          if (m && m.id && !snapById[m.id]) snapById[m.id] = m;
        });
      } catch (e) { /* noop */ }
      ids.forEach(function (srcId) {
        var list = [];
        try { list = V.characters.listManaged(srcId) || []; } catch (e) { /* noop */ }
        list.forEach(function (vid) {
          var hasRole = false;
          try {
            var ch = V.characters.getChar(vid, srcId);
            if (Array.isArray(ch)) hasRole = ch.indexOf(role.name) >= 0;
          } catch (e) { /* noop */ }
          if (!hasRole) return;
          var meta = snapById[vid] || null;
          if (!meta) {
            try {
              var vt = V.store.get('videos.' + srcId) || {};
              if (vt[vid]) meta = vt[vid];
            } catch (e) { /* noop */ }
          }
          agg.manualItems.push({
            id: vid,
            sourceId: srcId,
            title: (meta && meta.title) || String(vid),
            pic: (meta && (meta.cover || meta.pic)) || '',
            _managed: true,
          });
        });
      });
    }

    /** 收集本地视频（标题命中任一关键词 → 置顶；不进 source-feed） */
    function collectLocal() {
      var kws = aggKws();
      agg.localItems = [];
      if (!V.localVideos) return;
      var list = V.localVideos.search ? V.localVideos.search('') : V.localVideos.list();
      (list || []).forEach(function (lv) {
        if (!lv || !lv.id) return;
        if (!kwHit(lv.title, kws)) return;
        if (exclHit(lv.title, role.globalExclusions)) return;   // v0.5.9 全局排除词
        if (!lv.sourceId) lv.sourceId = 'local';   // 归属标注（详情路由）
        agg.localItems.push(lv);
      });
    }

    /** v0.6.0 聚合加载：source-feed 驱动（数据源返回顺序 + 插入序，放弃
     *  播放量降序）。首帧 initFeeds → 并行 init 各 feed → 取卡到窗口预算 →
     *  renderByMode；滚动补卡 → 取卡 + 预取 → appendAggItems 增量追加。
     *  返回 Promise（feed 模式 getMore 消费）：{ items, hasMore }，items 为
     *  本轮新增（feed 自己 append，墙模式 appendAggItems 兜底）。 */

    /** 从各源 feed 队列取卡到窗口预算（agg.items.length + windowSize），
     *  累积进 agg.items 并返回本轮净新增（fresh）。take 取空时返回 []——
     *  不触发预取（take 内 queue 空短路），需调用方 prefetchAll 补货。 */
    /** 折叠后去重键：组 → 组 id；普通成员 → 源:id 复合（防跨源同 id 误去重） */
    function dedupKeyOf(it) {
      if (!it || !it.id) return '';
      if (V.aggregations.isGroupId(it.id)) return it.id;
      if (it.sourceId && it.sourceId !== 'local') {
        try {
          var g0 = V.aggregations.groupOf(it.sourceId, it.id);
          if (g0) return g0.id;
        } catch (e) { /* noop */ }
      }
      return (it.sourceId || '') + ':' + it.id;
    }

    function drain() {
      var fresh = [];
      var seen = {};
      // v0.6.58：seen 初始化与检查**同规则**（折叠后组 id / 源:id 复合）——
      // 原初始化记成员裸 id、检查用组 id，首帧后同组成员再次放行 → 组卡重复
      agg.items.forEach(function (it) {
        var k = dedupKeyOf(it);
        if (k) seen[k] = true;
      });
      var target = agg.items.length + V.multisource.windowSize();
      var guard = 0;
      while (agg.items.length < target && guard < 512) {
        guard++;
        var it = takeOne();
        if (!it) break;
        var dedupId = dedupKeyOf(it);
        if (!dedupId || seen[dedupId]) continue;
        seen[dedupId] = true;
        agg.items.push(it);
        fresh.push(it);
      }
      return fresh;
    }

    function fetchAgg() {
      if (agg.loading || state.done) return Promise.resolve({ items: [], hasMore: false });
      agg.loading = true;
      agg.failed = false;

      // 首次：初始化 feeds + 本地视频收集 + 并行 init（读缓存 → 后台增量拉取）
      var firstTime = !Object.keys(agg.feeds).length;
      if (firstTime) {
        initFeeds();
        collectLocal();
        collectManaged();   // v0.6.64 段1：手动管理表内当前角色视频
      }
      if (!Object.keys(agg.feeds).length) {
        // 无可用源/无关键词：直接空态
        agg.loading = false;
        agg.hasMore = false;
        renderByMode();
        return Promise.resolve({ items: [], hasMore: false });
      }

      var pend = [];
      if (firstTime) {
        var ids0 = Object.keys(agg.feeds);
        ids0.forEach(function (id) {
          var ks = agg.feeds[id].kws;
          Object.keys(ks).forEach(function (kw) { pend.push(ks[kw].init()); });
        });
      }

      return Promise.all(pend).then(function () {
        if (state.done) return { items: [], hasMore: false };
        var fresh = drain();
        agg.loading = false;
        agg.hasMore = anyUndone();
        updateStats(agg.items.length);
        if (firstTime) {
          // 首帧：renderMerged 渲染 manual 卡 + 聚合空态/哨兵（本地→手动→聚合
          // 顺序正确）。只此一次全量重建，之后增量追加。
          renderByMode();
        } else if (fresh.length) {
          appendAggItems(fresh);
        }
        // v0.6.1 死循环修复（用户「底部卡片悬停两态闪动 + 点击失效」根因）：
        // 原代码 `if (firstTime || !fresh.length) renderByMode()` —— 当 feed
        // 队列空（take 取不到卡）但源 hasMore 仍 true 时，走 renderByMode →
        // renderMerged 全量重建（body.innerHTML=''）→ setupSentinel 重建哨兵 →
        // 新哨兵仍在视口内 → IntersectionObserver 立即再触发 fetchAgg → 又
        // fresh 空 → 又全量重建……无限循环（实测 8 秒重建 81 次）。hover 中的
        // 卡片 DOM 被反复销毁重建 → CSS :hover 状态来回抖动（标题/日期 ↔
        // 四角按钮两态闪动）+ 点击瞬间卡片被替换（点击失效）。
        // 修复：fresh 空时**绝不** renderByMode 全量重建；而是（若还有更多）
        // 主动 prefetchAll 补货，拿到数据后再 drain + 增量追加。真正耗尽
        // （hasMore=false）才 renderByMode 显示「没有更多」结束态。
        if (agg.hasMore && !allExhausted()) {
          prefetchAll().then(function () {
            if (state.done) return;
            var again = drain();
            agg.hasMore = anyUndone();
            updateStats(agg.items.length);
            if (again.length) {
              appendAggItems(again);
            } else if (!agg.hasMore) {
              // 预取后仍空且已确定无更多 → 显示结束态（唯一需要的重建）
              renderByMode();
            }
          });
        } else if (!agg.hasMore && !fresh.length) {
          renderByMode();   // 已耗尽：显示「没有更多」
        }
        // 返回 items 恒空（feed 模式 getMore 约定：增量由内部 appendAggItems
        // 完成——feed 自己 appendSlide 会与 updateItems 双重追加）
        return { items: [], hasMore: agg.hasMore };
      }).catch(function () {
        if (state.done) return { items: [], hasMore: false };
        agg.loading = false;
        agg.failed = true;
        renderByMode();
        return { items: [], hasMore: false };
      });
    }

    // 首帧：代表作滚动排 + 内容区（按当前视图模式）+ 聚合懒加载（合并显示）
    renderMarquee();
    renderByMode();
    fetchAgg();

    // v0.5.6 第九轮（用户需求 2）：响应导航栏 抖音刷/视频墙 切换与
    // 标准/封面布局切换（数据保留，只重渲染内容区；feed 模式无布局之分）
    var offMode = V.viewMode ? V.viewMode.onChange(renderByMode) : null;
    var offLayout = V.wall ? V.wall.onLayoutChange(renderByMode) : null;
    // 角色数据变化（手动列表增减/元数据刷新）→ 重建内容区
    var offChars = V.characters ? V.characters.onChange(function () {
      collectManaged();   // v0.6.64：手动管理表变化 → 段1 重新收集
      renderByMode();
      renderMarquee();
      renderChips();   // v0.6.46：词增删（词编辑浮窗）→ banner 关键词行同步
    }) : null;

    return {
      destroy: function () {
        state.done = true;
        if (offMode) { try { offMode(); } catch (e) { /* noop */ } offMode = null; }
        if (offLayout) { try { offLayout(); } catch (e) { /* noop */ } offLayout = null; }
        if (offChars) { try { offChars(); } catch (e) { /* noop */ } offChars = null; }
        if (feedInst) { try { feedInst.destroy(); } catch (e) { /* noop */ } feedInst = null; }
        if (sentinelIO) { sentinelIO.disconnect(); sentinelIO = null; }
        page.remove();
      },
    };
  }

  V.pages = V.pages || {};
  V.pages.role = { mount: mount };
})();
