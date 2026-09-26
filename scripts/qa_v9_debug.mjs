// APEX KART v9 — puppet lab DEBUG: same synthetic stream as qa_v9 but dumps
// the raw sample series to locate the residual lurch (minV/maxV windows).
import { chromium } from 'playwright';

const BASE = 'http://localhost:4173/gmail/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

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
const out = await page.evaluate(() => {
  const qa = window.__apex.qaRemote;
  const game = window.__apex.game();
  const kart = game.karts.find(k => k.id === 'bot-0');
  const D = 15;
  const OWNER0 = 5000;
  const delayOf = i => (i === 40 ? 250 : (i % 9 === 4 ? 120 + (i % 5) * 20 : (i * 37) % 46));
  const TOTAL = 8000, STEP = 1000 / 60;
  let frameIdx = 0;
  const samples = [];
  const dryAt = [];
  for (let simT = 0; simT <= TOTAL; simT += STEP) {
    while (frameIdx * 50 + delayOf(frameIdx) <= simT) {
      qa.injectAt('bot-0', {
        t: OWNER0 + frameIdx * 50,
        p: [0, 0, +(D * (frameIdx * 0.05)).toFixed(4)], ry: 0, s: D, vy: 0,
        d: 0, st: 0, lap: 0, prog: 0, f: 0,
      }, frameIdx * 50 + delayOf(frameIdx));
      frameIdx++;
    }
    qa.stepAt(simT);
    samples.push([+simT.toFixed(1), +kart.pos.z.toFixed(3)]);
    dryAt.push([+simT.toFixed(1), frameIdx]);   // newest owner-time delivered
  }
  return { samples, debug: qa.debug()['bot-0'] };
});

// analysis in node: find worst 100ms windows
const s = out.samples;
const vel = [];
for (let i = 0; i < s.length; i++) {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j][0] - s[i][0] >= 100) { vel.push([s[i][0], (s[j][1] - s[i][1]) / ((s[j][0] - s[i][0]) / 1000)]); break; }
  }
}
vel.sort((a, b) => a[1] - b[1]);
console.log('=== SLOWEST windows ===');
for (const v of vel.slice(0, 6)) console.log(`t=${v[0].toFixed(0)}ms v=${v[1].toFixed(2)} m/s`);
console.log('=== FASTEST windows ===');
for (const v of vel.slice(-6)) console.log(`t=${v[0].toFixed(0)}ms v=${v[1].toFixed(2)} m/s`);
const worstT = vel[0][0];
console.log('=== samples around slowest window ===');
for (const [t, z] of s) if (t >= worstT - 220 && t <= worstT + 260) {
  console.log(`t=${t.toFixed(1)} z=${z.toFixed(3)} idealDev=${(z - D * t / 1000).toFixed(3)}`);
}
console.log('debug:', JSON.stringify(out.debug));
await browser.close();
