/**
 * APEX KART — AI drivers.
 *
 * Design: drive the precomputed racing line (apex-cutting lat + physical
 * speed profile with braking distances baked in), then behave like racers:
 *  - pure-pursuit steering (PD on heading error, correct screen convention)
 *  - brake BEFORE corners, power out of them (profile does the math)
 *  - overtake slower karts on the emptier side, with hysteresis
 *  - dodge sweeping hazards (movers), respect closing gates
 *  - drift through long corners, release at max charge
 *  - grab item boxes when empty-handed, use items tactically
 *  - risk-assessed shortcuts, stuck detection & reverse recovery
 *  - rubber-banding (tunable; only "unfair" at 150cc)
 *
 * Steering sign convention (matches KartController):
 *   positive steer = turn right on screen = yaw DECREASES,
 *   so steer = -(Kp*err - Kd*yawRate).
 */

import * as THREE from 'three';
import { AIPersonality, KartControls } from '../core/Types';
import { AI, PHYS } from '../core/Config';
import { clamp, makeRng, angleDelta } from '../core/MathUtils';
import { KartController } from '../karts/KartController';
import { OpenPath, Spline } from '../tracks/Spline';
import { RacingLine } from '../tracks/TrackBuilder';
import { HazardInstance } from '../tracks/TrackBuilder';

interface PersonalityParams {
  speedMult: number;
  shortcutChance: number;
  itemAggro: number;      // 0..1 how eagerly offensive items are fired
  lineJitter: number;     // lateral wandering
  holdShield: number;     // 0..1 tendency to keep defensive items
  cornerSkill: number;    // fraction of the profile corner speed used
}

// COMPETENCE TIERS, NOT SPEED TIERS: every bot has the same engine (1.00
// speedMult) — the good ones are good because they corner harder, hold a
// cleaner line, drift better and use items smarter. "Faster bots" felt
// like rubber-banding; "sharper bots" reads as skill.
// v2 (skill pass): corner speeds pushed to the real grip limit (the profile
// has margin baked in), lines cleaned up (less wandering), item play
// sharper — the pack now genuinely races the player instead of escorting.
const PERSONALITIES: Record<AIPersonality, PersonalityParams> = {
  // shortcutChance 0: shortcuts stay a PLAYER tool — the open-rail windows
  // around branch entries were the #1 source of AI void falls.
  aggressive: { speedMult: 1.00, shortcutChance: 0.0, itemAggro: 0.55, lineJitter: 0.22, holdShield: 0.28, cornerSkill: 1.00 },
  defensive:  { speedMult: 1.00, shortcutChance: 0.0, itemAggro: 0.34, lineJitter: 0.16, holdShield: 0.68, cornerSkill: 0.965 },
  reckless:   { speedMult: 1.00, shortcutChance: 0.0, itemAggro: 0.64, lineJitter: 0.34, holdShield: 0.12, cornerSkill: 1.02 },
};

export interface AICtx {
  spline: Spline;
  shortcuts: OpenPath[];
  line: RacingLine;            // per-sample racing line (lat + vMax)
  hazards: HazardInstance[];   // movers/gates to dodge
  boxes: THREE.Vector3[];      // active item box positions
  karts: KartController[];     // rivals (overtaking)
  playerTotalProgress: number; // meters
  aiTotalProgress: number;     // this kart, meters
  rubberBand: number;          // 0..1 configured slider
  unfair: boolean;             // 150cc "unfair" catch-up
  difficulty: number;          // 50/100/150
  itemsEnabled: boolean;
  /** per-track AI pace shaping (TrackDef.aiSpeedScale) */
  trackSpeedScale?: number;
  time: number;
  /** seconds since GO (negative during countdown) — fuels skill starts */
  goElapsed?: number;
  /** active coins (track s 0..1 + lateral m) — pace economy, swept en route */
  coins?: { s: number; lat: number }[];
  /** live goo/mines to dodge (track s 0..1 + lateral m + owner) */
  traps?: { s: number; lat: number; ownerId: string }[];
}

const NEUTRAL: KartControls = {
  throttle: 0, brake: 0, steer: 0, drift: false, driftRelease: false, fireItem: false, itemHeld: false, lookBack: false,
};

export class AIDriver {
  readonly kart: KartController;
  readonly personality: AIPersonality;
  private params: PersonalityParams;
  private rng: () => number;
  private wander = 0;               // current lateral wander offset
  private retargetIn = 0;
  private itemThinkIn = 0;
  private aiDrift = false;
  private driftReleaseTimer = 0;
  /** true once the current slide has actually ENTERED the slow zone — the
   *  approach straight must not count as "corner over" (vNow is still high) */
  private driftInCorner = false;
  private itemHoldTime = 0;
  private skill: number;            // permanent speed skill jitter
  private lastYaw = 0;

  // overtake state
  private overtakeT = 0;
  private overtakeSide = 0;
  private offRoad = false;
  private followSpeed = Infinity;
  // stable U-turn direction when badly disoriented (err near +-pi flips
  // sign every frame through the wrap — a locked turn direction fixes the
  // pirouette-on-the-spot failure mode)
  private turnLock = 0;
  // telemetry for QA debugging
  dbg = { targetSpeed: 0, steer: 0, err: 0, throttle: 1, brake: 0, vMaxHere: 0, follow: Infinity };

  // stuck / recovery state
  private stuckT = 0;
  /** seconds of zero progress near a jump gap (lifts the gap protections) */
  private gapStallT = 0;
  private reversing = 0;
  // PROGRESS-based stuck detection: wheelspeed lies (rail-grind locks and
  // soft piles show 2-7 m/s of wheelspin with ZERO forward progress), so
  // the window below tracks how much TRACK actually advanced lately.
  private progPrev = 0;
  private progWindow: number[] = [];
  private progSampleIn = 0;
  // race-start skill (well-timed launch boost, like the player's)
  private startSkill = 0;
  private startBoostUsed = false;
  // spin-recovery window for item decisions (burn a boost to re-pace)
  private spinRecover = 0;
  /** random 0..6 s offset for the universal stall-respawn — serializes pile
   *  escapes so a welded group doesn't respawn simultaneously into itself */
  private stallEscapeOffset = 0;
  // offroad wallow: stalled beside the road this long → courtesy respawn
  // (hairpin overshoots & switchback confusion kept half the field crawling)
  private offroadStallT = 0;
  // grace after a wallow respawn — the kart re-enters the SAME zone it died
  // in, at crawl speed; without grace it re-triggers forever (respawn loop)
  private wallowGrace = 0;

