import { chromium } from 'playwright';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on('console', m => { const t = m.text(); if (t.includes('[music]') || t.includes('play') || t.includes('pause')) console.log('[console]', t.slice(0, 150)); });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
await page.mouse.click(700, 400);
await page.waitForTimeout(2000);
console.log('--- starting race');
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 0 }));
await page.waitForTimeout(4000);
await browser.close();
