#!/bin/bash
# APEX KART QA v3c — headless sim across ALL tracks: lap times, gap flights,
# respawns, stuck karts. Player parks on the grid (karts flow around).
SIMS=${1:-135}

agent-browser open http://localhost:3000 > /dev/null 2>&1
agent-browser wait --load networkidle > /dev/null 2>&1
sleep 8

for TRACK in meadow beach jungle desert factory volcano snow glacier castle city space prism; do
  agent-browser eval "(window).__apex.start({mode:'grandprix', trackId:'$TRACK'}); 's'" > /dev/null 2>&1
  sleep 4.5
  agent-browser eval "(()=>{
    const A=(window).__apex; let st=null;
    const q={t:0,laps:[],last:null,gap:0,resp:0,fly:0,slow:0};
    for(let i=0;i<$SIMS;i++){
      A.step(1); q.t++;
      st=A.state();
      for(const k of st.karts){
        if(k.gi&&k.gi.hasG===false)q.gap++;
        if(!k.grounded&&k.speed>12)q.fly++;
        if(k.resp)q.resp++;
        if(Math.abs(k.speed)<1.5&&q.t>15&&!k.id.startsWith('player'))q.slow++;
      }
      const L=st.karts.map(x=>x.lap);
      if(q.last===null)q.last=L;
      for(let j=1;j<L.length;j++) if(L[j]>q.last[j]) q.laps.push(q.t+':'+j);
      q.last=L;
    }
    // lap-1 times of the AI field (karts 1..11; 0 is the parked player)
    const lapsOf=k=>{const e=[];let prev=0;for(const x of q.laps){const[t,j]=x.split(':');if(+j===k){e.push(+t-prev);prev=+t;}}return e;};
    const l1=[]; for(let j=1;j<12;j++){const e=lapsOf(j); if(e.length)l1.push(e[0]);}
    l1.sort((a,b)=>a-b);
    return JSON.stringify({track:'$TRACK', finalLaps:st.karts.map(k=>k.lap).join(''),
      medianLap1:l1.length?l1[Math.floor(l1.length/2)]:null, minLap1:l1[0]??null, maxLap1:l1[l1.length-1]??null,
      gapFrames:q.gap, flyFrames:q.fly, respFrames:q.resp, aiSlowSec:q.slow});
  })()" 2>&1 | head -1
done