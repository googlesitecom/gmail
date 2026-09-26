// APEX KART v6 in-browser QA: pads OBB, glider deploy, drift entry speed,
// cup cinematic, online host panel, glacier bloom screenshots.
import { chromium } from 'playwright';

const BASE = 'http://localhost:4173/gmail/';
const SHOT = '/tmp/apex_v6';
const results = [];
const log = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? '✓' : '✗'} ${name}${info ? ' — ' + info : ''}`);
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => { const t = m.text(); if (t.includes('error') || t.includes('Error')) console.log('  [console]', t.slice(0, 160)); });
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
const booted = await page.evaluate(() => !!(window.__apex && window.__apex.game));
log('boot', booted);

// ---------- 1. PADS: drive across the LEFT EDGE of a pad ----------
await page.evaluate(() => { window.__apex.qaRace('meadow', 100, 0); });
await page.waitForTimeout(1200);
const padInfo = await page.evaluate(() => {
  const pads = window.__apex.pads();
  const p = pads[1]; // second pad
  return { pos: p.pos, right: p.right, tan: p.tan, halfW: p.halfW, n: pads.length };
});
log('pads frames', padInfo.n >= 4 && padInfo.halfW > 5, `n=${padInfo.n} halfW=${padInfo.halfW}`);

// wait for the racing phase (countdown ~2.7s) so controls are live
await page.waitForFunction(() => window.__apex.state().phase === 'racing', null, { timeout: 15000 });
// teleport onto the road near pad 1, offset to the pad's LEFT EDGE, facing along tan
// NOTE: right/tan are [x, z] pairs in the pads() dump
await page.evaluate((pi) => {
  const g = window.__apex.game();
  const k = g.karts[0];
  const edge = -(pi.halfW - 1.2);
  k.pos.set(
    pi.pos[0] + pi.tan[0] * -20 + pi.right[0] * edge,
    pi.pos[1] + 0.6,
    pi.pos[2] + pi.tan[1] * -20 + pi.right[1] * edge,
  );
  k.yaw = Math.atan2(pi.tan[0], pi.tan[1]);
  k.speed = 18;
  k.vy = 0; k.grounded = true;
  window.__apex.ctrl({ throttle: 1, steer: 0, drift: false });
}, padInfo);
// headless GL runs at 1-2 fps: step the sim deterministically, not by clock
await page.evaluate(() => window.__apex.step(1.3));
const padState = await page.evaluate(() => {
  const g = window.__apex.game();
  const k = g.karts[0];
  return { pos: k.pos.toArray().map(v => +v.toFixed(1)), v: +k.speed.toFixed(1), boost: k.boosting, cd: +k.padCooldown.toFixed(2), s: window.__apex.state().karts[0] };
});
log('pad edge boost', padState.s.boost === true, `speed=${padState.s.speed} boost=${padState.s.boost} pos=[${padState.pos}] cd=${padState.cd}`);

// ---------- 2. GLIDER: big drop (space bridge / prism dive) ----------
await page.evaluate(() => { window.__apex.ctrl(null); window.__apex.qaRace('space', 100, 0); });
await page.waitForTimeout(1200);
// find the big drop: space bridge to y22 — teleport to just after the apex with high speed
const spans = await page.evaluate(() => window.__apex.spans());
console.log('  space spans:', JSON.stringify(spans.runs).slice(0, 200));
// use tp3 to launch over the gap: find the run start s, sample the spline
await page.evaluate(() => {
  const g = window.__apex.game();
  const w = g.world;
  const sp = w.spline;
  // the largest jump run — launch just before it at full speed
  const runs = window.__apex.spans().runs;
  let best = null, bl = 0;
  for (const r of runs) {
    const l = ((r[1] - r[0]) + 1) % 1 * sp.length;
    if (l > bl) { bl = l; best = r; }
  }
  const s = ((best[0] - 0.01) + 1) % 1;
  window.__apex.tp(s);
  const k = g.karts[0];
  k.speed = 26;
  window.__apex.ctrl({ throttle: 1, steer: 0, drift: false });
});
let gliderOpened = false;
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => window.__apex.step(0.2));
  const gi = await page.evaluate(() => {
    const g = window.__apex.game();
    const k = g.karts[0];
    return { glider: k.gliderActive, vy: k.vy, air: +(k.airTime || 0).toFixed(2) };
  });
  if (gi.glider) { gliderOpened = true; break; }
}
const gliderDetail = await page.evaluate(() => {
  const g = window.__apex.game();
  const k = g.karts[0];
  return { glider: k.gliderActive, vy: +k.vy.toFixed(1), air: +(k.airTime || 0).toFixed(2), grounded: k.grounded };
});
log('glider opens on big jump', gliderOpened || gliderDetail.glider,
  `glider=${gliderDetail.glider} vy=${gliderDetail.vy} air=${gliderDetail.air}`);
await page.evaluate(() => window.__apex.ctrl(null));

// ---------- 3. DRIFT: engages below old 11 m/s gate ----------
await page.evaluate(() => { window.__apex.qaRace('meadow', 100, 0); });
await page.waitForFunction(() => window.__apex.state().phase === 'racing', null, { timeout: 15000 });
await page.evaluate(() => {
  const g = window.__apex.game();
  const k = g.karts[0];
  // straight road: set speed 9.5 (below old 11 gate), hold space + steer
  k.speed = 9.5;
  window.__apex.ctrl({ throttle: 1, steer: 0.6, drift: true });
});
await page.waitForTimeout(500);
const driftState = await page.evaluate(() => {
  const s = window.__apex.state().karts[0];
  return { drift: s.drift, v: s.speed };
});
log('drift engages at 9.5 m/s', driftState.drift === true, `v=${driftState.v} drift=${driftState.drift}`);
// release -> drift ends
await page.evaluate(() => window.__apex.ctrl({ throttle: 1, steer: 0, drift: false }));
await page.waitForTimeout(300);
const driftEnd = await page.evaluate(() => window.__apex.state().karts[0].drift);
log('drift ends on release', driftEnd === false);
await page.evaluate(() => window.__apex.ctrl(null));

// ---------- 4. BLOOM: glacier screenshot (brightness check) ----------
await page.evaluate(() => { window.__apex.qaRace('glacier', 100, 0); });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOT}_glacier.jpg`, type: 'jpeg', quality: 80 });
log('glacier screenshot taken', true);

