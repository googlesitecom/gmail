#!/usr/bin/env python3
"""Deploy v4: sync the static build to the repo root + push to GitHub Pages."""
import shutil, subprocess, os, sys

ROOT = '/home/z/my-project'
OUT = f'{ROOT}/source/out'
KEEP = {'.git', '.nojekyll', 'README.md', 'source', 'node_modules', 'scripts',
        'download', 'tool-results', 'upload', 'worklog.md', 'skills', 'db',
        'prisma', 'examples', 'mini-services', '.zscripts', '.next', 'dev.log',
        'Caddyfile', 'docs', 'tests', '.gitignore'}

def run(cmd, **kw):
    print('+', cmd)
    r = subprocess.run(cmd, shell=True, cwd=ROOT, **kw)
    if r.returncode != 0:
        sys.exit(f'FAILED: {cmd}')

# 1) wipe old build artifacts at the root (keep KEEP set)
for entry in os.listdir(ROOT):
    if entry in KEEP or entry.startswith('.git'):
        continue
    p = os.path.join(ROOT, entry)
    if os.path.islink(p):
        os.remove(p)
    elif os.path.isdir(p):
        shutil.rmtree(p)
    else:
        os.remove(p)

# 2) copy the fresh build
for entry in os.listdir(OUT):
    src = os.path.join(OUT, entry)
    dst = os.path.join(ROOT, entry)
    if os.path.isdir(src):
        shutil.copytree(src, dst)
    else:
        shutil.copy2(src, dst)

# 3) ensure .nojekyll (Pages must serve _next/)
open(f'{ROOT}/.nojekyll', 'a').close()

# 4) commit + push
run('git add -A')
run('git commit -m "APEX KART v4: musica de fondo + pistas 30% mas largas y unicas, gradas y terreno arreglados, saltos aterrizables, IA anti-atasco, FX de objetos" || true')
run('git push origin main')
print('DEPLOYED')
