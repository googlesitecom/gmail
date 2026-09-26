// Does the main thread block during race start? Plain interval probe.
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on('console', m => { const t = m.text(); if (t.includes('tick') || t.includes('[music]')) console.log('[console]', t.slice(0, 120)); });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
await page.mouse.click(700, 400);
await page.waitForTimeout(1500);

// plain canary interval
await page.evaluate(() => {
  window.__tick0 = performance.now();
  let n = 0;
  setInterval(() => { n++; if (n <= 40) console.log('tick', n, Math.round(performance.now() - window.__tick0), 'ms'); }, 100);
});
await page.waitForTimeout(1200);
console.log('--- starting race (canary running)');
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 0 }));
await page.waitForTimeout(4500);
const canary = await page.evaluate(() => window.__tickN ?? 'n/a');
console.log('--- end');
await browser.close();
