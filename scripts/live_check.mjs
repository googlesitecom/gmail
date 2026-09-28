import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errs = 0;
page.on('pageerror', e => { errs++; console.log('[pageerror]', String(e).slice(0, 160)); });
await page.goto('https://googlesitecom.github.io/gmail/', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
console.log('boot __apex:', await page.evaluate(() => !!window.__apex));
// quick race + cinematic on LIVE
await page.evaluate(() => window.__apex.qaRace('glacier', 100, 3));
await page.waitForTimeout(2500);
console.log('race state:', JSON.stringify(await page.evaluate(() => ({
  phase: window.__apex.state().phase,
  karts: window.__apex.state().karts.length,
  fps: window.__apex.state().fps,
}))));
await page.screenshot({ path: '/tmp/apex_v6_live_glacier.jpg', type: 'jpeg', quality: 80 });
console.log('cinematic:', await page.evaluate(() => window.__apex.qaCinematic('Copa Escarcha')));
await page.waitForTimeout(2000);
console.log('cinematic active:', await page.evaluate(() => !!window.__apex.game().cinematic));
await page.evaluate(() => window.__apex.game().endCinematic());
console.log('page errors:', errs);
await browser.close();
