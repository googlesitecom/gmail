/**
 * APEX KART — localStorage persistence: unlocks, records, ghosts,
 * options and control bindings. Singleton with lazy load.
 */

import { GhostData } from '../race/Ghost';
import { Binding } from '../core/InputManager';
import { DEFAULT_BINDINGS } from '../core/InputManager';
import { QualityLevel } from '../core/Types';

export interface OptionsState {
  quality: QualityLevel;
  rubberBand: number;      // 0..1 default for VS/GP
  showSpeedometer: boolean;
  musicVolume: number;     // 0..1 background music
  sfxVolume: number;       // 0..1 sound effects
}

interface SaveShape {
  v: number;
  unlockedChars: Record<string, boolean>;
  cupsWon: Record<string, boolean>;        // cupId -> won at least once
  cupsWon150: Record<string, boolean>;     // cupId -> won at 150cc
  mirrorUnlocked: boolean;
  bestLaps: Record<string, number>;        // trackId -> ms
  bestRaces: Record<string, { time: number; characterId: string }>;
  ghosts: Record<string, GhostData>;
  options: OptionsState;
  bindings: Binding[];
}

const KEY = 'apexkart_save_v1';

class SaveDataImpl {
  private data: SaveShape;

  constructor() {
    this.data = SaveDataImpl.load();
  }

  private static load(): SaveShape {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as SaveShape;
        if (parsed.v === 1) {
          // normalize: a partially-written/older save must never crash the app
          parsed.unlockedChars ??= {};
          parsed.cupsWon ??= {};
          parsed.cupsWon150 ??= {};
          parsed.mirrorUnlocked ??= false;
          parsed.bestLaps ??= {};
          parsed.bestRaces ??= {};
          parsed.ghosts ??= {};
          const defaults: OptionsState = { quality: 'medium', rubberBand: 0.5, showSpeedometer: true, musicVolume: 0.55, sfxVolume: 0.8 };
          parsed.options = { ...defaults, ...(parsed.options ?? {}) };
          parsed.bindings = parsed.bindings?.length ? parsed.bindings : DEFAULT_BINDINGS.map(b => ({ ...b }));
          return parsed;
        }
      }
    } catch { /* corrupted save — start fresh */ }
    return {
      v: 1,
      unlockedChars: {}, cupsWon: {}, cupsWon150: {},
      mirrorUnlocked: false, bestLaps: {}, bestRaces: {}, ghosts: {},
      options: { quality: 'medium', rubberBand: 0.5, showSpeedometer: true, musicVolume: 0.55, sfxVolume: 0.8 },
      bindings: DEFAULT_BINDINGS.map(b => ({ ...b })),
    };
  }

  private flush(): void {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch { /* quota — ignore */ }
  }

  // -------- characters
  isCharUnlocked(id: string, defaults: Record<string, boolean>): boolean {
    if (this.data.unlockedChars[id] === undefined) return defaults[id] ?? true;
    return this.data.unlockedChars[id];
  }
  unlockChar(id: string): void { this.data.unlockedChars[id] = true; this.flush(); }

  // -------- cups
  isCupUnlocked(cupId: string, chainDefault: boolean): boolean {
    if (cupId === 'copa_verde') return true;
    return !!this.data.cupsWon[chainDefault ? cupId : cupId] || false;
  }
  cupChainReady(cupId: string): boolean {
    // unlocked if the previous cup in the chain was won (any cc)
    return !!this.data.cupsWon[cupId];
  }
  winCup(cupId: string, difficulty: number): void {
    this.data.cupsWon[cupId] = true;
    if (difficulty >= 150) this.data.cupsWon150[cupId] = true;
    this.flush();
  }
  get mirrorUnlocked(): boolean { return this.data.mirrorUnlocked; }

  // -------- records
  getBestLap(trackId: string): number | null { return this.data.bestLaps[trackId] ?? null; }
  recordLap(trackId: string, ms: number): boolean {
    if (this.data.bestLaps[trackId] == null || ms < this.data.bestLaps[trackId]) {
      this.data.bestLaps[trackId] = ms;
      this.flush();
      return true;
    }
    return false;
  }
  getBestRace(trackId: string): { time: number; characterId: string } | null {
    return this.data.bestRaces[trackId] ?? null;
  }
  recordRace(trackId: string, timeMs: number, characterId: string, ghost: GhostData | null): boolean {
    const prev = this.data.bestRaces[trackId];
    const better = !prev || timeMs < prev.time;
    if (better) {
      this.data.bestRaces[trackId] = { time: timeMs, characterId };
      if (ghost) this.data.ghosts[trackId] = ghost;
      this.flush();
    }
    return better;
  }
  getGhost(trackId: string): GhostData | null { return this.data.ghosts[trackId] ?? null; }

  // -------- options
  get options(): OptionsState { return { ...this.data.options }; }
  setOptions(o: OptionsState): void { this.data.options = { ...o }; this.flush(); }

  get bindings(): Binding[] { return this.data.bindings.map(b => ({ ...b })); }
  setBindingsList(b: Binding[]): void { this.data.bindings = b.map(x => ({ ...x })); this.flush(); }

  setMirror(v: boolean): void { this.data.mirrorUnlocked = v; this.flush(); }
}

export const SaveData = new SaveDataImpl();
