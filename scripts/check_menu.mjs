import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const txt = await page.evaluate(() => document.body.innerText);
console.log('--- MENU TEXT ---');
console.log(txt);
await browser.close();
