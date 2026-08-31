/* =========================================================================
 * char-editor.js — 角色图片编辑工具（v0.6.44 提取，角色管理页与角色主页共用）
 *
 * 历史：原实现内嵌在 components/char-panel.js 闭包内（pickLocalImage /
 *       pickBannerImage / openCrop / openBannerPick）。v0.6.44 用户需求
 *       「角色主页背景右上角/角色名右侧/头像悬停 添加与角色管理页一样的
 *       修改按钮」→ 提取为共享模块，char-panel 与 pages/role.js 共用。
 *
 * API：
 *   V.charEditor.pickIcon(role, onSaved?)   —— 文件选择 → 头像方形裁剪界面
 *                                              → V.characters.setIcon；保存后
 *                                              onSaved(dataUrl)（局部 DOM 更新用；
 *                                              不传则靠 characters.notify 全局刷新）
 *   V.charEditor.pickBanner(role, onSaved?) —— 文件选择 → 背景图中心点选择界面
 *                                              → cropAtCenter → setBanner；同上
 *   V.charEditor._testCrop(dataUrl, roleName?)       —— 测试钩子（harness 用）
 *   V.charEditor._testBannerPick(dataUrl, roleName?) —— 测试钩子（harness 用）
 *
 * 保存路径：setIcon / setBanner（characters.js，按角色所属源写入）→ notify →
 *           char-panel 的 onChange → rerender；role.js 的 onChange → 内容区重建。
 *           onSaved 回调只做调用方（角色主页 banner 区）的局部 DOM 更新。
 * ========================================================================= */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var MAX_FILE = 5 * 1024 * 1024;   // 原图读取上限 5MB（压缩后仅几 KB，放宽限制）

  /** FileReader → HTMLImageElement（原图，供裁剪；加载失败 toast） */
  function readToImage(file, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () { cb(img); };
      img.onerror = function () { V.toast.error('无法读取图片文件'); };
      img.src = fr.result;
    };
    fr.onerror = function () { V.toast.error('无法读取文件'); };
    fr.readAsDataURL(file);
  }

  /** 裁剪成矩形 PNG dataURL（srcX/srcY/srcW/srcH 为原图像素坐标）。
   *  源区域超出原图的部分（图片小于矩形时的空白）以 fill 色填充 */
  function cropToRect(img, srcX, srcY, srcW, srcH, outW, outH, fill) {
    var c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    var ctx = c.getContext('2d');
    ctx.fillStyle = fill || '#000';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
    return c.toDataURL('image/png');
  }

  /** 以原图上指定点 (cx, cy)（原图像素坐标）为**中心**裁出 outW×outH 输出图
   *  （v0.5.6 第六轮：背景图不裁剪，只指定中心点）。
   *  v0.5.6 第七轮（用户需求 2）：源矩形**完全落在原图内**（以中心点为锚的
   *  最大内接 outW:outH 矩形）——中心点靠近边缘时自动缩小取景，绝无黑边；
   *  输出图几何中心 = 指定点 → 任何显示场景 cover+center 都满足"指定中心
   *  放显示中心、缩放覆盖全区域" */
  function cropAtCenter(img, cx, cy, outW, outH) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    // 中心点到四边的距离约束（水平/垂直），再按输出比例换算：
    // 源宽 = min(2*min(cx, iw-cx), 2*min(cy, ih-cy) * outW/outH)
    var hHalf = Math.min(cx, iw - cx);        // 水平最大半宽
    var vHalf = Math.min(cy, ih - cy);        // 垂直最大半高
    var sw = Math.min(2 * hHalf, 2 * vHalf * outW / outH);
    var sh = sw * outH / outW;
    var sx = cx - sw / 2, sy = cy - sh / 2;
    return cropToRect(img, sx, sy, sw, sh, outW, outH, '#000');
  }

  /** v0.6.56：原图**等比缩小**（不裁切，保留全部信息）→ dataURL。
   *  背景图改为存原图缩小版 + 焦点坐标（bannerFocus）——渲染时由
   *  role.js 用「焦点最大矩形 + 视差水平余量」实时计算显示区域。 */
  function scaleImageToMax(img, maxSide, mime, quality) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    var s = Math.min(1, maxSide / Math.max(iw, ih));
    var w = Math.round(iw * s), h = Math.round(ih * s);
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL(mime || 'image/jpeg', quality == null ? 0.85 : quality);
  }

  /** 点击"设置头像"→ 本地文件选择器 → 读取原图 → 裁剪界面 */
  function pickIcon(role, onSaved) {
    var input = V.utils.el('input', {
      type: 'file',
      accept: 'image/*',
      style: 'display:none',
      'aria-label': '选择 ' + role.name + ' 的本地图片',
    });
    document.body.appendChild(input);
    input.onchange = function () {
      var f = input.files && input.files[0];
      input.remove();
      if (!f) return;
      if (f.size > MAX_FILE) { V.toast.error('图片过大（≤5MB）'); return; }
      readToImage(f, function (img) { openCrop(role, img, onSaved); });
    };
    input.click();
  }

  /** 点击"设置背景图"→ 本地文件选择器 → **中心点选择界面**（v0.5.6 第六轮：
   *  背景图不裁剪——指定一个中心点，任何显示时该点居中、cover 覆盖全区域） */
  function pickBanner(role, onSaved) {
    var input = V.utils.el('input', {
      type: 'file',
      accept: 'image/*',
      style: 'display:none',
      'aria-label': '选择 ' + role.name + ' 的主页背景图',
    });
    document.body.appendChild(input);
    input.onchange = function () {
      var f = input.files && input.files[0];
      input.remove();
      if (!f) return;
      if (f.size > MAX_FILE) { V.toast.error('图片过大（≤5MB）'); return; }
      readToImage(f, function (img) { openBannerPick(role, img, onSaved); });
    };
    input.click();
  }

  /* ---- 背景图中心点选择界面（v0.5.6 第六轮，用户需求 2） ----
   * 不裁剪：视口 16:9 内整图等比显示，点击图片任一点指定中心点（十字准星）；
   * 完成 → cropAtCenter（以中心点为锚 cover 裁 1280x720）。
   * 与头像裁剪（openCrop 方形框）完全不同的交互 */
  function openBannerPick(role, img, onSaved) {
    var host = document.querySelector('.vshell-app') || document.body;
    var VW = 640, VH = 360;               // 视口 16:9（与输出比例一致，所见即所得）
    var cx = 0.5, cy = 0.5;               // 中心点（原图归一化 0-1，默认图片中心）
    var fit = 1;

    var overlay = V.utils.el('div', { className: 'vshell-modal-backdrop vshell-tag-crop-backdrop' });
    var box = V.utils.el('div', { className: 'vshell-modal vshell-tag-crop-box vshell-bannerpick-box' });
    box.appendChild(V.utils.el('div', { className: 'vshell-modal-title' }, '设置背景图'));
    box.appendChild(V.utils.el('div', { className: 'vshell-modal-sub' },
      '点击图片指定中心点——显示时该点始终居中，以焦点为中心取最大显示区域（视差水平留余量）'));

    var vp = V.utils.el('div', { className: 'vshell-bannerpick-vp' });
    var imgEl = V.utils.el('img', { alt: '', draggable: 'false', src: img.src });
    var cross = V.utils.el('div', { className: 'vshell-bannerpick-cross' },
      V.utils.el('span', { className: 'vshell-bannerpick-dot' }));
    vp.appendChild(imgEl);
    vp.appendChild(cross);
    box.appendChild(vp);

    // 底部：重置中心 + 取消 + 完成
    box.appendChild(V.utils.el('div', { className: 'vshell-tag-crop-foot' }, [
      V.utils.el('button', {
        className: 'vshell-btn vshell-btn-secondary vshell-bannerpick-reset',
        type: 'button',
        title: '中心点恢复为图片中心',
        onclick: function () { cx = 0.5; cy = 0.5; renderCross(); },
      }, '重置中心'),
      V.utils.el('button', {
        className: 'vshell-btn vshell-btn-secondary',
        type: 'button',
        onclick: function () { overlay.remove(); },
      }, '取消'),
      V.utils.el('button', {
        className: 'vshell-btn vshell-btn-primary vshell-bannerpick-ok',
        type: 'button',
        onclick: doPick,
      }, '完成'),
    ]));

    overlay.appendChild(box);
    host.appendChild(overlay);

    function layout() {
      var iw = img.naturalWidth || img.width;
      var ih = img.naturalHeight || img.height;
      fit = Math.min(VW / iw, VH / ih);   // contain：整图可见（不裁剪）
      var w = Math.round(iw * fit), h = Math.round(ih * fit);
      imgEl.style.left = Math.round((VW - w) / 2) + 'px';
      imgEl.style.top = Math.round((VH - h) / 2) + 'px';
      imgEl.style.width = w + 'px';
      imgEl.style.height = h + 'px';
    }
    /** 十字准星定位到视口坐标 */
    function renderCross() {
      var iw = img.naturalWidth || img.width;
      var ih = img.naturalHeight || img.height;
      var w = iw * fit, h = ih * fit;
      cross.style.left = Math.round((VW - w) / 2 + cx * w) + 'px';
      cross.style.top = Math.round((VH - h) / 2 + cy * h) + 'px';
    }
    // 点击视口 → 换算原图归一化坐标（仅图片区域内有效）
    vp.addEventListener('click', function (e) {
      var r = vp.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      var iw = img.naturalWidth || img.width;
      var ih = img.naturalHeight || img.height;
      var w = iw * fit, h = ih * fit;
      var left = (VW - w) / 2, top = (VH - h) / 2;
      if (x < left || x > left + w || y < top || y > top + h) return;
      cx = (x - left) / w;
      cy = (y - top) / h;
      renderCross();
    });

    function doPick() {
      try {
        var iw = img.naturalWidth || img.width;
        var ih = img.naturalHeight || img.height;
        // v0.6.56：不再裁 1280×720——存原图等比缩小版（最长边 1920，保留
        // 全部信息）+ 焦点坐标；渲染时 role.js 用「焦点最大矩形 + 视差水平
        // 余量」实时计算（中心点任意位置都能真正居中，显示区域最大）
        var bannerUrl = scaleImageToMax(img, 1920, 'image/jpeg', 0.85);
        V.characters.setBanner(role.name, bannerUrl);
        if (typeof V.characters.setBannerFocus === 'function') {
          V.characters.setBannerFocus(role.name, cx, cy);
        }
        overlay.remove();
        V.toast.ok('背景图已设置：' + role.name);
        if (onSaved) onSaved(bannerUrl);
      } catch (e) {
        V.toast.error('背景图设置失败：' + e.message);
      }
    }

    layout();
    renderCross();
  }

  /* ---- 头像区域裁剪界面（大视口 + 方形裁剪框 + 缩放平移 + 填充色） ----
   *  v0.5.6 第六轮：背景图不再走裁剪（用户需求：不裁剪，指定中心点）——
   *  本界面只服务头像（128x128 方形输出） */
  function openCrop(role, img, onSaved) {
    var host = document.querySelector('.vshell-app') || document.body;
    var VW = 320, VH = 320;               // 视口尺寸
    var RECT_W = 140, RECT_H = 140;       // 方形裁剪框
    var MAX_ZOOM = 8;                     // 最大缩放倍数（相对 minScale）
    var RECT_X = (VW - RECT_W) / 2;       // 矩形左上角（视口内，居中）
    var RECT_Y = (VH - RECT_H) / 2;
    var fill = 'black';                   // 空白填充色（用户可选 黑/白）

    var overlay = V.utils.el('div', { className: 'vshell-modal-backdrop vshell-tag-crop-backdrop' });
    var box = V.utils.el('div', { className: 'vshell-modal vshell-tag-crop-box' });
    box.appendChild(V.utils.el('div', { className: 'vshell-modal-title' }, '选择头像区域'));
    box.appendChild(V.utils.el('div', { className: 'vshell-modal-sub' },
      '拖动图片移动，滚轮或按钮缩放；矩形内为头像区域'));

    // 视口 + 图片（absolute 可缩放平移）+ 矩形（遮罩压暗矩形外）
    var vp = V.utils.el('div', { className: 'vshell-tag-crop-viewport' });
    var imgEl = V.utils.el('img', { alt: '', draggable: 'false', src: img.src });
    var rect = V.utils.el('div', { className: 'vshell-tag-crop-rect' });
    vp.appendChild(imgEl);
    vp.appendChild(rect);
    box.appendChild(vp);

    // 缩放按钮组 + 填充色选择
    function swatch(color) {
      return V.utils.el('span', { className: 'vshell-tag-crop-swatch ' + (color === 'black' ? 'is-black' : 'is-white') });
    }
    function fillBtn(color) {
      return V.utils.el('button', {
        className: 'vshell-btn vshell-btn-secondary vshell-tag-crop-fillbtn ' + (color === 'black' ? 'is-black' : 'is-white')
          + (fill === color ? ' is-active' : ''),
        type: 'button',
        title: color === 'black' ? '黑色填充' : '白色填充',
        onclick: function () {
          fill = color;
          renderFill();
        },
      }, swatch(color));
    }
    var fillRow = V.utils.el('div', { className: 'vshell-tag-crop-zoom' }, [
      V.utils.el('button', {
        className: 'vshell-btn vshell-btn-secondary vshell-tag-crop-zoomout',
        type: 'button', title: '缩小',
        onclick: function () { zoomAt(VW / 2, VH / 2, 1 / 1.15); },
      }, V.utils.el('span', { className: 'codicon codicon-zoom-out' })),
      V.utils.el('button', {
        className: 'vshell-btn vshell-btn-secondary vshell-tag-crop-zoomin',
        type: 'button', title: '放大',
        onclick: function () { zoomAt(VW / 2, VH / 2, 1.15); },
      }, V.utils.el('span', { className: 'codicon codicon-zoom-in' })),
      V.utils.el('span', { className: 'vshell-tag-crop-fillsep' }),
      fillBtn('black'),
      fillBtn('white'),
    ]);
    function renderFill() {
      fillRow.querySelectorAll('.vshell-tag-crop-fillbtn').forEach(function (b) {
        b.classList.toggle('is-active', (b.classList.contains('is-black') && fill === 'black') || (b.classList.contains('is-white') && fill === 'white'));
      });
      vp.style.background = fill === 'white' ? '#fff' : '#000';
    }
    box.appendChild(fillRow);

    // 底部：取消 + 确认
    box.appendChild(V.utils.el('div', { className: 'vshell-tag-crop-foot' }, [
      V.utils.el('button', {
        className: 'vshell-btn vshell-btn-secondary',
        type: 'button',
        onclick: function () { overlay.remove(); },
      }, '取消'),
      V.utils.el('button', {
        className: 'vshell-btn vshell-btn-primary vshell-tag-crop-ok',
        type: 'button',
        onclick: function () { doCrop(); },
      }, '裁剪为头像'),
    ]));

    overlay.appendChild(box);
    host.appendChild(overlay);

    var scale = 1, minScale = 1, imgLeft = 0, imgTop = 0;
    var drag = null;

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function applyImg() {
      imgEl.style.left = imgLeft + 'px';
      imgEl.style.top = imgTop + 'px';
      imgEl.style.width = Math.round(img.naturalWidth * scale) + 'px';
      imgEl.style.height = Math.round(img.naturalHeight * scale) + 'px';
    }
    function clampPos() {
      // 位置不限制在矩形内——图片可任意相对矩形移动（裁剪结果 = 纯填充色）；
      // 仅兜底保证图片与视口至少有 1px 相交
      var w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      imgLeft = clamp(imgLeft, 1 - w, VW - 1);
      imgTop = clamp(imgTop, 1 - h, VH - 1);
    }
    function zoomAt(mx, my, k) {
      var ns = clamp(scale * k, minScale, minScale * MAX_ZOOM);
      if (ns === scale) return;
      var old = scale;
      var dx = mx - imgLeft, dy = my - imgTop;
      scale = ns;
      imgLeft = mx - dx * (ns / old);
      imgTop = my - dy * (ns / old);
      clampPos();
      applyImg();
    }
    function layout() {
      minScale = Math.min(RECT_W / img.naturalWidth, RECT_H / img.naturalHeight);
      scale = minScale;
      var w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      imgLeft = RECT_X + (RECT_W - w) / 2;
      imgTop = RECT_Y + (RECT_H - h) / 2;
      applyImg();
    }

    function doCrop() {
      try {
        var srcX = (RECT_X - imgLeft) / scale;
        var srcY = (RECT_Y - imgTop) / scale;
        var srcW = RECT_W / scale;
        var srcH = RECT_H / scale;
        var dataUrl = cropToRect(img, srcX, srcY, srcW, srcH, 128, 128,
          fill === 'white' ? '#fff' : '#000');
        V.characters.setIcon(role.name, dataUrl);
        overlay.remove();
        V.toast.ok('头像已设置：' + role.name);
        if (onSaved) onSaved(dataUrl);
      } catch (e) {
        V.toast.error('裁剪失败：' + e.message);
      }
    }

    // 拖动平移（图片在视口内移动，矩形固定）
    vp.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      drag = { x: e.clientX, y: e.clientY, l: imgLeft, t: imgTop };
      try { vp.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    });
    vp.addEventListener('pointermove', function (e) {
      if (!drag) return;
      imgLeft = drag.l + (e.clientX - drag.x);
      imgTop = drag.t + (e.clientY - drag.y);
      clampPos();
      applyImg();
    });
    vp.addEventListener('pointerup', function () { drag = null; });
    vp.addEventListener('pointercancel', function () { drag = null; });

    vp.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = vp.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });

    layout();
    renderFill();
  }

  /** 测试钩子：直接以 dataURL 打开裁剪界面（harness 用） */
  function testCrop(dataUrl, roleName) {
    var r = null;
    V.characters.list().forEach(function (x) { if (!r && (!roleName || x.name === roleName)) r = x; });
    if (!r) return false;
    var img = new Image();
    img.onload = function () {
      openCrop(r, img);
    };
    img.src = dataUrl;
    return true;
  }

  /** 测试钩子：以 dataURL 打开背景图中心点界面（harness 用） */
  function testBannerPick(dataUrl, roleName) {
    var r = null;
    V.characters.list().forEach(function (x) { if (!r && (!roleName || x.name === roleName)) r = x; });
    if (!r) return false;
    var img = new Image();
    img.onload = function () {
      openBannerPick(r, img);
    };
    img.src = dataUrl;
    return true;
  }

  V.charEditor = {
    pickIcon: pickIcon,
    pickBanner: pickBanner,
    _testCrop: testCrop,
    _testBannerPick: testBannerPick,
  };
})();
