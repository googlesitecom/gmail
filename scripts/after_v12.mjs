// AFTER screenshots: menu + intro + race in clear weather (chase cam close).
import { chromium } from 'playwright';
import fs from 'node:fs';

const SHOT = '/home/z/my-project/scripts/qa/v12/after';
fs.mkdirSync(SHOT, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
let errors = 0;
page.on('pageerror', e => { errors++; console.log('[pageerror]', String(e).slice(0, 200)); });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4500);

// 1. intro gate
await page.screenshot({ path: `${SHOT}/01_intro_gate.png` });
console.log('shot: intro gate');

// 2. intro animation (click gate, wait for the slam phase ~5s)
await page.mouse.click(800, 450);
await page.waitForTimeout(4600);
await page.screenshot({ path: `${SHOT}/02_intro_slam.png` });
console.log('shot: intro slam');

// 3. skip to menu
await page.evaluate(() => window.__vgpIntro?.skip());
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOT}/03_menu.png` });
console.log('shot: menu');

// 4. race chase cam — let autopilot run 40s then unfreeze for live frames
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 19 }));
await page.waitForTimeout(2500);
const ok = await page.waitForFunction(() => {
  const g = window.__apex;
  return g && g.fps() >= 3;
}, null, { timeout: 30000 }).then(() => true).catch(() => false);
await page.evaluate(() => { window.__apex.auto(true); window.__apex.step(35); window.__apex.unfreeze(); });
await page.waitForFunction(() => window.__apex.fps() >= 3, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOT}/04_race_clear.png` });
console.log('shot: race clear (render-wait', ok + ')');

// 5. cockpit cam
await page.evaluate(() => { window.__apex.game().camera.mode = 'cockpit'; });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${SHOT}/05_cockpit.png` });
console.log('shot: cockpit');

// 6. back to chase, high speed shot
await page.evaluate(() => { window.__apex.game().camera.mode = 'chase'; });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SHOT}/06_chase_speed.png` });
console.log('shot: chase speed · pageErrors:', errors);
await browser.close();
