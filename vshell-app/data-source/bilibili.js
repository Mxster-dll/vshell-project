/* ============================================================
 * data-source/bilibili.js — B 站数据源（Node 侧实现）
 *
 * 独立应用的数据源层：主进程内运行，渲染进程经 IPC（bili:request）
 * 调用。与页面版适配器（vshell/src/adapters/bilibili.js）保持同一
 * SiteAdapter 契约，但网络层走 Node fetch（无 CORS），cookie 登录态
 * 由应用配置注入（用户手动粘贴，见 config.js）。
 *
 * 实现契约：
 *   getHomeSections()  → [{key,title,icon}]        主页分类（扁平 24 小分类）
 *   getCategoryVideos(key,page) → {items,hasMore}  分类墙（ranking/region）
 *   getHomeFeed(page)  → {items,hasMore}           主页热门（popular）
 *   getVideoDetail(id) → VideoDetail               详情（wbi/view）
 *   getPlayInfo(id,cid)→ {type:'dash'|'durl',...}  播放/下载源（wbi/playurl）
 *   getRelated(id)     → VideoItem[]               相关推荐
 *   search(keyword,page)→ {items,hasMore}          搜索（wbi/search/type）
 *   getSectionName(tid)→ string                    分区名
 *   parseVideoId(input)→ id|null                   提取 bvid
 *
 * wbi 签名：nav 拿 wbi_img 文件名 → MIXIN_KEY_ENC_TAB 洗牌 → md5(query+mixin)
 * ============================================================ */
'use strict';

const crypto = require('crypto');

const API = 'https://api.bilibili.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/* ---- wbi 签名（与页面版同表） ---- */
const MIXIN_KEY_ENC_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];

class BiliClient {
  /**
   * @param {object} opts
   * @param {() => string} opts.getCookie  返回 cookie 字符串（无则 ''）
   * @param {(level:string, args:any[]) => void} [opts.log]  可选日志
   */
  constructor(opts) {
    this._getCookie = (opts && opts.getCookie) || (() => '');
    this._log = (opts && opts.log) || (() => {});
    this._wbiCache = { mixin: null, ts: 0 };
  }

  /* ---------- 网络层 ---------- */

