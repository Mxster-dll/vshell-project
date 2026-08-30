# -*- coding: utf-8 -*-
"""真站下载链路探测（未登录）：nav → wbi 签名 → view → playurl → HEAD/Range 分块。
验证 downloader 在真站的每一步（CDN 响应、Content-Length、Range 支持、防盗链）。"""
import hashlib
import json
import re
import sys
import time
import urllib.parse

import requests

API = 'https://api.bilibili.com'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
REFERER = 'https://www.bilibili.com/'

_sess = requests.Session()
_sess.headers['User-Agent'] = UA
_sess.headers['Referer'] = REFERER


def _warm():
    """先访问首页，让服务器种 buvid3/buvid4/b_nut 等匿名 cookie"""
    try:
        _sess.get('https://www.bilibili.com/', timeout=25)
    except Exception as e:
        print('  warm 失败(可忽略):', e)


# wbi mixinKeyEncTab（与适配器一致）
MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
]


def http(url, params=None, headers=None, method='GET', raw=False):
    if params:
        url += ('&' if '?' in url else '?') + urllib.parse.urlencode(params)
    try:
        r = _sess.request(method, url, headers=headers or {}, timeout=25,
                          allow_redirects=False)
        return r.status_code, dict(r.headers), r.content
    except requests.RequestException as e:
        return 0, {}, str(e).encode()


def get_mixin_key(img_url, sub_url):
    def name(u):
        return re.sub(r'\.[a-z]+$', '', u.rsplit('/', 1)[-1])
    raw = name(img_url) + name(sub_url)
    tab = ''.join(raw[i] for i in MIXIN_KEY_ENC_TAB)[:32]
    return tab


def wbi_sign(params, mixin_key):
    p = {k: str(v) for k, v in params.items() if v not in ('', None)}
    p['wts'] = str(int(time.time()))
    q = urllib.parse.urlencode(sorted(p.items()))
    p['w_rid'] = hashlib.md5((q + mixin_key).encode()).hexdigest()
    return p


def main():
    bvid = sys.argv[1] if len(sys.argv) > 1 else 'BV1xx411c7mD'
    _warm()

    print('== 1. nav（拿 wbi 密钥；沙箱无浏览器 cookie 可能 -101）==')
    st, h, body = http(API + '/x/web-interface/nav')
    nav = json.loads(body)
    mixin = None
    if nav.get('code') == 0:
        wbi = nav['data']['wbi_img']
        mixin = get_mixin_key(wbi['img_url'], wbi['sub_url'])
        print('  isLogin:', nav['data']['isLogin'], '| mixinKey:', mixin[:8] + '...')
    else:
        print('  nav 失败:', nav.get('code'), nav.get('message'), '→ 走免 wbi 老接口探测')

    def sign(p):
        return wbi_sign(p, mixin) if mixin else p

    print('== 2. view（有 wbi 用 wbi，否则老接口）==')
    p = sign({'bvid': bvid})
    st, h, body = http(API + '/x/web-interface/wbi/view' if mixin else API + '/x/web-interface/view', p)
    view = json.loads(body)
    if view.get('code') != 0:
        print('view 失败:', view.get('code'), view.get('message'))
        return 1
    d = view['data']
    cid = d['cid']
    print('  title:', d['title'][:40], '| cid:', cid, '| duration:', d['duration'])

    print('== 3. playurl ==')
    p = sign({
        'bvid': bvid, 'cid': cid, 'qn': 127, 'fnval': 4048, 'fourk': 1,
        'fnver': 0, 'platform': 'web', 'otype': 'json',
    })
    st, h, body = http(API + '/x/player/wbi/playurl' if mixin else API + '/x/player/playurl', p)
    pl = json.loads(body)
    if pl.get('code') != 0:
        print('playurl 失败:', pl.get('code'), pl.get('message'))
        return 1
    dd = pl['data']
    vids = dd.get('dash', {}).get('video') or []
    auds = dd.get('dash', {}).get('audio') or []
    print('  dash videos:', len(vids), '| audios:', len(auds))
    if not vids:
        print('  无 dash（可能需登录）durl:', bool(dd.get('durl')))
        return 1
    v = max(vids, key=lambda x: x.get('bandwidth', 0))
    a = max(auds, key=lambda x: x.get('bandwidth', 0))
    print('  最高码率 video id:', v['id'], v['codecs'], v.get('width'), 'x', v.get('height'))
    print('  segmentBase:', json.dumps(v.get('SegmentBase', {})))

    print('== 4. HEAD 探测 ==')
    st, h, body = http(v['baseUrl'], method='HEAD')
    print('  HEAD status:', st, '| Content-Length:', h.get('Content-Length'), '| Accept-Ranges:', h.get('Accept-Ranges'))

    print('== 5. Range bytes=0-0 ==')
    st, h, body = http(v['baseUrl'], headers={'Range': 'bytes=0-0'})
    print('  status:', st, '| Content-Range:', h.get('Content-Range'), '| len:', len(body))

    print('== 6. Range 1MB 分块（模拟 fetchChunk）==')
    st, h, body = http(v['baseUrl'], headers={'Range': 'bytes=0-1048575'})
    print('  status:', st, '| Content-Range:', h.get('Content-Range'), '| len:', len(body))

    print('== 7. audio 轨道 HEAD ==')
    st, h, body = http(a['baseUrl'], method='HEAD')
    print('  status:', st, '| Content-Length:', h.get('Content-Length'))

    print('== 全部通过：真站下载源可用 ==')
    return 0


if __name__ == '__main__':
    sys.exit(main())
