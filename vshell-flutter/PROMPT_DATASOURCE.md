# 提示词：为 VShell 编写数据源插件文件

你要为「VShell」桌面视频应用编写一个**数据源插件**（单个 .js 文件）。

VShell 是一个 WebView2 壳 + Web 前端架构的视频应用，数据源以适配器插件接入：用户会在应用「设置 → 数据源 → 添加数据源」里选择你的 .js 文件，之后应用的所有页面（首页 / 分类 / 详情 / 播放 / 搜索 / 聚合搜索）都会通过你的插件获取数据。

请**基于你已有/熟悉的那个项目的真实接口**来写，把它现有的数据能力封装成下面的契约。不要虚构接口。

---

## 交付物

单个文件 `datasource.js`（文件名即数据源 id，请用英文小写），内容是一个 IIFE，末尾调用 `V.siteAdapters.register({...})` 注册适配器。骨架：

```js
(function () {
  'use strict';
  var V = window.VShell;
  V.siteAdapters.register({
    meta: { id: 'xxx', name: 'XXX' },   // id 唯一即可（建议与文件名一致）
    getHomeSections: function () { ... },
    getCategoryVideos: function (key, page) { ... },
    getHomeFeed: function (page) { ... },
    getVideoDetail: function (id) { ... },
    getPlayInfo: function (id) { ... },
    getRelated: function (id) { ... },
    search: function (q, page) { ... },
    parseVideoId: function (s) { ... },
  });
})();
```

## 方法契约（全部返回 Promise，严格按此签名）

| 方法 | 入参 | 返回值 |
|---|---|---|
| `getHomeSections()` | 无 | `[{key, title, subs?:[{key,title}]}]`（key 传给 getCategoryVideos） |
| `getCategoryVideos(key, page)` | 分类 key、页码 | `{items:[VideoItem], hasMore:bool}` |
| `getHomeFeed(page)` | 页码 | `{items, hasMore}` |
| `getVideoDetail(id)` | 视频 id | `VideoDetail` |
| `getPlayInfo(id)` | 视频 id | `{type, url, duration, cid?}`，见下 |
| `getRelated(id)` | 视频 id | `VideoItem[]` |
| `search(q, page)` | 关键词、页码 | `{items, hasMore}` |
| `parseVideoId(input)` | 任意文本 | `id 字符串 或 null` |

### 数据结构

```js
VideoItem = {
  id: '唯一稳定字符串',      // 收藏/待看/去重都靠它，必须稳定；数字 id 转字符串
  title: '标题',
  pic: '封面图 https 直链',  // 必须可跨域加载
  duration: 秒数,
  pubdate?: 秒级时间戳,      // 可省略
  owner: { name: '作者名', face?: '头像 https 直链' },
  stat: { view: 播放数, like?: 点赞数, danmaku?: 弹幕数 }
}
VideoDetail = VideoItem 字段全部保留 + {
  desc: '简介文本',
  cid: '播放用 id（可等于 id）',
  pages?: [{ cid, page, part, duration }]   // 分 P 视频；没有则省略
}
```

### getPlayInfo 返回（按优先级）

1. **首选 `{type:'hls', url:'m3u8 直链', duration, cid}`**——应用用 hls.js 播放
2. 没有 HLS 就 `{type:'dash', duration, dash:{video:{id?,url}, audio?:{url}}}`（DASH 分轨）
3. 再不行 `{type:'durl', duration, durl:[{url}]}`（mp4 直链）

url 必须是 https 绝对直链（不经过网页跳转/防盗链校验的裸地址；若有签名参数照抄即可）。

## 网络请求（重要）

页面运行在 `https://app.local` 壳里，**原生 fetch 会被 CORS 拦截**。统一用 `V.net.fetch(url, opts)` 发请求——内部先试原生 fetch，失败自动降级到应用后端代理（无 CORS 限制）：

```js
V.net.fetch('https://api.yoursite.com/video/list?p=' + page)
  .then(function (r) {
    // r = { ok: bool, status: number, text: string }  —— text 是响应体字符串，不是 Response 对象
    var j = JSON.parse(r.text);
    return {
      items: j.list.map(function (v) {
        return {
          id: String(v.vid),
          title: v.title,
          pic: v.cover,
          duration: v.duration,
          owner: { name: v.author },
          stat: { view: v.views },
        };
      }),
      hasMore: j.has_more,
    };
  })
  .catch(function () { return { items: [], hasMore: false }; });  // 失败返回空，勿 reject
```

- GET 直接拼 query；POST/带 header：`V.net.fetch(url, {method:'POST', headers:{...}, body:'...'})`
- **HTTP 4xx/5xx 也返回 ok:true**（请求到达了服务器），按 status 自行处理；只有网络层失败（断网/无代理）才 ok:false
- **任何方法失败都 resolve 空结果**（`{items:[],hasMore:false}` / `[]`），绝不让 Promise reject 导致页面崩溃

