// Debug: replicate the exact qa_f1.mjs sequence up to alpino
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.evaluate(() => window.__vgpIntro?.skip());

const step = (s) => page.evaluate(t => window.__apex.step(t), s);
const state = () => page.evaluate(() => window.__apex.state());

// 2. solo velocita (same as qa_f1)
await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 3, aiCount: 0 }));
await page.waitForTimeout(2000);
await step(9);
await page.evaluate(() => window.__apex.ctrl({ throttle: 1 }));
await step(1.5); await step(2.5);
await page.evaluate(() => window.__apex.tp(0.995, 60));
await step(1.6);
await page.evaluate(() => window.__apex.ctrl({ brake: 1 }));
await step(2);
await page.evaluate(() => window.__apex.ctrl(null));
await step(1.5); await step(6); await step(4);

// 3. full grid velocita
await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 5, aiCount: 9, aiLevel: 'medium' }));
await page.waitForTimeout(2200);
await page.evaluate(() => window.__apex.auto(true));
await step(9); await step(50); await step(50);
let st = await state();
console.log('grid test: phase', st.phase, 'speeds', st.cars.map(c => c.kmh).join(','));

// 4. cameras
for (const cam of ['cockpit', 'tv', 'nose', 'chase']) {
  await page.evaluate(m => { window.__apex.game().camera.mode = m; }, cam);
  await page.waitForTimeout(900);
}

// 5. timetrial bahia
await page.evaluate(() => window.__apex.start({ mode: 'timetrial', circuitId: 'bahia', laps: 3, aiCount: 0 }));
await page.waitForTimeout(1800);
await step(9);
await page.evaluate(() => window.__apex.auto(true));
await step(25); await step(15);
st = await state();
console.log('timetrial: phase', st.phase, 'cars', st.cars.length, 'kmh', st.cars[0]?.kmh);

// 6. ALPINO — the failing one
await page.evaluate(() => window.__apex.start({ circuitId: 'alpino', laps: 3, aiCount: 9 }));
await page.waitForTimeout(2200);
st = await state();
console.log('alpino after start: phase', st.phase, 'cars', st.cars.length, 'race', st.race?.phase);
await step(9);
st = await state();
console.log('alpino after step9: phase', st.phase, 'race', st.race?.phase, 'goAt', st.race?.goAt,
  'perfNow', await page.evaluate(() => performance.now()), 'speeds', st.cars.map(c => c.kmh).join(','));
await page.evaluate(() => window.__apex.auto(true));
await step(35);
st = await state();
console.log('alpino after step35: phase', st.phase, 'speeds', st.cars.map(c => c.kmh).join(','));
console.log('elev spread:', Math.max(...st.cars.map(c => c.pos[1])) - Math.min(...st.cars.map(c => c.pos[1])));
await browser.close();
