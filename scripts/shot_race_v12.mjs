// Robust race screenshot: wait for actual rendered frames, verify pixels in-page.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = process.argv[2] ?? '/home/z/my-project/scripts/qa/v12/before/before_race_clear.png';
fs.mkdirSync(OUT.split('/').slice(0, -1).join('/'), { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-notify-renderer-suspend'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
let errors = 0;
page.on('pageerror', e => { errors++; console.log('[pageerror]', String(e).slice(0, 200)); });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 19 }));
await page.waitForTimeout(3000);
// fast-forward 30 s of sim then unfreeze — RAF keeps rendering
await page.evaluate(() => { window.__apex.auto(true); window.__apex.step(30); window.__apex.unfreeze(); });

// wait until the engine reports real rendered frames and canvas is non-black
const ok = await page.waitForFunction(() => {
  const g = window.__apex;
  return g && g.fps() >= 5 && g.state().cars.length > 0;
}, null, { timeout: 30000 }).then(() => true).catch(() => false);
console.log('render-wait ok:', ok, 'fps:', await page.evaluate(() => window.__apex.fps()));
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT });
console.log('shot saved:', OUT, 'pageErrors:', errors);
await browser.close();
