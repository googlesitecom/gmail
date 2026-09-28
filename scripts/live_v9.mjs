// APEX KART v9 LIVE smoke: boot, menu bloom subtle, meadow race with bloom
// OFF + sharp soft shadows, qaRemote hook present, 0 page errors.
import { chromium } from 'playwright';
import fs from 'node:fs';
fs.mkdirSync('/tmp/apex_v9', { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on('pageerror', e => { errors++; console.log('[pageerror]', String(e).slice(0, 150)); });
page.on('console', m => { const t = m.text(); if (t.includes('Error') || t.includes('error')) { errors++; console.log('[console]', t.slice(0, 120)); } });

await page.goto('https://googlesitecom.github.io/gmail/', { waitUntil: 'networkidle' });
await page.waitForTimeout(8000);
const boot = await page.evaluate(() => !!(window.__apex && window.__apex.game && window.__apex.qaRemote));
console.log('LIVE boot (qaRemote v9 hook present):', boot);

const menu = await page.evaluate(() => {
  const g = window.__apex.game();
  return { bloomOn: g.bloom.enabled, strength: +g.bloom.strength.toFixed(2) };
});
console.log('LIVE menu bloom (subtle showroom):', JSON.stringify(menu));
await page.screenshot({ path: '/tmp/apex_v9/live-menu.png' });

// race smoke: meadow (day theme → NO bloom, sharp soft shadows)
await page.evaluate(() => window.__apex.start({ mode: 'vs', trackId: 'meadow', laps: 2, aiCount: 11 }));
await page.waitForFunction(() => window.__apex.state().phase === 'racing', null, { timeout: 30000 });
await page.evaluate(() => { window.__apex.ctrl({ throttle: 1, steer: 0 }); window.__apex.step(4); });
const race = await page.evaluate(() => {
  const g = window.__apex.game();
  const sc = g.sun.shadow.camera;
  return {
    karts: g.karts.length,
    bloomOn: g.bloom.enabled, bloomStrength: g.bloom.strength,
    shadowType: g.renderer.shadowMap.type, shadowRadius: g.sun.shadow.radius,
    frustum: `${sc.left}/${sc.right}`,
  };
});
console.log('LIVE meadow v9 markers:', JSON.stringify(race));
const v9ok = race.bloomOn === false && race.bloomStrength === 0
  && race.shadowType === 1 && race.shadowRadius === 4 && race.frustum === '-42/42';
console.log('LIVE v9 visual markers:', v9ok ? 'OK' : 'FAIL');

// drive a bit for a real screenshot (shadows + no glow)
await page.evaluate(() => window.__apex.step(3));
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/apex_v9/live-meadow.png' });
console.log('LIVE pageErrors:', errors);
await browser.close();
process.exit(boot && v9ok && errors === 0 ? 0 : 1);
