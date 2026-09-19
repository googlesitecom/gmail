/**
 * APEX KART — Circuit race flow & rules.
 * - countdown with turbo-start timing window
 * - lap validation via 12 ordered sector checkpoints (anti-shortcut-cheat)
 * - live positions by lap+progress meters
 * - respawn to last valid sector on void falls
 * - per-kart lap times, best lap, finish times, results table & GP points
 */

import * as THREE from 'three';
import { GameMode, RaceResultRow } from '../core/Types';
import { RACE } from '../core/Config';
import { KartController } from '../karts/KartController';
import { TrackWorld } from '../tracks/TrackBuilder';
import { Spline } from '../tracks/Spline';

export interface KartRaceState {
  lap: number;                 // completed laps
  sectors: boolean[];          // 12 checkpoint flags
  totalM: number;              // lap*len + s*len (monotonic-ish)
  lastS: number;
  lapStartMs: number;
  lapTimes: number[];
  bestLapMs: number | null;
  finishMs: number | null;
  position: number;
  positionChangedAt: number;
}

export type AnnouncerKind = 'countdown' | 'go' | 'lap' | 'lastlap' | 'position' | 'finish' | 'item' | 'hit' | 'info';

export interface AnnouncerMsg {
  kind: AnnouncerKind;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'hype';
  atMs: number;
}

export class RaceManager {
  readonly karts: KartController[];
  readonly world: TrackWorld;
  readonly mode: GameMode;
  readonly laps: number;
  readonly raceStartAt = performance.now();
  readonly states = new Map<string, KartRaceState>();
  onAnnounce: ((m: AnnouncerMsg) => void) | null = null;
  onLap: ((kart: KartController, lap: number, lapMs: number) => void) | null = null;
  onFinish: ((kart: KartController, pos: number) => void) | null = null;

  goAtMs = 0;                    // absolute time of GO
  phase: 'countdown' | 'racing' | 'finished' = 'countdown';
  private lastTick = -1;        // countdown step announcements
  private finishedCount = 0;
  private raceOverAt = 0;
  private resultsRows: RaceResultRow[] | null = null;

  constructor(karts: KartController[], world: TrackWorld, mode: GameMode, laps: number) {
    this.karts = karts;
    this.world = world;
    this.mode = mode;
    this.laps = laps;
    const now = performance.now();
    this.goAtMs = now + RACE.countdownStepMs * 3 + RACE.goDelayMs;
    for (const k of karts) {
      this.states.set(k.id, {
        lap: 0, sectors: new Array(RACE.checkpoints).fill(false),
        totalM: 0, lastS: k.progressS, lapStartMs: 0,
        lapTimes: [], bestLapMs: null, finishMs: null,
        position: k.rank, positionChangedAt: now,
      });
    }
  }

  /** Player turbo-start evaluation at GO. */
  evaluateTurboStart(kart: KartController, throttleHeldMs: number): void {
    // held roughly the last ~1 step (not from way early, not late release)
    const perfect = throttleHeldMs > 350 && throttleHeldMs < RACE.countdownStepMs * 2 + 320;
    if (perfect) {
      kart.applyBoost(1.35, 1.5);
      this.onAnnounce?.({ kind: 'go', text: '¡SALIDA TURBO!', tone: 'hype', atMs: performance.now() });
    } else if (throttleHeldMs > RACE.countdownStepMs * 2 + 700) {
      // way too early: wheelspin
      kart.spinT = RACE.earlyPenalty;
      kart.speed = 0;
      this.onAnnounce?.({ kind: 'go', text: '¡Demasiado pronto!', tone: 'bad', atMs: performance.now() });
    }
  }

