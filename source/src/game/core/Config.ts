/**
 * APEX KART — Central tuning configuration.
 * Every number that shapes the "feel" lives here so designers can iterate
 * without touching logic. Values in SI-ish units (meters, m/s, seconds).
 */

export const PHYS = {
  fixedDt: 1 / 60,          // fixed physics step
  maxSubSteps: 5,

  gravity: -26.0,           // stronger than real for arcade jump feel
  groundSnap: 0.35,         // vertical snap distance when grounded

  // --- base speed model (before class scaling) --------------------------
  baseTopSpeed: 24.0,       // m/s ~ 86 km/h at 100cc for medium class
  baseAccel: 11.0,          // m/s^2 at low speed
  coastDrag: 0.9,           // exp damping when no throttle
  brakeDecel: 30.0,
  reverseMax: 9.0,

  // --- cc scaling --------------------------------------------------------
  ccScale: { 50: 0.80, 100: 1.0, 150: 1.22, 200: 1.42 } as Record<number, number>,

  // --- steering ----------------------------------------------------------
  maxYawRate: 2.35,         // rad/s at low speed
  steerAtTopSpeed: 0.42,    // fraction of maxYawRate at top speed
  steerSpeedRef: 20.0,      // speed where falloff is halfway
  // v8 feel: keyboard/analog steering is no longer 0→full-lock in ONE frame.
  // The kart's steer state ramps toward the input (in = slower attack for a
  // planted feel, out = snappier centering), and player input gets an expo
  // curve so small inputs = fine corrections (consultoría: ramp + expo).
  steerRampIn: 9.0,         // units/s steering moves TOWARD a bigger target
  steerRampOut: 14.0,       // units/s steering returns toward center
  steerExpo: 1.5,           // player input curve exponent (1 = linear)

  // --- drift -------------------------------------------------------------
  driftEnterSpeed: 8.5,     // min speed to start drifting (40 km/h felt unresponsive)
  driftYawBoost: 1.65,      // yaw authority multiplier while drifting
  driftSlide: 6.5,          // lateral slide accel (m/s^2) while drifting
  driftSlideGrip: 0.65,     // lateral damping while drifting (lower = slidey)
  // v8 MK8 timing: blue ~0.65 s of committed slide, orange 1.5, purple 2.6
  // (was 0.85/2.1/3.4 — the purple was unreachable on most corners).
  driftChargeTime: [0.65, 1.5, 2.6], // seconds to reach level 1/2/3
  driftYawBias: 0.55,       // how much drift direction pushes yaw while center
  driftReArm: 0.45,         // s after an interrupted slide before hold re-engages

  // --- hop (MK8 drift entry) ------------------------------------------------
  // SPACE on the ground = a SNAPPY hop that doubles as the drift commit:
  // direction locks at the press, the slide runs through the air and lands
  // already digging (the old v5 removal targeted a floaty 0.5 s mandatory
  // jump; this hop is 0.33 s and never delays drift response).
  hopImpulse: 4.35,         // m/s vertical launch (≈0.33 s airtime at g=26)
  hopMinSpeed: 3.0,         // below this a press is ignored (no bunny-hop spam)

  // --- mini-turbo ---------------------------------------------------------
  miniTurbo: [
    { time: 0.65, power: 1.28 },  // level 1 blue
    { time: 1.05, power: 1.38 },  // level 2 orange
    { time: 1.55, power: 1.50 },  // level 3 purple
  ],

  // --- boost / slipstream -------------------------------------------------
  boostAccel: 26.0,         // accel toward boost target speed
  boostPadTime: 1.1,
  boostPadPower: 1.45,
  slipstreamTime: 1.0,      // seconds behind rival to charge
  slipstreamRange: 14.0,    // max distance to rival ahead
  slipstreamCone: 0.55,     // cos threshold of angle to rival heading
  slipstreamPower: 1.22,

  // --- coins (MK-style economy) -----------------------------------------------
  coinMax: 10,
  coinSpeedBonus: 0.008,    // +0.8% top speed per coin (max +8% at 10)
  coinsLostOnHit: 3,
  coinPickupRadius: 1.35,
  coinRows: 34,             // rows of 3 coins spread along the lap
  coinRespawnMs: 9000,

  // --- air tricks (MK8-style stunts) --------------------------------------------
  trickMinAir: 0.15,        // seconds airborne before a stunt can start
  trickDuration: 0.55,      // seconds the stunt animation lasts
  trickBoostTime: 0.85,
  trickBoostPower: 1.32,

  // --- glider / parachute (MK7/8-style: big air => canopy opens) ---------------
  // v6: thresholds relaxed — the canopy now pops on most REAL ramp flights
  // (launch vy = 0.20*speed barely ever reached the old -11.5 m/s gate before
  // touchdown, so players almost never saw it open).
  gliderDeployVy: -7.0,     // falling at least this fast to auto-open
  gliderMinHeight: 2.4,     // ...and at least this high above the ground
  gliderAirTime: 0.85,      // s airborne (falling gently) that also pops it
  gliderMinFallVy: -1.5,    // minimum descent for the air-time trigger
  gliderGravityMul: 0.30,   // descent strongly slowed under canopy
  gliderFallCap: -6.0,      // terminal glide speed (m/s)
  gliderSteer: 0.95,        // steering authority while gliding (vs 0.55 raw air)
  gliderOpenTime: 0.28,     // canopy pop animation (s)

  // --- offroad --------------------------------------------------------------
  offroadDrag: 3.2,         // strong damping off the road
  offroadMaxFactor: 0.55,   // speed clamp factor while offroad
  roughRoadFactor: 0.80,    // shortcut terrain
  wallBounce: 0.4,          // restitution vs track walls

  // --- collisions -----------------------------------------------------------
  kartRadius: 1.15,
  bumpImpulse: 3.2,         // lateral impulse on kart-kart contact
  bumpSpeedTransfer: 0.35,
  // v8: same-direction racing contact (rear-ends) reads ~4-8 m/s closing;
  // the old 8/15 gates meant almost nothing ever spun. T-bones and hard
  // rear-ends now matter (MK rule: contact has consequences).
  crashSpinClosing: 11.5,   // closing speed (m/s) that fully crashes the victim (spin-out)
  crashWobbleClosing: 6.5,  // closing speed that makes the victim wobble/lose the line
  crashBounce: 0.55,        // positional bounce factor on hard crashes
  wobbleTime: 0.9,          // wobble duration (s)
  wobbleStrength: 0.55,     // wobble yaw amplitude (rad)

  // --- hazards / status ------------------------------------------------------
  spinTime: 1.15,           // spun-out duration (1.6 let piles snowball)
  shrinkTime: 6.0,
  shrinkScale: 0.55,
  shrinkSpeedFactor: 0.62,
  invulnAfterRespawn: 1.5,
  starTime: 8.0,
  starSpeedFactor: 1.28,
  aegisTime: 5.0,
  killFallSpeed: -60.0,
} as const;

