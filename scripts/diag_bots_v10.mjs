// Probe: ¿qué les pasa a los bots en meadow tras el BOT PASS?
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
console.log('GO — muestreando bots 40 s…');
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => window.__apex?.state?.());
  const bots = (s?.karts ?? []).filter(k => k.ai);
  const sample = bots.slice(0, 4).map(b => ({
    id: b.id.slice(0, 10),
    spd: b.speed,
    prog: +b.s.toFixed(3),
    lap: b.lap,
    pos: b.pos,
    onRoad: b.gi?.onRoad,
    lat: b.gi?.lat?.toFixed(1),
    h: b.gi?.h?.toFixed(1),
    dbg: b.ai,   // {targetSpeed, steer, err, throttle, brake, vMaxHere, follow}
    drift: b.drift, dLv: b.driftLv,
    resp: b.resp,
  }));
  console.log(`t=${(i + 1) * 5}s`, JSON.stringify(sample, null, 1).slice(0, 1400));
}
await browser.close();
