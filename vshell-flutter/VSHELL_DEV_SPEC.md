# VShell 项目交接规范与开发提示词

> 本文档供**另一个 AI 或开发者**接手 vshell 项目使用：完整描述架构、设计规范、开发流程、验证方法、已知坑与遗留任务。阅读本文档 + 代码即可独立继续开发，无需原会话上下文。

---

## 0. 一句话项目定义

VShell 是一个**桌面视频应用**：前端 = Web 版 UI（userscript 架构，仿 VS Code Modern UI 深色主题），后端 = Flutter（WebView2 壳 + 数据桥 + 性能敏感路径原生实现）。当前目标站点 AcFun（默认）与 Bilibili（内置适配器），支持**插件式数据源**（用户添加本地 .js 适配器文件）。

**用户核心需求**（近期原话）："整体换成 web 版前端，但是性能敏感处的后端用 flutter 实现"；"flutter 添加数据源时，只记住文件的本地地址，然后切换到这个数据源才允许对应的 js 代码"；"原脚本的搜索框有着复杂的逻辑，你需要全部 copy 过来，实现全部特性，以及复刻所有的样式"。

**架构冻结决定**：原生 Flutter UI（lib/ui/ 下）已**冻结**（FROZEN，dead code 不运行）——所有 UI 改动一律改 web 源码；性能敏感项（下载/持久化/网络代理）下沉 Flutter 桥。

---

## 1. 仓库结构（工作区 D:\Project\Ongoing\vsc-ui）

| 路径 | 内容 | 备注 |
|---|---|---|
| `vshell/` | **web 前端源码**（开发主战场） | `src/` 模块 + `build.py` 打包 |
| `vshell/src/` | 模块源码（见 §2 依赖序） | 改 UI 的地方 |
| `vshell/build.py` | 打包脚本：JS_FILES 拼接 + CSS 注入 → `../output/vshell.user.js` | 产物路径是相对 vshell/ 的上级 |
| `output/` | 打包产物：`vshell.user.js`（~2.1MB）、`app.html`（正式入口）、`flutter-adapter.js`（**源文件在此，非 build.py 产物，改动需手动同步**）、`_vs-fixtures/hls.min.js`、`harness.html`（测试页） | |
| `vshell-flutter/` | **Flutter 壳**（webview_windows 0.4.0） | `lib/main.dart`（壳+探针）、`lib/services/web_bridge.dart`（桥）、`lib/services/vs_store.dart`（持久化）、`lib/data/acfun_source.dart`（AcFun API） |
| `vshell-flutter/lib/ui/` | **FROZEN** 原生 UI（不运行，勿改勿删） | `README.md` 有 FROZEN 标注 |
| `vshell-flutter/build/windows/x64/install/` | **部署目录**：`vshell.exe` + `data/flutter_assets/kernel_blob.bin` + `web/`（app.html + vshell.user.js + flutter-adapter.js + _vs-fixtures/hls.min.js）+ `vshell_error.log` | 自包含可分发 |
| `vshell-flutter/_audit_gap_list.md` | 全部轮次改动记录（重要历史） | 新改动必须在此追加状态节 |
| `vshell-flutter/_shot_pw.ps1` | 截图脚本（PrintWindow） | 见 §6 |

---

## 2. web 源码模块与依赖序（vshell/build.py JS_FILES 顺序即加载序）

```
meta → core/utils, md5, store, saved, watched, characters, char-banners,
searchcache, searchtags, blacklist, viewmode, cardgap, scrollbridge, theme,
localvideos, router → adapters/site-adapter → core/net, data-source →
components/toast, navbar, settings-panel, char-panel, char-picker, video-card,
wall, player, preview, feed → services/fswriter, merger, downloader, shots,
sniffer, medl → components/download-fab, local-panel, sniffer-panel →
pages/home, category, detail, watchlist, blacklist, downloads, search,
searchtags, role → app.js（启动器，最后）
CSS_FILES: base, components, pages, animations, responsive
```

