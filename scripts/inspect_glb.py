#!/usr/bin/env python3
"""Inspecciona la jerarquía del GLB f1_dallara_gp208.glb: nodos, mallas, materiales, dimensiones."""
import json, struct, sys

path = "/tmp/f1_dallara_gp208.glb"
with open(path, "rb") as f:
    data = f.read()

magic, version, length = struct.unpack_from("<III", data, 0)
print(f"GLB v{version} total={length} B")
assert data[:4] == b"glTF"

# chunks
off = 12
chunks = {}
while off < length:
    clen, ctype = struct.unpack_from("<II", data, off)
    cdata = data[off+8 : off+8+clen]
    chunks[ctype] = cdata
    off += 8 + clen

json_chunk = chunks[0x4E4F534A]  # JSON
bin_chunk = chunks.get(0x004E4942, b"")  # BIN
g = json.loads(json_chunk)
print(f"JSON {len(json_chunk)} B, BIN {len(bin_chunk)} B")
print(f"generator: {g.get('asset',{}).get('generator','?')} | version {g.get('asset',{}).get('version','?')}")

# accessors para bounding boxes
accessors = g.get("accessors", [])
print(f"\n=== MESHES ({len(g.get('meshes',[]))}) ===")
meshes = {}
for i, m in enumerate(g["meshes"]):
    prims = m.get("primitives", [])
    info = []
    for p in prims:
        pos_acc = p["attributes"].get("POSITION")
        acc = accessors[pos_acc]
        info.append({
            "mat": p.get("material", -1),
            "tris": (acc.get("count", 0) // 3) * (1 if p.get("mode", 4) == 4 else 0),
            "min": acc.get("min"), "max": acc.get("max"),
            "attrs": list(p["attributes"].keys()),
        })
    meshes[i] = {"name": m.get("name", f"mesh{i}"), "prims": info}
    print(f"[{i}] {m.get('name','?')}: {len(prims)} prims")

print(f"\n=== MATERIALS ({len(g.get('materials',[]))}) ===")
for i, m in enumerate(g.get("materials", [])):
    pbr = m.get("pbrMetallicRoughness", {})
    bcol = pbr.get("baseColorFactor", [1,1,1,1])
    tex = pbr.get("baseColorTexture", {}).get("index", None)
    print(f"[{i}] {m.get('name','?')}: baseColor={bcol} texIdx={tex} metal={pbr.get('metallicFactor','?')} rough={pbr.get('roughnessFactor','?')} alpha={m.get('alphaMode','OPAQUE')}")

print(f"\n=== IMAGES ({len(g.get('images',[]))}) ===")
for i, im in enumerate(g.get("images", [])):
    print(f"[{i}] {im.get('name','?')} mime={im.get('mimeType','?')} uri={(im.get('uri') or 'bufferView:'+str(im.get('bufferView')))[:60]}")

print(f"\n=== NODES ({len(g.get('nodes',[]))}) ===")
for i, n in enumerate(g.get("nodes", [])):
    has_mesh = "mesh" in n
    rot = n.get("rotation"); scale = n.get("scale"); trans = n.get("translation")
    extra = []
    if rot: extra.append(f"rot={rot}")
    if scale: extra.append(f"scale={scale}")
    if trans: extra.append(f"trans={trans}")
    print(f"[{i}] {n.get('name','?')} mesh={n.get('mesh','-') if has_mesh else '-'} children={n.get('children',[])} {' '.join(extra)}")

print(f"\n=== SCENES ===")
for s in g.get("scenes", []):
    print(f"scene {s.get('name','?')}: roots={s.get('nodes',[])}")

#skins / animations
print(f"\nanimations: {len(g.get('animations',[]))}")
for a in g.get("animations", []):
    print(f"  - {a.get('name','?')} channels={len(a.get('channels',[]))}")
print(f"skins: {len(g.get('skins',[]))}")

# bounding global (escena)
def node_bounds(idx, parent_matrix=None):
    """Aproximado: acumula min/max de POSITION de meshes en coordenadas locales (sin matriz)."""
    n = g["nodes"][idx]
    if "mesh" in n:
        mi = meshes[n["mesh"]]
        for p in mi["prims"]:
            if p["min"] and p["max"]:
                yield (p["min"], p["max"], n.get("name", "?"))
    for c in n.get("children", []):
        yield from node_bounds(c)

mins = [1e9]*3; maxs = [-1e9]*3
scene_roots = g["scenes"][g.get("scene", 0)]["nodes"]
for r in scene_roots:
    for mn, mx, _ in node_bounds(r):
        for k in range(3):
            mins[k] = min(mins[k], mn[k]); maxs[k] = max(maxs[k], mx[k])
print(f"\n=== BOUNDS (local, sin transform) ===")
print(f"min: {[round(v,3) for v in mins]}")
print(f"max: {[round(v,3) for v in maxs]}")
print(f"size: {[round(maxs[k]-mins[k],3) for k in range(3)]}")
print(f"\nextensionsRequired: {g.get('extensionsRequired',[])}")
print(f"extensionsUsed: {g.get('extensionsUsed',[])}")
