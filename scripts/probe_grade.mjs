// Verify live grade uniforms + capture a high-speed frame in one shot
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4500);
await page.evaluate(() => window.__vgpIntro?.skip());
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 19 }));
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__apex.auto(true); window.__apex.step(40); window.__apex.unfreeze(); });
await page.waitForTimeout(2200);
const info = await page.evaluate(() => {
  const g = window.__apex.game();
  const gp = g.composer.passes.find(p => p.constructor.name === 'ShaderPass' && p.uniforms.contrast);
  const fx = g.composer.passes.filter(p => p.constructor.name === 'ShaderPass').map(p => p.material?.fragmentShader?.slice(0, 60));
  return {
    contrast: gp?.uniforms.contrast.value,
    saturation: gp?.uniforms.saturation.value,
    speedWarp: gp?.uniforms.speedWarp.value,
    passCount: g.composer.passes.length,
    shaders: fx,
    speedKmh: Math.round(g.cars[0].speedKmh),
    fxaaRes: g.composer.passes.find(p => p.uniforms?.resolution)?.uniforms.resolution.value.toArray(),
  };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: '/home/z/my-project/scripts/qa/v12/after/07_race_1080.png' });
console.log('shot saved 1080p');
await browser.close();
