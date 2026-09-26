#!/usr/bin/env python3
"""Deploy v13: CLEAN orphan push to GitHub Pages (same pipeline as v12).

VELOCITY GP v13 "REALITY" — user requests:
 - cockpit camera re-mounted as the F1 T-cam (above/behind the rollhoop —
   was inside the cockpit opening: "can't see the track, all jammed")
 - UnrealBloom REMOVED (user: "ugly bloom instead of realistic sun") —
   real directional sun with deep shadows now
 - EVERY tree casts a shadow (was every 3rd), shadow frustum ±48→±85 m
 - asphalt/grass albedo lifted (photo textures rendered near-black; road
   median 41→95) so sun + shadows actually read
 - fill lights rebalanced (hemi 1.5→0.55, ambient 0.3→0.14, IBL 1.0→0.45)
 - repo AUDIO wired: Triumph in Motion.mp3 (menu anthem, full volume,
   silent in race) + Motor.mp3 (real engine recording, RPM-pitched loop,
   synth stack ducked to support layer)
 - HUD: F1-game full-width RPM LED bar + angular cut-corner panels
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
__next._tree.txt
__next._index.txt
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
MSG = ("VELOCITY GP v13 (orphan limpio): REALITY - cockpit T-cam sobre el "
       "rollhoop (antes dentro del cockpit: no se veia la pista), bloom "
       "ELIMINADO por sol real direccional, TODOS los arboles con sombra "
       "(frustum 48->85 m), albedo asfalto/pasto corregido (near-black -> "
       "sunlit), fill lights rebalanceados (hemi 1.5->0.55, IBL 1.0->0.45), "
       "audio del repo: Triumph in Motion.mp3 (menu a tope, silencio en "
       "carrera) + Motor.mp3 (motor real con pitch por RPM), HUD F1-game "
       "(barra RPM LED completa + paneles angulares)")
commit = subprocess.run(
    'git commit-tree %s -m "%s"' % (tree, MSG),
    shell=True, cwd=ROOT, capture_output=True, text=True).stdout.strip()
if not commit:
    sys.exit('commit-tree failed')
run(f'git update-ref refs/heads/main {commit}')
run('git reset > /dev/null 2>&1 || true')   # sync index with the new HEAD
run('git push -f origin main')
print('DEPLOYED (clean orphan push)')
