# vshell Flutter 版 UI 现状盘点（供差距审计）

> 审计时间：本会话。所有值精确到 px / 色值（0xAARRGGBB 或 rgba），标注 `源文件:行号`。
> 说明：任务清单给的行数偏小，实际行数见下表（读取于本会话，精确）。

| 文件 | 清单行数 | 实际行数 |
|---|---|---|
| lib/theme/vs_theme.dart | 232 | 232 |
| lib/theme/vs_tokens.dart | 392 | **587** |
| lib/ui/shell.dart | 449 | **480** |
| lib/ui/widgets/video_card.dart | 681 | **713** |
| lib/ui/widgets/feed_view.dart | 759 | **788** |
| lib/ui/widgets/player_view.dart | 860 | **908** |
| lib/ui/widgets/char_picker_dialog.dart | 386 | **410** |
| lib/ui/widgets/char_list_dialog.dart | 346 | **361** |
| lib/ui/pages/home_page.dart | 254 | **271** |
| lib/ui/pages/detail_page.dart | 835 | **863** |
| lib/ui/pages/search_page.dart | 172 | **183** |
| lib/ui/pages/watchlist_page.dart | 62 | **67** |
| lib/ui/pages/characters_page.dart | 567 | **590** |
| lib/ui/pages/role_page.dart | 375 | **394** |
| lib/ui/pages/downloads_page.dart | 234 | **249** |
| lib/ui/pages/local_page.dart | 137 | **147** |
| lib/ui/pages/settings_page.dart | 149 | **160** |
| lib/main.dart | — | 153 |
| lib/ui/widgets/thumb_host.dart | — | 181 |
| lib/state/app_state.dart | — | 183 |

---

## 1. 主题体系现状（lib/theme/vs_theme.dart，232 行）

### 1.1 VsTheme 颜色 getter 全表（dark / light）

| getter | dark 值 | light 值 | 行号 |
|---|---|---|---|
| `bg` | `#181818` | `#FFFFFF` | vs_theme.dart:17 |
| `surface` | `#1F1F1F` | `#F3F3F3` | vs_theme.dart:20 |
| `editorBg` | `#1F1F1F` | `#FFFFFF` | vs_theme.dart:22 |
| `border` | `#2B2B2B` | `#D4D4D4` | vs_theme.dart:25 |
| `accent`（const） | `#0078D4` | 同左 | vs_theme.dart:28 |
| `error` | `#F85149` | `#A1260D` | vs_theme.dart:31 |
| `fg` | `#CCCCCC` | `#333333` | vs_theme.dart:34 |
| `fgDim` | `#9D9D9D` | `#616161` | vs_theme.dart:37 |
| `link`（const） | `#4DAFAC` | 同左 | vs_theme.dart:39 |
| `linkBlue` | `#4daafc` | `#006AB1` | vs_theme.dart:40 |
| `dropdownBorder` | `#3C3C3C` | `rgba(0,0,0,0.35)`=`0x59000000` | vs_theme.dart:43-44 |
| `badgeBg`（const） | `#616161` | 同左 | vs_theme.dart:47 |
| `badgeFg`（const） | `#F8F8F8` | 同左 | vs_theme.dart:48 |
| `listActive` | `#04395E`（深蓝） | `#D6EBFF`（浅蓝） | vs_theme.dart:51 |
| `listHover` | `#2A2D2E` | `#E8E8E8` | vs_theme.dart:54 |
| `favRed`（const） | `#F14C4C` | 同左 | vs_theme.dart:57 |
| `watchBlue`（const） | `#4DAFEC` | 同左 | vs_theme.dart:60 |
| `localGreen`（const） | `#89D185` | 同左 | vs_theme.dart:63 |
| `featGold`（const） | `#FFCC00` | 同左 | vs_theme.dart:66 |
| `inputBg` | `#313131` | `#FFFFFF` | vs_theme.dart:69 |
| `inputBorder` | `#3C3C3C` | `#C6C6C6` | vs_theme.dart:72-73 |
| `overlayBg` | `#252526` | `#F3F3F3` | vs_theme.dart:76 |
| `maskBg` | `rgba(0,0,0,0.6)`=`0x99000000` | `rgba(255,255,255,0.8)`=`0xCCFFFFFF` | vs_theme.dart:79 |
| `btnSecondary` | `#3A3A3A` | `#E8E8E8` | vs_theme.dart:82-83 |
| `cardBg` | `#1F1F1F` | `#FAFAFA` | vs_theme.dart:86 |
| `toolbarHover` | `#5A5D5E` | `#F2F2F2` | vs_theme.dart:89-90 |
| `navBarBg` | `rgba(24,24,24,0.85)`=`0xD9181818` | `rgba(255,255,255,0.85)`=`0xD9FFFFFF` | vs_theme.dart:93-94 |
| `navScrollShadow`（const） | `rgba(0,0,0,0.45)`=`0x73000000` | 同左 | vs_theme.dart:97 |

- 模式开关：`VsTheme.light` 静态 bool（默认 false=深色），所有 color 为 getter 跟随（vs_theme.dart:12）；注释要求「切换后需重建 MaterialApp」（vs_theme.dart:12），实际由 main.dart 的 `Consumer<AppState>` 重建实现（main.dart:114-120）。
- **死 getter**（定义后无任何引用，grep 验证）：`maskBg`（vs_theme.dart:79）、`cardBg`（vs_theme.dart:86）、`link` 青色（vs_theme.dart:39）。`cardBg` 未用：卡片实际用 `VsTheme.bg`（video_card.dart:99）。

### 1.2 半径常量（固定，不随主题）

| 常量 | 值 | 行号 |
|---|---|---|
| `radiusSmall` | 4 | vs_theme.dart:101 |
| `radiusMedium` | 6 | vs_theme.dart:102 |
| `radiusLarge` | 8 | vs_theme.dart:103 |

### 1.3 ThemeData 各子主题（`VsTheme.dark()`，vs_theme.dart:105-231）

- 基座：`useMaterial3: false`，brightness 随 light，`scaffoldBackgroundColor=bg`，`canvasColor=bg`；ColorScheme：dark `surface #1F1F1F / error #F85149`，light `surface #F3F3F3 / error #A1260D`，primary/secondary 均 accent（vs_theme.dart:106-124）。
- **TextTheme**（vs_theme.dart:125-148）：全部 `Segoe UI`，bodyColor/displayColor=fg；
  - `bodySmall`：11px、fgDim
  - `bodyMedium`：13px、fg
  - `labelMedium`：12px、fg
  - 其余沿用 base（headline/title 等未定制，仍是 Material 默认值 22/20/16px 等）
