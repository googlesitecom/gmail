// APEX GP v10.1 diagnostics round 3: WHO spins, from WHAT closing speed.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

await page.evaluate(() => window.__apex.start({ circuitId: 'velocita', laps: 5, aiCount: 19, aiLevel: 'medium' }));
await page.waitForTimeout(1800);
await page.evaluate(() => window.__apex.auto(true));

// instrument spinFromContact: log victim, rel, nearest car (attacker guess)
await page.evaluate(() => {
  const g = window.__apex.game();
  const proto = Object.getPrototypeOf(g.cars[0]);
  const orig = proto.spinFromContact;
  window.__spins = [];
  proto.spinFromContact = function (power) {
    const rel = power * 20;
    let attacker = null, best = Infinity;
    for (const o of g.cars) {
      if (o === this) continue;
      const d = Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
      if (d < best) { best = d; attacker = o; }
    }
    window.__spins.push({
      t: +(performance.now() / 1000).toFixed(2),
      victim: this.id, rel: +rel.toFixed(1),
      attacker: attacker ? attacker.id : null, dist: +best.toFixed(1),
      vs: attacker ? +Math.abs(attacker.vLong).toFixed(0) : 0,
      vvictim: +Math.abs(this.vLong).toFixed(0),
      prog: +this.progressS.toFixed(3),
    });
    return orig.call(this, power);
  };
  return 'instrumented';
});

await page.evaluate(() => {
  const r = window.__apex.race();
  const remain = Math.max(0.05, (r.goAtMs - performance.now()) / 1000 - 0.06);
  return window.__apex.step(remain);
});

// 60 s of racing, dump spin events + leader progress every 5 s
for (let t = 0; t < 12; t++) {
  await page.evaluate(() => window.__apex.step(5));
  const s = await page.evaluate(() => {
    const st = window.__apex.state();
    const lead = Math.max(...st.race.states.map(x => x.totalM));
    return { lead: Math.round(lead), spins: window.__spins.splice(0) };
  });
  console.log(`t=${((t + 1) * 5).toFixed(0)}s lead=${s.lead}m`);
  for (const sp of s.spins) {
    console.log(`   SPIN t=${sp.t}s ${sp.victim} ← ${sp.attacker} · rel=${sp.rel} m/s · dist=${sp.dist}m · v att/víc=${sp.vs}/${sp.vvictim} · prog=${sp.prog}`);
  }
}
await browser.close();
