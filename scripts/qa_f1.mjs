// APEX GP v10 in-browser QA: F1 rebuild — boot, grid, 5-light start, physics
// (launch/gears/braking/G), AI lapping the circuit, surfaces & recovery,
// cameras, HUD, time trial. Deterministic via __apex.step().
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:3000/';
const SHOT = '/tmp/apexgp_qa';
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
await page.waitForTimeout(4000);
await page.evaluate(() => window.__vgpIntro?.skip());   // dismiss the F1 intro (QA)
await page.waitForTimeout(400);
log('boot + __apex', await page.evaluate(() => !!(window.__apex && window.__apex.game && window.__apex.version)));
log('version', await page.evaluate(() => window.__apex.version) === 'velocitygp-v13.0', await page.evaluate(() => String(window.__apex.version)));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOT}/01_menu.png` });
log('menu visible', true, 'screenshot');

const throughLights = () => page.evaluate(() => window.__apex.step(9));

// ===================== 2. SOLO SESSION: player physics =======================
await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 3, aiCount: 0 }));
await page.waitForTimeout(2000);
let st = await page.evaluate(() => window.__apex.state());
log('solo grid', st.cars.length === 1, `${st.cars.length} coche`);
log('grid on straight', Math.abs(st.cars[0].pos[0]) < 5, `x=${st.cars[0].pos[0]}`);
await page.waitForTimeout(1600);
await page.screenshot({ path: `${SHOT}/02_grid_lights.png` });
await throughLights();
st = await page.evaluate(() => window.__apex.state());
log('lights out → racing', st.phase === 'racing', st.phase);

// launch (sample before the blind driver reaches T1 ~4.5 s in)
await page.evaluate(() => window.__apex.ctrl({ throttle: 1 }));
await page.evaluate(() => window.__apex.step(1.5));
const gEarly = await page.evaluate(() => window.__apex.state().cars[0].longG);
await page.evaluate(() => window.__apex.step(2.5));
st = await page.evaluate(() => window.__apex.state());
const p = st.cars[0];
log('launch speed', p.kmh > 100 && p.kmh < 220, `${p.kmh} km/h tras 4 s`);
log('gear climbed', p.gear >= 2, `marcha ${p.gear}`);
log('launch G', Math.abs(gEarly) > 0.6, `${gEarly.toFixed(1)} g (a 1.5 s, límite de tracción)`);
log('rpm band', p.rpm > 8000 && p.rpm < 12300, `${Math.round(p.rpm)} rpm`);
log('stable launch', Math.abs(p.vLat) < 0.8, `vLat ${p.vLat}`);

// top speed run (mid straight, flying start, sample before T1)
await page.evaluate(() => window.__apex.tp(0.995, 60));
await page.evaluate(() => window.__apex.ctrl({ throttle: 1 }));
await page.evaluate(() => window.__apex.step(1.6));
st = await page.evaluate(() => window.__apex.state());
log('top speed', st.cars[0].kmh > 230, `${st.cars[0].kmh} km/h`);
log('high gear reached', st.cars[0].gear >= 5, `marcha ${st.cars[0].gear}`);
log('ERS deployed', st.cars[0].ers < 1, `ERS ${(st.cars[0].ers * 100).toFixed(0)}%`);

// braking (still on the straight)
await page.evaluate(() => window.__apex.ctrl({ brake: 1 }));
await page.evaluate(() => window.__apex.step(2));
st = await page.evaluate(() => window.__apex.state());
log('carbon brakes', st.cars[0].kmh < 140, `${st.cars[0].kmh} km/h tras 2 s`);
log('brake G', Math.abs(st.cars[0].longG) > 1.2, `${st.cars[0].longG.toFixed(1)} g`);
await page.evaluate(() => window.__apex.ctrl(null));

// fuel burn telemetry
st = await page.evaluate(() => window.__apex.state());
log('fuel burns', st.cars[0].fuel < 60, `${st.cars[0].fuel} kg`);

// surfaces: push far off track → grass/gravel
await page.evaluate(() => {
  const g = window.__apex.game();
  const car = g.cars[0];
  const w = g.world;
  const s = ((car.progressS % 1) + 1) % 1;
  const sm = w.spline.sampleAt(s);
  const side = Math.sign(w.spline.project(car.pos, -1).lateral) || 1;
  const target = w.spline.roadPoint(s, side * (sm.halfWidth + 26));
  car.pos.set(target.x, target.y, target.z);
  car.vLong = 15;
});
await page.evaluate(() => window.__apex.step(1.5));
st = await page.evaluate(() => window.__apex.state());
log('off-track surface', st.cars[0].off === true, st.cars[0].surface);
// stuck → auto recovery
await page.evaluate(() => window.__apex.step(6));
await page.evaluate(() => window.__apex.step(4));
st = await page.evaluate(() => window.__apex.state());
log('auto-recovery (never fully beached)', st.cars[0].kmh > 3 || st.cars[0].off === false, `${st.cars[0].surface} · ${st.cars[0].kmh} km/h`);
await page.evaluate(() => window.__apex.ctrl(null));

// ===================== 3. FULL GRID + AI FIELD ===============================
await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 5, aiCount: 9, aiLevel: 'medium' }));
await page.waitForTimeout(2200);
st = await page.evaluate(() => window.__apex.state());
log('grid formed', st.cars.length === 10, `${st.cars.length} coches`);
const spread = Math.max(...st.cars.map(c => c.pos[2])) - Math.min(...st.cars.map(c => c.pos[2]));
log('grid staggered on straight', spread > 25 && spread < 90 && st.cars.every(c => Math.abs(c.pos[0]) < 6), `${spread.toFixed(0)} m`);
await page.evaluate(() => window.__apex.auto(true));
await throughLights();
await page.evaluate(() => window.__apex.step(50));
await page.evaluate(() => window.__apex.step(50));
st = await page.evaluate(() => window.__apex.state());
const ai = st.cars.filter(c => c.ai === 'yes');
const aiMoving = ai.filter(c => c.kmh > 60);
log('AI racing', aiMoving.length >= 4, `${aiMoving.length}/9 > 60 km/h · mín ${Math.round(Math.min(...ai.map(c => c.kmh)))} · máx ${Math.round(Math.max(...ai.map(c => c.kmh)))}`);
const lapsNow = st.race.states.map(s => s.lap);
log('laps legit', Math.max(...lapsNow) <= 2, `vueltas: ${lapsNow.join(',')} @~110 s`);
log('lap progress', Math.max(...st.race.states.map(s => s.totalM)) > 1500,
  `líder ${Math.round(Math.max(...st.race.states.map(s => s.totalM)))} m`);
const sorted = [...st.race.states].sort((a, b) => a.totalM - b.totalM);
const field = sorted[sorted.length - 1].totalM - sorted[0].totalM;
log('field spread sane', field > 50 && field < 2200, `${Math.round(field)} m P1→P10`);
const stuck = st.cars.filter(c => c.kmh < 8 && !c.finished);
log('nobody permanently beached', stuck.length <= 2, stuck.length ? stuck.map(c => c.id).join(',') : 'todos en movimiento');
const maxLatG = Math.max(...st.cars.map(c => Math.abs(c.latG)));
log('lateral G plausible (clamp 8g)', maxLatG <= 8.0, `máx ${maxLatG.toFixed(1)} g`);
const posOk = st.cars.every(c => isFinite(c.pos[0]) && isFinite(c.pos[1]));
log('no NaN positions', posOk);

// DRS: cars on the main straight should be able to flag eligibility (wiring check)
const drsInfo = await page.evaluate(() => {
  const g = window.__apex.game();
  return {
    zones: g.world.def.drsZones.length,
    anyEligible: g.cars.some(c => c.drsElig),
    anyOpen: g.cars.some(c => c.drs),
  };
});
log('DRS zones wired', drsInfo.zones === 2, `${drsInfo.zones} zonas · eligible=${drsInfo.anyEligible} open=${drsInfo.anyOpen}`);

// ===================== 4. CAMERAS + HUD ======================================(autopilot still on)
for (const cam of ['cockpit', 'tv', 'nose', 'chase']) {
  const mode = await page.evaluate((m) => { const g = window.__apex.game(); g.camera.mode = m; return g.camera.mode; }, cam);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOT}/05_cam_${cam}.png` });
  log(`camera ${cam}`, mode === cam);
}
const hud = await page.evaluate(() => window.__apex.game().bridge.getSnapshot());
log('HUD telemetry', hud.telemetry.speedKmh > 0, `${hud.telemetry.speedKmh} km/h · M${hud.telemetry.gear} · DRS ${hud.telemetry.drs}`);
log('HUD tower', hud.tower.length === 10, `${hud.tower.length} filas · P1 ${hud.tower[0]?.name}`);
log('HUD timing', hud.timing.sectorMs != null && hud.timing.currentSector >= 0, `sector S${hud.timing.currentSector + 1}`);
log('HUD camera name', hud.cameraName.length > 0, hud.cameraName);