- **iconTheme**：size 16、color fg（vs_theme.dart:149）
- **dividerColor**：border（vs_theme.dart:150）
- **scrollbarTheme**（vs_theme.dart:152-157）：thickness 10；thumb dark `#424242` / light `#C8C8C8`；radius 5（半圆 10/2）
- **tooltipTheme**（vs_theme.dart:159-167）：bg overlayBg、1px border 边框、radius 6、文字 12px fg、`waitDuration 400ms`
- **dialogTheme**（vs_theme.dart:169-179）：bg overlayBg、`surfaceTintColor transparent`、radius 8 + 1px border、标题 15px w600、内容 13px
- **inputDecorationTheme**（vs_theme.dart:181-199）：`filled:true` fill inputBg；hint 13px fgDim；`contentPadding h10/v6`；border/enabledBorder 均 inputBorder、radius 6；focusedBorder accent 1px；`isDense:true`
- **elevatedButtonTheme**（vs_theme.dart:201-213）：bg accent、fg white、13px；disabled bg dark `#3C3C3C`/light `#E0E0E0`、disabled fg dark `#6E6E6E`/light `#A0A0A0`；radius 6；padding h14/v7
- **textButtonTheme**（vs_theme.dart:214-220）：fg、13px、radius 6
- **snackBarTheme**（vs_theme.dart:221-229）：bg overlayBg、13px、`floating`、radius 6 + 1px border

### 1.5 VsToken（web skill 转译）vs VsTheme（Flutter 实装）关键重叠值对照

| web token（vs_tokens.dart） | 值 | Flutter 实装（vs_theme.dart） | 值 | 差异 |
|---|---|---|---|---|
| `activityBarBackground` | #181818 | `bg` | #181818 | = |
| `editorBackground` | #1F1F1F | `editorBg` | #1F1F1F | = |
| `sideBarBorder` | #2B2B2B | `border` | #2B2B2B | = |
| `focusBorder` | #0078D4 | `accent` | #0078D4 | = |
| `buttonBackground` | #0078D4 | `accent` | #0078D4 | = |
| `buttonHoverBackground` | #026EC1 | **无对应 getter** | — | 缺失；对话框反而硬编码 #0E639C |
| `badgeBackground` | #616161 | `badgeBg` | #616161 | = |
| `badgeForeground` | #F8F8F8 | `badgeFg` | #F8F8F8 | = |
| `foreground` | #CCCCCC | `fg` | #CCCCCC | = |
| `descriptionForeground` | #9D9D9D | `fgDim` | #9D9D9D | = |
| `inputBackground` | #313131 | `inputBg` | #313131 | = |
| `inputBorder` | #3C3C3C | `inputBorder` | #3C3C3C | = |
| `inputPlaceholderForeground` | #989898 | hint 用 `fgDim` | #9D9D9D | 微差 0x989898 vs 0x9D9D9D |
| `dropdownBorder` | #3C3C3C | `dropdownBorder` | #3C3C3C | = |
| `list-activeSelectionBackground` | #04395E（token 未列） | `listActive` | #04395E | = |
| `chartsBlue` | #59A4F9 | `VsToken.chartsBlue` 直用 | — | 播放器 spinner |
| `panelBorder` | #2B2B2B | `VsToken.panelBorder` 直用 | — | seek 预览框 |
| `toolbarHoverBackground` | #5A5D5E | `toolbarHover` | #5A5D5E | =，但导航按钮未使用 |
| `scrollbarSlider-background` | rgba(121,121,121,0.4) | scrollbar thumb | #424242 | 不相等（web 半透明灰 vs Flutter 实色） |
| `cornerRadius-large` | "8px" | `radiusLarge` | 8 | =（String→double） |
| `spacing-size160` | "16px" | — | — | 无 spacing 抽象，各处硬编码 |

### 1.4 vs_tokens.dart 定位（lib/theme/vs_tokens.dart，587 行）

- 性质：`// GENERATED by tool/gen_tokens.py from skill tokens.css — DO NOT EDIT BY HAND`（vs_tokens.dart:1），全部常量 `const`；String 常量值是带单位的字符串（如 `"13px"`、`"8px"`）或「默认值为 null（主题未定义…）」说明文字 → **纯文档性质**。
- **实际引用仅 2 处**（grep `VsToken.` 全 lib 命中 3 条，含自身类声明）：
  - `VsToken.chartsBlue`（`#59A4F9`）→ player_view.dart:291 buffering spinner 颜色
  - `VsToken.panelBorder`（`#2B2B2B`）→ player_view.dart:586 seek 预览框边框
- 其余 ~100 个常量（spacing-size* / cornerRadius-* / fontSize-* / 所有 Color）**零引用 → 死代码**。颜色值与 VsTheme 大量重复（如 `focusBorder`=accent、`dropdownBorder`=inputBorder）。
- 结论：Flutter 实际主题 token 全部走 VsTheme；vs_tokens.dart 是 web skill tokens.css 的转译存档，仅供对照，改动主题时应同步两侧。

---

## 2. 导航/壳（lib/ui/shell.dart，480 行）

### 2.1 结构

- `Scaffold(bg=VsTheme.bg)` + `Stack`（shell.dart:40-71）：① Column = 导航栏（`feedFullscreen` 时隐藏，shell.dart:47）+ Expanded 路由体；② 全局 `Positioned(left:0,top:0, child: ThumbHost())` 隐藏截帧宿主（shell.dart:64-68）。
- 路由：`switch (state.page)` 10 个 PageType → 对应页面（shell.dart:74-97）。

### 2.2 导航栏 `_NavBar`（shell.dart:103-321）—— web `.vshell-navbar` 复刻

- 容器：高 **56**；bg `VsTheme.navBarBg`（深 85% 黑）；`BackdropFilter` 高斯模糊 `sigma 10`（毛玻璃，shell.dart:127）；滚动阴影仅在 `pixels > 2` 时出现：`navScrollShadow 0 2px 10px`（blur 10 / offset(0,2)，shell.dart:50-52、115-123）。
- **左区**（`left:16`，shell.dart:131-169）：
  - `_Brand`：发光点 10×10、radius 3、accent 底 + `blur 8` 光晕；`VShell` 14px w600；版本 `v1.0.0` 11px fgDim（shell.dart:324-359）
  - 视图按钮组（间距 4）：主题切换（`_ThemeIcon` CustomPaint 自绘太阳/月亮 16px，太阳：圆 r3.4+8 射线 r5.6→7.6 线宽 1.6；月亮：圆 r5.6+缺口 r4.4 offset(2.2,-1.2)，shell.dart:438-479）；feed 模式切换（playCircle/array 16px，active=feedMode）；封面布局切换（layout 16px，feedMode 时隐藏，shell.dart:160-166）
- **中区**（绝对居中，shell.dart:170-187）：主页按钮 36×36 radius 8、home 图标 18px（shell.dart:362-384）+ 间距 8 + 搜索框。
- **搜索框**（shell.dart:388-421）：宽 **520** 高 **30**、radius 8、`inputBg` 底 + 1px `inputBorder` 边框；`prefixIcon` search 14px fgDim；hint「搜索视频…」13px fgDim；**聚焦边框不变**（三个 border 全 `InputBorder.none`，shell.dart:413-415）；contentPadding top 8。回车提交 → `state.go(search, keyword)`（shell.dart:179-183）。
- **右区**（`right:16`，shell.dart:189-207）：6 个按钮，统一 34×34、radius 8、图标 16px、间距靠 `left padding 4`：
  - 角色列表（account 图标 → `showCharListDialog`，shell.dart:196-199）
  - 待看/收藏/本地/下载/设置 → `state.go(PageType.*)`
  - active 态：bg `listActive` + 图标白色（shell.dart:263、266-267）；**无 hover 态**（web 有 toolbarHover 背景）
  - 特例 bug：角色按钮图标色在 `page==characters` 时变白但**无 active 底色**（shell.dart:235）