  /** Main rules tick — call every physics frame. */
  update(dt: number, nowMs: number): void {
    // countdown phase
    if (this.phase === 'countdown') {
      const remain = this.goAtMs - nowMs;
      const step = Math.ceil(remain / RACE.countdownStepMs);
      if (step !== this.lastTick && step >= 1 && step <= 3) {
        this.lastTick = step;
        this.onAnnounce?.({ kind: 'countdown', text: `${step}`, tone: 'info', atMs: nowMs });
      }
      if (remain <= 0) {
        this.phase = 'racing';
        for (const st of this.states.values()) st.lapStartMs = nowMs;
        this.onAnnounce?.({ kind: 'go', text: '¡YA!', tone: 'hype', atMs: nowMs });
      }
      return;
    }

    const len = this.world.spline.length;
    const racing = this.phase === 'racing';

    for (const k of this.karts) {
      const st = this.states.get(k.id)!;
      if (k.finished) continue;

      // ---- sector & lap validation ------------------------------------
      const s = k.progressS;
      const sector = Math.floor(Spline.wrapS(s) * RACE.checkpoints) % RACE.checkpoints;
      k.sector = sector;
      const prevS = st.lastS;
      const delta = Spline.wrapS(s - prevS);
      if (delta < 0.5) { // moving forward (small wrap-aware step)
        // mark sectors passed between prevS and s
        let idx = Math.floor(Spline.wrapS(prevS) * RACE.checkpoints) % RACE.checkpoints;
        for (let guard = 0; guard < RACE.checkpoints + 2; guard++) {
          st.sectors[idx] = true;
          if (idx === sector) break;
          idx = (idx + 1) % RACE.checkpoints;
        }
      }
      st.lastS = s;

      // lap crossing: forward wrap over s=0 (prevS high → s low, small delta)
      // with ALL sectors validated (anti-shortcut/anti-reverse cheat).
      const crossedForward = prevS > 0.8 && s < 0.2 && delta < 0.5;
      if (crossedForward) {
        if (st.sectors.every(Boolean)) {
          st.lap += 1;
          st.sectors.fill(false);
          const lapMs = nowMs - st.lapStartMs;
          st.lapStartMs = nowMs;
          st.lapTimes.push(lapMs);
          if (st.bestLapMs == null || lapMs < st.bestLapMs) st.bestLapMs = lapMs;
          this.onLap?.(k, st.lap, lapMs);
          if (st.lap === this.laps - 1) {
            this.onAnnounce?.({ kind: 'lastlap', text: '¡ÚLTIMA VUELTA!', tone: 'hype', atMs: nowMs });
          }
          if (st.lap >= this.laps) {
            // FINISHED
            k.finished = true;
            this.finishedCount++;
            st.finishMs = nowMs - this.goAtMs;
            this.onFinish?.(k, this.finishedCount);
            if (this.finishedCount === 1) {
              this.raceOverAt = nowMs + 20000; // hard cap after winner
              this.onAnnounce?.({
                kind: 'finish',
                text: k.isPlayer ? '¡META! ¡Ganaste!' : `${k.stats.displayName} termina primero`,
                tone: k.isPlayer ? 'hype' : 'info', atMs: nowMs,
              });
            }
          } else {
            this.onAnnounce?.({
              kind: 'lap',
              text: k.isPlayer ? `Vuelta ${st.lap + 1}/${this.laps}` : '',
              tone: 'info', atMs: nowMs,
            });
          }
        }
      }

      // ---- progress bookkeeping ------------------------------------------
      st.totalM = st.lap * len + Spline.wrapS(s) * len;

      // ---- respawn on fall -------------------------------------------------
      // Respawn at the nearest SOLID sample to the kart's own progress —
      // nudged a few meters forward so they never re-fall — NOT at the next
      // sector midpoint (that handed out up to ~95 m of free track every
      // fall and broke lap pacing on gap-heavy circuits).
      if (k.requestRespawn && racing) {
        const sp = this.world.spline;
        let sAnchor = Spline.wrapS(s);
        // If a gap run starts just ahead, we fell INTO it — respawn PAST
        // the landing. Anchoring at the lip would retry the jump from a
        // standstill (4 m run-up), which re-falls forever: the classic
        // respawn loop that froze whole grids on gap circuits.
        {
          const scan = 12 / sp.length;
          const step = 2 / sp.length;
          for (let d = 0; d <= scan; d += step) {
            if (sp.sampleAt(Spline.wrapS(sAnchor + d)).jump) {
              let t = sAnchor + d;
              for (let guard = 0; guard < 80 && sp.sampleAt(Spline.wrapS(t)).jump; guard++) t += step;
              sAnchor = Spline.wrapS(t);
              break;
            }
          }
        }
        const solidAt = (t: number): boolean =>
          !this.world.spline.sampleAt(Spline.wrapS(t)).jump;
        if (!solidAt(sAnchor)) {
          // walk forward (up to ~40 m) to the next solid sample
          const step = 4 / this.world.spline.length;
          for (let d = step; d < 0.04; d += step) {
            if (solidAt(sAnchor + d)) { sAnchor = Spline.wrapS(sAnchor + d); break; }
          }
        }
        const sm = this.world.spline.sampleAt(sAnchor);
        k.respawnAt(this.world.spline.roadPoint(sAnchor, 0), Math.atan2(sm.tangent.x, sm.tangent.z));
        st.lastS = sAnchor;
      }
    }

    // ---- live positions --------------------------------------------------------
    const order = [...this.karts].sort((a, b) => {
      const sa = this.states.get(a.id)!;
      const sb = this.states.get(b.id)!;
      if (sa.finishMs != null && sb.finishMs != null) return sa.finishMs - sb.finishMs;
      if (sa.finishMs != null) return -1;
      if (sb.finishMs != null) return 1;
      return sb.totalM - sa.totalM;
    });
    order.forEach((k, i) => {
      const st = this.states.get(k.id)!;
      const prev = k.rank;
      k.rank = i + 1;
      st.position = i + 1;
      if (racing && prev !== k.rank && k.isPlayer && nowMs - st.positionChangedAt > 900) {
        st.positionChangedAt = nowMs;
        this.onAnnounce?.({
          kind: 'position', tone: k.rank < prev ? 'good' : 'bad',
          text: k.rank < prev ? `¡P${k.rank}!` : `P${k.rank}`, atMs: nowMs,
        });
      }
    });

    // ---- end conditions -----------------------------------------------------------
    if (racing && this.finishedCount > 0) {
      const playerFinished = this.karts.some(k => k.isPlayer && k.finished);
      const allDone = this.finishedCount >= this.karts.filter(k => !k.battleKo).length;
      if (allDone || nowMs >= this.raceOverAt || (playerFinished && this.mode === 'timetrial')) {
        this.phase = 'finished';
        this.resultsRows = this.buildResults();
      } else if (playerFinished && nowMs - this.raceOverAt > -19500) {
        // player finished, others still racing — allow spectating
        // (Game switches to results after finishSpectateMs)
      }
    }
  }

