// Probe: is MSAA active on the composer RT? Any WebGL console errors?
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const consoleMsgs = [];
page.on('console', m => consoleMsgs.push(m.text().slice(0, 200)));
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4500);
await page.evaluate(() => window.__vgpIntro?.skip());
await page.waitForTimeout(800);

const probe = await page.evaluate(() => {
  const g = window.__apex.game();
  const info = {
    pixelRatio: g.renderer.getPixelRatio(),
    // composer internals
    rt1: g.composer.renderTarget1 ? {
      samples: g.composer.renderTarget1.samples,
      w: g.composer.renderTarget1.width, h: g.composer.renderTarget1.height,
      type: g.composer.renderTarget1.texture.type,
    } : null,
    passes: g.composer.passes.map(p => p.constructor.name),
    // grade uniforms live?
    grade: g.composer.passes.find(p => p.constructor.name === 'ShaderPass')?.uniforms
      ? Object.fromEntries(Object.entries(g.composer.passes.find(p => p.constructor.name === 'ShaderPass').uniforms)
        .map(([k, v]) => [k, v.value])) : null,
    bloomStrength: g.composer.passes.find(p => p.constructor.name === 'UnrealBloomPass')?.strength,
  };
  return JSON.parse(JSON.stringify(info, (k, v) => typeof v === 'number' ? v : v));
});
console.log(JSON.stringify(probe, null, 1));
console.log('--- console messages (first 15):');
for (const m of consoleMsgs.slice(0, 15)) console.log(' ', m);
await browser.close();