- **调试日志残留**：`_tapLog` 写 `D:/vshell_btn.log`（shell.dart:275-281）、`_layoutLog` 写 `D:/vshell_layout.log` 并打印每个按钮 GlobalKey 坐标（shell.dart:284-300）。

### 2.4 图标尺寸清单（shell 全部图标点位）

| 位置 | icon | size | 行号 |
|---|---|---|---|
| brand 发光点 | —（色块） | 10×10 | shell.dart:333 |
| 主题/模式/布局按钮 | 自绘/playCircle/array/layout | 16 | shell.dart:148,162,235,267 |
| 主页按钮 | home | 18 | shell.dart:379 |
| 搜索前缀 | search | 14 | shell.dart:410 |
| 右区 6 按钮 | account/bookmark/star/fileMedia/download/settingsGear | 16 | shell.dart:196-204 |

### 2.3 窗口管理（lib/main.dart:51-60）

| 项 | 值 | 行号 |
|---|---|---|
| 初始尺寸 | 1440×900 | main.dart:52,55 |
| 最小尺寸 | 960×600 | main.dart:53,56 |
| 定位 | center | main.dart:57 |
| 背景色 | `VsTheme.bg`（#181818） | main.dart:58 |
| 标题 | `vshell`（MaterialApp title） | main.dart:116 |
| **标题栏** | **未配置 `titleBarStyle`/`titleBarHeight`/`windowButtonVisibility`** → 原生系统标题栏 | main.dart:51-60 |

- 其它装配：`--video=<ac号>` / `--page=...` / `VSHELL_VIDEO` 直达（main.dart:41-49）；`--feed-fs-test` 自动全屏测试（main.dart:44）；错误写 `vshell_error.log`（main.dart:30-37）；`_PointerLog` 全屏 Listener 写 `D:/vshell_pt.log`（main.dart:127-153，残留调试）。
- 主题装配：`theme: VsTheme.dark()` 单一主题函数（main.dart:118），深/浅靠静态 `VsTheme.light` 分支；`Consumer<AppState>` 包裹保证 toggle 后重建。

---

## 3. 视频卡片（lib/ui/widgets/video_card.dart，713 行）

### 3.1 卡片容器（video_card.dart:98-106）

- bg `VsTheme.bg`（**非 cardBg**）、1px `border` 边框、radius 8、shadow `rgba(0,0,0,0.14)`=`0x24000000` blur 12、`clipBehavior: Clip.antiAlias`。
- 布局：Column = 16:9 媒体区 + 文字区（cover 布局时隐藏文字区）。

### 3.2 媒体区 16:9（video_card.dart:111-337）

- **shade 渐变**（standard/cover 通用）：`transparent(0.55) → editorBg`，LinearGradient top→bottom，stops [0.55,1]；`AnimatedOpacity 120ms`，**hover 时隐藏**（video_card.dart:118-134）。
- **cover 布局**：
  - 底部 44px 渐变条：`transparent → rgba(0,0,0,0.55)`=`0x8C000000`（video_card.dart:136-159）
  - 顶部标题浮层：渐变 `0xCC000000(0.8) → 0x66000000(0.4) → transparent`；padding left 54（有角标）/10（无）、right 10、top 10、bottom 20；标题白色 13px w600、lh 1.35、maxLines 2、双重阴影 `0xE6000000 blur3 offset(0,1)` + `0x73000000 blur10`（video_card.dart:181-230）
- **角色角标** `_CharBadge`（左上 8,8，40×40，video_card.dart:552-634）：radius 8；底 冲突 `rgba(248,81,73,0.45)`=`0x73F85149` / 普通 `rgba(0,0,0,0.45)`=`0x73000000`；边框 冲突 `rgba(248,81,73,0.35)`=`0x59F85149` / 普通 `rgba(255,255,255,0.25)`=`0x40FFFFFF`；阴影 `0x66000000 blur4 offset(0,1)` + `0x24000000 blur12`；内容：冲突=circleSlash 19px `#F85149`；有头像=36×36 radius 6 图片；无=`_letter` 白底黑字 15px w600。hover 时隐藏让位收藏按钮（video_card.dart:161）。
- **3×3 圆点** `_DotsGrid`（右上 8,8，24×24，video_card.dart:637-673）：圆点 6×6，9px 网格间距；顺序填充 1..9（映射表 5 2 1 / 6 4 3 / 9 8 7，video_card.dart:59-69）；颜色顺序：`localGreen → favRed → featGold → watchBlue`；阴影 `0x80000000 blur3 offset(0,1)` + `0x24000000 blur12`；hover 时淡出 120ms。
- **左下统计**（left 4 bottom 4，video_card.dart:232-256）：play 图标 12px 白 + 播放数 11px 白（`shadow black blur2`）；弹幕>0 时加 comment 图标 12px + 数字（≥10000 显示 `x.x万`）。
- **右下时长**（right 4 bottom 4，video_card.dart:258-296）：11px 白，纯文字无底色；cover 布局下为 `日期 6px 间隔 时长`；日期格式 `M-d`（当年）/ `yyyy-M-d`。
- **hover 操作层**（video_card.dart:298-334）：hover 时出现，**无滑入动画（直接 show）**；
  - 收藏星标（left 4 top 4）、代表作星标（left 40=4+28+8，仅 showFeatureBtn）、待看书签（right 4 top 4）
  - 按钮 28×28 radius 6；未激活底 `rgba(90,93,94,0.31)`=`0x4F5A5D5E`；激活实底 favRed/featGold/watchBlue；图标 16px 白
- **封面**（video_card.dart:441-478）：无封面/加载中/失败 → `#232323` 底 + fileMedia 图标 34px `rgba(157,157,157,0.55)`=`0x8C9D9D9D`；`data:` 封面走 `Image.memory`（本地截帧）；网络图 `BoxFit.cover`。

### 3.3 文字区（standard 布局，video_card.dart:339-404）

- padding `8,6,8,8`；标题 fg 13px w600、lh **1.8**、maxLines 2（≈固定 3.6em 占位）；`Spacer()` 撑开；meta 行 `margin-top 4`、`minHeight 16`：owner（account 图标 12px fgDim + 名字 12px fgDim，maxLines 1）左 / 日期 11px fgDim 右。

### 3.4 入场动画 `_Rise`（video_card.dart:499-547）

- 320ms、curve `Cubic(0.2,0.8,0.3,1)`、delay `index*22ms`（仅 index<=0 立即）；Fade + Scale 0.98→1.0。

### 3.6 文本样式清单（video_card 内全部 TextStyle）

