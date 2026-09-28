#!/bin/bash
# APEX KART QA screenshot: starts a session, waits for N rendered frames, captures.
# Usage: bash scripts/qa_shot.sh <trackId> <out.png> [mode] [extra_json] [minFrames]
TRACK=${1:-meadow}
OUT=${2:-/tmp/qa_shot.png}
MODE=${3:-vs}
EXTRA=${4:-}
MINFRAMES=${5:-25}

agent-browser reload > /dev/null 2>&1
agent-browser wait --load networkidle > /dev/null 2>&1
sleep 1.2
agent-browser eval "(window).__apex.start({mode:'$MODE', trackId:'$TRACK'${EXTRA:+, $EXTRA}}); 's'" > /dev/null 2>&1
# wait until the engine actually rendered enough frames
for i in $(seq 1 60); do
  sleep 1
  F=$(agent-browser eval "((window).__apex.state().frames)||0" 2>/dev/null | tr -d '"')
  if [ "${F:-0}" -ge "$MINFRAMES" ]; then break; fi
done
agent-browser screenshot "$OUT" > /dev/null 2>&1
echo "$TRACK: frames=${F:-0} -> $OUT"
