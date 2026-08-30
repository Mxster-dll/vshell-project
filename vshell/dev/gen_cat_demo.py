# -*- coding: utf-8 -*-
"""生成分类卡片布局演示页 v2（扁平 24 小分类，无父/子层级）。
复用 skill 提取的 tokens/colors/codicon 三 css + ttf base64 内联 → 单文件断网可用。
输出: output/_cat-layouts-demo.html
用法: python dev/gen_cat_demo.py（workdir=vshell）
"""
import base64
import io
import os
import re

SKILL = r'C:\Users\Mxster\.dsh\skills\vscode-modern-ui\resources\assets\css'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'output', '_cat-layouts-demo.html')


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
<title>分类布局 v2 · 扁平 24 小分类（vshell）</title>
<style>
/* ===== VS Code 1.133.0 提取 token（原样内联） ===== */
/*__TOKENS__*/
/*__COLORS__*/
/*__CODICON__*/
</style>
<style>
/* ============================================================
 * 业务样式：Fluent 几何（4px 网格 / Subtitle 20·Body 14·Caption 12 /
 * 4px 控制件圆角 / 8px 卡片圆角）+ VS Code token 配色
 * （mimic 纪律：只用提取 token，卡片几何仿照 floating-panels.css:24）
 * ============================================================ */
html, body { margin: 0; }
body {
  font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
  font-size: 14px;                 /* Fluent Body */
  background: #181818;             /* vshell 页面底色（用户需求） */
  color: var(--vscode-foreground);
  -webkit-font-smoothing: antialiased;
}
.monaco-workbench { min-height: 100vh; }

.demo-root {
  max-width: 1080px;
  margin: 0 auto;
  padding: 24px 16px 48px;         /* Fluent xl / lg */
}

/* ---- 页头 ---- */
.demo-head { margin-bottom: 16px; }
.demo-title {
  font-size: 20px; font-weight: 600;   /* Fluent Subtitle */
  line-height: 1.4;
  margin: 0;
  display: flex; align-items: center; gap: 8px;
}
.demo-title .codicon { font-size: 18px; color: var(--vscode-charts-blue); }
.demo-sub {
  margin: 4px 0 0;
  font-size: 12px;                     /* Fluent Caption */
  color: var(--vscode-descriptionForeground);
}

/* ---- 方案切换栏（SelectorBar 风格） ---- */
.demo-switch {
  display: flex; gap: 8px;             /* Fluent sm */
  padding: 4px;
  background: var(--vscode-toolbar-hoverBackground);
  border-radius: 8px;
  width: fit-content;
  margin-bottom: 20px;
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
  background: var(--vscode-surface-background);
  border-color: var(--vscode-sideBar-border);
  font-weight: 600;
  box-shadow: var(--vscode-shadow-lg);
}

/* ---- 方案容器 ---- */
.demo-pane { display: none; animation: pane-in 160ms ease; }
.demo-pane.is-active { display: block; }
@keyframes pane-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}

/* ---- 方案 A：chips 网格（一个卡片容器内 24 chips 平铺） ----
 * mimic: 容器卡片几何 = surface-background + 1px sideBar-border +
 *   cornerRadius-large + shadow-lg（floating-panels.css:24 卡片边框） */
.flat-panel {
  background: var(--vscode-surface-background);
  border: 1px solid var(--vscode-sideBar-border);
  border-radius: var(--vscode-cornerRadius-large);
  box-shadow: var(--vscode-shadow-lg);
  padding: 16px;                       /* Fluent lg */
}
.flat-chips {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 8px;                            /* Fluent sm */
}
.cat-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;                          /* Fluent xs */
  border: 1px solid transparent;
  background: transparent;
  color: var(--vscode-foreground);
  font-size: 13px;
  padding: 8px 10px;                 /* Fluent sm 纵向加大便于触控 */
  border-radius: 4px;                /* Fluent ControlCornerRadius */
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.cat-chip .codicon {
  font-size: 13px;
  color: var(--vscode-descriptionForeground);
  flex: none;
}
.cat-chip:hover { background: var(--vscode-list-hoverBackground); }
.cat-chip:hover .codicon { color: var(--vscode-foreground); }
.cat-chip.is-active {
  background: var(--vscode-badge-background);   /* VS Code 徽章蓝 */
  color: var(--vscode-badge-foreground);
  font-weight: 600;
}
.cat-chip.is-active .codicon { color: inherit; }

/* ---- 方案 B：小卡片网格（24 张小卡，Fluent Card 观感） ---- */
.flat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 12px;                           /* Fluent md */
}
.flat-card {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--vscode-surface-background);
  border: 1px solid var(--vscode-sideBar-border);
  border-radius: var(--vscode-cornerRadius-large);
  box-shadow: var(--vscode-shadow-lg);
  padding: 12px 14px;
  cursor: pointer;
  font-size: 14px;
  color: var(--vscode-foreground);
  transition: transform 140ms ease, box-shadow 140ms ease,
              background 120ms ease, border-color 120ms ease;
}
.flat-card .codicon { font-size: 15px; color: var(--vscode-descriptionForeground); flex: none; }
.flat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  border-color: var(--vscode-focusBorder);
}
.flat-card.is-active {
  background: var(--vscode-badge-background);
  border-color: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  font-weight: 600;
}
.flat-card.is-active .codicon { color: inherit; }
.flat-card-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- 减少动效 ---- */
@media (prefers-reduced-motion: reduce) {
  .demo-pane, .cat-chip, .demo-switch-btn, .flat-card { transition: none; animation: none; }
}
</style>
</head>
<body>
<div class="monaco-workbench vs-dark">
  <div class="demo-root">

    <header class="demo-head">
      <h1 class="demo-title"><span class="codicon codicon-layers"></span>分类布局 v2 · 扁平 24 小分类</h1>
      <p class="demo-sub">去掉父/子层级，24 个小分类直接平铺 · Fluent 几何 + VS Code token 配色 · 点击切换方案与选中分类</p>
    </header>

    <nav class="demo-switch" id="switchBar">
      <button class="demo-switch-btn is-active" data-plan="chips">chips 网格</button>
      <button class="demo-switch-btn" data-plan="cards">小卡片网格</button>
    </nav>

    <section class="demo-pane is-active" id="pane-chips">
      <div class="flat-panel"><div class="flat-chips" id="chipsRoot"></div></div>
    </section>

    <section class="demo-pane" id="pane-cards">
      <div class="flat-cards" id="cardsRoot"></div>
    </section>

  </div>
