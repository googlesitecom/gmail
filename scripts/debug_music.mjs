// LOCAL: trace Audio play/pause calls through menu → race → menu
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

await page.evaluate(() => {
  window.__audioLog = [];
  const proto = HTMLMediaElement.prototype;
  for (const m of ['play', 'pause']) {
    const orig = proto[m];
    proto[m] = function (...a) {
      window.__audioLog.push([m, +(this.currentTime || 0).toFixed(1), +(performance.now() / 1000).toFixed(1), (this.src || '').split('/').pop()]);
      return orig.apply(this, a);
    };
  }
});

await page.evaluate(() => window.__vgpIntro?.skip());
await page.waitForTimeout(600);
// simulate menu music start (as the intro click would)
await page.mouse.click(700, 400); // noop if intro gone — call musicStart via intro path? use a fresh reload instead
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
await page.evaluate(() => {
  window.__audioLog = [];
  const proto = HTMLMediaElement.prototype;
  for (const m of ['play', 'pause']) {
    const orig = proto[m];
    proto[m] = function (...a) {
      window.__audioLog.push([m, +(this.currentTime || 0).toFixed(1), +(performance.now() / 1000).toFixed(1), (this.src || '').split('/').pop()]);
      return orig.apply(this, a);
    };
  }
});
// intro gate → click → music starts
await page.mouse.click(700, 400);
await page.waitForTimeout(2000);
console.log('after gate click:', JSON.stringify(await page.evaluate(() => window.__audioLog)));

// race start → music must stop
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 0 }));
await page.waitForTimeout(4000);
console.log('after race start:', JSON.stringify(await page.evaluate(() => window.__audioLog)));
const elState = await page.evaluate(() => {
  // find the audio via constructor hook wasn't set on reload; probe AudioSys through the game bundle is hard —
  // instead check any media element the page created
  return document.querySelectorAll('audio').length;
});
console.log('dom audio elements:', elState);
await browser.close();
