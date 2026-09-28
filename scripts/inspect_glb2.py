#!/usr/bin/env python3
"""Determina orientación/escala del coche: centroides de piezas frontales vs traseras y ruedas."""
import json, struct

path = "/tmp/f1_dallara_gp208.glb"
with open(path, "rb") as f:
    data = f.read()

length = struct.unpack_from("<I", data, 8)[0]  # byte 8 = length total
off = 12; chunks = {}
while off < length:
    clen, ctype = struct.unpack_from("<II", data, off)
    chunks[ctype] = data[off+8:off+8+clen]
    off += 8 + clen
g = json.loads(chunks[0x4E4F534A])
bin_chunk = chunks.get(0x004E4942, b"")

# ¿algún nodo tiene transform?
n_trans = sum(1 for n in g["nodes"] if "translation" in n or "rotation" in n or "scale" in n or "matrix" in n)
print(f"nodos con transform propio: {n_trans}/{len(g['nodes'])}")

accessors = g["accessors"]; bufferViews = g["bufferViews"]

def get_positions(mesh_idx):
    """Devuelve (min,max,count) del primer primitive con POSITION."""
    m = g["meshes"][mesh_idx]
    p = m["primitives"][0]
    acc_idx = p["attributes"]["POSITION"]
    acc = accessors[acc_idx]
    return acc.get("min"), acc.get("max"), acc["count"]

# busca nodos por nombre de pieza (el mesh vive en el hijo "defaultMaterial")
def find_nodes(substr):
    out = []
    for i, n in enumerate(g["nodes"]):
        if substr.lower() not in n.get("name", "").lower():
            continue
        mesh_idx = n.get("mesh")
        if mesh_idx is None:  # el mesh está en el hijo
            for c in n.get("children", []):
                if "mesh" in g["nodes"][c]:
                    mesh_idx = g["nodes"][c]["mesh"]
                    break
        if mesh_idx is None:
            continue
        mn, mx, cnt = get_positions(mesh_idx)
        if mn and mx:
            ctr = [(mn[k]+mx[k])/2 for k in range(3)]
            size = [mx[k]-mn[k] for k in range(3)]
            out.append((n["name"], ctr, size, cnt))
    return out

print("\n=== PIEZAS CLAVE (centro, tamaño, vértices) ===")
groups = {
    "FRONT (alerón delantero/ruedas del.": ["Front_Spoiler_Top", "Front_Tire_Rubber", "Front__Spoiler_Sides", "Head_Wings"],
    "REAR (alerón trasero/ruedas tras.)": ["Spoiler_Top", "Back_Tire_Rubber", "Back_spolier_pipes", "Spoiler_Sides"],
    "RUEDA FRONTAL": ["Front_Tire_Rubber"],
    "RUEDA TRASERA": ["Back_Tire_Rubber"],
    "CHASIS": ["Chasse", "F1_Base"],
    "ASIENTO": ["F1_Chair"],
}
for label, keys in groups.items():
    print(f"\n-- {label} --")
    for k in keys:
        for name, ctr, size, cnt in find_nodes(k):
            print(f"  {name:28} ctr=({ctr[0]:8.2f},{ctr[1]:8.2f},{ctr[2]:8.2f}) size=({size[0]:6.1f},{size[1]:6.1f},{size[2]:6.1f}) v={cnt}")

# conclusión automática
front = find_nodes("Front_Spoiler_Top")[0][1]
rear = find_nodes("Spoiler_Top")[0][1]
print(f"\n=== VECTOR FRENTE→ATRÁS ===")
print(f"front_wing ctr: {[round(v,1) for v in front]}")
print(f"rear_wing  ctr: {[round(v,1) for v in rear]}")
d = [front[k]-rear[k] for k in range(3)]
print(f"delta(front-rear): {[round(v,1) for v in d]}")
axis = max(range(3), key=lambda k: abs(d[k]))
print(f"eje longitudinal: {'XYZ'[axis]} (longitud total = |delta| ~ {abs(d[axis]):.0f} unidades)")
print(f"eje vertical probable: el de tamaño {36.6:.1f} (Z)")

# separación entre ruedas delanteras y traseras (wheelbase)
fw = find_nodes("Front_Tire_Rubber")[0][1]
rw = find_nodes("Back_Tire_Rubber")[0][1]
print(f"\nwheelbase delta: {[round(fw[k]-rw[k],1) for k in range(3)]}")
print(f"ancho ruedas: front size={find_nodes('Front_Tire_Rubber')[0][2]}, rear size={find_nodes('Back_Tire_Rubber')[0][2]}")
