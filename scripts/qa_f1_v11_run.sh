#!/bin/bash
# APEX GP QA runner: dev server + browser suite in ONE bash session (the
# sandbox reaps background processes when the invoking command exits).
# Usage: bash scripts/qa_f1_v11_run.sh [suite.mjs]
set -u
SUITE="${1:-/home/z/my-project/scripts/qa_f1_v11.mjs}"
cd /home/z/my-project/source

# no double-start
if curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ --max-time 3 2>/dev/null | grep -q 200; then
  echo "server already up"
else
  rm -f /tmp/apex_dev.log
  bun run dev > /tmp/apex_dev.log 2>&1 &
fi
cleanup() { pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; }
trap cleanup EXIT

code=000
for i in $(seq 1 150); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ --max-time 5 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 1
done
if [ "$code" != "200" ]; then echo "SERVER FAILED (last code $code)"; tail -20 /tmp/apex_dev.log; exit 2; fi
echo "server up (HTTP $code)"

NODE_PATH=/home/z/.npm-global/lib/node_modules node "$SUITE"
STATUS=$?
exit $STATUS
