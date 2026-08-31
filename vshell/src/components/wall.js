/* ============================================================
 * wall — 视频墙共享件：网格容器 + 无限滚动哨兵 + 空状态 + 卡片布局
 * 布局（v0.3.36）：'standard' 标准（封面 + 底部文字区）| 'cover' 封面
 *   （图片占满卡片、标题浮封面顶部、日期在时长左侧、无 UP）
 *   用户可自由切换，持久化 store 键 'wallLayout'（默认 standard）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var LAYOUT_KEY = 'wallLayout';
  var LAYOUTS = { standard: 1, cover: 1 };
  var layoutListeners = [];

  /** 当前卡片布局（持久化；未知值回退 standard） */
  function layout() {
    var l = V.store.get(LAYOUT_KEY);
    return LAYOUTS[l] ? l : 'standard';
  }
  function setLayout(l) {
    if (!LAYOUTS[l] || l === layout()) return;
    V.store.set(LAYOUT_KEY, l);
    // 调试钩子：布局监听器数量（页面重渲染订阅）
    window.__VS_LAYOUT_LISTENERS__ = layoutListeners.length;
    layoutListeners.forEach(function (f) {
      try { f(l); } catch (e) { /* noop */ }
    });
  }
  function toggleLayout() {
    setLayout(layout() === 'standard' ? 'cover' : 'standard');
  }
  /** 订阅布局变更（页面重渲染用）；返回注销函数 */
  function onLayoutChange(fn) {
    layoutListeners.push(fn);
    return function () {
      var i = layoutListeners.indexOf(fn);
      if (i >= 0) layoutListeners.splice(i, 1);
    };
  }

  /** 网格容器（已含卡片）；items 为空 → 空状态（opts.empty === false 时不渲染
   *  空态——聚合墙用骨架墙 + 增量追加，空态文案会一直顶在最上面（用户反馈）） */
  function grid(items, opts) {
    opts = opts || {};
    var wrap = V.utils.el('div', { className: 'vshell-wall' + (layout() === 'cover' ? ' is-cover' : '') });
    if (items && items.length) {
      items.forEach(function (it, i) {
        var card = V.videoCard.create(it, { layout: layout(), blacklistMode: !!opts.blacklistMode });
        card.style.setProperty('--i', String(i % 12));
        wrap.appendChild(card);
        // v0.6.2 聚合二期：多选激活时新卡注册选中模式
        if (V.aggUi && V.aggUi.isMultiActive()) V.aggUi.registerCard(card);
      });
    } else if (opts.empty !== false) {
      wrap.appendChild(empty(opts.emptyText || '这里还没有内容', opts.emptyIcon || 'codicon-inbox'));
    }
    return wrap;
  }

  /** 增量追加卡片（无限滚动）：只创建并插入新卡片，旧卡片不重插
   *  → 入场动画只在新卡片上触发（全量重建会让整墙卡片重放动画）；
   *  --i 沿用全量 grid 的阶梯序号，stagger 动画连续 */
  function appendCards(wall, items, startIndex, opts) {
    if (!wall || !items || !items.length) return;
    opts = opts || {};
    startIndex = startIndex || 0;
    items.forEach(function (it, j) {
      var card = V.videoCard.create(it, { layout: layout(), blacklistMode: !!opts.blacklistMode });
      card.style.setProperty('--i', String((startIndex + j) % 12));
      wall.appendChild(card);
      // v0.6.2 聚合二期：多选激活时新卡注册选中模式
      if (V.aggUi && V.aggUi.isMultiActive()) V.aggUi.registerCard(card);
    });
  }

  /** 无限滚动哨兵：进入视口触发 onHit；返回 {el, retrigger}
   *  retrigger()：disconnect 后重新 observe——强制产生一次新回调，
   *  增量追加后调用可补页（增量模式哨兵不重建，仅靠进出视口触发；
   *  全量重建模式每次新哨兵天然有初始回调，无需 retrigger） */
  function sentinel(onHit) {
    var el = V.utils.el('div', { className: 'vshell-wall-sentinel' });
    var io = null;
    function observe() {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            // 调试钩子：headless 下诊断 IO 触发次数（无副作用）
            if (window.__VS_IO_HITS__ === undefined) window.__VS_IO_HITS__ = 0;
            window.__VS_IO_HITS__++;
            if (onHit) onHit();
          }
        });
      }, { rootMargin: '600px 0px' });
      io.observe(el);
    }
    observe();
    return {
      el: el,
      retrigger: function () {
        if (io) { io.disconnect(); io = null; }
        observe();
      },
    };
  }

  /** 空状态 */
  function empty(text, iconClass, actionEl) {
    var box = V.utils.el('div', { className: 'vshell-empty' }, [
      V.utils.el('span', { className: 'codicon ' + (iconClass || 'codicon-inbox') + ' vshell-empty-icon' }),
      V.utils.el('div', { className: 'vshell-empty-text' }, text),
    ]);
    if (actionEl) box.appendChild(actionEl);
    return box;
  }

  /** v0.5.6 OOM 修复：差量更新墙内全部卡片的角色 DOM（characters.onChange
   *  → 各页面调此函数替代全量 render()）。返回更新的卡片数——
   * 调用方用 0 判定"墙未建 → 兜底全量重建"。 */
  function updateChars(host) {
    if (!host) return 0;
    var updated = 0;
    var cards = host.querySelectorAll('.vsc-video-card');
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c && c.__updateChar) {
        try { c.__updateChar(); updated++; } catch (e) { /* 单卡失败不阻塞 */ }
      }
    }
    return updated;
  }

  V.wall = {
    grid: grid, appendCards: appendCards, sentinel: sentinel, empty: empty,
    layout: layout, setLayout: setLayout, toggleLayout: toggleLayout,
    onLayoutChange: onLayoutChange, updateChars: updateChars,
  };
})();
