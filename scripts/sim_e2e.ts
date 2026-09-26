/**
 * APEX KART — Headless AI end-to-end simulation.
 *
 * Runs the REAL engine (Spline + TrackWorld + KartController + AIDriver,
 * zero rendering) over every circuit: 11 bots + 1 idle "player" for a fixed
 * sim window. Verifies, per track:
 *   - every kart completes >= N laps (nobody bricked)
 *   - no kart spends > STALL_LIMIT s below 2 m progress (edge-stuck detector)
 *   - lap times are sane (no infinite-slow laps)
 *
 * Usage: bun scripts/sim_e2e.ts [seconds] [lapsTarget]
 */
import * as THREE from 'three';
import { TRACKS } from '../src/game/tracks/TrackCatalog';
import { TrackWorld } from '../src/game/tracks/TrackBuilder';
import { KartController } from '../src/game/karts/KartController';
import { AIDriver } from '../src/game/ai/AIDriver';
import { CHARACTERS } from '../src/game/karts/KartStats';
import { SessionConfig } from '../src/game/core/Types';

// ---- headless DOM shim: Textures.ts builds canvas textures; nothing renders,
// so a no-op 2d context is enough for the simulation to run the real code.
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
  createElement: (): unknown => ({
    width: 0, height: 0, style: {},
    getContext: (): unknown => fakeCtx,
    addEventListener: (): void => undefined,
  }),
  createElementNS: (): unknown => ({ style: {} }),
  addEventListener: (): void => undefined,
  body: { appendChild: (): void => undefined },
};
(globalThis as unknown as Record<string, unknown>).window = globalThis;
(globalThis as unknown as Record<string, unknown>).localStorage = {
  getItem: (): null => null, setItem: (): void => undefined,
};
(globalThis as unknown as Record<string, unknown>).navigator = { userAgent: 'bun-sim' };

const SIM_SECONDS = Number(process.argv[2] ?? 300);
const LAPS_TARGET = Number(process.argv[3] ?? 2);

interface SimKart {
  k: KartController;
  ai: AIDriver | null;
  lastTotal: number;      // meters of unwrapped progress
  laps: number;
  totalM: number;
  stallT: number;         // seconds with < 2 m progress while not finished
  worstStall: number;
  minSpeedSeen: number;
  stallPos?: [number, number, number];
  heat: Float32Array;     // seconds spent per 1/32 track sector
}

