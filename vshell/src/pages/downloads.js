/* ============================================================
 * downloads — 下载管理页
 * 全局：线程数（1/2/4/8）、导入/导出记录、清空已完成
 * 任务卡片：封面/标题/状态/模式徽章/总进度/分轨进度/速度
 *         + 暂停/继续/取消/重试/移除
 * 说明：页面刷新后恢复任务需重新选择保存位置（FSA 手柄不跨页）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  function mount(outlet) {
    var done = false;
    var page = V.utils.el('div', { className: 'vshell-page vshell-page-downloads' });
    outlet.appendChild(page);

    // ---- 头部 ----
    var head = V.utils.el('div', { className: 'vshell-page-head' }, [
      V.utils.el('h1', { className: 'vshell-page-title' }, '下载管理'),
    ]);
    var controls = V.utils.el('div', { className: 'vshell-downloads-controls' });

    var threadWrap = V.utils.el('label', { className: 'vshell-control' }, [
      V.utils.el('span', { className: 'vshell-control-label' }, '并发数'),
      V.utils.el('select', {
        className: 'vshell-select',
        onchange: function () {
          V.downloader.config.threads = parseInt(this.value, 10) || 4;
        },
      }, [4, 2, 8, 1].map(function (n) {
        var o = document.createElement('option');
        o.value = String(n);
        o.textContent = String(n);
        if (n === V.downloader.config.threads) o.selected = true;
        return o;
      })),
    ]);
    threadWrap.querySelector('select').value = String(V.downloader.config.threads);

    controls.appendChild(threadWrap);
    controls.appendChild(V.utils.el('button', {
      className: 'vshell-btn vshell-btn-secondary', type: 'button',
      onclick: function () { V.store.downloadJSON('vshell-backup.json'); },
    }, [
      V.utils.el('span', { className: 'codicon codicon-export' }),
      V.utils.el('span', { className: 'vshell-btn-text' }, '导出记录'),
    ]));
    controls.appendChild(V.utils.el('button', {
      className: 'vshell-btn vshell-btn-secondary', type: 'button',
      onclick: function () {
        V.store.importFromFile().then(function (n) {
          V.toast.ok('已导入 ' + n + ' 条记录');
        }).catch(function (e) {
          V.toast.error('导入失败：' + e.message);
        });
      },
    }, [
      V.utils.el('span', { className: 'codicon codicon-import' }),
      V.utils.el('span', { className: 'vshell-btn-text' }, '导入记录'),
    ]));
    controls.appendChild(V.utils.el('button', {
      className: 'vshell-btn vshell-btn-secondary', type: 'button',
      onclick: function () {
        V.downloader.clearDone();
        V.toast.info('已清空完成/失败/取消的任务');
      },
    }, [
      V.utils.el('span', { className: 'codicon codicon-clear-all' }),
      V.utils.el('span', { className: 'vshell-btn-text' }, '清空已完成'),
    ]));
    // v0.2.0 观看历史：清除按钮（用户拍板入口；二次确认防误触）
    var clearWatchedBtn = null, clearWatchedTimer = null;
    function resetClearWatched() {
      if (!clearWatchedBtn) return;
      clearWatchedBtn.querySelector('.vshell-btn-text').textContent = '清除观看记录';
      clearWatchedBtn.classList.remove('is-confirm');
    }
    clearWatchedBtn = V.utils.el('button', {
      className: 'vshell-btn vshell-btn-secondary vshell-dl-clearwatched', type: 'button',
      onclick: function () {
        if (!clearWatchedBtn.classList.contains('is-confirm')) {
          clearWatchedBtn.querySelector('.vshell-btn-text').textContent = '确认清除？';
          clearWatchedBtn.classList.add('is-confirm');
          if (clearWatchedTimer) clearTimeout(clearWatchedTimer);
          clearWatchedTimer = setTimeout(resetClearWatched, 3000);
          return;
        }
        if (clearWatchedTimer) { clearTimeout(clearWatchedTimer); clearWatchedTimer = null; }
        var n = V.watched ? V.watched.clear() : 0;
        resetClearWatched();
        V.toast.ok(n ? ('已清除 ' + n + ' 条观看记录') : '没有观看记录');
      },
    }, [
      V.utils.el('span', { className: 'codicon codicon-history' }),
      V.utils.el('span', { className: 'vshell-btn-text' }, '清除观看记录'),
    ]);
    controls.appendChild(clearWatchedBtn);
    head.appendChild(controls);
    page.appendChild(head);

    var listHost = V.utils.el('div', { className: 'vshell-downloads-list' });
    page.appendChild(listHost);

    // ---- 渲染 ----
    var STATUS_TEXT = {
      queued: '排队中', downloading: '下载中', merging: '合并中',
      paused: '已暂停', done: '已完成', failed: '失败', canceled: '已取消',
    };
    function taskCard(t) {
      var card = V.utils.el('div', { className: 'vshell-dl-card vshell-status-' + t.status });

      var thumb = V.utils.el('img', {
        className: 'vshell-dl-thumb', src: t.pic || '', alt: '', loading: 'lazy',
      });

      var main = V.utils.el('div', { className: 'vshell-dl-main' });
      var top = V.utils.el('div', { className: 'vshell-dl-top' }, [
        V.utils.el('div', { className: 'vshell-dl-title' }, t.title || ''),
        V.utils.el('span', { className: 'vshell-dl-chip vshell-dl-chip-status' }, STATUS_TEXT[t.status] || t.status),
        V.utils.el('span', { className: 'vshell-dl-chip vshell-dl-chip-mode' },
          t.mode === 'merge' ? '合并 MP4'
            : t.mode === 'medl' ? (t.kind === 'm3u8' ? 'm3u8 转 MP4' : '直链多线程')
            : '双文件'),
        t.qualityLabel ? V.utils.el('span', { className: 'vshell-dl-chip' }, t.qualityLabel) : null,
      ]);
      main.appendChild(top);

      // 总进度（medl 任务无分轨，用自身 progress 0-1）
      var isMedl = t.mode === 'medl';
      var total = isMedl ? 1 : t.tracks.reduce(function (s, x) { return s + (x.size || 0); }, 0);
      var tdone = isMedl ? (t.progress || 0) : t.tracks.reduce(function (s, x) { return s + (x.doneBytes || 0); }, 0);
      var pct = total ? Math.min(100, tdone / total * 100) : 0;
      var barRow = V.utils.el('div', { className: 'vshell-dl-bar' }, [
        V.utils.el('span', { className: 'vshell-dl-bar-fill' }),
      ]);
      barRow.querySelector('.vshell-dl-bar-fill').style.width = pct + '%';
      main.appendChild(barRow);

      var meta = V.utils.el('div', { className: 'vshell-dl-meta' }, [
        V.utils.el('span', {}, Math.round(pct) + '%'),
        t.status === 'downloading' && t.speed
          ? V.utils.el('span', {}, V.downloader.fmtBytes(t.speed) + '/s')
          : null,
        V.utils.el('span', {}, isMedl
          ? ((t.files && t.files[0] && t.files[0].name) || '')
          : V.downloader.fmtBytes(tdone) + ' / ' + V.downloader.fmtBytes(total)),
      ]);
      main.appendChild(meta);

      // 分轨进度（medl 任务无分轨）
      if (t.tracks && t.tracks.length) t.tracks.forEach(function (tr) {
        var trPct = tr.size ? Math.min(100, tr.doneBytes / tr.size * 100) : 100;
        var row = V.utils.el('div', { className: 'vshell-dl-track' }, [
          V.utils.el('span', { className: 'vshell-dl-track-label' },
            (tr.kind === 'video' ? '视频' : '音频') +
            (tr.width ? ' ' + tr.width + '×' + tr.height : '')),
          V.utils.el('span', { className: 'vshell-dl-track-bar' }, [
            V.utils.el('span', { className: 'vshell-dl-track-fill' }),
          ]),
          V.utils.el('span', { className: 'vshell-dl-track-pct' },
            tr.size ? Math.round(trPct) + '%' : '--'),
        ]);
        row.querySelector('.vshell-dl-track-fill').style.width = (tr.size ? trPct : 100) + '%';
        main.appendChild(row);
      });

      if (t.error) {
        main.appendChild(V.utils.el('div', { className: 'vshell-dl-error' }, t.error));
      }

      // 操作
      var ops = V.utils.el('div', { className: 'vshell-dl-ops' });
      if (t.status === 'downloading') {
        if (t.mode !== 'medl') {
          ops.appendChild(opBtn('codicon-debug-pause', '暂停', function () { V.downloader.pause(t.id); }));
        }
        ops.appendChild(opBtn('codicon-close', '取消', function () { V.downloader.cancel(t.id); }));
      } else if (t.status === 'paused') {
        ops.appendChild(opBtn('codicon-play', '继续', function () { V.downloader.resume(t.id); }));
        ops.appendChild(opBtn('codicon-close', '取消', function () { V.downloader.cancel(t.id); }));
      } else if (t.status === 'failed') {
        ops.appendChild(opBtn('codicon-refresh', '重试', function () { V.downloader.retry(t.id); }));
        ops.appendChild(opBtn('codicon-trash', '移除', function () { V.downloader.remove(t.id); }));
      } else if (t.status === 'canceled' || t.status === 'done') {
        ops.appendChild(opBtn('codicon-trash', '移除', function () { V.downloader.remove(t.id); }));
      }
      main.appendChild(ops);

      card.appendChild(thumb);
      card.appendChild(main);
      return card;
    }
    function opBtn(icon, label, fn) {
      return V.utils.el('button', {
        className: 'vshell-btn vshell-btn-secondary vshell-dl-op', type: 'button',
        onclick: fn,
      }, [
        V.utils.el('span', { className: 'codicon ' + icon }),
        V.utils.el('span', { className: 'vshell-btn-text' }, label),
      ]);
    }

    function render(tasks) {
      if (done) return;
      listHost.innerHTML = '';
      if (!tasks.length) {
        var go = V.utils.el('a', {
          className: 'vshell-btn vshell-btn-primary', href: '#/',
        }, '去逛逛');
        listHost.appendChild(V.wall.empty('暂无下载任务', 'codicon-cloud-download', go));
        return;
      }
      tasks.forEach(function (t) { listHost.appendChild(taskCard(t)); });
    }

    var rerender = V.utils.debounce(function () {
      render(V.downloader.list());
    }, 250);
    V.downloader.on(function () { rerender(); });

    render(V.downloader.list());

    return {
      destroy: function () {
        done = true;
        page.remove();
      },
    };
  }

  V.pages = V.pages || {};
  V.pages.downloads = { mount: mount };
})();
