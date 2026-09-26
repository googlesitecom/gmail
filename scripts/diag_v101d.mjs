// APEX GP v10.1 diagnostics round 4: solo autopilot pace vs vTarget profile.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

// ---- solo autopilot reference ----
await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 5, aiCount: 0 }));
await page.waitForTimeout(1600);
await page.evaluate(() => {
  const r = window.__apex.race();
  const remain = Math.max(0.05, (r.goAtMs - performance.now()) / 1000 - 0.06);
  return window.__apex.step(remain);
});
await page.evaluate(() => window.__apex.auto(true));
const solo = [];
for (let t = 0; t < 30; t++) {
  await page.evaluate(() => window.__apex.step(4));
  const s = await page.evaluate(() => {
    const g = window.__apex.game();
    const p = g.cars[0];
    const line = g.world.racingLine;
    const N = line.count;
    const idx = g.world.spline.indexAtS(((p.progressS % 1) + 1) % 1) % N;
    return {
      kmh: Math.round(p.speedKmh), prog: +p.progressS.toFixed(3),
      vT: Math.round(line.vTarget[idx] * 3.6),
      vTmax: Math.round(Math.max(...line.vTarget) * 3.6),
      lap: g.race.states.get('player').lap,
      totalM: Math.round(g.race.states.get('player').totalM),
    };
  });
  solo.push(s);
  console.log(`t=${((t + 1) * 4).toFixed(0)}s ${s.kmh} km/h · vTarget aquí ${s.vT} (máx perfil ${s.vTmax}) · lap ${s.lap} · ${s.totalM}m`);
}
const soloLapM = solo[solo.length - 1].totalM;
console.log(`\nSOLO: ${soloLapM} m en ~120 s → ${Math.round(soloLapM / 120)} m/s medio`);

// ---- vTarget profile stats ----
const prof = await page.evaluate(() => {
  const g = window.__apex.game();
  const line = g.world.racingLine;
  const v = line.vTarget.map(x => Math.round(x * 3.6));
  return { max: Math.max(...v), min: Math.min(...v), avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), len: Math.round(g.world.spline.length) };
});
console.log(`vTarget perfil: máx ${prof.max} · mín ${prof.min} · medio ${prof.avg} km/h · circuito ${prof.len} m`);

await browser.close();