**关键模块职责**：
- `core/store.js`：持久化（**分键存储**，每 `vshell.<key>` 独立 localStorage；`set/del` 单键写 + `__VS_STORE_BRIDGE__.push` 推 Flutter；`normalize()` 防稀疏数组 stringify 卡死——见 §7 坑）
- `core/data-source.js`：数据源决策（'acfun' 默认/'bilibili'/插件 id）；`ensureLoaded()` 幂等注入插件
- `adapters/site-adapter.js`：适配器注册表 + `current()` 三分支
- `core/scrollbridge.js`：`window.__VS_SCROLL__` 命令式滚动（WebView2 原生滚轮失效的替代）
- `components/navbar.js`：导航栏（含**搜索框胶囊编辑器**，全站最复杂组件，§4.3）
- `components/settings-panel.js`：设置面板（主题/默认视图/卡片布局/卡片间距 slider/数据源/数据/关于）
- `pages/searchtags.js`：聚合搜索页（多标签随机混流）
- `app.js`：启动器（`start()` 对插件源先 ensureLoaded 再 boot；boot 接管 body → .vshell-app > navbar-host + outlet）

---

## 3. 视觉设计规范（仿 VS Code Modern UI 深色主题）

### 3.1 颜色 token（CSS 变量，dark 为主；light 见 colors.css）

| token | dark 值 | 用途 |
|---|---|---|
| editor-background | `#1F1F1F` | 媒体区底/编辑器底 |
| sideBar-background | `#181818` | 页面底/卡片底 |
| foreground | `#CCCCCC` | 主文字 |
| descriptionForeground | `#9D9D9D` | 次要文字 |
| focusBorder / progressBar | `#0078D4` | 主色 accent（hover `#026EC1`） |
| button-hoverBackground | `#026EC1` | 主按钮 hover |
| toolbar-hoverBackground | `rgba(90,93,94,0.3137)` | 通用 hover 底 |
| toolbar-activeBackground | `rgba(106,109,110,0.3137)` | 按钮激活底 |
| panel-border / sideBar-border | `#2B2B2B` | 边框 |
| widget-border | `#313131` | 控件边框 |
| input-background / input-border | `#313131` / `#3C3C3C` | 输入框 |
| input-placeholderForeground | `#989898` | 占位符 |
| errorForeground | `#F85149` | 错误/收藏 |
| terminal-ansiGreen | `#0DBC79` | 本地视频圆点 |
| charts-blue | `#59A4F9` | 待看圆点/链接 |
| charts-orange | `#EA5C0055`（8 位带 33% alpha） | 黑名单激活 |
| editorLightBulb（fallback #ffcc00） | `#FFCC00` | 代表作金 |
| badge-background / badge-foreground | `#616161` / `#F8F8F8` | 徽章 |
| editorWidget-background | `#202020` | 浮层/面板底 |
| list-hoverBackground | `#2A2D2E` | 列表 hover |
| list-activeSelectionBackground | `#04395E` | 列表选中（白字） |
| scrollbarSlider-background | `rgba(121,121,121,0.4)` | 滚动条 |

### 3.2 字号 / 间距 / 圆角 / 阴影 / 动画

- 全局字体 `13px Segoe UI`；行高 1.5；卡片标题 13px/600 lh1.8（cover 浮层 13px/600 lh1.35）；meta 11px descriptionForeground；页头 18px/600；详情页标题 19px/600
- 圆角：4（小按钮）/ 6（控件/胶囊）/ 8（卡片/面板/输入框）/ 10（播放器）/ 22（FAB 胶囊）；卡片 radius 8、内容裁剪 1px 内缩
- 卡片阴影 `0 0 12px rgba(0,0,0,0.14)`；hover 操作层 shadow-lg；面板 `0 16px 50px rgba(0,0,0,0.5)`
- 过渡：通用 120ms ease；卡片入场 `vshell-rise` 0.32s cubic-bezier(0.2,0.8,0.3,1) delay i*22ms；弹层 pop-in 140ms 淡入、pop-out 140ms 淡出上移 4px
- **图标一律 codicon**（禁止 emoji）；卡片播放/弹幕/时长用 codicon 小图标
- 导航栏：高 56px、毛玻璃 `rgba(24,24,24,0.85)+blur(10px)`、position:fixed 悬浮、滚动后 `box-shadow 0 2px 10px rgba(0,0,0,0.45)` 150ms；内容区顶部让位 56px
- 视频墙：`grid auto-fill minmax(400px,1fr) gap 6`；卡片标准布局 = 媒体区 16:9 + 文字区（padding 6px 8px 8px，标题 flex:1 两行、meta 贴底 11px：角色+日期）；cover 布局 = 纯媒体区（body display:none，卡片高度=封面高度），标题浮层渐变 `rgba(0,0,0,0.8)→0.4→transparent` + 底部 44px 渐变条 `0.55黑→transparent` + shade `transparent 55%→editorBg`

### 3.3 搜索框（导航栏核心组件，逻辑全复刻）

