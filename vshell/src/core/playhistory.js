/* ============================================================
 * playhistory — 播放历史区间（v0.6.84 用户需求：详情页时间轴
 * 「已播」行——分段记忆实际播放过的区间，跳过后之前播过的段仍显示）
 *
 * 存储：store 键 played.<视频id>（store 自动加 vshell. 前缀），
 * 结构 = 升序、不重叠、已合并的区间数组 [{s, e}]（秒）。
 * 这是用户数据（永久保留，不随缓存清理）——与分镜缓存/墙缓存不同。
 *
 * 区间语义：
 *  - 只记录「实际播放过」的段（段长 >= MIN_SEG 才落盘，闪点不算）
 *  - addSegment 与已有区间做并集合并（重叠/邻接 ≤0.5s 视为连续）
 *  - 播放器事件驱动：play/timeupdate 延伸当前段，pause/seeked/ended
 *    闭合当前段并入历史（调用方 detail.js 维护会话段）
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var KEY = 'played.';       // store 键前缀
  var MIN_SEG = 0.5;         // 最小段长（秒）：不足忽略（闪点/误触不算已播）
  var MERGE_GAP = 0.5;       // 邻接合并容差（秒）：两段间隔 <= 0.5s 视为连续

  function norm(x) {
    return { s: +x.s, e: +x.e };
  }
  /** 读区间（升序、不重叠；损坏数据丢弃） */
  function get(id) {
    if (!id) return [];
    var v = V.store.get(KEY + id);
    if (!Array.isArray(v) || !v.length) return [];
    return v.map(norm)
      .filter(function (r) { return isFinite(r.s) && isFinite(r.e) && r.e > r.s; })
      .sort(function (a, b) { return a.s - b.s; });
  }
  /** 并集合并插入 [s, e]（e <= s 忽略；与重叠/邻接区间融合） */
  function addSegment(id, s, e) {
    if (!id) return [];
    s = +s; e = +e;
    if (!(isFinite(s) && isFinite(e)) || e <= s) return get(id);
    if (e - s < MIN_SEG) return get(id);
    var list = get(id);
    var ins = { s: s, e: e };
    var out = [];
    var merged = null;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.e < ins.s - MERGE_GAP) {            // 完全在插入段之前
        out.push(r);
      } else if (r.s > ins.e + MERGE_GAP) {     // 完全在插入段之后
        if (!merged) { out.push(ins); merged = true; }
        out.push(r);
      } else {                                   // 重叠/邻接 → 融合
        ins = { s: Math.min(ins.s, r.s), e: Math.max(ins.e, r.e) };
      }
    }
    if (!merged) out.push(ins);
    out.sort(function (a, b) { return a.s - b.s; });
    V.store.set(KEY + id, out);
    return out;
  }
  function clear(id) {
    if (id) V.store.del(KEY + id);
  }

  V.playHistory = {
    get: get,
    addSegment: addSegment,
    clear: clear,
    // 测试钩子（harness 用）：纯合并逻辑，不落盘
    _merge: function (list, s, e) {
      var tmp = (list || []).slice();
      var r = { s: +s, e: +e };
      var out = [];
      var merged = false;
      for (var i = 0; i < tmp.length; i++) {
        var x = tmp[i];
        if (x.e < r.s - MERGE_GAP) out.push(x);
        else if (x.s > r.e + MERGE_GAP) {
          if (!merged) { out.push(r); merged = true; }
          out.push(x);
        } else r = { s: Math.min(r.s, x.s), e: Math.max(r.e, x.e) };
      }
      if (!merged) out.push(r);
      return out.sort(function (a, b) { return a.s - b.s; });
    },
  };
})();
