/* ============================================================
 * char-banners — 角色默认背景图（v0.5.6 第五轮追加，用户需求）
 *
 * 用户需求：「我希望角色都有默认的背景图，你手绘一些 svg」
 * - 8 张手绘抽象几何 SVG（640x360 16:9，深色渐变底 + 亮色图案，
 *   与角色主页 banner 的 has-bg 提亮文字逻辑兼容）
 * - bannerFor(name)：按角色名 hash 稳定分配（同名同图）
 * - 自定义背景图（characters.banner）优先，未设置时用默认
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell = window.VShell || {};

  function svg(body) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">'
      + body
      + '</svg>');
  }

  var BANNERS = [
    /* 1 靛蓝圆环 */
    svg('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#25376b"/><stop offset="1" stop-color="#101a3a"/></linearGradient></defs>'
      + '<rect width="640" height="360" fill="url(#g)"/>'
      + '<circle cx="200" cy="150" r="110" fill="none" stroke="#ffffff" stroke-opacity="0.30" stroke-width="6"/>'
      + '<circle cx="200" cy="150" r="72" fill="none" stroke="#ffffff" stroke-opacity="0.20" stroke-width="4"/>'
      + '<circle cx="200" cy="150" r="36" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="3"/>'
      + '<circle cx="480" cy="250" r="14" fill="#ffffff" fill-opacity="0.45"/>'
      + '<circle cx="520" cy="90" r="8" fill="#ffffff" fill-opacity="0.30"/>'
      + '<circle cx="120" cy="280" r="6" fill="#ffffff" fill-opacity="0.25"/>'),
    /* 2 紫罗兰山峦 */
    svg('<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="#3b2a5e"/><stop offset="1" stop-color="#1a1230"/></linearGradient></defs>'
      + '<rect width="640" height="360" fill="url(#g)"/>'
      + '<polygon points="0,300 140,150 280,300" fill="#ffffff" fill-opacity="0.12"/>'
      + '<polygon points="180,300 360,110 540,300" fill="#ffffff" fill-opacity="0.18"/>'
      + '<polygon points="380,300 520,170 640,300" fill="#ffffff" fill-opacity="0.26"/>'
      + '<circle cx="470" cy="80" r="34" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="3"/>'
      + '<circle cx="470" cy="80" r="22" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>'),
    /* 3 青绿波浪 */
    svg('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#1d4a4d"/><stop offset="1" stop-color="#0d2628"/></linearGradient></defs>'
      + '<rect width="640" height="360" fill="url(#g)"/>'
      + '<path d="M0 130 Q 80 70 160 130 T 320 130 T 480 130 T 640 130" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="5"/>'
      + '<path d="M0 190 Q 80 130 160 190 T 320 190 T 480 190 T 640 190" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="4"/>'
      + '<path d="M0 250 Q 80 190 160 250 T 320 250 T 480 250 T 640 250" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="3"/>'
      + '<circle cx="150" cy="70" r="10" fill="#ffffff" fill-opacity="0.40"/>'
      + '<circle cx="520" cy="60" r="6" fill="#ffffff" fill-opacity="0.30"/>'),
    /* 4 橙红三角 */
    svg('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#6b2d23"/><stop offset="1" stop-color="#331209"/></linearGradient></defs>'
      + '<rect width="640" height="360" fill="url(#g)"/>'
      + '<polygon points="320,60 540,300 100,300" fill="none" stroke="#ffffff" stroke-opacity="0.30" stroke-width="6"/>'
      + '<polygon points="320,110 480,300 160,300" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="4"/>'
      + '<line x1="320" y1="60" x2="320" y2="300" stroke="#ffffff" stroke-opacity="0.15" stroke-width="3"/>'
      + '<circle cx="560" cy="80" r="12" fill="#ffffff" fill-opacity="0.40"/>'
      + '<circle cx="80" cy="100" r="7" fill="#ffffff" fill-opacity="0.28"/>'),
    /* 5 玫红点阵 */
    svg('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#5e2640"/><stop offset="1" stop-color="#2b0f1e"/></linearGradient></defs>'
      + '<rect width="640" height="360" fill="url(#g)"/>'
      + '<g fill="#ffffff">'
      + '<circle cx="80" cy="70" r="10" fill-opacity="0.35"/><circle cx="200" cy="70" r="6" fill-opacity="0.22"/>'
      + '<circle cx="320" cy="70" r="10" fill-opacity="0.35"/><circle cx="440" cy="70" r="6" fill-opacity="0.22"/>'
      + '<circle cx="560" cy="70" r="10" fill-opacity="0.35"/>'
      + '<circle cx="140" cy="140" r="6" fill-opacity="0.22"/><circle cx="260" cy="140" r="10" fill-opacity="0.35"/>'
      + '<circle cx="380" cy="140" r="6" fill-opacity="0.22"/><circle cx="500" cy="140" r="10" fill-opacity="0.35"/>'
      + '<circle cx="80" cy="210" r="10" fill-opacity="0.35"/><circle cx="200" cy="210" r="6" fill-opacity="0.22"/>'
      + '<circle cx="320" cy="210" r="10" fill-opacity="0.35"/><circle cx="440" cy="210" r="6" fill-opacity="0.22"/>'
      + '<circle cx="560" cy="210" r="10" fill-opacity="0.35"/>'
      + '<circle cx="140" cy="280" r="6" fill-opacity="0.22"/><circle cx="260" cy="280" r="10" fill-opacity="0.35"/>'
      + '<circle cx="380" cy="280" r="6" fill-opacity="0.22"/><circle cx="500" cy="280" r="10" fill-opacity="0.35"/>'
      + '</g>'),
    /* 6 墨绿网格 */
    svg('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#1f4a2e"/><stop offset="1" stop-color="#0c2414"/></linearGradient></defs>'
      + '<rect width="640" height="360" fill="url(#g)"/>'
      + '<g stroke="#ffffff" stroke-opacity="0.14" stroke-width="2">'
      + '<line x1="160" y1="0" x2="160" y2="360"/><line x1="320" y1="0" x2="320" y2="360"/>'
      + '<line x1="480" y1="0" x2="480" y2="360"/>'
      + '<line x1="0" y1="120" x2="640" y2="120"/><line x1="0" y1="240" x2="640" y2="240"/>'
      + '</g>'
      + '<rect x="240" y="80" width="160" height="160" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="5"/>'
      + '<circle cx="500" cy="280" r="16" fill="#ffffff" fill-opacity="0.30"/>'),
    /* 7 灰蓝斜线 */
    svg('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#2c3a52"/><stop offset="1" stop-color="#131b2a"/></linearGradient></defs>'
      + '<rect width="640" height="360" fill="url(#g)"/>'
      + '<g stroke="#ffffff" stroke-opacity="0.18" stroke-width="3">'
      + '<line x1="-60" y1="260" x2="260" y2="-60"/><line x1="40" y1="360" x2="360" y2="40"/>'
      + '<line x1="140" y1="460" x2="460" y2="140"/><line x1="240" y1="560" x2="560" y2="240"/>'
      + '<line x1="340" y1="660" x2="660" y2="340"/><line x1="440" y1="760" x2="760" y2="440"/>'
      + '</g>'
      + '<circle cx="160" cy="120" r="40" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4"/>'
      + '<circle cx="500" cy="230" r="12" fill="#ffffff" fill-opacity="0.40"/>'),
    /* 8 金棕方块 */
    svg('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#5c4a22"/><stop offset="1" stop-color="#2b2010"/></linearGradient></defs>'
      + '<rect width="640" height="360" fill="url(#g)"/>'
      + '<g transform="translate(320,150)">'
      + '<rect x="-150" y="-150" width="300" height="300" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="4" transform="rotate(45)"/>'
      + '<rect x="-100" y="-100" width="200" height="200" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="4" transform="rotate(45)"/>'
      + '<rect x="-50" y="-50" width="100" height="100" fill="none" stroke="#ffffff" stroke-opacity="0.40" stroke-width="4" transform="rotate(45)"/>'
      + '</g>'
      + '<circle cx="520" cy="280" r="10" fill="#ffffff" fill-opacity="0.35"/>'
      + '<circle cx="100" cy="90" r="7" fill="#ffffff" fill-opacity="0.25"/>'),
  ];

  /** 稳定 hash（同名同图） */
  function hash(name) {
    var h = 0;
    var s = String(name || '');
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  /** 角色默认背景图 URL（无自定义 banner 时用） */
  function bannerFor(name) {
    return BANNERS[hash(name) % BANNERS.length];
  }

  V.charBanners = {
    bannerFor: bannerFor,
    count: BANNERS.length,
    all: BANNERS.slice(),
  };
})();
