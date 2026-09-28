#!/bin/bash
# APEX KART QA driver v2: starts a session directly via the debug hook.
# Usage: bash scripts/qa_race.sh [trackId] [seconds] [interval] [mode] [extra_json]
TRACK=${1:-meadow}
SECONDS_TOTAL=${2:-60}
INTERVAL=${3:-10}
MODE=${4:-grandprix}
EXTRA=${5:-}

agent-browser reload > /dev/null 2>&1
agent-browser wait --load networkidle > /dev/null 2>&1
sleep 1
agent-browser eval "(window).__apex.start({mode:'$MODE', trackId:'$TRACK'${EXTRA:+, $EXTRA}}); 'started'" 2>&1 | head -1
sleep 4.6
agent-browser eval "window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyW'})); 'go'" > /dev/null 2>&1

START=$SECONDS
while [ $((SECONDS - START)) -lt "$SECONDS_TOTAL" ]; do
  sleep "$INTERVAL"
  agent-browser eval "(()=>{const st=(window).__apex.state(); if(!st.karts.length) return JSON.stringify({phase:st.phase}); return JSON.stringify({t:$((SECONDS-START)), phase:st.phase, laps:st.karts.map(k=>k.lap).join(''), maxS:+Math.max(...st.karts.map(k=>k.s)).toFixed(2), avgSpd:+(st.karts.reduce((a,k)=>a+k.speed,0)/st.karts.length).toFixed(1), pRank:st.karts[0].rank});})()" 2>&1 | head -1
done
