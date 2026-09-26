// Debug: where exactly do cars get stuck on alpino with the arcade player?
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

await page.evaluate(() => window.__apex.start({ circuitId: 'alpino', laps: 3, aiCount: 3 }));
await page.waitForTimeout(2200);
await step(9);
await page.evaluate(() => window.__apex.auto(true));
// sample every 3 s and watch where speeds die
for (let t = 0; t < 8; t++) {
  await step(3);
  const s = await page.evaluate(() => {
    const st = window.__apex.state();
    return {
      phase: st.phase,
      cars: st.cars.map(c => `${c.id.slice(0, 6)}:${Math.round(c.kmh)}kmh@s${(c.pos[2] || 0).toFixed(0)},${(c.pos[0] || 0).toFixed(0)}[${c.surface}]`),
      playerCtrl: JSON.stringify(st.cars[0].ctrl),
      playerYaw: st.cars[0].yaw, playerVLat: st.cars[0].vLat,
    };
  });
  console.log(`t=${(t + 1) * 3}s`, s.cars.join(' | '));
  if (t === 5) console.log('   player ctrl:', s.playerCtrl, 'yaw', s.playerYaw, 'vLat', s.playerVLat);
}
await browser.close();
