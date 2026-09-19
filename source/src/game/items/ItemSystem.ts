/**
 * APEX KART — Item runtime: roulettes, orbiting shields, projectiles,
 * traps, global effects and their 3D representations.
 * The system is world-agnostic: works on circuits and battle arenas.
 */

import * as THREE from 'three';
import { ItemId, KartControls } from '../core/Types';
import { KartController, StepWorld } from '../karts/KartController';
import { ITEMS, PHYS } from '../core/Config';
import { clamp } from '../core/MathUtils';
import { ITEM_MAP, rollItem } from './ItemData';
import { mat } from '../tracks/Decorations';

type ProjKind = 'dart' | 'seeker' | 'hunter' | 'magnet';

interface Projectile {
  kind: ProjKind;
  mesh: THREE.Object3D;
  owner: KartController;
  target: KartController | null;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  s?: number;            // hunter: track progress
  life: number;
  speed: number;
  active: boolean;
  replica: boolean;      // net: spawned from a peer event — only hits LOCAL karts
}

interface TrapEntity {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  owner: KartController;
  life: number;
  kind: 'goo' | 'mine';
  armed: number;         // ignore owner for this long
  active: boolean;
  replica: boolean;
  s: number;             // track s (0..1) at drop — AI dodge without projection
  lat: number;           // lateral offset (m) at drop
}

export interface ItemEvent {
  type: 'fire' | 'hit' | 'shield' | 'steal' | 'storm' | 'roulette' | 'box' | 'nethit';
  kartId: string;
  itemId?: ItemId;
  ownerId?: string;      // who fired the thing that hit (net broadcast)
  targetId?: string;     // 'steal'/'nethit': the affected kart
  text?: string;
  /** hit-family visual signature: 'zap' | 'seeker' | 'blast' | 'goo' | 'storm' */
  fx?: string;
}

export class ItemSystem {
  readonly group = new THREE.Group();
  /** battle mode: storm/magnet only affect the enemy team */
  teamMode = false;
  /** online: replica projectiles/traps only collide with karts in this set */
  netMode = false;
  localKartIds: Set<string> | null = null;
  /** last useItem() `behind` flag (net broadcast reads it after the fire event) */
  lastFireBehind = false;
  /** consulted when a roulette resolves: should the item start HELD behind the kart? */
  holdIntent: ((kart: KartController) => boolean) | null = null;
  private projectiles: Projectile[] = [];
  private traps: TrapEntity[] = [];
  private orbiters = new Map<string, THREE.Object3D[]>(); // kartId -> shield meshes
  private heldMeshes = new Map<string, { mesh: THREE.Object3D; itemId: string }>();
  private rng: () => number;
  private world: StepWorld & { spline?: import('../tracks/Spline').Spline };
  private karts: KartController[];
  onEvent: ((e: ItemEvent) => void) | null = null;

