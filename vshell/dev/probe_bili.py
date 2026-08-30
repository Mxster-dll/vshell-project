# -*- coding: utf-8 -*-
"""bilibili API 契约探测 + wbi 签名验证（开发期一次性脚本）"""
import hashlib, json, re, sys, time, urllib.parse
import requests
sys.stdout.reconfigure(encoding="utf-8")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Referer": "https://www.bilibili.com/"})

MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
]

def get_mixin_key(img_key, sub_key):
    raw = img_key + sub_key
    return "".join(raw[i] for i in MIXIN_KEY_ENC_TAB)[:32]

def wbi_sign(params: dict) -> dict:
    """对 params 做 wbi 签名，返回带 w_rid/wts 的新 dict"""
    nav = S.get("https://api.bilibili.com/x/web-interface/nav").json()
    img_url = nav["data"]["wbi_img"]["img_url"]
    sub_url = nav["data"]["wbi_img"]["sub_url"]
    img_key = img_url.rsplit("/", 1)[-1].split(".")[0]
    sub_key = sub_url.rsplit("/", 1)[-1].split(".")[0]
    mixin = get_mixin_key(img_key, sub_key)
    params = dict(params)
    params["wts"] = int(time.time())
    # 过滤 value 为空的
    params = {k: v for k, v in params.items() if v not in ("", None)}
    # 按键排序
    items = sorted(params.items())
    query = urllib.parse.urlencode(items)
    w_rid = hashlib.md5((query + mixin).encode()).hexdigest()
    params["w_rid"] = w_rid
    return params

def jget(url, params=None):
    r = S.get(url, params=params, timeout=10)
    try:
        return r.status_code, r.json()
    except Exception:
        print(f"  !! non-json resp http={r.status_code}: {r.text[:200]!r}")
        return r.status_code, {}

def show(tag, code, data):
    print(f"[{tag}] http={code} code={data.get('code')} msg={data.get('message')}")
    return data.get("data")

