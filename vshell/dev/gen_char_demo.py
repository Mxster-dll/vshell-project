# -*- coding: utf-8 -*-
"""生成角色管理面板重设计演示页（交互式，三方案切换）。
方案 A = Fluent Dialog（WinUI 3 深色 token）；方案 B = VS Code Modern 两栏；
方案 C = 融合（VS Code token 配色 + Fluent 几何动效）。
复用 skill 提取的 tokens/colors/codicon 三 css + ttf base64 内联 → 单文件断网可用。
输出: output/_char-demo.html
用法: python dev/gen_char_demo.py（workdir=vshell）
"""
import base64
import io
import os
import re

SKILL = r'C:\Users\Mxster\.dsh\skills\vscode-modern-ui\resources\assets\css'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'output', '_char-demo.html')


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
<title>角色管理 · 面板重设计演示（vshell v0.5.1）</title>
<style>
/* ===== VS Code 1.133.0 提取 token（原样内联） ===== */
/*__TOKENS__*/
/*__COLORS__*/
/*__CODICON__*/
</style>
<style>
/* ============================================================
 * 角色管理面板重设计演示 — 三方案
 *   A Fluent Dialog（WinUI 3 深色语义 token，fluent-design skill）
 *   B VS Code Modern 两栏（sidebar+content 布局，vscode-modern-ui skill）
 *   C 融合（VS Code token 配色 + Fluent 4px 几何/动效）
 * mimic 纪律：VS Code 部分只用提取 token 并标注；Fluent 部分用 skill token。
 * ============================================================ */
html, body { margin: 0; }
body {
  font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
  font-size: 14px;                 /* Fluent Body / VS Code body1 */
  background: #181818;             /* vshell 页面底色 */
  color: var(--vscode-foreground);
  -webkit-font-smoothing: antialiased;
}
.monaco-workbench { min-height: 100vh; }

/* ---- Fluent 深色语义 token（fluent-design references/design-tokens.md DARK） ---- */
.fluent {
  --f-text-primary: rgba(255, 255, 255, 0.95);
  --f-text-secondary: rgba(255, 255, 255, 0.60);
  --f-text-tertiary: rgba(255, 255, 255, 0.45);
  --f-text-accent: #60cdff;
  --f-control-default: rgba(255, 255, 255, 0.06);
  --f-control-secondary: rgba(255, 255, 255, 0.08);
  --f-subtle-secondary: rgba(255, 255, 255, 0.06);
  --f-subtle-tertiary: rgba(255, 255, 255, 0.04);
  --f-bg-base: #202020;
  --f-bg-secondary: #2c2c2c;
  --f-bg-card: rgba(255, 255, 255, 0.05);
  --f-bg-layer: rgba(255, 255, 255, 0.08);
  --f-stroke-card: rgba(255, 255, 255, 0.08);
  --f-stroke-control: rgba(255, 255, 255, 0.12);
  --f-stroke-divider: rgba(255, 255, 255, 0.08);
  --f-accent: #60cdff;
  --f-accent-hover: #6fd1ff;
  --f-accent-pressed: rgba(96, 205, 255, 0.70);
  --f-smoke: rgba(0, 0, 0, 0.50);
  --f-critical: #ff99a4;
  --f-success: #73d14b;
  --f-radius-control: 4px;         /* Fluent ControlCornerRadius */
  --f-radius-overlay: 8px;         /* Fluent OverlayCornerRadius */
  --f-ease: cubic-bezier(0.33, 0.0, 0.67, 1);   /* Fluent Standard */
}

/* ---- 模拟 vshell 主页背景 ---- */
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
  height: 30px; padding: 0 14px;
  border: 1px solid transparent; border-radius: 15px;
  background: var(--vscode-input-background);
  color: var(--vscode-foreground); font-size: 13px;
}
.demo-sim-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
.demo-sim-card {
  aspect-ratio: 16 / 10;
  border: 1px solid var(--vscode-sideBar-border);
  border-radius: 8px;
  background: var(--vscode-input-background);
}
/* 右下角打开按钮 */
.demo-open {
  position: fixed; right: 24px; bottom: 24px;
  height: 36px; padding: 0 16px;
  border: none; border-radius: 4px;
  background: var(--f-accent); color: #000;
  font-size: 14px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; gap: 8px;
  z-index: 50;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}
.demo-open:hover { background: var(--f-accent-hover); }

/* ---- 方案切换器 ---- */
.demo-switcher {
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
  z-index: 60;
  display: flex; gap: 2px;
  padding: 3px;
  background: rgba(32, 32, 32, 0.92);
  border: 1px solid var(--vscode-sideBar-border);
  border-radius: 8px;
  backdrop-filter: blur(8px);
}
.demo-switcher button {
  border: none; border-radius: 5px;
  background: transparent; color: var(--vscode-descriptionForeground);
  font-size: 12px; padding: 6px 14px; cursor: pointer;
  transition: background 120ms var(--f-ease), color 120ms var(--f-ease);
}
.demo-switcher button.is-on { background: var(--vscode-toolbar-activeBackground); color: var(--vscode-foreground); }
.demo-switcher .sw-hint { font-size: 11px; color: var(--vscode-descriptionForeground); padding: 6px 8px; }

