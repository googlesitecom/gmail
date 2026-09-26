#!/usr/bin/env python3
"""Deploy v12: CLEAN orphan push to GitHub Pages (same pipeline as v9).

VELOCITY GP v12 "SPECTACLE" — rebrand (VELOCITY GP + speed-mark logo), F1
motion-graphics intro, arcade handling (grip-capped kinematic steering),
car-car collisions removed (AI soft separation), MSAA+bloom+broadcast LUT+
FXAA+speed-blur post stack, menu music (repo track, full volume at menu,
silent in race), richer V6 engine audio (intake roar + harmonics +
compressors), lower/tighter chase cam.
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
    'git commit-tree %s -m "VELOCITY GP v12 (orphan limpio): SPECTACLE - rebrand VELOCITY GP + logo speed-mark, intro motion-graphics F1 (5 luces + streaks + slam), fisica ARCADE para el jugador (kinematica grip-capped, imposible trompo), colisiones coche-coche ELIMINADAS (separacion suave AI), post-stack MSAA4x + bloom 0.22 + LUT broadcast post-ACES + FXAA + speed-blur radial, musica de menu (Musica_Fondo.mp3 a tope, silencio en carrera) + motor V6 enriquecido (intake roar + armonicos + compresor), chase cam baja/cerrada/rapida con peek"' % tree,
    shell=True, cwd=ROOT, capture_output=True, text=True).stdout.strip()
if not commit:
    sys.exit('commit-tree failed')
run(f'git update-ref refs/heads/main {commit}')
run('git reset > /dev/null 2>&1 || true')   # sync index with the new HEAD
run('git push -f origin main')
print('DEPLOYED (clean orphan push)')