- 容器：`width:min(520px,44vw)`、高 30、r8、input-background 底、1px input-border；hover/有胶囊未聚焦 → `#181818`；transition width 160ms
- **胶囊编辑器**：多输入框与胶囊交替（框0 胶囊0 框1 胶囊1…末尾 is-last 框 flex:1 min-w 60）；input 22 高 12px 无边框透明；中间框宽 `max(8,ceil(textW)+2)`；box padding 首 0/hover 3、其余 2/hover 4、120ms
- 胶囊 chip：22 高 r6 toolbar-hover 12px；右上删除钮 12×12 圆骑跨（-4px、input-bg 底+sideBar-border、icon 8px、hover 红）
- 键盘：Enter=全量封装+toast+跳聚合页（Ctrl+Enter 只封装当前框）；Backspace/Delete=删胶囊合并前后框内容（空格连接）；←/→ 跨框
- **聚焦浮层**（覆盖式 .vshell-nav-popover）：head=编辑器+clear 14×14+divider 1×16+searchBtn 20×20 r5；body=角色快捷 chips（26 高 r6、hover list-hover+focusBorder、addicon charts-blue）；无角色空态文案
- 删除胶囊合并逻辑（用户 2026-08 追加）：**所有删除路径**（× 按钮/Backspace/Delete）必须合并前后框文本

### 3.4 其余组件要点

- **播放器**：16:9、radius 10；控制条透明→rgba(0,0,0,0.72) 渐变 200ms 滑入；按钮 30×30 r6 hover rgba(255,255,255,0.18)+scale(1.08)；进度条命中 19px、轨道 4px（hover 8）rgba(255,255,255,0.38)、fill kk 色 `#0078D4`+glow、缓冲 0.35；seek 预览 160 宽 152×86 帧 + 时间 11px tabular；**peek 模式**：控制条隐藏时容器透明但各控件 opacity:0（.is-peeked 单显）
- **角色面板**（char-panel）：640 宽两栏 modal（左 220 列表 + 右详情）、r12 widgetBg、行 44 高 r4、kwchip 24 高 r8
- **角色选择弹窗**：两列长条 56 高 r8、背板 blur3+rgba(0,0,0,0.5)
- **FAB**（下载页）：右下 20、胶囊 44 高 r22 + drawer 320 宽
- **卡片角标/圆点**：左上 40×40 tag（冲突红/普通黑 0.45）+ 右上 3×3 圆点（6px，localGreen/favRed/featGold/watchBlue）；hover 全隐藏
- **悬停操作层**：inset 0 淡入+上移 4px 120ms；按钮 28×28 r4 toolbar-hover 底；watch 右上（✓/＋）、star 左上（实心/空心心）、feature left 40（★/☆）；激活色 watch/feature=#0078D4、star=#F85149

---

## 4. Flutter 壳与桥

### 4.1 壳（lib/main.dart）

- 默认 `if (true)` 恒走 `WebviewShell`：URL `https://app.local/app.html?v=N`（N 每次 web bundle 更新+1 防缓存）；`addVirtualHostNameMapping('app.local', <exe目录>/web, allow)` 须在 loadUrl 前；**setBackgroundColor 必须 Colors.transparent**（不透明会导致纹理黑屏）；`Webview(_controller)` 位置参数；`executeScript(String)` 同步返回 JSON（**不等待 Promise**——异步探针要两段式：先注入 window 槽位再轮询读）
- 全局 JS 错误捕获注入（addScriptToExecuteOnDocumentCreated：window error/unhandledrejection → `window.__VS_ERR__`）
- 探针参数（测试用，无害保留）：`--open-settings`（打开设置面板写 settings.log）/`--click-char`/`--oom-probe`/`--probe-dl`/`--probe-abr`/`--scroll-stress`/`--store-probe`；日志写**工作目录**（Start-Process -WorkingDirectory 'D:\Project\Ongoing\vsc-ui'）
- 滚动桥：build 外层 Listener onPointerSignal → `dy = scrollDelta.dy * 1.5` → postWebMessage({t:'scroll',dy,x,y})（**方向：向下滚→scrollDelta.dy 正→scrollTop+=dy 向下，取反是错的**）

### 4.2 桥（lib/services/web_bridge.dart + output/flutter-adapter.js）

