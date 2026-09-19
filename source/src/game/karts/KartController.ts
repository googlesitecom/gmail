/**
 * APEX KART — Arcade kart physics. THE feel module.
 *
 * Model: hybrid heading/slip-angle. `speed` is forward velocity magnitude,
 * `yaw` is body heading, `slip` is the angle the velocity vector lags the
 * body (negative = drifting outward). While drifting, slip grows and yaw
 * authority rises => wide slide + chargeable mini-turbo (blue/orange/purple).
 *
 * All tuning lives in core/Config.ts (PHYS).
 */

import * as THREE from 'three';
import { CharacterStats, KartControls } from '../core/Types';
import { PHYS, accelAt, steerAuthority } from '../core/Config';
import { clamp, damp } from '../core/MathUtils';
import { GroundInfo, HazardInstance, PadInstance } from '../tracks/TrackBuilder';

export interface StepWorld {
  groundQuery(p: THREE.Vector3, state: { mainIdx: number; pathIdx: number; ptIdx: number }): GroundInfo;
  pads: PadInstance[];
  hazards: HazardInstance[];
  /** battle arenas: radial wall; circuits: no-op */
  wallConstrain?(kart: KartController): void;
}

const UP = new THREE.Vector3(0, 1, 0);

export class KartController {
  readonly stats: CharacterStats;
  readonly isPlayer: boolean;
  readonly id: string;

  // --- transform & motion ------------------------------------------------
  pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;            // signed m/s along velocity heading
  slip = 0;             // velocity lags heading by this angle
  vy = 0;
  grounded = true;
  airborne = false;

  // --- ground cache ---------------------------------------------------------
  ginfo: GroundInfo | null = null;
  private mainIdx = -1;
  private pathIdx = -1;
  private ptIdx = -1;
  private voidTimer = 0;
  // smoothed road slope (exact source: spline tangent.y via GroundInfo.slope)
  // — fuels real launches off ramps & crests
  private groundSlope = 0;

  // --- drift ----------------------------------------------------------------
  driftActive = false;
  driftDir = 0;           // -1 left / 1 right
  driftCharge = 0;
  driftLevel = 0;
  private driftWasHeld = false;
  /** 1-frame signal: drift just kicked in on the ground (visual suspension pop) */
  driftKick = 0;

  // --- boosts ------------------------------------------------------------------
  boostTimer = 0;
  boostPower = 1;
  padCooldown = 0;
  slipCharge = 0;
  slipActive = 0;

  // --- coins (MK-style: up to 10, each adds top speed, lose 3 when hit) -------
  coins = 0;

  // --- air tricks (MK8-style: hop button mid-air -> stunt -> landing boost) ---
  airTime = 0;
  trickT = 0;             // 0 = no trick running; seconds since trick started
  trickKind = 0;          // 0 front-flip, 1 roll left, 2 roll right
  /** one-shot landing signal consumed by Game (0 = none, else boost strength) */
  trickLanded = 0;
  trickSpin = 0;          // normalized 0..1 rotation progress for the visual

  // --- glider / parachute (MK-style: long falls open the canopy) -------------
  gliderActive = false;
  gliderDeploy = 0;       // 0..1 canopy open animation
  /** one-shot signal consumed by Game (announcer + SFX) */
  gliderOpened = 0;

  // --- status ----------------------------------------------------------------------
  spinT = 0;
  shrinkT = 0;
  starT = 0;
  aegisT = 0;
  invulnT = 0;
  squishT = 0;
  requestRespawn = false;
  finished = false;
  /** post-crash wobble: yaw shake while the driver recovers the line */
  wobbleT = 0;
  /** wall impact intensity this frame (0..1, set by wallConstrain, read by FX) */
  wallHit = 0;

  // --- items ---------------------------------------------------------------------------
  itemSlot: string | null = null;
  itemCharges = 0;
  /** second slot from golden double boxes (150cc+) */
  itemSlot2: string | null = null;
  itemCharges2 = 0;
  rouletteUntil = 0;
  rouletteUntil2 = 0;
  /** MK-style: the item trails behind the kart as a rear shield while the
   *  item button is held (set at roulette resolve / by AI tactic). */
  itemHeldOut = false;
  orbitShield = 0;         // remaining orbital blockers
  orbitAngle = 0;

