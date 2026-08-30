/* ============================================================
 * config.js — 应用配置持久化（主进程）
 * 存 userData/config.json：cookie 字符串 + 其他设置。
 * cookie 由用户在设置页手动粘贴（SESSDATA 等），
 * 写入前做安全过滤（只保留 bilibili 相关键）。
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FILE = () => path.join(app.getPath('userData'), 'config.json');

function read() {
  try {
    return JSON.parse(fs.readFileSync(FILE(), 'utf-8'));
  } catch (e) {
    return {};
  }
}

function write(obj) {
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true });
    fs.writeFileSync(FILE(), JSON.stringify(obj, null, 2), 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
}

/* cookie 白名单键：仅保留 B 站登录/会话相关，防止粘贴整段浏览器 cookie 时
 * 夹带其他站点敏感键（dpop 等）。保留键名大小写不敏感比较。 */
const COOKIE_KEEP = new Set([
  'SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5',
  'sid', 'buvid3', 'buvid4', 'b_nut', '_uuid',
]);

function sanitizeCookie(raw) {
  const s = String(raw || '');
  const parts = s.split(';').map((x) => x.trim()).filter(Boolean);
  const kept = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    if (COOKIE_KEEP.has(k)) kept.push(part);
  }
  return kept.join('; ');
}

module.exports = {
  getCookie: () => read().cookie || '',
  setCookie: (raw) => {
    const c = sanitizeCookie(raw);
    const obj = read();
    obj.cookie = c;
    const ok = write(obj);
    return { ok, cookie: c, keptCount: c ? c.split(';').length : 0 };
  },
  getSettings: () => read(),
  saveSettings: (patch) => {
    const obj = read();
    Object.assign(obj, patch);
    return write(obj);
  },
};
