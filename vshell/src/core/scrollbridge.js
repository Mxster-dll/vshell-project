/* ============================================================
 * scrollbridge — Flutter 壳滚轮桥（v0.5.6）
 * WebView2 的 SendMouseInput(WHEEL) 在 composition controller 下
 * 不触发页面滚动（实测 scrollY 恒 0）——Dart 侧 onPointerSignal
 * 收到滚轮后经 executeScript 调 window.__VS_SCROLL__(dy, x, y)，
 * 沿命中元素祖先链找最近可滚容器命令式滚动（scrollTop += dy）。
 * 弹窗/feed/浮层等嵌套滚动容器自然命中，无容器时滚 documentElement。
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  function findScrollable(x, y) {
    var el = null;
    try { el = document.elementFromPoint(x, y); } catch (e) { return null; }
    while (el) {
      if (el.scrollHeight > el.clientHeight + 1) {
        var ov;
        try { ov = window.getComputedStyle(el).overflowY; } catch (e) { ov = ''; }
        if (ov === 'auto' || ov === 'scroll' || ov === 'overlay') {
          return el;
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  /** dy>0 向下滚（内容上移）；x,y = CSS 像素（相对视口）。
   *  v0.6.73：平滑滚动（rAF 插值）——滚轮不再硬跳。 */
  window.__VS_SCROLL__ = function (dy, x, y) {
    var target = findScrollable(x, y);
    if (target) {
      if (V.smoothScroll && V.smoothScroll.scrollBy && V.smoothScroll.scrollBy(target, dy)) return;
      target.scrollTop += dy;
      return;
    }
    var sc = document.scrollingElement || document.documentElement;
    if (V.smoothScroll && V.smoothScroll.scrollBy && V.smoothScroll.scrollBy(sc, dy)) return;
    sc.scrollTop += dy;
  };

  /** Dart → JS 滚动指令（postWebMessage 通道）：WebView2 的
   * ExecuteScript 高频调用（每次滚轮一次）有已知内存泄漏（Windows
   * RADAR_PRE_LEAK_64 实测标记）——postWebMessage 无返回值对象、
   * 不泄漏，是滚动桥的正式通道；__VS_SCROLL__ 保留兼容 executeScript。
   * e.data：插件 PostWebMessageAsJson 会把消息解析成 JSON 对象
   * （非字符串）——两种类型都兼容。 */
  try {
    if (window.chrome && window.chrome.webview) {
      window.chrome.webview.addEventListener('message', function (e) {
        var d = e.data;
        if (typeof d === 'string') {
          try { d = JSON.parse(d); } catch (err) { return; }
        }
        if (d && d.t === 'scroll') {
          window.__VS_SCROLL__(d.dy, d.x, d.y);
        }
      });
    }
  } catch (e) { /* 无 chrome.webview（纯浏览器调试）时忽略 */ }

  V.scrollBridge = { findScrollable: findScrollable };
})();
