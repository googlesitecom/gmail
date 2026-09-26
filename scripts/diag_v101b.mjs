// APEX GP v10.1 diagnostics round 2: launch spin identity + rank trajectories.
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

await page.evaluate(() => {
  const r = window.__apex.race();
  const remain = Math.max(0.05, (r.goAtMs - performance.now()) / 1000 - 0.06);
  return window.__apex.step(remain);
});

console.log('--- fine-grained launch (0.25s) — spins, contacts, rank of spinners ---');
let lastTag = '';
for (let t = 0; t < 48; t++) {
  await page.evaluate(() => window.__apex.step(0.25));
  const s = await page.evaluate(() => {
    const g = window.__apex.game();
    const st = window.__apex.state();
    const spins = g.cars.filter(c => c.spinT > 0).map(c => `${c.id}@P${c.rank}(s${c.speedKmh.toFixed(0)},${c.surface})`);
    let pen = 0, pair = null;
    for (let i = 0; i < g.cars.length; i++) for (let j = i + 1; j < g.cars.length; j++) {
      const a = g.cars[i], b = g.cars[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      if (dx * dx + dz * dz > 144) continue;
      const h = window.__probe.obb(a.pos.x, a.pos.z, a.yaw, b.pos.x, b.pos.z, b.yaw, 2.7, 1.0);
      if (h && h.depth > pen) { pen = h.depth; pair = [a.id, b.id]; }
    }
    const ranks = Object.fromEntries(st.cars.map(c => [c.id, c.rank]));
    return { spins, pen: +pen.toFixed(2), pair, ranks, off: g.cars.filter(c => c.off).map(c => c.id) };
  });
  const tag = s.spins.join(',') + s.pen;
  if (s.spins.length || s.pen > 0.05) {
    console.log(`t=${((t + 1) * 0.25).toFixed(2)}s spins=[${s.spins.join(' | ') || '-'}] pen=${s.pen} ${s.pair ? s.pair.join('↔') : ''}`);
    lastTag = tag;
  }
  if ((t + 1) % 8 === 0) {
    const order = Object.entries(s.ranks).sort((a, b) => a[1] - b[1]).map(([id, r]) => `${r}:${id.replace('ai', '').replace('player', 'P')}`).join(' ');
    console.log(`  [ranks@${((t + 1) * 0.25).toFixed(1)}s] ${order}`);
  }
}

console.log('--- lap pace check (to 105s) ---');
for (let t = 0; t < 7; t++) {
  await page.evaluate(() => window.__apex.step(5));
  const s = await page.evaluate(() => {
    const st = window.__apex.state();
    return { lap: Math.max(...st.race.states.map(x => x.lap)), lead: Math.round(Math.max(...st.race.states.map(x => x.totalM))), t: window.__apex.game().race.raceStartClockMs };
  });
  console.log(`+${((t + 1) * 5 + 12).toFixed(0)}s lap=${s.lap} lead=${s.lead}m`);
}

await browser.close();
