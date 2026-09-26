// Probe the stuck player's ground info + recovery state on alpino
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
await step(30);

// now sample the player closely every second
for (let i = 0; i < 8; i++) {
  const s = await page.evaluate(() => {
    const g = window.__apex.game();
    const p = g.cars[0];
    const gi = p.ginfo;
    return {
      phase: g.phase, racing: g.phase === 'racing',
      kmh: Math.round(p.speedKmh), s: +p.progressS.toFixed(3),
      lat: gi ? +gi.lateral.toFixed(1) : null, hw: gi ? +gi.halfWidth.toFixed(1) : null,
      surf: p.surface, off: p.offTrack,
      arcade: p.arcade, spin: +(p.spinT || 0).toFixed(2),
      req: p.requestRespawn, stalled: +(p.stalledOffInternal ?? -1).toFixed(2),
      tangentDot: p.lastTangentDotPublic ?? null,
      ctrl: (() => { const c = g.qaControls; return c ? 'qa' : 'input'; })(),
    };
  });
  console.log(JSON.stringify(s));
  await step(1.5);
}
await browser.close();
