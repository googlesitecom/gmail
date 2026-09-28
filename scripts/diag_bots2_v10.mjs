// Probe v2: estado COMPLETO de los bots (boost, coins, slipstream) en meadow
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://localhost:3000/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__apex, null, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.evaluate(() => window.__apex.qaRace('meadow', 100, 11));
await page.waitForFunction(() => {
  const s = window.__apex?.state?.();
  return s && s.race && s.race.phase === 'racing';
}, null, { timeout: 90000, polling: 400 });
await page.waitForTimeout(32000);   // t≈35 s: justo cuando vimos las speeds altas
const s = await page.evaluate(() => {
  const st = window.__apex?.state?.();
  const g = window.__apex.game();
  const karts = (st?.karts ?? []).map(k => {
    const live = g.karts?.find(x => x.id === k.id);
    return {
      id: k.id.slice(0, 10), spd: k.speed, prog: +k.s.toFixed(3), lap: k.lap,
      boost: k.boost, coins: k.coins, drift: k.drift, driftLv: k.driftLv,
      onRoad: k.gi?.onRoad, rough: k.gi?.rough,
      ai: k.ai,
      live: live ? {
        boostTimer: +(live.boostTimer ?? 0).toFixed(2), boostPower: live.boostPower,
        slipActive: +(live.slipActive ?? 0).toFixed(2),
        vmax: +live.vmax.toFixed(1), baseVmax: +live.baseVmax.toFixed(1),
        spinT: +(live.spinT ?? 0).toFixed(2),
        wallHit: +(live.wallHit ?? 0).toFixed(2),
        railGrindT: +(live.railGrindT ?? 0).toFixed(2),
      } : null,
    };
  });
  return { t: Date.now(), karts, goAt: st?.race?.goAt };
});
const bySpeed = [...s.karts].sort((a, b) => b.spd - a.spd);
console.log('=== TOP 6 por velocidad (t≈35s) ===');
for (const k of bySpeed.slice(0, 6)) {
  console.log(`${k.id} spd=${k.spd} prog=${k.prog} lap=${k.lap} boost=${k.boost} coins=${k.coins} slip=${k.live?.slipActive} boostT=${k.live?.boostTimer} vmax=${k.live?.vmax} base=${k.live?.baseVmax} wall=${k.live?.wallHit} rail=${k.live?.railGrindT} aiTgt=${k.ai?.targetSpeed} aiBrk=${k.ai?.brake}`);
}
console.log('=== BOTTOM 6 ===');
for (const k of bySpeed.slice(6)) {
  console.log(`${k.id} spd=${k.spd} prog=${k.prog} lap=${k.lap} boost=${k.boost} coins=${k.coins} slip=${k.live?.slipActive} boostT=${k.live?.boostTimer} vmax=${k.live?.vmax} base=${k.live?.baseVmax} wall=${k.live?.wallHit} rail=${k.live?.railGrindT} aiTgt=${k.ai?.targetSpeed} aiBrk=${k.ai?.brake}`);
}
await browser.close();