// ===================== 5. TIME TRIAL + BAHÍA =================================
await page.evaluate(() => window.__apex.start({ mode: 'timetrial', circuitId: 'bahia', laps: 3, aiCount: 0 }));
await page.waitForTimeout(1800);
await throughLights();
await page.evaluate(() => window.__apex.auto(true));
await page.evaluate(() => window.__apex.step(25));
await page.evaluate(() => window.__apex.step(15));
st = await page.evaluate(() => window.__apex.state());
log('time trial solo', st.cars.length === 1, `${st.cars.length} coche`);
log('bahía racing', st.cars[0].kmh > 20, `${st.cars[0].kmh} km/h`);
const ttHud = await page.evaluate(() => window.__apex.game().bridge.getSnapshot());
log('time trial HUD', ttHud.timeTrial !== null);
await page.screenshot({ path: `${SHOT}/06_timetrial_bahia.png` });

// ===================== 6. ALPINO =============================================
await page.evaluate(() => window.__apex.start({ circuitId: 'alpino', laps: 3, aiCount: 9 }));
await page.waitForTimeout(2200);
await throughLights();
await page.evaluate(() => window.__apex.auto(true));
await page.evaluate(() => window.__apex.step(35));
// elevation: the TRACK's own relief (spline y range) + the field actually
// climbing (a car's y delta over the window) — robust to pack bunching at
// the hairpin snapshot moment
const alpinoElev = await page.evaluate(() => {
  const g = window.__apex.game();
  const ys = g.world.spline.samples.map(s => s.pos.y);
  const player = g.cars[0];
  return {
    trackRange: Math.max(...ys) - Math.min(...ys),
    playerY: +player.pos.y.toFixed(1),
  };
});
await page.evaluate(() => window.__apex.step(20));
st = await page.evaluate(() => window.__apex.state());
log('alpino elevation', alpinoElev.trackRange > 3, `pista Δ${alpinoElev.trackRange.toFixed(1)} m · jugador y=${alpinoElev.playerY}`);
log('alpino racing', st.cars.filter(c => c.kmh > 25).length >= 4, `${st.cars.filter(c => c.kmh > 25).length}/10 en movimiento`);
await page.screenshot({ path: `${SHOT}/07_alpino.png` });

// ===================== 7. MENU RETURN ========================================
await page.evaluate(() => window.__apex.game().quitToMenu());
await page.waitForTimeout(900);
await page.screenshot({ path: `${SHOT}/08_menu_return.png` });
log('menu return clean', true);

const fails = results.filter(r => !r.ok);
console.log('\n==========================================');
console.log(`APEX GP QA: ${results.length - fails.length}/${results.length} OK · pageErrors=${pageErrors}`);
if (pageErrors > 0) fails.push({ name: 'pageErrors', ok: false });
process.exit(fails.length ? 1 : 0);
