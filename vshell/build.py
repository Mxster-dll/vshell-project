# -*- coding: utf-8 -*-
"""
vshell 构建脚本：多文件 src → 单文件油猴脚本 output/vshell.user.js
- 内联 vendor（dash.js / mp4box.js）
- colors.css/tokens.css 选择器改写（.monaco-workbench.vs-dark → .vshell.theme-dark）
- codicon.ttf base64 内联
- 全部 CSS 内联为 JS 注入字符串
"""
import base64
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
VENDOR = os.path.join(ROOT, "vendor")
OUT = os.path.join(ROOT, "..", "output")
SKILL_ASSETS = os.path.join(ROOT, "..", "skill", "vscode-modern-ui", "resources", "assets")

# 构建清单（依赖序）
JS_FILES = [
    "meta.js",
    "core/utils.js",
    "core/md5.js",
    "core/store.js",
    "core/saved.js",
    "core/watched.js",
    "core/characters.js",
    "core/char-banners.js",
    "core/searchcache.js",
    "core/searchtags.js",
    "core/blacklist.js",
    "core/viewmode.js",
    "core/cardgap.js",         # v0.5.6 用户需求：卡片间距拖动条（--vshell-card-gap）
    "core/scrollbridge.js",    # v0.5.6 Flutter 壳滚轮桥（__VS_SCROLL__）
    "core/theme.js",
    "core/localvideos.js",     # v0.5.6 第十二轮：本地视频数据源
    "core/router.js",
    "core/net.js",           # v0.5.6 插件数据源：V.net.fetch 双路径（原生 fetch → Flutter 桥代理）
    "core/data-source.js",   # v0.5.6 用户需求：设置面板「数据源」项（v0.5.10 独立化：无内置源）
    "core/multisource.js",   # v0.5.7 用户需求：多数据源核心（激活集/隐私排除/预取 k/并集读写）
    "core/aggregations.js",  # v0.6.1 用户需求：视频聚合（组=虚拟条目，phash 自动并入/主成员/播放排序）
    "core/videotable.js",    # v0.6.23 用户需求：每源视频 id 表（详情占位索引 + 详情回写；预览首写+详情恒覆盖）
    "core/switchoverlay.js", # v0.5.6 用户需求：数据源切换加载遮罩（切换标记+全屏 spinner）
    "adapters/site-adapter.js",
    # v0.5.10 独立化：bilibili 不再内置——已抽为独立插件文件
    # （vshell-flutter/bilibili.js，用户手动添加数据源注册）。
    "components/toast.js",
    "components/navbar.js",
    "components/char-panel.js",
    "components/char-picker.js",
    "components/video-card.js",
    "components/wall.js",
    "components/agg-ui.js",  # v0.6.2 聚合二期：右键菜单/多选/拖拽合并/组选择弹窗
    "core/source-feed.js",   # v0.6.0 用户需求：数据源层独立预取队列（增量拉取+缓存分片+相对路径）
    "core/multiwall.js",     # v0.5.7 用户需求：多源墙（轮转指针 + a*k 预取窗口 + 源补页）
    "components/player.js",
    "components/preview.js",
    "components/feed.js",
    "services/fswriter.js",
    "services/merger.js",
    "services/downloader.js",
    "services/shots.js",
    "services/sniffer.js",        # v0.5.6 第二十七轮：FetchV 式视频嗅探下载
    "services/medl.js",           # v0.5.6 第二十八轮：媒体直链下载引擎（m3u8→mp4/多线程）
    "components/download-fab.js",
    "components/local-panel.js",   # v0.5.6 第十二轮：本地视频导入浮窗
    "components/sniffer-panel.js", # v0.5.6 第二十七轮：视频嗅探面板
    "pages/home.js",
    "pages/category.js",
    "pages/detail.js",
    "pages/watchlist.js",
    "pages/blacklist.js",
    "pages/downloads.js",
    "pages/search.js",
    "pages/searchtags.js",
    "pages/role.js",
    "pages/settings.js",  # v0.5.12 用户需求：设置改页面（#/settings，k 拖动条置顶）
    "app.js",
]

CSS_FILES = [
    "styles/base.css",
    "styles/components.css",
    "styles/pages.css",
    "styles/animations.css",
    "styles/responsive.css",
]

VENDOR_FILES = [
    "dash.all.min.js",
    "mp4box.all.min.js",
    "mux.min.js",        # v0.5.6 第二十八轮：TS→fMP4 transmuxer（m3u8 下载转 mp4）
]


def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def build_css():
    """合并 tokens/colors/codicon（改写选择器 + 字体内联）+ 业务样式"""
    tokens = read(os.path.join(SKILL_ASSETS, "css", "tokens", "tokens.css"))
    colors = read(os.path.join(SKILL_ASSETS, "css", "tokens", "colors.css"))
    codicon_css = read(os.path.join(SKILL_ASSETS, "css", "codicon", "codicon.css"))
    ttf = os.path.join(SKILL_ASSETS, "css", "codicon", "codicon.ttf")

    # 选择器改写：token 变量挂到 .vshell；colors 分主题
    tokens = tokens.replace(".monaco-workbench {", ".vshell {")
    # colors.css 有两段：vs-dark 与 vs（light）
    colors = colors.replace(".monaco-workbench.vs-dark {", ".vshell.theme-dark {")
    colors = colors.replace(".monaco-workbench.vs {", ".vshell.theme-light {")

    # codicon 字体内联
    b64 = base64.b64encode(open(ttf, "rb").read()).decode()
    codicon_css = re.sub(
        r'url\("\./codicon\.ttf\?[^"]*"\)',
        'url("data:font/ttf;base64,%s")' % b64,
        codicon_css,
    )

    parts = [tokens, colors, codicon_css]
    for c in CSS_FILES:
        parts.append(read(os.path.join(SRC, c)))
    return "\n".join(parts)


def build_js():
    parts = []
    # 1. 油猴元数据必须位于文件最顶部（Tampermonkey 只扫文件开头，
    #    任何前置内容——vendor 或注释——都会判"用户脚本无效"）
    parts.append(read(os.path.join(SRC, "meta.js")))
    parts.append("\n")
    # 2. vendor（UMD，直接注入）
    for v in VENDOR_FILES:
        parts.append("/* vendor: %s */\n" % v)
        parts.append(read(os.path.join(VENDOR, v)))
        parts.append("\n;")
    # 3. 其余源码
    for j in JS_FILES:
        if j == "meta.js":
            continue
        parts.append("\n/* ===== src/%s ===== */\n" % j)
        parts.append(read(os.path.join(SRC, j)))
    return "\n".join(parts)


def main():
    css = build_css()
    js = build_js()
    # 转义 CSS 为 JS 字符串（模板字面量转义）
    css_js = css.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    inject = (
        "\n/* ===== injected styles ===== */\n"
        "(function(){ var s = document.createElement('style'); s.id = 'vshell-style'; "
        "s.textContent = `%s`; (document.head || document.documentElement).appendChild(s); })();\n" % css_js
    )
    out = js + inject
    os.makedirs(OUT, exist_ok=True)
    dest = os.path.join(OUT, "vshell.user.js")
    with open(dest, "w", encoding="utf-8") as f:
        f.write(out)
    print("built: %s (%d bytes, css %d, js %d)" % (dest, len(out.encode("utf-8")), len(css), len(js)))


if __name__ == "__main__":
    main()
