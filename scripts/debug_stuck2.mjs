// Probe 2: catch the stuck moment on alpino with real internals
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
await step(40);

for (let i = 0; i < 10; i++) {
  const s = await page.evaluate(() => {
    const g = window.__apex.game();
    const p = g.cars[0];
    const gi = p.ginfo;
    const ai = g.aiDrivers.get('player') || g.playerAutoDriver;
    return {
      t: +(performance.now() / 1000).toFixed(1),
      kmh: Math.round(p.speedKmh), s: +p.progressS.toFixed(3),
      lat: gi ? +gi.lateral.toFixed(1) : null, hw: gi ? +gi.halfWidth.toFixed(1) : null,
      surf: p.surface, off: p.offTrack, spin: +(p.spinT || 0).toFixed(2),
      req: p.requestRespawn, stalled: +p.stalledOff.toFixed(2),
      vLong: +p.vLong.toFixed(1), vLat: +p.vLat.toFixed(1),
      yaw: +p.yaw.toFixed(2), yawRate: +p.yawRate.toFixed(2),
      steer: +p.steerSm.toFixed(2),
      tangentDot: p.lastTangentDot === undefined ? null : +p.lastTangentDot.toFixed(2),
    };
  });
  console.log(JSON.stringify(s));
  await step(1.2);
}
await browser.close();
