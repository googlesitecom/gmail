// APEX GP v10.1 diagnostics round 7: dissect the lap-crossing failure.
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

// fast-forward to just before the leader's first crossing (~58 s of racing)
await page.evaluate(() => window.__apex.step(58));

let prev = null;
for (let t = 0; t < 40; t++) {
  await page.evaluate(() => window.__apex.step(0.25));
  const s = await page.evaluate(() => {
    const g = window.__apex.game();
    const st = window.__apex.state();
    let lead = null, leadM = -Infinity;
    for (const x of st.race.states) if (x.totalM > leadM) { leadM = x.totalM; lead = x; }
    const rs = g.race.states.get(lead.id);
    const car = g.cars.find(c => c.id === lead.id);
    return {
      id: lead.id, lap: rs.lap, prog: +car.progressS.toFixed(4), lastS: +rs.lastS.toFixed(4),
      cps: rs.checkpoints.filter(Boolean).length,
      lapStart: Math.round(rs.lapStartMs), goAt: Math.round(g.race.goAtMs),
      perfNow: Math.round(performance.now()),
      totalM: Math.round(rs.totalM),
    };
  });
  if (prev && (prev.prog > 0.8 && s.prog < 0.2 || prev.lap !== s.lap)) {
    console.log(`CROSSING? ${prev.prog} → ${s.prog} · lap ${prev.lap}→${s.lap} · cps ${s.cps} · lapStart ${s.lapStart} · goAt ${s.goAt} · perfNow ${s.perfNow} · lapStart-perfNow ${s.lapStart - s.perfNow}ms`);
  }
  if (t % 4 === 0) {
    console.log(`t≈${58 + (t + 1) * 0.25}s ${s.id} lap=${s.lap} prog ${s.prog} cps ${s.cps}/24 lapStart-goAt=${s.lapStart - s.goAt}ms perfNow-goAt=${s.perfNow - s.goAt}ms ${s.totalM}m`);
  }
  prev = s;
}

await browser.close();
