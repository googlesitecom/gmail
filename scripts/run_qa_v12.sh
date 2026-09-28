#!/bin/bash
# run_qa_v12.sh — ensure dev server up (same session) + run a QA script
# usage: ./run_qa_v12.sh <script.mjs> [extra node args]
set -u
cd /home/z/my-project/source
if ! curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ --max-time 3 2>/dev/null | grep -q 200; then
  echo "[runner] starting dev server (this session owns it)…"
  rm -f dev.log
  bun run dev > dev.log 2>&1 &
  SRV_PID=$!
  for i in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ --max-time 3 2>/dev/null)
    [ "$code" = "200" ] && break
    sleep 2
  done
  echo "[runner] server up ($code)"
  sleep 12   # let turbopack warm the entry
fi
cd /home/z/my-project
NODE_PATH=/home/z/my-project/source/node_modules node "scripts/$1" ${2:-}