| 元素 | fontSize | weight | color | 其它 | 行号 |
|---|---|---|---|---|---|
| cover 浮层标题 | 13 | w600 | 白 | lh1.35、2 阴影、maxLines2 | :211-226 |
| 左下播放数/弹幕 | 11 | — | 白 | shadow black blur2 | :480-485 |
| 右下时长/日期 | 11 | — | 白 | — | :272-294 |
| standard 标题 | 13 | w600 | fg | lh1.8、maxLines2 | :350-356 |
| owner 名 | 12 | — | fgDim | maxLines1 | :378-382 |
| 日期 | 11 | — | fgDim | — | :393-397 |
| 角标首字 | 15 | w600 | #181818 | 白底 | :625-630 |

### 3.5 hover 机制

- `MouseRegion onEnter/onExit` 驱动 `_hover`（video_card.dart:90-92）；效果仅 = 遮罩/圆点/角标淡出 + 操作层出现；**无卡片位移/缩放/边框高亮**（web 常见 hover lift 缺失）。

---

## 4. 抖音刷 FeedView（lib/ui/widgets/feed_view.dart，788 行）

### 4.1 列表容器（feed_view.dart:198-245）

- `ListView.builder` padding `LTRB(16, 4(fullscreen:8), 16, 40)`；卡片居中 `ConstrainedBox(maxWidth: 940)`；卡间距 `bottom 18`；滚近底部 700px 触发 onLoadMore；加载中尾部 spinner 20×20 stroke2。
- 共享单个 `Player()`，`setVolume(0)` 静音预览（feed_view.dart:72-73）；hover 卡 → `playUrlOf`（m3u8 首档）→ `_player.open` 播放，切走即 pause（feed_view.dart:162-196）；预览 loading 时中心 spinner 24×24 stroke2（feed_view.dart:319-326）。

### 4.2 卡片媒体区（feed_view.dart:291-607）

- `ClipRRect(radius: 6)` + 16:9；封面 `Image.network cover`（错误兜底 surface 底 + fileMedia 40px fgDim）；预览层 `Video(BoxFit.contain)`。
- 底部渐变：`transparent → black54` stops [0.55,1]（feed_view.dart:328-337）。
- **顶部信息浮层**（feed_view.dart:341-534）：渐变 `0xC7000000 → transparent` stops [0,0.55]，padding `16,14,16,44`；鼠标静止 **700ms** 自动隐藏（AnimatedOpacity 200ms，移动即恢复，feed_view.dart:61-67、347-349）：
  - avatar 36px 圆形：1px `dropdownBorder` + 阴影 `0x80000000 blur4 offset(0,1)`；无角色白底 `rgba(255,255,255,0.16)`=`0x29FFFFFF` + add 图标 18px；首字 18px w600（feed_view.dart:657-722）
  - 标题：白 14px（全屏 **21px**）w600 lh 1.4、阴影 `0x99000000 blur3 offset(0,1)`，maxLines 1
  - meta 行 12px（全屏 18px）：角色名（白色 0.8 透明度、点击开 picker）· 关注按钮（18px 圆 `0x73000000`、add/check 图标 11px、AnimatedSwitcher 180ms 淡入+上移 0.1 位移，feed_view.dart:617-653）· ownerName（白 0.8）
  - 右侧：复制按钮 22×22 radius 6、copy 图标 13px 白 0.85；全屏按钮 28×28 radius 6、bg 全屏态 listActive / 常态 `0x73000000`、screenFull/screenNormal 16px 白/白70（feed_view.dart:500-527）
- **左下统计**（left 10 bottom 8）：play 13px 白 + viewText 11px + 时长 11px，间隔 10（feed_view.dart:536-563）。
- **右侧动作列**（right 10 bottom 60，feed_view.dart:564-603）：待看/收藏 44px 圆形按钮、间距 16、图标 20px、active 实底 watchBlue/favRed 否则 `0x73000000`；标签 11px 白 + 阴影 `0xB3000000 blur2 offset(0,1)`；与浮层同节奏 700ms 隐藏。

### 4.4 feed 浮层尺寸速查表

| 元素 | 尺寸 | 值 | 行号 |
|---|---|---|---|
| 卡最大宽 | — | 940 | :225 |
| 卡间距 | — | 18 | :222 |
| 预览 loading | — | 24×24 stroke2 | :319-326 |
| avatar | 36 圆 | border dropdownBorder + 0x80000000@4/0,1 | :663-675 |
| 标题 | — | 14（全屏21）/600/lh1.4 | :384-387 |
| meta | — | 12（全屏18）白0.8 | :410-467 |
| 关注钮 | 18 圆 | 0x73000000、icon 11 | :626-631 |
| 复制钮 | 22×22 | radius 6、icon 13 白0.85 | :485-496 |
| 全屏钮 | 28×28 | radius 6、listActive/0x73000000 | :506-515 |
| 动作列钮 | 44 圆 | icon 20、active 实色/0x73000000 | :751-760 |
| 动作列标签 | — | 11 白、阴影 0xB3000000@2/0,1 | :762-774 |
| 左下统计 | — | icon 13 + 文本 11 | :541-559 |
| 自动隐藏 | — | 静止 700ms / AnimatedOpacity 200ms | :61-67,348 |

### 4.3 全屏（feed_view.dart:135-154）

- `windowManager.setFullScreen`；`WindowListener` 监听 `kWindowEventEnterFullScreen/LeaveFullScreen` 同步 `_fullscreen` 与 `AppState.feedFullscreen`；全屏时导航栏隐藏（shell.dart:47）、列表 padding 上边 8、标题字号升 21px。离开 feed 时自动退全屏（feed_view.dart:124-128）。
- toast：SnackBar 1500ms（feed_view.dart:780-787）。

---

## 5. 播放器（lib/ui/widgets/player_view.dart，908 行）

> 头部注释声明复刻 web components.css @38678-49200（player_view.dart:1-15），下文标注实际实现与注释的出入。

### 5.1 结构（player_view.dart:234-303）

- `ClipRRect(radius: 10)` 内嵌 `Video(controls: NoVideoControls)`（详情页外层再包 radius 12，detail_page.dart:196-198）。
- 层级：视频 → 点击切换播放（opaque）→ **底部独立进度条（渲染了两次！见缺口 #4）** → seek 预览浮层 → 控制条 → 中心播放钮 → buffering 遮罩。

### 5.2 控制条（player_view.dart:306-375）

- 显隐：`AnimatedSlide`（offset 0→0.06，200ms easeOut）+ `AnimatedOpacity`（200ms）；`_armHide` 播放中 700ms 无鼠标活动隐藏（player_view.dart:181-188）；鼠标 onHover 即显示（player_view.dart:236-240）。
- 背景：渐变 `transparent → rgba(0,0,0,0.72)`=`0xB8000000`（仅可见时）；padding `12,10,12,12`。
- 控件行：播放/暂停按钮 30×30 radius 6 图标 15px → 时间（宽 96、12px、`tabularFigures`、居中）→ Spacer → 分镜间隔滑块（有 shotsId 才显示）→ 倍速 → 音量 → 全屏按钮。
- **控制按钮 `_ctlBtn`（player_view.dart:377-392）：无任何 hover 效果**（恒 `Colors.transparent`）——与文件头注释「hover rgba(255,255,255,0.18)」及 web 不符。
- **倍速**：`_rates = [0.5, 1.0, 1.25, 1.5, 2.0]` 循环；文本 `${rate}x` 10px 白，height 30 padding h6（player_view.dart:394-408）。
- **音量**：64×14；轨道 4px `rgba(255,255,255,0.25)`=`0x40FFFFFF` radius 2；fill 白 4px；初始 `_vol = 0.8`；点击/横向拖动定位（player_view.dart:411-450）。
- **分镜间隔滑块**（player_view.dart:454-519）：数值按钮（minWidth 34、11px、点击恢复默认 **1.2s**）+ 滑块 96×30 轨道 4px `rgba(255,255,255,0.2)`=`0x33FFFFFF` fill accent；指数映射 0.1s~600s（`0.1*6000^f`）。
- 全屏：`windowManager.setFullScreen`（player_view.dart:358-366）。

