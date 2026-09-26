// Deep jam inspection: positions, respawn cycling, AI targets on alpino
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

for (let k = 0; k < 4; k++) {
  const s = await page.evaluate(() => {
    const g = window.__apex.game();
    // order cars by race progress
    const order = [...g.cars].sort((a, b) =>
      (g.race.states.get(b.id)?.totalM ?? 0) - (g.race.states.get(a.id)?.totalM ?? 0));
    return order.map(c => {
      const st = g.race.states.get(c.id);
      const ai = g.aiDrivers.get(c.id);
      return {
        id: c.id.slice(0, 8), kmh: Math.round(c.speedKmh), s: +c.progressS.toFixed(3),
        totalM: Math.round(st?.totalM ?? 0), lap: st?.lap ?? 0,
        stalled: +c.stalledOff.toFixed(1), req: c.requestRespawn,
        x: +c.pos.x.toFixed(0), z: +c.pos.z.toFixed(0), surf: c.surface,
        // what does its AI see? (internal fields of F1AIDriver)
        aiT: ai ? { target: Math.round(ai.targetSpeed ?? -1), obs: ai.obstacleId ?? null, rec: ai.recovering ?? null } : null,
      };
    });
  });
  console.log(`--- sample ${k}`);
  for (const c of s) console.log(JSON.stringify(c));
  await step(2);
}
await browser.close();
