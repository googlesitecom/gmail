/**
 * APEX GP — AI drivers. Real racing drivers, not items-and-rubberband bots.
 *
 * - pure-pursuit steering onto the precomputed racing line
 * - follows the PHYSICAL speed profile (no scripted pace): brakes where the
 *   car must brake, applies throttle where the grip allows
 * - per-driver natural pace + subtle lap-time noise (consistency)
 * - racecraft: slipstream hunting, DRS runs, overtaking off-line, one-move
 *   defense, collision avoidance with ahead cars
 * - rare small mistakes (locked entry / late apex) scaled by difficulty
 */

import type { AILevel, F1Controls } from '../core/Types';
import { AI, PHYS } from '../core/Config';
import { clamp, makeRng, wrapAngle } from '../core/MathUtils';
import type { F1Car } from './F1Car';
import type { F1RacingLine } from './RacingLine';
import type { Spline } from '../tracks/Spline';

export interface F1AIContext {
  spline: Spline;
  line: F1RacingLine;
  cars: F1Car[];
  /** total race distance (m) of every car by id */
  totalM: Map<string, number>;
  level: AILevel;
  racing: boolean;
  time: number;
}

export class F1AIDriver {
  readonly car: F1Car;
  private rng: () => number;
  private paceMul: number;          // car capability multiplier (pace)
  private latUse: number;
  private brakeUse: number;
  private mistakeCooldown = 12;     // no mistakes through launch + T1
  private mistakeT = 0;             // >0 while committing a small error
  private mistakeKind = 0;          // 0 deep entry, 1 shallow entry
  private defendUntil = 0;
  private defendAgainAt = 0;
  private defendSide = 0;           // -1 left / 1 right (offset direction)
  private overtakeSide = 0;
  private overtakeUntil = 0;
  private lastLapNoise = 0;
  private lapNoise = 0;
  // v10.1 traffic memory: sense whether the car ahead is DECELERATING — the
  // old flat queue cushion allowed +12 m/s closing into a braking car,
  // which rear-ended (and spun) half the field at every heavy braking zone
  private lastAheadId = '';
  private lastAheadSpeed = 0;
  // slide-recovery hysteresis: enter at a big slip, hold through the swing,
  // exit only when properly caught (a single threshold chattered between
  // pursuit and counter-steer and fed the tank-slapper)
  private recoveringFlag = false;
  // v10.1 launch discipline: lights-out chaos fix — the whole field used to
  // enter attack mode at once (any car <18 m ahead = the entire grid) and
  // swerve ±2.6 m into each other on the run to turn 1
  private launched = false;
  private launchUntil = Infinity;

  constructor(car: F1Car, level: AILevel, seed: number) {
    this.car = car;
    this.rng = makeRng((seed * 2654435761) & 0xffff);
    const base = AI.pace[level] ?? 0.96;
    this.paceMul = base - this.rng() * AI.paceSpread * 2 + AI.paceSpread;
    // AI pace maps to grip/power usage of their car
    car.paceMul = clamp(0.90 + this.paceMul * 0.105, 0.9, 1.0);
    // v10.1: 0.45 was too pro — bots spun in the esses and crawled out of
    // hairpins (solo autopilot averaged 24 m/s vs a 54 m/s profile). 0.65
    // keeps them quick but stable on the limit.
    car.assistLevel = 0.65;
    this.latUse = AI.latUse * (0.90 + this.rng() * 0.05);
    this.brakeUse = AI.brakeUse * (0.93 + this.rng() * 0.06);
  }