  // shortcut commitment (idx → {ok, refresh})
  private scCommit: { ok: boolean; until: number }[] = [];

  constructor(kart: KartController, personality: AIPersonality, seed: number) {
    this.kart = kart;
    this.personality = personality;
    this.params = PERSONALITIES[personality];
    this.rng = makeRng(seed);
    this.wander = (this.rng() * 2 - 1) * AI.targetJitter;
    // tiny pace jitter — the spread comes from cornering skill, not top
    // speed. Some natural spread is GOOD: it de-conflicts the pack into a
    // train instead of a 12-wide wall into corner 1.
    this.skill = 0.988 + this.rng() * 0.024;
    this.startSkill = this.rng();
    this.stallEscapeOffset = this.rng() * 6;
  }

  /** Rubber-band speed multiplier from gap to the player. */
  private rubberMult(ctx: AICtx): number {
    const gap = ctx.playerTotalProgress - ctx.aiTotalProgress; // + = AI behind player
    const f = clamp(gap / AI.rubberRange, -1, 1);
    let mult = 1;
    if (f > 0) {
      const behind = ctx.unfair ? AI.unfairBehind : (AI.rubberBehind[ctx.difficulty] ?? 0.12);
      mult = 1 + behind * f * ctx.rubberBand;
    } else if (f < 0) {
      mult = 1 - AI.rubberAhead * (-f) * ctx.rubberBand;
    }
    return mult;
  }

