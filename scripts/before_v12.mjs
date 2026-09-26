// BEFORE screenshots of the current v11 state (menu + race + cams).
import { chromium } from 'playwright';
import fs from 'node:fs';

const SHOT = '/home/z/my-project/scripts/qa/v12/before';
fs.mkdirSync(SHOT, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
let errors = 0;
page.on('pageerror', e => { errors++; console.log('[pageerror]', String(e).slice(0, 180)); });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

// menu
await page.screenshot({ path: `${SHOT}/before_menu.png` });
console.log('shot: before_menu');

// clear race chase cam
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 19 }));
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__apex.auto(true); window.__apex.step(30); window.__apex.unfreeze(); });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOT}/before_race_clear.png` });
console.log('shot: before_race_clear');
console.log('pageErrors:', errors);
await browser.close();