### 5.3 中心播放钮（player_view.dart:527-546）

- 60×60 圆形、`rgba(0,0,0,0.55)`=`0x8C000000`、图标 26px；`_togglePlay` 后显示 500ms（player_view.dart:198-202）；播放中自动隐藏（playing 监听，player_view.dart:92）。

### 5.4 进度条 `_ProgressBar`（player_view.dart:549-907）

- 命中区高 **19px**（视觉 4px 贴底 + 上方扩展；用 Stack align bottomCenter 规避 Flutter 无限高陷阱，player_view.dart:742-757）。
- **整条模式**（player_view.dart:763-804）：轨道 4px（hover/拖动 **8px**）`rgba(255,255,255,0.38)`=`0x61FFFFFF` + 阴影 `0x99000000 blur3`；buffer 层 `rgba(255,255,255,0.35)`=`0x59FFFFFF`；fill `VsTheme.accent` #0078D4 radius 2 + 光晕 `accent@0.6 blur6`；**无宽度过渡动画**（注释：position stream 高频重建导致 450ms 动画永远追不上，实测 fill 冻结，已移除，player_view.dart:785-786）。
- **分镜分段模式**（player_view.dart:807-907）：段间 2px 空隙（首尾 1px）；段轨道 `0x33FFFFFF` radius 2，hover 仅当前段 8px（AnimatedContainer 120ms，拖动/seek 期 0ms）；buffer 按段内比例；**fill 颜色是 `0xFF0000FF` 纯蓝，不是 accent！**（player_view.dart:891，注释仍写 #0078D4 语义）。
- 交互：tap 直接 seek；horizontalDrag 拖动，`onSeekStart` 取消自动隐藏、`onSeekEnd` 执行 seek 并重新计时（player_view.dart:556-564、718-741）。

### 5.5 seek 预览（player_view.dart:221-232、579-622）

- hover 进度条时显示（onHoverPct 回调，player_view.dart:565-575）；`IgnorePointer` 浮层，bottom **22px**，x = `pct*w - 84` clamp（防溢出，player_view.dart:256-273）。
- 盒子：宽 **160**、padding 4、radius 8、bg `rgba(0,0,0,0.82)`=`0xD1000000`、边框 `VsToken.panelBorder`（#2B2B2B）、阴影 `0x80000000 blur16 offset(0,4)`；内：截帧 152×86 黑底 `BoxFit.contain` + 时间 11px tabular（player_view.dart:579-622）。
- 截帧：`player.screenshot(jpeg)`，节流 0.5s 位置变化（player_view.dart:222-232）。

### 5.6 buffering 遮罩（player_view.dart:279-297）

- `StreamBuilder(_player.stream.buffering)`；遮罩 `0x59333333`（注释称 rgba(0,0,0,0.35)，实际是 **rgba(51,51,51,0.35)** 深灰非纯黑）；spinner 22×22 stroke2，`valueColor: VsToken.chartsBlue`（#59A4F9）、`backgroundColor: listHover`（#2A2D2E）。

### 5.8 播放器计时/动画参数表

| 参数 | 值 | 行号 |
|---|---|---|
| 控制条滑入 | AnimatedSlide 200ms easeOut + 0.06 位移 | :307-313 |
| 控制条自动隐藏 | 700ms 无鼠标活动（播放中） | :181-188 |
| 中心钮显示时长 | 500ms | :198-202 |
| seek 预览截帧节流 | 位置变化 ≥0.5s | :222-223 |
| 进度条 hover/拖动加高 | 4→8px | :764,831 |
| 分段 hover 动画 | AnimatedContainer 120ms（拖动/seek 0ms） | :863-865 |
| 分镜采样 | 每 300ms 截帧（播放中） | :135 |
| 分镜最小间隔 | 默认 1.2s，可调 0.1~600s（指数） | :464,516 |
| buffering 遮罩 | 0x59333333 + spinner 22 stroke2 chartsBlue/listHover | :283-294 |

### 5.7 分镜分析（player_view.dart:126-169）

- 播放中每 ~300ms `screenshot(png)` → `sampleRgba` 特征 → `ShotAnalyzer.ingest` → 新节点即存 `ShotsStore` 并刷新分段（`shotsRev` 监听，player_view.dart:115-124）。

---

## 6. 弹窗

### 6.1 角色选择 char_picker_dialog.dart（410 行）

- **Dialog**：bg overlayBg、radius 8 + 1px border（char_picker_dialog.dart:99-104）；宽 **480**、`maxHeight 520`、padding 20（:105-108）。
- 标题：「解决角色冲突」/「更改角色」16px w600 lh 1.3；右侧视频标题 12px fgDim ellipsis（:114-130）。
- 添加角色行：输入框高 **32**、radius 6、hint 12px fgDim（:133-160）；添加按钮 **32×32** radius 6、底 `0xFF0E639C`（**硬编码，非 accent**）、add 图标 15px 白（:162-174）。
- 列表：`GridView` 2 列、gap 8、**行高 56**（mainAxisExtent 56）（:179-191）；`Flexible` 内 shrinkWrap（maxHeight 520 约束由外层 Container）。
- **行样式** `_row`（:238-333）：radius 8、1px border、背景=角色 banner（BoxFit.cover）或渐变 `listActive → bg`；暗遮罩 `0x73000000 → 0xD1000000`（:265-275）；冲突：红 tint `rgba(248,81,73,0.16)`=`0x29F85149` + 左 3px 竖条 `error` + 红字（:277-286）；左 36px 圆形头像（白底首字 15px w600、阴影 `0x80000000 blur4 offset(0,1)`）；名字 13px w600 白（冲突=error）阴影 `0xD9000000 blur3 offset(0,1)`；**选中态**=右上 6,6 处 18px 圆形 `listActive`（深 #04395E）底 + 白平直对勾 CustomPaint（stroke 2.2、butt 帽、miter 接，:315-328、389-409）。
- 底部（:194-227）：「还原自然匹配」12px fgDim（仅手动指定且有角色时）；「进入角色主页」12px linkBlue；「取消」12px fgDim；「完成」FilledButton 底 `0xFF0E639C`、padding h14/v6、13px。
- 返回语义：`'__unassign__'` / 角色名 / `'__role__:<名>'` / null（char_picker_dialog.dart:15-16）。

