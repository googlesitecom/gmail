#!/bin/bash
# APEX KART QA v3 — track redesign validation.
# 1) Real-time race on a track: AI lap times, flying-at-gap samples, respawns.
# 2) Mid-race screenshots for visual verification.
# Usage: bash scripts/qa_tracks_v3.sh <trackId> <driveSeconds> <shotEverySec>
TRACK=${1:-meadow}
DRIVE=${2:-210}
SHOT_EVERY=${3:-30}

OUTDIR=/home/z/my-project/scripts/qa
mkdir -p "$OUTDIR"

agent-browser open http://localhost:3000 > /dev/null 2>&1
agent-browser wait --load networkidle > /dev/null 2>&1
sleep 6
agent-browser eval "(window).__apex.start({mode:'grandprix', trackId:'$TRACK'}); 'started'" 2>&1 | head -1
sleep 4.6
agent-browser eval "window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyW'})); 'go'" > /dev/null 2>&1

START=$SECONDS
LASTLAP=""
SHOT=0
while [ $((SECONDS - START)) -lt "$DRIVE" ]; do
  sleep 10
  T=$((SECONDS - START))
  # leader lap + any kart flying a gap + respawns + stuck karts
  agent-browser eval "(()=>{
    const st=(window).__apex.state(); if(!st.karts.length) return JSON.stringify({t:$T, phase:st.phase});
    const k=st.karts;
    const laps=k.map(x=>x.lap).join('');
    const lead=k.reduce((a,b)=>b.totalM===undefined?a:b);
    const flying=k.filter(x=>x.gi&&x.gi.jump===false&&x.grounded===false&&x.speed>12).length;
    const onGap=k.filter(x=>x.gi&&x.gi.hasG===false).length;
    const resp=k.filter(x=>x.resp===true).length;
    const slow=k.filter(x=>Math.abs(x.speed)<2).length;
    return JSON.stringify({t:$T, phase:st.phase, laps:laps, flying, onGap, resp, slow,
      p:{s:k[0].s, lap:k[0].lap, spd:k[0].speed, g:k[0].grounded}});
  })()" 2>&1 | head -1
  # screenshot at intervals
  if [ $((T % SHOT_EVERY)) -lt 10 ]; then
    SHOT=$((SHOT+1))
    agent-browser screenshot "$OUTDIR/v3_${TRACK}_$SHOT.png" > /dev/null 2>&1
  fi
done
echo "done $TRACK"