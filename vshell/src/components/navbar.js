/* ============================================================
 * navbar — 顶部导航栏（全站共享）
 * 左：brand + 模式/布局 | 中：主页 icon + 搜索框 | 右：按钮组 + 设置
 * v0.5.6 用户需求：右侧按钮去中文只留图标（title/aria-label 承载语义）；
 *               新增设置按钮（最右端，打开设置面板浮窗）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var root = null;

  function render() {
    var nav = V.utils.el('nav', { className: 'vshell-navbar' });

    // 左：主页 icon（span 内嵌保证 flex 居中）
    var home = V.utils.el('a', {
      className: 'vshell-nav-home',
      href: '#/',
      title: '主页',
      'aria-label': '主页',
    }, [V.utils.el('span', { className: 'codicon codicon-home' })]);

    // 中：品牌 + 分区（桌面）
    var brand = V.utils.el('span', { className: 'vshell-nav-brand' }, [
      V.utils.el('span', { className: 'vshell-nav-brand-dot' }),
      V.utils.el('span', { className: 'vshell-nav-brand-text' }, 'VShell'),
      // 版本号：构建版本（meta.js V.version，与 app.html ?v=N 同步）
      V.utils.el('span', { className: 'vshell-nav-brand-ver' }, V.version || ''),
    ]);

    // 右：搜索框 = 多输入框胶囊编辑器（v0.3.26 重构，用户需求）：
    //   布局 = [输入框][胶囊][输入框][胶囊]...[输入框]——两两胶囊之间一个输入框、
    //   首胶囊前一个、末胶囊后一个；除最后一个输入框自适应宽度外，其余输入框
    //   宽度 = 胶囊间距（窄插入点，输入时自动扩展）
    //   - Enter：所有输入框内容 → 各生成一个胶囊放到对应输入框前；
    //     Ctrl 按下时不触发搜索（可连续封装），否则封装后跳聚合墙
    //   - Ctrl+Enter：只把当前输入框内容封装为胶囊放到当前输入框前
    //   - 输入框内光标前为空按 Backspace → 删除前一个胶囊；光标后为空按
    //     Delete → 删除后一个胶囊；删除后前后输入框内容合并（直接拼接 + 空格）
    var editor = V.utils.el('div', { className: 'vshell-st-editor' });
    // 胶囊在编辑器中删除（Backspace/Delete 键）→ 数据同步移除（幂等）
    new MutationObserver(function () {
      refreshEmptyState();
      var ks = V.searchTags ? V.searchTags.list() : [];
      ks.forEach(function (kw) {
        var q = '.vshell-st-chip[data-kw="' + kw.replace(/"/g, '\\"') + '"]';
        if (!editor.querySelector(q)) {
          if (V.searchTags) V.searchTags.remove(kw);
        }
      });
    }).observe(editor, { childList: true, subtree: true });
    // 聚焦状态（focusin/focusout 冒泡）：is-focused 类驱动占位隐藏 + 面板展开
    editor.addEventListener('focusin', function () {
      editor.classList.add('is-focused');
      openTagPop();
    });
    editor.addEventListener('focusout', function () {
      editor.classList.remove('is-focused');
      setTimeout(function () {
        // v0.3.41 修复：点击浮层内元素（搜索按钮/清空按钮/空白/tag）会让
        // input 失焦 → focusout → 误关浮层（用户反馈：点击搜索框后浮窗消失）。
        // 守卫：焦点仍落在浮层内 → 不关闭（点击浮层外才会关）
        if (popover && popover.contains(document.activeElement)) return;
        closeTagPop();
      }, 120);
    });
    // 点击胶囊 → 焦点移到其后的输入框（光标末尾；其后可能是 6px 盒子 → 取盒内 input）；
    // v0.3.60 用户需求：点击未展开搜索框的其它区域（空白/padding/胶囊缝隙）→
    // 按点击位置（水平距离）决定焦点转移到哪个输入框
    editor.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var chip = t.closest('.vshell-st-chip');
      if (chip) {
        e.preventDefault();
        var after = chip.nextElementSibling;
        if (after && isInputLike(after)) {
          var target = inputOf(after);
          target.focus();
          target.setSelectionRange(target.value.length, target.value.length);
        }
        return;
      }
      if (isInputLike(t)) return;   // 直接点击输入框 → 浏览器默认聚焦
      var inputs = editor.querySelectorAll('.vshell-st-input');
      if (!inputs.length) return;
      var x = e.clientX;
      var best = null, bestD = Infinity;
      for (var i = 0; i < inputs.length; i++) {
        var r = inputs[i].getBoundingClientRect();
        var d = Math.abs((r.left + r.width / 2) - x);
        if (d < bestD) { bestD = d; best = inputs[i]; }
      }
      if (best) {
        best.focus();
        best.setSelectionRange(best.value.length, best.value.length);
      }
    });

    /** 文本真实渲染宽度（canvas measureText，v0.3.31）——旧估算（中文 13/
     *  ASCII 7）对宽字符（大写字母等）低估 → 内容比 input 宽被裁剪（用户反馈）；
     *  字体取首个输入框的 computed font（12px 继承体），缓存 ctx */
    function textW(s) {
      if (!textW.ctx) {
        textW.ctx = document.createElement('canvas').getContext('2d');
        var probe = document.querySelector('.vshell-st-input');
        textW.ctx.font = probe ? getComputedStyle(probe).font : '12px sans-serif';
      }
      return textW.ctx.measureText(s).width;
    }
    /** 是否为输入框或输入框盒子（编辑器子元素层级的"输入位"） */
    function isInputLike(el) {
      return !!el && (el.tagName === 'INPUT' || (el.classList && el.classList.contains('vshell-st-box')));
    }
    /** 从输入位（input 或盒子）取 input 元素 */
    function inputOf(el) {
      return el.tagName === 'INPUT' ? el : el.querySelector('input');
    }
    /** 输入位在编辑器层级上的自身（input 在盒子内 → 返回盒子；直接子元素 → 自身） */
    function meOf(inp) {
      return inp.parentNode === editor ? inp : inp.parentNode;
    }
    /** 创建输入框（v0.3.29：统一包盒子——左右 padding 3px；末尾盒子 flex:1
     *  且盒内 input 占满全宽；中间盒子 input 默认 0 宽居中、输入时 JS 扩展；
     *  点击盒子 → 聚焦 input——存在感最低，盒子即胶囊间空隙） */
    function makeInput(isLast) {
      var inp = V.utils.el('input', {
        className: 'vshell-st-input' + (isLast ? ' is-last' : ''),
        type: 'text',
        spellcheck: 'false',
        'aria-label': '搜索关键词',
      });
      inp.addEventListener('keydown', onInputKeydown);
      inp.addEventListener('input', function () {
        if (this.classList.contains('is-last')) return;
        // +2px 余量（caret + 防裁剪）
        this.style.width = this.value === '' ? '' : (Math.max(8, Math.ceil(textW(this.value)) + 2) + 'px');
        refreshEmptyState();
      });
      var box = V.utils.el('span', { className: 'vshell-st-box' + (isLast ? ' is-last' : '') });
      box.appendChild(inp);
      box.addEventListener('click', function () {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      });
      return box;
    }
    /** 删除胶囊并合并前后输入框内容（空格连接）——Backspace/Delete 键与
     *  悬停 × 按钮共用同一逻辑：合并进**后框**（无后框则前框），删前框；
     *  后框为 is-last 时保留（末尾自适应框必须存在）。删前框+删胶囊后
     *  交替布局依然成立（胶囊前仍有输入框）。el = 胶囊或胶囊内删除钮 */
    function removeChipWithMerge(el) {
      var chip = el && el.classList && el.classList.contains('vshell-st-chip')
        ? el : (el && el.parentElement);
      if (!chip || !chip.classList || !chip.classList.contains('vshell-st-chip')) return;
      var front = chip.previousElementSibling;
      var after = chip.nextElementSibling;
      var frontInp = (front && isInputLike(front)) ? inputOf(front) : null;
      var afterInp = (after && isInputLike(after)) ? inputOf(after) : null;
      var merged = [frontInp ? frontInp.value : '', afterInp ? afterInp.value : ''].filter(Boolean).join(' ');
      var target = null;
      if (afterInp) {
        afterInp.value = merged;
        target = afterInp;
        if (front) front.remove();
      } else if (frontInp) {
        frontInp.value = merged;
        target = frontInp;
      }
      chip.remove();
      if (target) {
        target.focus();
        target.setSelectionRange(target.value.length, target.value.length);
        if (!target.classList.contains('is-last')) {
          target.style.width = target.value === '' ? '' : (Math.max(8, Math.ceil(textW(target.value)) + 2) + 'px');
        }
      }
      refreshEmptyState();
    }
    /** 输入框按键：Enter 封装（全量/当前）、Backspace/Delete 删相邻胶囊并合并 */
    function onInputKeydown(e) {
      var inp = e.currentTarget;
      if (e.key === 'Enter') {
        // Ctrl 判定时机（用户需求）：在【按下 Enter 的同一瞬间】采样修饰键；
        // 按住 Enter 不放的自动重复（Ctrl 往往已先松开）必须忽略
        if (e.repeat) return;
        e.preventDefault();
        var ctrl = !!(e.ctrlKey || e.metaKey);   // ← 采样时刻 = 本次 Enter 按下
        handleEnter(ctrl, inp);
        return;
      }
      if (e.key === 'Backspace' && inp.selectionStart === 0 && inp.selectionEnd === 0) {
        // 光标前为空 → 删除前一个胶囊；前后输入框内容合并（空格连接）
        var me = meOf(inp);
        var prev = me.previousElementSibling;
        if (prev && prev.classList.contains('vshell-st-chip')) {
          e.preventDefault();
          removeChipWithMerge(prev);
        }
        return;
      }
      if (e.key === 'Delete' && inp.selectionStart === inp.value.length && inp.selectionEnd === inp.value.length) {
        // 光标后为空 → 删除后一个胶囊；前后输入框内容合并（空格连接）
        var meD = meOf(inp);
        var next = meD.nextElementSibling;
        if (next && next.classList.contains('vshell-st-chip')) {
          e.preventDefault();
          removeChipWithMerge(next);
        }
        return;
      }
      // v0.3.27：方向键跨输入框移动——光标在最前按左 → 前一个输入框（跨过胶囊），
      // 光标在最后按右 → 后一个输入框
      if (e.key === 'ArrowLeft' && inp.selectionStart === 0 && inp.selectionEnd === 0) {
        var prevInp = meOf(inp).previousElementSibling;
        while (prevInp && !isInputLike(prevInp)) prevInp = prevInp.previousElementSibling;
        if (prevInp) {
          e.preventDefault();
          var pTarget = inputOf(prevInp);
          pTarget.focus();
          pTarget.setSelectionRange(pTarget.value.length, pTarget.value.length);
        }
        return;
      }
      if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length && inp.selectionEnd === inp.value.length) {
        var nextInp = meOf(inp).nextElementSibling;
        while (nextInp && !isInputLike(nextInp)) nextInp = nextInp.nextElementSibling;
        if (nextInp) {
          e.preventDefault();
          var nTarget = inputOf(nextInp);
          nTarget.focus();
          nTarget.setSelectionRange(0, 0);
        }
        return;
      }
    }
    /** 封装：胶囊插入输入框前；若输入框前不是输入框（容器起点/胶囊相邻），
     *  先补一个窄输入框盒子——保证布局「首胶囊前、两两之间、末胶囊后」各有输入框 */
    function wrapInput(inp, kw) {
      var me = meOf(inp);
      var prev = me.previousElementSibling;
      if (!prev || !isInputLike(prev)) {
        editor.insertBefore(makeInput(false), me);
      }
      editor.insertBefore(makeChip(kw), me);
    }
    /** 空态类：无胶囊且所有输入框无可见文本 → 显示 placeholder */
    function refreshEmptyState() {
      var hasChip = !!editor.querySelector('.vshell-st-chip');
      var hasText = false;
      Array.prototype.forEach.call(editor.querySelectorAll('.vshell-st-input'), function (i) {
        if (i.value.replace(/[\s\u200B]/g, '') !== '') hasText = true;
      });
      editor.classList.toggle('is-empty', !hasChip && !hasText);
    }
    /** 创建胶囊元素（contenteditable=false）。
     *  v0.3.25：不再渲染 × 删除钮——删除只能用退格/Delete（Blink 会删
     *  contenteditable=false 元素，MutationObserver 同步移除数据——用户需求） */
    /** 胶囊（v0.3.41 用户需求：悬停时右上角圆形删除按钮——压住胶囊边框，
     *  参考主流平台删除历史记录 UI；点击删除 = ST.remove → onChange →
     *  syncEditorChips 移除 DOM；mousedown preventDefault 防失焦） */
    function makeChip(kw) {
      var del = V.utils.el('button', {
        className: 'vshell-st-chip-del',
        title: '删除标签：' + kw,
        'aria-label': '删除标签',
        onmousedown: function (e) { e.preventDefault(); },
        onclick: function (e) {
          e.stopPropagation();
          // 悬停 × 删除：与 Backspace/Delete 一致——先合并前后输入框内容
          // （空格连接）再删胶囊、同步数据（v0.5.6 补齐：此前只 remove 数据）
          removeChipWithMerge(this);
          if (V.searchTags) V.searchTags.remove(kw);
        },
      }, V.utils.el('span', { className: 'codicon codicon-close' }));
      return V.utils.el('span', {
        className: 'vshell-st-chip',
        contenteditable: 'false',
        'data-kw': kw,
        title: kw,
      }, [
        V.utils.el('span', { className: 'vshell-st-chip-name' }, kw),
        del,
      ]);
    }
    /** 编辑器内胶囊与 searchTags 列表同步：列表没有的胶囊移除（面板删除/清空来源） */
    function syncEditorChips() {
      var ks = V.searchTags ? V.searchTags.list() : [];
      Array.prototype.slice.call(editor.querySelectorAll('.vshell-st-chip')).forEach(function (chip) {
        if (ks.indexOf(chip.getAttribute('data-kw')) === -1) chip.remove();
      });
    }
    /** 初始填充：已存在的搜索标签渲染为胶囊；布局 = 交替 [窄输入][胶囊]... + 末尾自适应输入框 */
    function seedEditor() {
      var ks = V.searchTags ? V.searchTags.list() : [];
      ks.forEach(function (kw) {
        editor.appendChild(makeInput(false));
        editor.appendChild(makeChip(kw));
      });
      editor.appendChild(makeInput(true));
      refreshEmptyState();
    }
    /** Enter 语义（v0.3.42 用户需求：搜索按钮按下 = 单独按 Enter）：
     *  ctrl=false → 全量封装所有输入框的自由文本为胶囊 + 跳聚合搜索；
     *  ctrl=true  → 只封装当前输入框（不跳转）。键盘与按钮共用同一实现。 */
    function handleEnter(ctrl, inp) {
      var list = ctrl
        ? [inp]
        : Array.prototype.slice.call(editor.querySelectorAll('.vshell-st-input'));
      list.forEach(function (it) {
        if (!it) return;
        var kw = it.value.trim();
        if (!kw) return;
        wrapInput(it, kw);            // 先插胶囊（onChange 补齐查重 → 不重复插）
        var added = V.searchTags.add(kw);
        it.value = '';
        if (!it.classList.contains('is-last')) it.style.width = '';
        if (added) V.toast.ok('已添加搜索标签：' + kw);
        else V.toast.info('搜索标签已存在：' + kw);
      });
      if (!ctrl) {
        V.router.nav('/tagsearch');
        editor.blur();
      }
    }
    /** 搜索按钮（v0.3.42）：按下 = 单独按 Enter——封装自由文本 + 跳聚合搜索。
     *  不再走 doSearch（普通检索 /search?q=），与键盘行为完全一致 */
    function doSearch() {
      var active = document.activeElement;
      var inp = (active && active.classList && active.classList.contains('vshell-st-input'))
        ? active
        : editor.querySelector('.vshell-st-input.is-last');
      handleEnter(false, inp);
    }
    /** 搜索标签面板（v0.3.41 用户拍板：放弃拼接，走覆盖路线）：
     *  聚焦搜索框 → 弹出整体浮层（.vshell-nav-popover）覆盖原搜索框位置——
     *  编辑器 + 清空/分隔/搜索按钮移入浮层头部（DOM 移动保留事件绑定与焦点），
     *  tag 快捷列表在浮层 body；关闭时全部移回搜索框，浮层移除。
     *  一个完整卡片（surface-background 底 + sideBar-border 框 + shadow-lg），
     *  无拼接边界，无分割线问题 */
    var tagPop = null;
    var popover = null;
    var popTimer = null;
    function openTagPop() {
      if (popover) {
        // v0.3.41 用户需求：消失动画期间重新聚焦 → 取消消失（浮层重新可见）
        if (popover.__leaving) {
          popover.__leaving = false;
          popover.classList.remove('vshell-nav-popover-leaving');
          if (popTimer) { clearTimeout(popTimer); popTimer = null; }
        }
        return;
      }
      // v0.3.41 修复（CDP 实测复现）：创建浮层时若焦点在 input（用户正在点击
      // 搜索框），下面 head.appendChild(editor) 会让 input 短暂脱离文档 →
      // 浏览器触发 blur/focusout → 120ms 后浮层被误关。先记录焦点归属，
      // 移动完成后重新聚焦（focusin → openTagPop guard 已存在，不会重开；
      // focusout 守卫看到 activeElement 在浮层内 → 不关闭）
      var hadFocus = editor.contains(document.activeElement);
      // v0.3.61 用户反馈：未展开点击搜索框时焦点总跳到第一个输入框——
      // 恢复焦点必须记住具体是哪个输入框（点击末尾框/胶囊后邻框都各自保持）
      var focusedInp = hadFocus && document.activeElement && document.activeElement.tagName === 'INPUT'
        ? document.activeElement : null;
      // 创建浮层（挂 searchBox 下，absolute 覆盖其位置）
      popover = V.utils.el('div', { className: 'vshell-nav-popover' }, [
        V.utils.el('div', { className: 'vshell-nav-popover-head' }),
        V.utils.el('div', { className: 'vshell-nav-popover-body' }),
      ]);
      searchBox.appendChild(popover);
      // 编辑器 + 清空移入浮层头部（焦点跟随、事件不丢）；v0.3.48 搜索按钮
      // 在头部最右（与搜索框等高）；v0.3.54 用户需求：去除内搜索框外包盒子
      // （.vshell-popover-searchbox）——控件直接放 head，背景由卡片提供
      var head = popover.querySelector('.vshell-nav-popover-head');
      head.appendChild(editor);
      head.appendChild(clearBtn);
      head.appendChild(divider);     // v0.3.62：清空与搜索按钮之间恢复竖分割线
      head.appendChild(searchBtn);
      // 移动完成后恢复焦点（若原本在编辑器内）——恢复原输入框而非首个
      if (hadFocus) {
        var inp = focusedInp || editor.querySelector('.vshell-st-input');
        if (inp) inp.focus();
      }
      // tag 快捷列表（v0.3.24：面板内任何 mousedown 阻止默认行为——防失焦关闭）
      tagPop = V.utils.el('div', { className: 'vshell-nav-tagpop' });
      tagPop.addEventListener('mousedown', function (e) { e.preventDefault(); });
      renderTagPop();
      popover.querySelector('.vshell-nav-popover-body').appendChild(tagPop);
      // v0.3.41 修复：浮层内点击 input 之外的元素（搜索/清空按钮、空白）时
      // mousedown 默认把焦点抢到可聚焦元素 → input 失焦 → focusout 误关浮层。
      // 委托：input 允许聚焦（正常输入），其余一律阻止默认（焦点保持 input）
      popover.addEventListener('mousedown', function (e) {
        if (e.target && e.target.closest && e.target.closest('.vshell-st-input')) return;
        e.preventDefault();
      });
    }
    function closeTagPop() {
      if (!popover) return;
      if (popover.__leaving) return;   // 已在消失动画中
      // v0.3.41 用户需求：消失动画——先播 leaving（140ms 淡出上移），
      // 动画结束后移回元素并移除浮层；动画期间重新聚焦（openTagPop）
      // 会取消消失
      popover.__leaving = true;
      popover.classList.add('vshell-nav-popover-leaving');
      popTimer = setTimeout(finishClosePop, 150);
    }
    function finishClosePop() {
      popTimer = null;
      if (!popover) return;
      // 元素移回搜索框（保持原顺序 [editor][clearBtn][divider][searchBtn]）：
      // editor 插到 searchBox 首位——参考节点用 firstChild（浮层自身，必然在
      // 容器内），杜绝 insertBefore 抛 NotFoundError（clearBtn 可能不在
      // searchBox 的状态错位）；clear/divider/searchBtn 依次 append 到末尾
      try {
        if (editor.parentNode !== searchBox) searchBox.insertBefore(editor, searchBox.firstChild);
        [clearBtn, divider, searchBtn].forEach(function (el) {
          if (el && el.parentNode !== searchBox) searchBox.appendChild(el);
        });
      } catch (e) {
        // 容错兜底：尽力恢复，绝不让浮层残留
        try { searchBox.appendChild(editor); } catch (e2) {}
        [clearBtn, searchBtn].forEach(function (el) {
          try { if (el && el.parentNode !== searchBox) searchBox.appendChild(el); } catch (e3) {}
        });
      }
      popover.remove();
      popover = null;
      tagPop = null;
    }
    function renderTagPop() {
      if (!tagPop) return;
      tagPop.innerHTML = '';
      // v0.3.25：面板只显示角色快捷区——当前搜索胶囊只在搜索栏编辑器内
      // 展示（与自由文本共同布局，用户需求），不再在面板中重复列出
      // v0.5.0：标签 → 角色（V.characters）
      var tags = V.characters && V.characters.list ? V.characters.list() : [];
      var sec = V.utils.el('div', { className: 'vshell-nav-tagpop-sec' });
      if (!tags.length) {
        sec.appendChild(V.utils.el('div', { className: 'vshell-nav-tagpop-empty' },
          '暂无角色。可在导航栏「角色」面板中添加。'));
      } else {
        var tagList = V.utils.el('div', { className: 'vshell-nav-tagpop-list' });
        tags.forEach(function (t) {
          var name = (t && t.name) || String(t || '');
          var chip = V.utils.el('span', {
            className: 'vshell-nav-tagpop-chip',
            title: '添加为搜索胶囊：' + name,
          }, [
            V.utils.el('span', { className: 'codicon codicon-add vshell-nav-tagpop-addicon' }),
            V.utils.el('span', { className: 'vshell-nav-tagpop-chip-name' }, name),
          ]);
          chip.addEventListener('click', function () {
            if (!V.searchTags) return;
            if (V.searchTags.add(name)) V.toast.ok('已添加搜索标签：' + name);
            else V.toast.info('搜索标签已存在：' + name);
          });
          tagList.appendChild(chip);
        });
        sec.appendChild(tagList);
      }
      tagPop.appendChild(sec);
    }
    // 搜索标签变更 → 面板实时刷新 + 编辑器胶囊同步；
    // v0.3.26：无条件补齐缺失胶囊（quickAdd 点击底部 tag 时编辑器聚焦，
    // 原「未聚焦才补齐」条件导致搜索框内不显示——用户反馈）；
    // 新胶囊插在末尾自适应输入框前（维持输入框/胶囊交替布局）
    var offTagPop = V.searchTags ? V.searchTags.onChange(function () {
      renderTagPop();
      syncEditorChips();
      var ks = V.searchTags ? V.searchTags.list() : [];
      ks.forEach(function (kw) {
        var q = '.vshell-st-chip[data-kw="' + kw.replace(/"/g, '\\"') + '"]';
        if (!editor.querySelector(q)) {
          // v0.3.29：末尾输入框也在盒子内——参考节点用 meOf（盒子）而非 input
          var lastInp = editor.querySelector('.vshell-st-input.is-last');
          var lastPos = lastInp ? meOf(lastInp) : null;
          if (lastPos) {
            editor.insertBefore(makeInput(false), lastPos);
            editor.insertBefore(makeChip(kw), lastPos);
          } else {
            editor.appendChild(makeInput(false));
            editor.appendChild(makeChip(kw));
          }
        }
      });
      refreshEmptyState();
    }) : null;
    var searchBtn = V.utils.el('button', {
      className: 'vshell-nav-search-btn',
      title: '搜索',
      'aria-label': '搜索',
      onclick: doSearch,
    }, V.utils.el('span', { className: 'codicon codicon-search' }));
    // v0.3.25：清空按钮（×）+ VS Code Modern 分隔竖线——清空所有自由文本与胶囊；
    // mousedown 阻止默认（防编辑器失焦），点击后焦点留在编辑器
    var clearBtn = V.utils.el('button', {
      className: 'vshell-nav-clear',
      title: '清空搜索内容',
      'aria-label': '清空搜索内容',
      onmousedown: function (e) { e.preventDefault(); },
      onclick: clearEditor,
    }, V.utils.el('span', { className: 'codicon codicon-close' }));
    // v0.3.62 用户需求：清空按钮与搜索按钮之间恢复竖分割线（v0.3.48 曾移除）
    var divider = V.utils.el('span', { className: 'vshell-nav-divider' });
    /** 清空：所有搜索标签（数据 + 编辑器胶囊）与自由文本 */
    function clearEditor() {
      if (V.searchTags) V.searchTags.clear();   // onChange → 面板刷新 + 编辑器胶囊同步移除
      editor.innerHTML = '';                    // 清自由文本与胶囊 DOM
      editor.appendChild(makeInput(true));      // 重建唯一自适应输入框
      refreshEmptyState();
    }
    var searchBox = V.utils.el('div', { className: 'vshell-nav-search' }, [
      editor,
      clearBtn,
      divider,
      searchBtn,
    ]);
    seedEditor();

    // 右：待看/收藏
    // v0.5.6 用户需求：导航栏右侧按钮去除中文，只保留图标（语义走 title/aria-label）
    var watchBtn = V.utils.el('a', {
      className: 'vshell-nav-btn',
      href: '#/watchlist',
      title: '待看 / 收藏',
      'aria-label': '待看收藏',
    }, V.utils.el('span', { className: 'codicon codicon-bookmark' }));

    // 右：收藏（独立页 #/fav，用户需求：收藏与待看分开）
    var favBtn = V.utils.el('a', {
      className: 'vshell-nav-btn',
      href: '#/fav',
      title: '收藏',
      'aria-label': '收藏',
    }, V.utils.el('span', { className: 'codicon codicon-heart' }));

    // 右：角色列表（v0.1.9 tag 系统 → v0.5.0 角色化 →
    // v0.5.6 第十一轮：点击打开**角色列表**浮窗而非角色管理；管理入口在浮窗右上角）
    var tagBtn = V.utils.el('button', {
      className: 'vshell-nav-btn',
      title: '角色列表',
      'aria-label': '角色列表',
      onclick: function () {
        if (V.charPicker && V.charPicker.list) V.charPicker.list();
        else if (V.charPanel && V.charPanel.open) V.charPanel.open();
      },
    }, V.utils.el('span', { className: 'codicon codicon-tag' }));

    // 右：黑名单（v0.3.97 用户拍板：独立页面 #/blacklist，列表/墙/刷三视图）
    var blackBtn = V.utils.el('a', {
      className: 'vshell-nav-btn',
      href: '#/blacklist',
      title: '黑名单',
      'aria-label': '黑名单',
    }, V.utils.el('span', { className: 'codicon codicon-circle-slash' }));

    // 右：卡片布局切换（v0.3.36：标准网格 / 封面布局 自由选择，持久化）
    // 图标语义：显示「点击后的目标布局」——standard 时显示布局图标（codicon-layout），
    // cover 时显示封面媒体图标（codicon-file-media \eaea）——
    // v0.3.97 用户反馈 \ea8a(array) 与模式按钮重复，重新拟定四图标互斥：
    //   布局按钮：standard→layout \ebeb / cover→file-media \eaea
    //   模式按钮：feed→play-circle \eba6 / wall→array \ea8a
    function layoutIcon() { return V.wall.layout() === 'cover' ? 'codicon-file-media' : 'codicon-layout'; }
    function layoutTitle() { return V.wall.layout() === 'cover' ? '切换到标准布局' : '切换到封面布局'; }
    var layoutBtn = V.utils.el('button', {
      className: 'vshell-nav-btn vshell-nav-layout',
      type: 'button',
      title: layoutTitle(),
      'aria-label': layoutTitle(),
    }, [V.utils.el('span', { className: 'codicon ' + layoutIcon() })]);
    layoutBtn.addEventListener('click', function () {
      V.wall.toggleLayout();
      // 图标/提示随当前布局刷新（墙页经 V.wall.onLayoutChange 重渲染）
      var ic = layoutBtn.querySelector('.codicon');
      ic.className = 'codicon ' + layoutIcon();
      layoutBtn.setAttribute('title', layoutTitle());
      layoutBtn.setAttribute('aria-label', layoutTitle());
    });
    // 布局被外部改变（V.wall.setLayout / 未来功能）时同步按钮图标
    // （navbar 全局单例只渲染一次，订阅一次即可，无需注销）
    V.wall.onLayoutChange(function () {
      var ic = layoutBtn.querySelector('.codicon');
      ic.className = 'codicon ' + layoutIcon();
      layoutBtn.setAttribute('title', layoutTitle());
      layoutBtn.setAttribute('aria-label', layoutTitle());
    });

    // 右：本地视频（v0.5.6 第十二轮需求 2：批量导入本地视频数据源）
    var localBtn = V.utils.el('button', {
      className: 'vshell-nav-btn',
      type: 'button',
      title: '本地视频',
      'aria-label': '本地视频',
      onclick: function () {
        if (V.localPanel && V.localPanel.open) V.localPanel.open();
      },
    }, V.utils.el('span', { className: 'codicon codicon-file-media' }));

    // 右：下载管理
    var dlBtn = V.utils.el('a', {
      className: 'vshell-nav-btn',
      href: '#/downloads',
      title: '下载管理',
      'aria-label': '下载管理',
    }, V.utils.el('span', { className: 'codicon codicon-cloud-download' }));

    // 右：设置（v0.5.6 用户需求：导航栏右侧设置按钮，最右端；
    // v0.5.12 用户需求：设置不再浮窗 → 页面 #/settings）
    var settingsBtn = V.utils.el('a', {
      className: 'vshell-nav-btn vshell-nav-settings',
      href: '#/settings',
      title: '设置',
      'aria-label': '设置',
    }, V.utils.el('span', { className: 'codicon codicon-gear' }));

    // 中部组合（用户需求：主页按钮在搜索框左侧，整体居中）
    var center = V.utils.el('div', { className: 'vshell-nav-center' }, [
      home,
      searchBox,
    ]);

    // v0.3.97 用户需求：标题栏左侧新增「抖音刷 / 视频墙」全局模式切换按钮
    // （受影响页面：主页/搜索/待看/收藏/黑名单；统一默认墙——用户拍板）
    // 图标语义：显示「当前模式」——feed 显示播放流图标，wall 显示网格图标。
    // v0.3.97：feed 原用 codicon-list-flat——与布局按钮 standard 的 codicon-layout
    // 视觉重复（用户反馈）→ 换 codicon-play-circle（\eba6，短视频播放流语义）；
    // wall 用 codicon-array（\ea8a，网格；codicon-applications 在 0.0.46-30 集不存在）
    function modeIcon() { return V.viewMode.get() === 'feed' ? 'codicon-play-circle' : 'codicon-array'; }
    function modeTitle() {
      return V.viewMode.get() === 'feed' ? '当前：抖音刷视图（点击切换视频墙）' : '当前：视频墙视图（点击切换抖音刷）';
    }
    var modeBtn = V.utils.el('button', {
      className: 'vshell-nav-btn vshell-nav-mode',
      type: 'button',
      title: modeTitle(),
      'aria-label': modeTitle(),
    }, [V.utils.el('span', { className: 'codicon ' + modeIcon() })]);
    modeBtn.addEventListener('click', function () {
      if (!V.viewMode) return;
      V.viewMode.toggle();   // onChange → 各页重渲染
      var ic = modeBtn.querySelector('.codicon');
      ic.className = 'codicon ' + modeIcon();
      modeBtn.setAttribute('title', modeTitle());
      modeBtn.setAttribute('aria-label', modeTitle());
    });
    // 模式被外部改变时同步按钮图标 + 布局按钮显隐（v0.3.97 用户需求：
    // 抖音刷模式下布局按钮无意义 → 隐藏；墙模式恢复显示）
    function syncModeUI() {
      var ic = modeBtn.querySelector('.codicon');
      ic.className = 'codicon ' + modeIcon();
      modeBtn.setAttribute('title', modeTitle());
      modeBtn.setAttribute('aria-label', modeTitle());
      var isFeed = V.viewMode && V.viewMode.get() === 'feed';
      layoutBtn.style.display = isFeed ? 'none' : '';
    }
    if (V.viewMode) {
      V.viewMode.onChange(syncModeUI);
      syncModeUI();   // 初始状态（localStorage 可能已存 feed）
    }

    // v0.3.49 用户需求：布局/模式按钮放左端——v0.3.50 澄清：在 VShell logo
    // 的右边（brand 之后）；v0.5.6：深浅色按钮已移除（设置面板「主题」项
    // 承担切换，用户需求）→ 左端顺序 brand, mode, layout
    // 右端保持 待看/收藏/标签/黑名单/下载/设置
    // 移动端（responsive.css ≤768）：actions 整体移到底部工具条，
    // 顶部仅剩 mode/search/layout——用 actions 容器包住右端按钮
    var actions = V.utils.el('div', { className: 'vshell-nav-actions' });
    nav.appendChild(brand);
    nav.appendChild(modeBtn);
    nav.appendChild(layoutBtn);
    nav.appendChild(center);
    actions.appendChild(tagBtn);     // 用户需求：标签放到右侧第一个
    actions.appendChild(watchBtn);
    actions.appendChild(favBtn);
    actions.appendChild(blackBtn);
    actions.appendChild(localBtn);   // v0.5.6 第十二轮需求 2：本地视频导入入口
    actions.appendChild(dlBtn);
    actions.appendChild(settingsBtn); // v0.5.6 用户需求：设置按钮最右端
    nav.appendChild(actions);

    return nav;
  }

  function mount(container) {
    if (!root) {
      root = render();
      // 移动端工具条（.vshell-nav-actions）挂 body 直系：navbar 的
      // backdrop-filter 会创建 containing block，fixed 后代相对 navbar
      // 而非视口——用户反馈"工具条不在屏幕底部"的根因。桌面下 actions
      // 用 fixed top/right 0 对齐导航栏右端（视觉与原来一致）。
      var actions = root.querySelector('.vshell-nav-actions');
      if (actions) document.body.appendChild(actions);
      // 悬浮阴影：页面不处于顶端时加 .is-scrolled（用户需求：常驻无框线）
      // 页面在 .vshell-page 容器内滚动（滚动条附着内容区）——window.scrollY 恒 0，
      // 需读当前页面容器的 scrollTop；scroll 事件在捕获阶段可达 window。
      var onScroll = function () {
        var page = document.querySelector('.vshell-page');
        var y = page ? page.scrollTop : (window.scrollY || 0);
        root.classList.toggle('is-scrolled', y > 0);
      };
      window.addEventListener('scroll', onScroll, true);
      onScroll();
    }
    container.appendChild(root);
  }

  V.navbar = { mount: mount };
})();
