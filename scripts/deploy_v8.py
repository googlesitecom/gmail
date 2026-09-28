#!/usr/bin/env python3
"""Deploy v8: CLEAN orphan push to GitHub Pages (same pipeline as v5/v6/v7).

v8 "Realismo + Feeling de Campeonato" — implementación de las fases 1-2 del
informe de consultoría: game feel MK8 (hop, steering ramp, mini-turbo,
salida graduada, spin por colisión, rebufo) + dirección visual realista
(PMREM, PBR mojado, clearcoat, sombras suaves, hora dorada).
"""
import os, subprocess, sys

ROOT = '/home/z/my-project'
OUT = f'{ROOT}/source/out'

GITIGNORE = """.next/
node_modules/
skills/
mini-services/
tool-results/
download/
upload/
db/
prisma/
examples/
.zscripts/
dev.log
server.log
Caddyfile
docs/
tests/
__next.__PAGE__.txt
__next._full.txt
__next._head.txt
__next._index.txt
__next._tree.txt
index.txt
_next.__PAGE__.txt
"""

def run(cmd, **kw):
    print('+', cmd)
    r = subprocess.run(cmd, shell=True, cwd=ROOT, **kw)
    if r.returncode != 0:
        sys.exit(f'FAILED: {cmd}')

# 0) sanity: a fresh build must exist
if not os.path.isfile(f'{OUT}/index.html'):
    sys.exit('source/out/index.html missing — build first')

KEEP = {'.git', '.nojekyll', 'README.md', 'source', 'node_modules', 'scripts',
        'download', 'tool-results', 'upload', 'worklog.md', 'skills', 'db',
        'prisma', 'examples', 'mini-services', '.zscripts', '.next', 'dev.log',
        'Caddyfile', 'docs', 'tests', '.gitignore', '.env*'}

# 1) wipe old build artifacts at the root (keep KEEP set + dotfiles)
for entry in os.listdir(ROOT):
    if entry in KEEP or entry.startswith('.git'):
        continue
    p = os.path.join(ROOT, entry)
    if os.path.islink(p):
        os.remove(p)
    elif os.path.isdir(p):
        import shutil; shutil.rmtree(p)
    else:
        os.remove(p)

# 2) copy the fresh build
import shutil
for entry in os.listdir(OUT):
    src = os.path.join(OUT, entry)
    dst = os.path.join(ROOT, entry)
    if os.path.isdir(src):
        shutil.copytree(src, dst)
    else:
        shutil.copy2(src, dst)

# 3) .nojekyll (Pages must serve _next/) + tight .gitignore
open(f'{ROOT}/.nojekyll', 'a').close()
open(f'{ROOT}/.gitignore', 'w').write(GITIGNORE)

# 4) orphan commit: single clean commit on top of NOTHING
run('git rm -rf --cached . > /dev/null 2>&1 || true')
run('git add -A')
n_files = subprocess.run('git ls-files | wc -l', shell=True, cwd=ROOT,
                         capture_output=True, text=True).stdout.strip()
print(f'tracked files in clean commit: {n_files}')
tree = subprocess.run('git write-tree', shell=True, cwd=ROOT,
                      capture_output=True, text=True).stdout.strip()
commit = subprocess.run(
    'git commit-tree %s -m "APEX KART v8 (orphan limpio): REALISMO + FEELING MK8 - hop de entrada MK8 con drift al presionar, steering ramp+expo, mini-turbo 0.65/1.5/2.6, salida turbo graduada, spin por T-bone, rebufo con estelas, PMREM env por tema, asfalto PBR mojado con roughness map, carrocerias clearcoat (GLB lazy-export arreglado), sombras suaves PCF + blob, hora dorada, karts del menu visibles (framing fix), hitboxes de items generosas"' % tree,
    shell=True, cwd=ROOT, capture_output=True, text=True).stdout.strip()
if not commit:
    sys.exit('commit-tree failed')
run(f'git update-ref refs/heads/main {commit}')
run('git reset > /dev/null 2>&1 || true')   # sync index with the new HEAD
run('git push -f origin main')
print('DEPLOYED (clean orphan push)')
