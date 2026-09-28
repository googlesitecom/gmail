#!/usr/bin/env python3
"""Analiza la textura F1_Base (img6): layout del livery, alfa, y zonas tintables."""
from PIL import Image
import numpy as np

img = Image.open("/tmp/glb_tex/img6.png")
print(f"modo: {img.mode} tamaño: {img.size}")
rgb = np.asarray(img.convert("RGB"), dtype=np.float32)
a = np.asarray(img, dtype=np.float32)[:, :, 3] if img.mode == "RGBA" else None
if a is not None:
    print(f"alfa: min={a.min():.0f} max={a.max():.0f} media={a.mean():.0f} %transparente(<10)={(a<10).mean()*100:.1f}%")

h, w, _ = rgb.shape
# mapa de bloques 8x8: color medio por bloque para "ver" el layout
bs = 128
blocks = []
for by in range(0, h, bs):
    row = []
    for bx in range(0, w, bs):
        m = rgb[by:by+bs, bx:bx+bs].mean(axis=(0,1))
        r, g, b = m
        # clasificar
        if r > 200 and g > 200 and b > 200: c = "W"  # blanco
        elif r < 40 and g < 40 and b < 40: c = "K"   # negro
        elif b > r + 30 and b > g + 20: c = "B"      # azul
        elif r > g + 40 and r > b + 40: c = "R"      # rojo
        elif g > r + 20 and g > b + 20: c = "G"      # verde
        elif abs(r-g) < 25 and abs(g-b) < 25: c = "."  # gris
        else: c = "?"
        row.append(c)
    blocks.append("".join(row))
print("\nmapa de color (8x8 bloques): W=blanco K=negro B=azul R=rojo G=verde .=gris")
for r in blocks: print(" ", r)

# % de cada categoría
flat = rgb.reshape(-1, 3)
r, g, b = flat[:,0], flat[:,1], flat[:,2]
tot = len(flat)
print(f"\n% azul: {(b > r + 30).mean()*100:.0f}%  % blanco: {((r>200)&(g>200)&(b>200)).mean()*100:.0f}%  % negro: {((r<40)&(g<40)&(b<40)).mean()*100:.0f}%  % amarillo: {((r>170)&(g>150)&(b<90)).mean()*100:.0f}%")