  update(dt: number, ctx: AICtx): KartControls {
    const k = this.kart;
    const sp = ctx.spline;
    const gi = k.ginfo;
    const N = sp.samples.length;
    if (!gi) return NEUTRAL;

    const speed = Math.abs(k.speed);

    // ---- race-start skill: the good starters hit the launch window ------
    // (same 260 ms window the player has; skill decides who nails it)
    if (ctx.goElapsed !== undefined && !this.startBoostUsed) {
      // ~60% of the field nails the launch (was ~55%) — enough to make
      // starts feel raced without bunching the whole grid into corner 1
      if (ctx.goElapsed > 0 && ctx.goElapsed < 0.26 && this.startSkill > 0.45) {
        k.applyBoost(0.85, 1.14 + (this.startSkill - 0.45) * 0.3);
        this.startBoostUsed = true;
      } else if (ctx.goElapsed > 0.3) {
        this.startBoostUsed = true;
      }
    }
    this.spinRecover = k.spinT > 0 ? 1.6 : Math.max(0, this.spinRecover - dt);

    // ---------------- stuck detection & reverse recovery -------------------
    // Queues are NOT stuck: never reverse while waiting for a closing gate
    // OR while another kart is just ahead (gate/chicane traffic jams would
    // otherwise dissolve into reverse-into-queue chaos).
    let gateAheadClosed = false;
    for (const h of ctx.hazards) {
      if (h.def.kind !== 'gate') continue;
      const dS = Spline.wrapS(h.def.at - gi.s) * sp.length;
      if (dS > 0.5 && dS < 18) { gateAheadClosed = true; break; }
    }
    let liveQueueAhead = false;
    for (const other of ctx.karts) {
      if (other === k || other.battleKo || other.finished) continue;
      // 2D proximity (side-by-side jams share track progress but still block
      // each other — pure dS misses them). Only a MOVING kart blocks the
      // stuck-recovery: a stationary neighbor means we're in a wreck PILE,
      // and piles need the reverse to untangle (blocking it there welded
      // whole grids together at chicane entries forever).
      const dx = other.pos.x - k.pos.x, dz = other.pos.z - k.pos.z;
      if (dx * dx + dz * dz < 5 * 5 && Math.abs(other.speed) > 4) { liveQueueAhead = true; break; }
    }
    // NEVER trigger the reverse recovery near a jump gap: karts brake and
    // queue after landings (racing-line profile), and reversing there loops
    // back INTO the gap — fall, respawn past, queue, reverse, forever.
    let gapNear = false;
    {
      const N2 = sp.samples.length;
      const here = ((gi.mainIdx % N2) + N2) % N2;
      for (let d = -6; d <= 18; d += 2) {
        if (sp.samples[((here + d) % N2 + N2) % N2].jump) { gapNear = true; break; }
      }
    }
    // PILE-AWARE: a wreck pile sits in equilibrium at 3-5 m/s (everyone
    // full-throttling into everyone at the same target). That counts as
    // stuck ONLY with slow neighbors welded nearby — a lone kart at 5 m/s
    // is just exiting a hairpin.
    let inPile = false;
    if (speed < 6) {
      let slowNeighbors = 0;
      for (const other of ctx.karts) {
        if (other === k || other.battleKo || other.finished) continue;
        const dx = other.pos.x - k.pos.x, dz = other.pos.z - k.pos.z;
        if (dx * dx + dz * dz < 5 * 5 && Math.abs(other.speed) < 5) slowNeighbors++;
      }
      inPile = slowNeighbors >= 2;
    }
    // progress window: ~4 samples/s, last ~2.6 s of unwrapped track meters
    this.progSampleIn -= dt;
    if (this.progSampleIn <= 0) {
      this.progSampleIn = 0.25;
      const sNow = gi.s * ctx.spline.length;
      let d = sNow - this.progPrev;
      if (d < -ctx.spline.length * 0.5) d += ctx.spline.length;
      else if (d > ctx.spline.length * 0.5) d -= ctx.spline.length;
      this.progPrev = sNow;
      this.progWindow.push(d);
      if (this.progWindow.length > 10) this.progWindow.shift();
    }
    const progAdvanced = this.progWindow.length >= 8
      ? this.progWindow.reduce((a, b) => a + b, 0) : Infinity;
    const stalled = progAdvanced < 5; // < 5 m of track in ~2 s while "driving"
    // The gap-near protection must not hold a WELDED kart forever: karts
    // pinned at the rail / in a pile next to a jump gap used to be excluded
    // from BOTH the reverse recovery and the wallow respawn — an escape-proof
    // trap on switchback+gap combos (glacier). After 5 s of zero progress the
    // protections lift (respawn anchors are already placed past every gap,
    // and a 0 m/s reverse can't loop into anything).
    if (stalled && speed < 9) this.gapStallT += dt;
    else this.gapStallT = Math.max(0, this.gapStallT - dt * 2);
    const gapHardBlock = gapNear && this.gapStallT < 5;
    // RAIL-GRIND EXEMPTION: reversing while pinned against the guardrail is
    // counterproductive — the rescue below (deep inward target at low speed)
    // is the only thing that peels a kart off the wall. Let it work instead
    // of flip-flopping reverse↔forward against the clamp — but only for the
    // first 2.5 s. A grind that survives the rescue aim has failed it, and
    // the reverse untangle is the only move left (before, `grinding` blocked
    // the stuck timer FOREVER: karts welded to hairpin rails for half a lap).
    const grinding = k.railGrindT > 1.0 && k.railGrindT < 2.5;
    if ((speed < 1.5 || inPile || (stalled && speed < 9)) && !grinding
      && !k.finished && !gateAheadClosed && !liveQueueAhead && !gapHardBlock) this.stuckT += dt * (stalled ? 1.6 : 1);
    else this.stuckT = Math.max(0, this.stuckT - dt * 2.5);
    // OFFROAD WALLOW RESPAWN: karts crawling off the road (hairpin
    // overshoot, switchback confusion, rail pinning) get the void-fall
    // courtesy after 7 s. Threshold is 6.5 m/s — ice/hairpin pacing dips
    // to 10-12 legitimately, only a true crawl counts. Karts clamped on
    // the rail for 6+ s respawn immediately. A 12 s grace after each
    // respawn prevents re-triggering inside the very zone they died in.
    this.wallowGrace = Math.max(0, this.wallowGrace - dt);
    // UNIVERSAL STALL ESCAPE: welded traffic piles ON the road (switchback +
    // rail compressions of 5+ karts) can't untangle via the 0.9 s reverse —
    // karts just re-ram each other. A kart with ~8 s of zero track progress
    // respawns at its anchor regardless of surface. Slight cheat-skip vs
    // being welded forever: always the better trade.
    // PILE-AWARE STAGGER: when a whole pile trips the escape at once,
    // simultaneous respawns land back INTO the same jam and re-weld (the
    // glacier switchback deadlock) — serialize them by a random offset. A
    // LONE stalled kart (no slow neighbors) rescues immediately: the
    // stagger must never slow down individual recoveries.
    if (this.gapStallT > 8 && !k.finished && this.wallowGrace <= 0) {
      let stalledNeighbors = 0;
      for (const other of ctx.karts) {
        if (other === k || other.battleKo || other.finished) continue;
        if (Math.abs(other.speed) > 6) continue;
        const dS = Spline.wrapS(other.progressS - k.progressS) * ctx.spline.length;
        if (Math.abs(dS) < 15) stalledNeighbors++;
      }
      const stagger = stalledNeighbors >= 2 ? this.stallEscapeOffset : 0;
      if (this.gapStallT > 8 + stagger) {
        k.requestRespawn = true;
        this.gapStallT = 0;
        this.stuckT = 0;
        this.offroadStallT = 0;
        this.wallowGrace = 12;
      }
    }
    const wallowing = !gi.onRoad && gi.onShortcut < 0 && !k.finished
      && (!gapNear || k.railGrindT > 6 || this.gapStallT > 5)
      && (speed < 6.5 || k.railGrindT > 6) && this.wallowGrace <= 0;
    if (wallowing) {
      this.offroadStallT += dt;
      if (this.offroadStallT > 7 || k.railGrindT > 6) {
        k.requestRespawn = true;
        this.offroadStallT = 0;
        this.stuckT = 0;
        this.wallowGrace = 12;
      }
    } else {
      this.offroadStallT = Math.max(0, this.offroadStallT - dt * 2);
    }
    if (this.stuckT > 1.8 && this.reversing <= 0) {
      this.reversing = 0.9;   // brief untangle, never a long grind through traffic
      this.stuckT = 0;
      // ESCAPE LANE: after untangling, drive AROUND the pile on the side
      // with fewer neighbors — returning to the same racing-line target
      // just re-joined the blob we just left.
      let leftN = 0, rightN = 0;
      for (const other of ctx.karts) {
        if (other === k || other.battleKo || other.finished) continue;
        const dS = Spline.wrapS(other.progressS - gi.s) * sp.length;
        if (dS < -2 || dS > 14) continue;
        const oLat = other.ginfo?.lateral ?? 0;
        if (oLat < gi.lateral - 1) leftN++;
        else if (oLat > gi.lateral + 1) rightN++;
      }
      this.overtakeSide = leftN <= rightN ? -1 : 1;
      this.overtakeT = 2.8;
    }
    if (this.reversing > 0) {
      this.reversing -= dt;
      const smHere = sp.sampleAt(gi.s);
      const desiredYaw = Math.atan2(smHere.tangent.x, smHere.tangent.z); // keep nose aligned with the road
      const err = angleDelta(k.yaw, desiredYaw);
      return {
        throttle: 0, brake: 1,
        steer: clamp(-(err * 3.5), -1, 1),
        drift: false, driftRelease: false, fireItem: false, itemHeld: false, lookBack: false,
      };
    }

    // ---------------- pick a steering target -------------------------------
    // Adaptive pure-pursuit: the lookahead grows with speed AND with the
    // kart's lateral offset. A fixed 6-16 m lookahead gave wide-pushed karts
    // a target that sat LATERALLY BEHIND them (err ~1-2 rad) — they orbited
    // it in U-turn ping-pong instead of merging back (the square-dance
    // gridlock). Looking 1.6x further per meter of offset makes the merge
    // geometry convergent.
    const latAbs = Math.abs(gi.lateral);
    // meters beyond the current road edge (0 = on the asphalt line) — used
    // by the recovery steering below and the deep-offroad speed cap
    let deepOff = 0;
    const lookM = AI.lookaheadNear + clamp(speed / 22, 0, 1) * (AI.lookaheadFar - AI.lookaheadNear)
      + Math.min(16, latAbs * 1.6);
    const lookS = Spline.wrapS(gi.s + lookM / sp.length);
    const lookIdx = sp.indexAtS(lookS);
    const myIdx = ((gi.mainIdx % N) + N) % N;
    const hw = sp.samples[lookIdx].halfWidth;

    let target = new THREE.Vector3();
    // two-point line sampling: blending the line offset at two lookaheads
    // smooths chicane transitions (a single point zig-zags the steering)
    const lookIdx2 = sp.indexAtS(Spline.wrapS(lookS + 7 / sp.length));
    let lat = (ctx.line.lat[lookIdx] ?? 0) * 0.72 + (ctx.line.lat[lookIdx2] ?? 0) * 0.28;

    // wander (personality-flavored racing line deviation)
    this.retargetIn -= dt;
    if (this.retargetIn <= 0) {
      this.retargetIn = 2.2 + this.rng() * 2.8;
      this.wander = (this.rng() * 2 - 1) * AI.targetJitter * this.params.lineJitter * 2;
    }
    lat += this.wander;

    const onShortcut = gi.onShortcut >= 0;
    let aimingJump = false;
    if (onShortcut) {
      // follow the shortcut polyline: point just ahead by mapped progress
      const path = ctx.shortcuts[gi.onShortcut];
      let bestPt = path.pts[path.pts.length - 1];
      let bestAhead = Infinity;
      for (const pt of path.pts) {
        let ahead = pt.mappedS - gi.s;
        if (ahead < -0.5) ahead += 1; // handle exit wrap
        if (ahead >= 0 && ahead < bestAhead) { bestAhead = ahead; bestPt = pt; }
      }
      target = bestPt.pos.clone();
    } else {
      // ---- jump alignment: aim at the LANDING ZONE center -----------------
      // Gaps that sit after a bend are approached misaligned; a diagonal
      // launch misses the landing ribbon. Steer at the first solid sample
      // past the gap so every flight is straight. Only for karts roughly
      // facing along the road — a disoriented kart (spun mid-flight by an
      // item) must U-turn slowly instead of full-throttling backward at the
      // landing target and diving into the gap in reverse.
      let jumpIdx = -1;
      for (let d = 2; d <= 18; d += 2) {
        const idx = (myIdx + d) % N;
        if (sp.samples[idx].jump) { jumpIdx = idx; break; }
      }
      const smHere = sp.samples[myIdx];
      const roadYaw = Math.atan2(smHere.tangent.x, smHere.tangent.z);
      const facingAlongRoad = Math.abs(angleDelta(k.yaw, roadYaw)) < 1.3;
      if (jumpIdx >= 0 && speed > 10 && facingAlongRoad) {
        let land = jumpIdx;
        for (let guard = 0; guard < 40 && sp.samples[land].jump; guard++) land = (land + 1) % N;
        target = sp.samples[land].pos.clone();
        aimingJump = true;
      }

      // ---- shortcut entry decision (committed per branch for a while) ------
      if (this.scCommit.length !== ctx.shortcuts.length) {
        this.scCommit = ctx.shortcuts.map(() => ({ ok: false, until: 0 }));
      }
      let aimingShortcut = false;
      let bestSc = -1, bestAheadS = Infinity;
      for (let i = 0; i < ctx.shortcuts.length; i++) {
        const aheadS = Spline.wrapS(ctx.shortcuts[i].pts[0].mappedS - gi.s);
        if (aheadS < bestAheadS) { bestAheadS = aheadS; bestSc = i; }
      }
      if (bestSc >= 0) {
        const commit = this.scCommit[bestSc];
        const distM = bestAheadS * sp.length;
        if (distM < 14 && ctx.time > commit.until) {
          // fresh decision: risk gate by personality + current confidence +
          // rough alignment with the entry (diving at a branch from a bad
                   // angle ends in the open-rail window and the void)
          const entry = ctx.shortcuts[bestSc].pts[0].pos;
          const entryYaw = Math.atan2(entry.x - k.pos.x, entry.z - k.pos.z);
          const aligned = Math.abs(angleDelta(k.yaw, entryYaw)) < 0.6;
          commit.ok = aligned && speed > 13 && this.rng() < this.params.shortcutChance;
          commit.until = ctx.time + 6;
        }
        // lost the window without adopting the branch: drop the commitment
        if (distM > 34) commit.ok = false;
        if (distM < 30 && commit.ok) {
          const sc = ctx.shortcuts[bestSc];
          // aim at the ENTRY while still on the road, then pull into the branch
          const deepPt = (sc.pts[Math.min(sc.pts.length - 1, 10)] ?? sc.pts[0]).pos.clone();
          const entryPt = sc.pts[0].pos.clone();
          target = distM > 9 ? entryPt : deepPt;
          aimingShortcut = true;
        }
      }

      if (!aimingShortcut && !aimingJump) {
        // ---- overtake slower karts on the emptier side -----------------------
        // SKILL, not patience: detect blockers early (16 m), commit to a
        // side, and pull alongside when the lane is free. Only box in and
        // queue when someone occupies the pass lane or a hazard forbids it.
        this.overtakeT -= dt;
        let blocking: KartController | null = null;
        let blockD = Infinity;
        for (const other of ctx.karts) {
          if (other === k || other.battleKo || other.finished) continue;
          const dS = Spline.wrapS(other.progressS - gi.s) * sp.length;
          if (dS < 1.5 || dS > 16) continue;
          const otherLat = other.ginfo?.lateral ?? 0;
          if (Math.abs(otherLat - (gi.lateral)) < 2.8) { blocking = other; blockD = dS; break; }
        }
        if (blocking && this.overtakeT <= 0) {
          const blockLat = blocking.ginfo?.lateral ?? 0;
          // pass on the side with more room (or through the middle)
          this.overtakeSide = Math.abs(blockLat) < hw * 0.4
            ? (blockLat >= 0 ? -1 : 1)
            : -Math.sign(blockLat);
          this.overtakeT = 1.8 + this.rng() * 1.2;
        }
        // is the chosen pass lane actually free?
        let laneBusy = false;
        if (blocking && this.overtakeT > 0 && this.overtakeSide !== 0) {
          const targetLat = this.overtakeSide * (hw - 2.1);
          for (const other of ctx.karts) {
            if (other === k || other.battleKo || other.finished) continue;
            const dS = Spline.wrapS(other.progressS - gi.s) * sp.length;
            if (dS < -1 || dS > blockD + 3) continue;
            const oLat = other.ginfo?.lateral ?? 0;
            if (Math.abs(oLat - targetLat) < 2.6) { laneBusy = true; break; }
          }
        }
        // car-following: match-and-pass when free, queue only when boxed in
        // (the old blockD*2.2 cap made bots sit 3 m behind leaders forever)
        if (blocking) {
          const aheadSpeed = Math.max(0, blocking.speed);
          this.followSpeed = (laneBusy || gateAheadClosed || gapNear)
            ? Math.max(2.5, blockD * 1.6 + aheadSpeed * 0.75)
            : Math.max(aheadSpeed + 1.5, Math.min(k.baseVmax, blockD * 3.0));
        } else {
          this.followSpeed = Infinity;
        }
        if (this.overtakeT > 0 && this.overtakeSide !== 0) {
          lat = lat * 0.3 + this.overtakeSide * (hw - 2.1) * 0.7;
        }

        // ---- dodge sweeping hazards (movers) ---------------------------------
        for (const h of ctx.hazards) {
          if (h.def.kind !== 'mover' || !h.active) continue;
          const dS = Spline.wrapS(h.def.at - gi.s) * sp.length;
          if (dS < 3 || dS > 26) continue;
          const sm = sp.sampleAt(h.def.at);
          const hLat = h.pos.clone().sub(sm.pos).dot(sm.right);
          if (Math.abs(hLat - lat) < 3.0) {
            // dodge relative to OUR side of the hazard — karts split both
            // ways instead of all cramming one dodge lane
            const away = lat >= hLat ? 1 : -1;
            lat = hLat + away * 3.6;
          }
        }

        // ---- bias toward item boxes when empty-handed -------------------------
        let wantBox = false;
        if (!k.itemSlot && k.rouletteUntil <= 0 && ctx.boxes.length) {
          const here = sp.samples[myIdx];
          let bestBox: THREE.Vector3 | null = null;
          let bestD = Infinity;
          for (const b of ctx.boxes) {
            const d = b.distanceToSquared(k.pos);
            if (d < bestD) { bestD = d; bestBox = b; }
          }
          if (bestBox && bestD < 15 * 15) {
            const boxLat = bestBox.clone().sub(here.pos).dot(here.right);
            if (Math.abs(boxLat) < hw - 1.2) { lat = lat * 0.35 + boxLat * 0.65; wantBox = true; }
          }
        }

        // ---- coin vacuum: top speed is +0.8%/coin — sweep the row en route ---
        // LINE DISCIPLINE first: only coins sitting basically ON the line
        // (small deviation) — passive collection already nets ~8/10 by
        // following the racing line; this nudges it to 10 without ever
        // compromising a corner.
        if (!wantBox && this.overtakeT <= 0 && ctx.coins?.length) {
          let bestCoinLat = 0, bestCoinD = Infinity;
          for (const c of ctx.coins) {
            const dS = Spline.wrapS(c.s - gi.s) * sp.length;
            if (dS < 2 || dS > 18) continue;
            const dev = Math.abs(c.lat - lat);
            if (dev > 2.6) continue;
            const cost = dS + dev * 2.2;
            if (cost < bestCoinD) { bestCoinD = cost; bestCoinLat = c.lat; }
          }
          if (bestCoinD < Infinity) lat = lat * 0.45 + bestCoinLat * 0.55;
        }

        // ---- dodge dropped traps (goo / mines) --------------------------------
        // A skilled field doesn't plow into hazards it can see — but the
        // dodge is WIDTH-AWARE and SHORT-RANGE: on twisted sections s-distance
        // ≠ straight-line distance (a trap "24 m ahead" in s can sit beside
        // you around a hairpin), and long-range dodges on technical tracks
        // became phantom swerves that cost more than the trap. 14 m keeps it
        // to genuinely imminent hazards.
        if (ctx.traps?.length) {
          for (const tr of ctx.traps) {
            if (tr.ownerId === k.id) continue;   // our own trap (armed window)
            const dS = Spline.wrapS(tr.s - gi.s) * sp.length;
            if (dS < 1 || dS > 14) continue;
            if (Math.abs(tr.lat - lat) < 2.5) {
              const away = lat >= tr.lat ? 1 : -1;
              const target = tr.lat + away * 3.5;
              const room = hw - 1.6;             // stay off the rails
              if (Math.abs(target) <= room) lat = target;
              // no room? eat it — a spin beats a rail grind pile
            }
          }
        }

        // EDGE MARGIN scales with speed: at 30 m/s a kart needs ~8 m of
        // arc to move 2 m laterally, so a line target parked at hw-1.5
        // invites corner-entry rail pins (the "bots stuck at edges" bug).
        // The faster we go, the further the target stays from the rail.
        const edgeMargin = Math.min(3.4, 1.5 + Math.abs(k.speed) * 0.07);
        lat = clamp(lat, -(hw - edgeMargin), hw - edgeMargin);
        // already running wide? converge back toward the line — chasing a
        // wide target while wide just holds the outside edge forever
        if (Math.abs(gi.lateral) > hw * 0.55) lat *= 0.62;
        const sm = sp.sampleAt(lookS);
        target = sm.pos.clone().addScaledVector(sm.right, lat);
      }

      // ---- off-road recovery flag -------------------------------------------
      // Use the CURRENT sample's half width (the lookahead sample can be
      // wider — landing run-outs — and hid karts pinned at the rail edge:
      // |lat| 9.0 vs hw+2.5 = 11 meant "on the road" while the kart ground
      // against the wall 0.5 m off the asphalt). Beyond the rail limit
      // (hw + 0.6) = aim straight at the road center ahead.
      const hwHere = sp.samples[myIdx].halfWidth;
      deepOff = Math.abs(gi.lateral) - hwHere;
      this.offRoad = !gi.onRoad && gi.onShortcut < 0 && gi.hasGround
        && Math.abs(gi.lateral) > Math.min(hwHere + 0.6, hw + 1.2);
      if (this.offRoad) {
        // converge back: aim at the centerline ahead — closer when wide,
        // because a 10 m target across a hairpin invites orbiting it
        const recS = Spline.wrapS(gi.s + (deepOff > 4 ? 6 : 10) / sp.length);
        const rec = sp.sampleAt(recS);
        target = rec.pos.clone();
      }
      // RAIL-GRIND RESCUE: clamped against the guardrail for > 0.6 s. Chasing
      // the racing line from here aims shallow (a few degrees inward) and
      // the road curving away eats that gain — the grind never ends. Aim
      // DEEP at the road center 30 m ahead instead: at the capped speed the
      // turning circle is tight enough to actually peel off the wall.
      if (k.railGrindT > 0.6 && !onShortcut) {
        const resS = Spline.wrapS(gi.s + 30 / sp.length);
        target = sp.sampleAt(resS).pos.clone();
      }
    }

    // ---------------- steering (pure pursuit PD, screen-correct sign) -------
    const desiredYaw = Math.atan2(target.x - k.pos.x, target.z - k.pos.z);
    const err = angleDelta(k.yaw, desiredYaw);
    const yawRate = dt > 0 ? angleDelta(this.lastYaw, k.yaw) / Math.max(dt, 1e-4) : 0;
    this.lastYaw = k.yaw;
    const steer = clamp(-(err * AI.steerKp - yawRate * AI.steerKd), -1, 1);

    // ---------------- speed target from the racing-line profile -------------
    // The profile's backward pass already guarantees "vMax here = can still
    // brake for the next corner", so a small lookahead is all we need.
    const ahead = (myIdx + 2) % N;
    let targetSpeed = Math.min(
      (ctx.line.vMax[ahead] ?? 25) * this.params.cornerSkill * (ctx.trackSpeedScale ?? 1),
      k.baseVmax * this.params.speedMult * this.skill * this.rubberMult(ctx),
    );
    const vMaxHere = ctx.line.vMax[myIdx] ?? 25;
    // recovering from off-road: keep momentum, no panic braking — but SLOW
    // when deep off (the turning circle must shrink below the distance to
    // the road, or the kart circles the edge forever)
    if (this.offRoad) {
      targetSpeed = Math.max(targetSpeed, Math.min(k.baseVmax, 16));
      if (deepOff > 5) targetSpeed = Math.min(targetSpeed, 11);
    }
    // ICE / low-grip surfaces: real racers lift. The profile assumes full
    // grip; scaling by the live zone grip keeps the line trackable through
    // ice/mud patches instead of understeering into the wall.
    if (k.zoneGripNow < 0.85) targetSpeed *= 0.72 + 0.28 * k.zoneGripNow;
    // rail-grind rescue pace: slow enough that the turning circle shrinks
    // below the distance to the road center — this is what makes the escape
    // geometrically possible
    if (k.railGrindT > 0.6) targetSpeed = Math.min(targetSpeed, 7);
    // car-following cap (set while scanning for blockers)
    targetSpeed = Math.min(targetSpeed, this.followSpeed);

    // closing gates: decelerate proportionally to distance (stop AT the wall,
    // never ram it — ramming bounces back and oscillates forever)
    for (const h of ctx.hazards) {
      if (h.def.kind !== 'gate') continue;
      const dS = Spline.wrapS(h.def.at - gi.s) * sp.length;
      if (dS > 0.5 && dS < 12 && h.active) {
        targetSpeed = Math.min(targetSpeed, Math.max(0.8, dS * 0.9));
      }
    }

    // jump gaps: carry enough speed to fly them (launch ramps convert the
    // climb to vy, so ~22 m/s clears every authored gap with margin)
    for (let d = 2; d <= 18; d += 2) {
      if (sp.samples[(myIdx + d) % N].jump) {
        targetSpeed = Math.max(targetSpeed, 22);
        break;
      }
    }

    const facingWrong = Math.abs(err) > 2.1 && !aimingJump && !this.offRoad;
    let throttle = 1, brake = 0;
    if (facingWrong) {
      // lock a U-turn direction until the error unwraps
      if (!this.turnLock) this.turnLock = -Math.sign(err) || 1;
      // CREEP, don't donut: at ~4 m/s the turning circle shrinks to under
      // 2 m, so the U-turn actually closes instead of orbiting the target.
      // Full emergency brake while over twice the cap: a boosted disoriented
      // kart used to plow back through the pack at 40 m/s wrecking everyone.
      throttle = 0;
      brake = speed > 8 ? 1 : 0;
      targetSpeed = Math.min(targetSpeed, 4.5);
    } else if (Math.abs(err) < 1.4) {
      this.turnLock = 0;
    }
    if (!this.offRoad && speed > targetSpeed * 1.18) { throttle = 0; brake = clamp((speed - targetSpeed) / 9, 0, 0.85); }
    else if (!this.offRoad && speed > targetSpeed) throttle = 0.55;

    // ---------------- drift through long corners -----------------------------
    // CORNER DEMAND from the speed profile, measured at the actual braking
    // distance (v²/2a) — bots commit to the slide exactly when a real driver
    // would, and RELEASE ON EXIT so the mini-turbo fires corner-out (that
    // exit boost is where skilled racers make their time).
    const brakeDist = Math.max(4, speed * speed / 26);
    const samplesPerMeter = N / ctx.spline.length;
    const aheadN = Math.max(2, Math.min(26, Math.round(brakeDist * samplesPerMeter)));
    const vAhead = ctx.line.vMax[(myIdx + aheadN) % N] ?? 25;
    const vNow = ctx.line.vMax[myIdx] ?? 25;
    const cornerAhead = vAhead < k.baseVmax * 0.72 || vNow < k.baseVmax * 0.72;
    const exiting = vAhead > vNow + 0.5;
    const wantDrift = cornerAhead && speed > PHYS.driftEnterSpeed + 1 && !facingWrong && !onShortcut;
    if (wantDrift && !this.aiDrift) {
      this.aiDrift = true;
      this.driftReleaseTimer = 0;
    }
    if (this.aiDrift) {
      this.driftReleaseTimer += dt;
      // SKILL (minimal-delta): when aligned, hold the slide a beat longer
      // to bank at least a level-1 mini-turbo (charge needs ~0.9-1.0 s of
      // active slide). Corner-over and full-charge still release instantly;
      // the entry logic is untouched (proven stable on the switchbacks).
      const shouldRelease =
        Math.abs(err) < 0.1
        || (exiting && k.driftLevel >= 1)
        || k.driftLevel >= 3
        || !cornerAhead
        || this.driftReleaseTimer > 2.6;
      if (shouldRelease || !wantDrift) this.aiDrift = false;
    }
    const drift = this.aiDrift && !facingWrong;

    // while drifting, blend into-drift bias with heading correction
    let steerOut = steer;
    if (facingWrong && this.turnLock && !this.offRoad) {
      steerOut = this.turnLock;          // committed U-turn, no wrap flip-flop
    } else if (drift && k.drifting) {
      const dir = k.driftDir || 1;
      const into = clamp(-err * dir, -1, 1); // +1 = need to rotate further into the drift
      steerOut = clamp(dir * 0.4 + into * 0.8, -1, 1);
    }

    // ---------------- item tactics ---------------------------------------------
    let fireItem = false;
    if (ctx.itemsEnabled) {
      this.itemThinkIn -= dt;
      if (this.itemThinkIn <= 0) {
        this.itemThinkIn = AI.itemThinkInterval;
        fireItem = this.decideItem(ctx);
      } else if (k.itemSlot === 'triple_dart' && this.rng() < 0.3) {
        fireItem = this.rng() < this.params.itemAggro; // fire orbiting darts piecemeal
      }
    }

    this.dbg = {
      targetSpeed: +targetSpeed.toFixed(1), steer: +steerOut.toFixed(2), err: +err.toFixed(2),
      throttle, brake, vMaxHere: +vMaxHere.toFixed(1), follow: this.followSpeed === Infinity ? -1 : +this.followSpeed.toFixed(1),
    };

    return {
      throttle: k.spinT > 0 ? 0 : throttle,
      brake: k.spinT > 0 ? 0 : brake,
      steer: k.spinT > 0 ? 0 : clamp(steerOut, -1, 1),
      drift,
      driftRelease: false,
      fireItem,
      itemHeld: false,
      lookBack: false,
    };
  }

