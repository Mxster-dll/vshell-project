# -*- coding: utf-8 -*-
"""提取 merge-test dump：base64 → merged.mp4 + 打印页面日志"""
import base64
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

dump = open(sys.argv[1], encoding="utf-8").read()
m = re.search(r'<textarea id="out">([^<]*)</textarea>', dump)
log = re.search(r'<pre id="log">(.*?)</pre>', dump, re.S)
print("=== PAGE LOG ===")
print((log.group(1) if log else "no log")[:3000])
if m and m.group(1):
    raw = base64.b64decode(m.group(1))
    open(sys.argv[2], "wb").write(raw)
    print("=== merged bytes:", len(raw))
else:
    print("=== NO OUTPUT (FAIL)")
