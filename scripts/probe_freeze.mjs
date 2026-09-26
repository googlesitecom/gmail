// Diagnose: state after start+step(40) at 1080p + why speed 0
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const warnings = [];
page.on('console', m => warnings.push(m.type() + ': ' + m.text().slice(0, 150)));
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4500);
await page.evaluate(() => window.__vgpIntro?.skip());
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 19 }));
await page.waitForTimeout(2500);

let st = await page.evaluate(() => {
  const g = window.__apex.game();
  return { phase: g.phase, cars: g.cars.length, race: g.race?.phase, goAt: g.race?.goAtMs };
});
console.log('after start:', JSON.stringify(st));

await page.evaluate(() => { window.__apex.auto(true); });
await page.evaluate(() => window.__apex.step(40));
st = await page.evaluate(() => {
  const g = window.__apex.game();
  const p = g.cars[0];
  return {
    phase: g.phase, kmh: Math.round(p.speedKmh), s: +p.progressS.toFixed(3),
    lap: g.race.states.get('player')?.lap, pos: p.pos.toArray().map(v => +v.toFixed(0)),
    finished: p.finished, stalled: +p.stalledOff.toFixed(1), arcade: p.arcade,
    aiSpeeds: g.cars.slice(1, 5).map(c => Math.round(c.speedKmh)),
  };
});
console.log('after step40:', JSON.stringify(st));
await page.evaluate(() => window.__apex.unfreeze());
await page.waitForTimeout(2500);
st = await page.evaluate(() => {
  const g = window.__apex.game();
  return { fps: window.__apex.fps(), kmh: Math.round(g.cars[0].speedKmh) };
});
console.log('after unfreeze+2.5s:', JSON.stringify(st));
console.log('console warnings:', warnings.slice(0, 8));
await browser.close();
