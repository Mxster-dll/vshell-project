# -*- coding: utf-8 -*-
"""验证 bilibili 分区 tid 有效性（ranking/v2 rid=）"""
import sys, time
import requests
sys.stdout.reconfigure(encoding="utf-8")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Referer": "https://www.bilibili.com/"})

# 候选：主分区 → [(子分区名, tid)]
CAND = {
    "动画": [("MAD·AMV", 24), ("MMD·3D", 25), ("短片·手书", 47), ("综合", 27)],
    "番剧": [("连载动画", 33), ("完结动画", 32), ("资讯", 51), ("官方延伸", 152)],
    "国创": [("国产动画", 153), ("国产原创相关", 168), ("布袋戏", 169), ("动态漫", 195), ("资讯", 170)],
    "音乐": [("原创音乐", 28), ("翻唱", 29), ("VOCALOID·UTAU", 30), ("演奏", 31), ("音频", 194), ("电音", 193), ("MV", 130)],
    "舞蹈": [("宅舞", 20), ("街舞", 198), ("明星舞蹈", 199), ("中国舞", 200), ("舞蹈综合", 154), ("舞蹈教程", 156)],
    "游戏": [("单机游戏", 17), ("电子竞技", 171), ("手机游戏", 172), ("网络游戏", 65), ("桌游棋牌", 173), ("GMV", 121), ("音游", 136), ("Mugen", 19)],
    "知识": [("科学科普", 201), ("社科·法律·心理", 124), ("人文历史", 228), ("财经商业", 207), ("校园学习", 208), ("职业职场", 209), ("野生技能协会", 122), ("演讲·公开课", 39)],
    "科技": [("数码", 95), ("软件应用", 210), ("计算机技术", 211), ("科工机械", 212)],
    "运动": [("篮球", 88), ("足球", 91), ("健身", 164), ("竞技体育", 234), ("运动综合", 234)],
    "汽车": [("汽车生活", 223), ("汽车资讯", 226)],
    "生活": [("搞笑", 138), ("日常", 21), ("出行", 239), ("三农", 240)],
    "美食": [("美食制作", 76), ("美食侦探", 75), ("美食测评", 163)],
    "动物圈": [("喵星人", 85), ("汪星人", 86), ("野生动物", 87), ("动物综合", 217)],
    "鬼畜": [("鬼畜调教", 22), ("音MAD", 26), ("人力VOCALOID", 126), ("教程演示", 127)],
    "时尚": [("美妆护肤", 157), ("穿搭", 158), ("仿妆cos", 164), ("时尚潮流", 159)],
    "娱乐": [("综艺", 71), ("娱乐杂谈", 241)],
    "影视": [("影视杂谈", 182), ("影视剪辑", 183), ("短片", 85)],
    "纪录片": [("人文·历史", 37), ("科学·探索·自然", 178), ("军事", 38)],
    "电影": [("电影相关", 23)],
    "电视剧": [("国产剧", 11)],
}

ok = {}
fail = {}
for main, subs in CAND.items():
    for name, tid in subs:
        try:
            r = S.get("https://api.bilibili.com/x/web-interface/ranking/v2",
                      params={"rid": tid, "type": "all"}, timeout=8)
            j = r.json()
            n = len((j.get("data") or {}).get("list") or [])
            if j.get("code") == 0 and n > 0:
                ok.setdefault(main, []).append((name, tid, n))
            else:
                fail.setdefault(main, []).append((name, tid, j.get("code"), n))
        except Exception as e:
            fail.setdefault(main, []).append((name, tid, "ERR", str(e)[:30]))
        time.sleep(0.15)

print("=== OK ===")
for main, lst in ok.items():
    print(main, "->", [(n, t, c) for n, t, c in lst])
print("=== FAIL ===")
for main, lst in fail.items():
    print(main, "->", lst)
