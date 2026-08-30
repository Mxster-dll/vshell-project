# -*- coding: utf-8 -*-
"""生成标签管理弹窗设计方案演示页（交互式，三方案切换）。
复用 skill 提取的 tokens/colors/codicon 三 css + ttf base64 内联 → 单文件断网可用。
输出: output/_tag-demo.html
用法: python dev/gen_tag_demo.py（workdir=vshell）
"""
import base64
import io
import os
import re

SKILL = r'C:\Users\Mxster\.dsh\skills\vscode-modern-ui\resources\assets\css'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'output', '_tag-demo.html')


def read(p):
    return io.open(p, encoding='utf-8').read()


def main():
    tokens = read(os.path.join(SKILL, 'tokens', 'tokens.css'))
    colors = read(os.path.join(SKILL, 'tokens', 'colors.css'))
    codicon = read(os.path.join(SKILL, 'codicon', 'codicon.css'))
    ttf = open(os.path.join(SKILL, 'codicon', 'codicon.ttf'), 'rb').read()
    b64 = base64.b64encode(ttf).decode('ascii')
    codicon = re.sub(r'url\("\./codicon\.ttf\?[^"]*"\)',
                     'url("data:font/ttf;base64,%s")' % b64, codicon)
    html = TEMPLATE.replace('/*__TOKENS__*/', tokens).replace('/*__COLORS__*/', colors).replace('/*__CODICON__*/', codicon)
    io.open(OUT, 'w', encoding='utf-8', newline='').write(html)
    print('wrote', OUT, os.path.getsize(OUT), 'bytes')


TEMPLATE = u'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>标签管理 · 方案演示（vshell）</title>
<style>
/* ===== VS Code 1.133.0 提取 token（原样内联） ===== */
/*__TOKENS__*/
/*__COLORS__*/
/*__CODICON__*/
</style>
<style>
/* ============================================================
 * 业务样式：Fluent 几何（4px 网格 / Subtitle 20·Body 14·Caption 12 /
 * 控制件 4px 圆角 / 浮层 8px 圆角 / Dialog 480px）+ VS Code token 配色
 * （mimic 纪律：只用提取 token；卡片/浮层几何仿照 floating-panels.css:24）
 * ============================================================ */
html, body { margin: 0; }
body {
  font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
  font-size: 14px;                 /* Fluent Body */
  background: #181818;             /* vshell 页面底色 */
  color: var(--vscode-foreground);
  -webkit-font-smoothing: antialiased;
}
.monaco-workbench { min-height: 100vh; }

/* ---- 模拟 vshell 主页背景（低对比占位，衬托浮层） ---- */
.demo-stage { position: relative; min-height: 100vh; overflow: hidden; }
.demo-sim-nav {
  height: 56px;
  display: flex; align-items: center; gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--vscode-sideBar-border);
  background: rgba(24, 24, 24, 0.9);
}
.demo-sim-nav .codicon { color: var(--vscode-descriptionForeground); font-size: 15px; }
.demo-sim-nav .sim-title { font-size: 14px; font-weight: 600; }
.demo-sim-nav .sim-search {
  margin-left: auto;
  width: 320px; height: 30px;
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  border-radius: 8px;
  background: var(--vscode-input-background);
}
.demo-sim-body { padding: 20px 10%; }
.demo-sim-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
.demo-sim-chip {
  width: 104px; height: 30px;
  border-radius: 4px;
  background: var(--vscode-toolbar-hoverBackground);
}
.demo-sim-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.demo-sim-card {
  aspect-ratio: 16 / 10;
  border-radius: 8px;
  background: linear-gradient(160deg, #212121, #1b1b1b);
  border: 1px solid var(--vscode-sideBar-border);
}
.demo-stage .demo-hint {
  position: absolute; left: 50%; top: 88px;
  transform: translateX(-50%);
  font-size: 12px; color: var(--vscode-descriptionForeground);
  background: var(--vscode-surface-background);
  border: 1px solid var(--vscode-sideBar-border);
  border-radius: 8px;
  padding: 6px 12px;
  box-shadow: var(--vscode-shadow-lg);
  z-index: 5;
  white-space: nowrap;
}

/* ---- 方案切换（顶部悬浮条） ---- */
.demo-switch {
  position: fixed; left: 50%; top: 72px;
  transform: translateX(-50%);
  z-index: 60;
  display: flex; gap: 8px;
  padding: 4px;
  background: rgba(30, 30, 30, 0.92);
  border: 1px solid var(--vscode-sideBar-border);
  border-radius: 8px;
  box-shadow: var(--vscode-shadow-lg);
}
.demo-switch-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--vscode-foreground);
  font-size: 14px;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.demo-switch-btn:hover { background: var(--vscode-list-hoverBackground); }