  constructor(world: StepWorld & { spline?: import('../tracks/Spline').Spline }, karts: KartController[], seed = 9001) {
    this.world = world;
    this.karts = karts;
    let a = seed >>> 0;
    this.rng = () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** QA: live projectile/trap counts. */
  get activeProjectiles(): number { return this.projectiles.length; }
  get activeTraps(): number { return this.traps.length; }
  /** live goo/mines in track coordinates — consumed by the AI to dodge */
  get trapHazards(): { s: number; lat: number; ownerId: string }[] {
    return this.traps.filter(tr => tr.active).map(tr => ({ s: tr.s, lat: tr.lat, ownerId: tr.owner.id }));
  }

  // -------------------------------------------------------------- roulette

  /** Box picked up: start the HUD roulette if the slot is free.
   *  Golden double boxes also roll a second item into the spare slot. */
  giveRoulette(kart: KartController, double = false): boolean {
    if (kart.itemSlot) return false;
    kart.rouletteUntil = performance.now() + ITEMS.rouletteTimeMs;
    if (double && !kart.itemSlot2) {
      kart.rouletteUntil2 = kart.rouletteUntil + 160;   // second roll lands just after
    }
    this.onEvent?.({ type: 'roulette', kartId: kart.id });
    return true;
  }

  /** Resolves pending roulettes into actual items. */
  updateRoulettes(): void {
    const now = performance.now();
    for (const k of this.karts) {
      if (k.rouletteUntil > 0 && now >= k.rouletteUntil) {
        k.rouletteUntil = 0;
        // battle has no live ranking — use the balanced mid-pack table
        const rank = this.teamMode ? 6 : Math.max(0, k.rank - 1);
        const item = rollItem(rank, this.rng);
        k.itemSlot = item;
        k.itemCharges = item === 'triple_dart' ? 3 : item === 'turbo_stack' ? 3 : 1;
        // MK-style: holding the item button while the roulette resolves keeps
        // the item trailing behind the kart as a rear shield
        if (k.itemSlot && this.holdIntent?.(k)) k.itemHeldOut = true;
      }
      if (k.rouletteUntil2 > 0 && now >= k.rouletteUntil2) {
        k.rouletteUntil2 = 0;
        const rank = this.teamMode ? 6 : Math.max(0, k.rank - 1);
        const item2 = rollItem(rank, this.rng);
        if (!k.itemSlot2) {
          k.itemSlot2 = item2;
          k.itemCharges2 = item2 === 'triple_dart' ? 3 : item2 === 'turbo_stack' ? 3 : 1;
        }
      }
    }
  }

  // -------------------------------------------------------------- use item

  /**
   * Fire/use the kart's item.
   * `behind` = throw traps backwards or shoot rearwards (look-back held).
   */
  useItem(kart: KartController, behind: boolean): boolean {
    const id = kart.itemSlot as ItemId | null;
    if (!id || kart.rouletteUntil > 0 || kart.spinT > 0) return false;
    const def = ITEM_MAP[id];
    this.lastFireBehind = behind;
    kart.itemHeldOut = false;

    switch (id) {
      case 'photon_dart':
        this.spawnDart(kart, behind);
        break;
      case 'seeker_orb':
        this.spawnSeeker(kart);
        break;
      case 'triple_dart':
        this.spawnDart(kart, behind);
        break;
      case 'goo_trap':
        this.dropTrap(kart, 'goo', behind);
        break;
      case 'rear_mine':
        this.dropTrap(kart, 'mine', true);
        break;
      case 'turbo_cell':
        kart.applyBoost(1.3, 1.45);
        break;
      case 'turbo_stack':
        kart.applyBoost(1.3, 1.5);
        break;
      case 'star_core':
        kart.starT = PHYS.starTime;
        break;
      case 'orbit_shield':
        kart.orbitShield = ITEMS.orbitBlocks;
        break;
      case 'aegis_star':
        kart.aegisT = PHYS.aegisTime;
        break;
      case 'storm_chip':
        this.stormBlast(kart);
        break;
      case 'track_hunter':
        this.spawnHunter(kart);
        break;
      case 'magnet_drone':
        this.spawnMagnet(kart);
        break;
    }

    kart.itemCharges -= 1;
    if (kart.itemCharges <= 0) {
      // golden-box flow: the spare slot slides into the main slot
      if (kart.itemSlot2) {
        kart.itemSlot = kart.itemSlot2 as ItemId;
        kart.itemCharges = kart.itemCharges2;
        kart.itemSlot2 = null;
        kart.itemCharges2 = 0;
      } else {
        kart.itemSlot = null;
        kart.itemCharges = 0;
      }
    }
    this.onEvent?.({ type: 'fire', kartId: kart.id, itemId: id, text: def.name });
    return true;
  }

  // -------------------------------------------------------------- spawns

  private kartAhead(owner: KartController): KartController | null {
    if (this.teamMode) {
      // nearest enemy kart
      let best: KartController | null = null;
      let bestD = Infinity;
      for (const k of this.karts) {
        if (k === owner || k.battleKo || k.battleTeam === owner.battleTeam) continue;
        const d = k.pos.distanceToSquared(owner.pos);
        if (d < bestD) { bestD = d; best = k; }
      }
      return best;
    }
    // race: kart with rank == owner.rank - 1
    const target = this.karts.find(k => k !== owner && k.rank === owner.rank - 1 && !k.battleKo);
    return target ?? null;
  }

  private spawnDart(owner: KartController, behind: boolean, replica = false): void {
    const dir = behind ? owner.forward().negate() : owner.forward();
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 4, 8), mat(0x35e0ff, { emissive: 0x1188aa }));
    body.rotation.x = Math.PI / 2;
    mesh.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 8), mat(0xffffff, { emissive: 0x668899 }));
    nose.rotation.x = Math.PI / 2; nose.position.z = 0.6;
    mesh.add(nose);
    mesh.position.copy(owner.pos).addScaledVector(dir, 1.6).add(new THREE.Vector3(0, 0.8, 0));
    mesh.lookAt(mesh.position.clone().add(dir));
    this.group.add(mesh);
    this.projectiles.push({
      kind: 'dart', mesh, owner, target: null,
      pos: mesh.position.clone(), vel: dir.clone().multiplyScalar(ITEMS.projectileSpeed),
      life: 5, speed: ITEMS.projectileSpeed, active: true, replica,
    });
  }

  private spawnSeeker(owner: KartController, replica = false): void {
    const target = this.kartAhead(owner);
    const mesh = new THREE.Group();
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), mat(0xff5ad8, { emissive: 0x881155 }));
    mesh.add(orb);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.07, 6, 14), mat(0xffffff, { emissive: 0x886688 }));
    mesh.add(ring);
    mesh.position.copy(owner.pos).addScaledVector(owner.forward(), 1.6).add(new THREE.Vector3(0, 1.0, 0));
    this.group.add(mesh);
    this.projectiles.push({
      kind: 'seeker', mesh, owner, target,
      pos: mesh.position.clone(), vel: owner.forward().clone().multiplyScalar(30),
      life: 8, speed: 34, active: true, replica,
    });
  }

  private spawnHunter(owner: KartController, replica = false): void {
    const target = this.kartAhead(owner);
    const mesh = new THREE.Group();
    const rocket = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 8), mat(0xff7a2a, { emissive: 0x883300 }));
    rocket.rotation.x = Math.PI / 2;
    mesh.add(rocket);
    const fin1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.4), mat(0xe84a3a));
    fin1.position.set(0, 0.25, -0.5); mesh.add(fin1);
    const fin2 = fin1.clone(); fin2.rotation.z = Math.PI / 2; mesh.add(fin2);
    // spawn behind the owner, on the track
    const sStart = owner.progressS;
    const sm = this.world.spline?.sampleAt(sStart);
    mesh.position.copy(sm ? sm.pos.clone().add(new THREE.Vector3(0, 0.8, 0)) : owner.pos.clone());
    this.group.add(mesh);
    this.projectiles.push({
      kind: 'hunter', mesh, owner, target,
      pos: mesh.position.clone(), vel: new THREE.Vector3(),
      s: owner.progressS, life: 12, speed: ITEMS.hunterSpeed, active: true, replica,
    });
  }

  private spawnMagnet(owner: KartController, replica = false): void {
    const target = this.kartAhead(owner);
    const mesh = new THREE.Group();
    const horseshoe = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.14, 6, 10, Math.PI), mat(0xd8d84a));
    mesh.add(horseshoe);
    const drone = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), mat(0x444450));
    drone.position.y = 0.5; mesh.add(drone);
    mesh.position.copy(owner.pos).add(new THREE.Vector3(0, 2.2, 0));
    this.group.add(mesh);
    this.projectiles.push({
      kind: 'magnet', mesh, owner, target,
      pos: mesh.position.clone(), vel: new THREE.Vector3(),
      life: 6, speed: ITEMS.magnetSpeed, active: true, replica,
    });
  }

  private dropTrap(owner: KartController, kind: 'goo' | 'mine', behind: boolean, replica = false): void {
    const dir = behind ? owner.forward().negate() : owner.forward();
    const mesh = kind === 'goo'
      ? new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.22, 10), mat(0x8a4ae8, { emissive: 0x221144 }))
      : (() => {
        const g = new THREE.Group();
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), mat(0x222228));
        g.add(ball);
        const blink = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), mat(0xff4422, { emissive: 0xaa1100 }));
        blink.position.y = 0.45; g.add(blink);
        return g;
      })();
    const dropDist = kind === 'goo' ? (behind ? -2.2 : 2.6) : -3.4;
    const pos = owner.pos.clone().addScaledVector(dir, Math.abs(dropDist));
    pos.y += 0.12;
    mesh.position.copy(pos);
    this.group.add(mesh);
    // track-relative placement for AI dodging (drop offset along the road)
    const spLen = this.world.spline?.length ?? 1000;
    const dropS = (owner.progressS ?? 0) + dropDist / spLen;
    this.traps.push({
      mesh, pos, owner, kind,
      life: kind === 'goo' ? ITEMS.trapLife : ITEMS.mineLife,
      armed: 0.6, active: true, replica,
      s: dropS - Math.floor(dropS),
      lat: owner.ginfo?.lateral ?? 0,
    });
  }

  // -------------------------------------------------------------- net replication

  /**
   * Net: a peer fired an item — replicate it from the peer's puppet pose so
   * the visuals + local-kart collisions match the owner's simulation.
   * Replica projectiles only ever hit LOCAL karts (each client owns its fate);
   * hits on remote victims are broadcast by the firing client instead.
   */
  netUseItem(owner: KartController, itemId: ItemId, behind: boolean): void {
    switch (itemId) {
      case 'photon_dart':
      case 'triple_dart':
        this.spawnDart(owner, behind, true);
        break;
      case 'seeker_orb':
        this.spawnSeeker(owner, true);
        break;
      case 'goo_trap':
        this.dropTrap(owner, 'goo', behind, true);
        break;
      case 'rear_mine':
        this.dropTrap(owner, 'mine', true, true);
        break;
      case 'track_hunter':
        this.spawnHunter(owner, true);
        break;
      case 'magnet_drone':
        this.spawnMagnet(owner, true);
        break;
      // self-buff items (boost/star/aegis/shield) are pure state flags —
      // they arrive with the peer's state stream, nothing to replicate here.
      default:
        break;
    }
  }

  /** Net: does this projectile/trap get to collide with the given kart? */
  private canHit(k: KartController, replica: boolean): boolean {
    if (!replica) return true;
    if (!this.netMode) return true;   // offline: everything collides
    return this.localKartIds?.has(k.id) ?? false;
  }

  private stormBlast(owner: KartController): void {
    for (const k of this.karts) {
      if (k === owner || k.battleKo || k.finished) continue;
      if (this.teamMode && k.battleTeam === owner.battleTeam) continue;
      if (k.invincible) continue;
      k.shrinkNow();
      k.spinT = Math.min(k.spinT + 0.6, PHYS.spinTime);
      k.speed *= 0.5;
    }
    this.onEvent?.({ type: 'storm', kartId: owner.id, text: '¡Chip Tormenta!' });
  }

  // -------------------------------------------------------------- update

  update(dt: number, t: number, racing: boolean): void {
    this.updateRoulettes();
    this.updateProjectiles(dt, t);
    this.updateTraps(dt, t);
    this.updateOrbiters(t);
    this.updateHeldItems(t);
  }

  // -------------------------------------------------------------- held-behind item

  /** True when the kart is holding an item behind AND the impact position is
   *  in its rear arc — the item blocks the shot and is NOT consumed. */
  private tryRearBlock(k: KartController, sourcePos: THREE.Vector3): boolean {
    if (!k.itemHeldOut || !k.itemSlot) return false;
    const f = k.forward();
    const to = sourcePos.clone().sub(k.pos).normalize();
    return f.dot(to) < -0.25;                    // impact comes from behind
  }

  /** Trailing item visual: the current item floats ~2.3 m behind the kart. */
  private updateHeldItems(t: number): void {
    for (const k of this.karts) {
      const held = this.heldMeshes.get(k.id);
      // remote puppets stream the held flag but not the item id — show generic
      const want = k.itemHeldOut && (!!k.itemSlot || k.remoteDriven);
      if (want && (!held || held.itemId !== (k.itemSlot ?? '?'))) {
        if (held) { this.group.remove(held.mesh); }
        const mesh = this.buildHeldMesh((k.itemSlot ?? 'aegis_star') as ItemId);
        this.group.add(mesh);
        this.heldMeshes.set(k.id, { mesh, itemId: (k.itemSlot ?? '?') as string });
      } else if (!want && held) {
        this.group.remove(held.mesh);
        this.heldMeshes.delete(k.id);
      }
      if (!want) continue;
      const m = this.heldMeshes.get(k.id)!.mesh;
      const back = k.forward().multiplyScalar(-1);
      m.position.copy(k.pos).addScaledVector(back, 2.3);
      m.position.y = k.pos.y + 0.9 + Math.sin(t * 4) * 0.08;
      m.rotation.y = k.yaw + Math.PI + Math.sin(t * 2) * 0.15;
      m.rotation.z = Math.sin(t * 3) * 0.12;
    }
  }

  private buildHeldMesh(id: ItemId): THREE.Object3D {
    const g = new THREE.Group();
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x9adfff, transparent: true, opacity: 0.18 }));
    g.add(halo);
    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), mat(0xffffff, { emissive: 0x337788 }));
    g.add(inner);
    // a hint of what is being held, by item family
    const tint: Partial<Record<ItemId, number>> = {
      photon_dart: 0x35e0ff, triple_dart: 0x35e0ff, seeker_orb: 0xff5ad8,
      goo_trap: 0x8a4ae8, rear_mine: 0xff4422, turbo_cell: 0xffd84a,
      turbo_stack: 0xffd84a, star_core: 0xffe94a, orbit_shield: 0x35aaff,
      aegis_star: 0xfff0a0, storm_chip: 0xb08aff, track_hunter: 0xff7a2a,
      magnet_drone: 0xd8d84a,
    };
    (halo.material as THREE.MeshBasicMaterial).color.setHex(tint[id] ?? 0x9adfff);
    (inner.material as THREE.MeshLambertMaterial).color.setHex(tint[id] ?? 0xffffff);
    return g;
  }

  private updateProjectiles(dt: number, t: number): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { this.killProjectile(p, false); continue; }

      if (p.kind === 'dart') {
        p.pos.addScaledVector(p.vel, dt);
        this.stickToGround(p, 0.5);
      } else if (p.kind === 'seeker') {
        if (p.target && !p.target.battleKo) {
          const to = p.target.pos.clone().add(new THREE.Vector3(0, 0.9, 0)).sub(p.pos);
          const dist = to.length();
          to.normalize();
          const desired = to.multiplyScalar(p.speed);
          const turn = clamp(1 - Math.exp(-ITEMS.seekerTurnRate * dt), 0, 1);
          p.vel.lerp(desired, turn);
          p.vel.setLength(p.speed);
          if (dist < 1.6) { this.hitKart(p, p.target); continue; }
        }
        p.pos.addScaledVector(p.vel, dt);
        this.stickToGround(p, 0.7);
      } else if (p.kind === 'hunter') {
        const sp = this.world.spline;
        if (!sp) { this.killProjectile(p, false); continue; }
        p.s = ((p.s ?? 0) + (p.speed / sp.length) * dt) % 1;
        const sm = sp.sampleAt(p.s);
        p.pos.copy(sm.pos).add(new THREE.Vector3(0, 0.9, 0));
        p.mesh.rotation.y = -Math.atan2(sm.tangent.x, sm.tangent.z) + Math.PI;
        // proximity detonation vs any kart (not owner) it passes
        for (const k of this.karts) {
          if (k === p.owner || k.battleKo || k.finished) continue;
          if (!this.canHit(k, p.replica)) continue;
          if (k.pos.distanceTo(p.pos) < 2.2) { this.hitKart(p, k); break; }
        }
        if (!p.active) continue;
        // auto-expire when it laps back to owner progress
        if (p.target && p.target.finished) this.killProjectile(p, false);
      } else if (p.kind === 'magnet') {
        if (p.target && !p.target.battleKo) {
          const to = p.target.pos.clone().add(new THREE.Vector3(0, 1.4, 0)).sub(p.pos);
          const dist = to.length();
          to.normalize();
          p.pos.addScaledVector(to, p.speed * dt);
          p.mesh.rotation.y = t * 4;
          if (dist < 1.8) {
            // steal!
            if (p.target.itemSlot) {
              p.owner.itemSlot = p.target.itemSlot as ItemId;
              p.owner.itemCharges = p.target.itemCharges;
              p.target.itemSlot = null;
              p.target.itemCharges = 0;
              this.onEvent?.({ type: 'steal', kartId: p.owner.id, targetId: p.target.id, itemId: p.owner.itemSlot as ItemId, text: '¡Robo!' });
            }
            p.target.speed *= 0.85;
            this.killProjectile(p, true);
            continue;
          }
        } else {
          this.killProjectile(p, false);
          continue;
        }
      }

      // generic kart collision for dart/seeker
      if (p.active && (p.kind === 'dart' || p.kind === 'seeker')) {
        for (const k of this.karts) {
          if (k === p.owner || k.battleKo || k.finished) continue;
          if (!this.canHit(k, p.replica)) continue;
          const dx = k.pos.x - p.pos.x, dz = k.pos.z - p.pos.z;
          const dy = k.pos.y + 0.8 - p.pos.y;
          if (dx * dx + dz * dz + dy * dy < 1.9 * 1.9) { this.hitKart(p, k); break; }
        }
      }

      if (p.active) p.mesh.position.copy(p.pos);
    }
    this.projectiles = this.projectiles.filter(p => p.active);
  }

  /** Keep projectiles hovering at track height. */
  private stickToGround(p: Projectile, hover: number): void {
    const g = this.world.groundQuery(p.pos, { mainIdx: -1, pathIdx: -1, ptIdx: -1 });
    if (g && g.hasGround) p.pos.y = Math.max(p.pos.y, g.height + hover);
    else { this.killProjectile(p, false); }
  }

  private hitKart(p: Projectile, victim: KartController): void {
    // held-behind item blocks REAR shots without being consumed
    if (this.tryRearBlock(victim, p.pos)) {
      this.onEvent?.({ type: 'shield', kartId: victim.id, text: '¡Escudo trasero!' });
      this.killProjectile(p, true);
      return;
    }
    // orbit shield absorbs one hit
    if (victim.orbitShield > 0) {
      victim.orbitShield -= 1;
      this.onEvent?.({ type: 'shield', kartId: victim.id, text: '¡Bloqueado!' });
      this.killProjectile(p, true);
      return;
    }
    if (victim.invincible || victim.spinT > 0) {
      this.killProjectile(p, false);
      return;
    }
    if (p.kind === 'hunter') {
      victim.spinOut();
      victim.speed *= 0.15;
      // heavy hits launch the kart — a weighty, readable punishment
      victim.vy = Math.max(victim.vy, 4.2);
      victim.grounded = false;
    } else {
      victim.spinOut();
    }
    const fx = p.kind === 'dart' ? 'zap' : p.kind === 'seeker' ? 'seeker' : p.kind === 'hunter' ? 'blast' : 'zap';
    this.onEvent?.({ type: 'hit', kartId: victim.id, ownerId: p.owner.id, fx, text: '¡Impacto!' });
    this.killProjectile(p, true);
  }

  private killProjectile(p: Projectile, pop: boolean): void {
    p.active = false;
    this.group.remove(p.mesh);
    if (pop) {
      // per-family burst color — reads as WHAT hit you, not just "a flash"
      const byKind: Record<string, number> = {
        dart: 0x35e0ff, seeker: 0xff5ad8, hunter: 0xff7a2a, magnet: 0xd8d84a,
      };
      const col = byKind[p.kind] ?? 0xffe94a;
      // small poof flash
      const flash = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 }));
      flash.position.copy(p.pos);
      this.group.add(flash);
      // expanding shockwave ring (flat, on the ground plane of the hit)
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 20),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(p.pos);
      ring.position.y += 0.15;
      this.group.add(ring);
      let life = 0.32;
      const shrink = (dt: number): boolean => {
        life -= dt;
        flash.scale.multiplyScalar(1 + dt * 6);
        (flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, life * 2.8);
        ring.scale.setScalar(1 + (0.32 - life) * 16);
        (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, life * 2.4);
        if (life <= 0) {
          this.group.remove(flash); this.group.remove(ring);
          flash.geometry.dispose(); ring.geometry.dispose();
          return false;
        }
        return true;
      };
      this.animQueue.push({ update: shrink });
    }
  }

  private animQueue: { update: (dt: number) => boolean }[] = [];

  private updateTraps(dt: number, t: number): void {
    for (const tr of this.traps) {
      if (!tr.active) continue;
      tr.life -= dt;
      if (tr.life <= 0) { this.removeTrap(tr); continue; }
      if (tr.kind === 'mine') {
        // blink faster as it ages
        const blink = tr.mesh.children[1] as THREE.Mesh;
        (blink.material as THREE.MeshLambertMaterial).emissive.setHex(
          Math.sin(t * (2 + (1 - tr.life) * 4)) > 0 ? 0xff2200 : 0x330000);
      }
      for (const k of this.karts) {
        if (k.battleKo || k.finished) continue;
        if (k === tr.owner && tr.armed > 0) continue;
        if (k.invincible) continue;
        if (!this.canHit(k, tr.replica)) continue;
        const dx = k.pos.x - tr.pos.x, dz = k.pos.z - tr.pos.z;
        const r = tr.kind === 'goo' ? ITEMS.trapRadius : 2.1;
        if (dx * dx + dz * dz < r * r && Math.abs(k.pos.y - tr.pos.y) < 1.5) {
          if (this.tryRearBlock(k, tr.pos)) {
            this.onEvent?.({ type: 'shield', kartId: k.id, text: '¡Escudo trasero!' });
          } else if (k.orbitShield > 0) { k.orbitShield -= 1; this.onEvent?.({ type: 'shield', kartId: k.id, text: '¡Bloqueado!' }); }
          else {
            k.spinOut();
            k.speed *= tr.kind === 'mine' ? 0.1 : 0.3;
            if (tr.kind === 'mine') {
              // mines detonate: fiery blast + the kart gets tossed
              k.vy = Math.max(k.vy, 3.8);
              k.grounded = false;
            }
            this.onEvent?.({
              type: 'hit', kartId: k.id, ownerId: tr.owner.id,
              itemId: tr.kind === 'mine' ? 'rear_mine' : 'goo_trap',
              fx: tr.kind === 'mine' ? 'blast' : 'goo',
              text: tr.kind === 'mine' ? '¡Mina!' : '¡Cianobomba!'
            });
          }
          this.removeTrap(tr);
          break;
        }
      }
      tr.armed = Math.max(0, tr.armed - dt);
    }
    this.traps = this.traps.filter(tr => tr.active);
    // drain one-shot anims (update returns false when finished)
    this.animQueue = this.animQueue.filter(a => a.update(dt));
  }

  private removeTrap(tr: TrapEntity): void {
    tr.active = false;
    this.group.remove(tr.mesh);
  }

  private updateOrbiters(t: number): void {
    for (const k of this.karts) {
      let orbs = this.orbiters.get(k.id);
      if (k.orbitShield > 0 && (!orbs || orbs.length !== k.orbitShield)) {
        if (orbs) for (const o of orbs) this.group.remove(o);
        orbs = [];
        for (let i = 0; i < k.orbitShield; i++) {
          const o = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6),
            mat(0x35aaff, { emissive: 0x113366 }));
          this.group.add(o);
          orbs.push(o);
        }
        this.orbiters.set(k.id, orbs);
      } else if (k.orbitShield <= 0 && orbs) {
        for (const o of orbs) this.group.remove(o);
        this.orbiters.delete(k.id);
        orbs = undefined;
      }
      if (orbs) {
        for (let i = 0; i < orbs.length; i++) {
          const a = k.orbitAngle + (i / orbs.length) * Math.PI * 2;
          orbs[i].position.set(
            k.pos.x + Math.cos(a) * ITEMS.orbitRadius,
            k.pos.y + 1.0 + Math.sin(t * 3 + i) * 0.15,
            k.pos.z + Math.sin(a) * ITEMS.orbitRadius,
          );
        }
      }
    }
  }

  /** External hook: strip a kart's shield orbs (battle KO etc.). */
  clearShield(kart: KartController): void {
    kart.orbitShield = 0;
    const orbs = this.orbiters.get(kart.id);
    if (orbs) { for (const o of orbs) this.group.remove(o); this.orbiters.delete(kart.id); }
  }

  dispose(): void {
    this.group.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    this.projectiles = [];
    this.traps = [];
    this.orbiters.clear();
    this.heldMeshes.clear();
  }
}
