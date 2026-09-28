/**
 * APEX KART — Online play contracts (client side).
 * The server (mini-services/race-service) mirrors these shapes; keep both in
 * sync when editing. All coords are world-space meters, angles in radians.
 */

import { ItemId } from '../core/Types';

export interface NetPlayerInfo {
  id: string;            // socket id (stable for the connection)
  name: string;
  charId: string;
  color: number;         // kart chassis hex
  /** CPU filler driven by the host (guests see it as a puppet) */
  bot?: boolean;
}

export interface NetRoomConfig {
  trackId: string;          // track id, or 'random' (resolved by the host at start)
  laps: number;
  cc: 50 | 100 | 150 | 200;
  items: boolean;
  mirror: boolean;
  /** CPU fill: -1 = auto (grid of 12), else exact bot count 0..11 */
  bots?: number;
  /** CPU skill tier for the host's simulated fillers */
  botLevel?: 'easy' | 'normal' | 'hard';
  /** frantic: every box rolls a DOUBLE item + boxes respawn at half time */
  frantic?: boolean;
}

export interface NetRoomState {
  code: string;
  hostId: string;
  players: NetPlayerInfo[];
  config: NetRoomConfig;
  phase: 'lobby' | 'racing';
}

export interface NetRaceStart {
  grid: NetPlayerInfo[];       // grid order, index 0 = pole
  config: NetRoomConfig;
  /** v10 READY HANDSHAKE: 0 = "prepare, hold on the grid" — every client
   *  builds its session and reports race:ready, then the host broadcasts
   *  race:go with the synchronized epoch-ms GO instant. A non-zero value is
   *  a direct start (legacy path: clients align their countdown to it). */
  startAt: number;
}

/** Compact per-kart state streamed at ~20 Hz (v9: t + vy for smooth puppets). */
export interface NetKartState {
  t?: number;                  // OWNER clock stamp (ms) — puppet playback timeline
  p: [number, number, number]; // position
  ry: number;                  // yaw
  s: number;                   // signed speed (m/s)
  vy?: number;                 // vertical velocity (m/s) — hop/flight arcs
  d: number;                   // drift level 0..3
  st: number;                  // status bitflags: 1 spin, 2 shrink, 4 star, 8 boost, 16 invuln
  lap: number;                 // laps completed
  prog: number;                // spline progress 0..1
  f: 0 | 1;                    // finished
}

export type NetEvent =
  | { t: 'item'; item: ItemId; behind: boolean }             // fired by peer (replicate)
  | { t: 'hit'; target: string; item?: ItemId }              // owner-authoritative hit
  | { t: 'trap'; kind: 'goo' | 'mine'; p: [number, number, number] }
  | { t: 'coin'; idx: number }                               // world coin consumed
  | { t: 'box'; idx: number }                                // world item box consumed
  | { t: 'steal'; target: string; item: ItemId | null }      // magnet drone steal
  | { t: 'storm' }
  | { t: 'trick' };

export interface NetResultRow {
  id: string;
  name: string;
  charId: string;
  color: number;
  timeMs: number | null;
  pos: number;
}

export const ST_SPIN = 1;
export const ST_SHRINK = 2;
export const ST_STAR = 4;
export const ST_BOOST = 8;
export const ST_INVULN = 16;
export const ST_HELD = 32;     // item held out behind as rear shield
