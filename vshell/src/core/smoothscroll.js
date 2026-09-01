/* ============================================================
 * smoothscroll — 视频墙平滑滚动（v0.6.76 用户明确算法：
 *  「有一个目标位置，鼠标滚轮每次滚动只会影响这个目标位置，
 *  当目标位置变化时相应调整速度，速度也是平滑变化的」）
 *
 * 弹簧-阻尼速度模型（smooth-scrollbar 物理算法）：
 *   vel += (target - pos) * STIFF * dt    弹簧力：位置差 → 加速度
 *   vel *= exp(-DAMP * dt)                阻尼：速度指数衰减（平滑）
 *   pos += vel * dt                       积分：位置按速度移动
 * 临界阻尼 DAMP = 2√STIFF → 无过冲、无振荡、快速到位。
 *
 * 特性：
 *  - 滚轮（scrollBy）**只改 target**，不直接动 pos/scrollTop；
 *  - target 变化 → 弹簧力产生加速度 → 速度平滑调整（不突变）；
 *  - 虚拟位置 s.pos：动画独立于真实 scrollTop，未跑时校准真实位置；
 *  - 停止：接近目标且速度几乎为零（无长尾随、无逐格跳感）。
 *
 * 两个入口统一走 V.smoothScroll.scrollBy：
 *  - Flutter 壳滚轮桥（scrollbridge.js 的 __VS_SCROLL__）——
 *    WebView2 composition controller 下滚轮经 Dart onPointerSignal
 *    转发，页面收不到原生 wheel，这是主通道；
 *  - 原生 wheel 事件兜底（模态框/内嵌滚动容器直接命中时）。
 *
 * 排除：修饰键（ctrl/meta/alt 缩放）、输入框/播放器内、
 * 抖音刷 feed（自带 scroll-snap，平滑会破坏吸附）。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  var states = (typeof WeakMap === 'function') ? new WeakMap() : null;
  function getState(el) {
    if (states) {
      var s = states.get(el);
      if (!s) {
        s = { target: 0, pos: 0, vel: 0, accel: 0, raf: 0, last: 0 };
        states.set(el, s);
      }
      return s;
    }
    if (!el.__vsSmooth) el.__vsSmooth = { target: 0, pos: 0, vel: 0, accel: 0, raf: 0, last: 0 };
    return el.__vsSmooth;
  }
  function maxTop(el) { return Math.max(0, el.scrollHeight - el.clientHeight); }
  function clampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** 弹簧-阻尼速度模型（smooth-scrollbar 物理算法；v0.6.76 用户明确：
   *  滚轮只影响目标位置；目标变化时通过弹簧力平滑调整速度，速度本身
   *  连续平滑变化）：
   *    vel += (target - pos) * STIFF * dt    弹簧力（位置差 → 加速度）
   *    vel *= exp(-DAMP * dt)                阻尼（速度指数衰减，平滑）
   *    pos += vel * dt                       积分（位置按速度移动）
   *  临界阻尼 DAMP = 2√STIFF → 无过冲、无振荡、快速到位。 */
  /** v0.6.78：超临界阻尼 + 降低刚度——用户反馈"轻微回弹，是否速度变化
   *  太快"：STIFF=250 时加速度峰值大（100px 差 → 25000px/s²），速度变化
   *  剧烈，且低帧率（dt 大）下离散积分会过冲。STIFF=120（加速度峰值
   *  降 52%，速度变化平缓起停柔和）、DAMP=2.2√STIFF（轻微过阻尼 1.1 倍
   *  → 无过冲，又不至于过阻尼拖慢快速滚动）。 */
  var STIFF = 120;    // 弹簧刚度 1/s²（ω=√STIFF≈11 → 95% 到位 ~270ms）
  var DAMP = 2.2 * Math.sqrt(STIFF);   // 过阻尼 ≈24.1（无过冲、速度平滑）
  // v0.6.79 jerk 限制（加速度变化率限制）：用户反馈"滚动进行中追加一次
  // 滚动会抖一下"——target 突变使 (target-pos) 跳变 → 弹簧力（加速度）
  // 突变 → 位置曲线拐点。限制每帧加速度变化量 → 位置三阶连续，追加输入
  // 时速度平滑过渡（无抖动）。JERK=120000px/s³：单格 60px 的稳态加速度
  // 7200px/s² 需 60ms 达到——起步/追加柔和，又不迟钝。
  var JERK = 120000;
  // v0.6.80 速度上限（terminal velocity）：用户反馈"还是会突然加速"——
  // 弹簧模型下连续追加滚动 target 持续前移 → 加速度持续累积 → 速度无限
  // 增长（越滚越快）。速度钳制在 MAXV，快速滚动时匀速（像原生滚轮），
  // 不再无限加速；接近 target 时弹簧自然减速停下。
  var MAXV = 2400;   // 最大滚动速度 px/s（≈ 快速拨动滚轮的速度）

  function tick(el, s, now) {
    var dt;
    if (!s.last) { s.last = now; dt = 16; }   // 首帧：按一帧计（s.last=0 时 dt 会变 1ms 起步慢）
    else { dt = Math.min(64, Math.max(1, now - s.last)); }
    if (!(dt > 0)) dt = 16;   // 防御：now 缺失/NaN 时按一帧计
    s.last = now;
    var dtS = dt / 1000;
    // 1) 目标与位置之差 → 期望加速度（弹簧力）；jerk 限制：加速度平滑变化
    var accelTarget = (s.target - s.pos) * STIFF;
    var maxDelta = JERK * dtS;
    var dA = accelTarget - s.accel;
    if (dA > maxDelta) dA = maxDelta;
    else if (dA < -maxDelta) dA = -maxDelta;
    s.accel += dA;
    // 2) 积分：加速度 → 速度（阻尼指数衰减 + 速度上限防无限加速）
    s.vel += s.accel * dtS;
    s.vel *= Math.exp(-DAMP * dtS);
    if (s.vel > MAXV) { s.vel = MAXV; if (s.accel > 0) s.accel = 0; }      // 顶速：停推（防解除瞬间再冲）
    else if (s.vel < -MAXV) { s.vel = -MAXV; if (s.accel < 0) s.accel = 0; }
    // 3) 积分：速度 → 位置
    s.pos += s.vel * dtS;
    el.scrollTop = s.pos;
    // 停止：接近目标即落位（消除最后几像素磨蹭）+ 速度几乎为零防振荡
    if (Math.abs(s.target - s.pos) <= 1.5 || (Math.abs(s.target - s.pos) <= 8 && Math.abs(s.vel) <= 0.15)) {
      el.scrollTop = s.target;
      s.raf = 0;
      return;
    }
    s.raf = requestAnimationFrame(function (n) { tick(el, s, n); });
  }

  /** 平滑滚动：dy = 目标增量（像素）。容器不可滚/无增量返回 false。 */
  function scrollBy(el, dy) {
    if (!el || !dy || el.scrollHeight <= el.clientHeight + 1) return false;
    var s = getState(el);
    if (!s.raf) {
      // 动画未跑：以真实滚动位置为基准校准虚拟位置（加速度从 0 起步）
      s.pos = el.scrollTop;
      s.target = el.scrollTop;
      s.accel = 0;
    }
    s.target = clampNum(s.target + dy, 0, maxTop(el));
    if (!s.raf) {
      var elRef = el, sRef = s;
      s.last = 0;
      s.raf = requestAnimationFrame(function (n) { tick(elRef, sRef, n); });
    }
    return true;
  }

  // 原生 wheel 兜底：沿命中元素找最近可滚容器（与 scrollbridge 同思路），
  // 排除 feed（scroll-snap）与输入/播放器；修饰键让原生（缩放等）。
  document.addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var guard = e.target && e.target.closest
      ? e.target.closest('input, textarea, select, [contenteditable], video')
      : null;
    if (guard) return;
    var el = e.target;
    while (el && el !== document.documentElement) {
      if (el.scrollHeight > el.clientHeight + 1) {
        var ov = '';
        try { ov = window.getComputedStyle(el).overflowY; } catch (err) { ov = ''; }
        if (ov === 'auto' || ov === 'scroll' || ov === 'overlay') break;
      }
      el = el.parentElement;
    }
    if (!el || el === document.documentElement) return;
    if (el.classList && el.classList.contains('vshell-feed')) return;   // 刷页 snap 原生
    var dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= el.clientHeight;
    if (Math.abs(dy) < 0.5) return;
    // v0.6.77：原生 wheel = 用户滚动——必须设置用户滚动标记，否则 app.js
    // 的 scroll guard（防 Chromium 恢复拉回）会把本通道的滚动误判为恢复、
    // 每次滚动都拉回顶部（用户反馈"滚一下就有一次回弹"）
    window.__VS_USER_SCROLLING__ = true;
    e.preventDefault();
    scrollBy(el, dy);
  }, true);

  V.smoothScroll = {
    scrollBy: scrollBy,
  };
})();
