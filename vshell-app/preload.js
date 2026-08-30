/* ============================================================
 * preload.js — contextBridge 白名单 API（渲染进程 window.vshellApi）
 *   bili.request({path, params, method, wbi}) → {ok, code, data}|{error}
 *   bili.whoami() / bili.setCookie(raw) / bili.getCookie() / bili.status()
 *   fs.saveDialog({defaultName}) / fs.saveDir()
 *   fs.begin({path}) / fs.write({fd,base64,offset}) / fs.end({fd}) / fs.abort({fd})
 *   shell.openPath({path})
 * ============================================================ */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vshellApi', {
  isElectron: true,
  bili: {
    request: (req) => ipcRenderer.invoke('bili:request', req || {}),
    whoami: () => ipcRenderer.invoke('bili:whoami'),
    setCookie: (raw) => ipcRenderer.invoke('bili:setCookie', raw),
    getCookie: () => ipcRenderer.invoke('bili:getCookie'),
    status: () => ipcRenderer.invoke('bili:status'),
  },
  fs: {
    saveDialog: (opts) => ipcRenderer.invoke('fs:saveDialog', opts || {}),
    saveDir: () => ipcRenderer.invoke('fs:saveDir'),
    begin: (p) => ipcRenderer.invoke('fs:begin', p),
    write: (p) => ipcRenderer.invoke('fs:write', p),
    end: (p) => ipcRenderer.invoke('fs:end', p),
    abort: (p) => ipcRenderer.invoke('fs:abort', p),
  },
  shell: {
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  },
});
