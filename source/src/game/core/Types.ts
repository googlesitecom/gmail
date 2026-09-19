/**
 * APEX KART — Shared types & enums.
 * Pure data contracts used across the whole engine. No Three.js imports here.
 */

// ---------------------------------------------------------------- lifestyles

export type GameMode = 'grandprix' | 'timetrial' | 'vs' | 'battle';
export type EngineClass = 'feather' | 'light' | 'medium' | 'heavy' | 'titan';
export type Difficulty = 50 | 100 | 150 | 200;     // engine cc class (200 = extreme)
export type AIPersonality = 'aggressive' | 'defensive' | 'reckless';
export type QualityLevel = 'low' | 'medium' | 'high';

export type RacePhase =
  | 'loading'        // building the world
  | 'countdown'      // 3-2-1 sequence
  | 'racing'         // main loop
  | 'finished'       // all karts crossed / timer ended
  | 'paused';

// ---------------------------------------------------------------- item ids

/** All 13 original items (brief lists 13 capabilities under "minimum 12"). */
export type ItemId =
  | 'photon_dart'    // straight projectile
  | 'seeker_orb'     // homing projectile
  | 'triple_dart'    // three straight projectiles, orbiting
  | 'goo_trap'       // ground obstacle (dropped forward)
  | 'rear_mine'      // throwable-back obstacle
  | 'turbo_cell'     // simple boost
  | 'turbo_stack'    // triple boost charges
  | 'star_core'      // golden boost (long, invincible, plows)
  | 'orbit_shield'   // 3 orbital blockers
  | 'aegis_star'     // temporary invincibility
  | 'storm_chip'     // lightning: shrinks rivals
  | 'track_hunter'   // auto-missile that runs the racing line
  | 'magnet_drone';  // steals the item of the rival ahead

// ---------------------------------------------------------------- karts

export interface KartControls {
  throttle: number;   // 0..1
  brake: number;      // 0..1
  steer: number;      // -1..1 (positive = right)
  drift: boolean;     // hop/drift button held
  driftRelease: boolean; // internal edge for the physics step
  fireItem: boolean;  // item button pressed this frame
  itemHeld: boolean;  // item button held down (hold-item-behind mechanic)
  lookBack: boolean;  // rear-view
}

export interface CharacterStats {
  id: string;
  displayName: string;
  klass: EngineClass;
  topSpeed: number;     // m/s at 100cc, before class scale
  acceleration: number; // m/s^2 baseline
  weight: number;       // 1..10 collision mass
  handling: number;     // yaw authority 0..1
  grip: number;         // drift slide factor 0..1
  unlockHint: string;   // shown when locked
  // ---- passive ability (class trait; defaults are neutral) --------------
  /** drift charge speed multiplier (feather class: 1.2) */
  driftChargeMul?: number;
  /** slipstream charge speed multiplier (light class: 1.35) */
  slipMul?: number;
  /** offroad drag multiplier, lower = plows through terrain (medium: 0.7) */
  offroadMul?: number;
  /** outgoing bump/crash impulse multiplier (heavy: 1.35) */
  bumpMul?: number;
  /** incoming bump impulse reduction 0..1 (titan: 0.45) */
  bumpResist?: number;
  /** spin-out duration multiplier (titan: 0.85) */
  spinResist?: number;
}

// ---------------------------------------------------------------- tracks

export interface TrackControlPoint {
  x: number; z: number; y?: number;
  bank?: number;      // radians, positive banks right side up
  width?: number;     // overrides track default road half-width
  jump?: boolean;     // road mesh gap + no ground support
  sharp?: number;     // extra curvature hint for AI (0..1)
  tunnel?: boolean;   // cover this stretch with an arched tunnel
}

export interface ShortcutDef {
  /** main-spline progress (0..1) where the shortcut branches off / merges back */
  from: number;
  to: number;
  points: TrackControlPoint[];
  rough?: number;     // speed multiplier while inside (default 0.75)
}

export interface HazardDef {
  kind: 'mover' | 'faller' | 'zone' | 'gate';
  at: number;               // main spline progress 0..1
  offset?: number;          // lateral offset in meters
  speed?: number;           // mover traverse speed m/s
  period?: number;          // faller/gate period seconds
  phase?: number;
  radius?: number;          // zone radius / mover size
  effect?: 'spin' | 'slow' | 'grip' | 'boost';
  power?: number;           // zone multiplier
  label?: string;           // decoration theme key
}

export type TrackTheme =
  | 'meadow' | 'desert' | 'beach' | 'city' | 'snow' | 'volcano'
  | 'castle' | 'space' | 'jungle' | 'factory' | 'glacier' | 'prism';

export interface TrackDef {
  id: string;
  name: string;
  theme: TrackTheme;
  laps: number;
  /** main circuit control points (closed loop) */
  points: TrackControlPoint[];
  halfWidth: number;
  shortcuts: ShortcutDef[];
  hazards: HazardDef[];
  boostPads: number[];      // progress 0..1 positions
  /** AI difficulty shaping */
  aiSpeedScale?: number;
}

export interface CupDef {
  id: string;
  name: string;
  tracks: string[];         // track ids, order matters
  unlockAfter?: string;     // cup id to win first
}

export interface ArenaDef {
  id: string;
  name: string;
  theme: TrackTheme;
  radius: number;
  obstacles: { x: number; z: number; r: number; h?: number; kind?: string }[];
}

// ---------------------------------------------------------------- session

export interface SessionConfig {
  mode: GameMode;
  difficulty: Difficulty;   // cc class
  mirror: boolean;
  /** track id for race modes, arena id for battle */
  trackId?: string;
  arenaId?: string;
  laps?: number;            // VS override
  aiCount: number;          // 0..11
  itemsEnabled: boolean;
  aiRubberBand: number;     // 0..1 slider
  playerId: string;         // character id
  playerKartColor: number;  // hex
  cupId?: string;           // grand prix
  battleTime?: number;      // seconds
  /** online room race (mode stays 'vs'; engine builds peer puppets) */
  online?: OnlineSessionSpec;
}

/** Online race spec: grid players from the server + which one is local. */
export interface OnlineSessionSpec {
  grid: { id: string; name: string; charId: string; color: number; bot?: boolean }[];
  localId: string;
  /** server epoch-ms when GO should fire (countdown alignment) */
  startAt: number;
  /** true on the room host — bots run locally here, as puppets elsewhere */
  isHost?: boolean;
}

export interface RaceResultRow {
  kartId: string;
  characterId: string;
  isPlayer: boolean;
  position: number;
  points: number;
  totalPoints: number;
  finishTimeMs: number | null;
  bestLapMs: number | null;
  /** online: the human's nickname (fallback: character displayName) */
  name?: string;
}

export interface AnnouncerLine {
  text: string;
  tone: 'info' | 'good' | 'bad' | 'hype';
  atMs: number;
}
