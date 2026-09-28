import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:4173/gmail/', { waitUntil: 'networkidle' });
await page.waitForTimeout(12000);
await page.screenshot({ path: '/tmp/apex_v8/final-menu.png' });
await page.evaluate(() => window.__apex.start({ mode: 'vs', trackId: 'meadow', laps: 2, aiCount: 11 }));
await page.waitForFunction(() => window.__apex.state().phase === 'racing', null, { timeout: 20000 });
await page.evaluate(() => { window.__apex.ctrl({ throttle: 1, steer: 0 }); window.__apex.step(6); });
await page.waitForTimeout(6000);   // let several REAL frames render at the new camera position
await page.screenshot({ path: '/tmp/apex_v8/final-meadow.png' });
// hop-drift moment for a lively shot
await page.evaluate(() => {
  window.__apex.ctrl({ throttle: 1, steer: 1, drift: true });
  window.__apex.step(1.4);
});
await page.waitForTimeout(5000);
await page.screenshot({ path: '/tmp/apex_v8/final-drift.png' });
// glacier wet
await page.evaluate(() => window.__apex.start({ mode: 'vs', trackId: 'glacier', laps: 2, aiCount: 5 }));
await page.waitForFunction(() => window.__apex.state().phase === 'racing', null, { timeout: 20000 });
await page.evaluate(() => { window.__apex.ctrl({ throttle: 1, steer: 0 }); window.__apex.step(5); });
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/apex_v8/final-glacier.png' });
await browser.close();
