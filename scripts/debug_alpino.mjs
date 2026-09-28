// Debug: alpino session state after the same QA sequence
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', m => { const t = m.text(); if (/error|Error/i.test(t)) console.log('[console]', t.slice(0, 200)); });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.evaluate(() => window.__vgpIntro?.skip());
await page.evaluate(() => window.__apex.start({ circuitId: 'alpino', laps: 3, aiCount: 9 }));
await page.waitForTimeout(2500);
let st = await page.evaluate(() => window.__apex.state());
console.log('after start: phase', st.phase, 'cars', st.cars.length, 'race', JSON.stringify(st.race?.phase), 'lit', st.race?.litPods);
console.log('car0:', JSON.stringify(st.cars[0]));
await page.evaluate(() => window.__apex.step(9));
st = await page.evaluate(() => window.__apex.state());
console.log('after step9: phase', st.phase, 'race', st.race?.phase, 'goAt', st.race?.goAt, 'perfNow', await page.evaluate(() => performance.now()));
console.log('speeds:', st.cars.map(c => c.kmh).join(','));
await page.evaluate(() => window.__apex.auto(true));
await page.evaluate(() => window.__apex.step(10));
st = await page.evaluate(() => window.__apex.state());
console.log('after step10: phase', st.phase, 'speeds:', st.cars.map(c => c.kmh).join(','));
console.log('ctrl car0:', JSON.stringify(st.cars[0].ctrl), 'spin', st.cars[0].spin, 'vLong', st.cars[0].vLong, 'surface', st.cars[0].surface);
await browser.close();
