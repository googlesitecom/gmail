// Final v11 showcase screenshots: action shots in all 4 weathers + cockpit cam.
import { chromium } from 'playwright';
import fs from 'node:fs';

const SHOT = '/home/z/my-project/scripts/qa/v11';
fs.mkdirSync(SHOT, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
let errors = 0;
page.on('pageerror', e => { errors++; console.log('[pageerror]', String(e).slice(0, 180)); });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

const shots = [
  { weather: 'clear', circuit: 'velocita' },
  { weather: 'cloudy', circuit: 'velocita' },
  { weather: 'rain', circuit: 'velocita' },
  { weather: 'night', circuit: 'velocita' },
  { weather: 'clear', circuit: 'alpino' },
];
for (const s of shots) {
  await page.evaluate(cfg => window.__apex.start({
    weather: cfg.weather, circuitId: cfg.circuit, laps: 3, aiCount: 19,
  }), s);
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__apex.auto(true); window.__apex.step(26); window.__apex.unfreeze(); });
  await page.waitForTimeout(1500);
  const cam = s.weather === 'rain' ? null : null;
  const name = s.circuit === 'alpino' ? 'final_alpine_clear' : `final_${s.weather}`;
  await page.screenshot({ path: `${SHOT}/${name}.png` });
  console.log('shot:', name);
  await page.evaluate(() => window.__apex.game().quitToMenu());
  await page.waitForTimeout(700);
}

// cockpit cam (the "inside the car" view)
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 19 }));
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const g = window.__apex.game();
  g.camera.mode = 'cockpit';
  window.__apex.auto(true);
  window.__apex.step(30);
  window.__apex.unfreeze();
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOT}/final_cockpit.png` });
console.log('shot: final_cockpit');

// menu + circuit weather UI
await page.evaluate(() => window.__apex.game().quitToMenu());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__vgpIntro?.skip());   // dismiss the F1 intro (QA)
await page.waitForTimeout(400);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SHOT}/final_menu.png` });
console.log('shot: final_menu — pageErrors:', errors);
await browser.close();
