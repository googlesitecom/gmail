// APEX KART v9 in-browser QA: "Red de Seda" — puppet smoothing lab (jittered
// 20 Hz stream + 250 ms gap must NOT freeze/snap the puppet), batched bot
// stream (ONE sendBotStates call per tick, vy on the wire), 'bots' wire
// decode, per-theme bloom (day/ice OFF, neon/ember subtle), sharper shadows.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:4173/gmail/';
const SHOT = '/tmp/apex_v9';
fs.mkdirSync(SHOT, { recursive: true });
const results = [];
const log = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? '✓' : '✗'} ${name}${info ? ' — ' + info : ''}`);
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let pageErrors = 0;
page.on('console', m => { const t = m.text(); if (t.includes('error') || t.includes('Error')) { pageErrors++; console.log('  [console]', t.slice(0, 160)); } });
page.on('pageerror', e => { pageErrors++; console.log('  [pageerror]', String(e).slice(0, 200)); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
log('boot', await page.evaluate(() => !!(window.__apex && window.__apex.game)));

// ===================== 1. MENU: subtle showroom bloom =====================
const menuBloom = await page.evaluate(() => {
  const g = window.__apex.game();
  return { enabled: g.bloom.enabled, strength: +g.bloom.strength.toFixed(2), threshold: +g.bloom.threshold.toFixed(2) };
});
log('menu showroom bloom subtle', menuBloom.enabled === true && menuBloom.strength <= 0.25,
  JSON.stringify(menuBloom));

// ===================== 2. DAY THEME: NO bloom + sharp shadows =====================
await page.evaluate(() => window.__apex.start({
  mode: 'vs', trackId: 'meadow', laps: 3, aiCount: 11,
  playerId: 'rex', playerKartColor: 0xe85a5a, itemsEnabled: false,
}));
await page.waitForFunction(() => window.__apex.state().phase === 'racing', null, { timeout: 20000 });
const dayPost = await page.evaluate(() => {
  const g = window.__apex.game();
  const sc = g.sun.shadow.camera;
  const p = g.karts[0].pos;
  return {
    bloomOn: g.bloom.enabled, strength: g.bloom.strength,
    // three r186: PCFShadowMap = 1 (PCFSoft was removed; PCF is now soft)
    shadowType: g.renderer.shadowMap.type,
    shadowRadius: g.sun.shadow.radius,
    l: sc.left, r: sc.right, near: sc.near, far: sc.far,
    map: g.sun.shadow.mapSize.width,
    sunFollows: Math.abs(g.sun.target.position.x - p.x) < 1 && Math.abs(g.sun.target.position.z - p.z) < 1,
    castShadow: g.sun.castShadow,
  };
});
log('DAY theme: bloom OFF (realism, no milky glow)', dayPost.bloomOn === false && dayPost.strength === 0,
  `enabled=${dayPost.bloomOn} strength=${dayPost.strength}`);
log('shadows sharper (frustum ±42)', dayPost.l === -42 && dayPost.r === 42 && dayPost.near === 14 && dayPost.far === 175,
  `l=${dayPost.l} r=${dayPost.r} near=${dayPost.near} far=${dayPost.far}`);
log('shadow rig: soft PCF(r186) radius 4 + follows player',
  dayPost.shadowType === 1 && dayPost.shadowRadius === 4 && dayPost.map === 2048 && dayPost.castShadow && dayPost.sunFollows,
  `type=${dayPost.shadowType} radius=${dayPost.shadowRadius} map=${dayPost.map} follows=${dayPost.sunFollows}`);
await page.screenshot({ path: `${SHOT}/01_meadow_nobloom.png` });

// ===================== 3. ICE: OFF · NEON/EMBER: subtle =====================
const themeBloom = {};
for (const [track, want] of [['glacier', 'off'], ['city', 'neon'], ['volcano', 'ember']]) {
  themeBloom[track] = await page.evaluate((t) => {
    window.__apex.start({
      mode: 'vs', trackId: t, laps: 1, aiCount: 3,
      playerId: 'rex', playerKartColor: 0xe85a5a, itemsEnabled: false,
    });
    const g = window.__apex.game();
    return { enabled: g.bloom.enabled, strength: +g.bloom.strength.toFixed(2), threshold: +g.bloom.threshold.toFixed(2) };
  }, track);
  await page.waitForTimeout(400);
}
log('ICE theme bloom OFF', themeBloom.glacier.enabled === false, JSON.stringify(themeBloom.glacier));
log('NEON theme (city) subtle emissive bloom', themeBloom.city.enabled === true && themeBloom.city.strength === 0.26 && themeBloom.city.threshold === 0.93,
  JSON.stringify(themeBloom.city));
log('EMBER theme (volcano) subtle bloom', themeBloom.volcano.enabled === true && themeBloom.volcano.strength === 0.30 && themeBloom.volcano.threshold === 0.90,
  JSON.stringify(themeBloom.volcano));
await page.waitForFunction(() => window.__apex.state().phase === 'racing', null, { timeout: 20000 });
await page.screenshot({ path: `${SHOT}/02_volcano_ember.png` });

// ===================== 4. HOST SHAPE: 20 Hz batched stream + vy =====================
// mock NetClient records wire calls — must expose every method Game touches
await page.evaluate(() => {
  const calls = { state: 0, botBatches: 0, rows: [], withVy: 0, withT: 0, other: [] };
  const mock = {
    onPeerState: null, onPeerEvent: null, onPeerLeft: null, onRaceOver: null, onRaceStart: null,
    sendState: (st) => { calls.state++; if (typeof st.vy === 'number') calls.withVy++; if (typeof st.t === 'number') calls.withT++; },
    sendBotStates: (rows) => { calls.botBatches++; if (rows.length) calls.rows.push(rows.map(r => r[0])); },
    sendEvent: () => { calls.other.push('ev'); }, sendEventFor: () => { calls.other.push('evFor'); },
    finishRace: () => {}, finishRaceFor: () => {},
    isHost: true, myId: 'hostpeer', room: null,
  };
  window.__apex.start({
    mode: 'vs', trackId: 'meadow', laps: 3, aiCount: 0,
    playerId: 'rex', playerKartColor: 0xe85a5a, itemsEnabled: false,
    online: {
      grid: [
        { id: 'hostpeer', name: 'Host', charId: 'rex', color: 0xe85a5a },
        { id: 'bot-0', name: 'CPU Zippy', charId: 'zippy', color: 0x9a5ae8, bot: true },
        { id: 'bot-1', name: 'CPU Mimi', charId: 'mimi', color: 0xff8ac8, bot: true },
        { id: 'bot-2', name: 'CPU Bolt', charId: 'bolt', color: 0xe8a23a, bot: true },
      ],
      localId: 'hostpeer', startAt: Date.now() + 2500, isHost: true,
    },
  });
  window.__apex.game().net = mock;   // public field — engine calls it from now on
  window.__v9calls = calls;          // cross-evaluate bridge
});
await page.waitForFunction(() => window.__apex.state().phase === 'racing', null, { timeout: 20000 });
const hostStream = await page.evaluate(() => {
  window.__apex.step(5);             // 5 s of fixed steps → ~100 sends @20 Hz
  const g = window.__apex.game();
  const calls = window.__v9calls;
  const batches = calls.rows;
  return {
    stateCalls: calls.state, botBatches: calls.botBatches,
    rowsPerBatch: batches.length ? batches[0].join(',') : '',
    batchSizesOk: batches.every(r => r.length === 3),
    allBots: batches.every(r => r.every(id => id.startsWith('bot-'))),
    stateHasVyAndT: calls.withVy === calls.state && calls.withT === calls.state && calls.state >= 90 && calls.state <= 110,
    netBots: g.netBotIds.size,
    other: calls.other.slice(0, 3),
  };
});
log('host streams own state at 20 Hz with vy + owner stamp', hostStream.stateHasVyAndT, `state calls/5s=${hostStream.stateCalls}`);
log('host bots: ONE batched message per tick (3 rows)', hostStream.botBatches >= 90 && hostStream.batchSizesOk && hostStream.allBots,
  `batches/5s=${hostStream.botBatches} rows=[${hostStream.rowsPerBatch}] other=${JSON.stringify(hostStream.other)}`);

// ===================== 5. 'bots' WIRE DECODE (guest side) =====================
const wireDecode = await page.evaluate(() => {
  const net = window.__apex.makeNet();
  const got = [];
  net.onPeerState = (id, st) => got.push([id, st.s, st.vy]);
  // TS-private but a plain property at runtime: feed the exact wire shape
  net.guestOnData({ t: 'bots', rows: [
    ['bot-0', { p: [0, 0, 0], ry: 0, s: 12.5, vy: -1.2, d: 0, st: 0, lap: 0, prog: 0.1, f: 0 }],
    ['bot-1', { p: [1, 0, 0], ry: 1, s: 9.5, vy: 0, d: 2, st: 0, lap: 0, prog: 0.2, f: 0 }],
    ['humanX', { p: [2, 0, 0], ry: 2, s: 14, vy: 4.4, d: 0, st: 0, lap: 0, prog: 0.3, f: 0 }],
  ] });
  return got;
});
log("'bots' batch decodes to 3 peer states", wireDecode.length === 3 && wireDecode[0][0] === 'bot-0' && wireDecode[0][1] === 12.5 && wireDecode[0][2] === -1.2,
  JSON.stringify(wireDecode));

// ===================== 6. PUPPET SMOOTHING LAB (the "trabados" fix) =====================
// guest shape; drive bot-0's RemoteDriver with a synthetic 20 Hz owner stream
// delivered with 0-46 ms jitter, 120-200 ms spikes and ONE 250 ms stall.
// 100% SYNCHRONOUS with a synthetic clock (qaRemote.injectAt/stepAt) — the
// v8 lesson says headless GL starves wall-clock timers, so no setTimeout.
// Old v8 code: puppet froze to 0 m/s through the stall then snapped at 40+.
// v9 must keep it moving smoothly the whole time.
await page.evaluate(() => {
  window.__apex.start({
    mode: 'vs', trackId: 'meadow', laps: 3, aiCount: 0,
    playerId: 'rex', playerKartColor: 0xe85a5a, itemsEnabled: false,
    online: {
      grid: [
        { id: 'guestpeer', name: 'Guest', charId: 'rex', color: 0xe85a5a },
        { id: 'bot-0', name: 'CPU Zippy', charId: 'zippy', color: 0x9a5ae8, bot: true },
        { id: 'bot-1', name: 'CPU Mimi', charId: 'mimi', color: 0xff8ac8, bot: true },
        { id: 'humanX', name: 'Rival', charId: 'bolt', color: 0xe8a23a },
      ],
      localId: 'guestpeer', startAt: Date.now() + 60000, isHost: false,
    },
  });
});
await page.waitForTimeout(600);
const lab = await page.evaluate(() => {
  const qa = window.__apex.qaRemote;
  const game = window.__apex.game();
  const kart = game.karts.find(k => k.id === 'bot-0');
  const ids = qa.ids();
  const D = 15;                       // owner speed m/s along +Z
  // two clocks, like two browsers: owner stamps start at 5000, receiver at 0.
  // delivery delay per owner-send i (ms): 0-45 jitter, 120-200 spikes, 1 gap
  const OWNER0 = 5000;
  const delayOf = i => (i === 40 ? 250 : (i % 9 === 4 ? 120 + (i % 5) * 20 : (i * 37) % 46));
  const TOTAL = 8000;                 // ms of simulated receiver time
  const STEP = 1000 / 60;
  let frameIdx = 0;
  const samples = [];
  for (let simT = 0; simT <= TOTAL; simT += STEP) {
    // deliver every frame whose (owner time + network delay) has elapsed
    while (frameIdx * 50 + delayOf(frameIdx) <= simT) {
      qa.injectAt('bot-0', {
        t: OWNER0 + frameIdx * 50,    // OWNER clock stamp — playback timeline
        p: [0, 0, +(D * (frameIdx * 0.05)).toFixed(4)], ry: 0, s: D, vy: 0,
        d: 0, st: 0, lap: 0, prog: 0, f: 0,
      }, frameIdx * 50 + delayOf(frameIdx));
      frameIdx++;
    }
    qa.stepAt(simT);                  // 1 fixed step of every RemoteDriver
    samples.push([simT, kart.pos.z]);
  }
  // metrics: 100 ms window velocities after warm-up (offset+delay settle)
  const warm = samples.filter(s => s[0] > 1500 && s[0] < 7600);
  const vel = [];
  for (let i = 0; i < warm.length; i++) {
    for (let j = i + 1; j < warm.length; j++) {
      if (warm[j][0] - warm[i][0] >= 100) {
        vel.push((warm[j][1] - warm[i][1]) / ((warm[j][0] - warm[i][0]) / 1000));
        break;
      }
    }
  }
  // smoothness = deviation from a constant lag line (NOT from zero lag)
  const dev = warm.map(s => s[1] - D * s[0] / 1000);
  dev.sort((a, b) => a - b);
  const med = dev[Math.floor(dev.length / 2)];
  const inBand = dev.filter(d => Math.abs(d - med) < 0.8).length;
  // freeze check: max gap between consecutive applied samples (moving owner)
  let maxFreeze = 0;
  for (let i = 1; i < warm.length; i++) {
    const dT = (warm[i][0] - warm[i - 1][0]) / 1000;
    const dZ = warm[i][1] - warm[i - 1][1];
    if (dT > 0) maxFreeze = Math.max(maxFreeze, (dT * D - dZ) / D * 1000);
  }
  return {
    ids: ids.join(','),
    nVel: vel.length,
    minV: +Math.min(...vel).toFixed(2), maxV: +Math.max(...vel).toFixed(2),
    maxFreezeMs: +maxFreeze.toFixed(0),
    medianLagMs: +(-med / D * 1000).toFixed(0),
    inBandPct: +(100 * inBand / dev.length).toFixed(1),
    debug: qa.debug()['bot-0'],
  };
});
log('puppet lab: drivers wired (bot-0, bot-1, humanX)', lab.ids === 'bot-0,bot-1,humanX', lab.ids);
log('puppet NEVER freezes through 250 ms stall', lab.minV >= 10.5 && lab.maxFreezeMs <= 80,
  `minV=${lab.minV} m/s maxFreeze=${lab.maxFreezeMs} ms (old code: freeze ~250 ms @ 0 m/s)`);
log('puppet NEVER snaps after the stall', lab.maxV <= 19.5, `maxV=${lab.maxV} m/s (old code: 40+)`);
log('puppet tracks a constant-lag line (±0.8 m)', lab.inBandPct >= 95, `${lab.inBandPct}% in band, lag≈${lab.medianLagMs} ms`);
log('buffer health: owner-timeline offset + adaptive delay',
  lab.debug.delay >= 110 && lab.debug.buf >= 2 && lab.debug.offset <= -4900 && lab.medianLagMs >= 90 && lab.medianLagMs <= 340,
  JSON.stringify(lab.debug));

// ===================== 7. CLEANUP + page errors =====================
await page.evaluate(() => window.__apex.game().quitToMenu());
await page.waitForTimeout(400);
log('no page errors', pageErrors === 0, `${pageErrors}`);

await browser.close();
const fail = results.filter(r => !r.ok);
console.log(`\n===== QA v9: ${results.length - fail.length}/${results.length} OK =====`);
if (fail.length) { console.log('FAILED:', fail.map(f => f.name).join(' | ')); process.exit(1); }
