// Definitive shadow diagnosis: is the shadow map even being rendered?
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
await page.evaluate(() => { window.__apex.auto(true); window.__apex.step(20); window.__apex.unfreeze(); });
await page.waitForTimeout(3000);
const diag = await page.evaluate(() => {
  const g = window.__apex;
  const game = g.game();
  const sun = game.sun;
  const r = game.renderer;
  // count casters/receivers in the scene
  let casters = 0, receivers = 0;
  g.scene().traverse(o => { if (o.isMesh) { if (o.castShadow) casters++; if (o.receiveShadow) receivers++; } });
  return {
    shadowMapEnabled: r.shadowMap.enabled,
    shadowMapAutoUpdate: r.shadowMap.autoUpdate,
    shadowMapNeedsUpdate: r.shadowMap.needsUpdate,
    shadowMapType: r.shadowMap.type,
    sunCastShadow: sun.castShadow,
    sunShadowMap: sun.shadow.map ? 'RENDERED (' + sun.shadow.map.width + 'x' + sun.shadow.map.height + ')' : 'NULL — never rendered!',
    sunIntensity: sun.intensity,
    sunPos: sun.position.toArray().map(v => Math.round(v)),
    sunTargetPos: sun.target.position.toArray().map(v => Math.round(v)),
    sunTargetInScene: !!sun.target.parent,
    shadowCam: (() => { const c = sun.shadow.camera; return { left: c.left, right: c.right, top: c.top, bottom: c.bottom, near: c.near, far: c.far }; })(),
    casters, receivers,
    framesRendered: game.framesRendered,
  };
});
console.log(JSON.stringify(diag, null, 2));
await page.screenshot({ path: OUT });
console.log('saved', OUT);
await browser.close();
