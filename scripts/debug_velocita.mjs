// Debug: velocita grid test — why does the (sim) autopilot player crawl now?
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

// exact suite sequence for the grid test
await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 5, aiCount: 9, aiLevel: 'medium' }));
await page.waitForTimeout(2200);
await page.evaluate(() => window.__apex.auto(true));
await step(9);
await step(50);
for (let i = 0; i < 6; i++) {
  await step(10);
  const tSec = Math.round(i * 10 + 70);
  const s = await page.evaluate(() => {
    const g = window.__apex.game();
    const p = g.cars[0];
    const gi = p.ginfo;
    return {
      arcade: p.arcade, assist: p.assistLevel,
      kmh: Math.round(p.speedKmh), s: +p.progressS.toFixed(3), lap: g.race.states.get('player').lap,
      rank: p.rank, lat: gi ? +gi.lateral.toFixed(1) : null, surf: p.surface, off: p.offTrack,
      stalled: +p.stalledOff.toFixed(2), spin: +(p.spinT || 0).toFixed(2),
      vLong: +p.vLong.toFixed(1), yaw: +p.yaw.toFixed(2), tangent: p.lastTangentDot === undefined ? null : +p.lastTangentDot.toFixed(2),
    };
  });
  console.log(`t=${tSec}`, JSON.stringify(s));
}
await browser.close();
