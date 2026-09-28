// v13 lighting QA: race shot + in-page light/shadow introspection
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = process.argv[2] ?? '/home/z/my-project/scripts/qa/v13/race_light.png';
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
await page.waitForTimeout(3500);
await page.evaluate(() => { window.__apex.auto(true); window.__apex.step(35); window.__apex.unfreeze(); });

// wait for REAL rendered frames (framesRendered grows even when fps counter is throttled)
await page.waitForFunction(() => {
  const g = window.__apex;
  return g && g.fps() >= 3;
}, null, { timeout: 60000 }).then(() => true).catch(() => console.log('fps wait timed out (headless throttle)'));
await page.waitForTimeout(6000);   // let many frames render

// introspect the light rig
const rig = await page.evaluate(() => {
  const g = window.__apex;
  const scene = g.scene();
  const game = g.game();
  const sun = game.sun;
  const renderer = game.renderer;
  const lights = [];
  scene.traverse(o => {
    if (o.isDirectionalLight || o.isSpotLight || o.isHemisphereLight) {
      lights.push({ type: o.type, intensity: o.intensity, castShadow: o.castShadow, visible: o.visible });
    }
  });
  return {
    version: g.version,
    fps: g.fps(),
    cams: g.cams(),
    sun: { intensity: sun.intensity, color: '#' + sun.color.getHexString(), castShadow: sun.castShadow,
      pos: sun.position.toArray().map(v => Math.round(v)), target: sun.target.position.toArray().map(v => Math.round(v)),
      mapSize: sun.shadow.mapSize.width, shadowEnabled: renderer.shadowMap.enabled },
    exposure: renderer.toneMappingExposure,
    lights,
    cars: g.state().cars.length,
  };
});
console.log(JSON.stringify(rig, null, 2));
await page.screenshot({ path: OUT });
console.log('shot saved:', OUT, 'pageErrors:', errors);
await browser.close();