</div>

<script>
(function () {
  'use strict';
  // 24 个小分类（展平：动画 6 + 音乐 6 + 游戏 6 + 知识 6；tid 为真实值）
  var FLAT = [
    { key: '24', title: 'MAD·AMV', group: '动画', icon: 'codicon-play' },
    { key: '25', title: 'MMD·3D', group: '动画', icon: 'codicon-play' },
    { key: '47', title: '短片·手书', group: '动画', icon: 'codicon-play' },
    { key: '27', title: '综合', group: '动画', icon: 'codicon-play' },
    { key: '33', title: '连载动画', group: '动画', icon: 'codicon-play' },
    { key: '32', title: '完结动画', group: '动画', icon: 'codicon-play' },
    { key: '28', title: '原创音乐', group: '音乐', icon: 'codicon-music' },
    { key: '29', title: '翻唱', group: '音乐', icon: 'codicon-music' },
    { key: '30', title: 'VOCALOID', group: '音乐', icon: 'codicon-music' },
    { key: '31', title: '演奏', group: '音乐', icon: 'codicon-music' },
    { key: '193', title: '电音', group: '音乐', icon: 'codicon-music' },
    { key: '130', title: 'MV', group: '音乐', icon: 'codicon-music' },
    { key: '17', title: '单机游戏', group: '游戏', icon: 'codicon-game' },
    { key: '171', title: '电子竞技', group: '游戏', icon: 'codicon-game' },
    { key: '172', title: '手机游戏', group: '游戏', icon: 'codicon-game' },
    { key: '65', title: '网络游戏', group: '游戏', icon: 'codicon-game' },
    { key: '173', title: '桌游棋牌', group: '游戏', icon: 'codicon-game' },
    { key: '121', title: 'GMV', group: '游戏', icon: 'codicon-game' },
    { key: '201', title: '科学科普', group: '知识', icon: 'codicon-mortar-board' },
    { key: '124', title: '社科心理', group: '知识', icon: 'codicon-mortar-board' },
    { key: '228', title: '人文历史', group: '知识', icon: 'codicon-mortar-board' },
    { key: '207', title: '财经商业', group: '知识', icon: 'codicon-mortar-board' },
    { key: '208', title: '校园学习', group: '知识', icon: 'codicon-mortar-board' },
    { key: '122', title: '野生技能', group: '知识', icon: 'codicon-mortar-board' },
  ];

  // ---- 方案 A：chips 网格（带分类图标） ----
  (function () {
    var root = document.getElementById('chipsRoot');
    FLAT.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat-chip';
      b.title = it.group + ' · ' + it.title;
      var ic = document.createElement('span');
      ic.className = 'codicon ' + it.icon;
      b.appendChild(ic);
      b.appendChild(document.createTextNode(it.title));
      b.addEventListener('click', function () {
        var was = b.classList.contains('is-active');
        Array.prototype.forEach.call(root.children, function (c) { c.classList.remove('is-active'); });
        if (!was) b.classList.add('is-active');
      });
      root.appendChild(b);
    });
  })();

  // ---- 方案 B：小卡片网格 ----
  (function () {
    var root = document.getElementById('cardsRoot');
    FLAT.forEach(function (it) {
      var c = document.createElement('button');
      c.type = 'button';
      c.className = 'flat-card';
      c.title = it.group + ' · ' + it.title;
      var ic = document.createElement('span');
      ic.className = 'codicon ' + it.icon;
      var nm = document.createElement('span');
      nm.className = 'flat-card-name';
      nm.textContent = it.title;
      c.appendChild(ic);
      c.appendChild(nm);
      c.addEventListener('click', function () {
        var was = c.classList.contains('is-active');
        Array.prototype.forEach.call(root.children, function (x) { x.classList.remove('is-active'); });
        if (!was) c.classList.add('is-active');
      });
      root.appendChild(c);
    });
  })();

  // ---- 方案切换（支持 location.hash：#chips/#cards） ----
  var bar = document.getElementById('switchBar');
  function applyPlan(p) {
    if (['chips', 'cards'].indexOf(p) === -1) p = 'chips';
    Array.prototype.forEach.call(bar.children, function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-plan') === p);
    });
    ['chips', 'cards'].forEach(function (x) {
      document.getElementById('pane-' + x).classList.toggle('is-active', x === p);
    });
  }
  applyPlan((location.hash || '').replace('#', ''));
  bar.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.demo-switch-btn');
    if (!btn) return;
    applyPlan(btn.getAttribute('data-plan'));
  });
})();
</script>
</body>
</html>
'''


if __name__ == '__main__':
    main()
