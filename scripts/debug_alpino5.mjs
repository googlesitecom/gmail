// Debug: are the crawling cars physically overlapped (mutual obstacle deadlock)?
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
await step(44);

const info = await page.evaluate(() => {
  const g = window.__apex.game();
  const cars = g.cars.map(c => ({
    id: c.id.slice(0, 8), kmh: Math.round(c.speedKmh), s: +c.progressS.toFixed(3),
    x: +c.pos.x.toFixed(1), z: +c.pos.z.toFixed(1), yaw: +c.yaw.toFixed(2), spin: +(c.spinT || 0).toFixed(1),
  }));
  // closest pairs
  const pairs = [];
  for (let i = 0; i < g.cars.length; i++) for (let j = i + 1; j < g.cars.length; j++) {
    const d = g.cars[i].pos.distanceTo(g.cars[j].pos);
    if (d < 6) pairs.push(`${g.cars[i].id.slice(0, 6)}+${g.cars[j].id.slice(0, 6)}:${d.toFixed(1)}m`);
  }
  return { cars, pairs };
});
console.log('CARS:', info.cars.map(c => `${c.id}:${c.kmh}kmh@s${c.s}(${c.x},${c.z})yaw${c.yaw}`).join('\n      '));
console.log('CLOSE PAIRS:', info.pairs.join(' | ') || 'none');
await browser.close();
