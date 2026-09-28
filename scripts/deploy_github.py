#!/usr/bin/env python3
"""APEX KART — deploy to googlesitecom/gmail via the GitHub Git Data API.

Builds a COMPLETE tree from a staging directory (so files that no longer
exist locally are removed from the repo automatically) and force-updates
main. The repo then contains exactly:
  - the static build (index.html, _next/, 404, models/…)
  - source/ (full project source)
  - README.md, .nojekyll
"""
import base64
import json
import os
import sys
import time
import urllib.request

def load_token() -> str:
    """Token NEVER lives in this file (GitHub secret scanning rejects it and
    it must not leak into the repo). Read from ~/.ghtoken or env."""
    env = os.environ.get("GH_TOKEN")
    if env:
        return env
    home = os.path.expanduser("~/.ghtoken")
    if os.path.isfile(home):
        return open(home).read().strip()
    raise SystemExit("no token: set GH_TOKEN or write ~/.ghtoken")


TOKEN = load_token()
REPO = "googlesitecom/gmail"
BRANCH = "main"
API = f"https://api.github.com/repos/{REPO}"

# The staging layout is curated explicitly below (out/ -> ., src/ -> source/, …);
# the ONLY extra filter needed is the scripts/ allow-list (QA artifacts AND the
# deploy script itself — it references the token file path — stay local-only).
SCRIPTS_ALLOW: list[str] = []

MAX_BLOB = 90 * 1024 * 1024  # via contents API per-file limit is 100MB; blobs API is fine up to 100MB


def api(method: str, path: str, body=None, raw=False):
    url = f"{API}/{path}" if not path.startswith("http") else path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, method=method, data=data, headers={
        "Authorization": f"token {TOKEN}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "apex-kart-deploy",
    })
    try:
        with urllib.request.urlopen(req) as r:
            payload = r.read()
            return r.status, (payload if raw else (json.loads(payload) if payload else None))
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload)
        except Exception:
            return e.code, payload


def excluded(rel: str) -> bool:
    """True = keep out of the repo. Only the scripts/ subtree is filtered
    (staging top-level copies are already an explicit allow-list)."""
    if rel.startswith("scripts/"):
        return os.path.basename(rel) not in SCRIPTS_ALLOW
    return False


def stage(staging: str):
    """Materialize the exact repo content into staging/."""
    os.makedirs(staging, exist_ok=True)
    root = "/home/z/my-project"
    n = 0

    def copy(rel_src, rel_dst):
        nonlocal n
        src = os.path.join(root, rel_src)
        dst = os.path.join(staging, rel_dst)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if os.path.isdir(src):
            for entry in sorted(os.listdir(src)):
                copy(f"{rel_src}/{entry}", f"{rel_dst}/{entry}")
        elif os.path.isfile(src):
            if excluded(rel_src):
                return
            with open(src, "rb") as f:
                data = f.read()
            with open(dst, "wb") as f:
                f.write(data)
            n += 1

    # 1. static build at repo root
    copy("out", ".")
    # 2. source tree under source/
    for item in ["src", "public", "scripts", "docs"]:
        copy(item, f"source/{item}")
    for f in [".gitignore", "components.json", "eslint.config.mjs", "next.config.ts",
              "package.json", "postcss.config.mjs", "tailwind.config.ts", "tsconfig.json"]:
        if os.path.isfile(os.path.join(root, f)):
            copy(f, f"source/{f}")
    # 3. root extras
    copy("README.md", "README.md")
    with open(os.path.join(staging, ".nojekyll"), "w") as f:
        f.write("")
    n += 1
    return n


def build_tree(staging: str):
    """Create blobs + a full tree for everything in staging."""
    _, ref = api("GET", f"git/ref/heads/{BRANCH}")
    base_commit = ref["object"]["sha"]

    # collect files
    items = []
    for dirpath, _dirs, files in os.walk(staging):
        for fn in files:
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, staging)
            items.append((rel.replace(os.sep, "/"), full))
    items.sort()
    total = len(items)
    print(f"staged files: {total}")

    tree_items = []
    t0 = time.time()
    for i, (rel, full) in enumerate(items):
        with open(full, "rb") as f:
            data = f.read()
        if len(data) > MAX_BLOB:
            print(f"SKIP too big: {rel} ({len(data)})")
            continue
        b64 = base64.b64encode(data).decode()
        status, blob = api("POST", "git/blobs", {
            "content": b64,
            "encoding": "base64",
        })
        if status != 201:
            print(f"BLOB FAIL {rel}: {status} {blob}")
            sys.exit(1)
        tree_items.append({
            "path": rel,
            "mode": "100644",
            "type": "blob",
            "sha": blob["sha"],
        })
        if (i + 1) % 100 == 0:
            print(f"  blobs {i+1}/{total} ({time.time()-t0:.0f}s)")

    status, tree = api("POST", "git/trees", {"base_tree": None, "tree": tree_items})
    if status != 201:
        print(f"TREE FAIL: {status} {tree}")
        sys.exit(1)
    print(f"tree {tree['sha']} with {len(tree_items)} entries")

    status, commit = api("POST", "git/commits", {
        "message": "APEX KART v3: kart GLB + 9 texturas nuevas, choques entre karts, pistas anchas, cascos/habilidades, CPU fill online",
        "tree": tree["sha"],
        "parents": [base_commit],
    })
    if status != 201:
        print(f"COMMIT FAIL: {status} {commit}")
        sys.exit(1)
    print(f"commit {commit['sha']}")

    status, upd = api("PATCH", f"git/refs/heads/{BRANCH}", {
        "sha": commit["sha"],
        "force": True,
    })
    if status != 200:
        print(f"REF FAIL: {status} {upd}")
        sys.exit(1)
    print(f"main -> {commit['sha']} OK")


if __name__ == "__main__":
    staging = "/home/z/my-project/.deploy_stage"
    os.system(f"rm -rf {staging}")
    n = stage(staging)
    print(f"staging ready: {n} files copied")
    build_tree(staging)
