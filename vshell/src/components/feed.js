/* ============================================================
 * feed — 共享抖音刷视图组件（v0.3.85 从 watchlist 提取通用化）
 * 主页 / 搜索 / 待看 / 收藏 / 黑名单 共用：
 *   纵向滑动吸附 + 静音自动播放（无全屏）+ 顶部信息（头像/标题
 *   +复制/UP名）+ 右侧动作列 + 滑到底无限加载（getMore）
 *
 * API：V.feed.mount(container, opts) → { destroy }
 *   opts: {
 *     items:  初始条目数组（可选）
 *     getMore: fn → Promise<{items:[...]} | null>  滑到底调用；
 *             返回 null 或空数组 → 停止加载（不再触发）
 *     actions: [{ icon, label, onClick(item) }]    右侧动作列；
 *             默认 [待看, 收藏]（toggleWatch/toggleFav）
 *   }
 * 数据变化（取消待看/收藏/解除屏蔽）由各页面 onChange 整体重渲染，
 * 组件不感知移除。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

    /* v0.5.0 角色头像（刷页/详情页共用语义：圆形）：
     *  - 已赋予角色 → 角色图（无图/加载失败 → 白底首字）
     *  - 冲突 → 冲突 icon（**可点击**打开处理弹窗，用户拍板不自动弹窗）
     *  - 无角色 → + 号添加按钮（v0.5.3：用户需求，点击唤出添加角色弹窗；
     *    v0.5.1 曾为不显示——最新需求覆盖）
     * 返回 {el, role, conflict}（el 可为 null；role = 角色对象|null；
     *  conflict=true 时 meta 行显示「角色冲突」文本，v0.5.3 用户需求） */
  /** 视频快照（角色主页「手动添加」列表数据；v0.5.6） */
  function itemMeta(item) {
    return {
      id: item.id,
      bvid: item.bvid || item.id,
      title: item.title || '',
      cover: item.cover || item.pic || '',   // v0.5.6 第九轮：feed 条目封面在 pic（原取 cover 恒空 → 代表作无图）
      url: '#/video/' + item.id,
      pubdate: item.pubdate || '',   // v0.5.6 第八轮：快照带日期（角色主页卡片右下角）
    };
  }

  /** v0.6.30 多角色：返回 {els:[头像按钮...], roles:[角色...], conflict:false}——
   *  全部角色各一个头像（点击进各自角色主页）；无角色 → + 号添加按钮 */
  function avatarFor(item) {
    var cres = (V.characters && V.characters.charFor)
      ? V.characters.charFor(item.id, item) : { kind: 'none' };
    var chars = cres.kind === 'char' ? (cres.chars || []) : [];
    if (chars.length) {
      var els = chars.map(function (c) {
        // v0.5.3b：图片头像也可点击（v0.5.6：点击 → **角色主页**）
        var btn = V.utils.el('button', {
          className: 'vshell-feed-avatar',
          type: 'button',
          title: '角色：' + c.name + '——点击进入角色主页',
          'aria-label': '角色主页：' + c.name,
        });
        var setLetter = function () {
          btn.innerHTML = '';
          btn.appendChild(V.utils.el('span', { className: 'vshell-feed-avatar-letter' },
            String(c.name).charAt(0) || '?'));
        };
        if (c.icon) {
          btn.appendChild(V.utils.el('img', { src: c.icon, alt: '', onerror: setLetter }));
        } else {
          setLetter();
        }
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          V.router.nav('/role/' + encodeURIComponent(c.name));
        });
        return btn;
      });
      return { els: els, roles: chars, conflict: false };
    }
    // v0.5.3：无角色 → + 号添加按钮（点击 → 添加角色弹窗）
    var addBtn = V.utils.el('button', {
      className: 'vshell-feed-avatar is-add',
      type: 'button',
      title: '添加角色',
      'aria-label': '添加角色',
    }, [V.utils.el('span', { className: 'codicon codicon-add' })]);
    addBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (V.charPicker && V.charPicker.edit) {
        V.charPicker.edit(item.id, item.title, '添加角色', itemMeta(item), item.sourceId);
      }
    });
    return { els: [addBtn], roles: [], conflict: false };
  }

  /** meta 行内容（v0.6.30：全部角色名并排 + 独立「更改角色」编辑按钮；
   *  关注按钮移除——多角色下语义模糊，关注入口保留在角色列表/角色主页。
   *  初渲染与 updateRole 差量刷新共用） */
  function metaContent(av, item) {
    var children = [];
    (av.roles || []).forEach(function (rc) {
      children.push(V.utils.el('button', {
        className: 'vshell-feed-meta-name',
        type: 'button',
        title: '角色：' + rc.name + '——点击进入角色主页',
        'aria-label': '角色主页：' + rc.name,
        onclick: function (e) {
          e.stopPropagation();
          V.router.nav('/role/' + encodeURIComponent(rc.name));
        },
      }, rc.name));
    });
    if ((av.roles || []).length) {
      children.push(V.utils.el('button', {
        className: 'vshell-feed-meta-edit',
        type: 'button',
        title: '更改角色',
        'aria-label': '更改角色',
        onclick: function (e) {
          e.stopPropagation();
          if (V.charPicker && V.charPicker.edit) {
            V.charPicker.edit(item.id, item.title, null, itemMeta(item), item.sourceId);
          }
        },
      }, V.utils.el('span', { className: 'codicon codicon-edit' })));
    }
    return children;
  }

  function mount(container, opts) {
    opts = opts || {};
    var adapter = V.siteAdapters.current();
    var done = false;
    var io = null;
    var playInfoCache = {};
    var slides = [];          // {item, root, media, poster, player, pi, visible}
    var feed = V.utils.el('div', { className: 'vshell-feed' });
    container.appendChild(feed);

    // v0.3.96 用户需求：右侧按钮标准化为四个——详情 / 待看 / 收藏 / 黑名单；
    // 后三个已在对应列表中时用对应色高亮（待看蓝 / 收藏红 / 黑名单橙），
    // 由 feedAction 的 kind + active(item) 驱动（点击后立即 refresh）
    var actions = opts.actions || [
      { icon: 'codicon-arrow-right', label: '详情', onClick: function (item) {
          // v0.5.7 多源：详情跳转带源前缀（跨源同 id 是不同实体）
          V.router.nav('/video/' + (item.sourceId && item.sourceId !== 'local'
            ? item.sourceId + ':' : '') + item.id);
        } },
      {
        icon: 'codicon-bookmark', label: '待看', kind: 'watch',
        active: function (item) { return !!(V.saved && V.saved.isWatch(item.id, item.sourceId)); },
        onClick: function (item) { V.saved.toggleWatch(item); },
      },
      {
        icon: 'codicon-heart', label: '收藏', kind: 'fav',
        active: function (item) { return !!(V.saved && V.saved.isFav(item.id, item.sourceId)); },
        onClick: function (item) { V.saved.toggleFav(item); },
      },
      {
        icon: 'codicon-circle-slash', label: '黑名单', kind: 'black',
        active: function (item) { return !!(V.blacklist && V.blacklist.isBlocked(item.id, item.sourceId)); },
        onClick: function (item) {
          if (!V.blacklist) return;
          if (V.blacklist.isBlocked(item.id, item.sourceId)) {
            V.blacklist.remove(item.id, item.sourceId);
            V.toast.ok('已解除屏蔽');
          } else {
            V.blacklist.add(item);
            V.toast.ok('已屏蔽：' + (item.title || ''));
          }
        },
      },
    ];

    // ---- v0.3.97 用户需求：取消待看/收藏/黑名单后不立刻让视频消失——
    // 先标记 pendingRemove；直到该 slide 被刷走（向上/向下离开视口）才真正
    // 从列表移除；若在划走前恢复（重新加入）→ 清除标记，什么事都不发生。
    // 仅列表驱动页面生效（opts.inList 提供"该项是否仍属于当前列表"判断；
    // 主页/搜索等非列表 feed 不传 → 取消操作不影响 feed 内容）
    var pendingRemove = {};        // id -> true
    var offSaved = null;
    var offBlack = null;
    if (typeof opts.inList === 'function') {
      offSaved = V.saved ? V.saved.on(onListChange) : null;
      offBlack = V.blacklist ? V.blacklist.onChange(onListChange) : null;
    }
    function onListChange() {
      if (done || typeof opts.inList !== 'function') return;
      var gone = [];
      slides.forEach(function (s) {
        if (opts.inList(s.item)) {
          delete pendingRemove[s.item.id];       // 恢复 → 取消移除
        } else {
          pendingRemove[s.item.id] = true;
          if (!s.visible) gone.push(s.item.id);  // 已划走 → 立即移除
        }
      });
      gone.forEach(function (id) { removeSlide(id); });
    }

    // ---- v0.3.92 用户需求：鼠标静止一段时间 → 隐藏顶部标题/阴影与右侧动作列；
    // 鼠标移动/滚动 → 恢复显示。全部 slide 暂停时不隐藏（否则找不到恢复按钮）。
    // v0.3.93：等待时间 2.5s → 1.5s；v0.3.94：→ 0.7s（用户反馈过长）
    // （播放器控件在 mutedAutoplay 下由播放器自身 0.7s 自动隐藏，节奏一致）
    var UI_HIDE_MS = 700;
    var uiTimer = null;
    // v0.5.4 用户需求：隐藏时悬停的控件保留显示（只隐藏其他）。
    // 实现 = 隐藏前检查（A 方案）：mousemove/scroll 记录最后坐标；
    // uiTimer 到点先 peekUI(最后坐标) 给命中 slide 的 info/actions 加
    // .is-peeked，再加 is-ui-hidden（CSS：隐藏态 info/actions opacity 0，
    // .is-peeked 唯一显示）。mousemove 本身触发 pokeUI 恢复全部，故不做
    // 隐藏态动态 peek（B 方案无效）。
    var lastMX = -1, lastMY = -1;
    function hitRect(x, y, el) {
      if (!el) return false;
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 &&
        x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }
    function clearPeek() {
      feed.querySelectorAll('.vshell-feed-info.is-peeked, .vshell-feed-actions.is-peeked')
        .forEach(function (x) { x.classList.remove('is-peeked'); });
    }
    function peekUI(x, y) {
      clearPeek();
      feed.querySelectorAll('.vshell-feed-slide').forEach(function (slide) {
        var info = slide.querySelector('.vshell-feed-info');
        var actions = slide.querySelector('.vshell-feed-actions');
        if (hitRect(x, y, info)) info.classList.add('is-peeked');
        if (hitRect(x, y, actions)) actions.classList.add('is-peeked');
      });
    }
    function pokeUI() {
      feed.classList.remove('is-ui-hidden');
      clearTimeout(uiTimer);
      uiTimer = setTimeout(function () {
        if (done) return;
        var anyPlaying = slides.some(function (s) {
          return s.visible && s.player && s.player.playing;
        });
        if (!anyPlaying) { pokeUI(); return; }   // 暂停中保持可见
        peekUI(lastMX, lastMY);                  // v0.5.4：隐藏前保留悬停控件
        feed.classList.add('is-ui-hidden');
      }, UI_HIDE_MS);
    }
    feed.addEventListener('mousemove', function (e) {
      lastMX = e.clientX; lastMY = e.clientY;
      pokeUI();
    }, { passive: true });
    feed.addEventListener('scroll', pokeUI, { passive: true });
    feed.addEventListener('mouseleave', clearPeek);
    pokeUI();

    (opts.items || []).forEach(function (it) { appendSlide(it); });

    // ---- v0.5.6 第十轮（用户需求 7）：抖音刷全屏——**feed 容器**全屏
    // （需求 7b：全屏后仍可上下滚动——feed 自身是滚动容器，全屏后
    // scroll-snap 继续生效；需求 7a：全屏按钮在**播放器控制条**（与详情页
    // 一致，动作列按钮已移除）；v0.5.6 第十二轮需求 7：全屏态播放控件
    // 正常按 0.7s 隐藏（用户澄清「控件不隐藏」是问题——与其他部分一致）
    // 原生 Fullscreen API 不可用（嵌入/无手势）→ .is-feed-fullscreen-sim
    // 模拟全屏（fixed 铺满）；Esc/系统退出原生全屏 → fullscreenchange 还原
    var feedFs = { on: false, sim: false };
    // 全屏态切换后同步 feed 内所有播放器控制条的全屏按钮图标
    // （feed 容器级全屏：各播放器的 fsBtn 图标统一跟随）
    function syncFeedFsIcons() {
      var ic = feedFs.on ? 'codicon-screen-normal' : 'codicon-screen-full';
      feed.querySelectorAll('.vshell-player-btn').forEach(function (b) {
        var s = b.querySelector('.codicon');
        if (s) s.className = 'codicon ' + ic;
      });
    }
    function toggleFeedFullscreen() {
      if (feedFs.on) {
        if (feedFs.sim) { feedFs.sim = false; feed.classList.remove('is-feed-fullscreen-sim'); }
        if (document.fullscreenElement) document.exitFullscreen().catch(function () { /* noop */ });
        feed.classList.remove('is-feed-fullscreen');
        feedFs.on = false;
        syncFeedFsIcons();
        return;
      }
      feed.classList.add('is-feed-fullscreen');
      if (feed.requestFullscreen) {
        feed.requestFullscreen().then(function () { feedFs.on = true; syncFeedFsIcons(); })
          .catch(function () {
            feedFs.on = true; feedFs.sim = true;
            feed.classList.add('is-feed-fullscreen-sim');
            syncFeedFsIcons();
          });
      } else {
        feedFs.on = true; feedFs.sim = true;
        feed.classList.add('is-feed-fullscreen-sim');
        syncFeedFsIcons();
      }
    }
    // 原生全屏退出（Esc/系统）→ 还原（sim 模式退出只走点击 toggle）
    document.addEventListener('fullscreenchange', function () {
      if (!feedFs.on || feedFs.sim) return;
      if (document.fullscreenElement !== feed) {
        feed.classList.remove('is-feed-fullscreen');
        feedFs.on = false;
      }
    });

    // ---- 无限加载：滑到底 getMore（防抖：一次在途只发一个） ----
    var noMore = false;
    var loadingMore = false;
    if (typeof opts.getMore === 'function') {
      feed.addEventListener('scroll', onScroll);
      function onScroll() {
        if (done || noMore || loadingMore) return;
        if (feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 400) {
          loadingMore = true;
          Promise.resolve(opts.getMore()).then(function (res) {
            loadingMore = false;
            if (done) return;
            if (!res || !res.items || !res.items.length) { noMore = true; return; }
            res.items.forEach(function (it) { appendSlide(it); });
          }).catch(function () { loadingMore = false; });
        }
      }
    }

    function appendSlide(item) {
      var slide = V.utils.el('section', {
        className: 'vshell-feed-slide',
        'data-idx': String(slides.length),
        'data-id': item.id,
      });

      var media = V.utils.el('div', { className: 'vshell-feed-media' });
      // 占位封面（播放器加载前）；无图/加载失败 → 隐藏露黑底（旧数据无 pic）
      var poster = V.utils.el('img', {
        className: 'vshell-feed-poster', src: item.pic || '', alt: '', loading: 'lazy',
        onerror: function () { this.style.display = 'none'; },
      });
      // v0.6.0 加密封面懒解密（同 video-card）：pic 是加密 URL → 异步解密回填
      if (item.pic && item.sourceId && V.siteAdapters && V.siteAdapters.picDecryptorFor) {
        var _fdec = V.siteAdapters.picDecryptorFor(item.sourceId);
        if (_fdec) {
          var _fraw = item.pic;
          poster.removeAttribute('src');
          poster.src = '';
          _fdec(_fraw).then(function (u) {
            if (u) { poster.src = u; poster.style.display = ''; }
          }).catch(function () { /* 解密失败留空 */ });
        }
      }
      media.appendChild(poster);
      slide.appendChild(media);

      // 右侧动作列
      var actionCol = V.utils.el('div', { className: 'vshell-feed-actions' });
      actions.forEach(function (a) {
        actionCol.appendChild(feedAction(a, item));
      });
      slide.appendChild(actionCol);

      // 顶部信息（头像 + 标题 + 复制按钮 + 角色名/空）
      // v0.5.0：头像 = 角色图（圆形）/冲突 icon/UP 兜底；meta = 角色名，
      // 无角色时不显示（含 UP icon 与名字，用户需求）
      var av = avatarFor(item);
      var info = V.utils.el('div', { className: 'vshell-feed-info' }, [
        V.utils.el('div', { className: 'vshell-feed-head' }, [
          // v0.6.30 多角色：头像容器（全部角色并排，更新时整体替换）
          V.utils.el('div', { className: 'vshell-feed-head-avs' }, av.els),
          V.utils.el('div', { className: 'vshell-feed-head-text' }, [
            V.utils.el('div', { className: 'vshell-feed-title-row' }, [
              V.utils.el('div', { className: 'vshell-feed-title' }, item.title || ''),
              V.utils.el('button', {
                className: 'vshell-feed-copy', type: 'button',
                'aria-label': '复制标题', title: '复制标题',
                onclick: function (e) {
                  e.stopPropagation();
                  copyFeedTitle(item.title || '', this);
                },
              }, V.utils.el('span', { className: 'codicon codicon-copy' })),
            ]),
            V.utils.el('div', { className: 'vshell-feed-meta' }, metaContent(av, item)),
          ]),
        ]),
      ]);
      slide.appendChild(info);

      feed.appendChild(slide);
      slides.push({ item: item, root: slide, media: media, poster: poster, player: null, pi: null, visible: false });
    }

    // 可视性观察：进入 1 屏 → 建播放器加载；过半 → 播放；离开 → 暂停；
    // v0.3.97：离开视口（向上/向下刷走）且带 pendingRemove 标记 → 真正移除
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var s = slides[+en.target.dataset.idx];
        if (!s) return;
        if (en.isIntersecting) {
          s.visible = true;
          if (!s.player) attachPlayer(s);
          if (s.pi) s.player.play();
        } else {
          s.visible = false;
          if (s.player && s.player.playing) s.player.pause();
          if (pendingRemove[s.item.id]) removeSlide(s.item.id);
        }
      });
    }, { root: feed, threshold: 0.55 });
    slides.forEach(function (s) {
      io.observe(s.root);
      // IO 首次回调延迟兜底（headless 虚拟时间下可能不派发）：立即自查一次
      checkVisible(s);
    });
    function checkVisible(s) {
      var fr = feed.getBoundingClientRect();
      var sr = s.root.getBoundingClientRect();
      if (sr.bottom > fr.top && sr.top < fr.bottom) {
        s.visible = true;
        if (!s.player) attachPlayer(s);
        if (s.pi) s.player.play();
      }
    }

    function feedAction(a, item) {
      var btn = V.utils.el('button', {
        className: 'vshell-feed-action', type: 'button', 'aria-label': a.label, title: a.label,
        onclick: function () {
          try { if (a.onClick) a.onClick(item); } catch (e) { /* noop */ }
          refresh();
        },
      }, [
        V.utils.el('span', { className: 'codicon ' + a.icon }),
        V.utils.el('span', { className: 'vshell-feed-action-label' }, a.label),
      ]);
      // v0.3.96：已在对应列表 → is-active + is-active-<kind>（对应色高亮）
      function refresh() {
        if (a.kind && typeof a.active === 'function') {
          var on = !!a.active(item);
          btn.classList.toggle('is-active', on);
          btn.classList.toggle('is-active-' + a.kind, on);
        }
      }
      refresh();
      return btn;
    }

    // ---- 标题复制（同详情页交互：按钮打勾脉冲动画 + toast）----
    var copyTimer = null;
    function copyFeedTitle(title, btn) {
      function pop() {
        if (!btn) return;
        var icon = btn.querySelector('.codicon');
        if (icon) icon.className = 'codicon codicon-check';
        btn.classList.add('is-copied');
        clearTimeout(copyTimer);
        copyTimer = setTimeout(function () {
          btn.classList.remove('is-copied');
          if (icon) icon.className = 'codicon codicon-copy';
        }, 1200);
      }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = title;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); V.toast.ok('已复制标题'); pop(); }
        catch (e) { V.toast.error('复制失败'); }
        ta.remove();
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(title).then(function () {
          V.toast.ok('已复制标题');
          pop();
        }).catch(fallback);
      } else fallback();
    }

    function attachPlayer(s) {
      var player = V.player.create({
        mutedAutoplay: true,
        watchId: s.item ? s.item.id : null,
        poster: s.item ? s.item.pic : null,
        // v0.5.6 第十轮需求 7：抖音刷全屏——播放器控制条提供全屏按钮
        // （与详情页一致），点击切换 feed 容器全屏
        feedFullscreen: true,
        onFullscreenToggle: toggleFeedFullscreen,
      });
      s.player = player;
      s.media.appendChild(player.root);
      s.poster.remove();
      s.poster = null;
      loadPlayInfo(s);
    }
    function loadPlayInfo(s) {
      if (playInfoCache[s.item.id]) {
        playInfoCache[s.item.id].then(function (pi) { applyPi(s, pi); });
        return;
      }
      // v0.5.6 第十二轮：本地视频数据源——播放源 = 文件 objectURL（直链）
      var p = (V.localVideos && s.item && s.item.local && V.localVideos.playInfo)
        ? V.localVideos.playInfo(s.item)
        : adapter.getPlayInfo(s.item.id).catch(function () { return null; });
      playInfoCache[s.item.id] = p;
      p.then(function (pi) { applyPi(s, pi); });
    }
    function applyPi(s, pi) {
      if (done || !s.player) return;
      s.pi = pi;
      if (!pi) { V.toast.error('播放源获取失败：' + s.item.title); return; }
      try {
        if (pi.type === 'url' && pi.url) s.player.load(pi.url);   // v0.5.6 第十二轮：本地视频直链
        else if (pi.type === 'durl' && pi.durl && pi.durl.length) s.player.load(pi.durl[0].url);
        else if (pi.dash && pi.dash.video) s.player.loadDash(pi);
        if (s.visible) s.player.play();
      } catch (e) { /* noop */ }
      // 分镜节点：渲染统一读合并缓存；边播分析 + 未识别时后台快扫
      var bar = s.player.root.querySelector('.vshell-player-bar');
      if (bar) {
        function renderFeedShots() {
          V.shots.renderNodes(bar, V.shots.get(s.item.id), pi.duration);
        }
        if (s.offGapChange) { try { s.offGapChange(); } catch (e) {} }
        s.offGapChange = V.shots.onGapChange(renderFeedShots);
        renderFeedShots();
        if (s.shotsDetach) { try { s.shotsDetach(); } catch (e) {} }
        s.shotsDetach = V.shots.attach(s.player, { id: s.item.id, onUpdate: renderFeedShots });
        var scannedF = V.shots.get(s.item.id) || V.shots.isScanned(s.item.id);
        if (!scannedF && !s.shotsStopScan && !s.scanWin) {
          s.scanWin = V.utils.el('div', { className: 'vshell-scan-window' });
          s.player.root.appendChild(s.scanWin);
          s.shotsStopScan = V.shots.scan(pi, {
            id: s.item.id, duration: pi.duration,
            container: s.scanWin,
            onUpdate: renderFeedShots,
            onDone: function () { renderFeedShots(); },
          });
        }
      }
    }

    /** 差量移除一个 slide（v0.3.90：取消待看/收藏/解除屏蔽时局部删除，
     *  不整体重渲染 → 无全量入场动画重播；v0.3.97：feed 内部延迟移除
     *  ——slide 被刷走后调用）。返回是否找到并移除 */
    function removeSlide(id) {
      for (var i = 0; i < slides.length; i++) {
        if (slides[i].item.id === id) {
          var s = slides[i];
          delete pendingRemove[id];
          if (s.offGapChange) { try { s.offGapChange(); } catch (e) {} s.offGapChange = null; }
          if (s.shotsDetach) { try { s.shotsDetach(); } catch (e) {} s.shotsDetach = null; }
          if (s.shotsStopScan) { try { s.shotsStopScan(); } catch (e) {} s.shotsStopScan = null; }
          if (s.scanWin) { try { s.scanWin.remove(); } catch (e) {} s.scanWin = null; }
          if (s.player) { try { s.player.destroy(); } catch (e) {} }
          slides.splice(i, 1);
          // IO 用 data-idx 索引 slides——移除后重排剩余 slide 索引
          slides.forEach(function (s2, j) { s2.root.setAttribute('data-idx', String(j)); });
          if (s.root && s.root.parentNode) s.root.remove();
          return true;
        }
      }
      return false;
    }

    return {
      removeSlide: removeSlide,
      /** 查 slide 是否存在（差量 add 判断用） */
      findSlide: function (id) {
        for (var i = 0; i < slides.length; i++) {
          if (slides[i].item.id === id) return slides[i];
        }
        return null;
      },
      /** 头像回填/角色刷新（setFace / 角色变化后）→ 局部替换头像（不重建）
       *  v0.6.30：整体替换 .vshell-feed-head-avs 容器子节点（多角色） */
      updateFace: function (id) {
        for (var i = 0; i < slides.length; i++) {
          if (slides[i].item.id === id) {
            var avHost = slides[i].root.querySelector('.vshell-feed-head-avs');
            var it = slides[i].item;
            if (!avHost || !it) return;
            var r = avatarFor(it);
            avHost.replaceChildren.apply(avHost, r.els);
            return;
          }
        }
      },
      /** v0.5.5 用户需求：角色改动差量刷新（头像 + meta 角色名），
       *  不重建 feed（重建会回到列表第一个）。id 缺省 = 刷新全部 slide */
      updateRole: function (id) {
        for (var i = 0; i < slides.length; i++) {
          if (!id || slides[i].item.id === id) {
            var s = slides[i];
            var avHost = s.root.querySelector('.vshell-feed-head-avs');
            if (!avHost) continue;
            var r = avatarFor(s.item);
            avHost.replaceChildren.apply(avHost, r.els);
            var meta = s.root.querySelector('.vshell-feed-meta');
            if (meta) {
              meta.textContent = '';                     // 重建内容（含更改按钮）
              metaContent(r, s.item).forEach(function (n) { meta.appendChild(n); });
            }
            if (id) return;
          }
        }
      },
      /** v0.5.6 第五轮：搜索结果增量更新（用户需求：先显示本地缓存、网络
       *  数据到达后动态增量更新——不重建 feed、不丢滚动位置）：
       *  已有 id 的 slide 刷新标题元数据；新 id 追加到列表末尾 */
      updateItems: function (newItems) {
        if (!newItems || !newItems.length) return;
        var known = {};
        slides.forEach(function (s) { known[s.item.id] = s; });
        (newItems || []).forEach(function (it) {
          if (!it || !it.id) return;
          var s = known[it.id];
          if (s) {
            s.item = it;
            if (it.title) {
              var t = s.root.querySelector('.vshell-feed-title');
              if (t) t.textContent = it.title;
            }
          } else {
            appendSlide(it);
          }
        });
      },
      destroy: function () {
        done = true;
        clearTimeout(uiTimer);
        if (io) io.disconnect();
        // 退出 feed 全屏（feed 销毁时清理残留类/状态）
        feed.classList.remove('is-feed-fullscreen', 'is-feed-fullscreen-sim');
        feedFs.on = false; feedFs.sim = false;
        if (offSaved) { try { offSaved(); } catch (e) {} offSaved = null; }
        if (offBlack) { try { offBlack(); } catch (e) {} offBlack = null; }
        pendingRemove = {};
        slides.forEach(function (s) {
          if (s.offGapChange) { try { s.offGapChange(); } catch (e) {} s.offGapChange = null; }
          if (s.shotsDetach) { try { s.shotsDetach(); } catch (e) {} s.shotsDetach = null; }
          if (s.shotsStopScan) { try { s.shotsStopScan(); } catch (e) {} s.shotsStopScan = null; }
          if (s.scanWin) { try { s.scanWin.remove(); } catch (e) {} s.scanWin = null; }
          if (s.player) s.player.destroy();
        });
        slides = [];
        if (feed.parentNode) feed.remove();
      },
    };
  }

  V.feed = { mount: mount };
})();
