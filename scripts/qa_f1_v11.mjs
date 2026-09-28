// VELOCITY GP v12 in-browser QA: start-integrity, launch discipline,
// continuous standings, ARCADE handling stability, and NO car-car collisions
// (cars overlap freely by design — walls still collide).
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:3000/';
const SHOT = '/home/z/my-project/scripts/qa/v10_1';
fs.mkdirSync(SHOT, { recursive: true });
const results = [];
const log = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? '✓' : '✗'} ${name}${info ? ' — ' + info : ''}`);
};

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
let pageErrors = 0;
page.on('console', m => {
  const t = m.text();
  if (/error|Error|ERROR/.test(t) && !/favicon/.test(t)) { pageErrors++; console.log('  [console]', t.slice(0, 180)); }
});
page.on('pageerror', e => { pageErrors++; console.log('  [pageerror]', String(e).slice(0, 220)); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.evaluate(() => window.__vgpIntro?.skip());   // dismiss the F1 intro (QA)
await page.waitForTimeout(400);
log('boot + __apex', await page.evaluate(() => !!(window.__apex && window.__apex.game)));
const ver = await page.evaluate(() => window.__apex.version);
log('version v12.0 (bundle freshness)', ver === 'velocitygp-v13.0', ver);

// in-page probe helpers (SAT identical to the game's obbContact)
await page.evaluate(() => {
  window.__probe = {
    obb(ax, az, ayaw, bx, bz, byaw, hl, hw) {
      const aux = Math.sin(ayaw), auz = Math.cos(ayaw), arx = Math.cos(ayaw), arz = -Math.sin(ayaw);
      const bux = Math.sin(byaw), buz = Math.cos(byaw), brx = Math.cos(byaw), brz = -Math.sin(byaw);
      const dx = bx - ax, dz = bz - az;
      let nx = 0, nz = 0, depth = Infinity;
      const test = (ux, uz) => {
        const ra = hl * Math.abs(ux * aux + uz * auz) + hw * Math.abs(ux * arx + uz * arz);
        const rb = hl * Math.abs(ux * bux + uz * buz) + hw * Math.abs(ux * brx + uz * brz);
        const d = dx * ux + dz * uz;
        const o = ra + rb - Math.abs(d);
        if (o <= 0) return false;
        if (o < depth) { depth = o; const sg = d >= 0 ? 1 : -1; nx = ux * sg; nz = uz * sg; }
        return true;
      };
      if (!test(aux, auz)) return null;
      if (!test(arx, arz)) return null;
      if (!test(bux, buz)) return null;
      if (!test(brx, brz)) return null;
      return { nx, nz, depth };
    },
    pairs() {
      const cars = window.__apex.game().cars;
      let worst = 0, worstPair = null;
      for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        if (dx * dx + dz * dz > 144) continue;
        const h = window.__probe.obb(a.pos.x, a.pos.z, a.yaw, b.pos.x, b.pos.z, b.yaw, 2.7, 1.0);
        if (h && h.depth > worst) { worst = h.depth; worstPair = [a.id, b.id]; }
      }
      return { worst: +worst.toFixed(3), worstPair };
    },
    lat(car) { return window.__apex.game().world.spline.project(car.pos, -1).lateral; },
    lineLat(car) {
      const g = window.__apex.game();
      const N = g.world.racingLine.count;
      const idx = g.world.spline.indexAtS(((car.progressS % 1) + 1) % 1) % N;
      return g.world.racingLine.lat[idx];
    },
    gap(a, b) { const g = window.__apex.game(); return g.race.states.get(b.id).totalM - g.race.states.get(a.id).totalM; },
  };
  return 'probe-ready';
});

const throughLights = () => page.evaluate(() => window.__apex.step(9));
/** step exactly to just before lights-out (goAtMs is real-clock based) */
const stepToGo = () => page.evaluate(() => {
  const r = window.__apex.race();
  const remain = Math.max(0.05, (r.goAtMs - performance.now()) / 1000 - 0.06);
  return window.__apex.step(remain);
});
const onTrackGap = (a, b) => page.evaluate(([ia, ib]) => {
  const g = window.__apex.game();
  const len = g.world.spline.length;
  const raw = g.race.states.get(ib).totalM - g.race.states.get(ia).totalM;
  return ((raw % len) + len) % len;
}, [a, b]);

// ===================== 1. GRID INTEGRITY (20 cars) ============================
await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 5, aiCount: 19, aiLevel: 'medium' }));
await page.waitForTimeout(2000);
let st = await page.evaluate(() => window.__apex.state());
log('grid formed (20 cars)', st.cars.length === 20, `${st.cars.length} coches`);
const ranks = st.cars.map(c => c.rank).sort((a, b) => a - b);
log('grid ranks unique 1..20 (tower correct pre-race)',
  ranks.length === 20 && ranks.every((r, i) => r === i + 1), `ranks ${ranks.slice(0, 5).join(',')}…`);
const stOk = await page.evaluate(() => {
  const g = window.__apex.game();
  const rows = [...g.race.states.entries()].map(([id, s]) => ({ id, totalM: s.totalM, pos: s.position }))
    .sort((a, b) => a.pos - b.pos);
  // same-row cars sit side by side → equal totalM is CORRECT; only demand
  // non-increasing order (nobody behind on the grid shows more progress)
  let mono = true;
  for (let i = 1; i < rows.length; i++) if (rows[i].totalM > rows[i - 1].totalM + 0.5) mono = false;
  return { mono, first: +rows[0].totalM.toFixed(1), last: +rows[rows.length - 1].totalM.toFixed(1), posOk: rows.every((r, i) => r.pos === i + 1) };
});
log('race states ordered by grid (totalM monotonic)', stOk.mono && stOk.posOk,
  `P1 ${stOk.first} m … P20 ${stOk.last} m (offsets negativos detrás de la línea)`);
const gridPen = await page.evaluate(() => window.__probe.pairs());
log('grid formed without deep overlap (≤ 0.15 m)', gridPen.worst <= 0.15, `max pen ${gridPen.worst} m`);
await page.screenshot({ path: `${SHOT}/01_grid.png` });

// ===================== 2. LAUNCH DISCIPLINE ====================================
await page.evaluate(() => window.__apex.auto(true));   // the player races too!
await stepToGo();
let launchPen = 0, launchSpins = 0, launchOff = 0;
for (let t = 0; t < 3; t++) {
  await page.evaluate(() => window.__apex.step(1));
  const s = await page.evaluate(() => ({
    pen: window.__probe.pairs().worst,
    spin: window.__apex.state().cars.filter(c => c.spin > 0).length,
    off: window.__apex.state().cars.filter(c => c.off).length,
    minK: Math.min(...window.__apex.state().cars.map(c => c.kmh)),
  }));
  launchPen = Math.max(launchPen, s.pen);
  launchSpins += s.spin;
  launchOff += s.off;
  if (t === 1) {
    await page.screenshot({ path: `${SHOT}/02_launch_2s.png` });
    log('field rolling at +2 s', s.minK > 12, `mín ${Math.round(s.minK)} km/h`);
  }
}
log('launch: overlap bounded (ghosting, < 2.6 m)', launchPen <= 2.6, `max pen ${launchPen.toFixed(3)} m (separación suave AI)`);
log('launch: nobody spins in the first 3 s', launchSpins === 0, `${launchSpins} muestras con spin`);
log('launch: nobody off-track in the first 3 s', launchOff === 0, `${launchOff} muestras off`);
// T1 chaos check (looser — 20-car first corners are always spicy)
let t1Spins = 0;
for (let t = 0; t < 4; t++) {
  await page.evaluate(() => window.__apex.step(1));
  t1Spins = Math.max(t1Spins, await page.evaluate(() => window.__apex.state().cars.filter(c => c.spin > 0).length));
}
log('T1: incidents bounded (≤ 2 spinning at once)', t1Spins <= 2, `máx ${t1Spins} en spin`);

// ===================== 3. STANDINGS ACROSS THE START LINE ======================
// sample ranks/totalM every 2 s for 20 s: the first line crossing must NOT
// scramble the order (the old totalM formula dropped the leader to last)
const series = [];
for (let t = 0; t < 10; t++) {
  await page.evaluate(() => window.__apex.step(2));
  const s = await page.evaluate(() => {
    const st = window.__apex.state();
    return { cars: st.cars.map(c => ({ id: c.id, rank: c.rank })), states: st.race.states.map(x => ({ id: x.id, totalM: x.totalM })) };
  });
  series.push(s);
}
let maxDrop = 0, maxLost = 0;
for (let t = 1; t < series.length; t++) {
  const prev = new Map(series[t - 1].cars.map(c => [c.id, c.rank]));
  for (const c of series[t].cars) maxDrop = Math.max(maxDrop, prev.get(c.id) - c.rank);
  const prevM = new Map(series[t - 1].states.map(x => [x.id, x.totalM]));
  for (const x of series[t].states) maxLost = Math.max(maxLost, prevM.get(x.id) - x.totalM);
}
log('no totalM collapse at the line (loss < 150 m / 2 s)', maxLost < 150,
  `peor pérdida ${maxLost.toFixed(1)} m (el bug viejo perdía ~2.4 km; >50 m = spin deslizándose atrás)`);
log('no rank collapse > 8 places / 2 s at the start', maxDrop <= 8, `peor caída ${maxDrop} plazas`);
const leaderEarly = series[0].cars.find(c => c.rank === 1);
const leaderLate = series[series.length - 1].cars.find(c => c.id === leaderEarly.id);
log('early leader stays in the top 5 after the line', leaderLate.rank <= 5, `P1@+4s → P${leaderLate.rank}@+24s`);

// ===================== 4. NO CAR-CAR COLLISIONS (v12 design) ==================
// The player rams a slow bot at 85 m/s: cars must pass THROUGH each other —
// no spin, no impulse, no scrub. Walls still collide (checked separately).
await page.evaluate(() => { window.__apex.auto(false); window.__apex.ctrl(null); });
await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 3, aiCount: 1 }));
await page.waitForTimeout(1600);
await throughLights();
const s0 = await page.evaluate(() => {
  // center of the straightest ~100 m stretch on the circuit
  const g = window.__apex.game();
  const line = g.world.racingLine, N = line.count;
  let best = 0, bestCurv = Infinity;
  for (let i = 0; i < N; i++) {
    let mc = 0;
    for (let k = 0; k < 40; k++) mc = Math.max(mc, Math.abs(line.curv[(i + k) % N]));
    if (mc < bestCurv) { bestCurv = mc; best = i; }
  }
  const spacing = g.world.spline.length / N;
  return (((best + 20) % N) * spacing) / g.world.spline.length;
});
await page.evaluate(s0v => {
  const g = window.__apex.game();
  const sp = g.world.spline, len = sp.length;
  const bot = g.cars.find(c => !c.isPlayer), player = g.cars[0];
  const smB = sp.sampleAt(s0v);
  bot.placeAt(sp.roadPoint(s0v, 0), Math.atan2(smB.tangent.x, smB.tangent.z));
  bot.vLong = 20;
  const sP = (((s0v - 75 / len) % 1) + 1) % 1;
  const smP = sp.sampleAt(sP);
  player.placeAt(sp.roadPoint(sP, 0), Math.atan2(smP.tangent.x, smP.tangent.z));
  player.vLong = 85;
  // keep the accumulated race distance coherent with the teleport (lastS!)
  const sBot = g.race.states.get(bot.id), sPl = g.race.states.get(player.id);
  sBot.lastS = s0v; sPl.lastS = sP;
  sBot.totalM = sPl.totalM + 75;
}, s0);
await page.evaluate(() => window.__apex.ctrl({ throttle: 1, steer: 0 }));
const hit = [];
for (let t = 0; t < 24; t++) {
  await page.evaluate(() => window.__apex.step(0.1));
  const s = await page.evaluate(() => {
    const g = window.__apex.game();
    const p = g.cars[0], b = g.cars.find(c => !c.isPlayer);
    return {
      pv: +p.vLong.toFixed(1), bv: +b.vLong.toFixed(1), spin: +(b.spinT || 0).toFixed(2), pspin: +(p.spinT || 0).toFixed(2),
      gap: +window.__probe.gap(p, b).toFixed(1), pen: window.__probe.pairs().worst,
      blat: +window.__probe.lat(b).toFixed(2),
    };
  });
  hit.push(s);
}
const preSpeed = hit[0].pv;
const contactIdx = hit.findIndex(s => s.gap < 8);
const afterAll = contactIdx >= 0 ? hit.slice(contactIdx) : [];
const minPvAfter = afterAll.length ? Math.min(...afterAll.map(s => s.pv)) : null;
const anySpin = hit.some(s => s.spin > 0 || s.pspin > 0);
const endedAhead = hit[hit.length - 1].gap < -5;
log('cars pass through each other (no collision response)',
  contactIdx >= 0 && !anySpin,
  `contact @${contactIdx} · spins ${anySpin}`);
log('no impulse/scrub on overlap (arcade ghosting)',
  contactIdx >= 0 && minPvAfter !== null && minPvAfter > preSpeed - 5,
  `vel ${Math.round(preSpeed)} → min ${Math.round(minPvAfter ?? -1)} m/s durante el cruce`);
log('player completes the overtake through the bot', endedAhead,
  endedAhead ? 'pasó limpiamente a través' : 'no pasó');
await page.screenshot({ path: `${SHOT}/03_rearend_aftermath.png` });

// ===================== 5. SIDE-BY-SIDE: NO PHYSICAL PUSH =======================
await page.evaluate(() => window.__apex.ctrl(null));
await page.evaluate(s0v => {
  const g = window.__apex.game();
  const sp = g.world.spline;
  const bot = g.cars.find(c => !c.isPlayer), player = g.cars[0];
  const sm = sp.sampleAt(s0v);
  const yaw = Math.atan2(sm.tangent.x, sm.tangent.z);
  bot.placeAt(sp.roadPoint(s0v, -0.5), yaw); bot.vLong = 30;
  player.placeAt(sp.roadPoint(s0v, 0.5), yaw); player.vLong = 30;
  const sBot = g.race.states.get(bot.id), sPl = g.race.states.get(player.id);
  sBot.lastS = s0v; sPl.lastS = s0v;
  sBot.totalM = sPl.totalM;
  g.aiDrivers.delete(bot.id);           // bot holds straight — deterministic
}, s0);
await page.evaluate(() => window.__apex.ctrl({ throttle: 1, steer: 0 }));
const rub = [];
for (let t = 0; t < 10; t++) {
  await page.evaluate(() => window.__apex.step(0.1));
  rub.push(await page.evaluate(() => {
    const g = window.__apex.game();
    const p = g.cars[0], b = g.cars.find(c => !c.isPlayer);
    return {
      sep: Math.abs(window.__probe.lat(p) - window.__probe.lat(b)),
      pen: window.__probe.pairs().worst,
      spin: +(p.spinT || 0).toFixed(2) + +(b.spinT || 0).toFixed(2),
    };
  }));
}
const rubMaxPen = Math.max(...rub.map(s => s.pen));
log('side-by-side overlap: no separation force (v12 arcade)',
  rubMaxPen >= 0.8,                       // persistent overlap = no SAT response
  `max pen ${rubMaxPen.toFixed(3)} m (par jugador-bot: se solapan sin separarse)`);
log('side overlap stays spin-free', rub.every(s => s.spin === 0));
await page.evaluate(() => { window.__apex.ctrl(null); window.__apex.auto(false); });

// ===================== 5b. ARCADE HANDLING STABILITY ===========================
// Full-lock steering pulses on the STRAIGHT (no walls in play): yawRate must
// stay grip-capped, no spin, lateral slip glued ~0. (Walls still collide by
// design — tested implicitly by the off-track recovery suite.)
await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 3, aiCount: 0 }));
await page.waitForTimeout(1500);
await throughLights();
const arcade = await page.evaluate(() => {
  const g = window.__apex.game();
  const p = g.cars[0];
  // straightest stretch on the circuit (same method as §4)
  const line = g.world.racingLine, N = line.count;
  let best = 0, bestCurv = Infinity;
  for (let i = 0; i < N; i++) {
    let mc = 0;
    for (let k = 0; k < 30; k++) mc = Math.max(mc, Math.abs(line.curv[(i + k) % N]));
    if (mc < bestCurv) { bestCurv = mc; best = i; }
  }
  const spacing = g.world.spline.length / N;
  const sMid = (((best + 15) % N) * spacing) / g.world.spline.length;
  const out = [];
  for (const target of [30, 55, 80]) {
    const sp = g.world.spline;
    const sm = sp.sampleAt(sMid);
    p.placeAt(sp.roadPoint(sMid, 0), Math.atan2(sm.tangent.x, sm.tangent.z));
    p.vLong = target;
    // full lock left 1.2 s → full lock right 1.2 s (straight: walls out of reach)
    let maxYaw = 0, maxSlip = 0, spun = false, onTrack = true;
    for (let i = 0; i < 14; i++) {
      window.__apex.ctrl({ throttle: 0.55, steer: i < 7 ? -1 : 1 });
      window.__apex.step(1 / 6);
      if (p.surface === 'grass' || p.surface === 'gravel') onTrack = false;
      if (onTrack) {                     // only judge on the racing surface
        maxYaw = Math.max(maxYaw, Math.abs(p.yawRate));
        maxSlip = Math.max(maxSlip, Math.abs(p.vLat));
        if (p.spinT > 0) spun = true;
      }
    }
    out.push({ target, maxYaw: +maxYaw.toFixed(2), maxSlip: +maxSlip.toFixed(2), spun, kmh: Math.round(p.speedKmh) });
  }
  window.__apex.ctrl(null);
  return out;
});
for (const a of arcade) {
  log(`arcade @${a.target} m/s: yaw grip-capped (≤ 1.6 rad/s), no spin`,
    !a.spun && a.maxYaw <= 1.6,
    `maxYaw ${a.maxYaw} · slip ${a.maxSlip} m/s · spin ${a.spun}`);
}
log('arcade: car stays glued (|vLat| < 3 m/s at all speeds)',
  arcade.every(a => a.maxSlip < 3),
  arcade.map(a => `${a.target}:${a.maxSlip}`).join(' · '));

// ===================== 6. FULL FIELD RACECRAFT =================================
await page.evaluate(() => { window.__apex.auto(false); window.__apex.ctrl(null); });
await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 5, aiCount: 19, aiLevel: 'medium' }));
await page.waitForTimeout(1800);
await stepToGo();
await page.evaluate(() => { window.__apex.auto(true); });
await page.evaluate(() => window.__apex.step(60));
const mid = await page.evaluate(() => window.__apex.state());
let stuckSamples = 0, spinsSeen = 0, leadStall = 0, prevLead = -Infinity;
const prevPairs = [];
for (let t = 0; t < 24; t++) {
  await page.evaluate(() => window.__apex.step(2));
  const s = await page.evaluate(() => {
    const g = window.__apex.game();
    const st = window.__apex.state();
    const pairs = [];
    for (let i = 0; i < g.cars.length; i++) for (let j = i + 1; j < g.cars.length; j++) {
      const a = g.cars[i], b = g.cars[j];
      if (a.finished || b.finished) continue;
      const gap = window.__probe.gap(a, b);
      // deadlock signature: stacked < 6 m, aligned laterally, BOTH slow
      // (a fast draft train is healthy racing, not a jam)
      if (gap > 0 && gap < 6 && Math.abs(window.__probe.lat(a) - window.__probe.lat(b)) < 1.8
        && a.speed < 15 && b.speed < 15) pairs.push([a.id, b.id].join('|'));
    }
    return { pairs, spin: st.cars.filter(c => c.spin > 0).length, lead: Math.max(...st.race.states.map(x => x.totalM)) };
  });
  spinsSeen = Math.max(spinsSeen, s.spin);
  if (s.lead < prevLead + 2) leadStall++;          // leader gaining < 2 m in 2 s = blocked
  prevLead = Math.max(prevLead, s.lead);
  const persist = s.pairs.filter(p => prevPairs.includes(p));
  if (persist.length >= 1) stuckSamples++;
  prevPairs.length = 0;
  prevPairs.push(...s.pairs);
}
const fin = await page.evaluate(() => window.__apex.state());
const beached = fin.cars.filter(c => c.kmh < 8 && !c.finished);
log('race clean: no NaN / beached / crazy laps',
  fin.cars.every(c => isFinite(c.pos[0])) &&
  Math.max(...fin.race.states.map(x => x.lap)) <= 2 &&
  beached.length <= 2,
  `vueltas máx ${Math.max(...fin.race.states.map(x => x.lap))} · beached ${beached.length ? beached.map(c => c.id).join(',') : '0'}`);
log('leader completed lap 1 by ~105 s', Math.max(...fin.race.states.map(x => x.lap)) >= 1,
  `líder en vuelta ${Math.max(...fin.race.states.map(x => x.lap))}`);
log('leader not train-blocked (no 2 s stall windows)', leadStall <= 2, `${leadStall}/24 ventales estancadas`);
log('overtakes still happen (attack mode alive post-launch)',
  (() => {
    const a = new Map(mid.cars.map(c => [c.id, c.rank]));
    return fin.cars.filter(c => a.get(c.id) !== c.rank).length;
  })() >= 5,
  `${fin.cars.filter(c => { const a = new Map(mid.cars.map(x => [x.id, x.rank])); return a.get(c.id) !== c.rank; }).length}/20 cambiaron posición`);
log('no train jams (no SLOW pair stacked < 6 m for 6+ s)', stuckSamples <= 3, `${stuckSamples}/15 muestras con pareja lenta persistente`);
log('incidents bounded (≤ 3 spinning at once)', spinsSeen <= 3, `máx ${spinsSeen} en spin simultáneo`);
await page.screenshot({ path: `${SHOT}/04_race_field.png` });

// ===================== 7. BLUE-FLAG YIELD ======================================
// player is (artificially) a lap up on a mid-field bot → the bot must move
// off the racing line / lift as the player closes from behind
const yieldRes = await page.evaluate(() => {
  const g = window.__apex.game();
  const len = g.world.spline.length;
  // most isolated mid-field bot that is actually RACING (never a beached car)
  let target = null, bestGap = -1;
  for (const b of g.cars) {
    if (b.isPlayer || b.finished || Math.abs(b.vLong) < 20) continue;
    let nearest = Infinity;
    for (const o of g.cars) {
      if (o === b || o.finished) continue;
      nearest = Math.min(nearest, Math.abs(window.__probe.gap(b, o)));
    }
    if (nearest > bestGap) { bestGap = nearest; target = b; }
  }
  const player = g.cars[0];
  const ps = g.race.states.get(player.id);
  // a lap up AND physically 32 m behind on track (on-track gap ≈ 32 m)
  ps.totalM = g.race.states.get(target.id).totalM + len - 32;
  ps.lap += 1;
  const sp = g.world.spline;
  const ts = ((target.progressS % 1) + 1) % 1;
  const backS = (((ts - 32 / len) % 1) + 1) % 1;
  const sm = sp.sampleAt(backS);
  player.placeAt(sp.roadPoint(backS, 0), Math.atan2(sm.tangent.x, sm.tangent.z));
  player.vLong = Math.abs(target.vLong) + 8;
  ps.lastS = backS;                     // coherent accumulation after the teleport
  return { target: target.id, tSpeed: Math.abs(target.vLong), len };
});
await page.evaluate(() => window.__apex.auto(true));
let yielded = false, blocked = false, minGap = Infinity, minGapPlayerSpeed = 0, targetSpeedAtMin = 0;
for (let t = 0; t < 14; t++) {
  await page.evaluate(() => window.__apex.step(0.5));
  const s = await page.evaluate(id => {
    const g = window.__apex.game();
    const len = g.world.spline.length;
    const p = g.cars[0], b = g.cars.find(c => c.id === id);
    const raw = g.race.states.get(b.id).totalM - g.race.states.get(p.id).totalM;
    return {
      gap: ((raw % len) + len) % len,          // on-track distance ahead of me
      offLine: Math.abs(window.__probe.lat(b) - window.__probe.lineLat(b)),
      bv: Math.abs(b.vLong), pv: Math.abs(p.vLong),
    };
  }, yieldRes.target);
  if (s.gap < 34 && s.gap > 0.5) {
    if (s.offLine > 1.2 || s.bv < yieldRes.tSpeed * 0.85) yielded = true;
    if (s.gap < minGap) { minGap = s.gap; minGapPlayerSpeed = s.pv; targetSpeedAtMin = s.bv; }
    if (s.gap < 4 && s.pv < s.bv - 3) blocked = true;
  }
}
log('blue flag: backmarker yields (off-line or lifts)', yielded,
  `min gap ${minGap.toFixed(1)} m · off-line/lift detectado ${yielded}`);
log('blue flag: leader not hard-blocked', !blocked,
  `a ${minGap.toFixed(1)} m: líder ${Math.round(minGapPlayerSpeed)} vs doblado ${Math.round(targetSpeedAtMin)} m/s`);
await page.evaluate(() => window.__apex.auto(false));
await page.screenshot({ path: `${SHOT}/05_blueflag.png` });

// ===================== 8. WRAP-UP ==============================================
await page.evaluate(() => window.__apex.game().quitToMenu());
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOT}/06_menu_return.png` });

const fails = results.filter(r => !r.ok);
console.log('\n==========================================');
console.log(`VELOCITY GP v12 QA: ${results.length - fails.length}/${results.length} OK · pageErrors=${pageErrors}`);
if (pageErrors > 0) fails.push({ name: 'pageErrors', ok: false });
await browser.close();
process.exit(fails.length ? 1 : 0);
