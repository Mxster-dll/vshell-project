# -*- coding: utf-8 -*-
"""下载 vendor 库：dash.js / mp4box.js（jsdelivr CDN，OpenSSL 可通）"""
import os, sys, urllib.request, ssl
sys.stdout.reconfigure(encoding="utf-8")

OUT = os.path.join(os.path.dirname(__file__), "..", "vendor")
os.makedirs(OUT, exist_ok=True)

URLS = {
    "dash.all.min.js": "https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js",
    "mp4box.all.min.js": "https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js",
}

ctx = ssl.create_default_context()
for name, url in URLS.items():
    dest = os.path.join(OUT, name)
    if os.path.exists(dest) and os.path.getsize(dest) > 100000:
        print(f"skip {name} (exists {os.path.getsize(dest)}B)")
        continue
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
            data = r.read()
        with open(dest, "wb") as f:
            f.write(data)
        print(f"OK {name} {len(data)}B <- {url}")
    except Exception as e:
        print(f"FAIL {name}: {e}")

for name in URLS:
    p = os.path.join(OUT, name)
    if os.path.exists(p):
        print(f"  {name}: {os.path.getsize(p)}B")
