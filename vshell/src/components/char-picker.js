/* ============================================================
 * char-picker — 角色选择弹窗（v0.5.0 角色系统；v0.5.4 草稿模式重构；
 * v0.6.30 多角色重构——冲突机制废弃，一个视频可属多个角色）
 *
 * 入口（复用 .vshell-modal 弹窗体系）：
 * 1) edit(videoId, title, headTitle?, meta?, srcId?)——手动管理（唯一入口）：
 *    全部角色列表；**手动名单**多选 toggle（is-current 高亮），自动角色
 *    灰显「自动」徽标（点击转手动）；完成 → setManual 整体提交
 * 2) list()——角色列表（v0.5.6 第十一轮，用户需求 1）：
 *    导航栏「角色」按钮入口——两列长条（背景图），右上角「打开角色
 *    管理」按钮，每角色右侧关注按钮；点击长条进角色主页
 * （conflict 冲突弹窗 v0.6.30 删除——命中多个角色全部自动赋予）
 *
 * v0.5.4 草稿模式：点击角色行只改**草稿高亮**，不写 store、不退出；
 * 退出方式只有三种：点「完成」（保存退出）、点浮窗外区域（保存退出）、
 * 点「回退」（放弃草稿、不保存、弹窗继续）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var panel = null;   // 当前打开的 backdrop

  /** 缩略图（有 icon 显示图片；无 icon 白底+首字；加载失败同样回退） */
  function makeThumb(c) {
    var box = V.utils.el('span', { className: 'vshell-tag-thumb' });
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

  /** 角色长条（v0.5.6 第十一轮重设计）：背景 = 角色背景图 + 暗渐变遮罩，
   *  左侧头像 + 名称；opts.follow → 右侧关注按钮（角色列表浮窗）。
   *  外层用 div（内含关注 button——button 不能嵌套）；
   *  点击整行 = opts.onClick（选择草稿 / 进角色主页） */
  function charRow(c, onClick, opts) {
    opts = opts || {};
    var row = V.utils.el('div', {
      className: 'vshell-tag-row',
      role: 'button',
      tabindex: 0,
      title: opts.title || '',
      onclick: onClick,
    });
    // 背景图：自定义 banner 优先，无则默认手绘 SVG（charBanners）
    var bg = c.banner || (V.charBanners && V.charBanners.bannerFor(c.name));
    if (bg) {
      row.style.backgroundImage =
        'linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.78)), url("' + bg + '")';
      row.style.backgroundSize = 'cover';
      row.style.backgroundPosition = 'center';
    }
    row.appendChild(makeThumb(c));
    row.appendChild(V.utils.el('span', { className: 'vshell-tag-row-name' }, c.name));
    if (opts.follow) {
      var followed = V.characters && V.characters.isFollowed
        ? V.characters.isFollowed(c.name) : false;
      // v0.5.6 第二十一轮需求 3：右上角红圆点（已关注；样式同视频卡收藏
      // 圆点 .is-fav——errorForeground 小圆点）——is-on 控制显隐
      var dot = V.utils.el('span', {
        className: 'vshell-tag-followed-dot' + (followed ? ' is-on' : ''),
        title: followed ? '已关注' : '',
      });
      var fb = V.utils.el('button', {
        className: 'vshell-tag-follow' + (followed ? ' is-followed' : ''),
        type: 'button',
        title: followed ? '取消关注' : '关注',
        'aria-label': followed ? '取消关注' : '关注',
        onclick: function (e) {
          e.stopPropagation();
          var on = V.characters.toggleFollow(c.name);
          fb.classList.toggle('is-followed', on);
          fb.title = on ? '取消关注' : '关注';
          var ic = fb.querySelector('.codicon');
          if (ic) ic.className = 'codicon ' + (on ? 'codicon-check' : 'codicon-add');
          // v0.5.6 第二十一轮需求 3：红点同步（关注状态变化即时刷新）
          dot.classList.toggle('is-on', on);
          dot.title = on ? '已关注' : '';
          // v0.5.6 第十二轮需求 3：点击 pop 动画（背景色不变）
          fb.classList.remove('is-popping');
          void fb.offsetWidth;
          fb.classList.add('is-popping');
          V.toast.info(on ? ('已关注角色：' + c.name) : ('已取消关注：' + c.name));
          // v0.5.6 第二十一轮需求 3：关注后立即置顶重排（列表重建，红点/顺序同步）
          if (opts.onFollowed) opts.onFollowed(on);
        },
      }, [V.utils.el('span', {
        className: 'codicon ' + (followed ? 'codicon-check' : 'codicon-add'),
      })]);
      row.appendChild(dot);
      row.appendChild(fb);
    }
    return row;
  }

  /** 弹窗骨架：标题（+可选 headerRight 元素）+ sub + 内容容器 + 底部按钮组。
   *  v0.5.4：外部点击（overlay）= 保存退出（closeFn 由调用方传入保存逻辑）
   *  v0.5.5：Fluent Dialog 重设计——Smoke 遮罩 blur、8px 圆角、
   *  完成主按钮右下角（.vshell-tag-foot 内 .vshell-btn-primary margin-left:auto）
   *  v0.5.6 第十一轮：headerRight（如「打开角色管理」按钮）挂标题行右侧 */
  function build(title, subText, bodyEl, footBtns, closeFn, headerRight) {
    // v0.5.6 第十三轮需求 7：全屏下浮窗必须挂**全屏元素内**——原生
    // fullscreen 走 top layer，backdrop 挂 body 会被全屏元素盖住（"全屏
    // 下不显示浮窗"）；sim 类（.is-feed-fullscreen-sim）同理。挂全屏
    // 元素内 → 浮窗显示且**保持全屏状态**（用户不要退出全屏才显示）
    var fsEl = document.fullscreenElement
      || document.querySelector('.vshell-feed.is-feed-fullscreen-sim');
    var host = fsEl || document.querySelector('.vshell-app') || document.body;
    var overlay = V.utils.el('div', {
      className: 'vshell-modal-backdrop vshell-picker-backdrop',
    });
    var box = V.utils.el('div', {
      className: 'vshell-modal vshell-tag-modal vshell-char-picker',
    });
    var titleRow = V.utils.el('div', { className: 'vshell-modal-title-row' }, [
      V.utils.el('div', { className: 'vshell-modal-title' }, title),
    ]);
    if (headerRight) titleRow.appendChild(headerRight);
    box.appendChild(titleRow);
    if (subText) box.appendChild(V.utils.el('div', { className: 'vshell-modal-sub' }, subText));
    box.appendChild(bodyEl);
    if (footBtns && footBtns.length) {
      box.appendChild(V.utils.el('div', { className: 'vshell-tag-foot' }, footBtns));
    }
    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeFn();   // 点浮窗外 = 保存退出（v0.5.4）
    });
    host.appendChild(overlay);
    panel = overlay;
    return overlay;
  }

  function close() {
    if (panel) { panel.remove(); panel = null; }
  }

  /** 底部按钮工厂（v0.5.4 三件套；v0.5.6 第六轮文案：回退 secondary /
   *  重置 secondary（仅手动）/ 完成 primary） */
  function footBtn(label, cls, onClick) {
    return V.utils.el('button', {
      className: 'vshell-btn ' + cls,
      type: 'button',
      onclick: onClick,
    }, label);
  }

  /** 冲突处理——v0.6.30 废弃（无冲突概念，一个视频可属多个角色）。
   *  charFor 命中多个 → 全部自动赋予；旧调用方（video-card/feed/detail
   *  的 is-conflict 分支）已随多角色改造移除。保留空实现防外部引用崩。 */
  function conflict() { /* noop */ }

  /** 手动更改（草稿模式 v0.5.4；v0.6.30 多角色重构）：
   *  - 草稿 = **手动角色名单**（数组，可多选）：点击行 toggle 加入/移出
   *  - 自动角色（已拥有但不在手动名单）显示灰色「自动」徽标，点击 = 转手动
   *  - 完成 → setManual(整体提交手动名单)——原自动角色保留不因编辑消失
   *  - 全部取消选中 = 移除全部手动角色（自动角色若存在仍保留）
   *  headTitle 可选（默认'更改角色'；无角色场景传'添加角色'）
   *  v0.5.6 第六轮：按钮文案「还原」→「回退」、「还原角色」→「重置」
   *  meta（视频快照）可选——setManual 时写入角色主页「手动添加」列表
   *  v0.5.7 多源：srcId = 视频归属源——角色列表 = 并集（list()）；
   *  跨源添加（目标源无同名角色）自动在目标源建立副本（ensureRoleOn） */
  function edit(videoId, title, headTitle, meta, srcId) {
    if (panel) close();
    var src = srcId || null;
    var currentManual = V.characters && V.characters.getManual
      ? V.characters.getManual(videoId, src) : [];     // 手动名单（打开时）
    var allOwned = V.characters ? V.characters.getChar(videoId, src) : null;  // 全部角色（含自动）
    var draft = currentManual.slice();                 // 草稿（手动名单）
    var list = V.utils.el('div', { className: 'vshell-tag-list vshell-char-list' });

    function renderList() {
      list.innerHTML = '';
      var chars = V.characters ? V.characters.list() : [];
      if (!chars.length) {
        list.appendChild(V.utils.el('div', { className: 'vshell-modal-sub' },
          '还没有角色——先到导航栏「角色」添加'));
        return;
      }
      chars.forEach(function (c) {
        var on = draft.indexOf(c.name) >= 0;
        var isAuto = allOwned && allOwned.indexOf(c.name) >= 0 && !on;
        var row = charRow(c, function () {
          // v0.5.4：只改草稿，不 setManual、不退出（v0.6.30 多选 toggle）
          var i = draft.indexOf(c.name);
          if (i >= 0) draft.splice(i, 1); else draft.push(c.name);
          renderList();
        }, { title: on ? '取消选中' : (isAuto ? '转为手动角色：' + c.name : '选择角色：' + c.name) });
        if (on) row.classList.add('is-current');
        if (isAuto) {
          row.classList.add('is-auto');
          row.appendChild(V.utils.el('span', {
            className: 'vshell-tag-row-auto',
            title: '自动赋予的角色（播放满 5s 后自动转手动）',
          }, '自动'));
        }
        list.appendChild(row);
      });
    }
    renderList();

    function applyAndClose() {
      if (!V.characters) { close(); return; }
      var changed = draft.length !== currentManual.length
        || draft.some(function (n) { return currentManual.indexOf(n) < 0; });
      if (changed) {
        V.characters.setManual(videoId, draft, meta, src);
        V.toast.ok(draft.length ? ('已设置角色：' + draft.join('、')) : '已移除角色');
      }
      close();
    }

    var footBtns = [footBtn('回退', 'vshell-btn-secondary', function () {
      draft = currentManual.slice();   // 放弃草稿：回打开时的手动名单，不保存、不退出
      renderList();
    })];
    // v0.5.6 用户需求：去除「移除角色」按钮（想移除 = 点击当前角色行取消选中）
    // v0.5.6 第五轮：**重置**——仅手动指定时显示——去除手动指定，自然重评
    if (V.characters && V.characters.isManual && V.characters.isManual(videoId, src)) {
      footBtns.unshift(footBtn('重置', 'vshell-btn-secondary', function () {
        if (V.characters.unassign) {
          V.characters.unassign(videoId, title, src);
          V.toast.info('已重置为自然匹配');
        }
        close();
      }));
    }
    footBtns.push(footBtn('完成', 'vshell-btn-primary', applyAndClose));

    build(headTitle || '更改角色', null, list, footBtns, applyAndClose);
    V.charPicker._close = applyAndClose;
  }

  /** 角色列表（v0.5.6 第十一轮，用户需求 1）：导航栏「角色」按钮入口。
   *  两列长条（背景图）+ 右上角「打开角色管理」按钮 + 每角色右侧关注
   *  按钮；点击长条 → 角色主页（统一进入方式）；空态引导添加 */
  function list() {
    if (panel) close();
    var listEl = V.utils.el('div', { className: 'vshell-tag-list vshell-char-list vshell-char-list2' });
    var manageBtn = V.utils.el('button', {
      className: 'vshell-btn vshell-btn-secondary vshell-char-manage',
      type: 'button',
      title: '打开角色管理',
      'aria-label': '打开角色管理',
      onclick: function () {
        close();
        if (V.charPanel && V.charPanel.open) V.charPanel.open();
      },
    }, [
      V.utils.el('span', { className: 'codicon codicon-gear' }),
      V.utils.el('span', {}, '角色管理'),
    ]);

    function renderRows() {
      listEl.innerHTML = '';
      var chars = V.characters ? V.characters.list() : [];
      if (!chars.length) {
        listEl.appendChild(V.utils.el('div', { className: 'vshell-modal-sub' },
          '还没有角色——点击右上角「角色管理」添加'));
        return;
      }
      // v0.5.6 第二十一轮需求 3：**已关注角色置顶**（保持组内原有顺序）
      var followed = [], rest = [];
      chars.forEach(function (c) {
        if (V.characters.isFollowed && V.characters.isFollowed(c.name)) followed.push(c);
        else rest.push(c);
      });
      var ordered = followed.concat(rest);
      ordered.forEach(function (c) {
        var row = charRow(c, function () {
          close();
          V.router.nav('/role/' + encodeURIComponent(c.name));
        }, { title: '进入角色主页：' + c.name, follow: true, onFollowed: renderRows });
        listEl.appendChild(row);
      });
    }
    renderRows();
    build('角色列表', null, listEl, [], close, manageBtn);
    V.charPicker._close = close;
  }

  V.charPicker = {
    conflict: conflict,
    edit: edit,
    list: list,
    close: close,
  };
})();
