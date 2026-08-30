/* ============================================================
 * mock-adapter — dev harness 用的演示适配器（离线）
 * 注册为 window.__VSHELL_ADAPTER__（site-adapter 测试钩子）
 * 播放源指向本地 ffmpeg 生成的 fMP4 夹具（含 sidx，SegmentBase 可播）
 * codecs/segmentBase 运行时用 mp4box 从夹具真实解析
 * ============================================================ */
(function () {
  'use strict';
  var BASE = '/_vs-fixtures/';
  var N = 16;
  var ITEMS = [];
  var NOW = Math.floor(Date.now() / 1000);
  for (var i = 1; i <= N; i++) {
    ITEMS.push({
      id: 'mock' + i,
      title: '演示视频 ' + i + ' —— 这是一个足够长的标题，用于测试卡片标题两行截断与悬停浮起效果',
      pic: BASE + 'card' + ((i % 4) + 1) + '.svg',
      duration: i === 1 ? 6 : 30 + i * 17,   // mock1 6s（短视频 → 预览走真播放分支，与 m4s 夹具一致）
      pubdate: NOW - i * 86400 * 3,
      owner: { name: '演示UP主' + ((i % 3) + 1), face: BASE + 'card' + ((i % 4) + 1) + '.svg' },
      stat: { view: 10000 + i * 7777, like: 500 + i * 111, danmaku: 500 + i * 333 },
      tid: 'a1',
      tname: '子类A1',
    });
  }

  var adapter = {
    meta: { id: 'mock', name: 'Mock 演示站', match: function () { return false; } },

    getHomeSections: function () {
      // v0.3.73：与 bilibili 适配器同步的扁平 24 小分类（带图标）
      return Promise.resolve([
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
      ]);
    },
    getCategoryVideos: function (key, page) {
      return Promise.resolve({ items: ITEMS.slice(0, 12), hasMore: false });
    },
    getHomeFeed: function (page) {
      // 多页（page 1..3）：验证无限滚动增量加载；id/标题带页码后缀保证唯一
      if (!page || page < 1) page = 1;
      var items = ITEMS.map(function (it) {
        return {
          id: it.id + '_p' + page,
          title: it.title + '（第 ' + page + ' 页）',
          pic: it.pic, duration: it.duration, pubdate: it.pubdate,
          owner: it.owner, stat: it.stat, tid: it.tid, tname: it.tname,
        };
      });
      return Promise.resolve({ items: items, hasMore: page < 3 });
    },
    getVideoDetail: function (id) {
      // v0.5.1：无角色验证视频——标题不含任何角色关键词 → 详情页 + 号「添加角色」
      if (String(id) === 'mockNoRole') {
        return Promise.resolve({
          id: id, title: '纯测试标题', pic: BASE + 'card4.svg', duration: 47,
          pubdate: NOW - 86400 * 3,
          owner: { name: '演示UP主', face: BASE + 'card1.svg' },
          stat: { view: 123, like: 1, danmaku: 0 },
          tid: 'a1', tname: '子类A1',
          desc: 'v0.5.1 无角色验证：标题不含任何角色关键词 → 详情页显示 + 号「添加角色」按钮。',
          cid: 1001,
        });
      }
      return Promise.resolve({
        id: id,
        title: '【演示】详情页测试视频 —— 标题复制 + 播放器 + 下载弹窗',
        pic: ITEMS[0].pic, duration: 97,
        pubdate: NOW - 86400 * 5,
        owner: { name: '演示UP主1', face: BASE + 'card1.svg' },
        stat: { view: 123456, like: 8888, danmaku: 23456 },
        tid: 'a1', tname: '子类A1',
        desc: '这是一段演示简介。\n换行测试：pre-wrap 保留换行。\n\n这是第二段。当简介超过 120 个字符时会出现「展开 / 收起」按钮，用于验证折叠交互与动画。',
        cid: 1001,
      });
    },
    getPlayInfo: function (id, cid) {
      // 分镜识别夹具：3 段场景拼接（红 2s → 彩条 3s → 绿 3s），
      // 期望分镜点 2.0s / 5.0s；无音频轨（纯视频 MPD）
      if (String(id) === 'mockShots') return computePlayInfo(8, 'scene.m4s');
      // 按视频时长声明 duration（MPD 用）：mock1 6s → 预览走真播放分支；
      // 其余 47s+ → 帧采样分支（验证混合策略两条路径）
      var m = String(id || '').match(/mock(\d+)/);
      var n = m ? parseInt(m[1], 10) : 1;
      return computePlayInfo(n === 1 ? 6 : 30 + n * 17);
    },
    getRelated: function (id) { return Promise.resolve(ITEMS.slice(1, 13)); },
    search: function (q, page) {
      // v0.3.19 聚合搜索：按关键词返回不同结果集 + 多页（hasMore page<2），
      // 同一视频（ITEMS 下标）跨关键词 id 相同 → 验证跨源去重；
      // id 不带页号（真实站 bvid 与页无关）→ 跨页同视频去重也生效
      if (!page || page < 1) page = 1;
      var kw = String(q || '').trim();
      var pool = ITEMS;
      if (kw.indexOf('视频') !== -1) pool = ITEMS.slice(0, 8);
      if (kw.indexOf('测试') !== -1) pool = ITEMS.slice(2, 10);
      var items = pool.map(function (it) {
        // v0.3.41：模拟真实站搜索接口——duration 是 "mm:ss" 字符串
        // （真实站 /x/web-interface/wbi/search/type 返回字符串，如 "3:45"）
        var mm = Math.floor((it.duration || 0) / 60);
        var ss = (it.duration || 0) % 60;
        return {
          id: it.id + '_agg',       // 同一视频跨关键词/跨页同 id（真实 bvid 语义）
          title: kw + ' 结果 ' + it.title + '（第 ' + page + ' 页）',
          pic: it.pic, duration: mm + ':' + (ss < 10 ? '0' : '') + ss,
          pubdate: it.pubdate,
          owner: it.owner, stat: it.stat, tid: it.tid, tname: it.tname,
        };
      });
      return Promise.resolve({ items: items, hasMore: page < 2 });
    },
    parseVideoId: function (s) {
      var m = String(s || '').match(/mock\d+/);
      return m ? m[0] : null;
    },
  };
  window.__VSHELL_ADAPTER__ = adapter;

  /* ---- 夹具扫描：init 范围 + sidx 范围 + codecs（mp4box 解析） ---- */
  async function scan(url) {
    var buf = await (await fetch(url)).arrayBuffer();
    var dv = new DataView(buf);
    var pos = 0;
    var initEnd = -1, sidxStart = -1, sidxEnd = -1;
    while (pos + 8 <= buf.byteLength) {
      var size = dv.getUint32(pos);
      var type = String.fromCharCode(dv.getUint8(pos + 4), dv.getUint8(pos + 5), dv.getUint8(pos + 6), dv.getUint8(pos + 7));
      var end = size === 1 ? pos + Number(dv.getBigUint64(pos + 8)) : pos + size;
      if (type === 'ftyp' || type === 'moov') initEnd = end - 1;
      if (type === 'sidx') { if (sidxStart < 0) sidxStart = pos; sidxEnd = end - 1; }
      if (size <= 0) break;
      pos = end;
      if (pos >= buf.byteLength) break;
    }
    return {
      init: '0-' + Math.max(0, initEnd),
      idx: (sidxStart >= 0 ? sidxStart : 0) + '-' + Math.max(0, sidxEnd),
      absUrl: location.origin + url,
      codec: await codecFromInit(buf.slice(0, Math.max(1, initEnd + 1))),
    };
  }
  function codecFromInit(initBuf) {
    return new Promise(function (resolve) {
      try {
        if (typeof MP4Box === 'undefined') return resolve('');
        initBuf.fileStart = 0; // mp4box checkBuffer 必需
        var f = MP4Box.createFile();
        f.onReady = function (info) {
          try { resolve(info.tracks && info.tracks[0] ? info.tracks[0].codec : ''); }
          catch (e) { resolve(''); }
        };
        f.onError = function () { resolve(''); };
        f.appendBuffer(initBuf);
        f.flush();
      } catch (e) { resolve(''); }
    });
  }
  async function computePlayInfo(duration, videoName, audioName) {
    var v = await scan(BASE + (videoName || 'video.m4s'));
    var pi = {
      type: 'dash', duration: duration || 6, cid: 1001,
      dash: {
        video: { id: 64, codecs: v.codec, width: 640, height: 360, bandwidth: 900000, url: v.absUrl, segmentBase: { Initialization: v.init, indexRange: v.idx } },
      },
    };
    if (audioName) {
      var a = await scan(BASE + audioName);
      pi.dash.audio = { id: 64, codecs: a.codec, bandwidth: 128000, url: a.absUrl, segmentBase: { Initialization: a.init, indexRange: a.idx } };
    }
    return pi;
  }
})();
