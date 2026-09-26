// v13 cockpit T-cam verification: start a race, switch to COCKPIT camera,
// let the autopilot drive, screenshot what the driver actually sees.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = process.argv[2] ?? '/home/z/my-project/scripts/qa/v13/cockpit.png';
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

await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 9 }));
await page.waitForTimeout(3000);
await page.evaluate(() => {
  // cycle to cockpit: chase -> cockpit
  const g = window.__apex;
  g.auto(true);
  // cycle camera via the game's exposed cams handle
  const game = g.game();
  game.camera.cycleMode();   // chase -> cockpit
  g.step(26);                // let the field spread out
  g.unfreeze();
});
const ok = await page.waitForFunction(() => {
  const g = window.__apex;
  return g && g.fps() >= 5 && g.cams().mode === 'cockpit';
}, null, { timeout: 30000 }).then(() => true).catch(() => false);
console.log('cockpit mode ok:', ok, 'cams:', await page.evaluate(() => window.__apex.cams()));
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT });
console.log('shot saved:', OUT, 'pageErrors:', errors);
await browser.close();