### 6.3 弹窗几何对照表

| 项 | char_picker | char_list | 备注 |
|---|---|---|---|
| 宽 | 480（maxH 520） | 560（maxH 420 列表） | picker:106 / list:70 |
| 边框 | radius 8 + 1px border | radius 8 无边框 | list 少边框 |
| 外 padding | 20 | 20 | — |
| 标题 | 16/w600/lh1.3 | 16/w600/lh1.3 | — |
| 副标题 | 视频标题 12 fgDim | 「角色管理」按钮 h32 | — |
| 网格 | 2 列、gap 8、行高 56 | 2 列、gap 8、行高 56 | 同构 |
| 行内容 | 头像36 + 名13/600 | 头像36 + 名13/600 + 红点6 + 关注钮18 | list 多关注列 |
| 选中态 | 18 圆 listActive + 白勾 | 无（行点击即进主页） | picker 独有 |
| 冲突态 | 红 tint + 3px 左竖条 + 红字 | 无 | picker 独有 |
| barrier | 默认（透明黑） | 0x99000000 | list:23 显式 |
| 底部按钮 | 还原/进入主页/取消/完成 | 无底部 | — |
| toast | 默认 SnackBar 2s | floating 宽320 1.5s | 风格不一致 |

### 6.2 角色列表 char_list_dialog.dart（361 行）

- `showDialog` barrierColor `0x99000000`（char_list_dialog.dart:23）；Dialog bg overlayBg、radius 8、**无 border**（与 picker 不一致）；宽 **560**、padding 20（:66-71）。
- 标题「角色列表」16px w600（:80-89）；右上「角色管理」按钮 h32 padding h12 radius 6 1px border、gear 14px + 文字 13px（:92-120）。
- 列表：`ConstrainedBox(maxHeight: 420)` + GridView 2 列 gap 8 行高 56（:141-155）；空态「还没有角色…」12px fgDim padding 24（:124-137）。
- **行**（:164-290）：同 picker 行样式（banner/渐变 + 暗遮罩 + 36 头像 + 13px w600 白字阴影）；右侧：已关注红点 6×6 圆形 `error`（:231-238）+ 关注按钮 18px 圆 `0x73000000`、add/check 11px、AnimatedSwitcher 180ms 淡入+slide（:242-282）；**关注后立即置顶重排**（:250）。
- toast：floating、宽 320、1500ms（:350-360）。

---

## 7. 页面

### 7.1 home_page.dart（271 行）

- 结构：Column = 分区 chips 栏（40 高，feed 模式隐藏，home_page.dart:152-163）+ Expanded（FeedView 或视频墙）。
- **chips**（home_page.dart:243-270）：胶囊 radius **14**、padding h12、间距 right 6；active=accent 底白字 12px，inactive=overlayBg 底 + border 边框；横向滚动 padding h16/v6。
- **视频墙**（home_page.dart:203-241）：`SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 400, spacing 6, childAspectRatio 1.2)`，padding `0,0,0,8`；卡高≈宽/1.2（注释：媒体区 16:9 + 文字区 ~89px）；尾部加载 spinner 18×18。
- 无限滚动阈值：`maxScrollExtent - 600`（home_page.dart:118）；缓存优先 + 网络刷新（home_page.dart:45-65）。
- 错误态：13px error 红字居中；加载态 spinner 22×22 stroke2。

### 7.2 watchlist_page.dart（67 行，待看/收藏复用）

- 标题 padding `LTRB(20,14,20,4)`、16px w600（watchlist_page.dart:25-30）。
- 网格：`maxCrossAxisExtent: 320`、spacing **16**、`childAspectRatio: 16/9/1.52`、padding `16,8,16,32`（:45-52）——与 home 的 400/6/1.2 **不一致**。
- 空态：图标 36px fgDim + 文案 13px fgDim（:32-44）。

### 7.3 search_page.dart（183 行）

- 搜索行 padding `16,12,16,8`：输入框 360×32（**TextEditingController 每次 build 新建**，:118）、ElevatedButton「搜索」、关键字回显 12px fgDim（:110-138）。
- 结果网格同 watchlist（max 320 / gap 16 / ratio 16/9/1.52）；未搜索/空/失败态居中文字 13px；滚动阈值 -600。

### 7.4 detail_page.dart（863 行）

- 页面 padding `LTRB(20,16,20,40)`；**双栏断点 `maxWidth >= 1120`**（detail_page.dart:186）：主列 Expanded + gap 30 + 侧栏固定宽 **320**（独立滚动）；窄窗口侧栏兜底为底部网格（:472-498）。
- **播放器**：maxWidth 960 居中、16:9、`ClipRRect(radius: 12)`（:190-215）；播放源不可用显示黑底 + 13px fgDim。
- **标题行**：19px w600 lh 1.4 maxLines 1 + 复制按钮 20×20 radius 6 图标 13px fgDim（:224-244）。
- **统计行**（:246-278）：Wrap gap 14/8：`{viewText}播放`·`{n}弹幕`·日期(yyyy-M-d)·时长，13px fgDim；分区 badge：padding `8,2`、radius **10**、badgeBg 底、11px badgeFg。
- **操作按钮组**（:280-360）：Wrap gap 8；「识别分镜」（overlayBg radius 6 border；扫描中 spinner 12px accent + 「识别中 n%」accent 12px；已扫显示「已识别·重扫」）、「下载」（同风格 + download 图标 14px）、「收藏」/「待看」（active 实底 favRed/watchBlue 白字，inactive overlayBg）。
- **UP 行**（:362-398）：头像 38px 圆、listHover 底 + dropdownBorder 边框 + 阴影 `0x80000000 blur4 offset(0,1)`；名字 14px w600；兜底首字 20px fgDim。
- **角色行**（:605-723）：冲突=30×30 radius 6 `0xCC2A1818` + 边框 `0x66F85149` + circleSlash 15px；角色名 13px（冲突 w600 红）；关注按钮 22×22 radius 11 btnSecondary 底、check 12px watchBlue/add fg；「角色主页」胶囊 padding 8/4 overlayBg 11px fgDim。
- **简介**（:404-444）：bg listHover radius 8 padding 14/12；13px lh 1.7 fgDim，maxLines 3（>120 字符出现「展开」linkBlue 12px）。
- **分 P**（:446-467）：胶囊 padding 10/4 radius 4、首个 listActive 底 + accent 边框、12px。
- **相关推荐侧栏**（:523-594）：缩略图 168px 宽 16:9 radius 6 + 时长 11px badgeFg（右下 4,4）；标题 13px maxLines 2；meta `{owner} · {n}播放` 12px fgDim；间隔 12。
- 相关推荐跳转用 `Navigator.pushReplacement`（:493、534）→ **无返回栈**。

### 7.5 characters_page.dart（590 行，角色管理）