/* ================= 方案 A：Fluent Dialog ================= */
.demo-panel { display: none; }
.demo-panel.is-on { display: block; }

.f-overlay {
  position: fixed; inset: 0; z-index: 40;
  background: var(--f-smoke);
  backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center;
  animation: f-fade 160ms var(--f-ease);
}
@keyframes f-fade { from { opacity: 0; } to { opacity: 1; } }
.f-dialog {
  width: 480px;
  background: var(--f-bg-base);
  border: 1px solid var(--f-stroke-card);
  border-radius: var(--f-radius-overlay);
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.35);
  display: flex; flex-direction: column;
  animation: f-pop 180ms var(--f-ease);
}
@keyframes f-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
.f-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 4px;
}
.f-title { font-size: 20px; font-weight: 600; }              /* Fluent Subtitle */
.f-close {
  width: 32px; height: 32px;
  border: none; border-radius: var(--f-radius-control);
  background: transparent; color: var(--f-text-secondary);
  font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 120ms var(--f-ease);
}
.f-close:hover { background: var(--f-subtle-secondary); }
.f-sub { font-size: 12px; color: var(--f-text-secondary); padding: 0 20px 12px; }
.f-addrow { display: flex; gap: 8px; padding: 4px 20px 12px; }
.f-input {
  flex: 1; height: 32px;
  border: 1px solid var(--f-stroke-control);
  border-radius: var(--f-radius-control);
  background: var(--f-control-default);
  color: var(--f-text-primary);
  font-size: 14px; padding: 0 10px;
  outline: none;
  transition: border-color 120ms var(--f-ease), background 120ms var(--f-ease);
}
.f-input:focus { border-color: var(--f-text-accent); background: var(--f-bg-secondary); }
.f-input::placeholder { color: var(--f-text-tertiary); }
.f-addbtn {
  flex: none; height: 32px; padding: 0 16px;
  border: none; border-radius: var(--f-radius-control);
  background: var(--f-accent); color: #000;
  font-size: 14px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; gap: 6px;
  transition: background 120ms var(--f-ease), transform 80ms var(--f-ease);
}
.f-addbtn:hover { background: var(--f-accent-hover); }
.f-addbtn:active { transform: scale(0.97); }
.f-list { padding: 0 12px; max-height: 264px; overflow-y: auto; }
.f-row {
  display: flex; align-items: center; gap: 10px;
  height: 40px; padding: 0 8px;
  border-radius: var(--f-radius-control);
  cursor: pointer;
  transition: background 120ms var(--f-ease);
}
.f-row:hover { background: var(--f-subtle-secondary); }
.f-row.is-sel { background: rgba(96, 205, 255, 0.14); }
.f-thumb {
  width: 28px; height: 28px; flex: none;
  border-radius: var(--f-radius-control);
  object-fit: cover;
  background: var(--f-bg-secondary);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 600; color: #181818;
  overflow: hidden;
}
.f-thumb img { width: 100%; height: 100%; object-fit: cover; }
.f-row-name { flex: 1; min-width: 0; font-size: 14px; color: var(--f-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.f-kw-badge {
  flex: none;
  font-size: 12px; color: var(--f-text-secondary);
  background: var(--f-control-secondary);
  border-radius: 10px; padding: 1px 8px;
}
.f-row-ops { display: none; gap: 2px; flex: none; }
.f-row:hover .f-row-ops { display: flex; }
.f-iconbtn {
  width: 26px; height: 26px;
  border: none; border-radius: var(--f-radius-control);
  background: transparent; color: var(--f-text-secondary);
  font-size: 13px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 120ms var(--f-ease), color 120ms var(--f-ease);
}
.f-iconbtn:hover { background: var(--f-control-secondary); color: var(--f-text-primary); }
.f-iconbtn.is-del:hover { color: var(--f-critical); }
.f-kwrow { padding: 0 20px; }
.f-kwline { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.f-kwchip {
  height: 24px; padding: 0 10px;
  border-radius: 12px;
  background: var(--f-control-default);
  color: var(--f-text-secondary);
  font-size: 12px;
  display: flex; align-items: center; gap: 4px;
}
.f-kwchip.is-fixed { opacity: 0.7; }
.f-kwchip .codicon { font-size: 10px; cursor: pointer; }
.f-kwchip .codicon:hover { color: var(--f-text-primary); }
.f-kwadd { display: flex; gap: 6px; margin-top: 8px; }
.f-kwadd .f-input { height: 28px; font-size: 13px; }
.f-kwadd .f-addbtn { height: 28px; font-size: 13px; padding: 0 12px; }
.f-empty { padding: 24px 20px; text-align: center; color: var(--f-text-tertiary); font-size: 13px; }
.f-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--f-stroke-divider);
  margin-top: 12px;
}
.f-hint { margin-right: auto; font-size: 12px; color: var(--f-text-tertiary); }
.f-btn {
  height: 32px; padding: 0 16px;
  border-radius: var(--f-radius-control);
  font-size: 14px; cursor: pointer;
  transition: background 120ms var(--f-ease), transform 80ms var(--f-ease);
}
.f-btn:active { transform: scale(0.97); }
.f-btn-pri { border: none; background: var(--f-accent); color: #000; font-weight: 600; }
.f-btn-pri:hover { background: var(--f-accent-hover); }
.f-btn-sec {
  border: 1px solid var(--f-stroke-control);
  background: transparent; color: var(--f-text-primary);
}
.f-btn-sec:hover { background: var(--f-subtle-secondary); }

/* ================= 方案 B：VS Code Modern 两栏 ================= */
.v-dialog {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  z-index: 40;
  width: 640px;
  background: var(--vscode-surface-background);   /* mimic: 卡片几何 floating-panels.css:24 */
  border: 1px solid var(--vscode-sideBar-border);
  border-radius: var(--vscode-cornerRadius-large);
  box-shadow: var(--vscode-shadow-lg);
  display: flex; flex-direction: column;
  overflow: hidden;
  animation: v-pop 160ms ease;
}
@keyframes v-pop { from { opacity: 0; transform: translate(-50%, -48%); } to { opacity: 1; transform: translate(-50%, -50%); } }
.v-head {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--vscode-sideBar-border);
}
.v-head .codicon { color: var(--vscode-descriptionForeground); font-size: 15px; }
.v-title { font-size: var(--vscode-fontSize-body1); font-weight: var(--vscode-fontWeight-semiBold); flex: 1; }
.v-close {
  width: 28px; height: 28px;
  border: none; border-radius: var(--vscode-cornerRadius-small);
  background: transparent; color: var(--vscode-foreground);
  font-size: 13px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 120ms ease;
}
.v-close:hover { background: var(--vscode-toolbar-activeBackground); }
.v-body { display: flex; min-height: 320px; }
.v-side {
  width: 220px; flex: none;
  border-right: 1px solid var(--vscode-sideBar-border);
  padding: 8px;
  display: flex; flex-direction: column; gap: 2px;
}
.v-addrow { display: flex; gap: 4px; margin-bottom: 6px; }
.v-input {
  flex: 1; min-width: 0; height: 30px;
  border: 1px solid var(--vscode-input-border);
  border-radius: var(--vscode-cornerRadius-small);
  background: var(--vscode-input-background);
  color: var(--vscode-foreground);
  font-size: var(--vscode-fontSize-body1);
  padding: 0 8px;
  outline: none;
}
.v-input:focus { border-color: var(--vscode-focusBorder); }
.v-addbtn {
  flex: none; width: 30px; height: 30px;
  border: none; border-radius: var(--vscode-cornerRadius-small);
  background: var(--vscode-button-background); color: var(--vscode-button-foreground);
  font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 120ms ease;
}
.v-addbtn:hover { background: var(--vscode-button-hoverBackground); }
.v-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.v-row {
  display: flex; align-items: center; gap: 8px;
  height: 44px; padding: 0 8px;
  border-radius: var(--vscode-cornerRadius-small);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 120ms ease, border-color 120ms ease;
}
.v-row:hover { background: var(--vscode-list-hoverBackground); }
.v-row.is-sel { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.v-thumb {
  width: 30px; height: 30px; flex: none;
  border-radius: var(--vscode-cornerRadius-small);
  object-fit: cover;
  background: var(--vscode-input-background);
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 600; color: #181818;
  overflow: hidden;
  border: 1px solid var(--vscode-sideBar-border);
}
.v-thumb img { width: 100%; height: 100%; object-fit: cover; }
.v-row-name { flex: 1; min-width: 0; font-size: var(--vscode-fontSize-body1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-kw-badge {
  flex: none;
  font-size: var(--vscode-fontSize-label2);
  color: var(--vscode-badge-foreground);
  background: var(--vscode-badge-background);
  border-radius: 10px; padding: 1px 8px;
}
.v-row-del {
  display: none;
  width: 24px; height: 24px;
  border: none; border-radius: var(--vscode-cornerRadius-small);
  background: transparent; color: var(--vscode-descriptionForeground);
  font-size: 12px; cursor: pointer;
  align-items: center; justify-content: center;
}
.v-row:hover .v-row-del { display: flex; }
.v-row-del:hover { color: var(--vscode-errorForeground); background: var(--vscode-toolbar-activeBackground); }
.v-main { flex: 1; min-width: 0; padding: 16px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
.v-detail-head { display: flex; align-items: center; gap: 12px; }
.v-bigthumb {
  width: 64px; height: 64px; flex: none;
  border-radius: var(--vscode-cornerRadius-large);
  object-fit: cover;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-sideBar-border);
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; font-weight: 600; color: #181818;
  overflow: hidden;
}
.v-bigthumb img { width: 100%; height: 100%; object-fit: cover; }
.v-dname { font-size: var(--vscode-fontSize-body1); font-weight: var(--vscode-fontWeight-semiBold); }
.v-dmeta { font-size: var(--vscode-fontSize-label2); color: var(--vscode-descriptionForeground); margin-top: 4px; }
.v-sec { border-top: 1px solid var(--vscode-sideBar-border); padding-top: 12px; }
.v-sec-title { font-size: var(--vscode-fontSize-label2); color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
.v-kwline { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.v-kwchip {
  height: 24px; padding: 0 10px;
  border-radius: var(--vscode-cornerRadius-large);
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
  font-size: var(--vscode-fontSize-label2);
  display: flex; align-items: center; gap: 4px;
}
.v-kwchip.is-fixed { opacity: 0.72; }
.v-kwchip .codicon { font-size: 11px; cursor: pointer; }
.v-kwchip .codicon:hover { color: var(--vscode-errorForeground); }
.v-kwadd { display: flex; gap: 6px; }
.v-kwadd .v-input { height: 28px; font-size: 13px; }
.v-kwadd .v-addbtn { width: 28px; height: 28px; }
.v-actions { display: flex; gap: 8px; margin-top: auto; padding-top: 8px; }
.v-btn {
  height: 32px; padding: 0 14px;
  border-radius: var(--vscode-cornerRadius-small);
  font-size: 13px; cursor: pointer;
  display: flex; align-items: center; gap: 6px;
  transition: background 120ms ease;
}
.v-btn-pri { border: none; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.v-btn-pri:hover { background: var(--vscode-button-hoverBackground); }
.v-btn-img { border: 1px solid var(--vscode-input-border); background: transparent; color: var(--vscode-foreground); }
.v-btn-img:hover { background: var(--vscode-toolbar-activeBackground); }
.v-btn-del { border: 1px solid transparent; background: transparent; color: var(--vscode-errorForeground); }
.v-btn-del:hover { background: rgba(248, 81, 73, 0.12); }
.v-empty { padding: 40px 0; text-align: center; color: var(--vscode-descriptionForeground); font-size: 13px; }

/* ================= 方案 C：融合（VS Code token + Fluent 几何动效） ================= */
.h-overlay {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  animation: f-fade 160ms var(--f-ease);
}
.h-dialog {
  width: 500px;
  background: var(--vscode-surface-background);
  border: 1px solid var(--vscode-sideBar-border);
  border-radius: var(--vscode-cornerRadius-large);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  display: flex; flex-direction: column;
  overflow: hidden;
  animation: h-pop 180ms var(--f-ease);
}
@keyframes h-pop { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: none; } }
.h-head {
  display: flex; align-items: center;
  padding: 14px 16px 0;
}
.h-title { font-size: 18px; font-weight: 600; flex: 1; }
.h-close {
  width: 30px; height: 30px;
  border: none; border-radius: 4px;
  background: transparent; color: var(--vscode-descriptionForeground);
  font-size: 13px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 120ms var(--f-ease);
}
.h-close:hover { background: var(--vscode-toolbar-activeBackground); color: var(--vscode-foreground); }
.h-addrow { display: flex; gap: 8px; padding: 12px 16px 4px; }
.h-input {
  flex: 1; height: 32px;
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;                      /* Fluent ControlCornerRadius */
  background: var(--vscode-input-background);
  color: var(--vscode-foreground);
  font-size: 14px; padding: 0 10px;
  outline: none;
  transition: border-color 120ms var(--f-ease), box-shadow 120ms var(--f-ease);
}
.h-input:focus { border-color: var(--vscode-charts-blue); box-shadow: 0 0 0 1px var(--vscode-charts-blue); }
.h-addbtn {
  flex: none; height: 32px; padding: 0 14px;
  border: none; border-radius: 4px;
  background: var(--vscode-charts-blue); color: #fff;
  font-size: 13px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; gap: 6px;
  transition: filter 120ms var(--f-ease), transform 80ms var(--f-ease);
}
.h-addbtn:hover { filter: brightness(1.12); }
.h-addbtn:active { transform: scale(0.96); }
.h-list { padding: 6px 12px; max-height: 268px; overflow-y: auto; }
.h-row {
  display: flex; align-items: center; gap: 10px;
  height: 48px; padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 120ms var(--f-ease);
}
.h-row:hover { background: var(--vscode-list-hoverBackground); }
.h-row.is-sel { background: var(--vscode-list-activeSelectionBackground); }
.h-row.is-sel .h-row-name { color: var(--vscode-list-activeSelectionForeground); }
.h-thumb {
  width: 32px; height: 32px; flex: none;
  border-radius: 6px;
  object-fit: cover;
  background: var(--vscode-input-background);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 600; color: #181818;
  overflow: hidden;
}
.h-thumb img { width: 100%; height: 100%; object-fit: cover; }
.h-row-name { flex: 1; min-width: 0; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.h-row-ops { display: none; gap: 4px; }
.h-row:hover .h-row-ops { display: flex; }
.h-iconbtn {
  width: 26px; height: 26px;
  border: none; border-radius: 4px;
  background: transparent; color: var(--vscode-descriptionForeground);
  font-size: 13px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 120ms var(--f-ease), color 120ms var(--f-ease);
}
.h-iconbtn:hover { background: var(--vscode-toolbar-activeBackground); color: var(--vscode-foreground); }
.h-iconbtn.is-del:hover { color: var(--vscode-errorForeground); }
.h-kwrow { padding: 2px 16px 0; }
.h-kwline { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.h-kwchip {
  height: 24px; padding: 0 10px;
  border-radius: 12px;
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
  font-size: 12px;
  display: flex; align-items: center; gap: 4px;
  animation: h-chip 160ms var(--f-ease);
}
@keyframes h-chip { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: none; } }
.h-kwchip.is-fixed { opacity: 0.72; }
.h-kwchip .codicon { font-size: 10px; cursor: pointer; }
.h-kwchip .codicon:hover { color: var(--vscode-errorForeground); }
.h-kwadd { display: flex; gap: 6px; margin-top: 8px; }
.h-kwadd .h-input { height: 28px; font-size: 13px; }
.h-kwadd .h-addbtn { height: 28px; padding: 0 10px; font-size: 12px; }
.h-empty { padding: 28px 16px; text-align: center; color: var(--vscode-descriptionForeground); font-size: 13px; }
.h-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--vscode-sideBar-border);
  margin-top: 10px;
}
.h-btn {
  height: 32px; padding: 0 16px;
  border-radius: 4px;
  font-size: 13px; cursor: pointer;
  transition: background 120ms var(--f-ease), transform 80ms var(--f-ease);
}
.h-btn:active { transform: scale(0.97); }
.h-btn-pri { border: none; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.h-btn-pri:hover { background: var(--vscode-button-hoverBackground); }
.h-btn-sec { border: 1px solid var(--vscode-input-border); background: transparent; color: var(--vscode-foreground); }
.h-btn-sec:hover { background: var(--vscode-toolbar-activeBackground); }

/* 说明角标 */
.demo-note {
  position: fixed; left: 16px; bottom: 16px; z-index: 60;
  font-size: 12px; color: var(--vscode-descriptionForeground);
  background: rgba(32, 32, 32, 0.9);
  border: 1px solid var(--vscode-sideBar-border);
  border-radius: 8px;
  padding: 8px 12px;
  max-width: 260px;
  line-height: 1.6;
}
.demo-note b { color: var(--vscode-foreground); }
</style>
</head>
<body class="monaco-workbench vs-dark">
<div class="demo-stage">
  <div class="demo-sim-nav">
    <span class="codicon codicon-home"></span>
    <span class="sim-title">VShell</span>
    <span class="sim-search"></span>
    <span class="codicon codicon-bookmark"></span>
    <span class="codicon codicon-cloud-download"></span>
    <span class="codicon codicon-color-mode"></span>
  </div>
  <div class="demo-sim-body">
    <div class="demo-sim-chips">
      <div class="demo-sim-chip">全站热门</div>
      <div class="demo-sim-chip">动画</div>
      <div class="demo-sim-chip">音乐</div>
      <div class="demo-sim-chip">游戏</div>
      <div class="demo-sim-chip">知识</div>
    </div>
    <div class="demo-sim-grid">
      <div class="demo-sim-card"></div><div class="demo-sim-card"></div><div class="demo-sim-card"></div>
      <div class="demo-sim-card"></div><div class="demo-sim-card"></div><div class="demo-sim-card"></div>
      <div class="demo-sim-card"></div><div class="demo-sim-card"></div>
    </div>
  </div>
</div>

<button class="demo-open" id="openBtn"><span class="codicon codicon-tag"></span>打开角色管理</button>

<div class="demo-switcher">
  <span class="sw-hint">方案：</span>
  <button data-p="a" class="is-on">A · Fluent Dialog</button>
  <button data-p="b">B · VS Code Modern</button>
  <button data-p="c">C · 融合</button>
</div>

<!-- ============ 方案 A：Fluent Dialog ============ -->
<div class="demo-panel is-on" id="panel-a">
  <div class="f-overlay">
    <div class="f-dialog">
      <div class="f-head">
        <div class="f-title">角色管理</div>
        <button class="f-close" title="关闭"><span class="codicon codicon-close"></span></button>
      </div>
      <div class="f-sub">为角色设置名称、头像与匹配关键词；标题命中关键词的视频自动赋予该角色</div>
      <div class="f-addrow">
        <input class="f-input" placeholder="输入角色名称，回车添加" id="a-input">
        <button class="f-addbtn" id="a-addbtn"><span class="codicon codicon-add"></span>添加角色</button>
      </div>
      <div class="f-list" id="a-list"></div>
      <div class="f-kwrow" id="a-kwrow" style="display:none"></div>
      <div class="f-foot">
        <span class="f-hint">共 <span id="a-count">0</span> 个角色</span>
        <button class="f-btn f-btn-sec" id="a-cancel">取消</button>
        <button class="f-btn f-btn-pri" id="a-done">完成</button>
      </div>
    </div>
  </div>
</div>

<!-- ============ 方案 B：VS Code Modern 两栏 ============ -->
<div class="demo-panel" id="panel-b">
  <div class="v-dialog">
    <div class="v-head">
      <span class="codicon codicon-tag"></span>
      <div class="v-title">角色管理</div>
      <button class="v-close" title="关闭"><span class="codicon codicon-close"></span></button>
    </div>
    <div class="v-body">
      <div class="v-side">
        <div class="v-addrow">
          <input class="v-input" placeholder="添加角色…" id="b-input">
          <button class="v-addbtn" id="b-addbtn" title="添加角色"><span class="codicon codicon-add"></span></button>
        </div>
        <div class="v-list" id="b-list"></div>
      </div>
      <div class="v-main" id="b-main"></div>
    </div>
  </div>
</div>

<!-- ============ 方案 C：融合 ============ -->
<div class="demo-panel" id="panel-c">
  <div class="h-overlay">
    <div class="h-dialog">
      <div class="h-head">
        <div class="h-title">角色管理</div>
        <button class="h-close" title="关闭"><span class="codicon codicon-close"></span></button>
      </div>
      <div class="h-addrow">
        <input class="h-input" placeholder="输入角色名称，回车添加" id="c-input">
        <button class="h-addbtn" id="c-addbtn"><span class="codicon codicon-add"></span>添加角色</button>
      </div>
      <div class="h-list" id="c-list"></div>
      <div class="h-kwrow" id="c-kwrow" style="display:none"></div>
      <div class="h-foot">
        <button class="h-btn h-btn-sec" id="c-cancel">取消</button>
        <button class="h-btn h-btn-pri" id="c-done">完成</button>
      </div>
    </div>
  </div>
</div>

<div class="demo-note">
  <b>交互说明：</b>每个方案都可操作——添加角色（回车/按钮）、点击行选中、悬停显示操作（图片/关键词/删除）、行内展开关键词编辑（固定角色名 + 自定义词增删）。<br>
  <b>A</b> = Fluent 深色语义 token（WinUI 3）；<b>B</b> = VS Code 双栏（列表+详情）；<b>C</b> = VS Code 配色 + Fluent 几何动效。
</div>

<script>
(function () {
  'use strict';
  // btoa 不能直接编码含中文的字符串——先 UTF-8 转义（svg 里有"视"字）
  function b64u(s) { return btoa(unescape(encodeURIComponent(s))); }
  var CODEM = {
    'card1.svg': 'data:image/svg+xml;base64,' + b64u(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="8" fill="#59A4F9"/><text x="32" y="42" font-size="30" font-weight="600" text-anchor="middle" fill="#fff" font-family="Segoe UI">视</text></svg>'),
  };
  var CHARS = [
    { name: '视频', icon: 'card1.svg', keywords: ['视频'] },
    { name: '演示', icon: '', keywords: ['演示', '演示UP主'] },
    { name: '不存在', icon: '', keywords: ['不存在'] },
    { name: 'MAD', icon: '', keywords: ['MAD', 'AMV'] },
  ];
  var sel = 0;                 // 选中行 index
  var kwOpen = null;           // 行内关键词编辑展开的角色名

  function iconOf(c) { return CODEM[c.icon] || ''; }
  function thumbHtml(c) {
    var u = iconOf(c);
    if (u) return '<img src="' + u + '" alt="">';
    return '<span>' + (c.name.charAt(0) || '?') + '</span>';
  }
  function chipHtml(k, fixed) {
    return '<span class="' + (fixed ? 'kwchip is-fixed' : 'kwchip') + '">' + k +
      (fixed ? '' : '<span class="codicon codicon-close" data-kw="' + k + '"></span>') + '</span>';
  }

  /* ---------- 方案 A ---------- */
  function renderA() {
    var list = document.getElementById('a-list');
    var rows = '';
    CHARS.forEach(function (c, i) {
      rows += '<div class="f-row' + (i === sel ? ' is-sel' : '') + '" data-i="' + i + '">' +
        '<div class="f-thumb">' + thumbHtml(c) + '</div>' +
        '<div class="f-row-name">' + c.name + '</div>' +
        '<span class="f-kw-badge">' + c.keywords.length + ' 关键词</span>' +
        '<div class="f-row-ops">' +
          '<button class="f-iconbtn" data-op="kw" title="编辑关键词"><span class="codicon codicon-edit"></span></button>' +
          '<button class="f-iconbtn" data-op="img" title="设置图片"><span class="codicon codicon-file-media"></span></button>' +
          '<button class="f-iconbtn is-del" data-op="del" title="删除"><span class="codicon codicon-trash"></span></button>' +
        '</div></div>';
    });
    list.innerHTML = rows || '<div class="f-empty">还没有角色——输入名称添加</div>';
    document.getElementById('a-count').textContent = CHARS.length;
    var kw = document.getElementById('a-kwrow');
    if (kwOpen) {
      var c = CHARS.filter(function (x) { return x.name === kwOpen; })[0];
      if (c) {
        kw.style.display = 'block';
        kw.innerHTML =
          '<div class="f-kwline">' + c.keywords.map(function (k, i) { return chipHtml(k, i === 0); }).join('') + '</div>' +
          '<div class="f-kwadd"><input class="f-input" placeholder="新关键词…" data-kwin>' +
          '<button class="f-addbtn" data-kwadd><span class="codicon codicon-add"></span></button></div>';
      }
    } else {
      kw.style.display = 'none';
    }
  }
  function bindA() {
    document.getElementById('a-list').addEventListener('click', function (e) {
      var row = e.target.closest('.f-row');
      if (!row) return;
      var op = e.target.closest('[data-op]');
      var i = +row.getAttribute('data-i');
      if (op) {
        var kind = op.getAttribute('data-op');
        if (kind === 'del') { CHARS.splice(i, 1); if (sel >= CHARS.length) sel = CHARS.length - 1; if (kwOpen === CHARS[i] && CHARS[i]) kwOpen = null; kwOpen = null; renderA(); return; }
        if (kind === 'kw') { kwOpen = kwOpen === CHARS[i].name ? null : CHARS[i].name; renderA(); return; }
        if (kind === 'img') { CHARS[i].icon = 'card1.svg'; renderA(); return; }
        return;
      }
      sel = i; kwOpen = null; renderA();
    });
    document.getElementById('a-kwrow').addEventListener('click', function (e) {
      var del = e.target.closest('[data-kw]');
      if (!del) return;
      var c = CHARS.filter(function (x) { return x.name === kwOpen; })[0];
      c.keywords = c.keywords.filter(function (k) { return k !== del.getAttribute('data-kw'); });
      if (!c.keywords.length) c.keywords = [c.name];
      renderA();
    });
    document.getElementById('a-kwrow').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var inp = e.target.closest('[data-kwin]');
      if (!inp || !inp.value.trim()) return;
      var c = CHARS.filter(function (x) { return x.name === kwOpen; })[0];
      c.keywords.push(inp.value.trim());
      renderA();
    });
    document.getElementById('a-kwrow').addEventListener('click', function (e) {
      if (!e.target.closest('[data-kwadd]')) return;
      var inp = document.querySelector('[data-kwin]');
      if (!inp || !inp.value.trim()) return;
      var c = CHARS.filter(function (x) { return x.name === kwOpen; })[0];
      c.keywords.push(inp.value.trim());
      renderA();
    });
  }
  function addA() {
    var inp = document.getElementById('a-input');
    var v = inp.value.trim();
    if (!v) return;
    CHARS.unshift({ name: v, icon: '', keywords: [v] });
    sel = 0; kwOpen = null; inp.value = '';
    renderA();
  }

  /* ---------- 方案 B ---------- */
  function renderB() {
    var list = document.getElementById('b-list');
    var rows = '';
    CHARS.forEach(function (c, i) {
      rows += '<div class="v-row' + (i === sel ? ' is-sel' : '') + '" data-i="' + i + '">' +
        '<div class="v-thumb">' + thumbHtml(c) + '</div>' +
        '<div class="v-row-name">' + c.name + '</div>' +
        '<span class="v-kw-badge">' + c.keywords.length + '</span>' +
        '<button class="v-row-del" data-del title="删除"><span class="codicon codicon-trash"></span></button>' +
        '</div>';
    });
    list.innerHTML = rows || '<div class="v-empty">还没有角色</div>';
    var c = CHARS[sel];
    var main = document.getElementById('b-main');
    if (!c) {
      main.innerHTML = '<div class="v-empty">← 选择一个角色，或添加新角色</div>';
      return;
    }
    main.innerHTML =
      '<div class="v-detail-head">' +
        '<div class="v-bigthumb">' + thumbHtml(c) + '</div>' +
        '<div><div class="v-dname">' + c.name + '</div>' +
        '<div class="v-dmeta">' + c.keywords.length + ' 个关键词 · 标题命中任一即匹配</div></div>' +
      '</div>' +
      '<div class="v-sec"><div class="v-sec-title">关键词（含角色名）</div>' +
        '<div class="v-kwline">' + c.keywords.map(function (k, i) { return chipHtml(k, i === 0).replace('kwchip', 'v-kwchip'); }).join('') + '</div>' +
        '<div class="v-kwadd"><input class="v-input" placeholder="新关键词…" id="b-kwin">' +
        '<button class="v-addbtn" id="b-kwadd" title="添加"><span class="codicon codicon-add"></span></button></div>' +
      '</div>' +
      '<div class="v-actions">' +
        '<button class="v-btn v-btn-img" id="b-img"><span class="codicon codicon-file-media"></span>设置图片</button>' +
        '<button class="v-btn v-btn-del" id="b-del"><span class="codicon codicon-trash"></span>删除角色</button>' +
        '<button class="v-btn v-btn-pri" id="b-done"><span class="codicon codicon-check"></span>完成</button>' +
      '</div>';
  }
  function bindB() {
    document.getElementById('b-list').addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) {
        var i = +del.parentNode.getAttribute('data-i');
        CHARS.splice(i, 1);
        if (sel >= CHARS.length) sel = Math.max(0, CHARS.length - 1);
        renderB();
        return;
      }
      var row = e.target.closest('.v-row');
      if (!row) return;
      sel = +row.getAttribute('data-i');
      renderB();
    });
    document.getElementById('b-main').addEventListener('click', function (e) {
      var c = CHARS[sel];
      if (!c) return;
      if (e.target.closest('#b-img')) { c.icon = 'card1.svg'; renderB(); }
      if (e.target.closest('#b-del')) { CHARS.splice(sel, 1); sel = Math.max(0, sel - 1); renderB(); }
      if (e.target.closest('#b-done')) closeAll();
    });
    document.getElementById('b-main').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !e.target.id === 'b-kwin') return;
      var inp = document.getElementById('b-kwin');
      if (!inp || !inp.value.trim()) return;
      CHARS[sel].keywords.push(inp.value.trim());
      renderB();
    });
  }

  /* ---------- 方案 C ---------- */
  function renderC() {
    var list = document.getElementById('c-list');
    var rows = '';
    CHARS.forEach(function (c, i) {
      rows += '<div class="h-row' + (i === sel ? ' is-sel' : '') + '" data-i="' + i + '">' +
        '<div class="h-thumb">' + thumbHtml(c) + '</div>' +
        '<div class="h-row-name">' + c.name + '</div>' +
        '<div class="h-row-ops">' +
          '<button class="h-iconbtn" data-op="kw" title="编辑关键词"><span class="codicon codicon-edit"></span></button>' +
          '<button class="h-iconbtn" data-op="img" title="设置图片"><span class="codicon codicon-file-media"></span></button>' +
          '<button class="h-iconbtn is-del" data-op="del" title="删除"><span class="codicon codicon-trash"></span></button>' +
        '</div></div>';
    });
    list.innerHTML = rows || '<div class="h-empty">还没有角色——输入名称添加</div>';
    var kw = document.getElementById('c-kwrow');
    if (kwOpen) {
      var c = CHARS.filter(function (x) { return x.name === kwOpen; })[0];
      if (c) {
        kw.style.display = 'block';
        kw.innerHTML =
          '<div class="h-kwline">' + c.keywords.map(function (k, i) { return chipHtml(k, i === 0); }).join('') + '</div>' +
          '<div class="h-kwadd"><input class="h-input" placeholder="新关键词…" data-kwin>' +
          '<button class="h-addbtn" data-kwadd><span class="codicon codicon-add"></span></button></div>';
      }
    } else {
      kw.style.display = 'none';
    }
  }
  function bindC() {
    document.getElementById('c-list').addEventListener('click', function (e) {
      var row = e.target.closest('.h-row');
      if (!row) return;
      var op = e.target.closest('[data-op]');
      var i = +row.getAttribute('data-i');
      if (op) {
        var kind = op.getAttribute('data-op');
        if (kind === 'del') { CHARS.splice(i, 1); if (sel >= CHARS.length) sel = CHARS.length - 1; kwOpen = null; renderC(); return; }
        if (kind === 'kw') { kwOpen = kwOpen === CHARS[i].name ? null : CHARS[i].name; renderC(); return; }
        if (kind === 'img') { CHARS[i].icon = 'card1.svg'; renderC(); return; }
        return;
      }
      sel = i; kwOpen = null; renderC();
    });
    document.getElementById('c-kwrow').addEventListener('click', function (e) {
      var del = e.target.closest('[data-kw]');
      if (del) {
        var c = CHARS.filter(function (x) { return x.name === kwOpen; })[0];
        c.keywords = c.keywords.filter(function (k) { return k !== del.getAttribute('data-kw'); });
        if (!c.keywords.length) c.keywords = [c.name];
        renderC();
        return;
      }
      if (!e.target.closest('[data-kwadd]')) return;
      var inp = document.querySelector('#panel-c [data-kwin]');
      if (!inp || !inp.value.trim()) return;
      var c2 = CHARS.filter(function (x) { return x.name === kwOpen; })[0];
      c2.keywords.push(inp.value.trim());
      renderC();
    });
    document.getElementById('c-kwrow').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var inp = e.target.closest('[data-kwin]');
      if (!inp || !inp.value.trim()) return;
      var c = CHARS.filter(function (x) { return x.name === kwOpen; })[0];
      c.keywords.push(inp.value.trim());
      renderC();
    });
  }
  function addC() {
    var inp = document.getElementById('c-input');
    var v = inp.value.trim();
    if (!v) return;
    CHARS.unshift({ name: v, icon: '', keywords: [v] });
    sel = 0; kwOpen = null; inp.value = '';
    renderC();
  }

  /* ---------- 通用 ---------- */
  function closeAll() {
    document.querySelectorAll('.demo-panel').forEach(function (p) { p.classList.remove('is-on'); });
  }
  function showPanel(p) {
    closeAll();
    document.getElementById('panel-' + p).classList.add('is-on');
    document.querySelectorAll('.demo-switcher button').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-p') === p);
    });
  }

  document.querySelectorAll('.demo-switcher button').forEach(function (b) {
    b.addEventListener('click', function () { showPanel(this.getAttribute('data-p')); });
  });
  var init = (location.hash || '').replace('#', '');
  if (['a', 'b', 'c'].indexOf(init) >= 0) showPanel(init);

  document.getElementById('a-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') addA(); });
  document.getElementById('a-addbtn').addEventListener('click', addA);
  document.getElementById('c-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') addC(); });
  document.getElementById('c-addbtn').addEventListener('click', addC);
  document.getElementById('b-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { var b = document.getElementById('b-input'); var v = b.value.trim(); if (v) { CHARS.unshift({ name: v, icon: '', keywords: [v] }); sel = 0; b.value = ''; renderB(); } } });
  document.getElementById('b-addbtn').addEventListener('click', function () {
    var b = document.getElementById('b-input'); var v = b.value.trim();
    if (v) { CHARS.unshift({ name: v, icon: '', keywords: [v] }); sel = 0; b.value = ''; renderB(); }
  });

  bindA(); bindB(); bindC();
  renderA(); renderB(); renderC();
})();
</script>
</body>
</html>
'''

if __name__ == '__main__':
    main()
