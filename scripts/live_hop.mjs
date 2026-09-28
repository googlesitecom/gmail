import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('https://googlesitecom.github.io/gmail/', { waitUntil: 'networkidle' });
await page.waitForTimeout(8000);
await page.evaluate(() => window.__apex.start({ mode: 'vs', trackId: 'meadow', laps: 2, aiCount: 3 }));
await page.waitForFunction(() => window.__apex.state().phase === 'racing', null, { timeout: 30000 });
const hop = await page.evaluate(() => {
  const k = window.__apex.game().karts[0];
  window.__apex.tp(0.35);            // long straight, speed 18, aimed forward
  window.__apex.step(0.4);
  window.__apex.ctrl({ throttle: 1, steer: 0, drift: false });
  window.__apex.step(1.2);           // build speed
  const v = +k.speed.toFixed(1);
  window.__apex.ctrl({ throttle: 1, steer: 0.7, drift: true });
  window.__apex.step(1 / 60);
  const press = { airborne: k.airborne, drift: k.drifting };
  window.__apex.step(0.3);
  return { v, press, after: { airborne: k.airborne, drift: k.drifting } };
});
console.log('LIVE hop (controlled):', JSON.stringify(hop));
await browser.close();
