// APEX GP v10.1 diagnostics: launch spins, T1 chaos, beached cars, lap pace.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

// probe (same SAT as the game)
await page.evaluate(() => {
  window.__probe = {
    obb(ax, az, ayaw, bx, bz, byaw, hl, hw) {
      const aux = Math.sin(ayaw), auz = Math.cos(ayaw), arx = Math.cos(ayaw), arz = -Math.sin(ayaw);
      const bux = Math.sin(byaw), buz = Math.cos(byaw), brx = Math.cos(byaw), brz = -Math.sin(byaw);
      const dx = bx - ax, dz = bz - az;
      let depth = Infinity;
      const test = (ux, uz) => {
        const ra = hl * Math.abs(ux * aux + uz * auz) + hw * Math.abs(ux * arx + uz * arz);
        const rb = hl * Math.abs(ux * bux + uz * buz) + hw * Math.abs(ux * brx + uz * brz);
        const d = dx * ux + dz * uz;
        const o = ra + rb - Math.abs(d);
        if (o <= 0) return false;
        if (o < depth) depth = o;
        return true;
      };
      if (!test(aux, auz)) return null;
      if (!test(arx, arz)) return null;
      if (!test(bux, buz)) return null;
      if (!test(brx, brz)) return null;
      return { depth };
    },
  };
  return 'ok';
});

await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 5, aiCount: 19, aiLevel: 'medium' }));
await page.waitForTimeout(1800);
await page.evaluate(() => window.__apex.auto(true));

// step precisely to lights-out, then fine-sample the launch
await page.evaluate(() => {
  const r = window.__apex.race();
  const remain = Math.max(0.05, (r.goAtMs - performance.now()) / 1000 - 0.06);
  return window.__apex.step(remain);
});
console.log('--- LAUNCH (0.2s samples, first 12s) ---');
let lastSpins = '';
for (let t = 0; t < 60; t++) {
  await page.evaluate(() => window.__apex.step(0.2));
  const s = await page.evaluate(() => {
    const g = window.__apex.game();
    const spins = g.cars.filter(c => c.spinT > 0).map(c => `${c.id}(s${c.speedKmh.toFixed(0)})`);
    // who is in contact right now
    let pen = 0, pair = null;
    for (let i = 0; i < g.cars.length; i++) for (let j = i + 1; j < g.cars.length; j++) {
      const a = g.cars[i], b = g.cars[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      if (dx * dx + dz * dz > 144) continue;
      const h = window.__probe.obb(a.pos.x, a.pos.z, a.yaw, b.pos.x, b.pos.z, b.yaw, 2.7, 1.0);
      if (h && h.depth > pen) { pen = h.depth; pair = [a.id, b.id]; }
    }
    const minK = Math.min(...g.cars.map(c => c.speedKmh));
    const off = g.cars.filter(c => c.off).map(c => c.id);
    return { t: 0, spins, pen: +pen.toFixed(2), pair, minK: +minK.toFixed(0), off };
  });
  const tag = s.spins.join(',') + '|' + s.off.join(',');
  if (tag !== lastSpins || s.pen > 0.05) {
    console.log(`t=${((t + 1) * 0.2).toFixed(1)}s spins=[${s.spins.join(',') || '-'}] pen=${s.pen} pair=${s.pair ? s.pair.join('↔') : '-'} minK=${s.minK} off=[${s.off.join(',') || '-'}]`);
    lastSpins = tag;
  }
}

console.log('--- MID RACE (5s samples to 140s) ---');
for (let t = 0; t < 25; t++) {
  await page.evaluate(() => window.__apex.step(5));
  const s = await page.evaluate(() => {
    const g = window.__apex.game();
    const st = window.__apex.state();
    const slow = g.cars.filter(c => c.speedKmh < 8 && !c.finished).map(c => ({
      id: c.id, kmh: +c.speedKmh.toFixed(0), surf: c.surface,
      off: c.off, spin: +(c.spinT || 0).toFixed(1),
      stalled: +(c.stalledOff || 0).toFixed(1), tangent: +(c.lastTangentDot || 0).toFixed(2),
      lat: +g.world.spline.project(c.pos, -1).lateral.toFixed(1),
      prog: +c.progressS.toFixed(3),
    }));
    const maxLap = Math.max(...st.race.states.map(x => x.lap));
    const leadM = Math.max(...st.race.states.map(x => x.totalM));
    return { maxLap, leadM: Math.round(leadM), slow, spins: st.cars.filter(c => c.spin > 0).length };
  });
  if (t % 2 === 0 || s.slow.length) {
    console.log(`t=${140 - (25 - t) * 5}s lap=${s.maxLap} lead=${s.leadM}m spins=${s.spins} slow=${JSON.stringify(s.slow)}`);
  }
}

await browser.close();
