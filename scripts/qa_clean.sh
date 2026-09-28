#!/bin/bash
# APEX KART QA v4 — CLEAN lap-time measurement.
# One synchronous eval per track: steps N sim-seconds WITHOUT interleaved
# rAF frames (the browser's real-time loop used to run between evals and
# double-advance the race, faking impossible lap times).
SIMS=${1:-200}

agent-browser open http://localhost:81 > /dev/null 2>&1
agent-browser wait --load networkidle > /dev/null 2>&1
sleep 8

for TRACK in meadow beach jungle desert factory volcano snow glacier castle city space prism; do
  agent-browser eval "(window).__apex.start({mode:'grandprix', trackId:'$TRACK'}); 's'" > /dev/null 2>&1
  sleep 4.5
  agent-browser eval "(()=>{
    const A=(window).__apex;
    const q={laps:[],last:null,gap:0,fly:0,slow:0};
    let st=null;
    for(let i=0;i<$SIMS;i++){
      A.step(1);
      st=A.state();
      for(const k of st.karts){
        if(k.gi&&k.gi.hasG===false)q.gap++;
        if(!k.grounded&&k.speed>12)q.fly++;
        if(!k.id.startsWith('player')&&Math.abs(k.speed)<1.5&&i>15)q.slow++;
      }
      const L=st.karts.map(x=>x.lap);
      if(q.last===null)q.last=L;
      for(let j=1;j<L.length;j++) if(L[j]>q.last[j]) q.laps.push((i+1)+':'+j);
      q.last=L;
    }
    const lapOf=(j)=>{const e=[];let prev=0;for(const x of q.laps){const[t,k]=x.split(':').map(Number);if(k===j){e.push(t-prev);prev=t;}}return e;};
    const l1=[];
    for(let j=1;j<12;j++){const e=lapOf(j); if(e.length)l1.push(e[0]);}
    l1.sort((a,b)=>a-b);
    const nLaps=q.laps.length;
    return JSON.stringify({track:'$TRACK',
      kartsRacing: nLaps>0 ? Math.round(new Set(q.laps.map(x=>x.split(':')[1])).size) : 0,
      medianLap1: l1.length?l1[Math.floor(l1.length/2)]:null,
      minLap1: l1[0]??null, maxLap1: l1[l1.length-1]??null,
      totalLapEvents: nLaps, gapFrames:q.gap, flyFrames:q.fly, aiSlowSec:q.slow});
  })()" 2>&1 | head -1
done