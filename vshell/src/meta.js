// ==UserScript==
// @name         vshell · 通用视频网站套壳 UI
// @namespace    vshell
// @version      0.6.49
// @description  通用视频网站套壳 UI（油猴）：整页接管 bilibili，主页/分类视频墙/详情页/待看收藏(抖音刷+墙)/下载管理(多线程+mp4box合并)，自研播放器与 Dark/Light 双主题
// @author       vshell
// @match        https://www.bilibili.com/*
// @match        https://bilibili.com/*
// @match        https://m.bilibili.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// @connect      *.bilivideo.com
// @connect      *.bilivideo.cn
// @connect      *.hdslb.com
// @connect      *.bilibili.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

/* 构建版本号（与 app.html ?v=N / main.dart URL 同步，每次构建升版）——
 * 显示于导航栏左上角品牌位与设置页「关于」区 */
window.VShell = window.VShell || {};
window.VShell.version = '0.6.49';

/* vshell 入口见 src/app.js */





