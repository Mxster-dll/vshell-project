/* ============================================================
 * multiwall — 多源视频墙组合层（v0.6.0 重构：数据源隔离 + 增量拉取）
 *
 * 用户拍板 2026-08 grilling 的「分级请求」双层结构的上层（混插层）：
 *   - 每个激活源一个 source-feed（数据源层，独立预取 + 缓存分片）
 *   - 出卡按「上一个卡片属于哪个源 → 轮转到下一个源」取卡（abcabc），
 *     拼接处不允许同源；耗尽源跳过，只剩单源就连续
 *   - 渲染窗口预算 = multisource.windowSize()（一次 fill 前窗口个，余下
 *     存各源队列）；滚动补卡时源队列空 → source-feed 自动增量预取
 *   - 冷启动：并行 init 各源 feed（读缓存分片 → 后台增量拉取）
 *   - 去重：source-feed 内部按「源内 id」去重（跨源同 id 是两个实体，
 *     不去重）；item 标注 sourceId
 *   - 单源时退化：轮转退化为顺序取（行为与旧墙一致）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  /** create(host, opts) → { destroy, updateChars, getRenderedCount }
   *  opts.fetch(srcId, page) → Promise<{items, hasMore, baseUrl?}> | null
   *  opts.cacheKey（缓存分片 base，如 'wall.home'；缺省 'wall'）
   *  opts.filter(items) → items（黑名单过滤，可选）
   *  opts.emptyText / opts.emptyIcon（全空时）
   *  opts.doneCb()（全部源 hasMore=false 且队列空） */
  function create(host, opts) {
    opts = opts || {};
    var ids = V.multisource.activeSources();
    var feeds = {};
    var rotate = 0;
    var rendered = [];
    var busy = false;
    var wallEl = null;
    var sentinelEl = null;
    var destroyed = false;
    var allDone = false;

    ids.forEach(function (id) {
      feeds[id] = V.sourceFeed.create({
        srcId: id,
        cacheKey: opts.cacheKey || 'wall',
        fetchFn: function (page) { return opts.fetch(id, page); },
        filter: opts.filter,
        onDrain: function () { checkAllDone(); },
        // v0.6.20 后台预取刷新缓存后，原地热更新已渲染卡片的播放/弹幕数
        onData: function () {
          if (V.videoCard && V.videoCard.hotUpdateStats && feeds[id]) {
            V.videoCard.hotUpdateStats(feeds[id].items());
          }
        },
      });
    });

    /** 轮转取卡：从指针开始扫一圈，取第一个有货源的队头；
     *  指针移到被取源的下一个（接续轮转 abcabc；耗尽源自动跳过） */
    function takeOne() {
      var n = ids.length;
      for (var i = 0; i < n; i++) {
        var f = feeds[ids[(rotate + i) % n]];
        var it = f.take();
        if (it) {
          rotate = (rotate + i + 1) % n;
          return it;
        }
      }
      return null;
    }

    function allSourcesDone() {
      return ids.every(function (id) { return feeds[id].isDone(); });
    }

    /** 从队列取卡补到目标数（rendered 增量）；返回本次新增 item 数组 */
    function fillWindow() {
      var target = rendered.length + V.multisource.windowSize();
      var added = [];
      while (rendered.length < target) {
        var it = takeOne();
        if (!it) break;
        rendered.push(it);
        added.push(it);
      }
      return added;
    }

    function append(added) {
      if (!added || !added.length || destroyed) return;
      var start = rendered.length - added.length;
      if (!wallEl) {
        renderWall();
        return;
      }
      V.wall.appendCards(wallEl, added, start, { blacklistMode: !!opts.blacklistMode });
      if (sentinelEl) sentinelEl.retrigger();
    }

    function renderWall() {
      host.innerHTML = '';
      if (rendered.length) {
        wallEl = V.wall.grid(rendered, { empty: false });
        host.appendChild(wallEl);
        if (sentinelEl) { try { sentinelEl.el.remove(); } catch (e) { /* noop */ } sentinelEl = null; }
        sentinelEl = V.wall.sentinel(function () { more(); });
        host.appendChild(sentinelEl.el);
      } else {
        wallEl = null;
        host.appendChild(V.wall.empty(opts.emptyText || '这里还没有内容', opts.emptyIcon || 'codicon-inbox'));
      }
    }

    function checkAllDone() {
      if (destroyed) return;
      if (allSourcesDone() && !allDone) {
        allDone = true;
        if (opts.doneCb) { try { opts.doneCb(); } catch (e) { /* noop */ } }
        if (sentinelEl) { try { sentinelEl.el.remove(); } catch (e) { /* noop */ } sentinelEl = null; }
      }
    }

    /** 滚动补卡：先取队列，再触发各源预取（source-feed 增量拉取）→ 再取 */
    function more() {
      if (busy || destroyed) return;
      busy = true;
      var added = fillWindow();
      if (added.length) append(added);
      // 各源 feed.ready()：队列非空立即 true；确定无更多 false；否则预取
      var pending = ids.map(function (id) { return feeds[id].ready(); });
      Promise.all(pending).then(function () {
        if (destroyed) { busy = false; return; }
        var a2 = fillWindow();
        if (a2.length) append(a2);
        busy = false;
        checkAllDone();
        if (sentinelEl && allDone) {
          try { sentinelEl.el.remove(); } catch (e) { /* noop */ } sentinelEl = null;
        }
      });
    }

    /** 初始化：并行 init 各源 feed（读缓存 → 后台增量拉取）→ 装配窗口 */
    function init() {
      var pending = ids.map(function (id) { return feeds[id].init(); });
      Promise.all(pending).then(function () {
        if (destroyed) return;
        var added = fillWindow();
        if (added.length) {
          rendered = added;   // 首次：直接装配（fillWindow 已 push，防重复）
          renderWall();
        } else {
          renderWall();       // 全空 → 空态
          checkAllDone();
        }
        // 首屏填不满一窗（源内容少）→ 主动预取一次
        if (rendered.length < V.multisource.windowSize()) {
          more();
        }
      });
    }

    init();

    return {
      destroy: function () {
        destroyed = true;
        ids.forEach(function (id) { if (feeds[id]) feeds[id].destroy(); });
        if (sentinelEl) { try { sentinelEl.el.remove(); } catch (e) { /* noop */ } sentinelEl = null; }
      },
      updateChars: function () {
        if (!wallEl) return 0;
        return V.wall.updateChars(wallEl);
      },
      getRenderedCount: function () { return rendered.length; },
    };
  }

  V.multiwall = { create: create };
})();
