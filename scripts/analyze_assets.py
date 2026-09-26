#!/usr/bin/env python3
"""Analiza las 3 texturas JPG y computa bounds en MUNDO del GLB aplicando matrices de nodo."""
import json, struct
from PIL import Image
import numpy as np

print("========== TEXTURAS ==========")
for name in ["AsfaltoF1", "Borde_PistaF1", "PastoF1"]:
    im = Image.open(f"/tmp/{name}.jpg").convert("RGB")
    a = np.asarray(im, dtype=np.float32)
    mean = a.mean(axis=(0, 1))
    # color medio por franjas horizontales (para detectar estrías tipo kerb rojo/blanco)
    rows = a.mean(axis=(1, 2))
    thirds = [a[:, :a.shape[1]//3].mean(axis=(0,1)), a[:, a.shape[1]//3:2*a.shape[1]//3].mean(axis=(0,1)), a[:, 2*a.shape[1]//3:].mean(axis=(0,1))]
    # detección de rojo/blanco (kerb): % de pixeles muy rojos y muy blancos
    red_pct = ((a[:,:,0] > 150) & (a[:,:,1] < 90) & (a[:,:,2] < 90)).mean() * 100
    white_pct = ((a[:,:,0] > 200) & (a[:,:,1] > 200) & (a[:,:,2] > 200)).mean() * 100
    green_pct = ((a[:,:,1] > 100) & (a[:,:,1] > a[:,:,0] + 20) & (a[:,:,1] > a[:,:,2] + 20)).mean() * 100
    print(f"{name}: media RGB=({mean[0]:.0f},{mean[1]:.0f},{mean[2]:.0f}) tercios={[tuple(round(x) for x in t) for t in thirds]}")
    print(f"   rojo={red_pct:.1f}% blanco={white_pct:.1f}% verde={green_pct:.1f}%")

print("\n========== GLB WORLD BOUNDS (con matrices) ==========")
path = "/tmp/f1_dallara_gp208.glb"
data = open(path, "rb").read()
length = struct.unpack_from("<I", data, 8)[0]
off = 12; chunks = {}
while off < length:
    clen, ctype = struct.unpack_from("<II", data, off)
    chunks[ctype] = data[off+8:off+8+clen]
    off += 8 + clen
g = json.loads(chunks[0x4E4F534A])
accessors = g["accessors"]

def node_matrix(n):
    if "matrix" in n:
        m = np.array(n["matrix"], dtype=np.float64).reshape(4, 4).T  # column-major
    else:
        m = np.eye(4)
        if "scale" in n:
            m = m @ np.diag(n["scale"] + [1])
        if "rotation" in n:
            x, y, z, w = n["rotation"]
            # quaternion → matriz rotación
            R = np.array([
                [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)],
            ])
            m = m @ np.vstack([np.hstack([R, np.zeros((3,1))]), [[0,0,0,1]]])
        if "translation" in n:
            T = np.eye(4); T[:3,3] = n["translation"]
            m = m @ T
    return m

def mesh_local_bbox(mi):
    p = g["meshes"][mi]["primitives"][0]
    acc = accessors[p["attributes"]["POSITION"]]
    return np.array(acc["min"]), np.array(acc["max"])

def world_bbox(node_idx, parent_m):
    n = g["nodes"][node_idx]
    m = parent_m @ node_matrix(n)
    boxes = []
    if "mesh" in n:
        mn, mx = mesh_local_bbox(n["mesh"])
        corners = np.array([[x,y,z,1] for x in (mn[0],mx[0]) for y in (mn[1],mx[1]) for z in (mn[2],mx[2])])
        wc = (m @ corners.T).T
        boxes.append((wc[:,:3].min(axis=0), wc[:,:3].max(axis=0)))
    for c in n.get("children", []):
        boxes.extend(world_bbox(c, m))
    return boxes

scene = g["scenes"][g.get("scene", 0)]
all_boxes = []
for r in scene["nodes"]:
    all_boxes.extend(world_bbox(r, np.eye(4)))

gmin = np.min([b[0] for b in all_boxes], axis=0)
gmax = np.max([b[1] for b in all_boxes], axis=0)
print(f"COCHES ENTERO: min={np.round(gmin,2)} max={np.round(gmax,2)} size={np.round(gmax-gmin,2)}")

# bounds por pieza (match por NOMBRE del nodo; mesh puede estar en descendientes)
def part_world_bbox(substr):
    out = []
    def collect_mesh_boxes(n, m):
        boxes = []
        nm_id = node_matrix(n)
        mm = m @ nm_id
        if "mesh" in n:
            mn, mx = mesh_local_bbox(n["mesh"])
            corners = np.array([[x,y,z,1] for x in (mn[0],mx[0]) for y in (mn[1],mx[1]) for z in (mn[2],mx[2])])
            wc = (mm @ corners.T).T
            boxes.append((wc[:,:3].min(axis=0), wc[:,:3].max(axis=0)))
        for c in n.get("children", []):
            boxes.extend(collect_mesh_boxes(g["nodes"][c], mm))
        return boxes
    def walk(idx, parent_m):
        n = g["nodes"][idx]
        m = parent_m @ node_matrix(n)
        if substr.lower() in n.get("name", "").lower():
            for bmin, bmax in collect_mesh_boxes(n, parent_m):
                out.append((n.get("name",""), bmin, bmax))
            return  # no descender más (evita duplicar hijos defaultMaterial)
        for c in n.get("children", []):
            walk(c, m)
    for r in scene["nodes"]:
        walk(r, np.eye(4))
    return out

for part in ["Front_Tire_Rubber", "Back_Tire_Rubber", "AlloysFront_low", "AlloysBack_low",
             "Front_Spoiler_Top", "Spoiler_Top", "F1_Base", "F1_Chair", "Chasse", "Back_spolier"]:
    for nm, mn, mx in part_world_bbox(part):
        print(f"{nm:28} min={np.round(mn,2)} max={np.round(mx,2)} size={np.round(mx-mn,2)}")

# conclusión de ejes
print("\n=== CONCLUSIÓN ===")
size = gmax - gmin
axes = ["X", "Y", "Z"]
print(f"eje más largo (longitud coche): {axes[int(np.argmax(size))]} ({size.max():.1f})")
print(f"eje más corto (altura): {axes[int(np.argmin(size))]} ({size.min():.1f})")
