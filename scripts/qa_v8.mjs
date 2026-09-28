// APEX KART v8 in-browser QA: MK8 hop entry, steering ramp+expo, mini-turbo
// timings, graded rocket start, T-bone spin-out, slipstream catch, PBR road
// (roughness map + env), PMREM environment, clearcoat chassis, blob shadow,
// camera drift-roll. Deterministic via __apex.step().
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:4173/gmail/';
const SHOT = '/tmp/apex_v8';
fs.mkdirSync(SHOT, { recursive: true });
const results = [];
const log = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? '✓' : '✗'} ${name}${info ? ' — ' + info : ''}`);
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let pageErrors = 0;
page.on('console', m => { const t = m.text(); if (t.includes('error') || t.includes('Error')) { pageErrors++; console.log('  [console]', t.slice(0, 160)); } });
page.on('pageerror', e => { pageErrors++; console.log('  [pageerror]', String(e).slice(0, 200)); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
log('boot', await page.evaluate(() => !!(window.__apex && window.__apex.game)));

// ===================== 1. PBR ROAD + PMREM ENV (meadow) =====================
await page.evaluate(() => window.__apex.start({ mode: 'vs', trackId: 'meadow', laps: 3, aiCount: 11 }));
await page.waitForFunction(() => window.__apex.state().phase === 'racing', null, { timeout: 20000 });
await page.evaluate(() => { window.__apex.ctrl({ throttle: 1, steer: 0 }); window.__apex.step(1); });
const pbr = await page.evaluate(() => {
  const g = window.__apex.game();
  const probe = window.__apex.probe();
  return {
    env: !!g.scene.environment,
    envIntensity: g.scene.environmentIntensity,
    roadType: probe.roadSample?.matType,
    hasRough: probe.roadSample?.hasRoughnessMap,
    roadEnv: probe.roadSample?.envMapIntensity,
  };
});
log('PMREM environment set', pbr.env, `envIntensity=${pbr.envIntensity}`);
log('road is MeshStandardMaterial', pbr.roadType === 'MeshStandardMaterial', `type=${pbr.roadType}`);
log('road has roughness map', !!pbr.hasRough);
log('road reflects env', pbr.roadEnv === 0.5, `envMapIntensity=${pbr.roadEnv}`);

// ===================== 2. CLEARCOAT CHASSIS + BLOB SHADOW =====================
const kartVis = await page.evaluate(() => {
  const g = window.__apex.game();
  const k = g.karts[0];
  const v = g.visuals.get(k.id);
  const mats = v.materials.map(m => ({ type: m.type, clearcoat: m.clearcoat ?? null, env: m.envMapIntensity ?? null }));
  let blob = null;
  v.group.traverse(o => {
    const m = o;
    if (blob || !m.isMesh || !m.material?.map) return;
    if (m.material.type === 'MeshBasicMaterial' && m.material.transparent && m.material.fog === false
        && Math.abs(m.rotation.x + Math.PI / 2) < 0.01 && Math.abs(m.position.y - 0.05) < 0.01) {
      blob = { w: +m.geometry.parameters?.width ?? 0, h: +m.geometry.parameters?.height ?? 0, opacity: +m.material.opacity.toFixed(2) };
    }
  });
  return { mats: mats.slice(0, 4), blob, usedGlb: !!(v.usedGlbKart) };
});
const hasClearcoat = kartVis.mats.some(m => m.clearcoat !== null && m.clearcoat >= 1);
const hasEnvBoost = kartVis.mats.some(m => m.env !== null && m.env >= 1.1);
log('clearcoat chassis (procedural) or env-boosted GLB', hasClearcoat || (kartVis.usedGlb && hasEnvBoost),
  `glb=${kartVis.usedGlb} mats=${JSON.stringify(kartVis.mats.slice(0, 2))}`);
log('blob contact shadow present', !!kartVis.blob, JSON.stringify(kartVis.blob));

// ===================== 3. STEERING RAMP + EXPO =====================
// From a standstill at speed: steer=1 held. Ramped steering must NOT reach
// full lock in one frame (old behavior) but must reach ~full in ~0.13s.
await page.evaluate(() => { window.__apex.tp(0.5); window.__apex.step(0.5); });
const steer = await page.evaluate(() => {
  const k = window.__apex.game().karts[0];
  window.__apex.ctrl({ throttle: 1, steer: 0 });
  window.__apex.step(2.0);              // reach speed
  const v0 = k.speed;
  window.__apex.ctrl({ throttle: 1, steer: 1 });
  const yaw0 = k.yaw;
  const s1 = k.steerSm;
  window.__apex.step(1 / 60);           // exactly one frame
  const oneFrame = { steerSm: k.steerSm, dyaw: Math.abs(k.yaw - yaw0) };
  window.__apex.step(0.12);             // ~7 more frames
  const after130ms = k.steerSm;
  window.__apex.ctrl({ throttle: 1, steer: 0 });
  window.__apex.step(0.3);
  return { v0: +v0.toFixed(1), ...oneFrame, steerSm1: +s1.toFixed(3), after130ms: +after130ms.toFixed(3), backToZero: +k.steerSm.toFixed(3) };
});
log('steering ramps (not instant)', steer.steerSm1 === 0 && steer.steerSm < 0.35,
  `1-frame steerSm=${steer.steerSm.toFixed(3)} dyaw=${steer.dyaw.toFixed(4)}`);
log('steering reaches lock ~0.13s', steer.after130ms > 0.85, `steerSm@130ms=${steer.after130ms}`);
log('steering re-centers', steer.backToZero < 0.05, `steerSm=${steer.backToZero}`);

// ===================== 4. HOP ENTRY + DRIFT THROUGH THE AIR =====================
const hop = await page.evaluate(() => {
  const k = window.__apex.game().karts[0];
  window.__apex.tp(0.35);                // long straight
  window.__apex.step(0.4);
  window.__apex.ctrl({ throttle: 1, steer: 0 });
  window.__apex.step(1.8);               // build speed past driftEnterSpeed
  const speedAtPress = k.speed;
  // press drift with steer held (commit a right drift via the hop)
  window.__apex.ctrl({ throttle: 1, steer: 0.7, drift: true });
  window.__apex.step(1 / 60);
  const press = { airborne: k.airborne, drift: k.drifting, hopLaunched: k.hopLaunched };
  window.__apex.step(0.10);              // mid-hop
  const mid = { airborne: k.airborne, drift: k.drifting, y: +(k.pos.y - k.ginfo.height).toFixed(2) };
  window.__apex.step(0.45);              // landed, drift digging
  const landed = { airborne: k.airborne, drift: k.drifting, level: k.driftLevel };
  window.__apex.ctrl({ throttle: 1, steer: 0, drift: false });
  window.__apex.step(1 / 60);
  return { speed: +speedAtPress.toFixed(1), press, mid, landed, ended: !k.drifting };
});
log('hop launches on drift press', hop.press.airborne && hop.press.drift,
  `v=${hop.speed} airborne=${hop.press.airborne} drift=${hop.press.drift}`);
log('drift alive through the hop', hop.mid.drift && hop.mid.y > 0.1,
  `airborne=${hop.mid.airborne} airY=${hop.mid.y} drift=${hop.mid.drift}`);
log('drift lands and keeps sliding', !hop.landed.airborne && hop.landed.drift,
  `airborne=${hop.landed.airborne} drift=${hop.landed.drift}`);
log('drift ends on release', hop.ended);

// ===================== 5. MINI-TURBO TIMINGS (0.65/1.5/2.6 charge) =====================
const mt = await page.evaluate(() => {
  const k = window.__apex.game().karts[0];
  window.__apex.tp(0.35);
  window.__apex.step(0.4);
  window.__apex.ctrl({ throttle: 1, steer: 0, drift: false });
  window.__apex.step(1.6);
  // full-commit drift: steer INTO the slide = 1.5x charge rate
  window.__apex.ctrl({ throttle: 1, steer: 1, drift: true });
  window.__apex.step(0.06);   // hop moment
  const out = {};
  window.__apex.step(0.5);    // ~0.56s total hold → charge ≈ 0.78 > 0.65
  out.lv1 = k.driftLevel;
  window.__apex.step(0.5);    // ~1.06s → charge ≈ 1.55 > 1.5
  out.lv2 = k.driftLevel;
  window.__apex.step(0.75);   // ~1.81s → charge ≈ 2.6+
  out.lv3 = k.driftLevel;
  out.charge = +k.driftCharge.toFixed(2);
  // release → boost by level
  window.__apex.ctrl({ throttle: 1, steer: 0, drift: false });
  window.__apex.step(1 / 60);
  out.boost = +(k.boostTimer).toFixed(2);
  out.power = +k.boostPower.toFixed(2);
  return out;
});
log('mini-turbo L1 blue by ~0.55s', mt.lv1 >= 1, `level=${mt.lv1} charge=${mt.charge}`);
log('mini-turbo L2 orange by ~1.05s', mt.lv2 >= 2, `level=${mt.lv2}`);
log('mini-turbo L3 purple by ~1.8s', mt.lv3 >= 3, `level=${mt.lv3} charge=${mt.charge}`);
log('release pays boost', mt.boost > 1 && mt.power >= 1.5, `boost=${mt.boost}s power=${mt.power}x`);

// ===================== 6. CAMERA DRIFT ROLL =====================
const roll = await page.evaluate(() => {
  const g = window.__apex.game();
  const k = g.karts[0];
  window.__apex.tp(0.35);
  window.__apex.step(0.4);
  window.__apex.ctrl({ throttle: 1, steer: 0, drift: false });
  window.__apex.step(1.6);
  window.__apex.ctrl({ throttle: 1, steer: 1, drift: true });
  window.__apex.step(0.8);
  // qaStep only runs physics — pump the chase cam like the render loop would
  for (let i = 0; i < 30; i++) g.camera.updateChase(1 / 60, k, false);
  return { drift: k.drifting, roll: +g.camera.qaRoll.toFixed(4) };
});
log('camera banks with the drift', roll.drift && Math.abs(roll.roll) > 0.02,
  `roll=${roll.roll} rad (${(roll.roll * 57.3).toFixed(1)}°)`);

// ===================== 7. GRADED ROCKET START =====================
const rocket = await page.evaluate(() => {
  const g = window.__apex.game();
  const k = g.karts[0];
  // unit-style: drive evaluateTurboStart directly with press timings
  const res = {};
  const test = (ms) => {
    k.boostTimer = 0; k.boostPower = 1; k.spinT = 0; k.speed = 10;
    g.race.evaluateTurboStart(k, ms);
    return { boost: +(k.boostTimer).toFixed(2), power: +k.boostPower.toFixed(2), spin: +(k.spinT).toFixed(2) };
  };
  res.super = test(80);       // pressed 80ms before GO
  res.good = test(300);       // 300ms before
  res.none = test(900);       // plain start
  res.soft = test(1600);      // jumped the gun
  res.hard = test(2500);      // held from before "2"
  return res;
});
log('super rocket (≤150ms)', rocket.super.boost >= 1.4 && rocket.super.power >= 1.5,
  `${JSON.stringify(rocket.super)}`);
log('good rocket (≤500ms)', rocket.good.boost > 0.5 && rocket.good.boost < 1.2,
  `${JSON.stringify(rocket.good)}`);
log('no reward mid-window', rocket.none.boost === 0, `${JSON.stringify(rocket.none)}`);
log('soft wheelspin (>1400ms)', rocket.soft.spin > 0 && rocket.soft.spin < 1,
  `${JSON.stringify(rocket.soft)}`);
log('hard burnout (>2300ms)', rocket.hard.spin >= 1.2, `${JSON.stringify(rocket.hard)}`);

// ===================== 8. T-BONE SPIN-OUT (lowered thresholds) =====================
const tbone = await page.evaluate(() => {
  const g = window.__apex.game();
  const p = g.karts[0];
  const bot = g.karts[1];
  window.__apex.tp(0.42);
  window.__apex.step(0.3);
  window.__apex.ctrl({ throttle: 0, steer: 0, drift: false });
  window.__apex.step(0.2);
  // place the bot 2.4m AHEAD, heading straight back INTO the stationary player
  const fwd = p.forward();
  bot.pos.set(p.pos.x + fwd.x * 2.4, p.pos.y, p.pos.z + fwd.z * 2.4);
  bot.yaw = Math.atan2(p.pos.x - bot.pos.x, p.pos.z - bot.pos.z);  // aimed at the player
  bot.speed = 20; bot.vy = 0; bot.grounded = true;                   // closing ≈ 20 m/s > 11.5
  bot.invulnT = 0; bot.spinT = 0; bot.wobbleT = 0; bot.slip = 0;
  p.invulnT = 0; p.spinT = 0; p.wobbleT = 0; p.slip = 0; p.speed = 0;
  window.__apex.step(1 / 60);
  return { spin: +(p.spinT).toFixed(2), botSpin: +(bot.spinT).toFixed(2), wobble: +(p.wobbleT).toFixed(2) };
});
log('hard T-bone spins the victim', tbone.spin > 0 || tbone.wobble > 0,
  `spin=${tbone.spin} wobble=${tbone.wobble} botSpin=${tbone.botSpin}`);

// ===================== 9. SLIPSTREAM CATCH + STREAKS =====================
const slip = await page.evaluate(() => {
  const g = window.__apex.game();
  const p = g.karts[0];
  const bot = g.karts[1];
  window.__apex.tp(0.5);
  window.__apex.step(0.3);
  window.__apex.ctrl({ throttle: 1, steer: 0, drift: false });
  p.invulnT = 0; p.spinT = 0;
  // hold a bot 8m ahead, same heading, race speed — re-pinned each frame so
  // its own AI can't spoil the draft geometry
  for (let i = 0; i < 80; i++) {
    const f = p.forward();
    bot.pos.set(p.pos.x + f.x * 8, p.pos.y, p.pos.z + f.z * 8);
    bot.yaw = p.yaw;
    bot.speed = 20;
    window.__apex.step(1 / 60);
  }
  return { charge: +p.slipCharge.toFixed(2), active: +(p.slipActive).toFixed(2), boost: p.boosting };
});
log('slipstream charges and catches', slip.active > 0 || slip.charge > 0.5,
  `charge=${slip.charge} active=${slip.active}`);

// ===================== 10. WET ROAD (glacier reflections) =====================
await page.evaluate(() => window.__apex.start({ mode: 'vs', trackId: 'glacier', laps: 2, aiCount: 5 }));
await page.waitForFunction(() => window.__apex.state().phase === 'racing', null, { timeout: 20000 });
await page.evaluate(() => { window.__apex.ctrl({ throttle: 1, steer: 0 }); window.__apex.step(0.5); });
const wet = await page.evaluate(() => {
  const probe = window.__apex.probe();
  return { type: probe.roadSample?.matType, env: probe.roadSample?.envMapIntensity, hasRough: probe.roadSample?.hasRoughnessMap };
});
log('glacier wet asphalt (strong env)', wet.type === 'MeshStandardMaterial' && wet.env === 1.25,
  `envMapIntensity=${wet.env} roughMap=${wet.hasRough}`);

// screenshots for VLM review
await page.evaluate(() => { window.__apex.ctrl({ throttle: 1, steer: 0 }); window.__apex.step(3); });
await page.screenshot({ path: `${SHOT}/glacier-wet.png` });

await page.evaluate(() => window.__apex.start({ mode: 'vs', trackId: 'meadow', laps: 2, aiCount: 11 }));
await page.waitForFunction(() => window.__apex.state().phase === 'racing', null, { timeout: 20000 });
await page.evaluate(() => { window.__apex.ctrl({ throttle: 1, steer: 0 }); window.__apex.step(4); });
await page.screenshot({ path: `${SHOT}/meadow-golden.png` });

// drift + hop shot: commit a drift mid-straight
await page.evaluate(() => {
  const k = window.__apex.game().karts[0];
  window.__apex.ctrl({ throttle: 1, steer: 1, drift: true });
  window.__apex.step(1.2);
  window.__apex.ctrl({ throttle: 1, steer: 0.6, drift: true });
});
await page.screenshot({ path: `${SHOT}/meadow-drift.png` });

// menu showroom (reflections + clearcoat karts)
await page.evaluate(() => window.__apex.game().quitToMenu());
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOT}/menu-showroom.png` });

const failed = results.filter(r => !r.ok);
console.log(`\n==== QA v8: ${results.length - failed.length}/${results.length} OK, pageErrors=${pageErrors} ====`);
if (pageErrors > 0) failed.push({ name: 'pageErrors' });
fs.writeFileSync('/tmp/apex_v8/results.json', JSON.stringify(results, null, 2));
await browser.close();
process.exit(failed.length ? 1 : 0);