def main():
    # 1. nav 无签名
    _, nav = jget("https://api.bilibili.com/x/web-interface/nav")
    d = nav.get("data") or {}
    print("[nav] isLogin:", d.get("isLogin"))
    wbi = d.get("wbi_img") or {}
    print("[nav] wbi_img keys:", list(wbi.keys()))
    if wbi.get("img_url"):
        print("  img:", wbi["img_url"].rsplit("/",1)[-1])
        print("  sub:", wbi["sub_url"].rsplit("/",1)[-1])

    # 2. 热门列表（wbi?）
    _, pop = jget("https://api.bilibili.com/x/web-interface/popular", {"pn":1,"ps":3})
    pd = pop.get("data") or {}
    items = pd.get("list") or []
    print("[popular] count:", len(items))
    if items:
        it = items[0]
        print("  sample:", it.get("bvid"), it.get("title")[:20], "cid:", it.get("cid"), "pic:", it.get("pic","")[:60])
        print("  stat:", {k: it.get("stat",{}).get(k) for k in ("view","like","danmaku","favorite")})
        print("  owner:", it.get("owner",{}).get("name"), "duration:", it.get("duration"), "tname:", it.get("tname"))

    # 3. view 详情（wbi）
    bvid = items[0]["bvid"] if items else "BV1GJ411x7h7"
    vp = wbi_sign({"bvid": bvid})
    _, view = jget("https://api.bilibili.com/x/web-interface/wbi/view", vp)
    vd = show("view", *view and (200, view))
    if vd:
        print("  title:", vd.get("title"))
        print("  cid:", vd.get("cid"), "duration:", vd.get("duration"), "desc:", (vd.get("desc") or "")[:40])
        print("  pages:", len(vd.get("pages") or []))
        print("  stat:", vd.get("stat"))
        print("  owner:", vd.get("owner",{}).get("name"), "tname:", vd.get("tname"))

    # 4. playurl（wbi + buvid cookie）
    cid = vd["cid"]
    pp = wbi_sign({"bvid": bvid, "cid": cid, "qn": 127, "fnval": 4048, "fourk": 1, "fnver": 0, "platform": "web", "otype": "json"})
    _, play = jget("https://api.bilibili.com/x/player/wbi/playurl", pp)
    playd = show("playurl", *play and (200, play))
    if playd:
        dash = playd.get("dash")
        if dash:
            v = dash.get("video") or []
            a = dash.get("audio") or []
            print(f"  dash: video={len(v)} audio={len(a)}")
            for x in v[:4]:
                print(f"    V id={x.get('id')} bw={x.get('bandwidth')} codecs={x.get('codecs')} w={x.get('width')}x{x.get('height')} size={x.get('size')}")
                print("      url:", (x.get("baseUrl") or x.get("base_url") or "")[:100])
            if a:
                print(f"    A id={a[0].get('id')} size={a[0].get('size')} codecs={a[0].get('codecs')}")
                print("      url:", (a[0].get("baseUrl") or "")[:100])
        else:
            durl = playd.get("durl") or []
            print("  durl:", len(durl))
            if durl:
                print("    url:", durl[0].get("url","")[:100], "size:", durl[0].get("size"))
        print("  timelength:", playd.get("timelength"))

    # 5. 排行/分区（wbi）— 试多个 endpoint
    for ep, extra in [
        ("https://api.bilibili.com/x/web-interface/wbi/ranking/v2", {"rid": 1, "type": "all"}),
        ("https://api.bilibili.com/x/web-interface/ranking/v2", {"rid": 1, "type": "all"}),
        ("https://api.bilibili.com/x/web-interface/popular/type", {"pn": 1, "ps": 3}),
        ("https://api.bilibili.com/x/web-interface/ranking/region", {"rid": 1, "day": 3}),
        ("https://api.bilibili.com/x/web-interface/online", None),
    ]:
        p = wbi_sign(extra) if extra else None
        rcode, rdata = jget(ep, p)
        rd = show(f"rank {ep.rsplit('/',1)[-1]}", rcode, rdata)
        if rd and isinstance(rd, dict) and rd.get("list"):
            it = rd["list"][0]
            print("  sample:", it.get("bvid"), str(it.get("title"))[:20], "duration:", it.get("duration"))
        elif isinstance(rd, list) and rd:
            print("  sample(list):", rd[0].get("bvid") if isinstance(rd[0], dict) else rd[0])
        print()

    # 6. 搜索（wbi）
    sp = wbi_sign({"search_type": "video", "keyword": "猫", "page": 1})
    _, srch = jget("https://api.bilibili.com/x/web-interface/wbi/search/type", sp)
    sd = show("search", *srch and (200, srch))
    if sd and sd.get("result"):
        r0 = sd["result"][0]
        print("  sample:", r0.get("bvid"), r0.get("title","")[:30])
        print("  keys:", list(r0.keys())[:20])

    # 7. 相关推荐
    _, rel = jget("https://api.bilibili.com/x/web-interface/archive/related", {"bvid": bvid})
    rd2 = show("related", *rel and (200, rel))
    if isinstance(rd2, list) and rd2:
        print("  count:", len(rd2), "sample:", rd2[0].get("bvid"), rd2[0].get("title","")[:20])

    # 8. Range 请求验证（取 playurl 首块，验证 CORS 无关、Range 生效、Referer 必需性）
    if playd:
        url = None
        if playd.get("dash"):
            url = (playd["dash"].get("video") or [{}])[0].get("baseUrl")
        elif playd.get("durl"):
            url = playd["durl"][0].get("url")
        if url:
            for ref in (True, False):
                h = {"User-Agent": UA, "Range": "bytes=0-1023"}
                if ref: h["Referer"] = "https://www.bilibili.com/"
                r = S.get(url, headers=h, timeout=15)
                cl = r.headers.get("Content-Length")
                cr = r.headers.get("Content-Range")
                print(f"[range] referer={ref} http={r.status_code} len={cl} range={cr} body={len(r.content)}")
                if r.status_code == 206:
                    # 验证 md5 与文件一致性不需要，仅验证可拉取
                    break

if __name__ == "__main__":
    main()
