#!/usr/bin/env bash
# Diagnóstico de bots que no completan vuelta: telemetría de los rezagados.
# Usage: bash scripts/qa_diag.sh <track> [simSeconds] [sampleEvery]
TRACK=${1:-beach}
SIMS=${2:-200}
EVERY=${3:-20}

agent-browser open http://localhost:3000 > /dev/null 2>&1
agent-browser wait --load networkidle > /dev/null 2>&1
sleep 8
agent-browser eval "(window).__apex.start({mode:'grandprix', trackId:'$TRACK'}); 's'" > /dev/null 2>&1
sleep 4.5

echo "== $TRACK: snapshot cada ${EVERY}s de los karts (id, vuelta, s%, vel, lat, onRoad, err, tgt, follow, drift) =="
agent-browser eval "(()=>{
  const A=(window).__apex;
  const out=[];
  for(let i=0;i<$SIMS;i++){
    A.step(1);
    if(i%$EVERY!==0) continue;
    const st=A.state();
    const rows=st.karts.filter(k=>!k.id.startsWith('player')).map(k=>
      k.id.slice(0,6)+' L'+k.lap+' s'+(k.s*100).toFixed(0)+' v'+k.speed.toFixed(0)
      +' lat'+(k.gi?k.gi.lat.toFixed(1):'-')+(k.gi&&k.gi.onRoad?' R':' O')+(k.gi&&k.gi.hasG===false?' VOID':'')
      +' err'+(k.ai?k.ai.err.toFixed(2):'-')+' tgt'+(k.ai?k.ai.targetSpeed.toFixed(0):'-')
      +' fol'+(k.ai&&k.ai.follow>=0?k.ai.follow.toFixed(0):'-')
      +(k.drift?' DRIFT':'')+(k.boost?' BST':'')+(k.gi&&k.gi.spin>0?' SPIN':''));
    out.push('t='+(i+1)+'s | '+rows.join(' | '));
  }
  return out.join('\n');
})()" 2>&1 | head -60
