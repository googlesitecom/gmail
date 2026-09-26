// FINAL shots: verify the race is actually LIVE (speed > 20) before shooting.
import { chromium } from 'playwright';
import fs from 'node:fs';

const SHOT = '/home/z/my-project/scripts/qa/v12/after';
fs.mkdirSync(SHOT, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-notify-renderer-suspend'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);                 // cold server: first asset load
await page.evaluate(() => window.__vgpIntro?.skip());
await page.waitForTimeout(400);

// warm the assets with one throwaway session (first start is the slow one)
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 0 }));
await page.waitForFunction(() => window.__apex.state().phase !== 'idle', null, { timeout: 30000 });
await page.evaluate(() => window.__apex.game().quitToMenu());
await page.waitForTimeout(600);

// menu shot
await page.screenshot({ path: `${SHOT}/03_menu.png` });
console.log('shot: menu');

// live race
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 5, aiCount: 19 }));
await page.waitForFunction(() => {
  const g = window.__apex.game();
  return g.cars && g.cars.length === 20;
}, null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.evaluate(() => { window.__apex.auto(true); window.__apex.step(42); });
// verify the car is racing at speed before the shot
const live = await page.waitForFunction(() => {
  const p = window.__apex.game().cars[0];
  return p && p.speedKmh > 60;
}, null, { timeout: 25000 }).then(() => true).catch(() => false);
console.log('race live:', live, 'kmh:', await page.evaluate(() => Math.round(window.__apex.game().cars[0].speedKmh)));
await page.screenshot({ path: `${SHOT}/04_race_clear.png` });
console.log('shot: race clear');

// cockpit
await page.evaluate(() => { window.__apex.game().camera.mode = 'cockpit'; });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOT}/05_cockpit.png` });
console.log('shot: cockpit');

// chase again (speed shot)
await page.evaluate(() => { window.__apex.game().camera.mode = 'chase'; });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOT}/06_chase_speed.png` });
console.log('shot: chase speed — done');
await browser.close();