  /** 主进程 fetch：注入 UA/Referer/cookie；返回 {ok, status, json|error} */
  async _raw(url, { method = 'GET', headers = {}, body } = {}) {
    const h = {
      'User-Agent': UA,
      'Referer': 'https://www.bilibili.com/',
      'Accept': 'application/json, text/plain, */*',
      ...headers,
    };
    const cookie = this._getCookie();
    if (cookie) h['Cookie'] = cookie;
    const init = { method, headers: h, redirect: 'follow' };
    if (body !== undefined) {
      init.body = body;
      if (typeof body === 'string') h['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    const res = await fetch(url, init);
    return res;
  }

  /** API JSON 请求：wbi 可选签名；code!==0 抛错（含未登录 -101） */
  async request(path, params = {}, { wbi = false, method = 'GET' } = {}) {
    let p = { ...params };
    if (wbi) p = await this._wbiSign(p);
    const qs = Object.keys(p).map((k) =>
      encodeURIComponent(k) + '=' + encodeURIComponent(p[k])
    ).join('&');
    const full = API + path + (qs ? '?' + qs : '');
    let res;
    try {
      res = await this._raw(full, { method });
    } catch (e) {
      const err = new Error('网络错误: ' + e.message);
      err.kind = 'network';
      throw err;
    }
    let j = null;
    try { j = await res.json(); } catch (e) { /* 非 JSON */ }
    if (!j || typeof j !== 'object') {
      const err = new Error('API 响应非 JSON（HTTP ' + res.status + '）');
      err.kind = 'http';
      err.status = res.status;
      throw err;
    }
    if (j.code !== 0) {
      const err = new Error('API ' + j.code + ' ' + (j.message || ''));
      err.kind = 'api';
      err.code = j.code;
      err.raw = j;
      throw err;
    }
    return j.data;
  }

  /** 原始 JSON 请求（IPC 透传用）：不抛错，返回 {code,message,data} 或 {error} */
  async requestRaw(path, params = {}, { wbi = false, method = 'GET' } = {}) {
    try {
      const data = await this.request(path, params, { wbi, method });
      return { ok: true, code: 0, message: '', data };
    } catch (e) {
      return {
        ok: false,
        error: e.message,
        kind: e.kind || 'unknown',
        code: e.code,
        apiCode: e.code,
      };
    }
  }

  /* ---------- wbi ---------- */

  async _getMixinKey() {
    if (this._wbiCache.mixin && Date.now() - this._wbiCache.ts < 3600e3) {
      return this._wbiCache.mixin;
    }
    const d = await this.request('/x/web-interface/nav', {});
    const img = ((d && d.wbi_img && d.wbi_img.img_url) || '').split('/').pop().split('.')[0];
    const sub = ((d && d.wbi_img && d.wbi_img.sub_url) || '').split('/').pop().split('.')[0];
    const raw = img + sub;
    let mixin = '';
    for (let i = 0; i < MIXIN_KEY_ENC_TAB.length; i++) mixin += raw[MIXIN_KEY_ENC_TAB[i]];
    this._wbiCache.mixin = mixin.slice(0, 32);
    this._wbiCache.ts = Date.now();
    return this._wbiCache.mixin;
  }

  async _wbiSign(params) {
    const mixin = await this._getMixinKey();
    const p = {};
    for (const k of Object.keys(params)) {
      if (params[k] !== undefined && params[k] !== '') p[k] = params[k];
    }
    p.wts = Math.floor(Date.now() / 1000);
    const keys = Object.keys(p).sort();
    const query = keys.map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(p[k])).join('&');
    p.w_rid = crypto.createHash('md5').update(query + mixin).digest('hex');
    return p;
  }

  /* ---------- 数据归一化 ---------- */

  _toSec(d) {
    if (typeof d === 'number') return d;
    if (typeof d === 'string') {
      if (d.indexOf(':') !== -1) {
        const parts = d.split(':').map(Number);
        let s = 0;
        for (let i = 0; i < parts.length; i++) s = s * 60 + (parts[i] || 0);
        return s;
      }
      const n = parseFloat(d);
      return isFinite(n) ? n : 0;
    }
    return 0;
  }

  _normItem(it) {
    const stat = it.stat || it;
    return {
      id: it.bvid,
      title: it.title,
      pic: (it.pic || '').replace(/^http:\/\//, 'https://'),
      duration: this._toSec(it.duration),
      pubdate: it.pubdate || it.ctime || 0,
      owner: {
        name: (it.owner && it.owner.name) || it.author || '',
        face: (it.owner && it.owner.face) || '',
      },
      stat: { view: stat.view, like: stat.like, danmaku: stat.danmaku },
      tid: it.tid,
      tname: it.tname || '',
    };
  }

  /* ---------- 分类表（与页面版一致） ---------- */

  get SECTIONS() {
    return [
      { key: '24', title: 'MAD·AMV', icon: 'codicon-play' },
      { key: '25', title: 'MMD·3D', icon: 'codicon-play' },
      { key: '47', title: '短片·手书', icon: 'codicon-play' },
      { key: '27', title: '综合', icon: 'codicon-play' },
      { key: '33', title: '连载动画', icon: 'codicon-play' },
      { key: '32', title: '完结动画', icon: 'codicon-play' },
      { key: '28', title: '原创音乐', icon: 'codicon-music' },
      { key: '29', title: '翻唱', icon: 'codicon-music' },
      { key: '30', title: 'VOCALOID', icon: 'codicon-music' },
      { key: '31', title: '演奏', icon: 'codicon-music' },
      { key: '193', title: '电音', icon: 'codicon-music' },
      { key: '130', title: 'MV', icon: 'codicon-music' },
      { key: '17', title: '单机游戏', icon: 'codicon-game' },
      { key: '171', title: '电子竞技', icon: 'codicon-game' },
      { key: '172', title: '手机游戏', icon: 'codicon-game' },
      { key: '65', title: '网络游戏', icon: 'codicon-game' },
      { key: '173', title: '桌游棋牌', icon: 'codicon-game' },
      { key: '121', title: 'GMV', icon: 'codicon-game' },
      { key: '201', title: '科学科普', icon: 'codicon-mortar-board' },
      { key: '124', title: '社科心理', icon: 'codicon-mortar-board' },
      { key: '228', title: '人文历史', icon: 'codicon-mortar-board' },
      { key: '207', title: '财经商业', icon: 'codicon-mortar-board' },
      { key: '208', title: '校园学习', icon: 'codicon-mortar-board' },
      { key: '122', title: '野生技能', icon: 'codicon-mortar-board' },
    ];
  }

  /* ---------- SiteAdapter 契约实现 ---------- */

  async getHomeSections() {
    return this.SECTIONS;
  }

  async getCategoryVideos(key, page) {
    page = page || 1;
    if (key === '0') return this.getHomeFeed(page);
    const d = await this.request('/x/web-interface/ranking/region', { rid: key, day: 3 });
    const list = Array.isArray(d) ? d : (d && d.list) || [];
    return { items: list.map((it) => this._normItem(it)), hasMore: false };
  }

  async getHomeFeed(page) {
    page = page || 1;
    const d = await this.request('/x/web-interface/popular', { pn: page, ps: 24 });
    const list = (d && d.list) || [];
    return {
      items: list.map((it) => this._normItem(it)),
      hasMore: (d && d.has_more) === 1 || list.length >= 24,
    };
  }

  async getVideoDetail(id) {
    const d = await this.request('/x/web-interface/wbi/view', { bvid: id }, { wbi: true });
    const it = this._normItem(d);
    it.desc = d.desc || '';
    it.cid = d.cid;
    it.owner.face = (d.owner && d.owner.face) || '';
    it.pages = (d.pages || []).map((pg) => ({
      cid: pg.cid, page: pg.page, part: pg.part, duration: pg.duration,
    }));
    return it;
  }

  async getPlayInfo(id, cid) {
    const cid2 = cid || (await this.getVideoDetail(id)).cid;
    const d = await this.request('/x/player/wbi/playurl', {
      bvid: id, cid: cid2, qn: 127, fnval: 4048, fourk: 1, fnver: 0, platform: 'web', otype: 'json',
    }, { wbi: true });
    const info = { type: 'dash', dash: null, durl: null, duration: (d.timelength || 0) / 1000, cid: cid2 };
    if (d.dash && d.dash.video && d.dash.video.length) {
      const vids = d.dash.video;
      const pick = (codecPrefix) => {
        const list = vids.filter((t) => (t.codecs || '').indexOf(codecPrefix) === 0);
        if (!list.length) return null;
        list.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
        return list[0];
      };
      const vTrack = pick('avc1') || pick('hev1') || pick('av01') || vids[0];
      const audios = (d.dash.audio || []).slice().sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
      info.dash = {
        video: {
          id: vTrack.id, codecs: vTrack.codecs,
          width: vTrack.width, height: vTrack.height,
          bandwidth: vTrack.bandwidth,
          url: vTrack.baseUrl || vTrack.base_url,
          segmentBase: vTrack.SegmentBase || vTrack.segment_base || null,
        },
        audio: audios.length ? {
          id: audios[0].id, codecs: audios[0].codecs, bandwidth: audios[0].bandwidth,
          url: audios[0].baseUrl || audios[0].base_url,
          segmentBase: audios[0].SegmentBase || audios[0].segment_base || null,
        } : null,
      };
    } else if (d.durl && d.durl.length) {
      info.type = 'durl';
      info.durl = d.durl.map((x) => ({ url: x.url, size: x.size, length: x.length }));
    } else {
      throw new Error('无可用播放源');
    }
    return info;
  }

  async getRelated(id) {
    const d = await this.request('/x/web-interface/archive/related', { bvid: id });
    return (Array.isArray(d) ? d : []).map((it) => this._normItem(it)).slice(0, 12);
  }

  async search(keyword, page) {
    page = page || 1;
    const d = await this.request('/x/web-interface/wbi/search/type', {
      search_type: 'video', keyword: keyword, page: page,
    }, { wbi: true });
    const list = (d && d.result) || [];
    return {
      items: list.map((it) => ({
        id: it.bvid,
        title: String(it.title || '').replace(/<[^>]+>/g, ''),
        pic: (it.pic || '').replace(/^http:\/\//, 'https://'),
        duration: this._toSec(it.duration),
        owner: { name: it.author || '' },
        stat: { view: it.play, like: 0 },
        pubdate: it.pubdate || it.ctime || 0,
      })),
      hasMore: list.length >= 20,
    };
  }

  getSectionName(tid) {
    if (!tid || tid === '0') return '全站热门';
    const s = this.SECTIONS.find((x) => x.key === String(tid));
    return s ? s.title : '';
  }

  parseVideoId(input) {
    const s = String(input || '').trim();
    const m = s.match(/BV[0-9A-Za-z]{10}/);
    if (m) return m[0];
    if (/^BV[0-9A-Za-z]{10}$/.test(s)) return s;
    return null;
  }

  /** 登录态探测（设置页「测试登录」用）：返回 {isLogin, uname, mid} 或抛错 */
  async whoami() {
    const d = await this.request('/x/web-interface/nav', {});
    return {
      isLogin: !!(d && d.isLogin),
      uname: (d && d.uname) || '',
      mid: (d && d.mid) || 0,
      level: (d && d.level_info && d.level_info.current_level) || 0,
    };
  }
}

module.exports = { BiliClient, UA };
