// APEX GP v10.1 diagnostics round 6: why no lap 1 — counter bug or pace?
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 5, aiCount: 19, aiLevel: 'medium' }));
await page.waitForTimeout(1800);
await page.evaluate(() => {
  const r = window.__apex.race();
  const remain = Math.max(0.05, (r.goAtMs - performance.now()) / 1000 - 0.06);
  return window.__apex.step(remain);
});
await page.evaluate(() => window.__apex.auto(true));

for (let t = 0; t < 13; t++) {
  await page.evaluate(() => window.__apex.step(10));
  const s = await page.evaluate(() => {
    const g = window.__apex.game();
    const st = window.__apex.state();
    // leader = max totalM
    let lead = null, leadM = -Infinity;
    for (const x of st.race.states) if (x.totalM > leadM) { leadM = x.totalM; lead = x; }
    const cps = g.race.states.get(lead.id).checkpoints.filter(Boolean).length;
    const car = g.cars.find(c => c.id === lead.id);
    return {
      leader: lead.id, lap: lead.lap, totalM: Math.round(lead.totalM),
      cps, prog: +car.progressS.toFixed(3), kmh: Math.round(car.speedKmh),
      maxLap: Math.max(...st.race.states.map(x => x.lap)),
      anyLap1: st.race.states.filter(x => x.lap >= 1).length,
    };
  });
  console.log(`t=${(t + 1) * 10}s líder=${s.leader} lap=${s.lap} (${s.maxLap} máx) · ${s.totalM}m · cps ${s.cps}/24 · prog ${s.prog} · ${s.kmh} km/h · con vuelta≥1: ${s.anyLap1}`);
}

await browser.close();
