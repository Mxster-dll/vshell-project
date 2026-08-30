# -*- coding: utf-8 -*-
"""探测 playurl SegmentBase 结构 + mp4box API 表面"""
import sys, time, urllib.parse, hashlib, re
import requests
sys.stdout.reconfigure(encoding="utf-8")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Referer": "https://www.bilibili.com/"})
TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]
def keys():
    nav = S.get("https://api.bilibili.com/x/web-interface/nav").json()["data"]
    wbi = nav["wbi_img"]
    ik = wbi["img_url"].rsplit("/",1)[-1].split(".")[0]
    sk = wbi["sub_url"].rsplit("/",1)[-1].split(".")[0]
    return "".join((ik+sk)[i] for i in TAB)[:32]
def wbi_sign(params):
    p = dict(params); p["wts"] = int(time.time())
    p = {k:v for k,v in p.items() if v not in ("",None)}
    q = urllib.parse.urlencode(sorted(p.items()))
    p["w_rid"] = hashlib.md5((q + keys()).encode()).hexdigest()
    return p

# 1. SegmentBase 结构
import json
def json_dumps(o):
    return json.dumps(o, ensure_ascii=False, indent=2)

r = S.get("https://api.bilibili.com/x/web-interface/wbi/view", params=wbi_sign({"bvid":"BV1B8ZJYTEPg"}))
j = r.json(); cid = j["data"]["cid"]
r = S.get("https://api.bilibili.com/x/player/wbi/playurl", params=wbi_sign({"bvid":"BV1B8ZJYTEPg","cid":cid,"qn":127,"fnval":4048,"fourk":1,"platform":"web","otype":"json"}))
d = r.json()["data"]
v = d["dash"]["video"][0]
print("=== SegmentBase (video track 0) ===")
print(json_dumps(v.get("SegmentBase")))
print("=== segment_base (legacy) ===")
print(json_dumps(v.get("segment_base")))
print("=== dash keys ===")
print(json_dumps(sorted(d["dash"].keys())))
print("=== timelength / duration ===")
print("  timelength:", d.get("timelength"))
# durl 是否同时存在
print("  durl present:", bool(d.get("durl")))
# 全量 video track id → codecs 映射（选 avc1 最高码率用）
print("=== tracks ===")
for x in d["dash"]["video"]:
    print(f"  V id={x['id']} codecs={x.get('codecs')} w={x.get('width')}x{x.get('height')} bw={x.get('bandwidth')}")
for x in d["dash"]["audio"]:
    print(f"  A id={x['id']} codecs={x.get('codecs')} bw={x.get('bandwidth')}")

def json_dumps(o):
    import json
    return json.dumps(o, ensure_ascii=False, indent=2)

print()
print("=== fnval=16 (纯 dash) 对比 ===")
r = S.get("https://api.bilibili.com/x/player/wbi/playurl", params=wbi_sign({"bvid":"BV1B8ZJYTEPg","cid":cid,"qn":80,"fnval":16,"fourk":0,"platform":"web","otype":"json"}))
d2 = r.json().get("data") or {}
print("  dash present:", bool(d2.get("dash")), "durl present:", bool(d2.get("durl")))
if d2.get("dash"):
    v2t = d2["dash"]["video"][0]
    print("  SB:", json_dumps(v2t.get("SegmentBase")))
    print("  video tracks:", [(x['id'], x.get('codecs')) for x in d2["dash"]["video"]])
    print("  audio tracks:", [(x['id'], x.get('codecs')) for x in d2["dash"]["audio"]])
