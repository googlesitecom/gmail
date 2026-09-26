// Definitive shadow test: place a big white sphere on the road beside the
// player, screenshot, and look for its cast shadow.
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/home/z/my-project/scripts/qa/v13/shadowtest.png';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-notify-renderer-suspend'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 0 }));
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const g = window.__apex;
  g.auto(true); g.step(20); g.unfreeze();
  // park a white sphere 12 m ahead on the road
  const game = g.game(), scene = g.scene();
  const p = game.cars[0].pos, fwd = game.cars[0].forward();
  const geo = new THREE__SphereGeometry ? null : null; // placeholder
});
// do the sphere via import inside page context
await page.evaluate(() => {
  const g = window.__apex;
  const game = g.game(), scene = g.scene();
  const car = game.cars[0];
  const fwd = car.forward();
  const geo = new window.THREE ? null : null;
});
await page.addScriptTag({ url: 'https://unpkg.com/three@0.160.0/build/three.min.js' }).catch(() => {});
await page.evaluate(() => {
  const g = window.__apex;
  const game = g.game(), scene = g.scene();
  const car = game.cars[0];
  const fwd = car.forward();
  const T = window.THREE;
  const geo = new T.SphereGeometry(1.6, 24, 16);
  const mat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const s = new T.Mesh(geo, mat);
  s.position.set(car.pos.x + fwd.x * 14, car.pos.y + 1.6, car.pos.z + fwd.z * 14);
  s.castShadow = true;
  scene.add(s);
  window.__probe = s;
});
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT });
console.log('saved', OUT);
await browser.close();
