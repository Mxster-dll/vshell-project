/* ============================================================
 * searchTags — 搜索标签（用户需求 v0.3.19：搜索功能全面增强）
 *
 * 纯内存、不持久化（用户明确：搜索标签「不用存储，只是作为一个搜索关键词」）：
 *  - Ctrl+Enter 把输入内容设为搜索标签 → 立即触发聚合搜索
 *  - 聚合搜索 = 对【所有搜索标签（去重后）】分别调用 adapter.search，
 *    结果去重后按标签顺序拼接为一个视频墙（分组标注来源）
 *  - 页面刷新即清空（内存态）
 *  - v0.3.42：胶囊【允许重复】显示（用户需求），搜索时由聚合页对列表去重
 *
 * API：list() / add(kw)→bool / remove(kw)→bool / clear() / onChange(fn)→注销
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var kws = [];                // 搜索关键词（内存态，顺序 = 添加顺序；允许重复）
  var listeners = [];

  function emit() {
    listeners.forEach(function (fn) { try { fn(kws.slice()); } catch (e) { /* noop */ } });
  }

  /** 全部搜索标签（副本，含重复） */
  function list() { return kws.slice(); }

  /** 添加（trim；空串忽略）。v0.3.42：不去重——胶囊允许重复，
   *  去重由聚合搜索消费端负责（kws() 见 searchtags.js） */
  function add(kw) {
    var k = String(kw || '').trim();
    if (!k) return false;
    kws.push(k);
    emit();
    return true;
  }

  /** 删除单个（重复胶囊只删第一个——编辑器每次删一个 DOM 胶囊即一次 remove） */
  function remove(kw) {
    var i = kws.indexOf(String(kw || '').trim());
    if (i === -1) return false;
    kws.splice(i, 1);
    emit();
    return true;
  }

  /** 清空 */
  function clear() {
    if (!kws.length) return;
    kws.length = 0;
    emit();
  }

  /** 变更监听；返回注销函数 */
  function onChange(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  V.searchTags = { list: list, add: add, remove: remove, clear: clear, onChange: onChange };
})();
