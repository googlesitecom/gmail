// Instrument the SUITE-SEQUENCE alpino jam: per-car AI view + controls
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

// --- replicate the suite: solo velocita → grid velocita → timetrial bahia → alpino
await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 3, aiCount: 0 }));
await page.waitForTimeout(2000);
await step(9);
await page.evaluate(() => window.__apex.ctrl({ throttle: 1 }));
await step(1.5); await step(2.5);
await page.evaluate(() => window.__apex.tp(0.995, 60));
await step(1.6);
await page.evaluate(() => window.__apex.ctrl({ brake: 1 }));
await step(2);
await page.evaluate(() => window.__apex.ctrl(null));
await step(1.5); await step(6); await step(4);

await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 5, aiCount: 9, aiLevel: 'medium' }));
await page.waitForTimeout(2200);
await page.evaluate(() => window.__apex.auto(true));
await step(9); await step(50); await step(50);

await page.evaluate(() => window.__apex.start({ mode: 'timetrial', circuitId: 'bahia', laps: 3, aiCount: 0 }));
await page.waitForTimeout(1800);
await step(9);
await step(25); await step(15);

// --- alpino (the failing session)
await page.evaluate(() => window.__apex.start({ circuitId: 'alpino', laps: 3, aiCount: 9 }));
await page.waitForTimeout(2200);
await step(9);
await step(35);

const dump = await page.evaluate(() => {
  const g = window.__apex.game();
  const ctx = {
    spline: g.world.spline, line: g.world.racingLine, cars: g.cars,
    totalM: new Map(g.cars.map(c => [c.id, g.race.states.get(c.id)?.totalM ?? 0])),
  };
  return g.cars.map(c => {
    const ai = g.aiDrivers.get(c.id) || g.playerAutoDriver;
    // what's ahead of this car?
    const myTotal = ctx.totalM.get(c.id);
    let ahead = null;
    for (const o of g.cars) {
      if (o === c) continue;
      const d = ctx.totalM.get(o.id) - myTotal;
      if (d > 0 && d < 60 && (!ahead || d < ahead.d)) ahead = { id: o.id.slice(0, 6), d: +d.toFixed(1), v: +Math.abs(o.vLong).toFixed(1) };
    }
    const idx = g.world.spline.indexAtS(((c.progressS % 1) + 1) % 1);
    return {
      id: c.id.slice(0, 8), kmh: Math.round(c.speedKmh), totalM: Math.round(myTotal),
      lap: g.race.states.get(c.id)?.lap, vTarget: +g.world.racingLine.vTarget[idx].toFixed(1),
      ahead, stalled: +c.stalledOff.toFixed(1),
      aiFlags: ai ? { rec: ai.recoveringFlag ?? null, launch: ai.launchUntil ? +(ai.launchUntil - g.elapsed).toFixed(1) : null, def: ai.defendUntil ?? null } : null,
      ctrl: (() => { const cc = ai; return null; })(),
    };
  });
});
console.log('elapsed', await page.evaluate(() => Math.round(window.__apex.game().elapsed)));
console.log('race phase', await page.evaluate(() => window.__apex.game().race.phase));
for (const d of dump) console.log(JSON.stringify(d));
await browser.close();