export const RACE = {
  countdownStepMs: 900,     // each of 3/2/1 lasts this
  goDelayMs: 900,
  // v8 graded rocket start (was: a 1.77 s flat window — every start was a
  // turbo start). Press timing around ¡YA! now decides the quality:
  //   ≤ turboStartSuperMs  → SUPER rocket (1.5 s × 1.55 + "¡SALIDA TURBO!")
  //   ≤ turboStartGoodMs   → good rocket (0.9 s × 1.35)
  //   > wheelspinEarlyMs   → wheelspin donuts (the MK "too early" burnout)
  turboStartSuperMs: 150,   // perfect press window (ms held before GO)
  turboStartGoodMs: 500,    // good press window
  wheelspinEarlyMs: 1400,   // held longer than this = jumped the gun
  wheelspinHardMs: 2300,    // held from before "2" = full donut burnout
  earlyPenalty: 1.2,        // wheelspin seconds if throttling way too early
  checkpoints: 12,          // sector count for anti-cheat lap validation
  respawnFade: 0.4,
  finishSpectateMs: 5500,   // results screen delay after player finish
  gpPoints: [15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 1],
  maxKarts: 12,
} as const;

export const AI = {
  lookaheadNear: 6.0,       // meters ahead for steering target
  lookaheadFar: 16.0,
  steerKp: 4.2,
  steerKd: 0.45,   // damping must stay well below Kp*err at low speed, else the
                   // derivative term saturates the steer and karts orbit in 1m circles
  curvatureSpeedRef: 14.0,  // speed for curvature→target-speed mapping
  driftAngleThreshold: 0.42,// rad of upcoming curve to trigger drift
  itemThinkInterval: 1.8,   // seconds between item decisions (snappy but no pack-spam)
  // rubber-banding: multiplier applied to AI target speed by rank gap.
  // Deliberately SUBTLE: bots race on skill (cornering, drifting, items),
  // not on artificial pace. The slider still works for those who want it.
  rubberRange: 60.0,        // meters of gap mapped to full effect
  rubberAhead: 0.05,        // max bonus when AI is ahead of player (small)
  rubberBehind: { 50: 0.06, 100: 0.09, 150: 0.13 } as Record<number, number>,
  unfairBehind: 0.18,      // 150cc "unfair" extra when configured
  shortcutChance: { aggressive: 0.25, defensive: 0.05, reckless: 0.75 },
  targetJitter: 0.9,       // meters of random lateral offset amplitude
} as const;

