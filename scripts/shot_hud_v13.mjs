// HUD screenshot for v13 (with the new RPM bar + angled panels)
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = process.argv[2] ?? '/home/z/my-project/scripts/qa/v13/hud.png';
fs.mkdirSync(OUT.split('/').slice(0, -1).join('/'), { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-notify-renderer-suspend'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 9 }));
await page.waitForTimeout(3000);
await page.evaluate(() => { window.__apex.auto(true); window.__apex.step(22); window.__apex.unfreeze(); });
await page.waitForTimeout(5000);
await page.screenshot({ path: OUT });
console.log('saved', OUT);
await browser.close();
