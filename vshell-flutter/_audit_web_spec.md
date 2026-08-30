# vshell web 版（userscript）UI 规范审计文档

> 用途：Flutter 复刻 vshell web 版（`output/vshell.user.js` v0.5.6）的像素级参考。
> 来源：`vshell-flutter/_web_css_extract.css`（5867 行，tokens/colors/base/components/pages/animations/responsive 五段）
>       + `output/vshell.user.js`（DOM 结构 / 交互 JS）
> 行号约定：`css:1444` = `_web_css_extract.css` 第 1444 行；`js:2998` = `output/vshell.user.js` 第 2998 行。
> 颜色以 CSS 变量值为准（截图仅确认布局/层级）；未注明主题的均指 **dark 主题**（`.vshell.theme-dark`）。
> 根容器：`html.vshell.theme-dark > body > .vshell-app`；所有变量定义在 `.vshell`（token）/`.vshell.theme-dark`（色）选择器下。

---

## 1. 全局 Token 表

### 1.1 字体阶梯（css:8-23）
| Token | 值 | 行号 |
|---|---|---|
| --vscode-bodyFontSize / --vscode-fontSize-body1 / heading3 | **13px**（正文） | css:9,15,14 |
| --vscode-bodyFontSize-small / --vscode-fontSize-label1 | **12px** | css:10,17 |
| --vscode-bodyFontSize-xSmall / --vscode-fontSize-body2 / label2 | **11px** | css:11,16,18 |
| --vscode-fontSize-heading1 | 26px | css:12 |
| --vscode-fontSize-heading2 | 18px | css:13 |
| --vscode-fontSize-label3 | 10px | css:19 |
| --vscode-fontWeight-regular / semiBold | 400 / 600 | css:20-21 |
| --vscode-codiconFontSize / -compact | 16px / 12px | css:22-23 |
| .vshell 全局 | `font-size:13px; line-height:1.5; font-family: var(--vscode-font-family,"Segoe UI",system-ui,-apple-system,sans-serif)` | css:1273-1278 |

### 1.2 圆角阶梯（css:24-29）
| Token | 值 |
|---|---|
| --vscode-cornerRadius-xSmall | 2px |
| --vscode-cornerRadius-small | 4px（控制件/小按钮） |
| --vscode-cornerRadius-medium | 6px |
| --vscode-cornerRadius-large | 8px（卡片/浮层） |
| --vscode-cornerRadius-xLarge | 12px |
| --vscode-cornerRadius-circle | 9999px |

### 1.3 spacing 阶梯（css:31-44，sizeXX = XX/10 px）
sizeNone=0 · size20=2 · size40=4 · size60=6 · size80=8 · size100=10 · size120=12 · size160=16 · size200=20 · size240=24 · size280=28 · size320=32 · size360=36 · size400=40

### 1.4 自定义补充变量（css:1267-1277）
| 变量 | 值 |
|---|---|
| **--vscode-shadow-lg** | `0 0 12px rgba(0,0,0,0.14)`（mimic workbench-style.css:60，卡片/浮层阴影） |
| **--kk-progress-color** | `#0078D4`（KKAV 进度条填充色，所有播放进度填充用） |
| --vscode-strokeThickness | 1px |

### 1.5 过渡时长速查（贯穿全文，均 `ease` 除非注明）
120ms（hover 底色/图标/透明度、胶囊位移、标签行、fab 行）· 140ms（弹窗 radio/图标按钮、feed 动作列）· 150ms（按钮底色/边框/阴影、input 边框）· 160ms（搜索框宽、下载卡边框）· 180ms（follow 图标淡入）· 200ms（播放器控件显隐、feed 信息/动作列、下载卡入场 0.2s）· 220ms（toast 出入）· 300ms（进度条宽度）· 450ms linear（播放器进度条宽度 KKAV 平滑）· 0.22s（页面入场）· 0.28s（fab 入场）· 0.32s（卡片入场）· 0.35s（角色代表作 host 展开）· 36s linear（代表作滚动排）。

### 1.6 Dark Modern 主题色（css:57-138 + 默认值 241-341）
**主表（全部 dark 值）：**
| 变量 | 值 | 变量 | 值 |
|---|---|---|---|
| foreground | #CCCCCC | descriptionForeground | #9D9D9D |
| errorForeground | #F85149 | icon-foreground | #CCCCCC |
| focusBorder | #0078D4 | widget-border | #313131 |
| textLink-foreground | #4daafc | progressBar-background | #0078D4 |
| button-background | #0078D4 | button-foreground | #FFFFFF |
| button-hoverBackground | #026EC1 | editor-background | #1F1F1F |
| editor-foreground | #CCCCCC | editorLineNumber-foreground | #6E7681 |
| editorLineNumber-activeForeground | #CCCCCC | editorWidget-background | #202020 |
| editorGroup-border | #FFFFFF17 | editorGroupHeader-tabsBackground | #181818 |
| editorGroupHeader-tabsBorder | #2B2B2B | sideBar-background | #181818 |
| sideBar-foreground | #CCCCCC | sideBar-border | #2B2B2B |
| sideBarTitle-foreground | #CCCCCC | sideBarSectionHeader-background | #181818 |
| sideBarSectionHeader-border | #2B2B2B | sideBarSectionHeader-foreground | #CCCCCC |
| panel-background | #181818 | panel-border | #2B2B2B |
| panelInput-border | #2B2B2B | panelTitle-activeForeground | #CCCCCC |
| panelTitle-inactiveForeground | #9D9D9D | panelTitle-activeBorder | #0078D4 |
| titleBar-activeBackground | #181818 | titleBar-activeForeground | #CCCCCC |
| titleBar-inactiveBackground | #1F1F1F | titleBar-inactiveForeground | #9D9D9D |
| titleBar-border | #2B2B2B | activityBar-background | #181818 |
| activityBar-foreground | #D7D7D7 | activityBar-border | #2B2B2B |
| activityBar-activeBorder | #0078D4 | activityBar-inactiveForeground | #868686 |
| activityBarBadge-background | #0078D4 | activityBarBadge-foreground | #FFFFFF |
| statusBar-background | #181818 | statusBar-foreground | #CCCCCC |
| statusBar-border | #2B2B2B | statusBarItem-hoverBackground | #F1F1F133 |
| statusBarItem-hoverForeground | #FFFFFF | statusBarItem-focusBorder | #0078D4 |
| statusBarItem-prominentBackground | #6E768166 | statusBarItem-remoteBackground | #0078D4 |
| statusBarItem-remoteForeground | #FFFFFF | tab-activeBackground | #1F1F1F |
| tab-activeForeground | #FFFFFF | tab-activeBorderTop | #0078D4 |
| tab-inactiveBackground | #181818 | tab-inactiveForeground | #9D9D9D |
| tab-border | #2B2B2B | tab-hoverBackground | #1F1F1F |
| tab-selectedBackground | #37373D | tab-selectedForeground | #FFFFFF |
| tab-selectedBorderTop | #6caddf | list-dropBackground | #383B3D |
| input-background | #313131 | input-foreground | #CCCCCC |
| input-border | #3C3C3C | input-placeholderForeground | #989898 |
| inputOption-activeBackground | #2489DB82 | inputOption-activeBorder | #2488DB |
| dropdown-background | #313131 | dropdown-foreground | #CCCCCC |
| dropdown-border | #3C3C3C | checkbox-background | #313131 |
| checkbox-border | #3C3C3C | menu-separatorBackground | #454545 |
| badge-background | #616161 | badge-foreground | #F8F8F8 |
| terminal-foreground | #CCCCCC | | |

**Dark 默认值表（colorRegistry，css:241-341，常用）：**
| 变量 | 值 | 用途 |
|---|---|---|
| disabledForeground | #CCCCCC80 | 禁用 |
| toolbar-hoverBackground | #5a5d5e50 | ★通用悬停底（icon-btn/nav-btn/胶囊/按钮） |
| toolbar-activeBackground | rgba(106,109,110,0.3137) | 悬停加深 |
| editorWidget-border | rgba(204,204,204,0.2) | 浮层边框 |
| editorError / Warning / Info-foreground | #F14C4C / #CCA700 / #59a4f9 | |
| list-hoverBackground | #2A2D2E | ★行悬停底 |
| list-activeSelectionBackground | #04395E（蓝） | ★选中底 |
| list-activeSelectionForeground | #FFFFFF | 选中字 |
| list-inactiveSelectionBackground | #37373D | 非激活选中 |
| list-focusOutline | #0078D4 | |
| list-highlightForeground | #2AAAFF | 高亮字 |
| list-filterMatchBackground | #EA5C0055 | |
| inputOption-activeForeground | #FFFFFF | |
| checkbox-selectBackground / -Border | #202020 / #CCCCCC | |
| menubar-selectionBackground | #5a5d5e50 | |
| commandCenter-background | rgba(255,255,255,0.05) | |
| terminal-ansiGreen / Red / Blue / Cyan / Yellow | #0DBC79 / #cd3131 / #2472c8 / #11a8cd / #e5e510 | |
| charts-orange | #EA5C0055（黑名单/收藏橙用 #EA5C00） | |
| charts-green | #89D185 | |
| charts-red | #F14C4C | |
| **charts-blue** | **#59A4F9**（待看蓝/链接蓝/图标蓝） | |
| charts-yellow | #CCA700 | |
| scrollbarSlider-background | rgba(121,121,121,0.4) | |
| scrollbarSlider-hoverBackground | rgba(100,100,100,0.7) | |
| scrollbarSlider-activeBackground | rgba(191,191,191,0.4) | |
| sash-hoverBorder | #0078D4 | |
| breadcrumb-background | #1F1F1F | |
| **surface-background** | **#181818**（浮层/卡片底） | |
| surface-foreground | #CCCCCC | |
| surface-border | rgba(204,204,204,0.1) | |
| statusBarItem-errorBackground 等 | #95312C / #7A6400 / #6c1717 | |
| tab-unfocusedActiveForeground | rgba(255,255,255,0.5) | |
| tab-unfocusedInactiveForeground | rgba(157,157,157,0.5) | |

### 1.7 Light Modern 主题（css:142-228，仅列关键差异）
foreground/descriptionForeground #3B3B3B · errorForeground #F85149 · focusBorder/button/progress/activityBarBadge/panelTitle-activeBorder **#005FB8** · button-hoverBackground #0258A8 · textLink-foreground #005FB8 · editor-background #FFFFFF · editorWidget-background/sideBar/panel/titleBar/statusBar #F8F8F8 · widget-border/panel-border/sideBar-border/titleBar-border #E5E5E5 · input-background #FFFFFF · input-border #CECECE · input-placeholderForeground #767676 · dropdown-border #CECECE · badge-background #CCCCCC · badge-foreground #3B3B3B · list-hoverBackground #F2F2F2 · list-activeSelectionBackground #E8E8E8 · list-activeSelectionForeground #000000 · inputOption-activeBackground #BED6ED · tab-selectedBackground #E4E6F1 · scrollbarSlider-background rgba(100,100,100,0.4) · surface-background #FFFFFF · charts-blue #0063d3 · terminal-ansiGreen #107C10 · navbar 底 rgba(255,255,255,0.85)（css:1468-1470）。

