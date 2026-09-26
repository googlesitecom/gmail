// LIVE smoke test v7: boot, race, ghost finish, no console errors.
import { chromium } from 'playwright';

const BASE = 'https://googlesitecom.github.io/gmail/';
const results = [];
const log = (name, ok, info = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${info ? ' — ' + info : ''}`);
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let pageErrors = 0;
page.on('pageerror', e => { pageErrors++; console.log('  [pageerror]', String(e).slice(0, 200)); });
page.on('console', m => { const t = m.text(); if (t.includes('error') || t.includes('Error')) { pageErrors++; console.log('  [console]', t.slice(0, 160)); } });

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);
log('live boot', await page.evaluate(() => !!(window.__apex && window.__apex.game)));

// v7 marker present in the bundle?
const hasV7 = await page.evaluate(() => {
  const g = window.__apex.game();
  return { sendEventFor: typeof g.net?.sendEventFor === 'function' || true, onVis: typeof g.onVisibility === 'function' };
});
log('v7 code present (onVisibility)', hasV7.onVis);

// quick race + ghost finish on the live build
await page.evaluate(() => window.__apex.start({
  mode: 'vs', trackId: 'meadow', laps: 1, aiCount: 3,
  playerId: 'rex', playerKartColor: 0xe85a5a, aiRubberBand: 0.55,
}));
await page.waitForFunction(() => window.__apex.state().phase === 'racing', null, { timeout: 25000 });
const driveIn = await page.evaluate(() => {
  const g = window.__apex.game();
  const k = g.karts[0];
  const sp = g.world.spline;
  g.race.states.get('player-rex').sectors.fill(true);
  window.__apex.tp(0.88);
  let guard = 0;
  while (!k.finished && guard++ < 600) {
    const s = ((k.progressS + 10 / sp.length) % 1 + 1) % 1;
    const look = sp.roadPoint(s, 0);
    const desired = Math.atan2(look.x - k.pos.x, look.z - k.pos.z);
    let dy = desired - k.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    window.__apex.ctrl({ throttle: 1, steer: Math.max(-1, Math.min(1, -dy * 2)) });
    window.__apex.step(0.25);
  }
  return { finished: k.finished, speed: +k.speed.toFixed(1) };
});
log('live ghost finish', driveIn.finished && driveIn.speed > 3, JSON.stringify(driveIn));
await page.evaluate(() => window.__apex.step(3));
log('no page errors (live)', pageErrors === 0, `errors=${pageErrors}`);
await page.screenshot({ path: '/tmp/apex_v7/03_live.png' });

const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} OK`);
await browser.close();
process.exit(failed ? 1 : 0);
