// Focused blue-flag probe: is the YIELD logic alive? (isolates the AI behaviour
// from the QA-autopilot's own traffic following, which can mask the approach)
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

await page.evaluate(() => window.__apex.start({ laps: 5, aiCount: 19 }));
await page.waitForTimeout(2000);
// run the field for a while
await page.evaluate(() => window.__apex.auto(true));
await page.evaluate(() => window.__apex.step(100));

const out = await page.evaluate(() => {
  const g = window.__apex.game();
  const len = g.world.spline.length;
  // probe helpers (same as qa_v11)
  window.__probe = {
    lat(car) {
      const s = ((car.progressS % 1) + 1) % 1;
      const sm = g.world.spline.sampleAt(s);
      const dx = car.pos.x - sm.pos.x, dz = car.pos.z - sm.pos.z;
      return dx * sm.right.x + dz * sm.right.z;
    },
    lineLat(car) {
      const s = ((car.progressS % 1) + 1) % 1;
      const idx = Math.round(s * (g.world.racingLine.vTarget.length - 1));
      return g.world.racingLine.lat[idx] ?? 0;
    },
  };
  // pick the LEADER as the backmarker target and place the player a lap up 30 m behind
  const states = [...g.race.states.values()];
  const target = g.cars.find(c => c.id === states[0].id) ?? g.cars[1];
  const player = g.cars[0];
  const ps = g.race.states.get(player.id);
  const ts2 = ((target.progressS % 1) + 1) % 1;
  const backS = (((ts2 - 30 / len) % 1) + 1) % 1;
  ps.totalM = g.race.states.get(target.id).totalM + len - 30;
  ps.lap = g.race.states.get(target.id).lap + 1;   // a full lap up
  const sp = g.world.spline;
  const sm = sp.sampleAt(backS);
  player.placeAt(sp.roadPoint(backS, 0), Math.atan2(sm.tangent.x, sm.tangent.z));
  player.vLong = Math.abs(target.vLong) + 6;
  ps.lastS = backS;

  const samples = [];
  let before = { off: Math.abs(window.__probe.lat(target) - window.__probe.lineLat(target)), v: Math.abs(target.vLong) };
  for (let t = 0; t < 16; t++) {
    window.__apex.step(0.4);
    const off = Math.abs(window.__probe.lat(target) - window.__probe.lineLat(target));
    const v = Math.abs(target.vLong);
    const st = g.race.states.get(target.id);
    samples.push({ t: +((t + 1) * 0.4).toFixed(1), off: +off.toFixed(2), v: +v.toFixed(1), lap: st.lap });
  }
  const maxOff = Math.max(...samples.map(s => s.off));
  const minV = Math.min(...samples.map(s => s.v));
  return { target: target.driverName, before, maxOff, minV, samples: samples.filter((_, i) => i % 2 === 0) };
});

console.log('target:', out.target);
console.log('before yield: offLine', out.before.off.toFixed(2), 'm ·', out.before.v.toFixed(1), 'm/s');
console.log('during: max offLine', out.maxOff.toFixed(2), 'm · min speed', out.minV.toFixed(1), 'm/s');
console.log('samples:', JSON.stringify(out.samples, null, 0));
const yielded = out.maxOff > 1.2 || out.minV < out.before.v * 0.85;
console.log(yielded ? 'BLUE FLAG YIELD: WORKING' : 'BLUE FLAG YIELD: NOT DETECTED');
await browser.close();
process.exit(yielded ? 0 : 1);