---

## 2. base 通用件（css:1258-1436）

### 2.1 根布局
- `html.vshell, html.vshell body`: `margin:0; padding:0; height:100%`（css:1258-1263）；body 背景 editor-background（css:1264-1266）。
- `.vshell-app`: `display:flex; flex-direction:column; min-height:100vh; min-height:100dvh; background:editor-background`（css:1279-1285）。
- **dark 主题页面背景强制 `#181818`**：`html.vshell.theme-dark body, .theme-dark .vshell-app { background:#181818 }`（css:1287-1290）。
- `a`: textLink-foreground、无下划线（css:1291-1294）；`img`: display:block（css:1295-1297）。
- `button` 全重置：`font:inherit; color:inherit; background:none; border:none; padding:0; cursor:pointer`（css:1298-1305）。
- `[hidden]`: `display:none !important`（css:1307-1309）。

### 2.2 输入框（css:1310-1328）
| 属性 | 值 |
|---|---|
| input/select | `font:inherit; color:input-foreground; background:input-background; border:1px solid input-border; border-radius:6px; padding:6px 10px; outline:none; transition:border-color 150ms, box-shadow 150ms` |
| :focus | `border-color:focusBorder; box-shadow:0 0 0 1px focusBorder` |
| ::placeholder | `color:input-placeholderForeground` |

### 2.3 滚动条（css:1338-1379）
- 视口级关闭：`html.vshell { scrollbar-width:none; -ms-overflow-style:none }` + `::-webkit-scrollbar { display:none; width:0; height:0 }`（css:1338-1346）。
- **容器滚动条（.vshell-page）纯 webkit 自绘**：宽/高 **6px**；track 透明；thumb `rgba(121,121,121,0.6)` 圆角 3px；thumb:hover `rgba(121,121,121,0.8)`；button/corner 无（css:1358-1379）。
- Firefox 兜底：`@-moz-document url-prefix()` → `.vshell-page { scrollbar-width:thin; scrollbar-color:rgba(121,121,121,0.6) transparent }`（css:1352-1357）。

### 2.4 Spinner（css:1382-1390）
`width/height:22px; border:2px solid list-hoverBackground; border-top-color:charts-blue(#59A4F9); border-radius:50%; animation:vshell-spin 0.8s linear infinite; flex:none`。

### 2.5 icon-btn（css:1391-1404）
`width/height:32px; display:inline-flex; align-items/justify-content:center; border-radius:6px; color:foreground; transition:background 120ms, transform 120ms`；hover：`background:toolbar-hoverBackground; transform:scale(1.05)`。

### 2.6 按钮 .vshell-btn 系列（css:1405-1436）
| 类 | 属性 |
|---|---|
| .vshell-btn | `display:inline-flex; align-items:center; gap:6px; height:32px; padding:0 14px; border-radius:6px; font-size:13px; user-select:none; transition:background 150ms, transform 120ms, box-shadow 150ms, border-color 150ms` |
| :active | `transform:scale(0.97)` |
| .vshell-btn-primary | `background:button-background(#0078D4); color:button-foreground(#FFF)`；hover `button-hoverBackground(#026EC1)` + `box-shadow:0 2px 10px rgba(0,0,0,0.28)` |
| .vshell-btn-secondary | `background:transparent; color:foreground; border:1px solid panel-border`；hover `list-hoverBackground` + `border-color:widget-border` |

---

## 3. 导航栏 .vshell-navbar（css:1444-1985；DOM js:2998-3697）

### 3.1 容器
| 属性 | 值 | 行号 |
|---|---|---|
| position / z-index | `fixed; top:0; left:0; right:0; z-index:60` | css:1445-1451 |
| 高度 | **56px**（v0.3.35 由 52 增高），`box-sizing:border-box` | css:1452-1453 |
| 布局 | `display:flex; align-items:center; gap:10px; padding:8px 16px` | css:1454-1457 |
| 底色 | `rgba(24,24,24,0.85)` + `backdrop-filter:blur(10px)`（毛玻璃悬浮） | css:1458-1460 |
| 阴影 | 常驻 `box-shadow:none`；**滚动后 `.is-scrolled` → `0 2px 10px rgba(0,0,0,0.45)`**；transition box-shadow 150ms | css:1461-1467 |
| light | 底色 `rgba(255,255,255,0.85)` | css:1468-1470 |

`is-scrolled` 由 JS 监听 `.vshell-page.scrollTop>0` 加类（js:3686-3692）。

### 3.2 左→右 DOM 顺序（js:3665-3675）
`brand → themeBtn → modeBtn → layoutBtn → center[home + searchBox] → tagBtn(角色) → watchBtn(待看) → favBtn(收藏) → blackBtn(黑名单) → localBtn(本地) → dlBtn(下载)`。
其中 `.vshell-nav-center` 绝对居中；`center + 第一个 nav-btn` 用 `margin-left:auto` 推右（css:1970-1972）。

### 3.3 各元素精确值
| 元素 | 值 | 行号 |
|---|---|---|
| .vshell-nav-home | 36×36 inline-flex 居中；radius 8px；foreground；过渡 120ms；hover `toolbar-hoverBackground` + scale(1.06)；codicon 18px line-height 1 | css:1471-1488 |
| .vshell-nav-brand | inline-flex gap 8px；font-weight 600；**14px**；padding-right 6px | css:1489-1496 |
| .vshell-nav-brand-dot | 10×10 radius 3px；`activityBarBadge-background(#0078D4)`；`box-shadow:0 0 8px 同色` | css:1497-1503 |
| .vshell-nav-brand-ver | 11px weight 400；descriptionForeground；opacity 0.8 | css:1504-1509 |
| .vshell-nav-center | `position:absolute; left:50%; translateX(-50%); display:flex; gap:8px` | css:1512-1519 |
| .vshell-nav-search | `position:relative; width:min(520px,44vw); height:30px; box-sizing:border-box; display:flex; align-items:center; gap:2px; background:input-background; border:1px solid input-border; border-radius:8px; padding:0 6px 0 3px; transition:width 160ms` | css:1520-1536 |
| .vshell-nav-search:hover | `background:#181818`（hover 变深） | css:1538-1540 |
| :not(:focus-within):has(.vshell-st-chip) | `background:#181818`（未展开有胶囊时同悬停） | css:1543-1545 |
| :focus-within | `border-color:input-border; box-shadow:none`（聚焦不变边框） | css:1547-1550 |

### 3.4 搜索胶囊编辑器（多输入框模型）
| 元素 | 值 | 行号 |
|---|---|---|
| .vshell-st-editor | `flex:1; min-width:0; height:30px; box-sizing:border-box; display:flex; align-items:center; gap:0; overflow-x:auto; scrollbar-width:none; background:transparent; border:none; outline:none; border-radius:0; padding:0 6px 0 0; box-shadow:none; cursor:text; white-space:nowrap`；::-webkit-scrollbar display none | css:1553-1572 |
| .vshell-st-input | `flex:none; width:1px（JS 按文本扩宽）; min-width:0; height:22px; padding:0; border:none; outline:none; background:transparent; font-size:12px; color:foreground; caret-color:foreground`；`.is-last` → `flex:1; width:auto; min-width:60px`；`:focus` 无高亮 | css:1575-1592,1634-1639 |
| .vshell-st-box | `flex:none; height:22px; inline-flex; align-items/justify-content:center; padding:0 2px; cursor:text; transition:padding 120ms`；`:first-child` padding 0，hover/focus 0 3px；通用 hover/focus-within 0 4px；`.is-last` flex:1 | css:1597-1631 |
| .vshell-st-chip | `position:relative; flex:none; inline-flex; gap:2px; height:22px; padding:0 8px; border-radius:6px; background:toolbar-hoverBackground; color:foreground; font-size:12px; line-height:1; user-select:none; cursor:default` | css:1645-1660 |
| .vshell-st-chip-name | `max-width:140px; overflow:hidden; text-overflow:ellipsis` | css:1661-1665 |
| .vshell-st-chip-del | 12×12 圆形；`position:absolute; top:-4px; right:-4px;` 1px sideBar-border；`background:input-background`；opacity 0（chip hover 显示）；hover → `background:errorForeground; border-color:transparent; color:#fff`；codicon 8px；`box-shadow:0 1px 2px rgba(0,0,0,0.35)`；z-2；`@media(hover:none)` 常显 | css:1672-1705 |
| .vshell-nav-search-btn | 20×20；radius 5px；transparent；input-foreground；hover toolbar-hoverBackground；codicon 12px | css:1707-1727 |

