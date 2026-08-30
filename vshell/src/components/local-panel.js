/* ============================================================
 * local-panel — 本地视频导入浮窗（v0.5.6 第十二轮，用户需求 2）
 * 导航栏「本地视频」按钮打开：批量选择/拖拽导入 → localVideos 持久化；
 * 列表展示（封面/标题/大小）+ 删除；数据变更 notify（待看/收藏等
 * 页面靠各自 onChange 刷新；本地列表本身重渲染）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var backdrop = null;
  var listEl = null;
  var emptyEl = null;
  var fileInput = null;
  var coverBound = false;   // v0.5.6 第二十二轮：懒截帧事件监听只绑一次

  function fmtSize(n) {
    if (!n) return '';
    if (n > 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n > 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  function renderList() {
    var items = V.localVideos ? V.localVideos.list() : [];
    listEl.innerHTML = '';
    if (!items.length) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    items.forEach(function (it) {
      var thumb = it.cover
        ? V.utils.el('img', { className: 'vshell-local-thumb-img', src: it.cover, alt: '' })
        : V.utils.el('span', { className: 'codicon codicon-file-media' });
      var delBtn = V.utils.el('button', {
        className: 'vshell-icon-btn vshell-local-del',
        type: 'button', title: '删除', 'aria-label': '删除 ' + it.title,
        onclick: function (e) {
          e.stopPropagation();
          V.localVideos.remove(it.id).then(function () { renderList(); });
        },
      }, V.utils.el('span', { className: 'codicon codicon-trash' }));
      listEl.appendChild(V.utils.el('div', { className: 'vshell-local-row' }, [
        V.utils.el('div', { className: 'vshell-local-thumb' }, thumb),
        V.utils.el('div', { className: 'vshell-local-info' }, [
          V.utils.el('div', { className: 'vshell-local-title' }, it.title),
          V.utils.el('div', { className: 'vshell-local-sub' },
            (it.duration ? V.utils.fmtTime(it.duration) + ' · ' : '') + fmtSize(it.size)),
        ]),
        delBtn,
      ]));
    });
  }

  function doImport(fileList) {
    if (!V.localVideos) return;
    V.localVideos.importFiles(fileList).then(function (added) {
      if (added && added.length) {
        V.toast.ok('已导入 ' + added.length + ' 个本地视频');
        // v0.5.6 第二十二/二十三轮：封面生成失败提示——**显示诊断状态**
        // （_thumbDiag.state：error/error 码/noframe/blackN/waitN/grabbed），
        // 用户反馈黑封面时凭 toast 即可定位；懒截帧稍后会自动补
        var noCover = added.filter(function (it) { return !it.cover; });
        if (noCover.length) {
          var d = noCover[0]._thumbDiag || {};
          var why = d.state === 'error' ? ('解码失败' + (d.err ? '（' + d.err + '）' : ''))
            : d.state === 'noframe' ? '无法取到画面帧'
            : d.state === 'drawerr' ? ('绘制失败（' + (d.err || '') + '）')
            : d.state === 'grabbed' ? '画面偏暗'
            : (d.state === 'start' ? '媒体未加载（可能格式不支持）' : ('截帧超时（' + d.state + '）'));
          V.toast.info(noCover.length + ' 个视频封面生成失败：' + why + '，稍后自动重试');
        }
      } else {
        V.toast.info('未识别到视频文件');
      }
      renderList();
    }).catch(function (e) {
      V.toast.error('导入失败：' + e.message);
    });
  }

  function open() {
    if (backdrop) { backdrop.classList.add('is-open'); return; }
    fileInput = V.utils.el('input', {
      type: 'file', multiple: '', accept: 'video/*,.mp4,.webm,.mkv,.mov,.avi,.flv,.m4v',
      style: { display: 'none' },
      onchange: function () {
        if (fileInput.files && fileInput.files.length) doImport(fileInput.files);
        fileInput.value = '';
      },
    });
    document.body.appendChild(fileInput);
    emptyEl = V.utils.el('div', { className: 'vshell-local-empty' }, '暂无本地视频，点击上方按钮或拖拽文件到此处导入');
    listEl = V.utils.el('div', { className: 'vshell-local-list' });
    var dropZone = V.utils.el('div', { className: 'vshell-local-drop' }, [
      V.utils.el('span', { className: 'codicon codicon-cloud-upload' }),
      V.utils.el('span', null, '选择文件 / 拖拽视频到此处'),
    ]);
    dropZone.addEventListener('click', function () { if (fileInput) fileInput.click(); });
    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropZone.classList.add('is-dragover');
    });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('is-dragover'); });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.classList.remove('is-dragover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        doImport(e.dataTransfer.files);
      }
    });
    var box = V.utils.el('div', { className: 'vshell-modal vshell-local-panel' }, [
      V.utils.el('div', { className: 'vshell-modal-title-row' }, [
        V.utils.el('h2', { className: 'vshell-modal-title' }, '本地视频'),
        V.utils.el('button', {
          className: 'vshell-icon-btn', type: 'button',
          title: '关闭', 'aria-label': '关闭',
          onclick: close,
        }, V.utils.el('span', { className: 'codicon codicon-close' })),
      ]),
      dropZone,
      listEl,
      emptyEl,
    ]);
    backdrop = V.utils.el('div', { className: 'vshell-modal-backdrop vshell-local-backdrop' }, [box]);
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) close();
    });
    // v0.5.6 第十三轮需求 7：全屏下浮窗挂全屏元素内（原生 fullscreen
    // 走 top layer，挂 body 会被盖住）——保持全屏状态下正常显示
    var fsEl = document.fullscreenElement
      || document.querySelector('.vshell-feed.is-feed-fullscreen-sim');
    var host = fsEl || document.querySelector('.vshell-app') || document.body;
    host.appendChild(backdrop);
    V.localVideos.init().then(renderList);
    // v0.5.6 第二十二轮需求 2：懒截帧完成 → 列表封面即时刷新
    if (!coverBound) {
      coverBound = true;
      window.addEventListener('vshell-local-cover', function () {
        if (backdrop) renderList();
      });
    }
  }

  function close() {
    if (backdrop) { backdrop.remove(); backdrop = null; }
    if (fileInput) { fileInput.remove(); fileInput = null; }
  }

  V.localPanel = { open: open, close: close };
})();