  // --- misc ----------------------------------------------------------------------------
  ccScale = 1;
  /** online: driven by a RemoteDriver (owner client is the authority) */
  remoteDriven = false;
  lap = 0;
  sector = -1;
  progressS = 0;
  rank = 1;
  battleHp = 3;
  battleTeam = 0;
  battleKo = false;
  battleRespawnAt = 0;
  /** seconds spent continuously clamped against the guardrail (rail-grind detector) */
  railGrindT = 0;
  /** current surface grip multiplier from hazard zones (ice/mud) — 1 = full grip */
  zoneGripNow = 1;

  constructor(stats: CharacterStats, isPlayer: boolean, id: string) {
    this.stats = stats;
    this.isPlayer = isPlayer;
    this.id = id;
  }

  // ------------------------------------------------------------------ getters

  get baseVmax(): number { return this.stats.topSpeed * this.ccScale; }

  get vmax(): number {
    let v = this.baseVmax;
    v *= 1 + this.coins * PHYS.coinSpeedBonus;
    if (this.shrinkT > 0) v *= PHYS.shrinkSpeedFactor;
    if (this.starT > 0) v *= PHYS.starSpeedFactor;
    if (this.boostTimer > 0) v *= this.boostPower;
    if (this.slipActive > 0) v *= PHYS.slipstreamPower;
    if (this.ginfo && this.ginfo.roughness > 1.2 && this.boostTimer <= 0 && this.starT <= 0) {
      v *= PHYS.offroadMaxFactor;
    }
    return v;
  }

  get speedRatio(): number { return clamp(Math.abs(this.speed) / this.baseVmax, 0, 1.4); }
  get boosting(): boolean { return this.boostTimer > 0 || this.slipActive > 0; }
  get invincible(): boolean { return this.starT > 0 || this.aegisT > 0 || this.invulnT > 0; }
  get drifting(): boolean { return this.driftActive; }
  get speedKmh(): number { return Math.abs(this.speed) * 3.6; }

