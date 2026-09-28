#!/usr/bin/env python3
"""Pixel-based QA for APEX KART screenshots (no VLM needed).
Checks: 3D stage visible (non-uniform middle band), UI elements present,
character/item-box color diversity in specific crops."""
import sys
from PIL import Image

def analyze(path, label):
    img = Image.open(path).convert('RGB')
    w, h = img.size
    px = img.load()

    # 1) middle band (where the 3D stage should breathe through the scrim)
    band = img.crop((int(w*0.25), int(h*0.35), int(w*0.75), int(h*0.60)))
    colors = band.getcolors(maxcolors=1_000_000)
    uniq = len(colors)
    # variance proxy: unique colors in the band
    # if the menu were opaque flat, uniq would be very low (<50)
    print(f"[{label}] {w}x{h} band-unique-colors={uniq} {'OK 3D visible' if uniq > 400 else 'LOOKS FLAT/OPAQUE'}")

    # 2) overall brightness histogram
    small = img.resize((64, 36))
    sp = small.load()
    bright = sum(1 for y in range(36) for x in range(64) if sum(sp[x, y]) > 90)
    total = 64 * 36
    print(f"[{label}] bright-pixel-ratio={bright/total:.2%} {'(not black screen)' if bright/total > 0.05 else '!! MOSTLY BLACK'}")

    # 3) color families present (detects logo gold, button colors)
    fams = {'red': 0, 'green': 0, 'cyan': 0, 'gold': 0, 'purple': 0}
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            r, g, b = px[x, y]
            if r > 150 and g < 110 and b < 110: fams['red'] += 1
            elif g > 150 and r < 110 and b < 130: fams['green'] += 1
            elif b > 160 and g > 110 and r < 110: fams['cyan'] += 1
            elif r > 190 and g > 140 and b < 90: fams['gold'] += 1
            elif r > 120 and b > 150 and g < 110: fams['purple'] += 1
    print(f"[{label}] color families: {fams}")

for arg in sys.argv[1:]:
    path, _, label = arg.partition('|')
    analyze(path, label or path.split('/')[-1])
