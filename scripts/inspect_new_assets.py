#!/usr/bin/env python3
"""Inspect new textures + kart GLB from the user's repo."""
import json, os, sys
from PIL import Image

NEW = "/home/z/my-project/assets_new"

print("=== TEXTURES ===")
for f in sorted(os.listdir(NEW)):
    if not f.endswith(".jpg"):
        continue
    p = os.path.join(NEW, f)
    im = Image.open(p)
    # sample avg color + edge pixel to guess tiling type
    rgb = im.convert("RGB")
    w, h = im.size
    corners = [rgb.getpixel((2, 2)), rgb.getpixel((w - 3, 2)), rgb.getpixel((2, h - 3)), rgb.getpixel((w - 3, h - 3))]
    center = rgb.getpixel((w // 2, h // 2))
    # seamless check: compare left col vs right col avg
    import statistics
    lcol = [rgb.getpixel((0, y)) for y in range(0, h, max(1, h // 40))]
    rcol = [rgb.getpixel((w - 1, y)) for y in range(0, h, max(1, h // 40))]
    tcol = [rgb.getpixel((x, 0)) for x in range(0, w, max(1, w // 40))]
    bcol = [rgb.getpixel((x, h - 1)) for x in range(0, w, max(1, w // 40))]
    def avg(lst):
        return tuple(round(statistics.mean(c[i] for c in lst)) for i in range(3))
    seaml = sum(abs(avg(lcol)[i] - avg(rcol)[i]) for i in range(3))
    seamt = sum(abs(avg(tcol)[i] - avg(bcol)[i]) for i in range(3))
    print(f"{f:20} {w}x{h}  center={center} seamLR={seaml} seamTB={seamt} corners={corners}")

print()
print("=== KART GLB ===")
try:
    import pygltflib
    have_pygl = True
except ImportError:
    have_pygl = False
    print("pygltflib not available, using manual parse")

glb_path = os.path.join(NEW, "go_kart.glb")
with open(glb_path, "rb") as fh:
    data = fh.read()
magic, version, length = data[:4], int.from_bytes(data[4:8], "little"), int.from_bytes(data[8:12], "little")
print(f"magic={magic} version={version} totalLen={length}")
# parse chunks
pos = 12
chunks = []
while pos < length:
    clen = int.from_bytes(data[pos:pos + 4], "little")
    ctype = data[pos + 4:pos + 8].decode()
    chunks.append((ctype, data[pos + 8:pos + 8 + clen]))
    pos += 8 + clen
for ctype, cdata in chunks:
    print(f"chunk type={ctype} len={len(cdata)}")
json_chunk = next(c for t, c in chunks if t == "JSON")
gltf = json.loads(json_chunk.decode("utf-4" if False else "utf-8").strip())

print("\n-- asset --")
print(gltf.get("asset"))
print("\n-- scenes/nodes --", len(gltf.get("nodes", [])), "nodes,", len(gltf.get("scenes", [])), "scenes")
print("\n-- meshes --")
for i, m in enumerate(gltf.get("meshes", [])):
    prims = m.get("primitives", [])
    print(f"mesh[{i}] '{m.get('name')}' prims={len(prims)} attrs={list(prims[0].get('attributes', {}).keys()) if prims else []}")
print("\n-- materials --")
for i, mat in enumerate(gltf.get("materials", [])):
    pbr = mat.get("pbrMetallicRoughness", {})
    print(f"mat[{i}] '{mat.get('name')}' baseColorFactor={pbr.get('baseColorFactor')} metallic={pbr.get('metallicFactor')} rough={pbr.get('roughnessFactor')} tex={('tex' in str(pbr))}")
    if pbr.get("baseColorTexture"):
        print(f"   baseColorTexture -> {pbr['baseColorTexture']}")
print("\n-- textures/images --")
for i, t in enumerate(gltf.get("textures", [])):
    print(f"tex[{i}] sampler={t.get('sampler')} source={t.get('source')}")
for i, img in enumerate(gltf.get("images", [])):
    print(f"img[{i}] mime={img.get('mimeType')} uri={str(img.get('uri'))[:60]} bufferView={img.get('bufferView')}")
print("\n-- animations --", len(gltf.get("animations", [])))
for i, a in enumerate(gltf.get("animations", [])):
    print(f"anim[{i}] '{a.get('name')}' channels={len(a.get('channels', []))}")
print("\n-- accessors (bounding boxes for POSITION) --")
bin_chunk = next(c for t, c in chunks if t == "BIN\u0000\u0000\u0000\u0000"[:4] or t.startswith("BIN"))
for i, acc in enumerate(gltf.get("accessors", [])):
    if acc.get("type") == "VEC3" and acc.get("max") and i < 80:
        pass
# compute POSITION bounds overall via node transforms is complex; just print accessor min/max for the first few POSITION accessors
pos_accessors = [(i, acc) for i, acc in enumerate(gltf.get("accessors", []))
                 for p in [acc] if acc.get("type") == "VEC3"]
cnt = 0
for i, acc in enumerate(gltf.get("accessors", [])):
    if acc.get("type") == "VEC3" and acc.get("max"):
        print(f"acc[{i}] VEC3 min={[round(v,3) for v in acc['min']]} max={[round(v,3) for v in acc['max']]} count={acc.get('count')}")
        cnt += 1
        if cnt > 12:
            break
print("\n-- node tree (first 40) --")
for i, n in enumerate(gltf.get("nodes", [])[:40]):
    print(f"node[{i}] '{n.get('name')}' mesh={n.get('mesh')} children={n.get('children')} rot={n.get('rotation')} scale={n.get('scale')}")
print("\n-- generators/extensions --")
print(gltf.get("asset", {}).get("generator"), "|", list(gltf.get("extensionsUsed", [])))
