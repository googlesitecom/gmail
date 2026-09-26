#!/usr/bin/env python3
"""Extrae las imágenes embebidas del GLB y analiza sus colores dominantes."""
import json, struct, io
from PIL import Image
import numpy as np

data = open("/tmp/f1_dallara_gp208.glb", "rb").read()
length = struct.unpack_from("<I", data, 8)[0]
off = 12; chunks = {}
while off < length:
    clen, ctype = struct.unpack_from("<II", data, off)
    chunks[ctype] = data[off+8:off+8+clen]
    off += 8 + clen
g = json.loads(chunks[0x4E4F534A])
bin_chunk = chunks.get(0x004E4942, b"")
bvs = g["bufferViews"]

import os
os.makedirs("/tmp/glb_tex", exist_ok=True)
for i, im in enumerate(g["images"]):
    bvi = im["bufferView"]
    bv = bvs[bvi]
    raw = bin_chunk[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]]
    mime = im.get("mimeType", "image/png")
    ext = "jpg" if "jpeg" in mime else "png"
    p = f"/tmp/glb_tex/img{i}.{ext}"
    open(p, "wb").write(raw)
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        a = np.asarray(img, dtype=np.float32)
        mean = a.mean(axis=(0, 1))
        sat = (a.max(axis=2) - a.min(axis=2)).mean()
        print(f"img{i}: {img.size} {ext} mediaRGB=({mean[0]:.0f},{mean[1]:.0f},{mean[2]:.0f}) saturación={sat:.0f}")
    except Exception as e:
        print(f"img{i}: {ext} ERROR {e}")

# qué textura usa cada material
print("\nmateriales → texturas:")
for i, m in enumerate(g["materials"]):
    pbr = m.get("pbrMetallicRoughness", {})
    src = pbr.get("baseColorTexture", {}).get("index", None)
    texs = g.get("textures", [])
    if src is not None:
        img_idx = texs[src].get("source")
        print(f"  [{i}] {m.get('name')}: usa img{img_idx}")

# mallas por material (para saber qué piezas son tintables)
mesh_mats = {}
for n in g["nodes"]:
    if "mesh" not in n: continue
    prims = g["meshes"][n["mesh"]].get("primitives", [])
    for p in prims:
        mesh_mats.setdefault(p.get("material", -1), []).append(n.get("name", "?"))
print("\npiezas por material:")
for mat, parts in mesh_mats.items():
    print(f"  material {mat}: {sorted(set(parts))[:8]}{'...' if len(set(parts))>8 else ''}")
