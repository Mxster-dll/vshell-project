# -*- coding: utf-8 -*-
"""生成 dev harness 卡片占位 SVG（output/_vs-fixtures/card*.svg）"""
import os

fi = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "output", "_vs-fixtures")
os.makedirs(fi, exist_ok=True)
cols = [("#3b82f6", "#8b5cf6"), ("#f59e0b", "#ef4444"), ("#10b981", "#0ea5e9"), ("#ec4899", "#f97316")]
for i, (c1, c2) in enumerate(cols, 1):
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">'
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/>'
        "</linearGradient></defs>"
        '<rect width="640" height="360" fill="url(#g)"/>'
        '<text x="320" y="188" font-size="56" fill="rgba(255,255,255,.9)" '
        'text-anchor="middle" font-family="Segoe UI, sans-serif" font-weight="600">VSHELL</text>'
        '<text x="320" y="228" font-size="26" fill="rgba(255,255,255,.75)" '
        'text-anchor="middle" font-family="Segoe UI, sans-serif">Demo Card %d</text></svg>'
    ) % (c1, c2, i)
    with open(os.path.join(fi, "card%d.svg" % i), "w", encoding="utf-8") as f:
        f.write(svg)
print("cards written to", fi)
