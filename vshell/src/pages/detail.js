/* ============================================================
 * detail — 视频详情页（通用模板，布局学 bilibili 网页版）
 * 结构（学 bilibili 网页版两栏）：
 *   左栏 .vshell-detail-main：
 *     1. 标题（顶部，大字）+ 复制按钮
 *     2. 信息条：播放量 · 弹幕数 · 发布日期 · 时长（· 分区标签）
 *     3. UP 主行：头像 + 名字
 *     4. 播放卡片（自研播放器，带全屏；播放必原速；控件常驻）
 *     5. 操作行：待看 / 收藏 / 下载
 *     6. 简介（超长折叠）
 *   右栏 .vshell-detail-side：相关推荐（列表：缩略图 + 标题 + UP·播放数）
 * 数据走适配器契约（VideoDetail: title/pubdate/owner.face/stat.view|
 *   danmaku/desc/cid/pages），任何站点实现契约即得此布局。
 * 下载：默认合并 MP4（无损 remux）；合并不可用/超 1GB/合并失败
 *   → 自动降级双文件（视频+音频），全程提示不弹选项
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  function mount(outlet, params) {
    // v0.5.7 多源：URL 带源（#/video/<源>:<id>）→ 该源适配器；
    // 旧格式（无源）→ 主源；本地视频（src='local' 或 id 含 local: 前缀）
    // v0.6.1 聚合：URL #/video/grp:<组id> → 组详情（顶部源切换器）
    var src = params.src || null;
    var id = params.id;
    var isLocal = src === 'local' || /^local:/.test(id || '');
    if (src === 'local' && /^local:/.test(id || '')) {
      // 旧格式本地 id（local:xxx）拆出裸 id（新格式 src 已含源）
      id = String(id).replace(/^local:/, '');
    }
    // v0.6.1 组详情：当前成员状态由 loadMember 赋值（成员切换时变化）
    var adapter = null;
    var detailSrc = 'acfun';
    var done = false;
    var player = null;
    var playInfo = null;
    // v0.6.1：组路由解析 + 切换清理
    var isGroup = src === 'grp' || /^grp:/.test(id || '');
    var gid = isGroup ? (src === 'grp' ? 'grp:' + id : id) : null;
    var curCleanup = null;
    // v0.5.6 分镜/角色监听（mount 级声明——render 内 offChars 曾遮蔽导致
    // destroy 引用 ReferenceError，提升后成员切换/卸载统一清理）
    var offChars = null, offGapChange = null;
    var shotsDetach = null, shotsStopScan = null, scanWin = null;
    // v0.6.12：静态框架组件（返回按钮/操作行）——不随数据加载，始终可见可用
    var curDetail = null;      // 当前已加载详情（供操作行点击/状态刷新）
    var pendingAction = null;  // 详情未就绪时的待执行操作（watch/fav）
    var actionsRow = null, watchBtn = null, favBtn = null;

    var page = V.utils.el('div', { className: 'vshell-page vshell-page-detail' });
    outlet.appendChild(page);
    // v0.6.11：内容区两栏容器（首次 loadMember 创建，成员切换复用）——
    // 页面框架先出，主视频区/相关推荐区各自独立加载
    var contentBox = V.utils.el('div', { className: 'vshell-detail-content' });
    page.appendChild(contentBox);
    var layout = null, main = null, side = null;

    // v0.6.12：返回按钮 + 操作行（待看/收藏/下载/重新识别）**静态框架**——
    // 不随详情加载出现，加载中也可见可用；操作按钮在详情未就绪时点击
    // 记录意图（pendingAction），详情到达后自动执行
    var backBtn = V.utils.el('button', {
      className: 'vshell-icon-btn vshell-detail-back',
      type: 'button', title: '返回', 'aria-label': '返回',
      onclick: function () {
        window.__VS_KEEP_SCROLL__ = true;
        if (history.length > 1) history.back();
        else V.router.nav('/');
      },
    }, V.utils.el('span', { className: 'codicon codicon-arrow-left' }));
    page.appendChild(backBtn);
    buildActions();

    /** v0.6.12 静态操作行（不挂载——由 loadMember 挂到主区底部，
     *  数据到达后 renderMain 移至播放卡片正下方；v0.6.12b 修正位置） */
    function buildActions() {
      actionsRow = V.utils.el('div', { className: 'vshell-detail-actions' });
      watchBtn = actionBtn('codicon-add', '待看', 'watch');
      favBtn = actionBtn('codicon-heart', '收藏', 'fav');
      watchBtn.addEventListener('click', function () { doSaveAction('watch'); });
      favBtn.addEventListener('click', function () { doSaveAction('fav'); });
      actionsRow.appendChild(watchBtn);
      actionsRow.appendChild(favBtn);
      actionsRow.appendChild(V.utils.el('button', {
        className: 'vshell-btn vshell-btn-primary vshell-detail-download',
        type: 'button',
        onclick: startDownload,
      }, [
        V.utils.el('span', { className: 'codicon codicon-cloud-download' }),
        V.utils.el('span', { className: 'vshell-btn-text' }, '下载'),
      ]));
      // 重新识别分镜：清除本视频缓存/标记 + 立即重扫（绕过旧版误标、
      // 快扫失败残留；用户可主动触发）
      actionsRow.appendChild(V.utils.el('button', {
        className: 'vshell-btn vshell-btn-secondary vshell-detail-rescan',
        type: 'button',
        title: '清除分镜缓存并重新识别（扫描期间播放器右上角显示进度）',
        onclick: rescanShots,
      }, [
        V.utils.el('span', { className: 'codicon codicon-sync' }),
        V.utils.el('span', { className: 'vshell-btn-text' }, '重新识别'),
      ]));
    }

    /** v0.6.12 待看/收藏点击（详情未就绪 → 记录意图，到达后自动执行） */
    function doSaveAction(kind) {
      if (!curDetail || typeof curDetail !== 'object') {
        pendingAction = kind;
        V.toast.info('正在加载详情，操作稍后自动生效');
        return;
      }
      if (kind === 'watch') V.saved.toggleWatch(curDetail);
      else if (kind === 'fav') V.saved.toggleFav(curDetail);
      refreshSaveBtns();
    }

    /** v0.6.12 mount 级状态刷新（引用 curDetail；render 后与 pendingAction 执行时调用） */
    function refreshSaveBtns() {
      if (!watchBtn || !curDetail || typeof curDetail !== 'object') return;
      watchBtn.classList.toggle('is-active', V.saved.isWatch(curDetail.id, curDetail.sourceId));
      favBtn.classList.toggle('is-active', V.saved.isFav(curDetail.id, curDetail.sourceId));
    }

    /** v0.6.12b：清空主区但保留静态操作行（从 main 摘下后重新挂回底部；
     *  调用方在 clearMain 后把骨架/空态 insertBefore(actionsRow)） */
    function clearMain() {
      var ak = actionsRow.parentNode === main ? main.removeChild(actionsRow) : null;
      main.innerHTML = '';
      if (ak) main.appendChild(ak);
    }

    /** v0.6.14：同构骨架——主区骨架与真实 renderMain 布局一致：
     *  标题行（条+禁用复制钮）→ 信息条（播放/弹幕/日期/时长小块）→
     *  UP 行（头像圆+名字条）→ 播放卡片（16:9 大块）；
     *  操作行（真实静态）与简介骨架由 loadMember 在外部按序挂载 */
    function skeletonMain() {
      return V.utils.el('div', { className: 'vshell-detail-skeleton vshell-detail-skeleton-iso' }, [
        // 1. 标题行：标题条 + 禁用的复制按钮（布局与真实一致）
        V.utils.el('div', { className: 'vshell-detail-title-row' }, [
          V.utils.el('span', { className: 'vshell-skeleton-line', style: { width: '62%' } }),
          V.utils.el('button', {
            className: 'vshell-icon-btn vshell-detail-copy',
            type: 'button', disabled: 'disabled',
            title: '复制视频标题（加载中）', 'aria-label': '复制视频标题',
          }, V.utils.el('span', { className: 'codicon codicon-copy' })),
        ]),
        // 2. 信息条：播放量/弹幕/日期/时长 小块（真实 stats flex gap 14px）
        V.utils.el('div', { className: 'vshell-detail-stats' }, [
          V.utils.el('span', { className: 'vshell-skeleton-line', style: { width: '78px' } }),
          V.utils.el('span', { className: 'vshell-skeleton-line', style: { width: '54px' } }),
          V.utils.el('span', { className: 'vshell-skeleton-line', style: { width: '90px' } }),
          V.utils.el('span', { className: 'vshell-skeleton-line', style: { width: '46px' } }),
        ]),
        // 3. UP/角色行：头像圆 + 角色名条
        V.utils.el('div', { className: 'vshell-detail-up' }, [
          V.utils.el('span', { className: 'vshell-skeleton-circle' }),
          V.utils.el('span', { className: 'vshell-skeleton-line', style: { width: '96px' } }),
        ]),
        // 4. 播放卡片：16:9 大块（视频卡形状）
        V.utils.el('div', { className: 'vshell-detail-player-card' }, [
          V.utils.el('div', { className: 'vshell-skeleton-block vshell-skeleton-player' }),
        ]),
      ]);
    }
    /** v0.6.14：简介骨架（操作行之后，与真实顺序一致） */
    function skeletonDesc() {
      return V.utils.el('div', { className: 'vshell-detail-desc-skeleton' }, [
        V.utils.el('div', { className: 'vshell-skeleton-line', style: { width: '100%' } }),
        V.utils.el('div', { className: 'vshell-skeleton-line', style: { width: '86%' } }),
        V.utils.el('div', { className: 'vshell-skeleton-line', style: { width: '64%' } }),
      ]);
    }
    /** v0.6.14：相关推荐骨架（5 项：缩略图块 + 标题/元信息两行条，同真实列表） */
    function skeletonSide() {
      var items = [];
      for (var i = 0; i < 5; i++) {
        items.push(V.utils.el('li', null, [
          V.utils.el('span', { className: 'vshell-detail-related-thumb' }),
          V.utils.el('span', { className: 'vshell-detail-related-info' }, [
            V.utils.el('span', { className: 'vshell-skeleton-line', style: { width: '92%' } }),
            V.utils.el('span', { className: 'vshell-skeleton-line', style: { width: '55%', height: '12px' } }),
          ]),
        ]));
      }
      return V.utils.el('ul', { className: 'vshell-detail-related vshell-detail-related-skel' }, items);
    }

    var currentTitle = '';
    var currentPic = '';
    var copyTimer = null;   // 复制按钮动画复位定时器

    // v0.6.11：不再整块骨架屏——页面框架（两栏布局）先出，
    // 主视频区/相关推荐区在 loadMember 内各自显示局部加载动画

    // ---- 加载数据 ----
    // v0.5.7：源未启用（角色页/收藏页全源快照可见但源未激活，**含内置源**）→
    // 明确提示去设置启用，不发起网络请求
    function srcDisabledMsg() {
      try {
        if (V.multisource && src && !isLocal
            && V.multisource.activeSources().indexOf(src) < 0) {
          var nm = (adapter && adapter.meta && adapter.meta.name) || src;
          if (V.dataSource && V.dataSource.isPrivate && V.dataSource.isPrivate(src)) {
            return '隐私数据源未加载：可在设置中手动启用「' + nm + '」';
          }
          return '数据源未启用：请先在设置中启用「' + nm + '」';
        }
      } catch (e) { /* noop */ }
      return null;
    }

    /** v0.6.1 加载单个成员详情（组详情切换/普通详情共用）：
     *  切换时清理上一次渲染（curCleanup），内容区整体重建
     *  v0.6.11 页面框架先出：两栏布局容器首次创建后复用；主视频区与
     *  相关推荐区各自独立请求 + 各自局部加载动画，数据到达分别填充 */
    function loadMember(mSrc, mId) {
      src = mSrc; id = mId;
      isLocal = mSrc === 'local';
      adapter = isLocal ? null
        : (mSrc ? V.siteAdapters.adapterFor(mSrc) : V.siteAdapters.current());
      detailSrc = isLocal ? 'local'
        : (mSrc || (V.multisource ? V.multisource.primary() : 'acfun'));
      if (curCleanup) { try { curCleanup(); } catch (e) { /* noop */ } curCleanup = null; }
      // 两栏容器（首次创建，成员切换复用）
      if (!layout) {
        layout = V.utils.el('div', { className: 'vshell-detail-layout' });
        main = V.utils.el('div', { className: 'vshell-detail-main' });
        side = V.utils.el('div', { className: 'vshell-detail-side' });
        layout.appendChild(main);
        layout.appendChild(side);
        contentBox.appendChild(layout);
        // v0.6.12b：静态操作行挂主区底部——加载中/空态也可见，
        // 数据到达后由 renderMain 移至播放卡片正下方（紧贴卡片）
        main.appendChild(actionsRow);
      }
      // v0.6.12b：清空主区但保留操作行
      clearMain();
      side.innerHTML = '';
      // v0.6.14：同构骨架——与真实详情布局一致（标题行/信息条/UP 行/视频卡/
      // 简介/相关推荐项），各元素为加载动效占位；操作行/返回按钮为真实静态组件
      main.insertBefore(skeletonMain(), actionsRow);
      main.appendChild(skeletonDesc());      // 简介骨架：操作行之后（真实顺序一致）
      side.appendChild(skeletonSide());
      // 源未启用：直接空态，不发起网络请求（避免网络失败提示掩盖未启用提示）
      var disMsg2 = srcDisabledMsg();
      if (disMsg2) {
        clearMain();
        main.insertBefore(V.wall.empty(disMsg2, 'codicon-error'), actionsRow);
        return;
      }
      if (!adapter && !isLocal) {
        clearMain();
        main.insertBefore(V.wall.empty(srcDisabledMsg() || '数据源不可用', 'codicon-error'), actionsRow);
        return;
      }
      // v0.5.6 第十二轮需求 2：本地视频数据源——不查网站接口，
      // 由 localVideos 快照构造 detail + 直链播放源（objectURL）
      if (isLocal && V.localVideos) {
        var lv = V.localVideos.find('local:' + mId);
        if (!lv) {
          clearMain();
          main.insertBefore(V.wall.empty('本地视频不存在或已删除', 'codicon-error'), actionsRow);
        } else {
          var ldetail = {
            id: 'local:' + mId, bvid: 'local:' + mId, cid: 0,
            title: lv.title || '', pic: lv.cover || '',
            stat: { view: lv.stat ? lv.stat.view : 0, danmaku: 0 },
            pubdate: lv.pubdate || 0, duration: lv.duration || 0,
            tname: '本地视频', local: true,
          };
          clearMain();
          renderMain(ldetail);
          V.localVideos.playInfo(lv).then(function (pi) {
            if (done) return;
            playInfo = pi;
            setupPlayer(pi);
          }).catch(function (e) {
            if (done) return;
            V.toast.error('本地视频播放失败：' + e.message);
          });
        }
        return;
      }
      // ---- 主视频区：详情独立加载 ----
      adapter.getVideoDetail(mId).then(function (detail) {
        if (done) return;
        // v0.5.7：详情数据不存在（幽灵卡 id 已失效 / adapter 返回 null）→
        // 空态而非崩溃（修复 "Cannot set properties of null (setting 'sourceId')"）；
        // 源未启用时优先提示去设置启用（角色页快照卡常见）
        if (!detail || typeof detail !== 'object') {
          clearMain();
          main.insertBefore(V.wall.empty(srcDisabledMsg() || '详情加载失败：视频不存在或已失效', 'codicon-error'), actionsRow);
          return;
        }
        clearMain();
        renderMain(detail);
        // 播放源（可失败：未登录/风控 → toast）
        adapter.getPlayInfo(mId, detail.cid).then(function (pi) {
          if (done) return;
          playInfo = pi;
          setupPlayer(pi);
        }).catch(function (e) {
          if (done) return;
          V.toast.error('播放源获取失败：' + e.message);
        });
      }).catch(function (e) {
        if (done) return;
        clearMain();
        main.insertBefore(V.wall.empty('详情加载失败：' + e.message, 'codicon-error'), actionsRow);
      });
      // ---- 相关推荐区：独立加载（失败静默清空） ----
      adapter.getRelated(mId).then(function (related) {
        if (done) return;
        side.innerHTML = '';
        renderRelated(related || []);
      }).catch(function () {
        if (done) return;
        side.innerHTML = '';
      });
    }

    /** v0.6.1 组详情顶部源切换器：成员 chip（源名 + 标题 + 片段/完整版徽标 +
     *  未激活源置灰）；点击 → loadMember。标题加载成功后 updateChip 回填
     *  v0.6.2 二期：chip 尾部片段/完整版三态按钮（点击循环 默认→完整版→片段→默认）+
     *  组工具行（解除聚合：拆出当前源成员） */
    function renderGroupBar(grpObj) {
      var bar = V.utils.el('div', { className: 'vshell-group-bar' });
      var ordered = V.aggregations.orderMembers(grpObj.id);
      var chips = [];
      ordered.forEach(function (m) {
        var nm = m.src;
        try {
          var ad2 = V.siteAdapters.adapterFor(m.src);
          if (ad2 && ad2.meta && ad2.meta.name) nm = ad2.meta.name;
        } catch (e) { /* noop */ }
        var inactive = m.src !== 'local'
          && (!V.multisource || V.multisource.activeSources().indexOf(m.src) < 0);
        var titleEl = V.utils.el('span', { className: 'vshell-group-chip-title' },
          m.src + ':' + m.id);
        var chipObj = { m: m, titleEl: titleEl };
        var chip = V.utils.el('button', {
          className: 'vshell-group-chip' + (inactive ? ' is-inactive' : ''),
          type: 'button',
          title: (inactive ? '数据源未启用：' : '') + m.src + ':' + m.id,
        }, [
          V.utils.el('span', { className: 'vshell-group-chip-src' }, nm),
          titleEl,
        ]);
        // 片段/完整版三态按钮（v0.6.2；播放排序：完整版优先）
        var partBtn = V.utils.el('button', {
          className: 'vshell-group-chip-partbtn',
          type: 'button',
          title: '标记片段/完整版（点击循环：默认→完整版→片段）',
        }, [V.utils.el('span', { className: 'codicon codicon-circle-outline' })]);
        partBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var next = V.aggUi.markPart(grpObj.id, m.src, m.id);
          refreshChipPart(chipObj, next);
        });
        chipObj.partBtn = partBtn;
        chip.appendChild(partBtn);
        refreshChipPart(chipObj, m.part || 0);
        chip.addEventListener('click', function () {
          loadMember(m.src, m.id);
        });
        chips.push(chipObj);
        chipObj.chip = chip;
        bar.appendChild(chip);
      });
      // v0.6.3：成员条插到 page **顶部**（contentBox 之前）——此前 appendChild
      // 使其落到详情内容之后（页面底部 ~2000px），用户看不到换源按钮
      page.insertBefore(bar, contentBox);
      // v0.6.2 解除聚合：拆出当前播放成员（组>1 时显示；src/id 为闭包当前成员）
      if (grpObj.members.length > 1) {
        var tools = V.utils.el('div', { className: 'vshell-group-tools' }, [
          V.utils.el('button', {
            className: 'vshell-btn vshell-btn-secondary',
            type: 'button',
            onclick: function () {
              if (!V.aggUi) return;
              var n = V.aggUi.unmerge(grpObj.id, src, id);
              if (n < 0) return;
              V.toast.ok(n <= 1 ? '组只剩 1 个成员，已解除聚合' : '已从组中拆出该视频');
              V.router.nav(location.hash);   // 重渲染组详情（重新选默认成员）
            },
          }, '解除聚合'),
        ]);
        page.insertBefore(tools, contentBox);   // v0.6.3：随成员条置顶
      }
      V.__groupChips = chips;
    }
    /** 更新成员 chip 的片段/完整版徽标与三态按钮（v0.6.2） */
    function refreshChipPart(chipObj, part) {
      if (!chipObj || !chipObj.chip) return;
      chipObj.m.part = part;
      chipObj.chip.querySelectorAll('.vshell-group-chip-part').forEach(function (p) { p.remove(); });
      var icon = chipObj.partBtn.querySelector('.codicon');
      if (part === 1) {
        chipObj.chip.appendChild(
          V.utils.el('span', { className: 'vshell-group-chip-part is-full' }, '完整版'));
        if (icon) icon.className = 'codicon codicon-check';
      } else if (part === 2) {
        chipObj.chip.appendChild(
          V.utils.el('span', { className: 'vshell-group-chip-part' }, '片段'));
        if (icon) icon.className = 'codicon codicon-remove';
      } else {
        if (icon) icon.className = 'codicon codicon-circle-outline';
      }
    }
    /** 回填当前成员 chip 标题 + 激活态（render 后调用） */
    function updateChip(mSrc, mId, title) {
      if (!V.__groupChips) return;
      V.__groupChips.forEach(function (c) {
        if (c.m.src === mSrc && String(c.m.id) === String(mId)) {
          c.chip.classList.add('is-active');
          c.titleEl.textContent = title || (mSrc + ':' + mId);
        } else {
          c.chip.classList.remove('is-active');
        }
      });
    }

    // v0.6.1 组详情入口：成员条 + 默认选第一个可用成员；否则普通详情
    if (isGroup) {
      var grpObj = V.aggregations ? V.aggregations.getGroup(gid) : null;
      if (!grpObj || !grpObj.members || !grpObj.members.length) {
        contentBox.appendChild(V.wall.empty('聚合组不存在或已删除', 'codicon-error'));
        return {
          destroy: function () { page.remove(); },
        };
      }
      renderGroupBar(grpObj);
      var ordered = V.aggregations.orderMembers(gid);
      var picked = null;
      for (var oi = 0; oi < ordered.length; oi++) {
        var ok2 = ordered[oi].src === 'local'
          || (V.multisource && V.multisource.activeSources().indexOf(ordered[oi].src) >= 0);
        if (ok2) { picked = ordered[oi]; break; }
      }
      if (!picked) {
        contentBox.appendChild(V.wall.empty('组内没有可播放的成员（请先在设置中启用对应数据源）', 'codicon-error'));
        return {
          destroy: function () { page.remove(); },
        };
      }
      loadMember(picked.src, picked.id);
    } else {
      loadMember(src, id);
    }

    // ---- 渲染 ----
    // v0.6.11：render 拆分 renderMain（主视频区）+ renderRelated（相关推荐区）
    // ——两栏容器由 loadMember 创建，主区/相关区独立填充
    function renderMain(detail) {
      // v0.6.1 聚合：组详情——收藏/待看/黑名单按**组 id**存（组级一条），
      // 标题/封面用组主成员；播放/分镜/相关仍用当前成员（闭包 id 变量）
      if (isGroup) {
        detail.id = gid;
        detail.title = (grpObj && grpObj.title) || detail.title;
        detail.pic = (grpObj && grpObj.cover) || detail.pic;
        detail.sourceId = 'grp';
      } else {
        detail.sourceId = detailSrc;   // v0.5.7 多源：标注归属（收藏/角色按源）
      }
      currentTitle = detail.title || '';
      currentPic = detail.pic || '';
      // v0.6.12：静态操作行的当前详情 + 状态刷新 + 意图补执行
      curDetail = detail;
      updateChip(src, id, detail.title);   // v0.6.1 组详情：回填成员 chip 标题
      refreshSaveBtns();
      if (pendingAction) {
        var pa = pendingAction;
        pendingAction = null;
        doSaveAction(pa);
      }
      // v0.6.12b：操作行从主区底部摘下——内容按序填充后，
      // 在播放卡片正下方挂回（紧贴视频卡片，简介在其后）
      var akMain = actionsRow.parentNode === main ? main.removeChild(actionsRow) : null;

      // 两栏容器已在 loadMember 建好（v0.6.11），main 直接填充
      // 1. 标题（顶部）+ 复制按钮（点击后按钮自身有小动画：图标变对勾 + 脉冲）
      // v0.6.12：返回按钮已静态创建（mount 时挂 page，CSS 固定定位）——加载中
      // 也可见可用，不再由 JS 定位
      var copyBtn = V.utils.el('button', {
        className: 'vshell-icon-btn vshell-detail-copy',
        type: 'button', title: '复制视频标题', 'aria-label': '复制视频标题',
        onclick: function () { copyTitle(detail.title, copyBtn); },
      }, V.utils.el('span', { className: 'codicon codicon-copy' }));
      var titleRow = V.utils.el('div', { className: 'vshell-detail-title-row' }, [
        V.utils.el('h1', { className: 'vshell-detail-title' }, detail.title || ''),
        copyBtn,
      ]);
      main.appendChild(titleRow);

      // 2. 信息条：播放 · 弹幕 · 日期 · 时长（· 分区标签）
      var stats = V.utils.el('div', { className: 'vshell-detail-stats' }, [
        V.utils.el('span', { className: 'vshell-detail-stats-item' },
          V.utils.fmtCount(detail.stat && detail.stat.view) + ' 播放'),
        detail.stat && detail.stat.danmaku
          ? V.utils.el('span', { className: 'vshell-detail-stats-item' },
              V.utils.fmtCount(detail.stat.danmaku) + ' 弹幕')
          : null,
        detail.pubdate
          ? V.utils.el('span', { className: 'vshell-detail-stats-item' }, fmtDate(detail.pubdate))
          : null,
        V.utils.el('span', { className: 'vshell-detail-stats-item' },
          V.utils.fmtTime(detail.duration)),
        detail.tname
          ? V.utils.el('span', { className: 'vshell-detail-meta-tag' }, detail.tname)
          : null,
      ]);
      main.appendChild(stats);

      // 3. UP/角色行（v0.5.0 角色系统）：头像 = 角色图（圆形）/ 冲突 icon
      //（可点击处理）/ UP 头像兜底；名字 = 角色名（无角色时不显示 UP 名）；
      // 右侧编辑按钮 → 手动赋予/删除角色（用户拍板：详情页弹窗）
      // v0.5.3：UP 行可重渲染（characters.onChange → renderUpRow）——
      // 用户需求：点击添加角色后页面立即生效，无需刷新
      // v0.5.6：已有角色头像点击 → 角色主页（用户需求）；更改走独立按钮
      var upRow = V.utils.el('div', { className: 'vshell-detail-up' });
      offChars = null;   // v0.6.1：复用 mount 级声明（曾为 render 局部遮蔽 → destroy ReferenceError）
      /** 视频快照（角色主页「手动添加」列表数据；v0.5.6） */
      function detailMeta() {
        return {
          id: id,
          bvid: detail.bvid || id,
          title: detail.title || '',
          cover: detail.pic || '',
          url: '#/video/' + id,
          pubdate: detail.pubdate || '',   // v0.5.6 第八轮：快照带日期（角色主页卡片右下角）
        };
      }
      function renderUpRow() {
        upRow.innerHTML = '';
        var owner2 = detail.owner || {};
        var cres2 = (V.characters && V.characters.charFor)
          ? V.characters.charFor(id, detail) : { kind: 'none' };
        var roleChar2 = cres2.kind === 'char' ? cres2.char : null;
        var conflictChars2 = cres2.kind === 'conflict' ? cres2.chars : null;
        var avatar2;
        if (conflictChars2) {
          avatar2 = V.utils.el('button', {
            className: 'vshell-detail-up-avatar is-conflict',
            type: 'button',
            title: '匹配到多个角色：' + conflictChars2.join('、') + '——点击选择',
            'aria-label': '角色冲突，点击选择',
          }, [V.utils.el('span', { className: 'codicon codicon-circle-slash' })]);
          avatar2.addEventListener('click', function () {
            if (V.charPicker && V.charPicker.conflict) {
              V.charPicker.conflict(id, detail.title, conflictChars2, detailMeta(), detail.sourceId);
            }
          });
        } else if (roleChar2) {
          // v0.5.6：已有角色头像 = 角色主页入口（点击进入主页；更改走独立按钮）
          avatar2 = V.utils.el('button', {
            className: 'vshell-detail-up-avatar',
            type: 'button',
            title: '角色：' + roleChar2.name + '——点击进入角色主页',
            'aria-label': '角色主页：' + roleChar2.name,
          });
          avatar2.addEventListener('click', function () {
            V.router.nav('/role/' + encodeURIComponent(roleChar2.name));
          });
          var setLetter2 = function () {
            avatar2.innerHTML = '';
            avatar2.appendChild(V.utils.el('span', { className: 'vshell-detail-up-avatar-letter' },
              String(roleChar2.name).charAt(0) || '?'));
          };
          if (roleChar2.icon) {
            avatar2.appendChild(V.utils.el('img', { src: roleChar2.icon, alt: '', onerror: setLetter2 }));
          } else {
            setLetter2();
          }
        } else {
          // v0.5.1：无角色 → 不显示 UP 头像（用户需求）；保留圆形 → 显示 + 号按钮，
          // 文本「添加角色」，点击唤出添加角色 UI（角色列表选择）
          avatar2 = V.utils.el('button', {
            className: 'vshell-detail-up-avatar is-add',
            type: 'button',
            title: '添加角色',
            'aria-label': '添加角色',
          }, [V.utils.el('span', { className: 'codicon codicon-add' })]);
          avatar2.addEventListener('click', function () {
            if (V.charPicker && V.charPicker.edit) {
              V.charPicker.edit(id, detail.title, '添加角色', detailMeta(), detail.sourceId);
            }
          });
        }
        upRow.appendChild(avatar2);
        // v0.5.3：冲突时名字区显示「角色冲突」文本（用户需求）
        // v0.5.6 第十一轮（用户需求 3）：已有角色时名字可点击（更改角色，
        // 取代原独立编辑按钮）+ 右侧关注按钮；冲突/无角色保持文本
        if (roleChar2) {
          upRow.appendChild(V.utils.el('button', {
            className: 'vshell-detail-up-name',
            type: 'button',
            title: '更改角色',
            'aria-label': '更改角色',
            onclick: function () {
              if (V.charPicker && V.charPicker.edit) V.charPicker.edit(id, detail.title, null, detailMeta(), detail.sourceId);
            },
          }, roleChar2.name));
          var followed2 = V.characters && V.characters.isFollowed
            ? V.characters.isFollowed(roleChar2.name) : false;
          var followBtn2 = V.utils.el('button', {
            className: 'vshell-detail-up-follow' + (followed2 ? ' is-followed' : ''),
            type: 'button',
            title: followed2 ? '取消关注' : '关注角色',
            'aria-label': followed2 ? '取消关注' : '关注角色',
            onclick: function (e) {
              // v0.5.6 第十二轮需求 3：pop 动画（背景不变）。**必须先**拿
              // 容器引用：toggleFollow 的 notify 触发 renderUpRow 同步重建
              // up 行——重建后旧按钮 parentNode 断开（closest 失败）
              var upEl = e.target && e.target.closest
                ? e.target.closest('.vshell-detail-up') : null;
              V.characters.toggleFollow(roleChar2.name);
              var nb = upEl ? upEl.querySelector('.vshell-detail-up-follow') : null;
              if (nb) {
                nb.classList.remove('is-popping');
                void nb.offsetWidth;
                nb.classList.add('is-popping');
              }
            },
          }, V.utils.el('span', {
            className: 'codicon ' + (followed2 ? 'codicon-check' : 'codicon-add'),
          }));
          upRow.appendChild(followBtn2);
        } else {
          upRow.appendChild(V.utils.el('span', {
            className: 'vshell-detail-up-name' + (conflictChars2 ? ' is-conflict' : ''),
          }, conflictChars2 ? '角色冲突' : '添加角色'));
        }
      }
      renderUpRow();
      if (V.characters && V.characters.onChange) {
        offChars = V.characters.onChange(renderUpRow);
      }
      main.appendChild(upRow);

      // 4. 播放卡片（左栏全宽 → 主视频放大）
      var playerCard = V.utils.el('div', { className: 'vshell-detail-player-card' });
      player = V.player.create({ watchId: id, poster: currentPic });   // v0.2.6：加载背景用封面
      playerCard.appendChild(player.root);
      main.appendChild(playerCard);

      // 5. 操作行（v0.6.12 静态创建，加载中/空态也可见可用；
      // v0.6.12b：紧贴播放卡片正下方——播放卡后挂回，简介在其后）
      if (akMain) main.appendChild(akMain);
      refreshSaveBtns();

      // 6. 简介（超长折叠）
      if (detail.desc) {
        var descBox = V.utils.el('div', { className: 'vshell-detail-desc' });
        var descText = V.utils.el('p', { className: 'vshell-detail-desc-text' }, detail.desc);
        descBox.appendChild(descText);
        if (detail.desc.length > 120) {
          descBox.classList.add('is-collapsed');
          var more = V.utils.el('button', {
            className: 'vshell-detail-desc-toggle', type: 'button',
            onclick: function () {
              var collapsed = descBox.classList.toggle('is-collapsed');
              more.textContent = collapsed ? '展开' : '收起';
            },
          }, '展开');
          descBox.appendChild(more);
        }
        main.appendChild(descBox);
      }

      // v0.6.1：当前渲染的清理函数（成员切换/页面卸载时统一销毁，
      // 避免 player/监听/分镜任务泄漏到下一次渲染）
      // v0.6.11：layout 由 loadMember 复用（成员切换不销毁），
      // 页面卸载时随 page.remove() 一起移除
      curCleanup = function () {
        if (offChars) { try { offChars(); } catch (e) { /* noop */ } offChars = null; }
        if (offGapChange) { try { offGapChange(); } catch (e) { /* noop */ } offGapChange = null; }
        if (shotsDetach) { try { shotsDetach(); } catch (e) { /* noop */ } shotsDetach = null; }
        if (shotsStopScan) { try { shotsStopScan(); } catch (e) { /* noop */ } shotsStopScan = null; }
        hideScanProgress();
        if (player) { try { player.destroy(); } catch (e) { /* noop */ } player = null; }
      };
    }

    /** v0.6.11 相关推荐区独立渲染（右栏列表，学 bilibili：缩略图 + 标题 +
     *  UP·播放数）；v0.3.2 黑名单：全站过滤（相关推荐也隐藏被屏蔽的视频） */
    function renderRelated(related) {
      var relatedOk = V.blacklist ? V.blacklist.filter(related) : related;
      if (!relatedOk || !relatedOk.length) return;
      var list = V.utils.el('ul', { className: 'vshell-detail-related' });
      relatedOk.forEach(function (r) {
        var rv = r.stat && r.stat.view;
        var thumb = V.utils.el('span', { className: 'vshell-detail-related-thumb' }, [
          r.pic
            ? V.utils.el('img', { src: r.pic, alt: '', loading: 'lazy' })
            : V.utils.el('span', { className: 'codicon codicon-play' }),
          r.duration
            ? V.utils.el('span', { className: 'vshell-detail-related-dur' }, V.utils.fmtTime(r.duration))
            : null,
        ]);
        var info = V.utils.el('span', { className: 'vshell-detail-related-info' }, [
          V.utils.el('span', { className: 'vshell-detail-related-name' }, r.title || ''),
          V.utils.el('span', { className: 'vshell-detail-related-meta' },
            ((r.owner && r.owner.name) || '') +
            (rv ? ' · ' + V.utils.fmtCount(rv) + '播放' : '')),
        ]);
        var li = V.utils.el('li');
        li.appendChild(V.utils.el('a', {
          className: 'vshell-detail-related-item',
          href: '#/video/' + encodeURIComponent(r.id),
          title: r.title || '',
        }, [thumb, info]));
        list.appendChild(li);
      });
      side.appendChild(list);
    }

    function actionBtn(icon, label, kind) {
      var b = V.utils.el('button', {
        className: 'vshell-btn vshell-btn-secondary vshell-detail-save',
        type: 'button', 'data-kind': kind, 'aria-pressed': 'false',
      }, [
        V.utils.el('span', { className: 'codicon ' + icon }),
        V.utils.el('span', { className: 'vshell-btn-text' }, label),
      ]);
      return b;
    }

    function copyTitle(title, btn) {
      // 按钮自身小动画：图标变对勾 + 脉冲（用户需求：不只 toast 提示）
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

    // ---- 播放 ----
    function setupPlayer(pi) {
      if (pi.type === 'url' && pi.url) {
        player.load(pi.url);        // v0.5.6 第十二轮：本地视频直链 / 17c 等插件 m3u8 直链
      } else if (pi.type === 'hls' && pi.url) {
        // m3u8 直链（AcFun 桥返回 type:'hls'）：hls.js 播放；
        // 有 master（h264 各档合成 playlist）时转 blob: URL 让 hls.js 原生 ABR
        var hlsUrl = pi.url;
        if (pi.master && pi.master.indexOf('#EXT-X-STREAM-INF') !== -1) {
          try {
            hlsUrl = URL.createObjectURL(new Blob([pi.master],
              { type: 'application/vnd.apple.mpegurl' }));
          } catch (e) { /* noop */ }
        }
        player.load(hlsUrl);
      } else if (pi.type === 'durl' && pi.durl && pi.durl.length) {
        player.load(pi.durl[0].url);
      } else if (pi.dash && pi.dash.video) {
        try {
          player.loadDash(pi);
        } catch (e) {
          V.toast.error('DASH 播放初始化失败：' + e.message);
          return;
        }
      } else {
        V.toast.error('无可用播放源');
        return;
      }
      // 进入详情页自动播放（用户需求）：player.play() 自带
      // 「有声被拒 → 静音兜底」策略（无手势有声播放可能被浏览器拒绝）
      player.play();
      setupShots(pi);
    }

    // ---- 分镜识别（shots.js）：进度条节点 + 边播分析 + 快扫 ----
    // 渲染统一读合并缓存（单一事实源）——attach/scan 任何一方产点都
    // 立即持久化到缓存，节点单调增长，杜绝「两套节点来回切」。
    // 不重复识别：已识别（缓存非空或 scanned 标记）不再快扫；
    // 未识别：快扫全量 → 完成后才挂边播分析（串行，不并行重复识别）
    function setupShots(pi) {
      var bar = player.root.querySelector('.vshell-player-bar');
      function render() {
        V.shots.renderNodes(bar, V.shots.get(id), pi.duration);
      }
      // 间隔 t 变化（控制栏滑块）→ 重新约束渲染节点（含回溯复活）
      if (offGapChange) { try { offGapChange(); } catch (e) {} offGapChange = null; }
      offGapChange = V.shots.onGapChange(render);
      var scanned = V.shots.get(id) || V.shots.isScanned(id);
      if (scanned) {
        render();
        // 已识别 → 边播分析补充（不再触发快扫）
        shotsDetach = V.shots.attach(player, { id: id, onUpdate: render });
      } else {
        // 未识别 → **并行**：立即挂边播分析（播放即产点，用户马上看到节点）
        // + 后台快扫补全片（真实长视频快扫要几分钟，不能干等）
        shotsDetach = V.shots.attach(player, { id: id, onUpdate: render });
        scanWin = V.utils.el('div', { className: 'vshell-scan-window' });
        player.root.appendChild(scanWin);
        // v0.4.5：已识别进度不再显示在进度条内（用户回退）——快扫静默进行
        shotsStopScan = V.shots.scan(pi, {
          id: id, duration: pi.duration,
          container: scanWin,
          onUpdate: render,
          onDone: function () {
            hideScanProgress();
            render();
            // 全覆盖无上限（用户需求）：完成即全片节点
            V.toast.ok('分镜识别完成（' + ((V.shots.get(id) || []).length) + ' 个节点）');
          },
        });
      }
    }
    // 重新识别：清缓存/标记 → 停旧任务 → 重跑 setupShots
    function rescanShots() {
      if (!playInfo) { V.toast.error('播放源尚未就绪，请稍候'); return; }
      if (shotsStopScan) { try { shotsStopScan(); } catch (e) {} shotsStopScan = null; }
      if (shotsDetach) { try { shotsDetach(); } catch (e) {} shotsDetach = null; }
      hideScanProgress();
      V.shots.clear(id);
      setupShots(playInfo);
      V.toast.info('已清除分镜缓存，重新识别中…');
    }
    function hideScanProgress() {
      if (scanWin) { scanWin.remove(); scanWin = null; }
    }

    // ---- 下载：先嗅探当前视频的媒体地址 → medl 直链下载（m3u8 转 MP4 /
    //      直链并发分块）→ 进度显示在下载面板（v0.5.6 用户需求：
    //      「点击下载按钮后，先以嗅探的方式获取到当前视频的下载地址，
    //      然后自动调用此方式下载，并在下载面板中显示进度」）----
    function sniffCurrentUrl() {
      // 1) 播放器 video 元素直链（video src 非 blob = 可直接下载）
      try {
        if (player && player.root) {
          var v = player.root.querySelector('video');
          var s = v ? (v.currentSrc || v.src || '') : '';
          if (s && !/^blob:/.test(s)) return s;
        }
      } catch (e) { /* noop */ }
      // 2) 嗅探缓存兜底：MSE/blob 流时 video.src 不可用，但
      //    PerformanceObserver 捕获的最近一个可下载媒体请求（m4s/ts/
      //    mp4 分片）通常就是当前视频的源
      if (V.sniffer && V.sniffer.list) {
        var items = V.sniffer.list();
        for (var i = items.length - 1; i >= 0; i--) {
          var it = items[i];
          if (it && it.ok && it.url && !/^blob:/.test(it.url)) return it.url;
        }
      }
      return null;
    }
    function startDownload() {
      var name = V.utils.sanitizeFilename(currentTitle) || 'video';
      var url = sniffCurrentUrl();
      if (!url) {
        V.toast.error('未嗅探到可下载的媒体地址（当前视频可能是加密/MSE 流）');
        return;
      }
      var kind = (V.medl && V.medl.detect) ? V.medl.detect(url) : 'media';
      V.downloader.addMedl(url, { title: name, pic: currentPic || '', kind: kind });
    }

    return {
      destroy: function () {
        done = true;
        // v0.6.1：统一走 curCleanup（含成员切换残留的 player/监听/分镜任务）
        if (curCleanup) { try { curCleanup(); } catch (e) { /* noop */ } curCleanup = null; }
        page.remove();
      },
    };
  }

  /** 日期格式化：pubdate（秒）→ YYYY-MM-DD（本地时区） */
  function fmtDate(pubdate) {
    var d = new Date(pubdate * 1000);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  V.pages = V.pages || {};
  V.pages.video = { mount: mount };
})();
