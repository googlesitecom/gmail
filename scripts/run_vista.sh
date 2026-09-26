#!/bin/bash
# start server + vista probe + VLM in ONE session (sandbox reaps bg processes)
set -u
cd /home/z/my-project/source
if curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ --max-time 3 2>/dev/null | grep -q 200; then
  echo "server already up"
else
  rm -f /tmp/apex_dev.log
  nohup bun run dev > /tmp/apex_dev.log 2>&1 &
fi
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ --max-time 3 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 2
done
sleep 15   # let turbopack finish compiling the edited modules
node /home/z/my-project/scripts/probe_vista.mjs 2>&1 | tail -4
cd /home/z/my-project/scripts
NODE_PATH=/home/z/my-project/source/node_modules node vlm_vista.js qa/v11/vista_clear.png qa/v11/vista_rain.png 2>&1