.demo-switch-btn.is-active {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  font-weight: 600;
}

/* ========== 方案 A：Fluent Dialog 模态 ========== */
.demo-dialog-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);        /* Fluent Smoke */
  backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center;
  z-index: 50;
}
.demo-dialog {
  width: 480px;                           /* Fluent Dialog 单功能宽度 */
  max-width: calc(100vw - 32px);
  background: var(--vscode-surface-background);
  border: 1px solid var(--vscode-sideBar-border);
  border-radius: 8px;                     /* OverlayCornerRadius */
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  animation: pop-in 160ms ease;
  overflow: hidden;
}
@keyframes pop-in {
  from { opacity: 0; transform: translateY(6px) scale(0.98); }
  to   { opacity: 1; transform: none; }
}
.dlg-head {
  display: flex; align-items: center;
  padding: 16px 16px 8px;
}
.dlg-title {
  font-size: 20px; font-weight: 600;      /* Fluent Subtitle */
  margin: 0; flex: 1;
}
.dlg-close {
  width: 28px; height: 28px;
  border: none; border-radius: 4px;
  background: transparent;
  color: var(--vscode-foreground);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 120ms ease;
}
.dlg-close:hover { background: var(--vscode-toolbar-hoverBackground); }
.dlg-body { padding: 8px 16px 0; }
.dlg-add-row { display: flex; gap: 8px; margin-bottom: 12px; }
.dlg-add-input {
  flex: 1; min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  border-radius: 4px;                     /* ControlCornerRadius */
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 14px;
  outline: none;
}
.dlg-add-input:focus {
  border-color: var(--vscode-focusBorder);
  box-shadow: 0 0 0 1px var(--vscode-focusBorder);
}
.dlg-add-btn {
  flex: none;
  height: 32px;
  padding: 0 16px;
  border: none;
  border-radius: 4px;
  background: var(--vscode-button-background);   /* AccentFill */
  color: var(--vscode-button-foreground);
  font-size: 14px; font-weight: 600;
  cursor: pointer;
  transition: background 120ms ease;
}
.dlg-add-btn:hover { background: var(--vscode-button-hoverBackground); }
.dlg-list {
  max-height: 264px;                     /* 4px 网格 264 = 66×4 */
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 2px;
  padding-right: 4px;
}
.dlg-list::-webkit-scrollbar { width: 6px; }
.dlg-list::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-background);
  border-radius: 3px;
}
.dlg-row {
  display: flex; align-items: center; gap: 10px;
  height: 48px;                            /* Fluent 列表项 */
  padding: 0 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 120ms ease;
}
.dlg-row:hover { background: var(--vscode-list-hoverBackground); }
.dlg-row.is-selected { background: var(--vscode-list-activeSelectionBackground); }
.dlg-row.is-selected .row-name,
.dlg-row.is-selected .row-actions .codicon { color: var(--vscode-list-activeSelectionForeground); }
.row-thumb {
  width: 32px; height: 32px;
  border-radius: 6px;
  flex: none;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.row-thumb img { width: 100%; height: 100%; object-fit: cover; }
.row-thumb.is-letter { background: #fff; }
.row-thumb .letter { font-size: 14px; font-weight: 600; color: #181818; line-height: 1; }
.row-name {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.row-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 120ms ease; }
.dlg-row:hover .row-actions, .dlg-row.is-selected .row-actions { opacity: 1; }
.row-btn {
  width: 28px; height: 28px;
  border: none; border-radius: 4px;
  background: transparent;
  color: var(--vscode-foreground);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 120ms ease, color 120ms ease;
}
.row-btn:hover { background: var(--vscode-toolbar-activeBackground); }
.row-btn.is-danger:hover { color: var(--vscode-errorForeground); }
.dlg-empty {
  padding: 28px 0;
  text-align: center;
  color: var(--vscode-descriptionForeground);
  font-size: 13px;
}
.dlg-empty .codicon { font-size: 22px; display: block; margin-bottom: 8px; opacity: 0.6; }
.dlg-foot {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px 16px;
  margin-top: 4px;
}
.dlg-foot-hint {
  flex: 1;
  font-size: 12px;                        /* Fluent Caption */
  color: var(--vscode-descriptionForeground);
}

/* ========== 方案 B：Flyout 下拉面板（无遮罩） ========== */
.demo-flyout {
  position: fixed; left: 50%; top: 140px;
  transform: translateX(-50%);
  width: 380px;
  background: var(--vscode-surface-background);
  border: 1px solid var(--vscode-sideBar-border);
  border-radius: 8px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
  z-index: 40;
  animation: pop-in 140ms ease;
}
.fly-head {
  display: flex; align-items: center;
  padding: 12px 16px 4px;
}
.fly-title { font-size: 16px; font-weight: 600; margin: 0; flex: 1; }
.fly-body { padding: 8px 16px 12px; }
.fly-anchor {
  position: fixed; left: 50%; top: 116px;
  transform: translateX(-50%);
  width: 380px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  z-index: 41;
}
.fly-anchor .anchor-tip {
  width: 18px; height: 18px;
  background: var(--vscode-surface-background);
  border-left: 1px solid #484848;
  border-top: 1px solid #484848;
  transform: rotate(45deg);
  box-shadow: -3px -3px 10px rgba(0, 0, 0, 0.5);
}

/* ========== 方案 C：分栏编辑（左列表 + 右详情） ========== */
.demo-split-dlg {
  width: 640px;
  max-width: calc(100vw - 32px);
  background: var(--vscode-surface-background);
  border: 1px solid var(--vscode-sideBar-border);
  border-radius: 8px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  animation: pop-in 160ms ease;
  overflow: hidden;
}
.split-cols { display: flex; min-height: 360px; }
.split-left {
  width: 240px; flex: none;
  border-right: 1px solid var(--vscode-sideBar-border);
  padding: 8px;
  display: flex; flex-direction: column; gap: 2px;
}
.split-right {
  flex: 1; min-width: 0;
  padding: 20px 20px 16px;
}
.split-detail-thumb {
  width: 96px; height: 96px;
  border-radius: 8px;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
  background: var(--vscode-toolbar-hoverBackground);
  border: 1px solid var(--vscode-sideBar-border);
}
.split-detail-thumb img { width: 100%; height: 100%; object-fit: cover; }
.split-detail-thumb.is-letter { background: #fff; border-color: rgba(255, 255, 255, 0.9); }
.split-detail-thumb .letter { font-size: 40px; font-weight: 600; color: #181818; }
.split-detail-name { font-size: 20px; font-weight: 600; margin: 0 0 16px; }
.split-field { margin-bottom: 12px; }
.split-field-row { display: flex; gap: 8px; }
.split-del-btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--vscode-errorForeground);
  border-radius: 4px;
  background: transparent;
  color: var(--vscode-errorForeground);
  font-size: 14px;
  cursor: pointer;
  display: flex; align-items: center; gap: 6px;
  transition: background 120ms ease;
}
.split-del-btn:hover { background: rgba(248, 81, 73, 0.12); }

@media (prefers-reduced-motion: reduce) {
  .demo-dialog, .demo-flyout, .demo-split-dlg,
  .dlg-row, .row-btn, .dlg-add-btn, .demo-switch-btn { transition: none; animation: none; }
}
</style>
</head>
<body>
<div class="monaco-workbench vs-dark">
  <div class="demo-stage">

    <!-- 模拟 vshell 主页背景 -->
    <div class="demo-sim-nav">
      <span class="codicon codicon-home"></span>
      <span class="sim-title">VShell</span>
      <div class="sim-search"></div>
    </div>
    <div class="demo-sim-body">
      <div class="demo-sim-chips" id="simChips"></div>
      <div class="demo-sim-grid" id="simGrid"></div>
    </div>
    <div class="demo-hint">模拟主页背景 · 标签管理弹窗方案演示</div>

    <!-- 方案切换 -->
    <nav class="demo-switch" id="switchBar">
      <button class="demo-switch-btn is-active" data-plan="dialog">Dialog 模态</button>
      <button class="demo-switch-btn" data-plan="flyout">Flyout 面板</button>
      <button class="demo-switch-btn" data-plan="split">分栏编辑</button>
    </nav>

    <!-- 方案 A：Dialog 模态 -->
    <div class="demo-dialog-backdrop" id="pane-dialog">
      <div class="demo-dialog">
        <div class="dlg-head">
          <h2 class="dlg-title">标签管理</h2>
          <button class="dlg-close" type="button" title="关闭"><span class="codicon codicon-close"></span></button>
        </div>
        <div class="dlg-body">
          <div class="dlg-add-row">
            <input class="dlg-add-input" type="text" placeholder="输入关键词，回车添加" data-add="dialog">
            <button class="dlg-add-btn" type="button" data-addbtn="dialog">添加</button>
          </div>
          <div class="dlg-list" id="list-dialog"></div>
        </div>
        <div class="dlg-foot">
          <span class="dlg-foot-hint">匹配视频标题 → 卡片标题高亮 + 左上角角标</span>
          <button class="dlg-add-btn" type="button" data-done="dialog">完成</button>
        </div>
      </div>
    </div>

    <!-- 方案 B：Flyout 面板 -->
    <div class="fly-anchor"><div class="anchor-tip"></div></div>
    <div class="demo-flyout" id="pane-flyout">
      <div class="fly-head">
        <h2 class="fly-title">标签管理</h2>
        <button class="dlg-close" type="button" title="关闭"><span class="codicon codicon-close"></span></button>
      </div>
      <div class="fly-body">
        <div class="dlg-add-row">
          <input class="dlg-add-input" type="text" placeholder="输入关键词，回车添加" data-add="flyout">
          <button class="dlg-add-btn" type="button" data-addbtn="flyout">添加</button>
        </div>
        <div class="dlg-list" id="list-flyout"></div>
        <div class="dlg-foot" style="padding: 8px 0 0;">
          <span class="dlg-foot-hint">匹配视频标题 → 卡片高亮 + 角标</span>
        </div>
      </div>
    </div>

    <!-- 方案 C：分栏编辑 -->
    <div class="demo-dialog-backdrop" id="pane-split">
      <div class="demo-split-dlg">
        <div class="dlg-head">
          <h2 class="dlg-title">标签管理</h2>
          <button class="dlg-close" type="button" title="关闭"><span class="codicon codicon-close"></span></button>
        </div>
        <div class="split-cols">
          <div class="split-left">
            <div class="dlg-list" id="list-split" style="max-height: 300px;"></div>
          </div>
          <div class="split-right" id="split-detail"></div>
        </div>
      </div>
    </div>

  </div>
</div>

<script>
(function () {
  'use strict';
  // ---- 种子数据（跨方案共享） ----
  var SVG_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="%2359A4F9"/><text x="32" y="42" font-size="30" font-weight="600" font-family="Segoe UI,sans-serif" fill="#fff" text-anchor="middle">' + '视' + '</text></svg>');
  var TAGS = [
    { name: '视频', icon: SVG_ICON },
    { name: '演示', icon: '' },
    { name: '哔哩', icon: '' },
    { name: 'MAD', icon: '' },
  ];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function thumbOf(t, cls) {
    var box = el('span', (cls || 'row-thumb') + (t.icon ? '' : ' is-letter'));
    if (t.icon) {
      var img = el('img');
      img.src = t.icon;
      img.alt = '';
      box.appendChild(img);
    } else {
      box.appendChild(el('span', 'letter', String(t.name).charAt(0) || '?'));
    }
    return box;
  }

  // ---- 本地图片 → 128px PNG dataURL（公共；点击图片按钮直接打开文件选择器） ----
  function pickLocalImage(onDone) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      input.remove();
      if (!f || f.size > 300 * 1024) return;
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var c = document.createElement('canvas');
          var k = Math.min(1, 128 / Math.max(img.width, img.height));
          c.width = Math.max(1, Math.round(img.width * k));
          c.height = Math.max(1, Math.round(img.height * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          onDone(c.toDataURL('image/png'));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(f);
    });
    input.click();
  }

  // ---- 通用：渲染一个方案列表 ----
  function renderList(host, plan, selectedName) {
    host.innerHTML = '';
    if (!TAGS.length) {
      host.appendChild(el('div', 'dlg-empty', ''));
      var e = host.lastChild;
      e.appendChild(el('span', 'codicon codicon-tag'));
      e.appendChild(document.createTextNode('还没有标签——添加后匹配视频标题自动高亮'));
      return;
    }
    TAGS.forEach(function (t) {
      var row = el('div', 'dlg-row' + (selectedName === t.name ? ' is-selected' : ''));
      row.appendChild(thumbOf(t));

      var actions = el('span', 'row-actions');
      var imgBtn = el('button', 'row-btn', '');
      imgBtn.type = 'button';
      imgBtn.title = '设置图片（本地文件）';
      imgBtn.appendChild(el('span', 'codicon codicon-file-media'));
      imgBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        pickLocalImage(function (dataUrl) { t.icon = dataUrl; renderAll(); });
      });
      var delBtn = el('button', 'row-btn is-danger', '');
      delBtn.type = 'button';
      delBtn.title = '删除标签';
      delBtn.appendChild(el('span', 'codicon codicon-close'));
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        TAGS = TAGS.filter(function (x) { return x !== t; });
        if (selected === t) selected = null;
        renderAll();
      });
      actions.appendChild(imgBtn);
      actions.appendChild(delBtn);

      row.appendChild(el('span', 'row-name', t.name));
      row.appendChild(actions);

      row.addEventListener('click', function () { select(plan, t); });
      host.appendChild(row);
    });
  }

  // ---- 分栏：右侧详情 ----
  var selected = null;
  function renderDetail() {
    var host = document.getElementById('split-detail');
    host.innerHTML = '';

    // 添加区（仅右侧保留——用户需求：去除左侧添加行）
    var addRow = el('div', 'dlg-add-row');
    var addInput = el('input');
    addInput.type = 'text';
    addInput.className = 'dlg-add-input';
    addInput.placeholder = '输入关键词，回车添加';
    var addBtn = el('button', 'dlg-add-btn', '添加');
    addBtn.type = 'button';
    function doAdd() {
      var v = addInput.value.trim();
      if (!v) return;
      TAGS.unshift({ name: v, icon: '' });   // 新标签插到最上面
      selected = TAGS[0];                     // 立刻切到新标签的详情
      renderAll();
      addInput.focus();
    }
    addInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
    addBtn.addEventListener('click', doAdd);
    addRow.appendChild(addInput);
    addRow.appendChild(addBtn);
    host.appendChild(addRow);

    if (!selected) {
      host.appendChild(el('div', 'dlg-empty', ''));
      var e = host.lastChild;
      e.appendChild(el('span', 'codicon codicon-tag'));
      e.appendChild(document.createTextNode('还没有标签——在上方输入关键词添加'));
      return;
    }
    host.appendChild(el('div', 'split-detail-thumb' + (selected.icon ? '' : ' is-letter')));
    var th = host.querySelector('.split-detail-thumb');
    if (selected.icon) {
      var img = el('img');
      img.src = selected.icon;
      th.appendChild(img);
    } else {
      th.appendChild(el('span', 'letter', String(selected.name).charAt(0) || '?'));
    }
    host.appendChild(el('div', 'split-detail-name', selected.name));
    var imgRow = el('div', 'split-field');
    var imgBtn2 = el('button', 'row-file-btn', '');
    imgBtn2.type = 'button';
    imgBtn2.appendChild(el('span', 'codicon codicon-file-media'));
    imgBtn2.appendChild(document.createTextNode(' 设置图片（本地文件）'));
    imgBtn2.addEventListener('click', function () {
      pickLocalImage(function (dataUrl) { selected.icon = dataUrl; renderAll(); });
    });
    imgRow.appendChild(imgBtn2);
    host.appendChild(imgRow);
    var delRow = el('div', 'split-field');
    var delBtn = el('button', 'split-del-btn', '');
    delBtn.type = 'button';
    delBtn.appendChild(el('span', 'codicon codicon-close'));
    delBtn.appendChild(document.createTextNode(' 删除该标签'));
    delBtn.addEventListener('click', function () {
      TAGS = TAGS.filter(function (x) { return x !== selected; });
      selected = null;
      renderAll();
    });
    delRow.appendChild(delBtn);
    host.appendChild(delRow);
  }

  function select(plan, t) {
    selected = t;
    renderAll();
  }

  // ---- 渲染全部（当前方案 + 详情） ----
  var currentPlan = 'dialog';
  function renderAll() {
    if (!selected && TAGS.length) selected = TAGS[0];   // 分栏初始即显示详情
    ['dialog', 'flyout', 'split'].forEach(function (p) {
      var host = document.getElementById('list-' + p);
      if (host) renderList(host, p, selected && selected.name);
    });
    renderDetail();
  }

  // ---- 添加逻辑（新标签插到最上面并立即选中——用户需求） ----
  document.querySelectorAll('[data-add]').forEach(function (input) {
    function add() {
      var v = input.value.trim();
      if (!v) return;
      TAGS.unshift({ name: v, icon: '' });
      selected = TAGS[0];
      input.value = '';
      input.focus();
      renderAll();
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
  });
  document.querySelectorAll('[data-addbtn]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = document.querySelector('[data-add="' + btn.getAttribute('data-addbtn') + '"]');
      var v = input.value.trim();
      if (!v) return;
      TAGS.unshift({ name: v, icon: '' });
      selected = TAGS[0];
      input.value = '';
      input.focus();
      renderAll();
    });
  });

  // ---- 方案切换 ----
  var bar = document.getElementById('switchBar');
  function applyPlan(p) {
    if (['dialog', 'flyout', 'split'].indexOf(p) === -1) p = 'dialog';
    currentPlan = p;
    Array.prototype.forEach.call(bar.children, function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-plan') === p);
    });
    var showDialog = p === 'dialog' || p === 'split';
    document.getElementById('pane-dialog').style.display = showDialog ? 'flex' : 'none';
    document.getElementById('pane-split').style.display = p === 'split' ? 'flex' : 'none';
    document.getElementById('pane-flyout').style.display = p === 'flyout' ? 'block' : 'none';
    document.querySelector('.fly-anchor').style.display = p === 'flyout' ? 'flex' : 'none';
  }
  applyPlan((location.hash || '').replace('#', ''));
  bar.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.demo-switch-btn');
    if (!btn) return;
    applyPlan(btn.getAttribute('data-plan'));
  });

  // ---- 模拟背景填充 ----
  (function () {
    var chips = document.getElementById('simChips');
    for (var i = 0; i < 12; i++) chips.appendChild(el('span', 'demo-sim-chip'));
    var grid = document.getElementById('simGrid');
    for (var j = 0; j < 8; j++) grid.appendChild(el('div', 'demo-sim-card'));
  })();

  // ---- 关闭按钮（演示：关闭当前浮层重新打开） ----
  document.querySelectorAll('.dlg-close').forEach(function (b) {
    b.addEventListener('click', function () {
      applyPlan('none');   // 隐藏全部
      setTimeout(function () { applyPlan(currentPlan); }, 400);
    });
  });

  renderAll();
})();
</script>
</body>
</html>
'''


if __name__ == '__main__':
    main()
