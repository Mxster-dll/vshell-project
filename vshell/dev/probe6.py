# -*- coding: utf-8 -*-
"""确认 ranking/v2 接受哪些 rid + -400 语义"""
import sys, time
import requests
sys.stdout.reconfigure(encoding="utf-8")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Referer": "https://www.bilibili.com/"})

def probe(tid, type_="all", label=""):
    r = S.get("https://api.bilibili.com/x/web-interface/ranking/v2",
              params={"rid": tid, "type": type_}, timeout=8)
    j = r.json()
    n = len((j.get("data") or {}).get("list") or []) if j.get("code") == 0 else 0
    print(f"rid={tid} type={type_} {label}: code={j.get('code')} msg={j.get('message')} n={n}")
    return j.get("code") == 0 and n > 0

print("--- 已确认有效的一级分区 ---")
for tid in (1, 3, 4, 5, 11, 13, 23, 36, 119, 129, 155, 160, 167, 177, 181, 188):
    probe(tid)

print("--- online region_count 里的其他 tid ---")
for tid in (17, 75, 76, 138, 165, 202, 211, 217, 223, 234):
    probe(tid)

print("--- 部分子分区再试（无 type） ---")
for tid in (24, 25, 27, 28, 29, 30, 33, 32, 20, 21, 22, 26, 95, 124, 201):
    probe(tid, type_="")