## 硬性要求

1. 除了 `V.siteAdapters.register`，**不得操作 DOM、不得读写 window 全局状态**（纯函数式适配器）
2. 所有方法必须返回 Promise；内部不许同步抛错
3. 封面图/头像/播放地址必须是 https 绝对地址
4. `id` 用你项目里的真实唯一标识，**不要**用 URL、标题当 id
5. **ES5 风格**：只用 `var`/`function`，不要箭头函数、模板字符串、async/await、解构、`let/const`——应用不经过转译，现代语法直接挂
6. 文件顶部写注释块：数据源名称、你的项目名、接口根地址、一句话维护说明
7. 若你的接口需要登录/Header 才能访问，在注释里写清楚怎么获取（应用侧后续可加固定 header）
8. 完成后自查：语法用 `node --check 文件.js`（注意这只能验现代语法——你的文件必须只用 ES5）；逻辑上自查每个方法都有返回值路径

## 完整参考示例（模仿此结构，把 mystation 换成你的项目）

```js
/* ============================================================
 * MyStation 数据源（为 VShell 编写）
 * 项目：MyStation 视频站 API（https://api.mystation.tv）
 * 接口：/api/sections、/api/videos?cat=&p=、/api/detail?id=、
 *       /api/play?id=、/api/search?q=&p=
 * ============================================================ */
(function () {
  'use strict';
  var V = window.VShell;
  var BASE = 'https://api.mystation.tv';

  function toItem(v) {
    return {
      id: String(v.id),
      title: v.title,
      pic: v.cover,
      duration: v.duration,
      pubdate: v.pubdate,
      owner: { name: v.author, face: v.author_face },
      stat: { view: v.views, like: v.likes, danmaku: v.danmaku },
    };
  }

  function pageResult(j) {
    return {
      items: (j.list || []).map(toItem),
      hasMore: !!j.has_more,
    };
  }

  V.siteAdapters.register({
    meta: { id: 'mystation', name: 'MyStation' },

    getHomeSections: function () {
      return V.net.fetch(BASE + '/api/sections').then(function (r) {
        return (JSON.parse(r.text).sections || []).map(function (s) {
          return { key: s.key, title: s.title };
        });
      }).catch(function () { return []; });
    },

    getCategoryVideos: function (key, page) {
      return V.net.fetch(BASE + '/api/videos?cat=' + encodeURIComponent(key) + '&p=' + page)
        .then(function (r) { return pageResult(JSON.parse(r.text)); })
        .catch(function () { return { items: [], hasMore: false }; });
    },

    getHomeFeed: function (page) {
      return V.net.fetch(BASE + '/api/feed?p=' + page)
        .then(function (r) { return pageResult(JSON.parse(r.text)); })
        .catch(function () { return { items: [], hasMore: false }; });
    },

    getVideoDetail: function (id) {
      return V.net.fetch(BASE + '/api/detail?id=' + id).then(function (r) {
        var d = JSON.parse(r.text);
        var item = toItem(d);
        item.desc = d.desc || '';
        item.cid = String(d.cid || d.id);
        if (d.pages && d.pages.length) {
          item.pages = d.pages.map(function (p) {
            return { cid: String(p.cid), page: p.page, part: p.part, duration: p.duration };
          });
        }
        return item;
      }).catch(function () { return null; });
    },

    getPlayInfo: function (id) {
      return V.net.fetch(BASE + '/api/play?id=' + id).then(function (r) {
        var p = JSON.parse(r.text);
        if (p.m3u8) {
          return { type: 'hls', url: p.m3u8, duration: p.duration, cid: String(id) };
        }
        return { type: 'durl', duration: p.duration, durl: [{ url: p.mp4 }] };
      }).catch(function () { return null; });
    },

    getRelated: function (id) {
      return V.net.fetch(BASE + '/api/related?id=' + id)
        .then(function (r) { return (JSON.parse(r.text).list || []).map(toItem); })
        .catch(function () { return []; });
    },

    search: function (q, page) {
      return V.net.fetch(BASE + '/api/search?q=' + encodeURIComponent(q) + '&p=' + page)
        .then(function (r) { return pageResult(JSON.parse(r.text)); })
        .catch(function () { return { items: [], hasMore: false }; });
    },

    parseVideoId: function (s) {
      var m = String(s).match(/(?:video\/|vid=)(\d+)/);
      return m ? m[1] : null;
    },
  });
})();
```

## 验收清单（交付前逐条自检）

- [ ] 单文件 IIFE，仅 ES5 语法，node --check 通过
- [ ] 9 项（meta + 8 方法）齐全，全部返回 Promise
- [ ] 所有网络请求走 V.net.fetch，失败降级为空结果
- [ ] id 稳定唯一、封面/播放地址为 https 直链
- [ ] 无 DOM 操作、无全局变量泄漏（除了 register）
- [ ] 文件可直接被 VShell「设置 → 数据源 → 添加数据源」选择