  private buildResults(): RaceResultRow[] {
    const order = [...this.karts].sort((a, b) => {
      const sa = this.states.get(a.id)!;
      const sb = this.states.get(b.id)!;
      if (sa.finishMs != null && sb.finishMs != null) return sa.finishMs - sb.finishMs;
      if (sa.finishMs != null) return -1;
      if (sb.finishMs != null) return 1;
      return sb.totalM - sa.totalM;
    });
    return order.map((k, i) => ({
      kartId: k.id,
      characterId: k.stats.id,
      isPlayer: k.isPlayer,
      position: i + 1,
      points: RACE.gpPoints[i] ?? 1,
      totalPoints: 0,
      finishTimeMs: this.states.get(k.id)!.finishMs,
      bestLapMs: this.states.get(k.id)!.bestLapMs,
    }));
  }

  getResults(): RaceResultRow[] {
    if (!this.resultsRows) this.resultsRows = this.buildResults();
    return this.resultsRows;
  }

  /** Grid placement at race start: front rows by previous GP standings. */
  static gridOrder(karts: KartController[], prevPoints: Map<string, number> | null): KartController[] {
    if (!prevPoints) return karts;
    return [...karts].sort((a, b) => (prevPoints.get(b.id) ?? 0) - (prevPoints.get(a.id) ?? 0));
  }
}