  forward(): THREE.Vector3 { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  velocityDir(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw - this.slip), 0, Math.cos(this.yaw - this.slip));
  }

  // ------------------------------------------------------------------ mutators

  applyBoost(time: number, power: number): void {
    this.boostTimer = Math.max(this.boostTimer, time);
    this.boostPower = Math.max(this.boostPower, power);
  }

  spinOut(): boolean {
    if (this.invincible || this.spinT > 0) return false;
    this.spinT = PHYS.spinTime * (this.stats.spinResist ?? 1);
    this.loseCoins(PHYS.coinsLostOnHit);
    // post-spin immunity covers the WHOLE spin (0.9 s let items/hazards
    // re-spin karts the instant they recovered — perpetual donut packs)
    this.invulnT = Math.max(this.invulnT, PHYS.spinTime + 0.4);
    this.endDrift(false);
    this.closeGlider();
    this.speed *= 0.5;
    this.slip = 0;
    this.wobbleT = 0;
    return true;
  }

  closeGlider(): void {
    this.gliderActive = false;
    this.gliderDeploy = 0;
  }

  /** Hard-contact wobble: the kart keeps rolling but shakes and scrubs speed. */
  wobble(power = 1): boolean {
    if (this.invincible || this.spinT > 0 || this.wobbleT > 0.3) return false;
    this.wobbleT = PHYS.wobbleTime * (0.7 + 0.3 * power);
    this.speed *= 1 - 0.22 * power;
    this.endDrift(false);
    return true;
  }

  shrinkNow(): boolean {
    if (this.starT > 0 || this.aegisT > 0) return false;
    this.shrinkT = PHYS.shrinkTime;
    return true;
  }

  growBack(): void { this.shrinkT = 0; }

  /** Gain one coin (false = already at max). */
  addCoin(): boolean {
    if (this.coins >= PHYS.coinMax) return false;
    this.coins++;
    return true;
  }

  loseCoins(n: number): number {
    const lost = Math.min(this.coins, n);
    this.coins -= lost;
    return lost;
  }

  endDrift(giveBoost: boolean): void {
    if (giveBoost && this.driftLevel > 0) {
      const mt = PHYS.miniTurbo[Math.min(this.driftLevel, 3) - 1];
      this.applyBoost(mt.time, mt.power);
    }
    this.driftActive = false;
    this.driftCharge = 0;
    this.driftLevel = 0;
  }

  respawnAt(point: THREE.Vector3, yaw: number): void {
    this.pos.copy(point);
    this.pos.y += 0.5;
    this.yaw = yaw;
    this.speed = 0; this.slip = 0; this.vy = 0;
    this.grounded = true; this.requestRespawn = false;
    this.endDrift(false);
    this.closeGlider();
    this.trickT = 0; this.trickSpin = 0; this.airTime = 0;
    this.invulnT = PHYS.invulnAfterRespawn;
    this.spinT = 0;
    this.mainIdx = -1; this.pathIdx = -1; this.ptIdx = -1;
    this.voidTimer = 0;
    this.groundSlope = 0;
  }

  // ------------------------------------------------------------------ the step

  step(dt: number, world: StepWorld, karts: KartController[], controls: KartControls, racing: boolean): void {
    // 1. ground ---------------------------------------------------------------
    this.ginfo = world.groundQuery(this.pos, { mainIdx: this.mainIdx, pathIdx: this.pathIdx, ptIdx: this.ptIdx });
    this.mainIdx = this.ginfo.mainIdx;
    this.pathIdx = this.ginfo.pathIdx;
    this.ptIdx = this.ginfo.ptIdx;
    this.progressS = this.ginfo.s;

    // 2. timers -----------------------------------------------------------------
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    if (this.boostTimer <= 0) this.boostPower = 1;
    this.slipActive = Math.max(0, this.slipActive - dt);
    this.starT = Math.max(0, this.starT - dt);
    this.aegisT = Math.max(0, this.aegisT - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.shrinkT = Math.max(0, this.shrinkT - dt);
    this.spinT = Math.max(0, this.spinT - dt);
    this.wobbleT = Math.max(0, this.wobbleT - dt);
    this.wallHit = Math.max(0, this.wallHit - dt * 6);
    this.padCooldown = Math.max(0, this.padCooldown - dt);
    this.orbitAngle += dt * 3.4;

    // 3. zone effects (ice/mud/lava/belt) ------------------------------------------
    let zoneGrip = 1, zoneSpeed = 1, zoneBoost = 1;
    for (const h of world.hazards) {
      if (h.def.kind !== 'zone' || !h.active) continue;
      const dx = this.pos.x - h.pos.x, dz = this.pos.z - h.pos.z;
      if (dx * dx + dz * dz < h.radius * h.radius) {
        const p = h.def.power ?? 0.7;
        if (h.def.effect === 'grip') zoneGrip *= p;
        else if (h.def.effect === 'slow') zoneSpeed *= p;
        else if (h.def.effect === 'boost') zoneBoost = Math.max(zoneBoost, p);
      }
    }
    this.zoneGripNow = zoneGrip;

    // 4. control lockouts -----------------------------------------------------------
    const spinning = this.spinT > 0;
    let throttle = spinning ? 0 : controls.throttle;
    let brake = spinning ? 0 : controls.brake;
    let steer = spinning ? 0 : controls.steer;
    const driftHeld = !spinning && controls.drift && racing;
    if (!racing) { throttle = 0; brake = 0; steer = 0; }

    // spin animation (two full turns)
    if (spinning) this.yaw += dt * (Math.PI * 4 / PHYS.spinTime);

    // post-crash wobble: decaying yaw shake — the driver wrestles the wheel
    if (this.wobbleT > 0) {
      const k = this.wobbleT / PHYS.wobbleTime;
      this.yaw += Math.sin(this.wobbleT * 34) * PHYS.wobbleStrength * k * dt * 6;
    }

    // 5. drift state machine + air tricks + glider ------------------------------
    const canDrift = this.grounded && this.speed > PHYS.driftEnterSpeed;
    const driftPressed = driftHeld && !this.driftWasHeld;
    this.driftWasHeld = driftHeld;
    this.driftKick = Math.max(0, this.driftKick - dt * 8);

    // air trick: the drift button pressed mid-air (after a small minimum
    // airtime so liftoff doesn't count) starts a stunt; landing a finished
    // stunt pays a boost. Steer picks the stunt: left/right = barrel roll,
    // neutral = flip.
    if (!this.grounded) this.airTime += dt; else this.airTime = 0;
    if (driftPressed && !this.grounded && this.airTime > PHYS.trickMinAir
        && this.trickT === 0 && !spinning && !this.gliderActive) {
      this.trickT = 0.0001;
      this.trickKind = steer < -0.3 ? 1 : steer > 0.3 ? 2 : 0;
    }
    if (this.trickT > 0) {
      this.trickT += dt;
      this.trickSpin = Math.min(1, this.trickT / PHYS.trickDuration);
      if (this.trickT > PHYS.trickDuration * 2) { // safety net (fell long)
        this.trickT = 0; this.trickSpin = 0;
      }
    }

    // GROUND DRIFT: the drift button engages the slide instantly — a party
    // racer slide, NOT a jump (hops felt like bunny-hopping; MK8-style hop
    // entry removed on purpose). Direction follows the current steer.
    if (driftPressed && canDrift && !spinning) {
      this.driftActive = true;
      this.driftDir = Math.abs(steer) > 0.15 ? Math.sign(steer) : (this.driftDir || 1);
      this.driftCharge = 0;
      this.driftLevel = 0;
      this.driftKick = 1;
    }

    // GLIDER: airborne, falling fast and still high above the road → the
    // canopy pops open (MK7/8 glide sections). Descent slows to a gentle
    // float so big ramps become soaring lines instead of dead drops.
    if (!this.grounded && !this.gliderActive && !spinning
        && (this.trickT === 0 || this.trickSpin >= 1)
        && this.vy < PHYS.gliderDeployVy) {
      const gi = this.ginfo;
      const above = gi && gi.hasGround ? this.pos.y - gi.height : Infinity;
      if (above > PHYS.gliderMinHeight) {
        this.gliderActive = true;
        this.gliderDeploy = 0.0001;
        this.gliderOpened = 1;
        this.vy = Math.max(this.vy, PHYS.gliderFallCap * 0.55); // canopy snatch
      }
    }
    if (this.gliderActive) {
      this.gliderDeploy = Math.min(1, this.gliderDeploy + dt / PHYS.gliderOpenTime);
    }
    if (this.driftActive) {
      if (!driftHeld || this.speed < 7 || spinning) {
        this.endDrift(!spinning); // release => mini-turbo by level
      } else {
        // charge faster when steering INTO the drift (feather racers charge quicker)
        const into = clamp(steer * this.driftDir, 0, 1);
        this.driftCharge += dt * (0.8 + 0.7 * into) * (this.stats.driftChargeMul ?? 1);
        const times = PHYS.driftChargeTime;
        this.driftLevel = this.driftCharge > times[2] ? 3 : this.driftCharge > times[1] ? 2 : this.driftCharge > times[0] ? 1 : 0;
      }
    }

    // 6. engine / brakes ------------------------------------------------------------------
    const effVmax = this.vmax * zoneSpeed * zoneBoost;
    if (this.boostTimer > 0 || this.slipActive > 0) {
      // boosted: hard pull toward target speed
      const target = effVmax;
      this.speed = damp(this.speed, target * Math.sign(this.speed || 1), PHYS.boostAccel / 8, dt);
      if (this.speed < target) this.speed += PHYS.boostAccel * dt;
    } else if (throttle > 0.05) {
      const a = accelAt(Math.abs(this.speed), effVmax, this.stats.acceleration) * throttle;
      this.speed += a * dt;
      if (this.speed > effVmax) this.speed = damp(this.speed, effVmax, 4, dt);
    } else if (brake > 0.05) {
      if (this.speed > 0.4) this.speed -= PHYS.brakeDecel * brake * dt;
      else this.speed = Math.max(this.speed - 8 * brake * dt, -PHYS.reverseMax); // reverse
    } else {
      this.speed *= Math.exp(-PHYS.coastDrag * dt);
      if (Math.abs(this.speed) < 0.15) this.speed = 0;
    }

    // offroad extra drag (shortcuts stay rough but drivable; medium class plows)
    if (this.ginfo && this.ginfo.roughness > 1.2 && this.boostTimer <= 0 && this.starT <= 0 && this.grounded) {
      this.speed *= Math.exp(-PHYS.offroadDrag * (this.ginfo.roughness - 1) * 0.5 * (this.stats.offroadMul ?? 1) * dt);
    }

    // 7. steering ------------------------------------------------------------------------------
    const airAuth = this.gliderActive ? PHYS.gliderSteer : 0.55;
    const authority = steerAuthority(Math.abs(this.speed)) * this.stats.handling
      * (this.grounded ? 1 : airAuth) * (zoneGrip < 1 ? 0.75 + zoneGrip * 0.25 : 1);
    if (this.driftActive) {
      // driftDir bias + steer modulation: steer with slide = tighter, against = wider
      // NOTE steering sign: positive steer = clockwise on screen = yaw DECREASES
      // (forward is (sin yaw, cos yaw); with the chase camera behind, +X is
      // screen-left, so a positive steer must integrate yaw negatively).
      const modulation = 0.62 + 0.38 * clamp(steer * this.driftDir, -1, 1);
      const yawRate = -this.driftDir * modulation * PHYS.maxYawRate * PHYS.driftYawBoost * authority;
      this.yaw += yawRate * dt;
      // slip grows toward the outside
      const maxSlip = 0.5 * (1.25 - this.stats.grip * 0.22);
      this.slip = damp(this.slip, -this.driftDir * maxSlip, 2.2, dt);
    } else {
      const yawRate = -steer * PHYS.maxYawRate * authority;
      this.yaw += yawRate * dt;
      this.slip = damp(this.slip, 0, 9 * this.stats.grip * (zoneGrip < 1 ? zoneGrip : 1), dt);
    }

    // 8. integrate position ----------------------------------------------------------------------
    const dir = this.yaw - this.slip;
    this.pos.x += Math.sin(dir) * this.speed * dt;
    this.pos.z += Math.cos(dir) * this.speed * dt;

    // 9. vertical -----------------------------------------------------------------------------------
    const g = this.ginfo;
    if (this.grounded) {
      if (!g || !g.hasGround) {
        this.grounded = false;
        // LAUNCH: authored gaps get a fixed 0.20 speed ratio — deterministic
        // flights that clear every catalogued gap with margin (the engine
        // bakes matching ramps for the visual read). Crests & ledges still
        // convert their measured climb slope into a softer hop.
        const launchVy = g && g.onJump
          ? 0.20 * Math.abs(this.speed)
          : clamp(this.groundSlope, 0, 0.35) * Math.abs(this.speed);
        this.vy = Math.max(this.vy, launchVy);
        // Leaving the ground ends any active slide (MK rule) — but a charged
        // drift pays off: ramp-launch mini-turbos feel great.
        if (this.driftActive) this.endDrift(true);
      } else {
        // follow the surface (also handles driving up ramps); snappy enough
        // to stay glued to 0.22 launch ramps at full speed. The detach
        // threshold widens on climbs to absorb projection lag (the projected
        // sample can sit ~1 sample behind on steep ramps — that is NOT a
        // ledge, and detaching there caused grounded-flag flicker).
        const targetY = g.height;
        const detachAt = 0.6 + Math.max(0, this.groundSlope) * 2.2;
        if (this.pos.y > targetY + detachAt) {
          this.grounded = false; // drove off a ledge / crest drop
        } else {
          this.pos.y = damp(this.pos.y, targetY, 24, dt);
          this.vy = 0;
        }
      }
    }
    if (!this.grounded) {
      if (this.gliderActive) {
        // canopy descent: soft gravity + terminal glide speed
        this.vy = Math.max(this.vy + PHYS.gravity * PHYS.gliderGravityMul * dt, PHYS.gliderFallCap);
      } else {
        this.vy += PHYS.gravity * dt;
      }
      this.pos.y += this.vy * dt;
      // touchdown: only from just above the surface (never snap a kart up
      // from meters below — that used to teleport karts onto the road)
      if (g && g.hasGround && this.vy <= 0 &&
          this.pos.y <= g.height + PHYS.groundSnap && this.pos.y >= g.height - 3) {
        this.pos.y = g.height;
        this.vy = 0;
        this.grounded = true;
        if (this.gliderActive) {
          // canopy landing: soft touchdown + keep momentum (glide reward)
          this.closeGlider();
          if (this.speed > 14) this.applyBoost(0.5, 1.14);
        }
        if (this.speed > 12) this.suspensionLand = Math.min(1.5, this.speed * 0.03);
        else this.suspensionLand = 0;
        // stunt landing: a completed trick pays a boost (MK8 style — lenient
        // window: the stunt just needs to be well underway)
        if (this.trickT > 0) {
          if (this.trickT >= PHYS.trickDuration * 0.4 && !spinning) {
            this.applyBoost(PHYS.trickBoostTime, PHYS.trickBoostPower);
            this.trickLanded = 1;
          }
          this.trickT = 0;
          this.trickSpin = 0;
        }
      }
    }
    this.airborne = !this.grounded;

    // track the surface slope under us — EXACT (spline tangent), smoothed
    // lightly for launch stability. Read BEFORE it zeroes on the transition
    // frame, so the ramp slope converts into launch velocity.
    if (g && g.hasGround) {
      this.groundSlope = damp(this.groundSlope, g.slope, 30, dt);
    } else {
      this.groundSlope = 0;
    }

    // fell into the void?
    if (g && (!g.hasGround || this.pos.y < g.height - 30)) {
      this.voidTimer += dt;
      if (this.pos.y < (g.height - 26) || this.voidTimer > 2.2) this.requestRespawn = true;
    } else {
      this.voidTimer = 0;
    }

    // 10. boost pads ----------------------------------------------------------------------------
    if (this.grounded && this.padCooldown <= 0) {
      for (const pad of world.pads) {
        const dx = this.pos.x - pad.pos.x, dz = this.pos.z - pad.pos.z;
        if (dx * dx + dz * dz < 6.8) {
          this.applyBoost(PHYS.boostPadTime * (zoneBoost > 1 ? 1.25 : 1), PHYS.boostPadPower);
          this.padCooldown = 0.8;
          break;
        }
      }
    }

    // 11. solid hazards (movers, fallers near ground, gates) -----------------------------------------
    for (const h of world.hazards) {
      if (h.def.kind === 'zone' || !h.active) continue;
      const dx = this.pos.x - h.pos.x, dz = this.pos.z - h.pos.z;
      const rr = h.radius + 1.0;
      if (dx * dx + dz * dz < rr * rr && Math.abs(this.pos.y - h.pos.y) < 2.6) {
        if (h.def.kind === 'gate') {
          // bounce back off the gate wall
          this.speed = -Math.abs(this.speed) * 0.25;
          this.pos.x -= Math.sin(this.yaw) * 0.6;
          this.pos.z -= Math.cos(this.yaw) * 0.6;
        } else if (!this.invincible) {
          this.spinOut();
          this.pos.x += dx * 0.04; this.pos.z += dz * 0.04;
        }
      }
    }

    // 12. slipstream --------------------------------------------------------------------------------------
    if (racing && this.grounded && this.spinT <= 0) {
      let inSlip = false;
      const myDir = this.velocityDir();
      for (const other of karts) {
        if (other === this || other.battleKo || other.finished) continue;
        const to = other.pos.clone().sub(this.pos);
        const d = to.length();
        if (d > PHYS.slipstreamRange || d < 1.5) continue;
        to.normalize();
        if (to.dot(myDir) > PHYS.slipstreamCone && other.speed > 10) { inSlip = true; break; }
      }
      if (inSlip) {
        this.slipCharge += dt * (this.stats.slipMul ?? 1);
        if (this.slipCharge >= PHYS.slipstreamTime) {
          this.slipActive = 0.9;
          this.slipCharge = 0;
        }
      } else {
        this.slipCharge = Math.max(0, this.slipCharge - dt * 2);
      }
    }

    // 13. arena walls ---------------------------------------------------------------------------------------
    world.wallConstrain?.(this);
  }

  /** visual landing squash intensity consumed by Game for KartVisual.land() */
  suspensionLand = 0;
}
