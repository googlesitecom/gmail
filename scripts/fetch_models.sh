#!/usr/bin/env bash
# ============================================================================
# APEX KART — fetch_models.sh
# Descarga todos los .glb/.gltf de un repo de GitHub a public/models/ y
# genera/actualiza public/models/manifest.json automáticamente.
#
# Uso:
#   bash scripts/fetch_models.sh https://github.com/usuario/repo [subcarpeta]
#   bash scripts/fetch_models.sh usuario/repo [subcarpeta]
# ============================================================================
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: bash scripts/fetch_models.sh <repo-url-o-owner/repo> [subcarpeta]"
  exit 1
fi

REPO_RAW="$1"
SUBDIR="${2:-}"
# normaliza a owner/repo
REPO="$(echo "$REPO_RAW" | sed -E 's#https?://(www\.)?github\.com/##; s#\.git$##; s#/$##')"
if [[ "$REPO" != */* ]]; then
  echo "ERROR: se esperaba owner/repo o una URL de GitHub, recibí: $REPO_RAW"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/public/models"
mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo ">> Repo: $REPO  |  Subcarpeta: ${SUBDIR:-<raíz>}  |  Destino: $DEST"

# 1) lista el árbol del repo (rama por defecto) vía API pública
curl -fsSL "https://api.github.com/repos/${REPO}" -o "$TMP/repo.json" || {
  echo "ERROR: no pude leer el repo (¿existe? ¿es privado?)"; exit 1; }
DEFAULT_BRANCH="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("default_branch","main"))' "$TMP/repo.json")"
curl -fsSL "https://api.github.com/repos/${REPO}/git/trees/HEAD?recursive=1" -o "$TMP/tree.json" || {
  echo "ERROR: no pude leer el árbol del repo"; exit 1; }

# 2) extrae las rutas .glb/.gltf
MODELS="$(python3 - "$TMP/tree.json" "$SUBDIR" <<'PY'
import json, sys
tree_path, sub = sys.argv[1], sys.argv[2].strip('/')
try:
    tree = json.load(open(tree_path)).get('tree', [])
except Exception as e:
    print(f"ERROR parseando JSON: {e}", file=sys.stderr); sys.exit(1)
for e in tree:
    p = e.get('path', '')
    if p.lower().endswith(('.glb', '.gltf')) and (not sub or p.startswith(sub)):
        print(p)
PY
)"

if [ -z "$MODELS" ]; then
  echo "AVISO: no encontré archivos .glb/.gltf en el repo (¿subcarpeta correcta?)."
  exit 0
fi

echo ">> Modelos encontrados:"
echo "$MODELS" | sed 's/^/   - /'
echo ">> Rama por defecto: $DEFAULT_BRANCH"

# 3) descarga cada modelo
: > "$TMP/downloaded.txt"
while IFS= read -r path; do
  name="$(basename "$path")"
  url="https://raw.githubusercontent.com/${REPO}/${DEFAULT_BRANCH}/${path// /%20}"
  if curl -fsSL "$url" -o "${DEST}/${name}"; then
    echo "$name" >> "$TMP/downloaded.txt"
    echo "   ok  $name"
  else
    echo "   ERR $name (se omite)"
  fi
done <<< "$MODELS"

# 4) genera el manifest con mapeos razonables (edítalo a gusto)
python3 - "$DEST/manifest.json" "$TMP/downloaded.txt" <<'PY'
import json, sys
dest, list_path = sys.argv[1], sys.argv[2]
names = [l.strip() for l in open(list_path) if l.strip()]
def find(*needles):
    for n in names:
        if all(k in n.lower() for k in needles):
            return f"models/{n}"
    return None
kart = find('kart') or find('standard')
chars = {}
for cid, keys in {'zippy': ['mario'], 'rex': ['dk'], 'magnus': ['bowser']}.items():
    f = find(*keys)
    if f and f != kart:
        chars[cid] = f
if not chars:
    rest = [n for n in names if f"models/{n}" != kart]
    for cid, n in zip(['zippy', 'rex', 'magnus'], rest):
        chars[cid] = f"models/{n}"
manifest = {
    '_doc': 'ModelLibrary de APEX KART — generado por scripts/fetch_models.sh. kart = chasis compartido (se tiñe con el color del jugador); characters = piloto por personaje. Si un modelo de personaje trae kart propio, cámbialo a {"file": "models/x.glb", "includesKart": true}.',
    'kart': kart,
    'kartYaw': 0,
    'tint': 'dominant',
    'characters': chars,
    'props': {},
}
manifest = {k: v for k, v in manifest.items() if v is not None or k in ('_doc', 'kartYaw', 'tint', 'characters', 'props')}
with open(dest, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
print(f'>> manifest.json generado: kart={kart} characters={chars}')
PY

echo ">> Listo. Entra a una carrera y tus modelos aparecerán (o recarga si ya estabas en una)."
