import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on('pageerror', e => { errors++; console.log('[pageerror]', String(e).slice(0, 150)); });
page.on('console', m => { const t = m.text(); if (t.includes('Error') || t.includes('error')) { errors++; console.log('[console]', t.slice(0, 120)); } });
await page.goto('https://googlesitecom.github.io/gmail/', { waitUntil: 'networkidle' });
await page.waitForTimeout(8000);
const boot = await page.evaluate(() => !!(window.__apex && window.__apex.game));
console.log('LIVE boot:', boot);
// menu screenshot + karts visible check
await page.screenshot({ path: '/tmp/apex_v8/live-menu.png' });
// race smoke: meadow
await page.evaluate(() => window.__apex.start({ mode: 'vs', trackId: 'meadow', laps: 2, aiCount: 11 }));
await page.waitForFunction(() => window.__apex.state().phase === 'racing', null, { timeout: 30000 });
await page.evaluate(() => { window.__apex.ctrl({ throttle: 1, steer: 0 }); window.__apex.step(4); });
const race = await page.evaluate(() => {
  const g = window.__apex.game();
  const probe = window.__apex.probe();
  const k = g.karts[0];
  return {
    karts: g.karts.length,
    env: !!g.scene.environment,
    roadType: probe.roadSample?.matType,
    hop: typeof k.hopLaunched,
    steerSm: typeof k.steerSm,
  };
});
console.log('LIVE race v8 markers:', JSON.stringify(race));
// hop + drift live
const hop = await page.evaluate(() => {
  const k = window.__apex.game().karts[0];
  window.__apex.ctrl({ throttle: 1, steer: 1, drift: true });
  window.__apex.step(0.3);
  return { airborne: k.airborne, drift: k.drifting };
});
console.log('LIVE hop+drift:', JSON.stringify(hop));
await page.waitForTimeout(4000);
await page.screenshot({ path: '/tmp/apex_v8/live-meadow.png' });
console.log('LIVE pageErrors:', errors);
await browser.close();
