#!/bin/bash
# APEX KART QA v3b — headless race metrics via __apex.step.
# The idle player parks on the grid (karts flow around it once), so AI
# lap times are clean. Collects: gap-flight samples, airborne samples,
# respawns, lap timeline.
# Usage: bash scripts/qa_metrics.sh <trackId> <simSeconds>
TRACK=${1:-meadow}
SIMS=${2:-140}

agent-browser open http://localhost:3000 > /dev/null 2>&1
agent-browser wait --load networkidle > /dev/null 2>&1
sleep 6
agent-browser eval "(window).__apex.start({mode:'grandprix', trackId:'$TRACK'}); 'started'" > /dev/null 2>&1
sleep 5   # real-time countdown
agent-browser eval "window.__qa={gap:0,resp:0,fly:0,slow:0,laps:[],last:null,t:0}; 'init'" > /dev/null 2>&1

for i in $(seq 1 "$SIMS"); do
  agent-browser eval "(()=>{
    const A=(window).__apex, q=(window).__qa;
    A.step(1); q.t+=1;
    const st=A.state();
    for(const k of st.karts){
      if(k.gi && k.gi.hasG===false) q.gap++;
      if(!k.grounded && k.speed>12) q.fly++;
      if(k.resp===true) q.resp++;
      if(Math.abs(k.speed)<1.5 && q.t>12) q.slow++;
    }
    const laps=st.karts.map(x=>x.lap);
    if(q.last===null) q.last=laps;
    for(let j=0;j<laps.length;j++) if(laps[j]>q.last[j]) q.laps.push(q.t+'s:k'+j+':L'+laps[j]);
    q.last=laps;
    return JSON.stringify({t:q.t,laps:laps.join(''),gap:q.gap,fly:q.fly,resp:q.resp,slow:q.slow});
  })()" 2>&1 | head -1
done
echo "--- lap timeline:"
agent-browser eval "(window).__qa.laps.join(' | ')" 2>&1 | head -1
echo "done $TRACK"