### 3.5 搜索浮层 .vshell-nav-popover（聚焦展开，覆盖原搜索框位置）
| 元素 | 值 | 行号 |
|---|---|---|
| .vshell-nav-popover | `position:absolute; top:-1px; left:-1px; right:-1px; padding:0 3px 3px; z-index:100; background:surface-background(#181818); border:1px solid sideBar-border; border-radius:8px(large); box-shadow:shadow-lg; display:flex; flex-direction:column; gap:6px; animation:vshell-pop-in 140ms` | css:1736-1751 |
| .vshell-nav-popover-head | flex gap 2px padding 0（含 editor+clear+divider+searchBtn） | css:1752-1759 |
| 浮层内 .vshell-nav-search | `position:static; width:100%; height:auto; background:transparent; border:none; border-radius:0; padding:0; box-shadow:none` | css:1762-1771 |
| .vshell-nav-popover-leaving | `animation:vshell-pop-out 140ms forwards`（淡出上移 4px） | css:1774-1780 |
| .vshell-nav-popover-body | `max-height:min(420px,60vh); overflow-y:auto` | css:1781-1784 |
| 浮层内 .vshell-nav-clear | 14×14 圆形；transparent；descriptionForeground；hover toolbar-hoverBackground + errorForeground；codicon 8px；margin-right 3px | css:1860-1879 |
| 浮层内 .vshell-nav-divider | `display:block; width:1px; height:16px; background:sideBar-border; margin:0 3px 0 0` | css:1886-1893 |
| 浮层内 search-btn | 20×20 radius 5px；margin 0 3px 0 0 | css:1897-1903 |
| .vshell-nav-tagpop | `position:static; border:none; box-shadow:none; padding:0; flex column; gap:8px`；sec+sec → `border-top:1px sideBar-border; padding-top:8px` | css:1788-1801 |
| .vshell-nav-tagpop-title | label2(11px) descriptionForeground | css:1807-1810 |
| .vshell-nav-tagpop-empty | 12px descriptionForeground line-height 1.5 | css:1811-1815 |
| .vshell-nav-tagpop-list | `flex wrap; gap:6px; max-height:180px; overflow-y:auto` | css:1816-1822 |
| .vshell-nav-tagpop-chip | `inline-flex; gap:3px; max-width:100%; height:26px; padding:0 10px 0 5px; border:1px solid sideBar-border; border-radius:6px; background:toolbar-hoverBackground; transition:bg/border-color 120ms`；hover `list-hoverBackground + focusBorder` | css:1823-1840 |
| .vshell-nav-tagpop-addicon | charts-blue(#59A4F9) 12px（+ 号） | css:1905-1909 |
| .vshell-nav-tagpop-chip-del | 18×18 圆形；hover toolbar-hoverBackground + errorForeground；codicon 12px | css:1910-1930 |
| .vshell-nav-tagpop-clear | 12px descriptionForeground；padding 2px 6px；radius 4px；hover 红 | css:1931-1944 |

### 3.6 导航按钮 .vshell-nav-btn（待看/收藏/角色/黑名单/本地/下载/主题/模式/布局）
| 属性 | 值 | 行号 |
|---|---|---|
| 基础 | `inline-flex; gap:6px; height:34px; padding:0 10px; border-radius:8px; color:foreground; font-size:13px; transition:background 120ms, color 120ms` | css:1948-1958 |
| :hover | `background:toolbar-hoverBackground` | css:1980-1982 |
| .vshell-nav-btn-text | 12px | css:1983-1985 |
| 组合间距 | `theme+mode`、`mode+layout` 之间 `margin-left:-6px`（组内收紧为 4px） | css:1976-1979 |
| 主题图标 | 自绘 16×16 SVG（暗=月亮 path / 亮=太阳 circle+8 射线），fill=currentColor | js:3597-3602 |

---

## 4. 视频卡片 .vsc-video-card（css:1994-2550；DOM js:4802-5117）

### 4.1 卡片容器
| 属性 | 值 | 行号 |
|---|---|---|
| 边框 | `1px solid sideBar-border` | css:1994-1995 |
| 圆角 | `8px`（cornerRadius-large） | css:1996 |
| 背景 | **#181818**（统一，is-watched 同 #181818） | css:1997-2012 |
| 阴影 | `--vscode-shadow-lg`（0 0 12px rgba(0,0,0,0.14)） | css:2000 |
| 布局 | `display:flex; flex-direction:column; overflow:hidden`；body flex:1 撑满 → meta 贴底 | css:2001-2006 |
| 入场动画 | `vshell-rise 0.32s cubic-bezier(0.2,0.8,0.3,1) both`，`delay:calc(var(--i)*22ms)`（i=卡片序号） | css:2007-2009 |
| .no-anim / 恢复态 | `animation:none`；`.vshell-outlet.is-restoring`/`.vshell-page.is-restoring` → `opacity:0; pointer-events:none` | css:2015-2037 |

### 4.2 媒体区 .vsc-video-media
| 属性 | 值 | 行号 |
|---|---|---|
| 基础 | `position:relative; display:block; width:100%; aspect-ratio:16/9; background:editor-background; text-decoration:none; color:inherit; border-bottom:1px solid sideBar-border` | css:2040-2050 |
| video | `position:absolute; inset:0; width/height:100%; object-fit:cover; background:#000`（封面态裁切无黑边）；`.is-previewing` → `object-fit:contain` | css:2054-2062 |
| 控件禁用 | `video::-webkit-media-controls*` display none !important | css:2439-2444 |

### 4.3 渐变遮罩 .vsc-video-shade（css:2066-2073）
`position:absolute; inset:0; background:linear-gradient(180deg, transparent 55%, editor-background); opacity:1; transition:opacity 120ms; pointer-events:none`；**media:hover → opacity:0**。

### 4.4 本地无封面占位 .vsc-video-placeholder（css:2077-2090）
`inset:0; flex center; background:linear-gradient(160deg,#2a2d2e,#181818); color:descriptionForeground; z-index:1; pointer-events:none`；codicon 34px opacity 0.55；`.is-local-nocover:hover` → 淡出。

### 4.5 时长徽章 .vsc-video-badge（css:2094-2104）
`position:absolute; right:4px; bottom:4px; color:badge-foreground(#F8F8F8); background:transparent; font-size:11px(label2); line-height:1.4; pointer-events:none`；hover 隐藏。

### 4.6 播放/弹幕数 .vsc-video-stats（css:2108-2121）
`left:4px; bottom:4px; inline-flex gap:3px; badge-foreground; 11px; line-height:1.4`；codicon 12px；分隔符 opacity 0.7；hover 隐藏。

### 4.7 封面布局变体（.vshell-wall.is-cover / .vshell-role-marquee，css:2125-2217）
| 元素 | 值 |
|---|---|
| .vsc-video-body | `display:none`（无文字区） |
| .vsc-video-title-cover | `position:absolute; top/left/right:0; z-index:2; margin:0; padding:10px 10px 20px; background:linear-gradient(180deg,rgba(0,0,0,0.8),rgba(0,0,0,0.4),transparent); color:#fff; font-size:13px; font-weight:600; line-height:1.35; -webkit-line-clamp:2; overflow:hidden; pointer-events:none; transition:opacity 120ms; text-shadow:0 1px 3px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.45)` |
| hover | 标题淡出（预览播放画面干净） |
| 有 tag 图时 | `padding-left:54px` 让位 |
| 标题高亮关键词 .vsc-video-title-tag（cover） | 去框：transparent bg、无 border/shadow/padding；`color:charts-blue(#59A4F9)` |
| media::after（底部渐变条） | `left/right/bottom:0; height:44px; background:linear-gradient(0deg,rgba(0,0,0,0.55),transparent); z-index:1; pointer-events:none; transition:opacity 120ms`；hover 淡出 |
| .vsc-video-progress（cover） | `z-index:2` |
| .vsc-video-cover-right | `position:absolute; right:4px; bottom:4px; flex; gap:6px; z-index:1`（[日期][时长]） |
| .vsc-video-cover-date | badge-foreground 11px line-height 1.4 |
| cover 下 .vsc-video-badge | `position:static`（回流到 rightBox） |
| hover | badge+cover-date 淡出（让位静音钮）；actions/saved-marks/tag-icons `z-index:3` |

### 4.8 状态点 .vsc-video-saved-marks（css:2223-2251）
- 容器：`position:absolute; top:8px; right:8px; display:grid; grid-template-columns/rows:repeat(3,6px); gap:3px; z-index:2; pointer-events:none; transition:opacity 120ms`；hover 隐藏。
- 圆点 .vsc-video-saved-mark：6×6 radius 50%；`box-shadow:0 1px 3px rgba(0,0,0,0.5), shadow-lg`。
- 颜色：`.is-watch` 蓝 `charts-blue #59A4F9`；`.is-fav` 红 `errorForeground #F85149`；`.is-local` 绿 `terminal-ansiGreen #89d185`；`.is-featured-mark` 金 `#ffcc00`；`.is-hidden` display none。
- **3×3 网格位置映射**（JS 按可见点顺序填充，js:4921）：`1=[1,3]右上 2=[1,2]中上 3=[2,3]中右 4=[2,2]中中 5=[1,1]左上 6=[2,1]左中 7=[3,3]右下 8=[3,2]下中 9=[3,1]左下`；显示顺序：本地→收藏→代表作→待看。

### 4.9 tag 角标 .vsc-video-tag-icons / .vsc-video-tag-icon（css:2256-2320）
- 容器：`top:8px; left:8px; flex; gap:4px; z-index:2; pointer-events:none`；hover 隐藏。
- 图标：**40×40** radius 8px；`overflow:hidden; flex center; background:rgba(0,0,0,0.45); border:1px solid rgba(255,255,255,0.25); box-shadow:0 1px 4px rgba(0,0,0,0.4), shadow-lg; pointer-events:none`。
- `.is-letter`（无图）：`background:#fff; border-color:rgba(255,255,255,0.9)`；字 `.vsc-video-tag-letter` 15px weight 600 color **#181818**。
- `.is-conflict`（可点 button）：`cursor:pointer; color:errorForeground; font-size:20px; border:1px solid rgba(248,81,73,0.45); background:#181818`（light：#fff，css:4501-4511）；hover 时 `pointer-events:none`（防挡收藏按钮）。
- img：100% cover。

### 4.10 悬停操作层 .vsc-video-actions（css:2323-2366）
| 元素 | 值 |
|---|---|
| 容器 | `position:absolute; inset:0; opacity:0; transform:translateY(-4px); transition:opacity 120ms, transform 120ms; pointer-events:none`；**media:hover → opacity 1 + transform none**，子按钮 pointer-events auto |
| .vsc-video-btn-watch | `position:absolute; top:4px; right:4px`（待看右上） |
| .vsc-video-btn-star | `position:absolute; top:4px; left:4px`（收藏左上） |
| .vsc-video-btn-feature | `top:4px; left:40px`（4+36，代表作） |
| .vsc-video-btn | **28×28**；radius 4px(small)；`background:toolbar-hoverBackground; color:button-foreground`；hover `toolbar-activeBackground`；codicon 16px；`:focus-visible` outline 1px focusBorder offset 1px |
| watch is-active | `background:button-background(#0078D4)`；hover button-hoverBackground |
| star is-active | `background:errorForeground(#F85149)`；hover `terminal-ansiRed(#cd3131)` |
| feature is-active | `background:button-background`；hover button-hoverBackground |

图标：待看 `codicon-add`/激活 `codicon-check`；收藏 `codicon-heart`/激活 `codicon-heart-filled`（js:4846-4859）。

### 4.11 静音钮 .vsc-video-mute / 黑名单钮 .vsc-video-blacklist（css:2372-2418）
同规格：28×28；radius 4px；`background:toolbar-hoverBackground; color:foreground`；`opacity:0; transform:translateY(4px); transition:opacity 120ms, transform 120ms, bottom 120ms; z-index:3`；media:hover → 显示；`.is-previewing` → `bottom:6px`（4+2）。位置：mute 右下 `right:4px; bottom:4px`；blacklist 左下 `left:4px; bottom:4px`（hover 变红 errorForeground）。codicon 16px。触屏 `(hover:none)` 隐藏两者（css:2543-2550）。

### 4.12 卡片进度条 .vsc-video-progress（css:2421-2435）
`position:absolute; left/right/bottom:0; height:2px; background:rgba(255,255,255,0.28); opacity:0; transition:opacity 120ms; pointer-events:none`；`.is-previewing` → opacity 1；fill：`height:100%; width:0%; background:kk-progress-color(#0078D4); transition:width 120ms linear`。

### 4.13 文字区 .vsc-video-body / 标题 / meta（css:2447-2534）
| 元素 | 值 |
|---|---|
| .vsc-video-body | `padding:6px 8px 8px; flex:1; flex column` |
| .vsc-video-title | `margin:0; flex:1; min-height:3.6em; max-height:3.6em; overflow:hidden; color:surface-foreground; font-size:13px; font-weight:600; line-height:1.8; display:block`（两行截断：1.8×2=3.6em） |
| .vsc-video-title-tag（standard） | `color:inherit; border:1px solid #484848; border-radius:8px; background:#1c1c1c; box-shadow:0 0 4px 0 #272727; padding:2px 6px; line-height:1; margin:0 3px`（写死值不走 token） |
| .vsc-video-meta | `margin-top:4px; flex space-between; gap:2px; font-size:11px; color:descriptionForeground; min-height:16px`；`.no-owner` → `justify-content:flex-end` |
| .vsc-video-meta-owner | `inline-flex gap:4px; min-width:0; overflow:hidden; cursor:pointer; border-radius:4px; padding:0`；hover `color:foreground`（无下划线）；`.is-conflict` → `color:errorForeground; font-weight:600`（红字「冲突」）；codicon(account) 12px |
| .vsc-video-meta-owner-name | ellipsis nowrap |
| .vsc-video-meta-date | `flex:none; margin-left:auto` |

### 4.14 视频墙 .vshell-wall（css:2553-2571）
`display:grid; grid-template-columns:repeat(auto-fill,minmax(400px,1fr)); gap:6px; padding:0 0 8px`。
（400px 下限：1440 屏 3 列 ~466px；1920 屏 4 列 ~468px；1280 屏 3 列 ~413px）
`.vshell-wall-sentinel`: 2px（无限滚动哨兵）；`.vshell-wall-loading`: flex center gap 10 padding 20px 0 descriptionForeground。

### 4.15 reduced-motion / hover:none（css:2537-2550）
- `prefers-reduced-motion:reduce` → shade/actions/mute/blacklist/badge/stats/progress `transition:none`。
- `hover:none` → actions 常显（opacity 1 + 按钮可点）；mute/blacklist `display:none`。

---

## 5. 播放器 .vshell-player / KKAV（css:2574-2980；DOM js:5485-5700）

### 5.1 容器与视频
| 元素 | 值 | 行号 |
|---|---|---|
| .vshell-player | `position:relative; width:100%; aspect-ratio:16/9; background:#000; overflow:hidden; border-radius:10px; isolation:isolate` | css:2574-2582 |
| .vshell-player-video | `position:absolute; inset:0; width/height:100%; object-fit:contain; background:#000`（poster 兜底：root backgroundImage contain center） | css:2583-2590 |
| 全屏 | `.vshell-player-fullscreen` → `border-radius:0`（无动画） | css:2974-2976 |

### 5.2 中央播放按钮 .vshell-player-center（css:2591-2616）
`position:absolute; left/top:50%; translate(-50%,-50%) scale(0.92); width/height:60px; border-radius:50%; background:rgba(0,0,0,0.55); color:#fff; font-size:26px; opacity:0; pointer-events:none; transition:opacity 200ms, transform 200ms, background 120ms`。
`.vshell-player-center-show` → opacity 1 + scale(1) + 可点；hover `rgba(0,0,0,0.75)`。`.vshell-player-muted` → 隐藏。

### 5.3 控制栏 .vshell-player-controls（css:2617-2654）
| 属性 | 值 |
|---|---|
| 布局 | `position:absolute; left/right/bottom:0; flex; gap:8px; padding:10px 12px 12px`（底部留白 12px） |
| 背景 | `linear-gradient(180deg, transparent, rgba(0,0,0,0.72))` |
| 常态 | `opacity:0; translateY(8px); pointer-events:none; transition:opacity 200ms, transform 200ms` |
| `.vshell-player-controls-visible` | opacity 1 + none + auto |
| **peek 模式**（非 visible 时） | 容器 `opacity:1; translateY(8px); background:transparent`；直接子控件各 `opacity:0; pointer-events:none; transition:opacity 120ms`；`.is-peeked` 唯一显示（JS mousemove 命中坐标） |
| 自动隐藏节奏 | mutedAutoplay 0.7s（js:6589 UI_HIDE_MS） |

### 5.4 控制按钮 .vshell-player-btn（css:2655-2670）
`width/height:30px; inline-flex center; color:#fff; font-size:15px; border-radius:6px; transition:background 120ms, transform 120ms`；hover `rgba(255,255,255,0.18)` + `scale(1.08)`。
倍速 `.vshell-player-rate`：`font-size:10px; width:auto; padding:0 6px`（css:2672-2676）。

### 5.5 时间显示 .vshell-player-time（css:2924-2931）
`color:#fff; font-size:12px; font-variant-numeric:tabular-nums; min-width:96px; text-align:center; margin-right:auto`（播放钮+时间靠左，其余靠右）。

### 5.6 音量条 .vshell-player-vol（css:2932-2958）
容器 `width:64px; height:14px; position:relative; cursor:pointer`；轨道 ::before：`left/right:0; top:50% translateY(-50%); height:4px; radius:2px; background:rgba(255,255,255,0.25)`；填充 .vshell-player-vol-fill：`left:0; 居中; height:4px; radius:2px; background:#fff; width:80%`。

### 5.7 加载层 .vshell-player-loading（css:2959-2972）
`position:absolute; inset:0; display:none; flex center; background:rgba(0,0,0,0.35); pointer-events:none`；`.vshell-player-buffering` → `display:flex`。

### 5.8 主进度条 .vshell-player-bar（KKAV 风格，css:2721-2802）
| 元素 | 值 |
|---|---|
| .vshell-player-bar | `position:absolute; left/right/bottom:0; height:19px`（命中区=14px 视觉+上方 5px 扩展）；`cursor:pointer; touch-action:none; opacity:1`（**永不隐藏**，独立于 controls） |
| ::before（轨道） | `left/right/bottom:0; height:4px; radius:2px; background:rgba(255,255,255,0.38); box-shadow:0 0 3px rgba(0,0,0,0.6); transition:height 120ms`；bar:hover → `height:8px` |
| .vshell-player-bar-buffer | `left:0; bottom:0; height:4px; radius:2px; background:rgba(255,255,255,0.35); width:0`；hover 8px |
| .vshell-player-bar-fill | `left:0; bottom:0; height:4px; radius:2px; background:kk-progress-color(#0078D4); box-shadow:0 0 6px 同色; width:0; transition:height 120ms, width 450ms linear`（KKAV 松手 0.45s 平滑）；hover 8px |
| 拖动/seek | `.vshell-player-bar-dragging` / `.seeking` 时 fill 与 ::before `transition:none`（即时跟手） |

**JS 拖动逻辑**（js:5553-5593）：pointerdown 加 dragging + setPointerCapture + 立即 seek；pointermove 跟手；pointerup 加 seeking（等待 seeked，700ms settle 定时器移除）；seeked 时同步 fill 再移除。

### 5.9 Seek 预览浮层 .vshell-player-seekprev（css:2774-2802）
| 元素 | 值 |
|---|---|
| 容器 | `position:absolute; bottom:22px; width:160px; padding:4px; border-radius:8px; background:rgba(0,0,0,0.82); border:1px solid panel-border; box-shadow:0 4px 16px rgba(0,0,0,0.5); display:none; pointer-events:none; z-index:8`；`.is-on` → block |
| canvas | **152×86**（160-8 padding）radius 4px background #000；**canvas 源 160×90**（js:5610） |
| 时间戳 .vshell-player-seekprev-time | `display:block; text-align:center; margin-top:3px; font-size:11px; tabular-nums; color:#fff` |
| 定位 | JS 水平跟随指针居中、clamp 在进度条可视区（js:5665-5675）；预览画面用独立隐藏 video（left:-9999px 160×90 opacity 0）截帧（js:5625-5653） |

### 5.10 分镜分段进度条（有节点时，css:2810-2863）
- `.vshell-bar-segmented` → ::before/buffer/fill `display:none`；`.vshell-player-bar-segs` 接管：`absolute; left/right/bottom:0; height:4px; pointer-events:none`。
- 段 `.vshell-player-bar-seg`：`absolute; bottom:0; height:19px; pointer-events:auto`（命中区）；内 track/buffer/fill 三层 `left:0; bottom:0; height:4px; radius:2px; transition:height 120ms`。
- 段 hover（或 `.is-hovered`）→ 三层 `height:8px`（只当前段变宽）。
- track `rgba(255,255,255,0.2)`；buffer `rgba(255,255,255,0.35)`；fill `kk-progress-color + 0 0 6px glow`、`transition:width 450ms linear`。
- 拖动/seek 期 fill `transition:none`。

### 5.11 分镜节点 .vshell-player-bar-nodes / -node（css:2869-2885）
节点容器 `inset:0; pointer-events:none`；节点 span：`absolute; top/bottom:0; width:6px; translateX(-50%); background:transparent; pointer-events:auto`（仅 hover title 命中区；节点视觉由 SVG mask 挖空轨道实现——透过见视频内容）。

### 5.12 快扫窗口 .vshell-scan-window（css:2898-2918）
`position:absolute; right:12px; bottom:64px; width:48px; height:27px; opacity:0.1; overflow:hidden; pointer-events:none; z-index:6; border-radius:0; background:#000`（肉眼不可见但保渲染管线，Chromium 判定可见才出帧）。

### 5.13 分镜间隔滑块 .vshell-player-gap（css:2680-2710）
`.vshell-player-gap` flex gap 6；gap-btn `font-size:11px; min-width:34px; padding:0 5px`（显示当前值，点击恢复 1.2s）；gap-bar `width:96px; height:4px; radius:2px; rgba(255,255,255,0.2); cursor:pointer; touch-action:none`（13 档 0.1s~10min）；gap-fill `left:0; width:24%; kk-progress-color`。`max-width:768px` 隐藏。

---

## 6. 抖音刷视图 .vshell-feed（css:2985-3293；DOM js:6525-6700）

### 6.1 容器
| 元素 | 值 |
|---|---|
| .vshell-feed | `height:calc(100vh-53px); height:calc(100dvh-53px); overflow-y:auto; scroll-snap-type:y mandatory; scroll-behavior:smooth; background:#000; overscroll-behavior:contain; scrollbar-width:none` |
| :fullscreen / .is-feed-fullscreen-sim | `width/height:100vw/vh; background:#000`；sim 版 `position:fixed; inset:0; z-index:9999` |
| .vshell-feed-slide | `position:relative; height:100%; scroll-snap-align:start; scroll-snap-stop:always; flex center; overflow:hidden` |
| .vshell-feed-media | `absolute; inset:0; flex center` |
| .vshell-feed-poster | `100%; object-fit:cover; opacity:0.55; transition:opacity 200ms` |
| 内嵌播放器 | `.vshell-feed .vshell-player` → `absolute; inset:0; width/height:100%; aspect-ratio:auto; border-radius:0` |

### 6.2 信息区 .vshell-feed-info（左上渐变）
`absolute; left/right:0; top:0; padding:14px 16px 44px; background:linear-gradient(0deg, transparent, rgba(0,0,0,0.78)); color:#fff; pointer-events:none; transition:opacity 200ms`。全屏时 `transform:scale(1.5); transform-origin:top left`（左上角放大 1.5x，css:2998-3006）。
子结构：`.vshell-feed-head`（`flex; gap:10px; max-width:calc(100%-110px)`）> `.vshell-feed-avatar` + `.vshell-feed-head-text`（`.vshell-feed-title-row`(title+copy) + `.vshell-feed-meta`(meta-name+follow)）。

| 元素 | 值 |
|---|---|
| .vshell-feed-avatar | 36×36 radius 50%；`border:1px solid dropdown-border(#3C3C3C); box-shadow:0 1px 4px rgba(0,0,0,0.5); background:rgba(255,255,255,0.16); color:rgba(255,255,255,0.92); font-size:18px; flex center; pointer-events:auto`；light 边框 rgba(0,0,0,0.35)；`.is-conflict` → errorForeground icon + 边框 rgba(248,81,73,0.45) + 底 #181818；`.is-add` → 1px dashed sideBar-border + hover focusBorder；`.vshell-feed-avatar-letter` 白底 #181818 字 15px 600 |
| .vshell-feed-title | `flex:none; max-width:calc(100%-28px); font-size:14px; font-weight:600; line-height:1.4; text-shadow:0 1px 3px rgba(0,0,0,0.6); ellipsis nowrap` |
| .vshell-feed-copy | 22×22 radius 5px；`color:rgba(255,255,255,0.85); pointer-events:auto`；hover rgba(255,255,255,0.16)；codicon 13px；`.is-copied` → `color:#4ec9b0` + `vshell-pop 300ms` |
| .vshell-feed-meta | `flex; gap:4px; font-size:12px; color:rgba(255,255,255,0.8); margin-top:2px`；`.is-conflict` → errorForeground |
| .vshell-feed-meta-name（按钮） | `max-width:180px; ellipsis; cursor:pointer; pointer-events:auto; transition:color 120ms`；hover `color:textLink(#4daafc)`（无下划线） |
| .vshell-feed-follow | 18×18 radius 50%；`background:rgba(0,0,0,0.45); color:rgba(255,255,255,0.85); pointer-events:auto`；hover rgba(0,0,0,0.72)；codicon 11px；`.is-popping .codicon` → `vshell-follow-in 180ms`（fade+2px 上浮，不加蓝底）；`.is-followed` → color #fff |

### 6.3 右侧动作列 .vshell-feed-actions（css:3229-3293）
`position:absolute; right:10px; bottom:60px; flex column; gap:16px; z-index:3; transition:opacity 200ms`。
`.vshell-feed.is-ui-hidden` → info/actions `opacity:0; pointer-events:none`；`.is-peeked` 恢复（鼠标静止 0.7s 隐藏，js:6589-6636）。

| 元素 | 值 |
|---|---|
| .vshell-feed-action | `flex column; align-items:center; gap:4px; width:52px; color:#fff` |
| .codicon（圆钮） | **44×44** radius 50%；`background:rgba(0,0,0,0.45); font-size:20px; backdrop-filter:blur(4px); transition:transform 140ms, background 140ms`；hover `scale(1.1)` + rgba(0,0,0,0.65) |
| label | 11px；`text-shadow:0 1px 2px rgba(0,0,0,0.7)` |
| 激活色 | `.is-active-watch` → charts-blue(#59A4F9)；`.is-active-fav` → errorForeground；`.is-active-black` → charts-orange(#EA5C00)（icon+label 同色） |

四按钮：详情(codicon-arrow-right) / 待看(codicon-bookmark) / 收藏(codicon-heart) / 黑名单(codicon-circle-slash)（js:6531-6557）。

---

## 7. 悬浮胶囊 / toast / 弹窗

### 7.1 下载悬浮胶囊 .vshell-fab（css:3296-3473）
| 元素 | 值 |
|---|---|
| .vshell-fab | `position:fixed; right:20px; bottom:20px; z-index:80; flex column; align-items:flex-end; gap:10px; animation:vshell-fab-in 0.28s cubic-bezier(0.2,0.8,0.3,1.1)` |
| .vshell-fab-capsule | `flex; gap:8px; height:44px; padding:0 14px; border-radius:22px; background:editorWidget-background(#202020); border:1px solid widget-border; box-shadow:0 6px 24px rgba(0,0,0,0.35); transition:transform 140ms, box-shadow 140ms`；hover `translateY(-2px)` + `0 10px 30px rgba(0,0,0,0.45)` |
| .vshell-fab-icon | 17px charts-blue |
| .vshell-fab-count | 12px 600 min-width 18px center；badge 色；radius 9px padding 1px 6px |
| .vshell-fab-bar / -fill | 60×4 radius 2 list-hoverBackground；fill progressBar-background `transition:width 300ms` |
| .vshell-fab-drawer | `width:320px; max-height:62vh; flex column; background:editorWidget-background; border:1px solid widget-border; border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,0.45); animation:vshell-pop 0.18s` |
| drawer-head | `padding:10px 12px; border-bottom:1px solid panel-border`；title 13px 600；close 26×26 radius 6 hover toolbar-hoverBackground |
| drawer-list | `padding:6px; flex column; gap:4px; overflow-y:auto` |
| .vshell-fab-row | `flex; gap:10px; padding:8px; border-radius:8px; cursor:pointer; transition:background 120ms`；hover list-hoverBackground |
| row-thumb | 56×36 radius 4px cover |
| row-title | 12px ellipsis nowrap |
| row-bar / -fill | 4px radius 2；fill progressBar-background 300ms |
| row-meta | `flex space-between; font-size:11px; descriptionForeground` |
| drawer-foot | `padding:10px 12px; border-top:1px solid panel-border; gap:8px` |
| .vshell-fab-drawer-btn | `flex:1; height:30px; radius:6px; font-size:12px; background:list-hoverBackground`；hover `list-activeSelectionBackground/Foreground` |
| 任务状态色 | downloading=charts-blue · merging=progressBar-background · paused/canceled=descriptionForeground · failed=errorForeground · done=foreground（css:3476-3493） |

### 7.2 Toast（css:3495-3533）
| 元素 | 值 |
|---|---|
| .vshell-toast-host | `position:fixed; right:20px; bottom:76px; z-index:90; flex column; gap:8px; align-items:flex-end; pointer-events:none` |
| .vshell-toast | `max-width:320px; padding:10px 14px; border-radius:8px; background:editorWidget-background; border:1px solid widget-border; border-left:3px solid progressBar-background; box-shadow:0 6px 20px rgba(0,0,0,0.35); font-size:13px; opacity:0; transform:translateX(24px); transition:opacity 220ms, transform 220ms` |
| .vshell-toast-in | opacity 1 + none（右滑入） |
| .vshell-toast-out | opacity 0 + translateY(6px) |
| 变体 | `.vshell-toast-error` border-left errorForeground；`.vshell-toast-ok` border-left charts-blue |
| 时序 | 显示 2400ms 后移除（js:2973-2977） |

### 7.3 通用弹窗 .vshell-modal（css:3535-3601）
| 元素 | 值 |
|---|---|
| .vshell-modal-backdrop | `position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.5); flex center; padding:20px; animation:vshell-fade 0.15s` |
| .vshell-modal | `width:420px; max-width:100%; background:editorWidget-background; border:1px solid widget-border; border-radius:12px; box-shadow:0 16px 50px rgba(0,0,0,0.5); padding:18px; animation:vshell-pop 0.18s; flex column; gap:12px` |
| .vshell-modal-title | 15px 600 |
| .vshell-modal-sub | 12px descriptionForeground |
| .vshell-modal-opts | flex column gap 8 |
| .vshell-radio | `flex; gap:8px; padding:8px 10px; border:1px solid panel-border; border-radius:8px; cursor:pointer; transition:border-color 140ms, background 140ms`；`.is-checked` → `border-color:focusBorder; background:list-hoverBackground`；input `accent-color:focusBorder` |
| .vshell-modal-foot | `flex; justify-content:flex-end; gap:10px` |

### 7.4 标签管理面板 .vshell-tag-modal（Fluent Dialog 480px，css:3603-3742）
| 元素 | 值 |
|---|---|
| 宽度 | **480px** |
| .vshell-tag-input-row | `flex; gap:8px; margin-bottom:12px` |
| .vshell-tag-input | `flex:1; height:32px; box-sizing:border-box; padding:0 10px; border:1px solid input-border; radius:6px; background:input-background; color:input-foreground; font-size:13px; outline:none`；:focus focusBorder + 1px ring |
| .vshell-tag-add | 32×32 radius 6px font 15（+ 号，与输入框等高） |
| .vshell-tag-list | `flex column; gap:2px; max-height:264px; overflow-y:auto` |
| .vshell-tag-row | **48px 高**；`flex; gap:10px; padding:0 10px; border-radius:6px; cursor:pointer; transition:background 120ms`；hover list-hoverBackground；`.is-selected` → list-activeSelectionBackground/Foreground |
| row-name | 13px ellipsis flex 1 |
| row-actions | `gap:2px; opacity:0`；hover/is-selected → opacity 1 |
| .vshell-tag-img-btn / .vshell-tag-row-del | 28×28 radius 4px 13px；del hover errorForeground |
| .vshell-tag-thumb | 32×32 radius 6px；toolbar-hoverBackground；`.is-letter` 白底；img cover |
| .vshell-tag-foot | `flex; gap:12px; margin-top:14px`（按钮行） |
| .vshell-tag-foot-hint | 12px descriptionForeground flex 1 |

### 7.5 头像裁剪 .vshell-tag-crop（css:3743-3826）
- box 380px；viewport **320×320** margin 12 auto 0；bg #000；radius 8px；`cursor:grab; touch-action:none; user-select:none`。
- 裁剪矩形 **140×140**（居中）；`border:1px solid rgba(255,255,255,0.9); box-shadow:0 0 0 9999px rgba(0,0,0,0.55)`（矩形外压暗）；z-2。
- zoom 行：± 按钮 32×32；填充色选择 swatch 12×12 radius 3（白/黑）。

### 7.6 背景中心点选择 .vshell-bannerpick（css:3828-3888）
- box **680px**；vp **640×360**；bg #000；radius 6px(medium)；1px panel-border；`cursor:crosshair`；margin 12 auto 0。
- 十字准星 44×44（translate(-50%,-50%)）：两条 2px 白线 `rgba(255,255,255,0.95)` + `box-shadow:0 0 3px rgba(0,0,0,0.8)`；中心圆点 8×8 白底 `border:2px solid rgba(0,0,0,0.7)`。

### 7.7 空态 / 骨架（css:3890-3927）
- .vshell-empty：`flex column center; gap:12px; padding:60px 20px; color:descriptionForeground; grid-column:1/-1`；icon 42px opacity 0.55；text 14px。
- .vshell-skeleton-block：list-hoverBackground radius 10px `vshell-pulse 1.3s`；player 16/9；line 14px radius 6px。

---

## 8. 角色系统（css:3929-4740）

### 8.1 角色管理面板 .vshell-char-panel（两栏，640px）
| 元素 | 值 |
|---|---|
| 容器 | `width:640px`（复用 .vshell-modal 基础） |
| .vshell-char-head | `flex; gap:8px; padding:12px 16px; border-bottom:1px solid sideBar-border`；codicon 15px descriptionForeground；title body1(13px) 600；close 28×28 radius 4px hover toolbar-activeBackground |
| .vshell-char-body | `flex; min-height:320px; max-height:62vh` |
| .vshell-char-side | **220px** 固定；`border-right:1px solid sideBar-border; padding:8px; flex column; gap:6px` |
| .vshell-char-row | `flex; gap:8px; height:44px; padding:0 8px; border-radius:4px; cursor:pointer; border:1px solid transparent; transition:bg/border 120ms`；hover list-hoverBackground；`.is-selected` list-activeSelectionBackground/Foreground；thumb 30×30 |
| .vshell-char-kwcount | label2 11px；badge 色；radius 10px padding 1px 8px |
| .vshell-char-row-del | 10×10 radius 4px；descriptionForeground；hover errorForeground + toolbar-activeBackground；**codicon-close 10px**（常驻显示，不悬停） |
| .vshell-char-main | `flex:1; padding:16px; flex column; gap:14px; overflow-y:auto` |
| .vshell-char-detail-idrow | `relative; flex; gap:12px; min-height:88px; padding:14px 16px; border-radius:8px; border:1px solid panel-border; background:editor-background; background-size:cover; background-position:center`（背景图直接作行底） |
| .vshell-char-banner-set | 24×24 右上角；`rgba(0,0,0,0.45); radius:6px; color:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.4)`；hover rgba(0,0,0,0.65)；codicon 13px |
| .vshell-char-dname | 15px 600 foreground；ellipsis；z-1；has-bg → #fff + `text-shadow:0 1px 4px rgba(0,0,0,0.6)` |
| .vshell-char-bigthumb（wrap） | 64×64 radius 8px；hover img `filter:brightness(0.6)` + 浮现编辑遮罩 `rgba(0,0,0,0.45)`；`.is-letter` 1px sideBar-border + 28px 字 |
| .vshell-char-sec | `border-top:1px solid sideBar-border; padding-top:12px`；sec-title label2(11px) descriptionForeground margin-bottom 8 |
| .vshell-char-kwchip | `height:24px; padding:0 10px; border-radius:8px; background:toolbar-hoverBackground; font-size:12px;`；`.is-fixed` opacity 0.72；悬停显示删除钮（复用 st-chip-del） |
| .vshell-char-kwadd | `margin-top:8px; gap:6px`；input 28px；add 28×28 |
| .vshell-char-actions | `margin-top:auto; padding-top:8px; gap:8px` |
| .vshell-char-btn | `height:32px; padding:0 14px; border-radius:4px; font-size:13px; gap:6px; transition:bg 120ms, filter 120ms`；codicon 14px |
| -pri | button-background/Foreground；hover button-hoverBackground |
| -img | `border:1px solid input-border; transparent`；hover toolbar-activeBackground |
| -del | `border:1px solid transparent; color:errorForeground`；hover `rgba(248,81,73,0.12)` |

### 8.2 角色选择弹窗 .vshell-char-picker（Fluent Dialog 重设计）
| 元素 | 值 |
|---|---|
| .vshell-picker-backdrop | `backdrop-filter:blur(3px)`（Smoke 遮罩 blur，fallback rgba(0,0,0,0.5)） |
| .vshell-char-picker | `border-radius:8px(OverlayCornerRadius); padding:20px` |
| title | 16px 600 line-height 1.3 |
| 完成按钮 | `.vshell-tag-foot .vshell-btn-primary { margin-left:auto }`（推右下角） |
| 列表（两列长条） | `.vshell-char-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; max-height:420px; overflow-y:auto }` |
| 长条 .vshell-tag-row | `height:56px; gap:10px; padding:0 12px; border-radius:8px; border:1px solid panel-border; box-sizing:border-box; relative; overflow:hidden`（背景图 JS 内联） |
| 名字 | `#fff; font-weight:600; text-shadow:0 1px 3px rgba(0,0,0,0.85)` |
| 头像 thumb | **36×36 radius 50%** font 15px；`box-shadow:0 1px 4px rgba(0,0,0,0.5)` |
| **选中** | `.is-current` 背景 transparent + `::after` ✓ 徽章：`top/right:6px; 18×18; radius:50%; background:list-activeSelectionBackground(#04395E) + SVG polyline 对勾`（butt 线帽 miter 连接，stroke #fff 2.2，background-size 12×12）——**不改变框线颜色** |
| **冲突** | `box-shadow:inset 3px 0 0 errorForeground, inset 0 0 0 999px rgba(248,81,73,0.16)`（红竖条+红 tint 蒙层）+ 红字 |
| 冲突+选中同显 | 蓝底 ✓ 徽章 + 红竖条 + 红字（tint 降到 0.12） |
| hover | 普通：`border-color:focusBorder; box-shadow:inset 0 0 0 999px rgba(255,255,255,0.08)`；冲突：红框 + 0.32 tint；选中：`border-color:panel-border; box-shadow:none` |
| .vshell-tag-follow | 26×26 radius 50%；`rgba(0,0,0,0.45); color:#fff`；hover rgba(0,0,0,0.72)；codicon 13px；`.is-popping .codicon` vshell-follow-in 180ms；`.is-followed` → #fff（背景不变） |
| .vshell-tag-followed-dot | 6×6 radius 50%；errorForeground；`box-shadow:0 0 0 1px rgba(0,0,0,0.35)`；`.is-on` 显示（已关注红点） |
| .vshell-modal-title-row | `flex space-between; gap:8px; margin-bottom:10px` |
| .vshell-char-manage | 12px padding 3px 10px（右上「打开角色管理」） |

### 8.3 本地视频面板 .vshell-local-panel（css:4549-4643）
- 宽 **520px**；drop 区：`padding:22px 12px; border:1px dashed sideBar-border; radius:6px; descriptionForeground 13px; cursor:pointer`；hover/.is-dragover → `focusBorder + toolbar-hoverBackground + foreground`；codicon 18px。
- list：`max-height:320px; gap:6px`；row：`padding:6px 8px; radius:6px`；hover list-hoverBackground；thumb 64×36 radius 6（无图 codicon-file-media 16px）；title 13px；sub 11px descriptionForeground；del 24×24。

### 8.4 视频嗅探面板 .vshell-sniffer-panel（css:4646-4740）
- 宽 **560px**；`max-width:calc(100vw-48px); max-height:70vh; flex column`。
- 顶部：title-row + rescan（`margin-left:auto; padding:3px 10px; 12px`）。
- URL 直链行：input `height:30px; 12px; padding:0 8px` + 下载按钮 `padding:3px 12px; min-width:56px; 12px`。
- 行 .vshell-sniff-row：`padding:8px 10px; radius:6px; border:1px solid panel-border; background:editor-background`；icon 18px descriptionForeground；title 13px；meta 11px；下载按钮 `min-width:64px`；`:disabled` opacity 0.55 not-allowed。

---

## 9. 页面布局（pages 段，css:4742-5666）

### 9.1 全局骨架
| 元素 | 值 | 行号 |
|---|---|---|
| .vshell-outlet | `flex:1; width:100%; padding:56px 0 0; box-sizing:border-box`（顶 56px 让位悬浮导航）；`:has(.vshell-page-detail)` → padding-bottom 0 | css:4745-4757 |
| .vshell-page | `animation:vshell-page-in 0.22s; padding:0 20px 60px; box-sizing:border-box; overflow-anchor:none; height:calc(100dvh-56px); overflow-y:auto; scrollbar-width:auto; margin-right:2px`（容器内滚动） | css:4758-4777 |
| .vshell-page-home | `padding-left/right:10%`（窄屏 responsive 回收） | css:4780-4783 |
| .vshell-page-head | `flex; gap:10px; padding:18px 0 12px` | css:4784-4789 |
| .vshell-page-title | 18px 600 margin 0 | css:4790-4794 |
| .vshell-page-sub | label2 11px descriptionForeground margin-left 4 | css:4795-4799 |
| .vshell-wall-host | `margin-top:0; padding-top:3px` | css:4802-4806 |

### 9.2 主页
1. `.vshell-sections`（分类导航卡片）：`background:surface-background; border:1px solid sideBar-border; border-radius:8px; box-shadow:shadow-lg; padding:16px; margin:3px 0 3px`（css:4864-4871）。
2. `.vshell-sections-grid`：`grid; repeat(auto-fill,minmax(112px,1fr)); gap:8px`（css:4872-4876）。
3. `.vshell-section-chip`：`inline-flex center; gap:6px; width:100%; height:34px; padding:8px 10px; border-radius:4px; font-size:13px; color:foreground; border:1px solid transparent; nowrap ellipsis; transition:bg 120ms, color 120ms`；hover `list-hoverBackground` + icon 提亮；codicon 13px descriptionForeground（css:4877-4904）。
4. `.vshell-wall`（见 4.14）+ 无限滚动哨兵。

### 9.3 详情页（两栏，css:4906-5505；DOM js:10408-10760）
| 元素 | 值 |
|---|---|
| .vshell-page-detail | `height:calc(100dvh-56px); overflow:hidden; flex column; padding:0 40px 0 60px; box-sizing:border-box; margin-right:0; position:relative`（左 60px / 右 40px；本身不滚动） |
| .vshell-detail-layout | `display:grid; grid-template-columns:minmax(0,1fr) minmax(0,25%); grid-template-rows:minmax(0,1fr); gap:30px; margin-top:18px; flex:1; min-height:0` |
| .vshell-detail-main | `min-width/height:0; overflow:hidden`（主列不滚动） |
| .vshell-detail-side | `overflow-y:auto; overflow-x:hidden; scrollbar-width:none; padding-right:2px`（仅右侧滚动，隐藏滚动条） |
| .vshell-detail-player-card | `margin:14px 0; border-radius:12px; overflow:hidden`（无阴影） |
| .vshell-detail-title-row | `inline-flex; align-items:center; gap:4px; max-width:100%`（复制按钮贴标题） |
| .vshell-detail-title | 19px 600 line-height 1.4；nowrap ellipsis；foreground；flex 1 |
| .vshell-detail-copy | 20×20 13px；`.is-copied` → `vshell-pop 0.3s` + #4ec9b0 |
| .vshell-detail-back | `position:absolute; z-index:5; 24×24; 13px; background:button-secondaryBackground; color:button-secondaryForeground; border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,0.35)`；hover secondaryHover |
| .vshell-detail-stats | `flex; gap:14px; flex-wrap:wrap; margin-top:8px; font-size:13px; descriptionForeground`；`.vshell-detail-meta-tag`（分区标签）：`padding:2px 8px; radius:10px; badge 色; 11px` |
| .vshell-detail-up | `flex; gap:10px; margin-top:14px` |
| .vshell-detail-up-avatar | 38×38 radius 50%；cover；`border:1px solid dropdown-border(#3C3C3C); box-shadow:0 1px 4px rgba(0,0,0,0.5); background:list-hoverBackground; font-size:20px`；`.is-conflict` 红框+errorForeground icon；`.is-add` dashed 圆 + hover focusBorder；`.is-letter` 白底 #181818 字 15px；hover `border-color:focusBorder`；light 边框 rgba(0,0,0,0.35) |
| .vshell-detail-up-name（按钮） | 14px 600 foreground；`max-width:40%; ellipsis`；hover `color:textLink(#4daafc)`（三处统一无下划线）；`.is-conflict` → errorForeground |
| .vshell-detail-up-follow | 20×20 radius 50%；`button-secondaryBackground/Foreground`；hover secondaryHover；codicon 12px；`.is-popping .codicon` follow-in 180ms |
| .vshell-detail-actions | `flex; gap:10px; margin-top:14px; flex-wrap:wrap`；`.vshell-detail-save.is-active[data-kind="watch"]` → charts-blue 边框+字；`[data-kind="fav"]` → errorForeground |
| .vshell-detail-desc | `margin-top:14px; padding:12px 14px; border-radius:8px; background:list-hoverBackground; font-size:13px; line-height:1.7; descriptionForeground; relative`；`.is-collapsed` 文本 max-height 64px；toggle 右下角 12px textLink `padding:2px 6px; radius:4px; bg list-hoverBackground` |
| .vshell-detail-related | `list-style:none; flex column; gap:12px; padding:0` |
| related-item | `flex; gap:10px; no-underline; color:inherit; border-radius:8px; padding:4px; margin:-4px; transition:background 120ms`；hover list-hoverBackground；focus-visible outline 1px focusBorder |
| related-thumb | **168px** 宽 aspect 16/9；radius 6px；bg editor-background；无图 codicon 22px |
| related-dur | `absolute; right:4px; bottom:4px; 11px; badge-foreground`（纯文字无底） |
| related-name | 13px 600 line-height 1.4 surface-foreground；`-webkit-line-clamp:2` |
| related-meta | label2 11px descriptionForeground ellipsis nowrap |

### 9.4 待看/收藏 / 黑名单
`.vshell-watchlist-body` / `.vshell-blacklist-body`: `margin-top:6px`（css:5509-5516）。模式由导航栏全局按钮切换（墙/刷）。

### 9.5 下载管理（css:5518-5666）
| 元素 | 值 |
|---|---|
| .vshell-downloads-controls | `flex; gap:10px; flex-wrap:wrap; align-items:center; margin-left:auto` |
| .vshell-dl-clearwatched.is-confirm | `border/color:errorForeground; background:rgba(248,81,73,0.08)`（二次确认变红） |
| .vshell-select | `padding:4px 8px; border-radius:6px` |
| .vshell-downloads-list | `flex column; gap:12px; margin-top:10px` |
| .vshell-dl-card | `flex; gap:14px; padding:14px; border:1px solid panel-border; border-radius:12px; background:editorWidget-background; transition:border-color 160ms, transform 160ms; animation:vshell-page-in 0.2s`；hover `border-color:widget-border; transform:translateY(-1px)` |
| .vshell-dl-thumb | 112×63 radius 8px cover |
| .vshell-dl-title | 14px 600 ellipsis；min-width 120px |
| .vshell-dl-chip | 11px `padding:2px 8px; radius:10px; badge 色` |
| .vshell-dl-bar / -fill | 6px radius 3；fill progressBar-background `transition:width 300ms` |
| .vshell-dl-meta | `flex; gap:14px; 12px; descriptionForeground` |
| .vshell-dl-track | `flex; gap:10px; 12px; descriptionForeground`；label 宽 110px；bar 4px；fill **charts-blue**；pct 宽 40px 右对齐 |
| .vshell-dl-op | `height:28px; padding:0 10px; font-size:12px` |

### 9.6 角色主页（css:5168-5394；DOM js:12289-12320）
| 元素 | 值 |
|---|---|
| .vshell-role-page | `flex column; gap:6px; padding:20px 24px 48px` |
| .vshell-role-headbar | `padding-top:4px`（返回+标题） |
| .vshell-role-banner | `relative; padding:20px; border-radius:8px; border:1px solid panel-border; background:linear-gradient(135deg, list-activeSelectionBackground(#04395E), editor-background 70%); background-size:cover; background-position:center`（有背景图 JS 内联） |
| has-bg | name/stats/chip 白字；stats rgba(255,255,255,0.85) |
| .vshell-role-avatar-box | 64×64 radius 8px；`border:1px solid dropdown-border; box-shadow:0 2px 8px rgba(0,0,0,0.4); background:list-hoverBackground`；letter 白底 #181818 28px 600 |
| .vshell-role-head | `flex; gap:16px` |
| .vshell-role-name | 20px 600 line-height 1.2 |
| .vshell-role-chips | flex wrap gap 6（复用 st-chip） |
| .vshell-role-stats | 12px descriptionForeground |
| **代表作滚动排** .vshell-role-marquee | `relative; overflow:hidden; border-radius:8px; border:none; background:surface-background`；track `display:flex; width:max-content; padding:0`；`.is-scrolling` → `animation:vshell-marquee 36s linear infinite`（hover 暂停）；half `flex; gap:6px; padding-right:12px`；卡 `.vshell-role-mcard2` **640px 宽**（封面布局） |
| .vshell-role-featuredhost | `display:grid; grid-template-rows:0fr; opacity:0; margin-bottom:-6px; transition:grid-template-rows 0.35s, opacity 0.35s, margin-bottom 0.35s`；`.has-content` → 1fr + opacity 1 + margin 0（有无内容平滑过渡） |
| .vshell-role-body | `flex:1 1 auto; min-height:240px`（feed 模式撑满） |
| .vshell-role-sentinel | 48px margin-top 4（自动无限加载）；.vshell-role-end 24px padding center 12px |

---

## 10. Animations 段（css:5668-5712 + 内联 keyframes）

| 动画 | 关键帧 | 时长/easing | 触发 |
|---|---|---|---|
| vshell-fade | opacity 0→1 | 0.15s ease | modal-backdrop 入场 |
| vshell-page-in | opacity 0 + translateY(8px)→none | 0.22s ease | .vshell-page；dl-card 0.2s |
| vshell-rise | opacity 0 + translateY(14px)→none | **0.32s cubic-bezier(0.2,0.8,0.3,1) both**；delay i×22ms | 视频卡片入场 |
| vshell-pop | opacity 0 + scale(0.94)→scale(1) | 0.18s ease | modal / fab-drawer 入场 |
| vshell-pop（复制脉冲版，css:5008-5012） | scale 1→1.3→1 | 0.3s ease | copy.is-copied（注：同名 keyframes 后者覆盖前者，动画段定义在文件后部——最终生效 scale(0.94) 版） |
| vshell-fab-in | opacity 0 + translateY(16px) scale(0.9)→none | 0.28s cubic-bezier(0.2,0.8,0.3,1.1) | fab 入场 |
| vshell-spin | rotate 360° | 0.8s linear infinite | spinner |
| vshell-pulse | opacity 0.55↔0.9 | 1.3s ease-in-out infinite | 骨架屏 |
| vshell-pop-in | 仅 opacity 0→1（无位移） | 140ms ease | 搜索浮层展开 |
| vshell-pop-out | opacity 1→0 + translateY(-4px) | 140ms ease forwards | 搜索浮层关闭 |
| vshell-marquee | translateX 0→-50% | 36s linear infinite；hover 暂停 | 代表作滚动排（内容超宽时） |
| vshell-follow-in | opacity 0 + translateY(2px)→none | 180ms ease | 关注按钮图标淡入（feed/detail/picker 三处） |
| codicon-spin | rotate 360° | 1.5s steps(30) infinite；loading 1s cubic-bezier(0.53,0.21,0.29,0.67) | 图标旋转 |
| reduced-motion | 全部 animation/transition 0.01ms !important | css:5700-5712 | prefers-reduced-motion |

---

## 11. Responsive 断点（css:5714-5867）

### 11.1 max-width:1280（css:5719-5724）
- `.vshell-detail-layout` → `grid-template-columns:minmax(0,1fr) 300px`（侧栏固定 300px，1/4 比例在窄屏太挤）；gap 仍 30px。

### 11.2 max-width:1080（css:5727-5760）
- `.vshell-outlet` → `padding:56px 0 48px`；`.vshell-page` → `padding:0 14px`。
- `.vshell-page-detail` → `height:auto; overflow:visible; padding:0`（单列落回普通页面流，恢复页面滚动）；`.vshell-detail-layout` → `flex:none; min-height:0`；`.vshell-detail-side` → `overflow:visible`。
- `.vshell-wall` → `minmax(240px,1fr)`；`.vshell-nav-search` → `max-width:320px`。
- `.vshell-detail-layout` → 单列 `grid-template-columns:minmax(0,1fr); gap:0`（相关推荐移到下方）。

### 11.3 max-width:768（css:5763-5819）
- `.vshell-navbar` → `padding:8px 10px; gap:6px`；`.vshell-nav-brand-text`、`.vshell-nav-btn-text` → `display:none`。
- `.vshell-nav-center` → `position:static; left:auto; transform:none; flex:1; min-width:0`；`.vshell-nav-search` → `flex:1; width:auto; max-width:none; margin-left:4px`。
- `.vshell-nav-btn` → `padding:0 8px`；`.vshell-wall` → `minmax(170px,1fr)`。
- `.vshell-detail-title` → 17px；`.vshell-detail-related-thumb` → 128px；`.vshell-dl-thumb` → 88×50。
- `.vshell-downloads-controls` → gap 8；`.vshell-feed-actions` → `right:6px; bottom:48px; gap:12px`；`.vshell-fab` → `right:14px; bottom:14px`；`.vshell-page-head` → wrap。
- `.vshell-player-gap` → `display:none`（css:2708-2710）。

### 11.4 max-width:480（css:5822-5857）
- `.vshell-wall` → `repeat(2,minmax(0,1fr))`（固定两列）。
- `.vshell-modal` → `padding:14px`；`.vshell-fab-drawer` → `width:calc(100vw-28px)`。
- `.vshell-toast-host` → `right/left:14px; align-items:stretch`；`.vshell-toast` → `max-width:none`。
- `.vshell-watchlist-head` → 纵向 stretch；`.vshell-dl-card` → gap 10；`.vshell-dl-thumb` → 76×43。

### 11.5 hover:none（触屏，css:5860-5867）
- `.vsc-video-actions` → `opacity:1`（常显）；`.vsc-video-shade` → `opacity:1`。
- 另有卡片段规则：mute/blacklist `display:none`；chip-del 常显（css:1703-1705,2543-2550）。

---

## 12. 附：web 版结构速览

### 12.1 DOM 层级树（类名）

```
html.vshell.theme-dark
└─ body
   ├─ .vshell-app (flex column, min-height 100dvh, bg #181818)
   │  ├─ nav.vshell-navbar (fixed 56px, rgba(24,24,24,.85)+blur10)
   │  │  ├─ span.vshell-nav-brand ── span.vshell-nav-brand-dot + span.vshell-nav-brand-text("VShell") + span.vshell-nav-brand-ver("v0.5.6")
   │  │  ├─ button.vshell-nav-btn.vshell-nav-theme ── span.vshell-theme-icon(svg)
   │  │  ├─ button.vshell-nav-btn.vshell-nav-mode
   │  │  ├─ button.vshell-nav-btn.vshell-nav-layout
   │  │  ├─ div.vshell-nav-center (absolute 居中)
   │  │  │  ├─ a.vshell-nav-home ── span.codicon.codicon-home
   │  │  │  └─ div.vshell-nav-search ── div.vshell-st-editor ── [span.vshell-st-box > input.vshell-st-input]… + [span.vshell-st-chip > span.vshell-st-chip-name + button.vshell-st-chip-del]
   │  │  │       + button.vshell-nav-clear + span.vshell-nav-divider + button.vshell-nav-search-btn
   │  │  │       └─ (聚焦时) div.vshell-nav-popover ── div.vshell-nav-popover-head(editor+clear+divider+btn) + div.vshell-nav-popover-body ── div.vshell-nav-tagpop ── div.vshell-nav-tagpop-sec ── div.vshell-nav-tagpop-list ── span.vshell-nav-tagpop-chip(+icon+name)
   │  │  ├─ button.vshell-nav-btn(角色) ── a.vshell-nav-btn(待看) ── a.vshell-nav-btn(收藏)
   │  │  ├─ a.vshell-nav-btn(黑名单) ── button.vshell-nav-btn(本地) ── a.vshell-nav-btn(下载)
   │  ├─ div.vshell-outlet (padding-top 56px)
   │  │  └─ div.vshell-page(.vshell-page-home/category/detail/watchlist/fav/blacklist/downloads/search/searchtags / .vshell-role-page)
   │  │     ├─ (主页) div.vshell-sections > div.vshell-sections-grid > button.vshell-section-chip×N
   │  │     │   + div.vshell-wall-host > div.vshell-wall(grid) > article.vsc-video-card×N
   │  │     ├─ (详情) div.vshell-detail-layout > div.vshell-detail-main(h1标题行+stats+up行+div.vshell-detail-player-card>div.vshell-player+actions+desc)
   │  │     │   + div.vshell-detail-side > ul.vshell-detail-related > li.vshell-detail-related-item(thumb+dur + info(name+meta))
   │  │     ├─ (刷页) div.vshell-feed > div.vshell-feed-slide×N > div.vshell-feed-media(img.vshell-feed-poster + div.vshell-player) + div.vshell-feed-info(div.vshell-feed-head(avatar + head-text(title-row(title+copy) + meta(meta-name+follow)))) + div.vshell-feed-actions(button.vshell-feed-action×4)
   │  │     └─ (角色主页) div.vshell-role-banner(head(avatar-box+name+chips+stats)) + div.vshell-role-featuredhost(div.vshell-role-marquee>track>half(.vshell-role-mcard2=封面布局卡)) + div.vshell-role-body(feed/wall)
   │  └─ div.vshell-toast-host > div.vshell-toast
   ├─ div.vshell-fab > button.vshell-fab-capsule + div.vshell-fab-drawer
   └─ (弹窗) div.vshell-modal-backdrop(.vshell-picker-backdrop) > div.vshell-modal(.vshell-tag-modal/.vshell-char-picker/.vshell-char-panel/.vshell-local-panel/.vshell-sniffer-panel)

article.vsc-video-card (DOM, js:4802-5117):
├─ a.vsc-video-media(href=#/video/id)
│  ├─ video.vsc-video(muted playsinline preload=metadata, poster)
│  ├─ div.vsc-video-shade (渐变遮罩)
│  ├─ [span.vsc-video-placeholder(codicon-file-media)] (本地无封面)
│  ├─ div.vsc-video-actions > button.vsc-video-btn.watch(top:4 right:4) + button.vsc-video-btn.star(top:4 left:4) + [button.vsc-video-btn.feature(left:40)]
│  ├─ span.vsc-video-stats (play icon + num [+ sep · + comment icon + num])
│  ├─ span.vsc-video-badge > span.vsc-video-badge-text (时长)
│  ├─ [div.vsc-video-cover-right > span.vsc-video-cover-date + badge] (cover 布局)
│  ├─ button.vsc-video-mute + button.vsc-video-blacklist
│  ├─ div.vsc-video-progress > div.vsc-video-progress-fill
│  ├─ div.vsc-video-saved-marks > span.vsc-video-saved-mark.is-watch/is-fav/is-local/is-featured-mark (3×3 网格)
│  ├─ div.vsc-video-tag-icons > span/button.vsc-video-tag-icon(.is-conflict/.is-letter > img|span.vsc-video-tag-letter)
│  └─ [h3.vsc-video-title-cover] (cover 布局)
└─ [div.vsc-video-body (standard 布局)] > a.vsc-video-title > span.vsc-video-title-tag + div.vsc-video-meta(button.vsc-video-meta-owner(icon+name) + span.vsc-video-meta-date)

div.vshell-player (DOM, js:5485-5700):
├─ video.vshell-player-video
├─ button.vshell-player-center (60×60 圆播放钮)
├─ div.vshell-player-controls > button.vshell-player-btn(播放) + span.vshell-player-time + div.vshell-player-gap(gap-btn+gap-bar) + button.vshell-player-btn(音量)+div.vshell-player-vol(::before+fill) + button.vshell-player-rate(倍速) + button.vshell-player-btn(全屏)
├─ div.vshell-player-bar > div.vshell-player-bar-buffer + div.vshell-player-bar-fill + [div.vshell-player-bar-segs>div.vshell-player-bar-seg(track+buffer+fill)] + [div.vshell-player-bar-nodes>span.vshell-player-bar-node]
├─ div.vshell-player-seekprev > canvas.vshell-player-seekprev-canvas(152×86) + span.vshell-player-seekprev-time
├─ div.vshell-player-loading
└─ div.vshell-scan-window > video (快扫, 48×27 opacity .1)
```

### 12.2 关键交互行为清单

| 组件 | 交互 |
|---|---|
| 导航栏 | 页面滚动 `scrollTop>0` → `.is-scrolled` 阴影 `0 2px 10px rgba(0,0,0,0.45)`（常驻无框线）；home/brand/按钮 hover 底色 + scale(1.05~1.06)；搜索框 hover 背景 #181818；**聚焦 → 浮层展开**（editor+clear+divider+searchBtn 移入 head，tag 列表进 body），失焦守卫（焦点仍在浮层内不关），关闭播 140ms pop-out 再移除；胶囊 hover 显示右上 12px 圆形删除钮（hover 变红） |
| 搜索编辑 | 多输入框模型：Enter 全量封装胶囊+跳聚合墙；Ctrl+Enter 只封装当前；Backspace/Delete 删除相邻胶囊并合并文本；Arrow 跨输入框移动；输入时 canvas 测量文本宽度扩 input（+2px）；点击空白按水平距离就近聚焦 |
| 视频卡片 | hover：shade/stats/badge/saved-marks/tag-icons 淡出，actions 自顶滑入（watch 右上/star 左上/feature 左中），mute 右下/blacklist 左下自底滑入；预览播放（is-previewing）：进度条 2px 浮现、video contain、mute/blacklist 上移 2px；进入卡片延迟 i×22ms 上浮动画；本地无封面 → 渐变占位；点 tag 冲突 icon → 冲突处理弹窗 |
| 播放器 | 鼠标移动显示控制条（200ms），静止 0.7s 自动隐藏（peek：悬停控件单显）；中央播放钮缩放弹出；进度条点击/拖动 seek（拖动期无过渡即时跟手，松手 450ms 平滑），悬停出 160×90 截帧预览浮层（独立隐藏 video，主视频不暂停）；倍速文字 10px；有分镜节点 → 进度条分段渲染（节点处透明） |
| 刷页 feed | scroll-snap y mandatory 整页滑动；右侧动作列 44px 圆钮 hover 放大 1.1；鼠标静止 0.7s 隐藏 info+actions（is-ui-hidden，peeked 保留）；全屏 = feed 容器全屏 + info 左上角 1.5x 放大；列表页取消收藏/待看 → pendingRemove 延迟移除 |
| 弹窗 | backdrop click 关（点外部=保存退出）；picker 草稿模式（选中只记 draft，完成才提交）；冲突行红竖条+红 tint；选中 ✓ 徽章不改框线；主按钮推右下角 |
| 详情页 | 复制标题 → 对勾+脉冲；返回按钮浮动左上；角色名点击=更改角色；hover 统一 textLink 蓝色无下划线（墙卡/刷页/详情三处一致） |
| 下载卡 | hover 上浮 1px + 边框变亮；任务状态色条 |
| 主题 | 深色=月亮 SVG / 浅色=太阳 SVG；页面背景 dark 强制 #181818 |

### 12.3 最独特的 5 个视觉特征
1. **VS Code Modern 化 B 站**：整站色板/圆角/间距完全取自 VS Code 1.133 token（`#181818` 表面底 + `#0078D4` 主蓝 + 8px 卡片圆角 + 4px 控制件圆角），视频站外壳但骨骼是编辑器 UI。
2. **悬浮毛玻璃导航栏**：56px 固定栏 `rgba(24,24,24,0.85)+blur(10px)` 常驻无边框，仅滚动后浮出 `0 2px 10px rgba(0,0,0,0.45)` 阴影，内容从栏下穿过。
3. **胶囊多输入框搜索框**：搜索框内是 [输入框][胶囊][输入框]… 交替的胶囊编辑器，胶囊悬停骑跨右上角 12px 圆形删除钮（溢出 -4px），聚焦时整块内容移入覆盖式浮层。
4. **卡片封面状态点 3×3 网格**：右上角 6px 圆点按「本地(绿)/收藏(红)/代表作(金)/待看(蓝)」顺序填充 9 宫格位置（5 2 1 / 6 4 3 / 9 8 7 编号），悬停整体淡出让位操作按钮。
5. **KKAV 风格播放器**：4px 进度条贴底永不隐藏（hover 8px、拖动期无过渡、松手 450ms 平滑）、悬停出 160×90 canvas 截帧预览浮层、分镜节点处进度条真正透明（SVG mask 挖空），控制条自动隐藏时仅悬停控件单显（peek 模式）。