- **左栏**：宽 **220**、右边框 border（characters_page.dart:131-135）；标题 15px w600 padding `14,14,14,8`；添加按钮 26×26 radius 6 `0xFF0E639C`（:165-173）。
- 列表行：margin bottom 4、padding h8/v7、radius 6、active=listActive 底白字 13px；头像 28px；已关注 check 12px watchBlue（:188-227）。
- **右栏** padding 24：详情头卡（banner 背景 + 暗遮罩 `0x73000000→0xD1000000`；无 banner 渐变 listActive→bg；padding `16,14`；头像 64px radius 10；名字 15px w600，banner 时白字 + 阴影 `0x99000000 blur4 offset(0,1)`；背景图按钮 24×24 top8 right8 `0x73000000` radius 6）（:246-345）。
- 小节标题 13px w600（:401-403）；关键词 chip：底 `0xFF2D2D30` radius 10 边框、删除钮 14px 圆 `0xFF555555` 图标 8px（:405-435）；添加框 150×26。
- 代表作列表（:437-496）：行 surface radius 6 边框、星标按钮 26×26、active featGold 黑星 / inactive `0xFF2D2D30` fgDim 星；最多 20 条。
- 删除：OutlinedButton 红边框红字（:384-392）；确认 AlertDialog（radius 8 border、title 14px、内容 13px fgDim、取消 fgDim/删除 error 12px）。
- `_AddCharDialog`（:541-590）：AlertDialog 320 宽输入 + 添加 FilledButton `0xFF0E639C`。

### 7.6 role_page.dart（394 行，角色主页）

- **banner**：高 **150** 全宽；banner 图 `BoxFit.cover` + 水平视差 `_bgX`（hover 时 `x = 50 + nx*14`，:165-175）；渐变 `0x73000000 → 0xD9000000`（有图）/ `listActive → bg`（无图）；返回按钮 28×28 `0x99000000` radius 6、arrowLeft 15px（:200-214）。
- **⚠️ 头部未实现**：`Container(height: 120, color: 0xFFFF00FF 品红)` 内放 96×96 绿块（0xFF00FF00）+ 400×40 蓝块（0xFF0000FF）占位（role_page.dart:223-233）——头像/名字/chips/统计全部缺失。
- **代表作**（:235-269）：标题 13px w600 padding h20；横向 ListView 高 **262**、卡宽 400、间隔 12；VideoCard featured+showFeatureBtn。
- **相关视频**（:271-326）：`maxCrossAxisExtent 320 / gap 16 / ratio 16/9/1.52` 的 shrinkWrap 网格；空态 12px fgDim；底部状态：没有更多了 / 加载失败点击重试（linkBlue 12px）。

### 7.7 downloads_page.dart（249 行）

- 标题 16px w600 + 「粘贴 m3u8 下载」TextButton.icon（link 14px）（downloads_page.dart:111-126）；任务列表 padding `20,8,20,32` 间隔 8。
- 任务卡（:144-217）：surface 底 radius 6 边框 padding 12；状态色：done=localGreen / failed=error / canceled=fgDim / downloading=accent；进度条 `LinearProgressIndicator minHeight 4`、bg 硬编码 `0xFF3C3C3C`、valueColor accent、radius 3；暂停/取消图标 14px；错误 12px error；保存路径 11px fgDim。
- 添加弹窗：AlertDialog 输入宽 460、按钮「取消」/「开始下载」（:219-248）。默认保存目录 = `~/Downloads`（:79-88）。

### 7.8 local_page.dart（147 行）

- 标题 16px w600 + 「导入视频」TextButton.icon（local_page.dart:52-67）；网格同 watchlist（max 320/gap 16/ratio）。
- 每卡叠删除按钮：24×24、top 2 right 2、`0x99000000` radius 6、close 12px（:93-109）——**与卡片右上角 3×3 圆点区（top 8 right 8）视觉重叠**。
- 导入：file_selector，扩展名 mp4/webm/mkv/mov/avi/flv/m4v/ts（:120-123）；封面截帧走 ThumbHost（:27-35）。

### 7.9 settings_page.dart（160 行）

- `ListView` padding `24,16,24,40`；标题 16px w600（settings_page.dart:50-52）。
- 区块容器：surface 底 radius 6 边框；行 padding h14/v10；行标题 13px、副标题 11px fgDim（:112-159）。
- 外观：主题 Switch（activeTrackColor accent，:57-61）。
- 下载：ffmpeg 路径输入框 320 宽（onSubmitted 探测，:67-76）；默认下载目录 TextButton linkBlue 12px。
- 关于：**「vshell 0.1.0」**（:97）——与导航栏品牌「v1.0.0」（shell.dart:351）**版本号不一致**。

### 7.11 各页面滚动/加载/网格参数对照

| 页面 | 滚动容器 | 触发加载阈值 | 网格参数 | 空态 |
|---|---|---|---|---|
| home | GridView（_scroll）/ FeedView 内 ListView | -600（home_page.dart:118） | 400/6/1.2 | spinner 22 / 错误 13 |
| search | GridView（_scroll） | -600（search_page.dart:100） | 320/16/16÷9÷1.52 | 「输入关键字…」13 |
| watchlist | GridView | —（一次性） | 320/16/16÷9÷1.52 | 图标36 + 文案13 |
| detail | 主列 SingleChildScrollView + 侧栏独立 ListView | 相关推荐一次性 | 侧栏 320 宽 / 底部兜底 320 | 错误态 icon32 + 重试 |
| role | SingleChildScrollView（_scroll） | -500（role_page.dart:119） | 320/16/16÷9÷1.52 + 横排 400 宽 | 「暂无相关视频」12 |
| characters | 左栏 ListView + 右栏 SingleChildScrollView | — | 列表行 / 代表作列 | 「还没有角色」12 |
| downloads | ListView.separated | — | 卡片列 | 「暂无下载任务」13 |
| local | GridView | — | 320/16/16÷9÷1.52 | 「暂无本地视频」13 |
| settings | ListView | — | 区块卡片 | — |

### 7.10 全局状态 app_state.dart（183 行，粗略）

- PageType 枚举 10 项（app_state.dart:14）；`themeLight/feedMode/feedFullscreen/coverLayout` 四个视图开关 + 待看/收藏 Map + `go()` 导航 + VsStore 持久化（app_state.dart:34-112）。

---

## 8. 缺口标注（读码发现的问题，按严重度排序）

1. **角色主页头部是调试占位**：role_page.dart:223-233 `Container(h120, color:0xFFFF00FF 品红)` + 绿/蓝 ColoredBox 占位，头像、关键词、统计全部未实现——与 web 版差距最大的页面区块。
2. **进度条分段 fill 用纯蓝 `0xFF0000FF`**（player_view.dart:891），整条模式是 `VsTheme.accent #0078D4`（:792）——分段模式颜色不一致（疑似调试遗留），且与 web「fill #0078D4」契约不符。
3. **进度条被渲染两次**：`Positioned(... child: _bar())` 同时存在于 player_view.dart:254 与 :299——重复渲染/重复命中/重复回调，应删除其一。
4. **控制条按钮无 hover 效果**：`_ctlBtn` 恒 `Colors.transparent`（player_view.dart:377-392），文件头注释声明的「hover rgba(255,255,255,0.18)」未实现；web 版有 hover 反馈。
5. **导航栏按钮无 hover 态**：`_navBtn/_rightBtn/_viewBtn`（shell.dart:216-320）只有 active 底，无 `toolbarHover` 悬停背景（web .vshell-nav-btn hover 存在）；角色按钮图标在 `page==characters` 时变白却无底色（shell.dart:235，疑似条件笔误）。
6. **值写死绕过主题**（应改用 token，grep 实证）：
   - `0xFF0E639C`（按钮蓝，比 accent #0078D4 暗）：char_picker_dialog.dart:168、220；characters_page.dart:169、584
   - `0xFF2D2D30`：characters_page.dart:409、476；`0xFF555555`：characters_page.dart:426
   - `0xFF232323`（封面占位底）：video_card.dart:444、457、469、472
   - `0xFF3C3C3C`（下载进度条轨道）：downloads_page.dart:199
   - `0xFF0000FF`：player_view.dart:891；`0xFFFF00FF/0xFF00FF00/0xFF0000FF`：role_page.dart:225-230