  // ============================================================ battle mode

  /** Battle arena brain: hunt boxes when empty-handed, chase enemies when armed. */
  updateBattle(dt: number, ctx: { boxes: THREE.Vector3[]; karts: KartController[]; time: number }): KartControls {
    const k = this.kart;
    let target: THREE.Vector3 | null = null;

    const enemies = ctx.karts.filter(o => o !== k && !o.battleKo && o.battleTeam !== k.battleTeam);
    if (k.itemSlot) {
      // hunt the nearest enemy
      let bestD = Infinity;
      for (const e of enemies) {
        const d = e.pos.distanceToSquared(k.pos);
        if (d < bestD) { bestD = d; target = e.pos; }
      }
    } else {
      // grab the nearest item box
      let bestD = Infinity;
      for (const b of ctx.boxes) {
        const d = b.distanceToSquared(k.pos);
        if (d < bestD) { bestD = d; target = b; }
      }
    }
    if (!target) target = new THREE.Vector3(0, 0, 0); // arena center

    const desiredYaw = Math.atan2(target.x - k.pos.x, target.z - k.pos.z);
    const err = angleDelta(k.yaw, desiredYaw);
    // screen-correct steering sign (positive steer = right on screen)
    const steer = clamp(-(err * 4.0), -1, 1);
    const dist = k.pos.distanceTo(target);
    const facing = Math.abs(err) < 0.35;

    let throttle = 1, brake = 0;
    // only brake to turn when badly misaligned at point-blank range
    if (Math.abs(err) > 1.4 && dist < 5) { throttle = 0.25; }
    if (Math.abs(err) > 2.3) { throttle = 0.5; }

    // wander a bit so arenas don't look robotic
    const wander = Math.sin(ctx.time * 0.7 + this.wander * 9) * 0.15;
    const drift = facing && Math.abs(err) > 0.5 && Math.abs(k.speed) > 14 && this.personality !== 'defensive';

    // fire items when roughly facing an enemy at range
    let fireItem = false;
    if (k.itemSlot) {
      this.itemThinkIn -= dt;
      if (this.itemThinkIn <= 0) {
        this.itemThinkIn = AI.itemThinkInterval;
        const offensive = ['photon_dart', 'seeker_orb', 'triple_dart', 'track_hunter', 'magnet_drone', 'storm_chip'];
        if (offensive.includes(k.itemSlot) && facing && dist < 42) fireItem = true;
        else if (!offensive.includes(k.itemSlot)) fireItem = true; // shields/boosts right away
      }
    }

    return {
      throttle, brake,
      steer: clamp(steer + wander, -1, 1),
      drift, driftRelease: false, fireItem, itemHeld: false, lookBack: false,
    };
  }

