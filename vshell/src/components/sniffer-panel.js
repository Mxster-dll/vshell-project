/* ============================================================
 * sniffer-panel — 视频嗅探面板（v0.5.6 第二十七轮）
 * 导航栏「嗅探」按钮打开：列出嗅探到的媒体资源（video 元素 /
 * 网络请求），每行显示标题 + 类型 + 大小 + 来源，点击下载
 * （FSA 保存对话框 / Blob 降级，进度实时反馈）。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var panel = null;          // 当前 backdrop

  function open() {
    if (panel) { close(); return; }
    var overlay = V.utils.el('div', {
      className: 'vshell-modal-backdrop vshell-picker-backdrop',
    });
    var box = V.utils.el('div', {
      className: 'vshell-modal vshell-tag-modal vshell-sniffer-panel',
    });
    var titleRow = V.utils.el('div', { className: 'vshell-modal-title-row' }, [
      V.utils.el('div', { className: 'vshell-modal-title' }, '视频嗅探'),
      V.utils.el('button', {
        className: 'vshell-btn vshell-btn-secondary vshell-sniff-rescan',
        type: 'button',
        title: '重新扫描页面媒体',
        onclick: function () {
          V.sniffer.scanNow();
          renderRows();
          V.toast.info('扫描到 ' + V.sniffer.list().length + ' 个媒体资源');
        },
      }, [
        V.utils.el('span', { className: 'codicon codicon-refresh' }),
        V.utils.el('span', {}, '重新扫描'),
      ]),
    ]);
    // v0.5.6 第二十八轮：URL 直链输入（FetchV 式——直接对视频网址下载；
    // m3u8 自动转 MP4；多线程。不使用网站提供的下载引擎）
    var urlRow = V.utils.el('div', { className: 'vshell-sniff-urlrow' }, [
      V.utils.el('input', {
        className: 'vshell-st-input vshell-sniff-url',
        type: 'url',
        placeholder: '粘贴视频网址（.m3u8 / .mp4 等）直接下载…',
      }),
      V.utils.el('button', {
        className: 'vshell-btn vshell-btn-primary vshell-sniff-urldl',
        type: 'button',
        title: '下载此网址（m3u8 自动转 MP4，多线程）',
        onclick: function () {
          var u = (urlInput.value || '').trim();
          if (!u) { V.toast.info('请先粘贴视频网址'); return; }
          var kind = V.medl.detect(u);
          dlUrlBtn.disabled = true;
          dlUrlBtn.textContent = kind === 'm3u8' ? '解析中…' : '下载中…';
          V.medl.download(u, {
            name: 'download',
            onProgress: function (pct) { dlUrlBtn.textContent = pct + '%'; },
          }).then(function (r) {
            if (r === null) { dlUrlBtn.textContent = '下载'; dlUrlBtn.disabled = false; return; }
            dlUrlBtn.textContent = '完成 ✓';
            V.toast.ok('已保存：' + (kind === 'm3u8' ? 'download.mp4' : 'download'));
          }).catch(function (e) {
            dlUrlBtn.textContent = '下载';
            dlUrlBtn.disabled = false;
            V.toast.error('下载失败：' + ((e && e.message) || e));
          });
        },
      }, '下载'),
    ]);
    var urlInput = urlRow.querySelector('input');
    var dlUrlBtn = urlRow.querySelector('button');
    var listEl = V.utils.el('div', { className: 'vshell-sniff-list' });

    function renderRows() {
      listEl.innerHTML = '';
      var items = V.sniffer.list();
      if (!items.length) {
        listEl.appendChild(V.utils.el('div', { className: 'vshell-modal-sub vshell-sniff-empty' },
          '未发现媒体资源——在页面播放视频后自动收集，或点击「重新扫描」'));
        return;
      }
      items.forEach(function (it) {
        var row = V.utils.el('div', { className: 'vshell-sniff-row' });
        var icon = V.utils.el('span', {
          className: 'codicon ' + (/^blob:/.test(it.url) ? 'codicon-circle-large-outline' : 'codicon-file-media'),
        });
        var info = V.utils.el('div', { className: 'vshell-sniff-info' }, [
          V.utils.el('div', { className: 'vshell-sniff-title' }, it.title),
          V.utils.el('div', { className: 'vshell-sniff-meta' },
            (it.type || 'video/*') + (it.size ? ' · ' + V.sniffer.fmtSize(it.size) : '') +
            (it.source ? ' · ' + it.source : '') + (it.ok ? '' : ' · 无法直接下载')),
        ]);
        row.appendChild(icon);
        row.appendChild(info);
        var dl = V.utils.el('button', {
          className: 'vshell-btn vshell-btn-primary vshell-sniff-dl',
          type: 'button',
          disabled: it.ok ? '' : 'disabled',
          title: it.ok ? (V.medl.detect(it.url) === 'm3u8' ? 'm3u8 转 MP4 下载（多线程）' : '下载此媒体') : 'MSE/blob 流无法直接下载',
          onclick: function () {
            dl.disabled = true;
            dl.textContent = '下载中…';
            // v0.5.6 第二十八轮：下载走 medl 直链引擎（m3u8 自动转 MP4，
            // 多线程并发；不使用网站提供的下载引擎）
            V.medl.download(it.url, {
              name: (it.title || 'video').replace(/\.[a-z0-9]+$/i, ''),
              onProgress: function (pct) { dl.textContent = pct + '%'; },
            }).then(function (r) {
              if (r === null) { dl.textContent = '下载'; dl.disabled = false; return; }
              dl.textContent = '完成 ✓';
              V.toast.ok('已保存：' + it.title);
            }).catch(function (e) {
              dl.textContent = '重试';
              dl.disabled = false;
              V.toast.error('下载失败：' + ((e && e.message) || e));
            });
          },
        }, it.ok ? (V.medl.detect(it.url) === 'm3u8' ? '转 MP4' : '下载') : '不可下载');
        row.appendChild(dl);
        listEl.appendChild(row);
      });
    }
    renderRows();
    // 嗅探新条目 → 自动刷新列表（被动收集实时可见）
    V.sniffer.onChange(renderRows);

    box.appendChild(titleRow);
    box.appendChild(urlRow);
    box.appendChild(listEl);
    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    var fsEl = document.fullscreenElement
      || document.querySelector('.vshell-feed.is-feed-fullscreen-sim');
    var host = fsEl || document.querySelector('.vshell-app') || document.body;
    host.appendChild(overlay);
    panel = overlay;
  }

  function close() {
    if (panel) { panel.remove(); panel = null; }
  }

  V.snifferPanel = { open: open, close: close };
})();
