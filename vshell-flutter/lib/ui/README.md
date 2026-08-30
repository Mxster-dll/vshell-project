# lib/ui/ — 冻结的原生 Flutter UI（2026-08-28 起）

**状态：冻结（FROZEN）**。架构决定：UI 全部走 web userscript（`output/vshell.user.js`，
源码 `vshell/src/`），Flutter 只保留壳 + 性能敏感后端（窗口 / WebView2 / 数据桥 /
持久化 / 下载）。

- 本目录 20+ 页面/组件文件**保留不删**，仅作参考（部分早期实现细节可反查）。
- `main.dart` 的 `--native` 入口已忽略（`if (true)` 恒走 WebviewShell 壳），
  本目录代码虽被编译但不运行。
- **不要在此目录继续做视觉还原**——UI 改动一律改 web userscript 后重建
  （`python build.py` → `output/vshell.user.js`）。
- 性能敏感项（播放器 / 下载 / 大文件处理）按需下沉 Flutter：
  `lib/services/web_bridge.dart`（数据桥）、`lib/services/hls_downloader.dart`
  （下载）、`lib/services/vs_store.dart`（持久化）。
