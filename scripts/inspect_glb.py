#!/usr/bin/env python3
"""Inspect GLB files: extract JSON metadata + embedded textures for review."""
import json, struct, os, sys

OUT = "/home/z/my-project/tmp_models/extracted"
os.makedirs(OUT, exist_ok=True)

def parse_glb(path):
    name = os.path.basename(path).replace(".glb", "")
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack("<4sII", data[:12])
    assert magic == b"glTF", f"{path}: not a GLB"
    # first chunk = JSON
    clen, ctype = struct.unpack("<II", data[12:20])
    assert ctype == 0x4E4F534A  # 'JSON'
    js = json.loads(data[20:20+clen].decode("utf-8"))
    info = {
        "file": name,
        "generator": js.get("asset", {}).get("generator", "?"),
        "version": js.get("asset", {}).get("version", "?"),
        "meshes": [m.get("name", "?") for m in js.get("meshes", [])][:40],
        "materials": [m.get("name", "?") for m in js.get("materials", [])][:40],
        "nodes": [n.get("name", "?") for n in js.get("nodes", [])][:60],
        "animations": [a.get("name", "?") for a in js.get("animations", [])][:20],
        "images": [i.get("name", i.get("mimeType", "?")) for i in js.get("images", [])][:20],
        "extras": js.get("extras", {}),
        "n_meshes": len(js.get("meshes", [])),
        "n_nodes": len(js.get("nodes", [])),
    }
    with open(f"{OUT}/{name}_meta.json", "w") as f:
        json.dump(js, f, indent=1)  # full JSON for deep dive
    # extract embedded images
    img_files = []
    for idx, img in enumerate(js.get("images", [])):
        bv = js["bufferViews"][img["bufferView"]]
        # chunks: header(12) + [jsonLen|jsonType](8) + json + pad + [binLen|binType](8) + bin data
        pad = (4 - (clen % 4)) % 4
        bin_data_off = 20 + clen + pad + 8
        o = bin_data_off + bv.get("byteOffset", 0)
        blob = data[o:o + bv["byteLength"]]
        mime = img.get("mimeType", "image/png").split("/")[-1]
        outp = f"{OUT}/{name}_img{idx}.{mime}"
        with open(outp, "wb") as f:
            f.write(blob)
        img_files.append((outp, len(blob)))
    return info, img_files

for f in sys.argv[1:]:
    try:
        info, imgs = parse_glb(f)
        print("=" * 70)
        print(f"FILE: {info['file']}  ({info['n_meshes']} meshes, {info['n_nodes']} nodes)")
        print(f"  generator: {info['generator']}")
        print(f"  animations: {info['animations']}")
        print(f"  meshes: {info['meshes'][:12]}")
        print(f"  materials: {info['materials'][:12]}")
        print(f"  nodes: {info['nodes'][:25]}")
        print(f"  extras: {str(info['extras'])[:200]}")
        print(f"  extracted images: {[(os.path.basename(p), s) for p, s in imgs]}")
    except Exception as e:
        print(f"FAIL {f}: {e}")
