# -*- coding: utf-8 -*-
"""
vshell-app 渲染进程构建：多文件 src → renderer/{app.js, vendor.js, styles.css}
- 与油猴版（vshell/build.py）共用同一份 src/ 源码
- 不注入油猴 meta（独立应用无需）
- CSS 输出为独立文件（index.html <link> 引用），不再转义进 JS
"""
import base64
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.abspath(__file__))
VSH = os.path.normpath(os.path.join(ROOT, "..", "vshell"))
SRC = os.path.join(VSH, "src")
VENDOR = os.path.join(VSH, "vendor")
OUT = os.path.join(ROOT, "renderer")
SKILL_ASSETS = os.path.normpath(os.path.join(ROOT, "..", "skill", "vscode-modern-ui", "resources", "assets"))

# 构建清单（依赖序；与 vshell/build.py 一致，但去掉 meta.js）
JS_FILES = [
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
    "core/theme.js",
    "core/localvideos.js",
    "core/router.js",
    "adapters/site-adapter.js",
    "adapters/bilibili.js",
    "components/toast.js",
    "components/navbar.js",
    "components/settings-panel.js",
    "components/char-panel.js",
    "components/char-picker.js",
    "components/video-card.js",
    "components/wall.js",
    "components/player.js",
    "components/preview.js",
    "components/feed.js",
    "services/fswriter.js",
    "services/merger.js",
    "services/downloader.js",
    "services/shots.js",
    "services/sniffer.js",
    "services/medl.js",
    "components/download-fab.js",
    "components/local-panel.js",
    "components/sniffer-panel.js",
    "pages/home.js",
    "pages/category.js",
    "pages/detail.js",
    "pages/watchlist.js",
    "pages/blacklist.js",
    "pages/downloads.js",
    "pages/search.js",
    "pages/searchtags.js",
    "pages/role.js",
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
    "mux.min.js",
]


def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def build_css():
    """合并 tokens/colors/codicon（选择器改写 + 字体内联）+ 业务样式"""
    tokens = read(os.path.join(SKILL_ASSETS, "css", "tokens", "tokens.css"))
    colors = read(os.path.join(SKILL_ASSETS, "css", "tokens", "colors.css"))
    codicon_css = read(os.path.join(SKILL_ASSETS, "css", "codicon", "codicon.css"))
    ttf = os.path.join(SKILL_ASSETS, "css", "codicon", "codicon.ttf")

    tokens = tokens.replace(".monaco-workbench {", ".vshell {")
    colors = colors.replace(".monaco-workbench.vs-dark {", ".vshell.theme-dark {")
    colors = colors.replace(".monaco-workbench.vs {", ".vshell.theme-light {")

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
    for j in JS_FILES:
        parts.append("\n/* ===== src/%s ===== */\n" % j)
        parts.append(read(os.path.join(SRC, j)))
    return "\n".join(parts)


def build_vendor():
    parts = []
    for v in VENDOR_FILES:
        parts.append("/* vendor: %s */\n" % v)
        parts.append(read(os.path.join(VENDOR, v)))
        parts.append("\n;")
    return "\n".join(parts)


def main():
    os.makedirs(OUT, exist_ok=True)
    css = build_css()
    js = build_js()
    vendor = build_vendor()
    with open(os.path.join(OUT, "styles.css"), "w", encoding="utf-8") as f:
        f.write(css)
    with open(os.path.join(OUT, "vendor.js"), "w", encoding="utf-8") as f:
        f.write(vendor)
    with open(os.path.join(OUT, "app.js"), "w", encoding="utf-8") as f:
        f.write(js)
    print("built renderer/ (%s css bytes, %s app bytes, %s vendor bytes)" % (
        len(css), len(js), len(vendor)))


if __name__ == "__main__":
    main()
