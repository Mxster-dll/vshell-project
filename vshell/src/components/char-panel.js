/* ============================================================
 * char-panel — 角色管理弹窗面板（v0.5.2，用户拍板方案 B）
 * VS Code Modern 两栏布局（sidebar+content，vscode-modern-ui skill）：
 *   左 220px 列表（添加行 + 角色列表：缩略图 + 名称 + 关键词数徽章
 *   + **常驻 × 删除按钮**，用户需求不悬停显示）
 *   右 详情（v0.5.6 第六轮：背景图直接作 detail-idrow 的背景 + 右上角
 *   设置按钮；64px 大缩略图 + 名称 + 关键词 chips（自定义词带「搜索
 *   胶囊同款」悬停浮现删除钮）+ 添加输入）
 * 背景图设置 = **中心点选择**（v0.5.6 第六轮，用户需求 2：不裁剪，
 * 指定中心点——任何显示时该点居中、cover 覆盖全区域）。
 * 操作经 V.characters（自动持久化 + onChange 广播 → 卡片/头像/详情页即时刷新）。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var panel = null;         // 当前打开的 backdrop 元素
  var selectedName = null;  // 当前高亮的角色（新添加 / 点击选中）
  var MAX_FILE = 5 * 1024 * 1024;   // 原图读取上限 5MB（压缩后仅几 KB，放宽限制）
  // v0.6.36：独立词限制「添加行归属关键词」提升为模块级——setKeywordExclusions
  // 触发 onChange → renderDetail 重建会把 renderDetail 闭包内局部状态重置；
  // 模块级 + 跟随 selectedName 切换重置（同角色重建保留归属）
  var kweOwner = null;
  var kweOwnerRole = null;
  // v0.6.42：词增删时抑制面板全量重建（onChange→rerender 会重建
  // renderDetail → 浮窗下方内容闪动）；改局部重绘所在行
  var suppressRerender = false;

  /** 缩略图（有 icon 显示图片；无 icon 白底+首字；加载失败同样回退） */
  function makeThumb(c, cls) {
    var box = V.utils.el('span', { className: 'vshell-tag-thumb' + (cls ? ' ' + cls : '') });
    var fallback = function () {
      box.innerHTML = '';
      box.classList.add('is-letter');
      box.appendChild(V.utils.el('span', { className: 'vsc-video-tag-letter' },
        String(c.name).charAt(0) || '?'));
    };
    if (c.icon) {
      box.appendChild(V.utils.el('img', { src: c.icon, alt: '', onerror: fallback }));
    } else {
      fallback();
    }
    return box;
  }

  /** 角色图片编辑（v0.6.44）：文件选择 + 头像裁剪/背景图中心点界面已提取到
   *  core/char-editor.js（V.charEditor.pickIcon / pickBanner）——角色管理页与
   *  角色主页共用同一套编辑 UI。保存走 characters.notify → onChange → rerender。 */
  /* ================= 两栏面板 ================= */
  var listBox = null;       // 左列表容器
  var mainBox = null;       // 右详情容器
  var kwInputEl = null;     // 详情关键词输入（Enter 添加）

  /** 右侧详情渲染（选中角色）：大缩略图 + 名称 + 关键词 chips + 添加行 + 按钮组 */
  function renderDetail() {
    if (!mainBox) return;
    mainBox.innerHTML = '';
    var roles = V.characters.list();
    var r = null;
    roles.forEach(function (x) { if (!r && x.name === selectedName) r = x; });
    if (!r) {
      if (roles.length) { selectedName = roles[0].name; r = roles[0]; }
    }
    if (!r) {
      mainBox.appendChild(V.utils.el('div', { className: 'vshell-modal-sub' },
        '还没有角色——左侧输入名称添加'));
      return;
    }
    // 头部（v0.5.6 第六轮重构）：背景图直接作为 **detail-idrow 的背景**
    // （用户需求 1：不再是单独一行预览）+ 右上角设置按钮（用户需求 2 保留）
    // 无自定义图时用手绘默认 SVG（需求 1：每个角色都有默认背景图）
    mainBox.appendChild(V.utils.el('div', { className: 'vshell-char-detail-head' }, [
      (function () {
        var idrow = V.utils.el('div', { className: 'vshell-char-detail-idrow' });
        var bUrl = r.banner || (V.charBanners && V.charBanners.bannerFor(r.name));
        if (bUrl) {
          idrow.classList.add('has-bg');
          idrow.style.backgroundImage = 'linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.72)), url("'
            + bUrl + '")';
          idrow.style.backgroundSize = 'cover';
          idrow.style.backgroundPosition = 'center';
        } else {
          idrow.style.background = 'linear-gradient(135deg, var(--vscode-list-activeSelectionBackground), var(--vscode-editor-background) 70%)';
        }
        idrow.appendChild(V.utils.el('button', {
          className: 'vshell-char-bigthumb-wrap',
          type: 'button',
          title: '设置角色图片',
          'aria-label': '设置角色图片',
          onclick: function () { if (V.charEditor) V.charEditor.pickIcon(r); },
        }, [
          makeThumb(r, 'vshell-char-bigthumb'),
          V.utils.el('span', { className: 'vshell-char-bigthumb-hover' },
            V.utils.el('span', { className: 'codicon codicon-edit' })),
        ]));
        // v0.5.9：名称行可改名——dname + 铅笔编辑按钮（编辑态换输入框+确认/取消）
        var nameRow = V.utils.el('div', { className: 'vshell-char-dname-row' });
        var dnameEl = V.utils.el('div', { className: 'vshell-char-dname' }, r.name);
        nameRow.appendChild(dnameEl);
        nameRow.appendChild(V.utils.el('button', {
          className: 'vshell-icon-btn vshell-char-name-edit',
          type: 'button',
          title: '重命名角色',
          'aria-label': '重命名角色',
          onclick: function () { startRename(); },
        }, V.utils.el('span', { className: 'codicon codicon-edit' })));
        idrow.appendChild(nameRow);

        function startRename() {
          nameRow.innerHTML = '';
          var inp = V.utils.el('input', {
            className: 'vshell-char-name-input',
            type: 'text',
            value: r.name,
            'aria-label': '角色新名称',
            onkeydown: function (e) {
              if (e.key === 'Enter') { e.preventDefault(); doRename(inp); }
              else if (e.key === 'Escape') { cancelRename(); }
            },
          });
          var okBtn = V.utils.el('button', {
            className: 'vshell-icon-btn vshell-char-name-confirm',
            type: 'button',
            title: '确认改名',
            'aria-label': '确认改名',
            onclick: function () { doRename(inp); },
          }, V.utils.el('span', { className: 'codicon codicon-check' }));
          var cancelBtn = V.utils.el('button', {
            className: 'vshell-icon-btn vshell-char-name-cancel',
            type: 'button',
            title: '取消',
            'aria-label': '取消',
            onclick: cancelRename,
          }, V.utils.el('span', { className: 'codicon codicon-close' }));
          nameRow.appendChild(inp);
          nameRow.appendChild(okBtn);
          nameRow.appendChild(cancelBtn);
          try { inp.focus(); inp.select(); } catch (e) { /* noop */ }
        }
        function doRename(inp) {
          var nn = inp.value.trim();
          if (!nn || nn === r.name) { cancelRename(); return; }
          var oldN = r.name;
          if (!V.characters.rename(oldN, nn)) {
            if (V.toast) V.toast.error('改名失败：名称无效或已存在');
            return;
          }
          selectedName = nn;
          if (V.toast) V.toast.ok('已重命名：' + oldN + ' → ' + nn);
          rerender();
        }
        function cancelRename() {
          renderDetail();
        }
        idrow.appendChild(V.utils.el('button', {
          className: 'vshell-icon-btn vshell-char-banner-set',
          type: 'button',
          title: r.banner ? '更换主页背景图' : '设置主页背景图',
          'aria-label': '设置主页背景图',
          onclick: function () { if (V.charEditor) V.charEditor.pickBanner(r); },
        }, V.utils.el('span', { className: 'codicon codicon-file-media' })));
        return idrow;
      })(),
    ]));

    // 关键词区（v0.5.5：角色名关键词不再固定——默认存在但可删去；
    // 所有 chip 删除钮都用搜索胶囊同款样式）
    // （v0.5.6 第五轮：原「主页背景图」独立栏已删除；第六轮：背景图并入
    //   detail-idrow，不再是独立预览行——用户需求 1）
    mainBox.appendChild(V.utils.el('div', { className: 'vshell-char-sec' }, [
      V.utils.el('div', { className: 'vshell-char-sec-title' }, '关键词'),
      V.utils.el('div', { className: 'vshell-char-kwline' }),
    ]));
    var kwLine = mainBox.querySelector('.vshell-char-kwline');
    /** v0.6.42：重读合并条目（r 是渲染时快照；词增删后必须从 listAll 重读，
     *  否则局部重绘看不到变化） */
    function mergedRole() {
      var all = V.characters.list();
      var m = null;
      all.forEach(function (x) { if (!m && x.name === r.name) m = x; });
      return m;
    }
    function renderKws() {
      kwLine.innerHTML = '';
      var cur = mergedRole();
      (cur && cur.keywords || []).forEach(function (k) {
        var chip = V.utils.el('span', {
          className: 'vshell-char-kwchip',
          title: '关键词',
        }, [
          V.utils.el('span', { className: 'vshell-char-kwchip-name' }, k),
          // v0.5.5：codicon 放内部 span（与导航栏同结构）——按钮自身带 codicon
          // 类会吃到 codicon 基类 16px 字号（用户反馈 x 太大），内部 span 走
          // .vshell-st-chip-del .codicon{font-size:8px}
          V.utils.el('button', {
            className: 'vshell-st-chip-del',
            type: 'button',
            title: '删除关键词',
            'aria-label': '删除关键词 ' + k,
            onclick: function (e) {
              e.stopPropagation();
              removeKw(k);
            },
          }, V.utils.el('span', { className: 'codicon codicon-close' })),
        ]);
        kwLine.appendChild(chip);
      });
    }
    function removeKw(k) {
      // v0.6.41：全源删除（跨源同名角色合并显示——旧 setKeywords 只写首个
      // 源，残留源重合并回末尾，表现为「删除后词跑到最后」）
      // v0.6.42：抑制全量重建 + 局部重绘关键词行（防浮窗下方闪动）
      suppressRerender = true;
      try { V.characters.removeKeyword(r.name, k); } finally { suppressRerender = false; }
      renderKws();
    }
    renderKws();

    // 添加关键词行
    var kwAdd = V.utils.el('div', { className: 'vshell-char-kwadd' });
    kwInputEl = V.utils.el('input', {
      className: 'vshell-tag-input',
      type: 'text',
      placeholder: '添加关键词…',
      'aria-label': '添加关键词',
      onkeydown: function (e) {
        if (e.key === 'Enter') { e.preventDefault(); doAddKw(); }
      },
    });
    var kwAddBtn = V.utils.el('button', {
      className: 'vshell-tag-add',
      type: 'button',
      title: '添加关键词',
      'aria-label': '添加关键词',
      onclick: doAddKw,
    }, V.utils.el('span', { className: 'codicon codicon-add' }));
    kwAdd.appendChild(kwInputEl);
    kwAdd.appendChild(kwAddBtn);
    mainBox.appendChild(kwAdd);

    function doAddKw() {
      var v = kwInputEl.value.trim();
      if (!v) return;
      // v0.5.5：不再剔除角色名——角色名 chip 保留到用户主动删除
      // v0.6.42：从 find（首源原生条目）读——r 是跨源合并拷贝，直接写会把
      // 合并数组整体写入首源（跨源词污染）；同时抑制全量重建改局部重绘
      var cur = V.characters.find(r.name);
      var kws = (cur && cur.keywords || []).slice();
      if (kws.indexOf(v) < 0) kws.push(v);
      suppressRerender = true;
      try { V.characters.setKeywords(r.name, kws); } finally { suppressRerender = false; }
      kwInputEl.value = '';
      renderKws();
    }

    // ===== 独立词限制区（v0.6.33：关键词与全局排除词之间）=====
    // 限制词按关键词绑定（kwExclusions: {kw: [词]}）；胶囊显示限制词本体，
    // 其中被限制的关键词片段**高亮**；同一个词被多个关键词限制时合并展示。
    // 添加行左侧的归属胶囊决定新词挂到哪个关键词下，点击可切换；多次添加
    // 不自动改变归属；默认归属为空（需先点胶囊选择关键词）。
    // v0.6.36：容器用**独立类** .vshell-char-kwex-line（不能复用
    // .vshell-char-exline——renderExcls 的 querySelector('.vshell-char-exline')
    // 会误命中本区并清空胶囊）
    mainBox.appendChild(V.utils.el('div', { className: 'vshell-char-sec' }, [
      V.utils.el('div', { className: 'vshell-char-sec-title' }, '独立词限制'),
      V.utils.el('div', { className: 'vshell-char-kwex-line' }),
    ]));
    var kweLine = mainBox.querySelector('.vshell-char-kwex-line');
    // v0.6.36：归属关键词模块级 + 跟随角色切换重置（同角色重建保留）
    if (kweOwnerRole !== r.name) { kweOwner = null; kweOwnerRole = r.name; }
    function renderKwe() {
      kweLine = mainBox.querySelector('.vshell-char-kwex-line');
      if (!kweLine) return;
      kweLine.innerHTML = '';
      var map = {};   // word → [所属关键词...]
      // v0.6.42：用合并条目（跨源同名角色的独立词全量可见）
      var cur = mergedRole();
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
            onclick: function (e) {
              e.stopPropagation();
              removeKwe(w, map[w]);
            },
          }, V.utils.el('span', { className: 'codicon codicon-close' })));
          kweLine.appendChild(chip);
        });
    }
    function removeKwe(w, kws) {
      kws.forEach(function (kw) {
        // v0.6.41：全源删除（同 removeKw——setKeywordExclusions 只写首源）
        // v0.6.42：抑制全量重建 + 局部重绘独立词行
        suppressRerender = true;
        try { V.characters.removeKeywordExclusion(r.name, kw, w); }
        finally { suppressRerender = false; }
      });
      renderKwe();
    }
    renderKwe();

    // 添加行：归属关键词胶囊（点击切换）+ 输入框 + 添加按钮
    var kweAdd = V.utils.el('div', { className: 'vshell-char-kwadd' });
    var ownerBtn = V.utils.el('button', {
      type: 'button',
      className: 'vshell-char-kwex-owner' + (kweOwner ? '' : ' is-empty'),
      title: '选择归属关键词',
      'aria-label': '选择归属关键词',
      onclick: pickOwner,
    });
    function renderOwner() {
      ownerBtn.innerHTML = '';
      ownerBtn.appendChild(V.utils.el('span', { className: 'vshell-char-kwex-owner-name' },
        kweOwner || '选择关键词'));
      ownerBtn.classList.toggle('is-empty', !kweOwner);
    }
    renderOwner();
    kweAdd.appendChild(ownerBtn);
    var kweInputEl = V.utils.el('input', {
      className: 'vshell-tag-input',
      type: 'text',
      placeholder: '添加独立词限制…',
      'aria-label': '添加独立词限制',
      onkeydown: function (e) {
        if (e.key === 'Enter') { e.preventDefault(); doAddKwe(); }
      },
    });
    var kweAddBtn = V.utils.el('button', {
      className: 'vshell-tag-add',
      type: 'button',
      title: '添加独立词限制',
      'aria-label': '添加独立词限制',
      onclick: doAddKwe,
    }, V.utils.el('span', { className: 'codicon codicon-add' }));
    kweAdd.appendChild(kweInputEl);
    kweAdd.appendChild(kweAddBtn);
    mainBox.appendChild(kweAdd);

    /** 点击归属胶囊 → 弹关键词列表选择（纯关键词胶囊列表，无标题/副文/取消钮；
     * 胶囊样式与全局排除词胶囊完全一致，无删除钮即无悬停叉叉） */
    function pickOwner() {
      var kws = (r.keywords || []).slice();
      if (!kws.length) { V.toast.info('请先在「关键词」区添加关键词'); return; }
      var overlay = V.utils.el('div', {
        className: 'vshell-modal-backdrop vshell-picker-backdrop',
      });
      var box = V.utils.el('div', {
        className: 'vshell-modal vshell-tag-modal vshell-char-kwex-pick',
      });
      var listEl = V.utils.el('div', { className: 'vshell-char-kwex-line' });
      kws.forEach(function (kw) {
        var chip = V.utils.el('span', {
          className: 'vshell-char-kwchip',
          title: '归属关键词：' + kw,
        }, V.utils.el('span', { className: 'vshell-char-kwchip-name' }, kw));
        chip.onclick = function () {
          kweOwner = kw;
          renderOwner();
          close();
        };
        listEl.appendChild(chip);
      });
      box.appendChild(listEl);
      function close() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.removeEventListener('keydown', esc);
      }
      function esc(e) { if (e.key === 'Escape') close(); }
      overlay.appendChild(box);
      overlay.addEventListener('mousedown', function (e) {
        if (e.target === overlay) close();
      });
      document.addEventListener('keydown', esc);
      document.body.appendChild(overlay);
    }

    function doAddKwe() {
      var v = kweInputEl.value.trim();
      if (!v) return;
      if (!kweOwner) { V.toast.info('请先点击输入框左侧胶囊选择归属关键词'); return; }
      if (v.indexOf(kweOwner) < 0) {
        V.toast.error('独立限制词「' + v + '」未包含所选关键词「' + kweOwner + '」，已取消');
        return;
      }
      // v0.6.42：从 find（首源原生条目）读——避免把合并数组写入首源；
      // 抑制全量重建改局部重绘
      var cur = V.characters.find(r.name);
      var kwe = (cur && cur.kwExclusions) || {};
      var list = (kwe[kweOwner] || []).slice();
      if (list.indexOf(v) < 0) list.push(v);
      suppressRerender = true;
      try { V.characters.setKeywordExclusions(r.name, kweOwner, list); }
      finally { suppressRerender = false; }
      kweInputEl.value = '';
      renderKwe();
    }

    // 全局排除词区（v0.5.9 排除词 → v0.6.31 显式改名：标题含任一全局排除
    // 词 → 视频墙/角色页匹配整段失败；独立词排除在关键词 chip 的编辑入口）
    mainBox.appendChild(V.utils.el('div', { className: 'vshell-char-sec' }, [
      V.utils.el('div', { className: 'vshell-char-sec-title' }, '全局排除词'),
      V.utils.el('div', { className: 'vshell-char-exline' }),
    ]));
    var exLine = mainBox.querySelector('.vshell-char-exline');
    function renderExcls() {
      exLine.innerHTML = '';
      var cur = mergedRole();
      (cur && cur.globalExclusions || []).forEach(function (x) {
        var chip = V.utils.el('span', {
          className: 'vshell-char-kwchip',
          title: '全局排除词',
        }, [
          V.utils.el('span', { className: 'vshell-char-kwchip-name' }, x),
          V.utils.el('button', {
            className: 'vshell-st-chip-del',
            type: 'button',
            title: '删除全局排除词',
            'aria-label': '删除全局排除词 ' + x,
            onclick: function (e) {
              e.stopPropagation();
              removeExcl(x);
            },
          }, V.utils.el('span', { className: 'codicon codicon-close' })),
        ]);
        exLine.appendChild(chip);
      });
    }
    function removeExcl(x) {
      // v0.6.41：全源删除（同 removeKw——setGlobalExclusions 只写首源）
      // v0.6.42：抑制全量重建 + 局部重绘排除词行
      suppressRerender = true;
      try { V.characters.removeGlobalExclusion(r.name, x); } finally { suppressRerender = false; }
      renderExcls();
    }
    renderExcls();

    // 添加全局排除词行
    var exAdd = V.utils.el('div', { className: 'vshell-char-kwadd' });
    var exInputEl = V.utils.el('input', {
      className: 'vshell-tag-input',
      type: 'text',
      placeholder: '添加全局排除词…',
      'aria-label': '添加全局排除词',
      onkeydown: function (e) {
        if (e.key === 'Enter') { e.preventDefault(); doAddExcl(); }
      },
    });
    var exAddBtn = V.utils.el('button', {
      className: 'vshell-tag-add',
      type: 'button',
      title: '添加全局排除词',
      'aria-label': '添加全局排除词',
      onclick: doAddExcl,
    }, V.utils.el('span', { className: 'codicon codicon-add' }));
    exAdd.appendChild(exInputEl);
    exAdd.appendChild(exAddBtn);
    mainBox.appendChild(exAdd);

    function doAddExcl() {
      var v = exInputEl.value.trim();
      if (!v) return;
      // v0.6.42：从 find（首源原生条目）读——避免把合并数组写入首源；
      // 抑制全量重建改局部重绘
      var cur = V.characters.find(r.name);
      var excls = (cur && cur.globalExclusions || []).slice();
      if (excls.indexOf(v) < 0) excls.push(v);
      suppressRerender = true;
      try { V.characters.setGlobalExclusions(r.name, excls); } finally { suppressRerender = false; }
      exInputEl.value = '';
      renderExcls();
    }

    // v0.5.6 用户需求：删去右栏「设置图片/删除角色」按钮（删除走左侧行删除钮；
    // 头像设置入口移除）；关闭走底部完成按钮
  }

  /** 左列表渲染（缩略图 + 名称 + 关键词数徽章 + 常驻 × 删除按钮） */
  function renderList() {
    if (!listBox) return;
    listBox.innerHTML = '';
    var roles = V.characters.list();
    if (!selectedName && roles.length) selectedName = roles[0].name;  // 初始选中第一个
    if (!roles.length) {
      listBox.appendChild(V.utils.el('div', { className: 'vshell-modal-sub' },
        '还没有角色——输入名称添加，视频标题命中关键词自动赋予角色'));
      renderDetail();
      return;
    }
    roles.forEach(function (r) {
      var row = V.utils.el('div', {
        className: 'vshell-char-row' + (selectedName === r.name ? ' is-selected' : ''),
      });
      row.appendChild(makeThumb(r));
      row.appendChild(V.utils.el('span', { className: 'vshell-char-row-name' }, r.name));
      // v0.5.5 用户需求：不显示 kwcount 徽章
      // 删除按钮常驻显示（用户需求：不要悬停显示）
      row.appendChild(V.utils.el('button', {
        className: 'vshell-char-row-del',
        type: 'button',
        title: '删除角色',
        'aria-label': '删除 ' + r.name,
        onclick: function (e) {
          e.stopPropagation();
          V.characters.remove(r.name);           // 触发 onChange → 联动刷新
          if (selectedName === r.name) selectedName = null;
          rerender();
        },
        // v0.5.6：codicon 放内部 span（按钮自身带 codicon 类会吃到基类 16px 字号
        // ——同 kwchip 删除钮方案；icon 继承按钮 font-size 10px）
      }, V.utils.el('span', { className: 'codicon codicon-close' })));
      row.addEventListener('click', function () {
        selectedName = r.name;
        renderList();
        renderDetail();
      });
      listBox.appendChild(row);
    });
    renderDetail();
  }

  /** 列表 + 详情一起刷新 */
  function rerender() {
    if (!listBox || !mainBox) return;
    renderList();
  }

  /** 打开面板（挂到 .vshell-app 下）：VS Code Modern 两栏（用户拍板方案 B） */
  function open(appRoot) {
    if (panel) return;
    var host = appRoot || document.querySelector('.vshell-app') || document.body;

    var overlay = V.utils.el('div', { className: 'vshell-modal-backdrop' });
    var box = V.utils.el('div', { className: 'vshell-modal vshell-tag-modal vshell-char-panel' });

    // 头部：图标 + 标题（v0.5.5：右上角 x 已删——关闭走底部完成/点外部）
    var head = V.utils.el('div', { className: 'vshell-char-head' }, [
      V.utils.el('span', { className: 'codicon codicon-tag' }),
      V.utils.el('span', { className: 'vshell-char-title' }, '角色管理'),
    ]);
    box.appendChild(head);

    // 添加行：输入框 + 添加按钮（新角色插到列表最上面并自动选中）
    function doAdd() {
      var v = input.value.trim();
      if (!v) return;
      // 注意：characters.add 接受对象（normalize 拒绝字符串）——keywords 缺省 = [name]
      if (V.characters.add({ name: v, icon: '', keywords: [] })) V.toast.ok('已添加角色：' + v);
      else V.toast.info('角色已存在：' + v);
      selectedName = v;
      input.value = '';
      input.focus();
      rerender();
    }
    var input = V.utils.el('input', {
      className: 'vshell-tag-input',
      type: 'text',
      placeholder: '添加角色…',
      'aria-label': '新角色名',
      onkeydown: function (e) { if (e.key === 'Enter') doAdd(); },
    });
    var addBtn = V.utils.el('button', {
      className: 'vshell-btn vshell-btn-primary vshell-tag-add',
      type: 'button',
      title: '添加',
      'aria-label': '添加',
      onclick: doAdd,
    }, V.utils.el('span', { className: 'codicon codicon-add' }));

    // 左列表 + 右详情
    listBox = V.utils.el('div', { className: 'vshell-char-list' });
    mainBox = V.utils.el('div', { className: 'vshell-char-main' });
    var side = V.utils.el('div', { className: 'vshell-char-side' }, [
      V.utils.el('div', { className: 'vshell-char-addrow' }, [input, addBtn]),
      listBox,
    ]);
    box.appendChild(V.utils.el('div', { className: 'vshell-char-body' }, [side, mainBox]));
    // v0.5.6 用户需求：完成按钮右下角（与其他浮窗统一 UI）——右上角 x 已删、
    // 右栏「设置图片/删除角色」按钮已删，关闭只走完成/点外部
    box.appendChild(V.utils.el('div', { className: 'vshell-tag-foot' }, [
      V.utils.el('button', {
        className: 'vshell-btn vshell-btn-primary',
        type: 'button',
        onclick: close,
      }, '完成'),
    ]));

    var offChars = V.characters.onChange(function () {
      // v0.6.42：词增删走局部重绘，跳过全量重建（防浮窗下方闪动）
      if (suppressRerender) return;
      rerender();
    });

    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    host.appendChild(overlay);
    panel = overlay;

    rerender();
    try { input.focus(); } catch (e) { /* noop */ }

    function close() {
      if (offChars) { try { offChars(); } catch (e) {} offChars = null; }
      listBox = null;
      mainBox = null;
      if (panel) { panel.remove(); panel = null; }
      V.charPanel._close = null;
      // v0.5.6 第十七轮需求 1（用户修正）：退出角色管理 → 回到**角色列表**
      // 浮窗——列表是管理的入口（a 页面 → 列表 → 管理），关闭管理后应
      // 回到列表而不是原页面/角色页（第十六轮曾 nav 角色页，用户纠正）
      if (V.charPicker && V.charPicker.list) {
        setTimeout(function () {
          try { V.charPicker.list(); } catch (e) { /* noop */ }
        }, 0);
      }
    }
    V.charPanel._close = close;
  }

  function close() {
    if (V.charPanel._close) { V.charPanel._close(); }
  }

  V.charPanel = {
    open: open,
    close: close,
    /** 测试钩子：直接以 dataURL 打开裁剪界面（harness 用，委托 char-editor） */
    _testCrop: function (dataUrl, roleName) {
      return V.charEditor ? V.charEditor._testCrop(dataUrl, roleName) : false;
    },
    /** 测试钩子：以 dataURL 打开背景图中心点界面（harness 用，委托 char-editor） */
    _testBannerPick: function (dataUrl, roleName) {
      return V.charEditor ? V.charEditor._testBannerPick(dataUrl, roleName) : false;
    },
  };
})();
