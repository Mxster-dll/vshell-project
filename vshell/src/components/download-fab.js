/* ============================================================
 * download-fab — 全局下载进度：右下角悬浮胶囊 + 展开抽屉
 * - 有活动任务（下载中/合并/暂停）时显示；聚合进度条
 * - 点击胶囊展开抽屉：任务迷你列表 + 全部暂停/继续 + 去下载管理
 * - 动画：胶囊滑入、抽屉缩放淡入
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var root = null, capsule = null, countEl = null, barFill = null,
      drawer = null, listEl = null, expanded = false;

  function activeTasks(tasks) {
    return tasks.filter(function (t) {
      return t.status === 'downloading' || t.status === 'merging' || t.status === 'paused';
    });
  }
  function aggregate(tasks) {
    var act = activeTasks(tasks);
    var done = 0, total = 0;
    act.forEach(function (t) {
      if (t.mode === 'medl') {
        total += 1;
        done += (t.progress || 0);
        return;
      }
      t.tracks.forEach(function (tr) { total += tr.size || 0; done += tr.doneBytes || 0; });
    });
    return { act: act, pct: total ? Math.min(100, done / total * 100) : 0 };
  }

  function render() {
    root = V.utils.el('div', { className: 'vshell-fab', hidden: '' });
    capsule = V.utils.el('button', {
      className: 'vshell-fab-capsule',
      type: 'button',
      'aria-label': '下载进度',
      onclick: toggle,
    }, [
      V.utils.el('span', { className: 'codicon codicon-cloud-download vshell-fab-icon' }),
      V.utils.el('span', { className: 'vshell-fab-count' }, '0'),
      V.utils.el('span', { className: 'vshell-fab-bar' }, [
        V.utils.el('span', { className: 'vshell-fab-bar-fill' }),
      ]),
    ]);
    drawer = V.utils.el('div', { className: 'vshell-fab-drawer', hidden: '' }, [
      V.utils.el('div', { className: 'vshell-fab-drawer-head' }, [
        V.utils.el('span', { className: 'vshell-fab-drawer-title' }, '下载进度'),
        V.utils.el('button', {
          className: 'vshell-fab-drawer-close codicon codicon-close',
          type: 'button', 'aria-label': '收起',
          onclick: function () { setExpanded(false); },
        }),
      ]),
      V.utils.el('div', { className: 'vshell-fab-drawer-list' }),
      V.utils.el('div', { className: 'vshell-fab-drawer-foot' }, [
        V.utils.el('button', {
          className: 'vshell-fab-drawer-btn', type: 'button',
          onclick: pauseAll,
        }, '全部暂停'),
        V.utils.el('button', {
          className: 'vshell-fab-drawer-btn', type: 'button',
          onclick: resumeAll,
        }, '全部继续'),
        V.utils.el('a', {
          className: 'vshell-fab-drawer-btn vshell-fab-drawer-link',
          href: '#/downloads',
        }, '下载管理'),
      ]),
    ]);
    listEl = drawer.querySelector('.vshell-fab-drawer-list');
    countEl = capsule.querySelector('.vshell-fab-count');
    barFill = capsule.querySelector('.vshell-fab-bar-fill');
    root.appendChild(capsule);
    root.appendChild(drawer);
  }

  function setExpanded(v) {
    expanded = v;
    drawer.hidden = !v;
    capsule.classList.toggle('is-expanded', v);
  }
  function toggle() {
    setExpanded(!expanded);
  }
  function pauseAll() {
    activeTasks(V.downloader.list()).forEach(function (t) { V.downloader.pause(t.id); });
  }
  function resumeAll() {
    activeTasks(V.downloader.list()).forEach(function (t) { V.downloader.resume(t.id); });
  }

  function rowFor(t) {
    var r = V.utils.el('div', { className: 'vshell-fab-row' });
    var thumb = V.utils.el('img', {
      className: 'vshell-fab-row-thumb', src: t.pic || '', alt: '', loading: 'lazy',
    });
    var info = V.utils.el('div', { className: 'vshell-fab-row-info' }, [
      V.utils.el('div', { className: 'vshell-fab-row-title' }, t.title || ''),
      V.utils.el('div', { className: 'vshell-fab-row-bar' }, [
        V.utils.el('span', { className: 'vshell-fab-row-bar-fill' }),
      ]),
      V.utils.el('div', { className: 'vshell-fab-row-meta' }, [
        V.utils.el('span', { className: 'vshell-fab-row-status vshell-status-' + t.status },
          statusText(t)),
        V.utils.el('span', { className: 'vshell-fab-row-speed' },
          t.status === 'downloading' && t.speed ? V.downloader.fmtBytes(t.speed) + '/s' : ''),
      ]),
    ]);
    r.appendChild(thumb);
    r.appendChild(info);
    r.addEventListener('click', function () {
      setExpanded(false);
      location.hash = '#/downloads';
    });
    return r;
  }
  function statusText(t) {
    var m = {
      downloading: '下载中', merging: '合并中', paused: '已暂停',
      done: '完成', failed: '失败', canceled: '已取消', queued: '排队中',
    };
    return m[t.status] || t.status;
  }
  function update(tasks) {
    var agg = aggregate(tasks);
    root.hidden = !agg.act.length;
    countEl.textContent = agg.act.length;
    barFill.style.width = agg.pct + '%';
    capsule.classList.toggle('is-paused', agg.act.some(function (t) { return t.status === 'paused'; }));

    listEl.innerHTML = '';
    agg.act.forEach(function (t) {
      var row = rowFor(t);
      var fill = row.querySelector('.vshell-fab-row-bar-fill');
      if (t.mode === 'medl') {
        fill.style.width = Math.min(100, (t.progress || 0) * 100) + '%';
      } else {
        var total = t.tracks.reduce(function (s, x) { return s + (x.size || 0); }, 0);
        var done = t.tracks.reduce(function (s, x) { return s + (x.doneBytes || 0); }, 0);
        fill.style.width = (total ? done / total * 100 : 0) + '%';
      }
      listEl.appendChild(row);
    });
  }

  function init() {
    render();
    var app = document.querySelector('.vshell-app');
    if (app) app.appendChild(root);
    V.downloader.on(update);
    update(V.downloader.list());
  }

  V.fab = { init: init };
})();
