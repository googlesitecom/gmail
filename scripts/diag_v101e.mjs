// APEX GP v10.1 diagnostics round 5: trace the autopilot through its first spin.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 5, aiCount: 0 }));
await page.waitForTimeout(1600);
await page.evaluate(() => {
  const r = window.__apex.race();
  const remain = Math.max(0.05, (r.goAtMs - performance.now()) / 1000 - 0.06);
  return window.__apex.step(remain);
});
await page.evaluate(() => window.__apex.auto(true));

// fine trace: every 0.1s for 30s, log when things go wrong + context
console.log('time  kmh  vTgt  steer  slip  vLat  yawRate  lat  curv×1000  evt');
for (let t = 0; t < 300; t++) {
  await page.evaluate(() => window.__apex.step(0.1));
  const s = await page.evaluate(() => {
    const g = window.__apex.game();
    const p = g.cars[0];
    const line = g.world.racingLine;
    const N = line.count;
    const idx = g.world.spline.indexAtS(((p.progressS % 1) + 1) % 1) % N;
    const ctl = g.lastControls.get('player') || {};
    return {
      kmh: Math.round(p.speedKmh),
      vT: Math.round(line.vTarget[idx] * 3.6),
      steer: +(ctl.steer ?? 0).toFixed(2),
      thr: +(ctl.throttle ?? 0).toFixed(2),
      brk: +(ctl.brake ?? 0).toFixed(2),
      slip: +p.slipAngle.toFixed(2),
      vLat: +p.vLat.toFixed(1),
      yawRate: +p.yawRate.toFixed(2),
      lat: +g.world.spline.project(p.pos, -1).lateral.toFixed(1),
      curv: +(line.curv[idx] * 1000).toFixed(1),
      totalM: Math.round(g.race.states.get('player').totalM),
      spin: +(p.spinT || 0).toFixed(1),
    };
  });
  // log interesting moments: corner entries (curv high), slides, slow on fast sections
  if (Math.abs(s.curv) > 3 || Math.abs(s.slip) > 0.15 || s.kmh < 40 || s.spin > 0) {
    console.log(`${((t + 1) * 0.1).toFixed(1)}  ${String(s.kmh).padStart(3)}  ${String(s.vT).padStart(3)}  ${String(s.steer).padStart(5)}  ${String(s.slip).padStart(5)}  ${String(s.vLat).padStart(5)}  ${String(s.yawRate).padStart(6)}  ${String(s.lat).padStart(5)}  ${String(s.curv).padStart(6)}  t${s.thr} b${s.brk}${s.spin > 0 ? ' SPIN' : ''}`);
  }
}

await browser.close();