function run(): void {
  let failures = 0;
  const cfg: SessionConfig = {
    mode: 'vs', difficulty: 100, mirror: false,
    aiCount: 11, itemsEnabled: true, aiRubberBand: 0.5,
    playerId: 'rex', playerKartColor: 0xe85a5a,
  };

  for (const [id, def] of Object.entries(TRACKS)) {
    const world = new TrackWorld(def, false, 0.1, 0); // low decor, no crowd: pure sim
    const sp = world.spline;
    const line = world.racingLine;
    const chars = Object.values(CHARACTERS);

    const karts: SimKart[] = [];
    const falls: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      const isPlayer = false; // all 12 AI — the real race
      const stats = chars[i % chars.length];
      const k = new KartController(stats, isPlayer, isPlayer ? 'player' : `ai${i}`);
      k.ccScale = 1.0;
      // spawn on the grid like the real game
      const row = Math.floor(i / 2);
      const col = i % 2 === 0 ? -1 : 1;
      const s = ((sp.length - (7 + row * 3.4)) / sp.length) % 1;
      const sm = sp.sampleAt(s);
      const p = sp.roadPoint(s, col * 2.7);
      k.pos.copy(p);
      k.yaw = Math.atan2(sm.tangent.x, sm.tangent.z);
      karts.push({
        k, ai: isPlayer ? null : new AIDriver(k, ['aggressive', 'defensive', 'reckless'][i % 3] as never, i),
        lastTotal: 0, laps: 0, totalM: 0, stallT: 0, worstStall: 0, minSpeedSeen: 99, heat: new Float32Array(32),
      });
    }

    const dt = 1 / 60;
    const steps = Math.round(SIM_SECONDS / dt);
    const boxes = world.itemBoxes.filter(b => b.active).map(b => b.pos.clone());
    const coins = world.coins.map(c => ({ s: c.s, lat: c.lat }));
    let t = 0;

    for (let step = 0; step < steps; step++) {
      t += dt;
      // countdown 3s then GO
      const goElapsed = t - 3;
      const racing = goElapsed > 0;

      for (const sk of karts) {
        let controls;
        if (sk.ai) {
          controls = sk.ai.update(dt, {
            spline: sp, shortcuts: world.shortcuts, line, hazards: world.hazards,
            boxes, karts: karts.map(x => x.k),
            playerTotalProgress: karts[0].totalM, aiTotalProgress: sk.totalM,
            rubberBand: cfg.aiRubberBand, unfair: false, difficulty: 100,
            itemsEnabled: true, trackSpeedScale: def.aiSpeedScale,
            time: t, goElapsed,
            coins, traps: [],
          });
        } else {
          controls = { throttle: 0, brake: 0, steer: 0, drift: false, driftRelease: false, fireItem: false, itemHeld: false, lookBack: false };
        }
        sk.k.step(dt, world, karts.map(x => x.k), controls, racing);
      }

      // progress + stall bookkeeping (after GO)
      if (goElapsed > 0) {
        for (const sk of karts) {
          let d = sk.k.progressS * sp.length - (sk.lastTotal % sp.length === 0 && sk.lastTotal === 0 ? sk.k.progressS * sp.length : sk.lastTotal % sp.length);
          // simpler: unwrap via total progress
          d = 0;
          void d;
          const cur = sk.k.progressS * sp.length;
          const prevMod = ((sk.lastTotal % sp.length) + sp.length) % sp.length;
          let delta = cur - prevMod;
          if (delta < -sp.length * 0.5) delta += sp.length;
          else if (delta > sp.length * 0.5) delta -= sp.length;
          sk.totalM += delta;
          if (Math.floor(sk.totalM / sp.length) > sk.laps) sk.laps = Math.floor(sk.totalM / sp.length);
          sk.lastTotal = sk.totalM;

          if (delta * 60 < 2) {  // < 2 m in this step-window
            sk.stallT += dt;
            if (sk.stallT > sk.worstStall) {
              sk.worstStall = sk.stallT;
              sk.stallPos = [Math.round(sk.k.pos.x), Math.round(sk.k.pos.y), Math.round(sk.k.pos.z)];
            }
          } else {
            sk.stallT = 0;
          }
          sk.minSpeedSeen = Math.min(sk.minSpeedSeen, Math.abs(sk.k.speed));
          sk.heat[Math.min(31, Math.floor(sk.k.progressS * 32))] += dt;
        }
      }
      // respawn handling (mirrors RaceManager: nearest solid anchor)
      for (const sk of karts) {
        if (sk.k.requestRespawn) {
          const fkey = `${Math.round(sk.k.pos.x / 20) * 20},${Math.round(sk.k.pos.z / 20) * 20}`;
          falls[fkey] = (falls[fkey] ?? 0) + 1;
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
      // trajectory trace for the first AI kart (debug: TRACE=glacier)
      if (process.env.TRACE === id && step % 30 === 0 && karts[1]) {
        const kk = karts[1].k;
        console.error(`t=${t.toFixed(1)} pos=(${kk.pos.x.toFixed(0)},${kk.pos.y.toFixed(1)},${kk.pos.z.toFixed(0)}) v=${kk.speed.toFixed(1)} s=${(kk.progressS * 100).toFixed(1)}% ${kk.ginfo ? `lat=${kk.ginfo.lateral.toFixed(1)} onRoad=${kk.ginfo.onRoad} hasG=${kk.ginfo.hasGround} jump=${kk.ginfo.onJump}` : ''} resp=${kk.requestRespawn}`);
      }
      world.update(t, dt);
    }

    // report
    const lapM = sp.length;
    const lapTimes = karts.map(sk => sk.laps >= 1 ? (SIM_SECONDS - 3) / sk.laps : Infinity);
    const minLaps = Math.min(...karts.map(sk => sk.laps));
    const worstStall = Math.max(...karts.map(sk => sk.worstStall));
    const stuck = karts.filter(sk => sk.worstStall > 20);
    const ok = minLaps >= LAPS_TARGET && stuck.length === 0;
    if (!ok) failures++;
    // median heat across karts: where does the FIELD lose time?
    const heat = new Float32Array(32);
    for (const sk of karts) for (let i = 0; i < 32; i++) heat[i] += sk.heat[i] / 12;
    const hot = [...heat.keys()].sort((a, b) => heat[b] - heat[a]).slice(0, 4)
      .map(i => `s${(i / 32).toFixed(2)}:${heat[i].toFixed(0)}s`).join(' ');
    console.log(
      `${id.padEnd(8)} L=${lapM.toFixed(0)}m  laps(min/med/max)=${minLaps}/${karts.map(s => s.laps).sort((a, b) => a - b)[6]}/${Math.max(...karts.map(s => s.laps))}` +
      `  lap≈${(lapTimes.sort((a, b) => a - b)[6] ?? 0).toFixed(0)}s  worstStall=${worstStall.toFixed(1)}s  heat[${hot}]` +
      `${stuck.length ? '  ⚠ STALL>20s: ' + stuck.map(s => `${s.k.id}@${JSON.stringify(s.stallPos)}→${s.laps}L`).join(' ') : ''}` +
      `${Object.keys(falls).length ? '  falls:' + Object.entries(falls).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k2, v]) => `${k2}×${v}`).join(' ') : ''}${ok ? '  ✓' : '  ⚠ FAIL'}`,
    );
  }
  console.log(failures === 0 ? `\nSIM OK — all tracks raceable by AI (${SIM_SECONDS}s window, ${LAPS_TARGET}+ laps)` : `\n${failures} track(s) FAILED`);
}

run();