- flutter-adapter.js 定义 `window.__VSHELL_ADAPTER__`（9 方法全 Promise）+ `__VS_STORE_BRIDGE__`（push/del）+ `__VS_PLATFORM__`（netFetch/sourceAdd/sourceList/sourceRemove/sourceLoad）+ `__VS_DL__` 事件分发 + `__VS_FLUTTER_RESOLVE__` 响应入口；postMessage({id,method,args})
- web_bridge.dart handle 方法列表：getHomeSections/getCategoryVideos/getHomeFeed/getVideoDetail/getPlayInfo（**返回 {type:'hls', url, duration, cid, master}**——AcFun 是 m3u8 非 DASH，master=合成 ABR playlist）/getRelated/search/parseVideoId/storeSet/storeDel/downloadStart/downloadCancel/sourceAdd/sourceList/sourceRemove/sourceLoad/netFetch
- 持久化双向：web V.store.set/del → 桥 storeSet/storeDel → VsStore（键 'vshell.' 前缀一致）；启动 exportAll → `window.__VS_SYNC__` 注入 → store 初始化后 merge

### 4.3 数据层

- `lib/data/acfun_source.dart`：AcFun API（rank 首页/分类/搜索/详情/ksPlayJson 播放）
- `lib/services/vs_store.dart`：SharedPreferences 封装（`get<T>` jsonDecode；值 JSON 编码字符串；bool 存 '"true"'）
- `lib/services/hls_downloader.dart` + `DownloadManager`：下载桥（medl → downloadStart 委托 Flutter 引擎）

---

## 5. 构建与部署链（必读）

```powershell
# ① web 源码 → 产物
cd D:\Project\Ongoing\vsc-ui\vshell
python build.py                      # 产物 ../output/vshell.user.js
node --check ..\output\vshell.user.js
Copy-Item ..\output\vshell.user.js ..\vshell-flutter\build\windows\x64\install\web\vshell.user.js -Force
# flutter-adapter.js 源在 output\，改后必须手动 copy 到 install\web\

# ② Flutter 壳（web_bridge/main.dart 改动时才需要）
cd D:\Project\Ongoing\vsc-ui\vshell-flutter
Get-Process vshell | Stop-Process -Force
Remove-Item 'D:\Program\flutter\bin\cache\flutter.bat.lock'   # 残留锁会挂死构建
flutter build windows --debug        # 自带 install 步骤（kernel_blob 自动更新）
Copy-Item build\windows\x64\runner\Debug\vshell.exe build\windows\x64\install\vshell.exe -Force

# ③ 启动
Start-Process build\windows\x64\install\vshell.exe -WorkingDirectory 'D:\Project\Ongoing\vsc-ui'
```

- **web bundle 更新后必须升 URL 版本**（main.dart `?v=N`，N+1），否则 WebView2 缓存旧页面
- 只改 web 源码时**不需要**重建 Flutter（exe 是 C++ 壳不重链，kernel_blob 只在 Dart 改动时更新）

---

## 6. 验证方法

- **截图**：`vshell-flutter\_shot_pw.ps1 -Out <path> -ProcId <vshell pid>`（PrintWindow）；**截图前把鼠标移到窗口外**（SetCursorPos 5,5）避免 hover 中间帧
- **坐标系**：Flutter 内部 devicePixelRatio=1.5；位图 = 客户区逻辑 ×1.5 + 标题栏偏移 48/49；窗口 SetWindowPos(150,50,2160,1350) 物理（会被屏幕 1920×1080 压缩）
- **像素分析**：python PIL 直方图/背景列检测（页面背景 #181818=24；纯黑窗口=12；卡片内容按行分段）
- **DOM 探针**：main.dart executeScript 两段式（注入 `window.__SL=...` 槽 → 延迟读）；页面加载状态看 `window.__VS_ERR__`、`__BOOT__`、`.vshell-app`/`.vshell-navbar` 存在性
- **web 单测**：`python -m http.server 8933 --directory <install/web>` + Edge headless --screenshot（沙箱内 stdout 管道被禁，用 --screenshot 文件输出）

---

## 7. 已知坑（务必阅读，防复发）