  /** Tactical item usage by position & personality. */
  private decideItem(ctx: AICtx): boolean {
    const k = this.kart;
    const item = k.itemSlot;
    if (!item || k.rouletteUntil > 0) return false;
    const rank = k.rank; // 1-based
    this.itemHoldTime += AI.itemThinkInterval;

    // ---- MK-style hold-behind: keep a blockable item trailing behind as a
    // rear shield while an armed rival rides our bumper. Personality-driven:
    // defensive bots hold much more often than reckless ones.
    const blockable = ['photon_dart', 'seeker_orb', 'triple_dart', 'goo_trap', 'rear_mine'].includes(item);
    if (blockable) {
      let armedTailgater = false;
      for (const other of ctx.karts) {
        if (other === k || other.battleKo || other.finished) continue;
        if (!other.itemSlot) continue;
        if (!['photon_dart', 'seeker_orb', 'triple_dart', 'track_hunter', 'magnet_drone', 'storm_chip'].includes(other.itemSlot)) continue;
        const dBehind = Spline.wrapS(k.progressS - other.progressS) * ctx.spline.length;
        if (dBehind > 0 && dBehind < 12) { armedTailgater = true; break; }
      }
      if (armedTailgater && this.rng() < this.params.holdShield + 0.35) {
        k.itemHeldOut = true;    // shield up — blocks their rear shots
        return false;            // keep holding while the threat sits there
      }
      if (k.itemHeldOut) k.itemHeldOut = false;   // threat gone → free to fire
    }

    switch (item) {
      case 'orbit_shield':
      case 'aegis_star': {
        // DEFENSIVE SKILL: pop the shield when an armed rival is glued to
        // our bumper — not on a timer
        let armedTailgater = false;
        for (const other of ctx.karts) {
          if (other === k || other.battleKo || other.finished) continue;
          if (!other.itemSlot) continue;
          if (!['photon_dart', 'seeker_orb', 'triple_dart', 'track_hunter', 'magnet_drone', 'storm_chip'].includes(other.itemSlot)) continue;
          const dBehind = Spline.wrapS(k.progressS - other.progressS) * ctx.spline.length;
          if (dBehind > 0 && dBehind < 10) { armedTailgater = true; break; }
        }
        if (armedTailgater || rank <= 4 || this.itemHoldTime > 6) {
          this.itemHoldTime = 0;
          return this.rng() > this.params.holdShield * 0.4;
        }
        return false;
      }
      case 'goo_trap':
      case 'rear_mine':
        // traps: drop OFF the racing line only (|lat| > 45% of width) so the
        // pack behind doesn't chain-spin on them; leading comfortably or
        // someone glued behind
        const myLat = k.ginfo?.lateral ?? 0;
        const hwHere = ctx.spline.samples[Math.max(0, k.ginfo?.mainIdx ?? 0)]?.halfWidth ?? 8;
        const offLine = Math.abs(myLat) > hwHere * 0.45;
        if ((rank <= 4 || this.rng() < 0.4) && offLine) { this.itemHoldTime = 0; return true; }
        return false;
      case 'turbo_cell':
      case 'turbo_stack':
      case 'star_core': {
        // boosts: burn IMMEDIATELY to re-pace after a spin (lost time is
        // bought back on the straights). Otherwise a skilled driver saves
        // it for a STRAIGHT — the profile opening up ahead is the tell.
        const N = ctx.spline.samples.length;
        const myIdx = ((k.ginfo?.mainIdx ?? 0) % N + N) % N;
        const vFar = ctx.line.vMax[(myIdx + Math.round(N * 0.05)) % N] ?? 0;
        const straightAhead = vFar > k.baseVmax * 0.9;
        if (this.spinRecover > 0.25 || straightAhead
          || Math.abs(k.speed) > k.baseVmax * 0.75 || this.itemHoldTime > 5) {
          this.itemHoldTime = 0;
          return true;
        }
        return false;
      }
      case 'storm_chip':
        return rank >= 9;
      case 'track_hunter':
      case 'magnet_drone':
        // hunters seek the leader — fire when genuinely behind (rank or gap)
        return (rank >= 4 && this.rng() < this.params.itemAggro * 0.6) || rank >= 9;
      case 'photon_dart':
      case 'seeker_orb':
      case 'triple_dart': {
        // Single-player item war: AI projectiles target THE PLAYER only.
        // Mutual 11-way AI spam carpet-bombed the pack into permanent
        // spin-storm pileups; keeping the threat pointed at the human keeps
        // the race alive AND the item game real for them.
        // SKILL (v2): only fire on a makeable shot — roughly aligned lanes
        // or point-blank — and commit faster. Wasted shots are amateur play.
        let shotOn = false;
        const myLat = k.ginfo?.lateral ?? 0;
        for (const other of ctx.karts) {
          if (!other.isPlayer || other.battleKo || other.finished) continue;
          const dS = Spline.wrapS(other.progressS - k.progressS) * ctx.spline.length;
          if (dS > 3 && dS < 30) {
            const oLat = other.ginfo?.lateral ?? 0;
            if (Math.abs(oLat - myLat) < 4 || dS < 11) { shotOn = true; break; }
          }
        }
        const ok = shotOn && this.rng() < this.params.itemAggro
          && this.itemHoldTime > 1.2;
        if (ok) this.itemHoldTime = 0;
        return ok;
      }
      default:
        return false;
    }
  }
}
