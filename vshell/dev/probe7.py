# -*- coding: utf-8 -*-
"""小分类数据源：ranking/region 子分区 + search tids 过滤"""
import sys, time, hashlib, urllib.parse
import requests
sys.stdout.reconfigure(encoding="utf-8")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Referer": "https://www.bilibili.com/"})

print("--- ranking/region 子分区 ---")
for tid in (24, 25, 27, 28, 29, 33, 17, 20, 21):
    r = S.get("https://api.bilibili.com/x/web-interface/ranking/region",
              params={"rid": tid, "day": 3}, timeout=8)
    j = r.json()
    d = j.get("data")
    n = len(d) if isinstance(d, list) else 0
    print(f"rid={tid}: code={j.get('code')} msg={j.get('message')} n={n}")
    if n:
        print("   sample:", d[0].get("bvid"), str(d[0].get("title"))[:16])
    time.sleep(1)

# search tids 参数
TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]
def wbi_sign(params):
    nav = S.get("https://api.bilibili.com/x/web-interface/nav").json()["data"]
    wbi = nav["wbi_img"]
    ik = wbi["img_url"].rsplit("/",1)[-1].split(".")[0]
    sk = wbi["sub_url"].rsplit("/",1)[-1].split(".")[0]
    mixin = "".join((ik+sk)[i] for i in TAB)[:32]
    p = dict(params); p["wts"] = int(time.time())
    p = {k:v for k,v in p.items() if v not in ("",None)}
    q = urllib.parse.urlencode(sorted(p.items()))
    p["w_rid"] = hashlib.md5((q+mixin).encode()).hexdigest()
    return p

print("--- search tids=24 (MAD) ---")
r = S.get("https://api.bilibili.com/x/web-interface/wbi/search/type",
          params=wbi_sign({"search_type": "video", "keyword": "动画", "tids": 24, "page": 1}), timeout=10)
j = r.json()
d = j.get("data") or {}
res = d.get("result") or []
print("code:", j.get("code"), "msg:", j.get("message"), "n:", len(res))
if res:
    print("  sample:", res[0].get("bvid"), str(res[0].get("title"))[:16])

print("--- 分区列表接口尝试 ---")
for url in (
    "https://api.bilibili.com/x/web-interface/zone",
    "https://api.bilibili.com/x/tag/ranking/plist",
    "https://api.bilibili.com/x/web-interface/archive/type",
    "https://api.bilibili.com/x/v2/reply/type",
    "https://api.bilibili.com/x/web-interface/online/region",
    "https://api.bilibili.com/x/web-interface/zone/list",
):
    try:
        r = S.get(url, timeout=8)
        j = r.json()
        d = j.get("data")
        print(f"{url}: code={j.get('code')} data_type={type(d).__name__}", 
              (str(d)[:150] if d else ""))
    except Exception as e:
        print(f"{url}: ERR {e}")
    time.sleep(0.5)
