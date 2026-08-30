# -*- coding: utf-8 -*-
"""Scan divider-probe screenshot for the divider pixel column and describe
what actually renders in the popover head area."""
import sys
from PIL import Image  # may not exist; fallback below

if len(sys.argv) < 2:
    print('usage: scan_divider.py <png>')
    sys.exit(1)

img = Image.open(sys.argv[1]).convert('RGB')
W, H = img.size
print('size=%dx%d' % (W, H))

# Search whole navbar band for pixels near divider colors
TARGETS = {
    'sep4545': (69, 69, 69),
    'sep2B2B': (43, 43, 43),
    'sep3C3C': (60, 60, 60),
    'bg1818': (24, 24, 24),
    'bg2525': (37, 37, 38),
}
TOL = 10

def close(px, t):
    return all(abs(px[i] - t[i]) <= TOL for i in range(3))

hits = {k: [] for k in TARGETS}
# scan y 0..100 (navbar + popover head area), x all
for y in range(0, min(120, H)):
    for x in range(0, W):
        px = img.getpixel((x, y))
        for k, t in TARGETS.items():
            if close(px, t):
                hits[k].append((x, y))

for k, pts in hits.items():
    if pts:
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        print('%s: %d px, x[%d..%d] y[%d..%d]' % (k, len(pts), min(xs), max(xs), min(ys), max(ys)))
    else:
        print('%s: 0 px' % k)
