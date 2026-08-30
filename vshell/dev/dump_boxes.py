# -*- coding: utf-8 -*-
"""解析 mp4 moov 关键字段（mvhd/tkhd/mdhd/trex/tfhd），对比源与合并结果"""
import struct
import sys

sys.stdout.reconfigure(encoding="utf-8")


def parse_boxes(data, start, end, depth=0):
    out = []
    pos = start
    while pos + 8 <= end:
        size = struct.unpack(">I", data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8].decode("latin1")
        box_end = pos + size if size != 1 else pos + struct.unpack(">Q", data[pos + 8:pos + 16])[0]
        if size == 0:
            box_end = end
        out.append((typ, pos, box_end, depth))
        if box_end <= pos:
            break
        pos = box_end
    return out


def walk(data, start, end, depth=0, prefix=""):
    boxes = parse_boxes(data, start, end, depth)
    for typ, s, e, d in boxes:
        info = ""
        if typ == "mvhd":
            ver = data[s + 8]
            off = 20 if ver == 0 else 32
            ts = struct.unpack(">I", data[s + off:s + off + 4])[0]
            dur = struct.unpack(">Q" if ver == 1 else ">I", data[s + off + 4:s + off + 12 if ver == 1 else s + off + 8])[0] if ver == 1 else struct.unpack(">I", data[s + off + 4:s + off + 8])[0]
            info = "ver=%d timescale=%d duration=%d" % (ver, ts, dur)
        elif typ == "tkhd":
            ver = data[s + 8]
            off = 20 if ver == 0 else 28
            tid = struct.unpack(">I", data[s + off:s + off + 4])[0]
            dur_off = off + 8 if ver == 0 else off + 12
            fmt = ">I" if ver == 0 else ">Q"
            dur = struct.unpack(fmt, data[s + dur_off:s + dur_off + (4 if ver == 0 else 8)])[0]
            info = "ver=%d track_id=%d duration=%d" % (ver, tid, dur)
        elif typ == "mdhd":
            ver = data[s + 8]
            off = 20 if ver == 0 else 32
            ts = struct.unpack(">I", data[s + off:s + off + 4])[0]
            fmt = ">I" if ver == 0 else ">Q"
            dur = struct.unpack(fmt, data[s + off + 4:s + off + (8 if ver == 0 else 12)])[0]
            info = "ver=%d timescale=%d duration=%d" % (ver, ts, dur)
        elif typ == "trex":
            tid = struct.unpack(">I", data[s + 12:s + 16])[0]
            info = "track_id=%d" % tid
        elif typ == "tfhd":
            tid = struct.unpack(">I", data[s + 12:s + 16])[0]
            info = "track_id=%d" % tid
        print("%s%s [%d..%d) %s" % ("  " * d, typ, s, e, info))
        if typ in ("moov", "trak", "mvex", "moof", "traf", "mdia", "minf", "stbl"):
            walk(data, s + 8, e, d + 1)
        if typ in ("edts", "dinf"):
            walk(data, s + 8, e, d + 1)


for label, path in [("SRC video", r"D:\Project\Ongoing\vsc-ui\output\_vs-fixtures\video.m4s"),
                    ("SRC audio", r"D:\Project\Ongoing\vsc-ui\output\_vs-fixtures\audio.m4s"),
                    ("MERGED", r"D:\Project\Ongoing\vsc-ui\output\_vs-merged.mp4")]:
    print("=" * 20, label)
    data = open(path, "rb").read()
    # 顶层
    tops = parse_boxes(data, 0, len(data))
    for typ, s, e, d in tops:
        if typ in ("moov", "moof", "ftyp"):
            print("%s [%d..%d)" % (typ, s, e))
            if typ == "moov":
                walk(data, s + 8, e)
            elif typ == "moof":
                walk(data, s + 8, e)
