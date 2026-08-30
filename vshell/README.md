# vshell — 通用视频网站套壳 UI（油猴脚本）

单文件 Tampermonkey 用户脚本：把 bilibili 整页接管为一个自研的视频站套壳 UI——
视频墙主页 / 分类墙 / 详情页 / 待看收藏（抖音刷+墙双视图）/ 下载管理 / 搜索，
自研播放器（隐藏原生控件）、多线程下载引擎（FSA 真并发写盘 + mp4box 无损合并 mp4）、
Dark/Light 双主题（vscode-modern-ui token + codicon）、微交互动画、移动端适配。

## 交付物

| 路径 | 说明 |
|---|---|
| `output/vshell.user.js` | ★ 安装即用的单文件油猴脚本（内联 dash.js + mp4box.js + codicon base64，断网可用） |
| `src/` | 源码（模块化 IIFE，命名空间 `window.VShell`） |
| `build.py` | 构建脚本：src + vendor + 主题 CSS → 单文件 user.js |
| `dev/` | 开发验证套件：mock 适配器 + harness + 合并管线测试（Node 可跑） |
| `vendor/` | dash.all.min.js（dashjs）、mp4box.all.min.js |

## 安装

1. 安装 Tampermonkey 浏览器扩展
2. 打开 `output/vshell.user.js`（或把文件拖进 Tampermonkey 管理面板）→ 安装
3. 访问 `https://www.bilibili.com` → 页面被整页接管

> 说明：未登录 bilibili 时高清播放/下载受限（480P），本脚本是纯整页接管，
> 不提供原站登录入口；登录态（cookie）会自动带上。

## 页面体系

- `#/` 主页：大分类 → 小分类联动导航 + 全站热门视频墙（无限滚动）
- `#/category/:tid` 分类视频墙（tid=0 全站热门；主分区榜单 / 子分区真实数据）
- `#/video/:bvid` 详情：自研播放器（隐藏原生 UI、手写进度条+时间占比、全屏按钮）、
  标题+复制按钮、待看/收藏/下载、简介折叠、相关推荐
- `#/watchlist` 待看/收藏：刷视图（滚动吸附、静音自动播放、无全屏按钮）/ 墙视图
- `#/downloads` 下载管理：任务列表、并发数 1/2/4/8、导入/导出记录、清空已完成
- `#/search?q=` 搜索结果墙
- 右下角悬浮胶囊：全局下载进度 + 可展开抽屉

## 下载引擎

- 传输：`GM_xmlhttpRequest`（绕 CORS + Referer），2MB 分块，每任务 N 线程并发
- 落盘：Chromium → File System Access API 按 offset 并发写盘；非 Chromium 降级 Blob
- 合并：mp4box.js 字节级 remux（重建 moov + moof/mdat 透传 + track_id patch），
  无损不转码 → 单个 mp4；总量 >1GB 或失败自动降级双文件（_video/_audio）
- 断点续传：分块 bitmap 持久化；页面重载后恢复任务需重新选择保存位置（FSA 手柄不跨页）
- 暂停/恢复/取消/失败自动重试（每块 3 次指数退避）/记录持久化 + 导入导出

## 站点适配器（通用性）

任何站点实现 `SiteAdapter` 契约即可接入（见 `src/adapters/site-adapter.js` 注释）：
`getHomeSections / getCategoryVideos / getHomeFeed / getVideoDetail / getPlayInfo /
getRelated / search / parseVideoId`。当前内置 bilibili 适配器（wbi 签名 + 官方 API +
硬编码分区表，探测验证过）。

## 构建

```powershell
python vshell\build.py   # → output/vshell.user.js
```

## 开发验证（dev/）

- `serve.py`：带 Range 支持的静态服务器（dash.js SegmentBase 必需）
- `mock-adapter.js` + `harness.html`：离线演示数据 + 诊断回传（`/__diag`），
  用 Edge headless 跑截图/断言
- `merge_node.js`：Node 里直接跑 merger.js 合并管线（fixture → ffprobe 验证）
- 验证结论：六页渲染零错误；dash.js 播放真实解码（videoWidth 640×360）；
  合并输出与源逐帧 CRC 一致、音画时间轴保真

## 已知边界

- 纯整页接管：无原站登录入口，未登录高清受限
- 浏览器无法真正转码：合并是 remux（无损），超大文件自动降级双文件
- 移动浏览器 FSA / dash.js 受限时走降级路径
- 真实站点安装验证需在浏览器 + Tampermonkey 中进行（见上「安装」）