export const CAMERA = {
  distance: 6.4,
  height: 2.9,
  lookAhead: 7.0,
  fovBase: 64,
  fovBoost: 80,
  fovLerp: 6.0,
  posLerp: 10.0,
  driftLateral: 1.4,        // camera slides outward while drifting
  minSpeedFoV: 4.0,         // speeds below this relax to base fov
  // v8: the camera leans WITH the slide — a damped roll that sells the
  // lateral g-force of a drift (MK8 chase cam does exactly this).
  rollDrift: 0.055,         // max roll (rad ≈ 3.2°) toward the drift direction
  rollLerp: 5.0,            // roll damping rate
} as const;

export const ITEMS = {
  rouletteTimeMs: 1400,
  boxRespawnMs: 3000,
  boxFloatHeight: 1.2,
  boxRadius: 1.35,
  boxesPerTrack: 9,         // rows of boxes (~every 90m) — enough to fight, not a warzone
  projectileSpeed: 38.0,
  seekerTurnRate: 2.6,
  hunterSpeed: 44.0,
  magnetSpeed: 20.0,
  trapRadius: 2.0,          // v8: generous goo-trap radius (MK-forgiving)
  trapLife: 20.0,
  mineLife: 25.0,
  trapSpin: true,
  orbitRadius: 1.9,
  orbitBlocks: 3,
} as const;

export const BATTLE = {
  hp: 3,
  defaultTime: 180,
  respawnMs: 2500,
  teamRed: '#e0453a',
  teamBlue: '#3a7de0',
} as const;

export const VIDEO = {
  quality: {
    low:    { pixelRatio: 0.75, shadows: false, bloom: false, decor: 0.5, crowd: 0 },
    medium: { pixelRatio: 1.0,  shadows: true,  bloom: true,  decor: 0.8, crowd: 0.6 },
    high:   { pixelRatio: 1.5,  shadows: true,  bloom: true,  decor: 1.0, crowd: 1.0 },
  } as Record<string, { pixelRatio: number; shadows: boolean; bloom: boolean; decor: number; crowd: number }>,
} as const;

// --------------------------------------------------- feel-critical helpers

/** Acceleration curve: strong at low speed, tapering to zero at vmax. */
export function accelAt(speed: number, vmax: number, accel: number): number {
  const x = clamp01(speed / Math.max(vmax, 0.1));
  return accel * (1.0 - x * x * 0.85);
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Steering authority falls as speed rises (bigger turning radius). */
export function steerAuthority(speed: number): number {
  const s = speed / PHYS.steerSpeedRef;
  return PHYS.steerAtTopSpeed + (1 - PHYS.steerAtTopSpeed) / (1 + s * s);
}