7. **vs_tokens.dart 基本死代码**：587 行仅 2 处引用（player_view.dart:291 chartsBlue、:586 panelBorder），全部 String token 零引用；Flutter 主题实际由 VsTheme 承载，双份 token 有失同步风险（如 `VsToken.buttonHoverbackground #026EC1` 与对话框硬编码 `#0E639C` 并存）。
8. **VsTheme 死 getter**：`maskBg`（vs_theme.dart:79）、`cardBg`（:86）、`link`（:39）定义后未引用；卡片背景实际用 `bg`（video_card.dart:99）而非 cardBg。
9. **hover 交互精度缺失**：
   - 视频卡 hover 操作层**无滑入动画**（video_card.dart:298-334 直接切换，web 为滑入）；卡片无 hover 位移/缩放/边框高亮（web 常见 lift）
   - 视频卡封面盖层/角标 hover 淡出用 AnimatedOpacity 120ms 已实现（video_card.dart:118-177），但圆点网格、操作层与 web 的 3×3 圆点动画节奏需比对
   - 播放器 buffering 遮罩实际色为 `rgba(51,51,51,0.35)`（player_view.dart:284），注释写「rgba(0,0,0,0.35)」，与 web 是否一致待查
10. **进度条宽度过渡缺失**：web 有 450ms 平滑（fill 动画），Flutter 因 position stream 高频重建主动移除（player_view.dart:785-786 注释记录实测 fill 冻结 94px→4px）——性能与视觉的已知取舍，需 web 侧确认是否可接受。
11. **窗口标题栏未定制**：main.dart:51-60 无 `titleBarStyle`/`titleBarHeight` 配置，使用原生系统标题栏；web 版是自定义标题栏/品牌区，桌面端视觉定位待对齐。
12. **版本号不一致**：导航栏「v1.0.0」（shell.dart:351）vs 设置页「vshell 0.1.0」（settings_page.dart:97）。
13. **调试日志残留**（生产代码写死绝对路径）：`D:/vshell_btn.log`（shell.dart:277）、`D:/vshell_layout.log`（shell.dart:293）、`D:/vshell_pt.log`（main.dart:137）、`D:/vshell_dlg.log`（char_list_dialog.dart:33）、`vshell_error.log`（main.dart:32）、`vshell_fs.log`（feed_view.dart:80）——发布前应清理。
14. **详情页相关推荐用 `pushReplacement`**（detail_page.dart:493、534）：从推荐进新详情后返回键直接退出页面而非回上级详情；web 版为 URL 路由栈。
15. **search_page 输入框控制器每帧重建**：`TextEditingController(text: _kw)` 在 build 内（search_page.dart:118），每次重建丢失焦点/光标，且输入中刷新会重置文本。
16. **卡片网格参数不统一**：home 视频墙 maxCrossAxisExtent 400 / gap 6 / ratio 1.2（home_page.dart:209-216）；watchlist/search/detail 兜底/role/local 用 maxCrossAxisExtent 320 / gap 16 / ratio 16/9/1.52——同屏宽度下卡片尺寸/密度不一致，web 版是否同构待比对。
17. **snackbar 风格不统一**：feed toast 1500ms 默认行为（feed_view.dart:780-787）；char_picker 用默认 behavior（char_picker_dialog.dart:435-438）；char_list floating 宽 320（char_list_dialog.dart:350-360）；detail 默认 1500/2000ms——深浅色与圆角依赖全局 snackBarTheme，但局部 width/behavior 混用。
18. **浅色主题完整性存疑**：大量硬编码 `Colors.white`/`Colors.black` 用于浮层/文字（video_card.dart:212 等），在 light 模式下仍白字/黑底；`light` 分支仅覆盖 VsTheme getter，未覆盖各处 const 硬编码——需逐点核对。
19. **local_page 删除按钮与卡片角标重叠**：删除钮 top:2/right:2（local_page.dart:93-109）压在卡片右上 3×3 圆点（top:8/right:8，video_card.dart:171-179）之上，hover 时圆点淡出但删除钮常驻。
20. **字体未完全统一**：部分 TextStyle 漏写 `fontFamily: 'Segoe UI'`（如 detail_page.dart:393-395、role_page.dart:633-637 等），回落到系统默认字体（Flutter 桌面默认 Roboto/Segoe 视平台而定）——与主题内统一 Segoe UI 不一致。
21. **card hover 隐藏规则差异**：web 卡片 hover 时角标隐藏、圆点隐藏、遮罩隐藏、操作层出现（Flutter 已实现），但 Flutter 的「隐藏」是透明度 0 仍占位（AnimatedOpacity 不移除布局），命中区域仍在——局部可点区域与 web 不同。

---

## 附：像素级速查（一页版）

| 元素 | 值 |
|---|---|
| 导航栏高 / 毛玻璃 | 56 / blur 10 / bg 85% 黑 |
| 搜索框 | 520×30 radius 8、聚焦不变边框 |
| 导航按钮 | 34×34 radius 8 图标16、active=listActive |
| 卡片 | 边框 #2B2B2B 1px、radius 8、shadow 0x24000000@12、媒体 16:9 |
| 卡片文字区 | pad 8/6/8/8、标题 13/600/lh1.8×2行、meta 12/11 |
| 圆点 | 6×6、9px 网格、顺序 local→fav→feat→watch |
| hover 操作钮 | 28×28 radius 6、底 0x4F5A5D5E、active 实色 |
| feed 卡 | 宽 max940、间距18、标题14(全屏21)、动作钮 44 圆 |
| 播放器 | radius 10、控制条 200ms 滑入、按钮 30×30 图标15 |
| 进度条 | 命中19px、轨道4(hover8)、fill #0078D4(+光晕)、buffer 0x59FFFFFF |
| seek 预览 | 160 宽、帧 152×86、底 22px、0x82 黑、panelBorder |
| picker 弹窗 | 480 宽/行高56/2列、选中 18 圆 listActive + 白对勾 |
| list 弹窗 | 560 宽/行高56/2列/maxH420 |
| detail | 断点 1120、主列 max960、侧栏 320/gap30、标题19/600 |
| 网格 | home 400/6/1.2；其余 320/16/16÷9÷1.52 |
| 窗口 | 1440×900、min 960×600、原生标题栏 |
