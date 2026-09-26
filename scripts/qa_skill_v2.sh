#!/bin/bash
# QA v4 — AI skill pass verification: lap pace, coin collection (new), spin
# resilience, stuck karts. Player parks on the grid; the AI field flows past.
TRACK=${1:-meadow}
SIMS=${2:-150}

agent-browser open http://localhost:3000 > /dev/null 2>&1
agent-browser wait --load networkidle > /dev/null 2>&1
sleep 8

agent-browser eval "(window).__apex.start({mode:'grandprix', trackId:'$TRACK'}); 's'" > /dev/null 2>&1
sleep 4.5

agent-browser eval "(()=>{
  const A=(window).__apex; let st=null;
  const q={t:0,laps:[],last:null,gap:0,resp:0,slow:0,spinF:0,coinMax:0,coinSum:0,coinN:0,drift2:0,boosts:0};
  for(let i=0;i<$SIMS;i++){
    A.step(1); q.t++;
    st=A.state();
    let coinsNow=0;
    for(const k of st.karts){
      if(k.gi&&k.gi.hasG===false)q.gap++;
      if(k.resp)q.resp++;
      if(Math.abs(k.speed)<1.5&&q.t>15&&!k.id.startsWith('player'))q.slow++;
      if(!k.id.startsWith('player')){
        if(k.gi&&k.gi.spin>0)q.spinF++;
        if(k.coins!==undefined){coinsNow+=k.coins; if(k.coins>q.coinMax)q.coinMax=k.coins;}
        if(k.driftLv>=2)q.drift2++;
        if(k.boost)q.boosts++;
      }
    }
    if(q.t>$SIMS*0.5){q.coinSum+=coinsNow;q.coinN++;}
    const L=st.karts.map(x=>x.lap);
    if(q.last===null)q.last=L;
    for(let j=1;j<L.length;j++) if(L[j]>q.last[j]) q.laps.push(q.t+':'+j);
    q.last=L;
  }
  const lapsOf=k=>{const e=[];let prev=0;for(const x of q.laps){const[t,j]=x.split(':');if(+j===k){e.push(+t-prev);prev=+t;}}return e;};
  const l1=[]; for(let j=1;j<12;j++){const e=lapsOf(j); if(e.length)l1.push(e[0]);}
  l1.sort((a,b)=>a-b);
  return JSON.stringify({track:'$TRACK', finalLaps:st.karts.map(k=>k.lap).join(''),
    medianLap1:l1.length?l1[Math.floor(l1.length/2)]:null, minLap1:l1[0]??null, maxLap1:l1[l1.length-1]??null,
    gapFrames:q.gap, respFrames:q.resp, aiSlowSec:q.slow,
    aiSpinFrames:q.spinF, aiAvgCoinsLate:q.coinN?(q.coinSum/q.coinN/11).toFixed(2):null, aiMaxCoins:q.coinMax,
    aiDriftLvl2Frames:q.drift2, aiBoostFrames:q.boosts});
})()" 2>&1 | head -1
