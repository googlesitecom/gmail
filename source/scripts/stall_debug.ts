/**
 * APEX KART — focused stall debugger (snow / ai2).
 * Reproduces sim_e2e for one track and dumps the target kart's live state
 * every 0.5 s while its progress stalls.
 */
import * as THREE from 'three';
import { TRACKS } from '../src/game/tracks/TrackCatalog';
import { TrackWorld } from '../src/game/tracks/TrackBuilder';
import { KartController } from '../src/game/karts/KartController';
import { AIDriver } from '../src/game/ai/AIDriver';
import { CHARACTERS } from '../src/game/karts/KartStats';

const fakeCtx: Record<string, unknown> = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'canvas') return { width: 64, height: 64 };
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
      return (): { addColorStop: () => void } => ({ addColorStop: () => {} });
    }
    if (prop === 'measureText') return (): { width: number } => ({ width: 0 });
    if (prop === 'getImageData') return (): unknown => ({ data: new Uint8ClampedArray(4) });
    return (): void => undefined;
  },
  set: () => true,
});
(globalThis as unknown as Record<string, unknown>).document = {
  createElement: (): unknown => ({ width: 0, height: 0, style: {}, getContext: (): unknown => fakeCtx, addEventListener: (): void => undefined }),
  createElementNS: (): unknown => ({ style: {} }),
  addEventListener: (): void => undefined,
  body: { appendChild: (): void => undefined },
};
(globalThis as unknown as Record<string, unknown>).window = globalThis;
(globalThis as unknown as Record<string, unknown>).localStorage = { getItem: (): null => null, setItem: (): void => undefined };
(globalThis as unknown as Record<string, unknown>).navigator = { userAgent: 'bun-sim' };

const SIM_SECONDS = 240;
const trackId = process.argv[2] ?? 'snow';
const watchIdx = Number(process.argv[3] ?? 2);

const def = TRACKS[trackId];
const world = new TrackWorld(def, false, 0.1, 0);
const sp = world.spline;
const line = world.racingLine;
const chars = Object.values(CHARACTERS);

const karts: { k: KartController; ai: AIDriver; lastTotal?: number; total?: number }[] = [];
for (let i = 0; i < 12; i++) {
  const stats = chars[i % chars.length];
  const k = new KartController(stats, false, `ai${i}`);
  k.ccScale = 1.0;
  const row = Math.floor(i / 2);
  const col = i % 2 === 0 ? -1 : 1;
  const s = ((sp.length - (7 + row * 3.4)) / sp.length) % 1;
  const sm = sp.sampleAt(s);
  const p = sp.roadPoint(s, col * 2.7);
  k.pos.copy(p);
  k.yaw = Math.atan2(sm.tangent.x, sm.tangent.z);
  karts.push({ k, ai: new AIDriver(k, ['aggressive', 'defensive', 'reckless'][i % 3] as never, i), lastTotal: 0, total: 0 });
}
// seed totals with spawn progress so the unwrap math starts clean
for (const sk of karts) sk.lastTotal = sk.k.progressS * sp.length;

const dt = 1 / 60;
const steps = Math.round(SIM_SECONDS / dt);
const boxes = world.itemBoxes.filter(b => b.active).map(b => b.pos.clone());
const coins = world.coins.map(c => ({ s: c.s, lat: c.lat }));
let t = 0;

// stall bookkeeping for the watched kart
let lastTotal = 0, stallT = 0, logAt = 0;

for (let step = 0; step < steps; step++) {
  t += dt;
  const goElapsed = t - 3;
  const racing = goElapsed > 0;

  const totals = karts.map(x => x.k.progressS * sp.length);
  // unwrap: use cumulative progress like the real sim
  for (let i = 0; i < karts.length; i++) {
    const sk = karts[i];
    const cur = sk.k.progressS * sp.length;
    const prevMod = ((sk.lastTotal ?? 0) + i * 0) % sp.length;
    void prevMod; void cur; void totals;
  }

  for (const { k, ai } of karts) {
    const controls = ai.update(dt, {
      spline: sp, shortcuts: world.shortcuts, line, hazards: world.hazards,
      boxes, karts: karts.map(x => x.k),
      playerTotalProgress: karts[0].total ?? 0, aiTotalProgress: 0,
      rubberBand: 0.5, unfair: false, difficulty: 100,
      itemsEnabled: true, trackSpeedScale: def.aiSpeedScale,
      time: t, goElapsed, coins, traps: [],
    });
    k.step(dt, world, karts.map(x => x.k), controls, racing);
  }

  // mirror sim_e2e bookkeeping (per-kart cumulative meters)
  if (goElapsed > 0) {
    for (const sk of karts) {
      const cur = sk.k.progressS * sp.length;
      const prevMod = ((sk.lastTotal! % sp.length) + sp.length) % sp.length;
      let delta = cur - prevMod;
      if (delta < -sp.length * 0.5) delta += sp.length;
      else if (delta > sp.length * 0.5) delta -= sp.length;
      sk.lastTotal = (sk.lastTotal ?? 0) + delta;
      sk.total = (sk.total ?? 0) + delta;
    }
    // respawn handling (mirrors sim_e2e)
    for (const sk of karts) {
      if (sk.k.requestRespawn) {
        let best = world.respawnPoints[0];
        let bestD = Infinity;
        for (const rp of world.respawnPoints) {
          const d = rp.distanceToSquared(sk.k.pos);
          if (d < bestD) { bestD = d; best = rp; }
        }
        const gi = sk.k.ginfo;
        const sm = sp.sampleAt(gi ? gi.s : 0);
        sk.k.respawnAt(best, Math.atan2(sm.tangent.x, sm.tangent.z));
      }
    }
    const w = karts[watchIdx];
    const cur = w.k.progressS * sp.length;
    const prevMod = ((w.lastTotal! % sp.length) + sp.length) % sp.length;
    let delta = cur - prevMod;
    if (delta < -sp.length * 0.5) delta += sp.length;
    else if (delta > sp.length * 0.5) delta -= sp.length;
    if (delta * 60 < 2) stallT += dt; else stallT = 0;
    if (stallT > 3 && t > logAt) {
      logAt = t + 0.5;
      const gi = w.k.ginfo!;
      const dbg = w.ai.dbg as Record<string, number>;
      console.log(
        `t=${t.toFixed(1)} stall=${stallT.toFixed(1)} pos=[${w.k.pos.x.toFixed(0)},${w.k.pos.y.toFixed(1)},${w.k.pos.z.toFixed(0)}]` +
        ` v=${w.k.speed.toFixed(1)} yaw=${w.k.yaw.toFixed(2)} s=${(w.k.progressS).toFixed(3)}` +
        ` onRoad=${gi.onRoad} lat=${gi.lateral.toFixed(1)} hw=${sp.samples[((gi.mainIdx % sp.samples.length) + sp.samples.length) % sp.samples.length]?.halfWidth}` +
        ` grip=${w.k.zoneGripNow.toFixed(2)} grind=${w.k.railGrindT.toFixed(1)}` +
        ` tgt=${dbg.targetSpeed} err=${dbg.err} thr=${dbg.throttle} brk=${dbg.brake}` +
        ` spin=${w.k.spinT.toFixed(1)} resp=${w.k.requestRespawn}`
      );
    }
  }
  world.update(t, dt);
}
console.log('done; watched s=', (karts[watchIdx].k.progressS).toFixed(3), 'totalM=', (karts[watchIdx].total ?? 0).toFixed(0));