  update(dt: number, ctx: F1AIContext): F1Controls {
    const car = this.car;
    const { spline, line } = ctx;
    const speed = Math.abs(car.vLong);

    // ---- lap-to-lap pace noise (consistency modeling) ---------------------------
    const lap = car.lap;
    if (lap !== this.lastLapNoise) {
      this.lastLapNoise = lap;
      this.lapNoise = (this.rng() - 0.5) * 0.02;
    }

    // ---- where are we on the line? ------------------------------------------------
    const prog = ((car.progressS % 1) + 1) % 1;
    const idx = spline.indexAtS(prog);
    const N = line.count;

    // ---- target speed from the profile (pace + noise + mistakes) --------------------
    let vAllow = line.vTarget[idx] * (1 + this.lapNoise);
    // tire wear margin: the profile is computed for fresh tires; worn rubber
    // gets a proportional lift so the AI stops riding over its own grip
    vAllow *= 1 - 0.12 * car.tireWear;
    // look ahead for the slowest point within braking reach — the window
    // scales with SPEED²-ish (a 300 km/h braking zone needs ~180 m of vision).
    // The safety buffer shrinks with speed: a flat 30 m made the envelope BLIND
    // inside chicane complexes (apexes 30-50 m apart) — the AI arrived at the
    // second apex on the power and snapped the rear loose.
    const spacing = spline.length / N;
    const lookIdx = Math.min(N - 1, idx + Math.floor((10 + speed * 2.2) / spacing));
    const buf = clamp(speed * 0.35, 4, 30);
    for (let i = idx + 1; i <= lookIdx; i++) {
      const v = line.vTarget[i % N];
      if (v < vAllow) {
        // can we still brake for it? — the envelope uses ~62% of peak braking:
        // real decel during turn-in (tire sharing + trail brake) is far below
        // the straight-line peak, and arriving 10% slow beats arriving in the wall
        const dist = (i - idx) * spacing;
        const vBrake = Math.sqrt(v * v + 2 * this.brakeA(speed) * 0.62 * Math.max(0, dist - buf));
        if (vBrake < vAllow) vAllow = vBrake;
      }
    }
    vAllow *= this.brakeUse;

    // ---- rare mistakes --------------------------------------------------------------------
    this.mistakeCooldown -= dt;
    if (this.mistakeCooldown <= 0 && speed > 30 && this.rng() < 0.006) {
      const curvy = line.curv[idx] > 0.008;
      if (curvy) {
        this.mistakeT = 0.7 + this.rng() * 0.8;
        this.mistakeKind = this.rng() < 0.5 ? 0 : 1;
        this.mistakeCooldown = 14 + this.rng() * 22;
      }
    }
    if (this.mistakeT > 0) {
      this.mistakeT -= dt;
      if (this.mistakeKind === 0) vAllow *= 1.14;        // carrying too much — runs deep
      else vAllow *= 0.88;                               // over-slowed — scrubs the apex
    }

    // ---- launch discipline: first seconds are single-file ------------------------------
    if (!this.launched && ctx.racing) {
      this.launched = true;
      this.launchUntil = ctx.time + AI.launchHoldS * (0.8 + this.rng() * 0.5);
    }
    const launching = !this.launched || ctx.time < this.launchUntil;

    // braking zone ahead? (attack discipline — nobody divebombs into a corner)
    const spacingN = spline.length / N;
    const cornerIdx = (idx + Math.round((12 + speed * 1.6) / spacingN)) % N;
    const brakingZone = line.vTarget[cornerIdx] < speed - 6 || Math.abs(line.curv[cornerIdx]) > 0.006;

    // ---- traffic: ahead / alongside / behind, with LATERAL awareness --------------------
    let steerBias = 0;             // lateral offset (m) added to the line target
    const myTotal = ctx.totalM.get(car.id) ?? 0;
    const myRightX = Math.cos(car.yaw), myRightZ = -Math.sin(car.yaw);
    let nearestAhead: { car: F1Car; dist: number; lat: number } | null = null;
    let nearestChaser: { car: F1Car; dist: number; lat: number } | null = null;
    let alongside = 0;             // signed lateral of a car door-to-door with me
    for (const other of ctx.cars) {
      if (other === car) continue;
      const dxo = other.pos.x - car.pos.x, dzo = other.pos.z - car.pos.z;
      if (dxo * dxo + dzo * dzo > 90 * 90) continue;
      const d = (ctx.totalM.get(other.id) ?? 0) - myTotal;
      const lat = dxo * myRightX + dzo * myRightZ;    // + = other sits on my right
      if (other.finished) {
        // cool-down cruiser: its race totalM froze at the flag — use the
        // forward distance in MY frame instead (it's a moving chicane)
        const fwdX = Math.sin(car.yaw), fwdZ = Math.cos(car.yaw);
        const dFwd = dxo * fwdX + dzo * fwdZ;
        if (dFwd > 0 && dFwd < 60 && (!nearestAhead || dFwd < nearestAhead.dist)) {
          nearestAhead = { car: other, dist: dFwd, lat };
        }
        continue;
      }
      if (d > 0 && d < 90) {
        if (!nearestAhead || d < nearestAhead.dist) nearestAhead = { car: other, dist: d, lat };
      } else if (d < 0 && d > -25) {
        if (!nearestChaser || -d < nearestChaser.dist) nearestChaser = { car: other, dist: -d, lat };
      }
      if (Math.abs(d) < 7.5 && Math.abs(lat) < 3.0) alongside = lat;
    }
    const aheadSpeed = nearestAhead ? Math.abs(nearestAhead.car.vLong) : 0;
    // a slow car on the racing line (spun, recovering, cruising) is a moving
    // chicane: commit to the clear side and go AROUND it — queuing behind it
    // is how contact chains snowball
    const slowObstacle = !!nearestAhead && aheadSpeed < 15 && speed > 18 && nearestAhead.dist < 45;
    if (slowObstacle) {
      steerBias += (nearestAhead!.lat >= 0 ? -1 : 1) * 2.8;   // pass on the open side
    }

    // side-by-side spacing: never squeeze — drift away from a car on my flank
    if (alongside !== 0 && ctx.racing) {
      steerBias -= Math.sign(alongside) * Math.min(1.6, 3.2 - Math.abs(alongside) * 0.5);
    }

    // attack: only out of the launch window, at speed, on a straight, at a
    // car that is actually in my lane (a car 5 m to the side is not a wall)
    if (nearestAhead && !launching && !slowObstacle && ctx.racing && speed > 20
        && nearestAhead.dist > 5.5 && nearestAhead.dist < AI.overtakeGap
        && Math.abs(nearestAhead.lat) < 4.2 && !brakingZone) {
      const closing = speed - aheadSpeed;
      if (closing > -1 || nearestAhead.dist < 12) {
        if (this.overtakeUntil < ctx.time) {
          this.overtakeSide = (this.rng() < 0.5 ? -1 : 1);
          this.overtakeUntil = ctx.time + 2.4;
        }
        steerBias += this.overtakeSide * AI.avoidLat;
        if (nearestAhead.dist < 20) vAllow = Math.min(vAllow, aheadSpeed + 4);
      }
    }
    // queue behind a slower car — lane-gated (only if it truly blocks me).
    // The cushion opens with the gap (so the launch accordion isn't molasses)
    // BUT collapses the moment the car ahead starts braking: you never close
    // at 10+ m/s on brake discs — that's how fields get wiped out at T1.
    // In a braking/corner zone the lane gate WIDENS: a car 4 m to my side in
    // a hairpin queue is still an obstacle (lap-1 pileups came from fast
    // arrivals threading past a slow queue in the complex).
    // A slow obstacle is bypassed, not followed.
    if (nearestAhead && nearestAhead.dist < (brakingZone ? 16 : 14) && !slowObstacle
        && (nearestAhead.dist < 11 || Math.abs(nearestAhead.lat) < (brakingZone ? 6.0 : 3.4))) {
      let cushion = clamp((nearestAhead.dist - 4.5) * 1.1, 2.0, 12);
      if (nearestAhead.car.id === this.lastAheadId && aheadSpeed < this.lastAheadSpeed - 0.1) {
        cushion = Math.min(cushion, 3.2);   // it's braking — match it, don't ram it
      }
      this.lastAheadId = nearestAhead.car.id;
      this.lastAheadSpeed = aheadSpeed;
      vAllow = Math.min(vAllow, aheadSpeed + cushion);
    } else {
      this.lastAheadId = '';
    }

    // ---- defense: ONE move when a faster car sits in my wake ------------------------
    if (nearestChaser && ctx.racing && !launching && speed > 25) {
      const chaserClosing = Math.abs(nearestChaser.car.vLong) - speed;
      if (this.defendUntil > ctx.time) {
        steerBias += this.defendSide * 1.7;          // hold the move
      } else if (ctx.time > this.defendAgainAt
          && nearestChaser.dist < AI.defendGapM && chaserClosing > 0.8) {
        if (this.rng() < AI.defendBias) {
          this.defendSide = Math.sign(nearestChaser.lat) || 1;   // close their side
          this.defendUntil = ctx.time + 1.5;
          this.defendAgainAt = ctx.time + 5.5;
        } else {
          this.defendAgainAt = ctx.time + 3.0;       // chose not to — re-roll later
        }
      }
    }

    // ---- blue flags: about to be lapped → move off the line and lift ----------------
    if (ctx.racing) {
      const len = spline.length;
      for (const other of ctx.cars) {
        if (other === car || other.finished) continue;
        const dTotal = (ctx.totalM.get(other.id) ?? 0) - myTotal;
        if (dTotal <= len * 0.95) continue;                 // not a lap up on me
        const onTrack = ((dTotal % len) + len) % len;       // their arc vs mine
        const behind = (len - onTrack) % len;               // how far they trail on track
        if (behind < AI.blueFlagRoomM) {
          steerBias += (line.lat[idx] >= 0 ? -1 : 1) * 2.4;  // off the racing line
          if (behind < 18) vAllow *= 0.9;                   // don't fight the leader
          break;
        }
      }
    }

    // ---- steering: pure pursuit (curvature formulation — the stable one) ------
    // κ = 2·sin(α)/L_d → δ = atan(κ·wheelbase). Scales the correction with the
    // lookahead distance, so a 3 m grid offset commands a gentle arc instead
    // of full lock (the old yaw-error P-D saturated and fishtailed at launch).
    // Small floor (8 m) so a slow car re-aims fast instead of crawling wide
    // arcs after a mistake.
    const lookM = Math.max(8, AI.lookaheadNear + speed * 0.55);
    const li = (idx + Math.round(lookM / (spline.length / N))) % N;
    const sm = spline.samples[li];
    let latTarget = clamp(line.lat[li] + steerBias, -sm.halfWidth + 1.1, sm.halfWidth - 1.1);
    // corner traffic: within 24 m of a MOVING car ahead in a corner, take the
    // line they leave you (their wheeltracks) instead of the optimal apex —
    // two cars converging on one apex point is the classic nose-across-side
    // lap-1 contact
    if (nearestAhead && !slowObstacle && aheadSpeed > 8 && nearestAhead.dist < 24
        && Math.abs(line.curv[li]) > 0.0045) {
      const hint = car.ginfo ? car.ginfo.mainIdx : -1;
      const proj = spline.project(nearestAhead.car.pos, hint, 14);
      if (proj) latTarget = clamp(proj.lateral, -sm.halfWidth + 1.1, sm.halfWidth - 1.1);
    }
    const tx = sm.pos.x + sm.right.x * latTarget - car.pos.x;
    const tz = sm.pos.z + sm.right.z * latTarget - car.pos.z;
    const alpha = wrapAngle(Math.atan2(tx, tz) - car.yaw);
    const kappa = 2 * Math.sin(alpha) / Math.max(8, lookM);
    const delta = Math.atan(kappa * 3.6);                       // wheel angle (rad)
    const lockFrac = PHYS.steerSpeedFalloff + (1 - PHYS.steerSpeedFalloff)
      / (1 + Math.pow(speed / PHYS.steerSpeedRef, 2));
    let steer = clamp(-(delta / (PHYS.maxSteerAngle * lockFrac)) - car.yawRate * 0.10, -0.9, 0.9);

    // ---- slide recovery -----------------------------------------------------------------
    // when the rear steps out, pure pursuit is the wrong controller: the target
    // swings across the horizon as the car rotates, so it commands full lock
    // each way (tank-slapper) while the throttle keeps the rear lit. Instead:
    // point the wheels where the velocity is actually going (zero front slip —
    // the classic catch; the sign works itself out through the formula) and
    // get off the power. Hysteresis: enter >0.34, exit <0.16 — the catch must
    // be HELD through the opposite-way swing, not toggled.
    const slip = car.slipAngle;
    if (this.recoveringFlag) {
      if (Math.abs(slip) < 0.16 || speed <= 6) this.recoveringFlag = false;
    } else if (Math.abs(slip) > 0.34 && speed > 6) {
      this.recoveringFlag = true;
    }
    const recovering = this.recoveringFlag;
    if (recovering) {
      // scaled catch (~65% of alignment, capped) — a full-lock counter at
      // 100+ km/h is its own overcorrection and fed the swing both ways
      const vAngle = Math.atan2(car.vLat + car.yawRate * 1.62, Math.max(1, Math.abs(car.vLong)));
      steer = clamp(-vAngle * 0.65 / (PHYS.maxSteerAngle * lockFrac), -0.75, 0.75);
    }

    // ---- pedals ------------------------------------------------------------------------------
    const vErr = vAllow - speed;
    let throttle = 0, brake = 0;
    if (vErr > 0.5) throttle = clamp(vErr * 0.55, 0.1, 1);
    else if (vErr < -0.3) brake = clamp(-vErr * 0.8, 0, 1);
    // power vs steering: a driver never holds full power against loaded
    // steering (the friction ellipse spends grip on lateral). Smooth at any
    // speed — the old cut only acted below 30 m/s, so chicanes at 130 km/h
    // got 100% throttle mid-transition and snapped the rear loose.
    const steeringLoad = Math.abs(steer);
    if (steeringLoad > 0.3 && !recovering) throttle *= clamp(1 - steeringLoad * 0.28, 0.55, 1);
    // mid-slide: kill the power (the save matters more than the lap time);
    // a mild slip just trims it
    if (recovering) { throttle *= 0.15; brake = 0; }
    else if (Math.abs(car.slipAngle) > 0.26) throttle *= 0.55;

    // ---- DRS -------------------------------------------------------------------------------------
    const drs = car.drsEligible && speed > 34;

    return { throttle, brake, steer, drs, shiftUp: false, shiftDown: false, lookBack: false };
  }

  private brakeA(v: number): number {
    // conservative braking capability (AI doesn't use 100%)
    return this.latUse * (this.car.tireMu) * (9.81 + 0.5 * PHYS.airDensity * 4.2 * v * v / this.car.mass) * 0.92;
  }
}
