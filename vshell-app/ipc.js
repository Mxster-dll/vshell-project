/* ============================================================
 * ipc.js — 主进程 IPC 通道注册
 *
 * bili:*   B 站数据源（渲染进程 site-adapter http 层经此调用）
 *   - bili:request   {url?path, params, method, wbi} → {ok,code,data}|{error}
 *   - bili:whoami    登录态探测 → {isLogin, uname, ...} | {error}
 *   - bili:setCookie {raw} → {ok, keptCount}
 *   - bili:getCookie → string
 *   - bili:status    → {hasCookie, cookieKeys}
 * fs:*     文件写盘（下载引擎 fswriter 的 IPC 后端）
 *   - fs:saveDialog {defaultName} → {canceled} | {path,name}
 *   - fs:saveDir    → {canceled} | {path}
 *   - fs:begin {path}  → {fd}  （打开/创建文件，返回句柄号）
 *   - fs:write  {fd, base64, offset} → {bytesWritten}
 *   - fs:end    {fd} → {size}
 *   - fs:abort  {fd} → {removed}
 * shell:openPath {path} → 打开文件管理器定位
 * ============================================================ */
'use strict';

const { ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { BiliClient } = require('./data-source/bilibili');

let client = null;
function getClient() {
  if (!client) {
    client = new BiliClient({
      getCookie: () => config.getCookie(),
      log: (...a) => console.log('[bili]', ...a),
    });
  }
  return client;
}

/* fd 注册表（渲染进程只有句柄号，无路径权限） */
const fds = new Map(); // fd -> { path, fh }
let nextFd = 1;

function openFd(p) {
  const fh = fs.openSync(p, 'w');
  const fd = nextFd++;
  fds.set(fd, { path: p, fh });
  return fd;
}

function registerIpc() {
  /* ---------- B 站数据源 ---------- */
  ipcMain.handle('bili:request', async (e, req) => {
    try {
      const { path: apiPath, params, method, wbi } = req || {};
      if (!apiPath || typeof apiPath !== 'string') {
        return { ok: false, error: '缺少 path' };
      }
      return await getClient().requestRaw(apiPath, params || {}, {
        wbi: !!wbi,
        method: method || 'GET',
      });
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('bili:whoami', async () => {
    try {
      return { ok: true, data: await getClient().whoami() };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('bili:setCookie', (e, raw) => {
    const r = config.setCookie(raw || '');
    // cookie 变更后强制重置 client（wbi 缓存等不依赖 cookie，但保持干净）
    client = null;
    return r;
  });

  ipcMain.handle('bili:getCookie', () => config.getCookie());

  ipcMain.handle('bili:status', () => {
    const c = config.getCookie();
    const keys = c.split(';').map((x) => x.trim().split('=')[0]).filter(Boolean);
    return { hasCookie: !!c, cookieKeys: keys };
  });

  /* ---------- 文件写盘 ---------- */
  ipcMain.handle('fs:saveDialog', async (e, opts) => {
    const r = await dialog.showSaveDialog({
      title: '保存视频',
      defaultPath: (opts && opts.defaultName) || 'video.mp4',
      filters: [
        { name: '视频文件', extensions: ['mp4', 'm4s', 'm4a', 'ts', 'webm'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    return { canceled: false, path: r.filePath, name: path.basename(r.filePath) };
  });

  ipcMain.handle('fs:saveDir', async () => {
    const r = await dialog.showOpenDialog({
      title: '选择保存目录',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths || !r.filePaths.length) return { canceled: true };
    return { canceled: false, path: r.filePaths[0] };
  });

  ipcMain.handle('fs:begin', async (e, p) => {
    try {
      const fd = openFd(p.path);
      return { ok: true, fd };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('fs:write', async (e, p) => {
    const rec = fds.get(p.fd);
    if (!rec) return { ok: false, error: '无效句柄 ' + p.fd };
    try {
      const buf = Buffer.from(p.base64, 'base64');
      fs.writeSync(rec.fh, buf, 0, buf.length, p.offset || 0);
      return { ok: true, bytesWritten: buf.length };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('fs:end', async (e, p) => {
    const rec = fds.get(p.fd);
    if (!rec) return { ok: false, error: '无效句柄 ' + p.fd };
    try {
      fs.closeSync(rec.fh);
      const size = fs.statSync(rec.path).size;
      fds.delete(p.fd);
      return { ok: true, size };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('fs:abort', async (e, p) => {
    const rec = fds.get(p.fd);
    if (!rec) return { ok: false, error: '无效句柄 ' + p.fd };
    try {
      fs.closeSync(rec.fh);
    } catch (err) { /* noop */ }
    fds.delete(p.fd);
    try {
      fs.unlinkSync(rec.path); // 取消下载：删除半成品
    } catch (err) { /* noop */ }
    return { ok: true, removed: true };
  });

  /* ---------- 杂项 ---------- */
  ipcMain.handle('shell:openPath', async (e, p) => {
    if (!p || !p.path) return { ok: false };
    try { await shell.openPath(p.path); return { ok: true }; }
    catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  });
}

module.exports = { registerIpc, getClient };