// snow too
await page.evaluate(() => { window.__apex.qaRace('snow', 100, 0); });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOT}_snow.jpg`, type: 'jpeg', quality: 80 });
log('snow screenshot taken', true);

// ---------- 5. CUP CINEMATIC ----------
await page.evaluate(() => { window.__apex.qaRace('meadow', 100, 11); });
await page.waitForTimeout(1500);
const cine = await page.evaluate(() => window.__apex.qaCinematic('Copa Verde'));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOT}_cinematic_mid.jpg`, type: 'jpeg', quality: 85 });
const cineState = await page.evaluate(() => {
  const g = window.__apex.game();
  const cam = g.camera.camera;
  return {
    active: !!g.cinematic,
    fov: +cam.fov.toFixed(1),
    pos: cam.position.toArray().map(v => +v.toFixed(1)),
  };
});
log('cinematic running', cine === 'cinematic' && cineState.active, `fov=${cineState.fov} cam=[${cineState.pos}]`);
// skip via endCinematic
await page.evaluate(() => window.__apex.game().endCinematic());
await page.waitForTimeout(400);
const cineDone = await page.evaluate(() => !window.__apex.game().cinematic);
log('cinematic skips to results', cineDone);
await page.screenshot({ path: `${SHOT}_results_after_cine.jpg`, type: 'jpeg', quality: 80 });

// ---------- 6. ONLINE HOST PANEL (new controls render) ----------
await page.evaluate(() => window.__apex.game().quitToMenu());
await page.waitForTimeout(800);
// navigate: menu -> ONLINE (click the CTA)
// Playwright retry-loop times out when the click unmounts the menu; the
// DOM click itself works (verified: inputs render) — dispatch directly.
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('MULTIJUGADOR'))?.click());
await page.waitForTimeout(600);
const nick = await page.$('input[placeholder="Piloto"]');
if (nick) {
  await nick.fill('QAHost');
  await page.click('text=CREAR SALA').catch(() => {});
  await page.waitForTimeout(2500);
  const panelText = await page.evaluate(() => document.body.innerText);
  const has = (t) => panelText.includes(t);
  log('online room created', has('SALA ONLINE') || has('Código'), panelText.slice(0, 60));
  log('host: pista sorpresa', has('Sorpresa'));
  log('host: bots count select', has('Bots CPU'));
  log('host: bot level', has('Nivel de bots') && has('EXPERTO'));
  log('host: espejo toggle', has('Espejo'));
  log('host: frenetico toggle', has('Frenético'));
  // toggle frantic + set expert level, then verify ACTIVE states by class
  await page.evaluate(() => {
    const labels = [...document.querySelectorAll('div')];
    const franticLabel = labels.find(d => d.textContent.trim() === 'Frenético' && d.nextElementSibling?.tagName === 'BUTTON');
    franticLabel?.nextElementSibling.click();
    const lvlLabel = labels.find(d => d.textContent.trim() === 'Nivel de bots');
    // the three level buttons follow the label
    let el = lvlLabel?.nextElementSibling;
    for (const b of (el?.querySelectorAll('button') ?? [])) {
      if (b.textContent.includes('EXPERTO')) b.click();
    }
  });
  await page.waitForTimeout(800);
  const cfgActive = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('div')];
    const fl = labels.find(d => d.textContent.trim() === 'Frenético' && d.nextElementSibling?.tagName === 'BUTTON');
    const franticBtn = fl?.nextElementSibling;
    const expertBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('EXPERTO'));
    return {
      frantic: franticBtn?.className.includes('bg-fuchsia-500') ?? false,
      expert: expertBtn?.className.includes('bg-amber-400') ?? false,
    };
  });
  log('host: frantic active', cfgActive.frantic);
  log('host: expert active', cfgActive.expert);
  await page.screenshot({ path: `${SHOT}_online_host.jpg`, type: 'jpeg', quality: 85 });
  // leave the room to avoid a lingering peer
  await page.click('text=SALIR DE LA SALA').catch(() => {});
} else {
  log('online entry screen', false, 'no nickname input found');
}

await browser.close();
const fails = results.filter(r => !r.ok).length;
console.log(`\n==== QA DONE: ${results.length - fails}/${results.length} passed ====`);
