/**
 * APEX KART — Engine → React bridge.
 * A tiny external store (useSyncExternalStore-compatible). The engine
 * publishes HUD/UI snapshots at controlled rates; React never touches
 * the render loop. High-frequency elements (minimap, speedometer) are
 * drawn by the engine directly onto dedicated canvases.
 */

import { ItemId, RacePhase, RaceResultRow } from '../core/Types';

export type UIScreen = 'menu' | 'character' | 'kart' | 'mode' | 'cup' | 'track' | 'options' | 'online' | 'race';

export interface AnnouncerBanner {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'hype';
}

export interface GPProgress {
  cupId: string;
  cupName: string;
  trackIndex: number;
  trackCount: number;
  trackName: string;
}

export interface UIState {
  screen: UIScreen;
  phase: RacePhase;
  paused: boolean;
  countdown: number | null;      // 3,2,1 or 0 = GO flash
  position: number;
  totalKarts: number;
  lap: number;                    // completed laps
  laps: number;
  itemSlot: ItemId | null;
  itemCharges: number;
  itemSlot2: ItemId | null;     // golden double box spare item
  itemCharges2: number;
  rouletteActive: boolean;
  speedKmh: number;
  boostActive: boolean;
  driftLevel: number;
  coins: number;                    // MK-style coin counter (0..10)
  trickActive: boolean;             // stunt in progress (HUD flair)
  announcer: AnnouncerBanner[];
  results: RaceResultRow[] | null;
  gp: GPProgress | null;
  battle: { hp: number; timeLeft: number; redAlive: number; blueAlive: number; playerTeamKo: boolean } | null;
  timeTrial: { lapMs: number; bestLapMs: number | null; bestTotalMs: number | null; totalMs: number } | null;
  needsContinue: boolean;         // results screen awaiting user action
  version: number;
}

const INITIAL: UIState = {
  screen: 'menu', phase: 'loading', paused: false, countdown: null,
  position: 1, totalKarts: 12, lap: 0, laps: 3,
  itemSlot: null, itemCharges: 0, itemSlot2: null, itemCharges2: 0, rouletteActive: false,
  speedKmh: 0, boostActive: false, driftLevel: 0, coins: 0, trickActive: false,
  announcer: [], results: null, gp: null, battle: null, timeTrial: null,
  needsContinue: false, version: 0,
};

export class GameBridge {
  private state: UIState = { ...INITIAL };
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): UIState => this.state;

  publish(patch: Partial<UIState>): void {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 };
    for (const l of this.listeners) l();
  }

  pushAnnouncer(text: string, tone: AnnouncerBanner['tone']): void {
    if (!text) return;
    const banner: AnnouncerBanner = { id: Date.now() + Math.random(), text, tone };
    const announcer = [...this.state.announcer, banner].slice(-3);
    this.publish({ announcer });
    // auto-expire after 2.2s
    setTimeout(() => {
      this.publish({ announcer: this.state.announcer.filter(a => a.id !== banner.id) });
    }, 2200);
  }

  resetToMenu(): void {
    this.publish({ ...INITIAL, version: this.state.version + 1 });
  }
}
