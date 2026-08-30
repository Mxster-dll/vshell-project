# -*- coding: utf-8 -*-
"""补充探测：分页源 / size 字段 / popular 是否需 wbi / 分区树接口"""
import sys, time, urllib.parse, hashlib
import requests
sys.stdout.reconfigure(encoding="utf-8")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Referer": "https://www.bilibili.com/"})

TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]
NAV_CACHE = {"t": 0, "keys": None}
def get_keys():
    if NAV_CACHE["keys"] and time.time() - NAV_CACHE["t"] < 3600:
        return NAV_CACHE["keys"]
    nav = S.get("https://api.bilibili.com/x/web-interface/nav").json()["data"]
    wbi = nav["wbi_img"]
    ik = wbi["img_url"].rsplit("/",1)[-1].split(".")[0]
    sk = wbi["sub_url"].rsplit("/",1)[-1].split(".")[0]
    mixin = "".join((ik+sk)[i] for i in TAB)[:32]
    NAV_CACHE.update(t=time.time(), keys=mixin)
    return mixin
def wbi_sign(params):
    p = dict(params); p["wts"] = int(time.time())
    p = {k:v for k,v in p.items() if v not in ("",None)}
    q = urllib.parse.urlencode(sorted(p.items()))
    p["w_rid"] = hashlib.md5((q + get_keys()).encode()).hexdigest()
    return p
def jget(url, params=None):
    r = S.get(url, params=params, timeout=10)
    try: return r.status_code, r.json()
    except Exception: return r.status_code, {"_raw": r.text[:120]}

print("=== A. popular 是否需 wbi ===")
for name, url, params in [
    ("popular 无wbi", "https://api.bilibili.com/x/web-interface/popular", {"pn":1,"ps":2}),
    ("popular wbi",   "https://api.bilibili.com/x/web-interface/popular", wbi_sign({"pn":1,"ps":2})),
    ("popular/type wbi", "https://api.bilibili.com/x/web-interface/popular/type", wbi_sign({"pn":1,"ps":2,"rid":1})),
    ("popular/series", "https://api.bilibili.com/x/web-interface/popular/series/one", {"number":1}),
]:
    c, j = jget(url, params)
    d = j.get("data") if isinstance(j, dict) else None
    print(f"[{name}] http={c} code={j.get('code')} hasList={bool(d and d.get('list'))} n={len(d.get('list') or []) if d else '-'}")

print("=== B. ranking/region 分页 ===")
for pn in (1, 2, 5):
    c, j = jget("https://api.bilibili.com/x/web-interface/ranking/region", {"rid": 1, "day": 3, "pn": pn, "ps": 20})
    d = j.get("data") if isinstance(j, dict) else None
    print(f"[region pn={pn}] http={c} code={j.get('code')} type={type(d).__name__} n={len(d) if isinstance(d,list) else '-'}")

print("=== C. ranking/v2 字段 ===")
c, j = jget("https://api.bilibili.com/x/web-interface/ranking/v2", {"rid": 1, "type": "all"})
d = j.get("data") if isinstance(j, dict) else None
if d and d.get("list"):
    it = d["list"][0]
    print("  keys:", sorted(it.keys()))
    print("  bvid:", it.get("bvid"), "duration:", it.get("duration"), "pic:", str(it.get("pic"))[:50])

print("=== D. playurl 原始字段（size 是否存在 / 新字段） ===")
vp = wbi_sign({"bvid": "BV1B8ZJYTEPg", "cid": 1, "qn": 127, "fnval": 4048, "fourk": 1, "platform": "web", "otype": "json"})
c, j = jget("https://api.bilibili.com/x/player/wbi/playurl", vp)
# 先用 view 拿 cid
c2, v2 = jget("https://api.bilibili.com/x/web-interface/wbi/view", wbi_sign({"bvid": "BV1B8ZJYTEPg"}))
cid = (v2.get("data") or {}).get("cid")
vp = wbi_sign({"bvid": "BV1B8ZJYTEPg", "cid": cid, "qn": 127, "fnval": 4048, "fourk": 1, "platform": "web", "otype": "json"})
c, j = jget("https://api.bilibili.com/x/player/wbi/playurl", vp)
d = j.get("data") if isinstance(j, dict) else None
if d and d.get("dash"):
    v = d["dash"]["video"][0]
    print("  video keys:", sorted(v.keys()))
    a = d["dash"]["audio"][0]
    print("  audio keys:", sorted(a.keys()))
    print("  video[0].id:", v.get("id"), "codecs:", v.get("codecs"))
    # 全量视频轨列表 id/codecs
    print("  tracks:", [(x.get("id"), x.get("codecs"), x.get("width"), x.get("height")) for x in d["dash"]["video"]])
    print("  audio tracks:", [(x.get("id"), x.get("codecs")) for x in d["dash"]["audio"]])
    print("  baseUrl head:", str(v.get("baseUrl"))[:120])

print("=== E. HEAD 拿 Content-Length ===")
if d and d.get("dash"):
    url = d["dash"]["video"][0]["baseUrl"]
    r = S.head(url, headers={"User-Agent": UA, "Referer": "https://www.bilibili.com/"}, timeout=10)
    print(f"  HEAD http={r.status_code} CL={r.headers.get('Content-Length')} AR={r.headers.get('Accept-Ranges')}")
    r2 = S.get(url, headers={"User-Agent": UA, "Referer": "https://www.bilibili.com/", "Range": "bytes=0-0"}, timeout=10)
    print(f"  RANGE http={r2.status_code} CL={r2.headers.get('Content-Length')} CR={r2.headers.get('Content-Range')}")

print("=== F. 分区树：online / nav 是否有分区 ===")
c, j = jget("https://api.bilibili.com/x/web-interface/online")
d = j.get("data") if isinstance(j, dict) else None
if isinstance(d, list):
    print("  online: list n=", len(d), "sample keys:", sorted(d[0].keys()) if d else None)
    print("  sample:", [(x.get("region_id"), x.get("region_name")) for x in d[:6]])
else:
    print("  online: keys:", sorted(d.keys()) if d else None)
