# -*- coding: utf-8 -*-
"""探测 bilibili 分区树来源：首页 __INITIAL_STATE__ / 分区接口"""
import sys, json, re
import requests
sys.stdout.reconfigure(encoding="utf-8")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Referer": "https://www.bilibili.com/"})

# 1. 首页 HTML __INITIAL_STATE__
r = S.get("https://www.bilibili.com/", timeout=15)
print("home http:", r.status_code, "len:", len(r.text))
m = re.search(r"window\.__INITIAL_STATE__\s*=\s*(\{.*?\})\s*;?\s*<", r.text, re.S)
if not m:
    m = re.search(r"window\.__INITIAL_STATE__\s*=\s*(\{.*?\});", r.text, re.S)
if m:
    try:
        st = json.loads(m.group(1))
        print("INITIAL_STATE keys:", list(st.keys())[:30])
        if "nav" in st:
            print("  nav keys:", list(st["nav"].keys())[:20])
        if "videoPartitions" in st:
            print("  videoPartitions:", json.dumps(st["videoPartitions"], ensure_ascii=False)[:2000])
    except Exception as e:
        print("  parse fail:", e)
        print("  head:", m.group(1)[:300])
else:
    print("  no __INITIAL_STATE__")

# 2. 尝试已知分区接口
for url, params in [
    ("https://api.bilibili.com/x/web-interface/zone", None),
    ("https://api.bilibili.com/x/v2/region", None),
    ("https://api.bilibili.com/x/web-interface/online", None),
    ("https://api.bilibili.com/x/web-interface/nav", None),
]:
    try:
        rr = S.get(url, params=params, timeout=10)
        try:
            j = rr.json()
            d = j.get("data")
            if isinstance(d, dict):
                ks = list(d.keys())
                print(f"{url}: code={j.get('code')} data keys={ks[:15]}")
                if "region" in d:
                    print("   region:", json.dumps(d["region"], ensure_ascii=False)[:800])
                if "region_count" in d:
                    print("   region_count sample:", json.dumps(d["region_count"], ensure_ascii=False)[:400])
            else:
                print(f"{url}: code={j.get('code')} data type={type(d).__name__} len={len(d) if hasattr(d,'__len__') else '-'}")
        except Exception:
            print(f"{url}: non-json http={rr.status_code}")
    except Exception as e:
        print(f"{url}: ERR {e}")
