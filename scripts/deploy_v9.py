#!/usr/bin/env python3
"""Deploy v9: CLEAN orphan push to GitHub Pages (same pipeline as v5/v6/v7).

v9 "Red de Seda" — netcode de puppets sobre el reloj del dueño (sin
trabados online), stream 20 Hz, bots del host en un solo mensaje, y visual:
bloom fuera de los temas día, sombras PCF nítidas.
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
    'git commit-tree %s -m "APEX KART v9 (orphan limpio): RED DE SEDA + REALISMO SIN BLOOM - puppets sobre reloj del dueño (offset min-filtrado, Hermite C1, extrapolacion 300ms, follower 18/s, delay adaptativo), stream 20Hz, bots del host en UN mensaje por tick, vy+t en el estado, bloom FUERA de temas dia (neon 0.26/ember 0.30 solo emisivos), sombras PCF r186 radius 4 + frustum ±42 mas nitido"' % tree,
    shell=True, cwd=ROOT, capture_output=True, text=True).stdout.strip()
if not commit:
    sys.exit('commit-tree failed')
run(f'git update-ref refs/heads/main {commit}')
run('git reset > /dev/null 2>&1 || true')   # sync index with the new HEAD
run('git push -f origin main')
print('DEPLOYED (clean orphan push)')