1. **插件数据源启动竞态**（已修）：boot 前必须等 ensureLoaded——app.js `start()` 模式；新增插件相关启动逻辑不得同步依赖异步注入
2. **store 稀疏数组卡死**：`removedIds[ac号]=true` 数字索引 → length 48800004 → stringify 1.9s（OOM/卡顿根因）；一律对象 + 值标记 false；`normalize()` 用 Object.keys 重建
3. **localStorage 全量重写 OOM**（已修）：store.js 必须分键存储（单键写入），禁止 setItem 整个 mem
4. **双层 JSON 转义**：手工注入 shared_preferences.json 时 Windows 路径需四重反斜杠（`D:\\\\Project...`）；值必须是 JSON 编码字符串（`"flutter.vshell.x":"\"value\""`）
5. **web 侧数据权威在 localStorage**（vshell.<key>），shared_preferences 是 Flutter 侧镜像；改设置用 `V.dataSource.set()` 等 API 而非直接改文件
6. **setBackgroundColor 不透明 → 窗口全黑**：保持 Colors.transparent
7. **executeScript 不等待 Promise**：异步探针两段式；postWebMessage 无返回值（滚动桥用它防 executeScript 泄漏）
8. **Dart 字符串插值 `${` 内以 `{` 开头的表达式报解析错**：先算变量再拼接
9. **build.py 产物路径是 `..\output\`**（相对 vshell/）；node --check 也要用 `..\output\vshell.user.js`
10. **MSVC 注释禁中文**（C4819 代码页 936）——webview_windows 的 C++ 侧；Dart/JS 注释中文无碍
11. **WebView2 缓存**：页面/bundle 更新必须 URL 升版本
12. **盒注释不能嵌套**：JS 文档注释里出现 `/* ... */` 占位会提前结束外层注释（node --check 语法错）
13. **用户数据**：shared_preferences.json 在 `C:\Users\Mxster\AppData\Roaming\com.vshell\vshell\`；localStorage 在 WebView2 用户数据目录（%LOCALAPPDATA%）
14. **flutter build 挂死**：删 `D:\Program\flutter\bin\cache\flutter.bat.lock`；flutter --version 本身也会挂（网络检查），勿用
15. **MSB8066 flutter_assemble 失败** = 看构建日志里的 Dart error（常见：括号闭合/缺 import）

---

## 8. 当前状态与遗留任务

### 已完成（近期）
- 插件式数据源全链路（注册表/文件对话框/切换注入/启动恢复/netFetch 代理）
- 黑屏 bug 根治（插件源启动竞态）
- OOM/卡顿根治（分键存储 + 稀疏数组修复；resolveConflict 1886ms→17.6ms）
- 搜索框全特性复刻（胶囊编辑器/键盘导航/聚合搜索页/浮层/删除合并）
- 卡片 meta 显示角色（v0.5.4 语义：account 图标+角色名，点击进角色主页，冲突红字）
- 悬浮导航栏、分类卡随页滚动、卡片间距 slider、导航 6 钮+设置钮
- 下载桥（medl → Flutter HlsDownloader）、多清晰度 ABR（master playlist）
- 滚动桥（JS 命令式，真实滚轮方向）

### 遗留 / 待办（按优先级）
1. **验证插件数据源完整用户流**：设置面板 → 添加数据源（文件对话框）→ 切换 → 页面用插件数据（自动化已验证，真实文件对话框流程需人工确认）
2. **测试插件留档**：`D:\Project\Ongoing\vsc-ui\vshell-test-source.js`（meta.id='testplug'，IIFE + V.siteAdapters.register 格式示范）
3. `main.dart` 探针参数与 `--open-settings` 探针代码（settings.log 采样）可保留作调试，正式发布前可裁剪
4. `_audit_gap_list.md` 记录轮次历史——**新改动必须追加状态节**
5. 历史 P2 未做项：F14 黑名单页已做（web 版）；搜索浮层 web 覆盖式 head 已复刻；原生 UI 冻结不再维护

### 环境事实
- Flutter 3.38.7（Dart 3.10.7），webview_windows 0.4.0，pub 走 TUNA 镜像
- 沙箱网络：外网下载用 Python requests（schannel 废）
- 应用运行目录 = install\（工作目录由 Start-Process -WorkingDirectory 决定，探针日志落那里）

---

## 9. 给接手 AI 的工作纪律

1. **UI 改动只改 web 源码**（vshell/src/），不动 lib/ui/（FROZEN）
2. 每个视觉值**必须来自 CSS 变量/原脚本**（mimic 纪律：逐条标注来源，数值不得凭空捏造）
3. 图标用 codicon（vs_icons 语义），**禁止 emoji**
4. 改完必须：web build + node --check + 同步 install/web + 升 URL 版本 + 截图/探针验证
5. 复杂交互优先看原脚本实现（output/vshell.user.js 是权威，含历史注释）
6. 修改记录追加到 `_audit_gap_list.md` 顶部
7. 有多个方案时先问用户拍板；有副作用操作（删/改数据、发布）先确认
