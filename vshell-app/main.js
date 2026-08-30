/* ============================================================
 * main.js — Electron 主进程
 * 窗口 1440x900 深色（沿用 vshell #181818 视觉）；预加载 preload.js
 * （contextIsolation，仅暴露 vshellApi 白名单通道）；IPC 见 ipc.js。
 * ============================================================ */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerIpc } = require('./ipc');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#181818',
    title: 'vshell',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要 require（仅主进程侧依赖）
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 启动自检：渲染进程就绪后检查 VShell 挂载 + 截图存档（验证用）
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(
      "new Promise(function (res) { setTimeout(function () { " +
      "res({ hasV: !!window.VShell, hasNav: !!window.VShell && !!window.VShell.navbar, " +
      "hash: location.hash, title: document.title, bodyKids: document.body ? document.body.children.length : -1 }); " +
      "}, 800); })"
    ).then((info) => {
      console.log('[vshell] renderer ready:', JSON.stringify(info));
      if (!info || !info.hasV) {
        console.error('[vshell] 渲染进程 VShell 未挂载！');
      }
    }).catch((e) => {
      console.error('[vshell] 自检失败:', e);
    });
  });

  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
