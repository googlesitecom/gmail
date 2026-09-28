// Debug: find the alpino traffic jam location with 9 AI
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.evaluate(() => window.__vgpIntro?.skip());
const step = (s) => page.evaluate(t => window.__apex.step(t), s);

await page.evaluate(() => window.__apex.start({ circuitId: 'alpino', laps: 3, aiCount: 9 }));
await page.waitForTimeout(2200);
await step(9);
await page.evaluate(() => window.__apex.auto(true));
for (let t = 0; t < 6; t++) {
  await step(6);
  const s = await page.evaluate(() => {
    const st = window.__apex.state();
    const prog = st.cars.map(c => c.id === 'player' ? 'P' : c.id.slice(0, 5));
    return {
      phase: st.phase,
      speeds: st.cars.map(c => Math.round(c.kmh)).join(','),
      // player + first 3 AI progress and lateral
      detail: st.cars.slice(0, 4).map(c => `${c.id.slice(0, 5)}(${c.kmh.toFixed(0)}kmh,${c.surface},${c.vLong.toFixed(1)})`).join(' '),
      lap: st.race.states.map(x => x.lap).join(''),
    };
  });
  console.log(`t=${(t + 1) * 6}s laps=${s.lap} speeds: ${s.speeds}`);
  console.log(`        ${s.detail}`);
}
// positions when jammed
const jam = await page.evaluate(() => {
  const g = window.__apex.game();
  return g.cars.map(c => ({
    id: c.id.slice(0, 8), kmh: Math.round(c.speedKmh), s: +c.progressS.toFixed(3),
    lat: 0, surf: c.surface, spin: +(c.spinT || 0).toFixed(2),
    yaw: +c.yaw.toFixed(2),
  }));
});
console.log('JAM STATE:', JSON.stringify(jam, null, 1));
await browser.close();
