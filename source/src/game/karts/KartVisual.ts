/**
 * APEX KART — Procedural kart + character meshes and code-driven animation.
 * No external models: every racer is assembled from primitives with a
 * species-unique head, and animated procedurally (steer lean, drift roll,
 * landing bounce, victory/defeat poses, hit flash).
 *
 * Build strategy: all static parts are merged per material (chassis / accent /
 * dark / tire / hub) with BufferGeometryUtils.mergeGeometries, so a full kart
 * costs ~10 draw calls while looking like a hand-built party racer:
 * sculpted monocoque + nose cone, side pods with intakes, wheel fenders,
 * front wing with endplates, rear wing on struts, twin exhaust, roll hoop.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHARACTER_MAP } from './KartStats';
import type { KartModelMeta } from '../assets/ModelLibrary';

export type KartAnim = 'idle' | 'victory' | 'defeat' | 'hit';

/** Optional GLB overrides resolved from ModelLibrary (public/models). */
export interface VisualModels {
  /** shared kart chassis model (already normalized + material-cloned) */
  kart?: THREE.Object3D;
  kartMeta?: KartModelMeta;
  /** driver figure for this character (or a full character+kart model) */
  driver?: THREE.Object3D;
  driverIncludesKart?: boolean;
}

export interface VisualState {
  speedRatio: number;      // 0..1
  steer: number;           // -1..1 (positive = right on screen)
  drifting: boolean;
  driftLevel: number;      // 0..3
  grounded: boolean;
  boost: boolean;
  shrink: boolean;
  airborne: boolean;
  trickSpin: number;       // 0..1 stunt progress (0 = none)
  trickKind: number;       // 0 front-flip, 1 roll left, 2 roll right
  /** glider/parachute deployment 0..1 (0 = closed) */
  glider: number;
  /** 0..1 decaying drift-engagement kick (suspension pop, no hop) */
  driftKick: number;
}

const TIRE = 0x181a20;
const DARK = 0x1c1e26;
const ACCENT = 0xf2f4f8;

/**
 * Toon shading: one shared 3-step gradient map gives characters the clean
 * cel-shaded party-racer look (flat plastic Lambert read as "asset flip").
 */
let toonGradient: THREE.DataTexture | null = null;
function getToonGradient(): THREE.DataTexture {
  if (toonGradient) return toonGradient;
  const data = new Uint8Array([90, 160, 215, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  tex.needsUpdate = true;
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  toonGradient = tex;
  return tex;
}

/** Toon material factory for character parts. */
function toonMat(color: number, opts: { emissive?: number; side?: THREE.Side } = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getToonGradient(),
    ...(opts.emissive !== undefined ? { emissive: opts.emissive } : {}),
    ...(opts.side !== undefined ? { side: opts.side } : {}),
  });
}

/** Parachute canopy texture: bold racer-color / white sectors (radial stripes). */
const canopyTexCache = new Map<number, THREE.CanvasTexture>();
function makeCanopyTexture(color: number): THREE.CanvasTexture {
  const hit = canopyTexCache.get(color);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d')!;
  const col = '#' + color.toString(16).padStart(6, '0');
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#f4f6fa' : col;
    ctx.fillRect(i * 32, 0, 32, 128);
  }
  // subtle center panel
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(112, 0, 32, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  canopyTexCache.set(color, tex);
  return tex;
}

/** Racing numbers per racer (chest badge + identity). */
const RACE_NUMBERS: Record<string, number> = {
  zippy: 7, mimi: 5, bolt: 10, rex: 3, nova: 8, tiki: 66,
  bruiser: 1, magnus: 12, gigi: 21, pip: 4, kalle: 9, gus: 13,
};
const numberTexCache = new Map<string, THREE.CanvasTexture>();

/** White disc with the racer's number — the classic karting chest badge. */
function getNumberTexture(id: string): THREE.CanvasTexture {
  const hit = numberTexCache.get(id);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#f8f8ff';
  ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1a1a28'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(64, 64, 54, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#1a1a28';
  ctx.font = '900 64px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(RACE_NUMBERS[id] ?? 0), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  numberTexCache.set(id, tex);
  return tex;
}

/** Shared "APEX star" racing roundel decal (built once). */
let roundelTex: THREE.CanvasTexture | null = null;
function getRoundelTexture(): THREE.CanvasTexture {
  if (roundelTex) return roundelTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#f8f8ff';
  ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1a1a28'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(64, 64, 57, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ff9a2a';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 17 : 42;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.fill();
  roundelTex = new THREE.CanvasTexture(c);
  return roundelTex;
}

/** geometry transform helper: translate + rotate (Euler XYZ), returns geo */
const T = (
  geo: THREE.BufferGeometry,
  x: number, y: number, z: number,
  rx = 0, ry = 0, rz = 0,
): THREE.BufferGeometry => {
  const m = new THREE.Matrix4();
  m.makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  m.setPosition(x, y, z);
  const g = geo.clone();
  g.applyMatrix4(m);
  return g;
};

/** anything that carries color+emissive and can flash / be tinted */
type TintMat = THREE.MeshLambertMaterial | THREE.MeshToonMaterial | THREE.MeshStandardMaterial;

export class KartVisual {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private frontWheels: THREE.Group[] = [];
  // GLB wheel nodes (name-detected): spin around X, fronts also steer via Y
  private glbWheels: THREE.Object3D[] = [];
  private glbFrontWheels: THREE.Object3D[] = [];
  private glbSteerBase = new Map<THREE.Object3D, number>();
  private glbRearZ = -2.0;
  private usedGlbKart = false;
  /** cockpit anchor from the manifest (fitted kart space) — the driver sits here */
  private glbSeat: { x: number; y: number; z: number } | null = null;
  /** driver figure scale (GLB karts seat a smaller driver) */
  private seatScale = 1;
  /** rest height of the seat anchor (victory bob returns here) */
  private seatY = 0.6;
  private characterRoot = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private exhausts: THREE.Mesh[] = [];
  private boostFlames: THREE.Mesh[] = [];
  private trailMeshes: THREE.Mesh[] = [];
  /** materials whose emissive flashes on hit/star (Lambert, Toon or GLB Standard) */
  private materials: TintMat[] = [];
  private chassisMats: TintMat[] = [];
  /** glider/parachute rig (built once, hidden until a long fall) */
  private glider = new THREE.Group();
  private gliderArms: THREE.Group[] = [];
  private anim: KartAnim = 'idle';
  private animT = 0;
  private bounce = 0;        // suspension visual spring
  private bounceVel = 0;
  private wasAirborne = false;
  private readonly characterId: string;

  constructor(characterId: string, kartColor: number, models?: VisualModels) {
    this.characterId = characterId;
    const driverOwnsKart = !!models?.driver && !!models.driverIncludesKart;
    if (models?.kart && !driverOwnsKart) {
      this.buildKartGLB(models.kart, models.kartMeta, kartColor);
    } else {
      this.buildKart(kartColor);
    }
    if (models?.driver) {
      this.buildCharacterGLB(models.driver, driverOwnsKart);
    } else {
      this.buildCharacter(characterId);
    }
    this.buildGlider(kartColor);
    this.group.add(this.body);
    if (!driverOwnsKart) this.body.add(this.characterRoot);
  }

  // ------------------------------------------------------------ GLB paths

  /** GLB chassis: adopt the model as the body, wire detected wheels + flames. */
  private buildKartGLB(scene: THREE.Object3D, meta: KartModelMeta | undefined, color: number): void {
    this.usedGlbKart = true;
    scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.MeshStandardMaterial)?.color) {
        this.materials.push(m.material as THREE.MeshLambertMaterial);
      }
    });
    // tint with the racer chassis color (per-instance materials, cloned upstream)
    const tintables = meta?.tintables ?? [];
    for (const mat of tintables) {
      (mat as THREE.MeshStandardMaterial).color.setHex(color);
      this.chassisMats.push(mat as THREE.MeshLambertMaterial);
    }
    this.body.add(scene);

    this.glbWheels = meta?.wheels ?? [];
    this.glbFrontWheels = meta?.frontWheels ?? [];
    for (const w of this.glbFrontWheels) this.glbSteerBase.set(w, w.rotation.y);
    this.glbRearZ = meta?.rearZ ?? -1.9;
    if (meta?.seat) {
      this.glbSeat = { x: meta.seat.x, y: meta.seat.y, z: meta.seat.z };
      this.seatScale = meta.seat.scale ?? 1;
      this.seatY = meta.seat.y;
    }

    // boost flames + emissive exhaust tips at the model's rear
    const tipMat = new THREE.MeshLambertMaterial({ color: 0x8a8a96, emissive: 0x220000 });
    for (const s of [-1, 1]) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.17, 1.0, 6),
        new THREE.MeshBasicMaterial({ color: 0xffa53a, transparent: true, opacity: 0.9 }));
      flame.rotation.x = Math.PI / 2;
      flame.position.set(s * 0.35, 0.55, this.glbRearZ - 0.55);
      flame.visible = false;
      this.body.add(flame);
      this.boostFlames.push(flame);
    }
    this.materials.push(tipMat);

    // No usable wheels IN the model → add the procedural wheels only
    // (never the whole kart — the GLB is the chassis now) so the kart never
    // looks frozen. Models that ship their own wheels skip these entirely.
    if (this.glbWheels.length < 3 && !meta?.modelWheels) this.buildProceduralWheels();
  }

  /** Procedural wheel set — shared by the procedural kart and the GLB fallback. */
  private buildProceduralWheels(): void {
    const tireMat = new THREE.MeshLambertMaterial({ color: TIRE });
    const hubMat = new THREE.MeshLambertMaterial({ color: 0xd8dce4 });
    this.materials.push(tireMat, hubMat);

    const makeWheel = (radius: number, width: number): { tire: THREE.Mesh; hub: THREE.Mesh } => {
      const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 14);
      tireGeo.rotateZ(Math.PI / 2);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      const hubParts: THREE.BufferGeometry[] = [
        T(new THREE.CylinderGeometry(radius * 0.52, radius * 0.52, width * 1.06, 10), 0, 0, 0, 0, 0, Math.PI / 2),
      ];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        hubParts.push(T(new THREE.BoxGeometry(width * 0.35, radius * 1.7, radius * 0.16), 0, 0, 0, a, 0, 0));
      }
      const hubGeo = mergeGeometries(hubParts);
      const hub = new THREE.Mesh(hubGeo ?? new THREE.BoxGeometry(0.01, 0.01, 0.01), hubMat);
      hub.castShadow = false;
      return { tire, hub };
    };

    const wheelAt = (x: number, z: number, front: boolean, radius: number, width: number): void => {
      const holder = new THREE.Group();
      const { tire, hub } = makeWheel(radius, width);
      holder.add(tire, hub);
      holder.position.set(x, radius, z);
      this.body.add(holder);
      this.wheels.push(tire);
      if (front) this.frontWheels.push(holder);
    };
    wheelAt(-0.94, 1.12, true, 0.4, 0.32);
    wheelAt(0.94, 1.12, true, 0.4, 0.32);
    wheelAt(-0.98, -1.02, false, 0.47, 0.42);
    wheelAt(0.98, -1.02, false, 0.47, 0.42);
  }

  /** GLB driver: seated figure, or a full character+kart model as the body. */
  private buildCharacterGLB(scene: THREE.Object3D, includesKart: boolean): void {
    scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.MeshStandardMaterial)?.color) {
        this.materials.push(m.material as THREE.MeshLambertMaterial);
      }
    });
    if (includesKart) {
      this.usedGlbKart = true;
      this.body.add(scene);
    } else {
      this.characterRoot.position.set(0, 0.6, -0.3);
      this.torso.add(scene);
      scene.position.set(0, 0.18, 0); // seat the figure on the cockpit floor
    }
  }

  /** Where the procedural driver sits (GLB karts use the manifest seat anchor). */
  private seatAnchor(): { x: number; y: number; z: number } {
    return this.glbSeat ?? { x: 0, y: 0.6, z: -0.3 };
  }

  /** Cockpit anchor with driver scale (manifest "seat.scale", default 1). */
  applySeat(seat: { x: number; y: number; z: number; scale?: number }): void {
    this.glbSeat = { x: seat.x, y: seat.y, z: seat.z };
    this.seatScale = seat.scale ?? 1;
  }

  // ---------------------------------------------------------------- kart

  private buildKart(color: number): void {
    const chassis = new THREE.MeshLambertMaterial({ color });
    const accent = new THREE.MeshLambertMaterial({ color: ACCENT });
    const dark = new THREE.MeshLambertMaterial({ color: DARK });
    this.chassisMats.push(chassis);
    this.materials.push(chassis, accent, dark);

    // ===================== CHASSIS-COLORED PARTS (merged) =====================
    const chassisParts: THREE.BufferGeometry[] = [];
    // main monocoque tub — slim nose widening to the cockpit
    chassisParts.push(T(new THREE.BoxGeometry(1.5, 0.4, 2.6), 0, 0.42, -0.1));
    // rounded cowl over the cockpit front (squashed sphere)
    const cowl = new THREE.SphereGeometry(0.62, 12, 10);
    cowl.scale(1.15, 0.62, 1.25);
    chassisParts.push(T(cowl, 0, 0.55, 0.55));
    // nose cone (tapered cylinder pointing forward)
    chassisParts.push(T(new THREE.CylinderGeometry(0.16, 0.58, 1.15, 6), 0, 0.42, 1.62, Math.PI / 2));
    // side pods with raised shoulders
    for (const s of [-1, 1]) {
      chassisParts.push(T(new THREE.BoxGeometry(0.5, 0.36, 1.7), s * 0.95, 0.44, -0.25));
      chassisParts.push(T(new THREE.BoxGeometry(0.54, 0.14, 0.5), s * 0.95, 0.66, 0.35));
    }
    // rear engine cowl + cooling fins
    chassisParts.push(T(new THREE.BoxGeometry(1.05, 0.42, 0.85), 0, 0.62, -1.05));
    for (let i = 0; i < 4; i++) {
      chassisParts.push(T(new THREE.BoxGeometry(0.8, 0.045, 0.5), 0, 0.86 + i * 0.07, -1.1));
    }
    // fender planks over both axles
    for (const s of [-1, 1]) {
      chassisParts.push(T(new THREE.BoxGeometry(0.72, 0.14, 1.35), s * 0.98, 0.82, 1.05));
      chassisParts.push(T(new THREE.BoxGeometry(0.78, 0.14, 1.45), s * 1.0, 0.82, -1.02));
    }
    // seat back
    chassisParts.push(T(new THREE.BoxGeometry(0.82, 0.62, 0.2), 0, 0.98, -0.86, -0.12));

    // ===================== ACCENT PARTS (merged) ==============================
    const accentParts: THREE.BufferGeometry[] = [];
    // front wing + endplates
    accentParts.push(T(new THREE.BoxGeometry(1.72, 0.09, 0.55), 0, 0.3, 2.02, -0.12));
    for (const s of [-1, 1]) {
      accentParts.push(T(new THREE.BoxGeometry(0.09, 0.3, 0.6), s * 0.86, 0.4, 2.0));
    }
    // rear wing + struts + endplates
    accentParts.push(T(new THREE.BoxGeometry(1.62, 0.09, 0.6), 0, 1.32, -1.62, 0.1));
    for (const s of [-1, 1]) {
      accentParts.push(T(new THREE.BoxGeometry(0.09, 0.36, 0.62), s * 0.8, 1.42, -1.62));
      accentParts.push(T(new THREE.BoxGeometry(0.08, 0.5, 0.08), s * 0.5, 1.05, -1.6));
    }
    // racing stripe down the nose + cowl
    accentParts.push(T(new THREE.BoxGeometry(0.3, 0.06, 1.9), 0, 0.645, 0.72));
    // side-pod intake lips
    for (const s of [-1, 1]) {
      accentParts.push(T(new THREE.BoxGeometry(0.1, 0.2, 0.5), s * 1.21, 0.5, 0.42));
    }
    // roll hoop over the driver (half torus)
    accentParts.push(T(new THREE.TorusGeometry(0.46, 0.07, 6, 10, Math.PI), 0, 1.05, -0.55, 0, Math.PI / 2));

    // ===================== DARK PARTS (merged) ================================
    const darkParts: THREE.BufferGeometry[] = [];
    // floor pan
    darkParts.push(T(new THREE.BoxGeometry(1.34, 0.12, 3.2), 0, 0.2, -0.05));
    // cockpit opening (dark tub interior)
    darkParts.push(T(new THREE.BoxGeometry(0.96, 0.16, 1.15), 0, 0.64, -0.12));
    // front splitter + rear diffuser strakes
    darkParts.push(T(new THREE.BoxGeometry(1.56, 0.08, 0.4), 0, 0.22, 2.12));
    for (const s of [-1, 1]) {
      darkParts.push(T(new THREE.BoxGeometry(0.08, 0.22, 0.5), s * 0.45, 0.2, -1.72));
      darkParts.push(T(new THREE.BoxGeometry(0.08, 0.22, 0.5), s * 0.75, 0.2, -1.72));
    }
    // steering column + wheel
    darkParts.push(T(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), 0, 0.78, 0.42, 0.7));
    darkParts.push(T(new THREE.TorusGeometry(0.2, 0.05, 6, 12), 0, 0.93, 0.5, 1.05));
    // twin exhaust pipes
    for (const s of [-1, 1]) {
      darkParts.push(T(new THREE.CylinderGeometry(0.085, 0.1, 0.55, 7), s * 0.32, 0.56, -1.52, Math.PI / 2));
    }
    // side mirrors on stalks
    for (const s of [-1, 1]) {
      darkParts.push(T(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 5), s * 0.88, 0.95, 0.55, 0, s * 0.9));
      darkParts.push(T(new THREE.BoxGeometry(0.05, 0.12, 0.16), s * 0.99, 1.05, 0.58));
    }

    // ---- merge & add ----------------------------------------------------------
    const addMerged = (parts: THREE.BufferGeometry[], material: THREE.Material): void => {
      const merged = mergeGeometries(parts);
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      this.body.add(mesh);
      for (const g of parts) g.dispose();
    };
    addMerged(chassisParts, chassis);
    addMerged(accentParts, accent);
    addMerged(darkParts, dark);

    // ---- headlights + taillights (always-on party-racer look) -----------------
    const lightGeos: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      lightGeos.push(T(new THREE.CylinderGeometry(0.085, 0.105, 0.1, 8), s * 0.3, 0.45, 2.14, Math.PI / 2));
    }
    addMerged(lightGeos, new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
    const tailGeos: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      tailGeos.push(T(new THREE.BoxGeometry(0.22, 0.1, 0.06), s * 0.38, 0.62, -1.98));
    }
    addMerged(tailGeos, new THREE.MeshBasicMaterial({ color: 0xff3822 }));

    // ---- racing roundel decal lying on the sloped nose cone -------------------
    const roundel = new THREE.Mesh(new THREE.CircleGeometry(0.24, 18),
      new THREE.MeshBasicMaterial({ map: getRoundelTexture(), transparent: true }));
    roundel.position.set(0, 0.83, 1.52);
    roundel.rotation.x = -Math.PI / 2 + 0.36;   // follows the nose cone slope
    this.body.add(roundel);

    // ---- exhaust tips (metal, emissive when boosting) -------------------------
    const tipMat = new THREE.MeshLambertMaterial({ color: 0x8a8a96, emissive: 0x220000 });
    for (const s of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 7), tipMat);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(s * 0.32, 0.56, -1.85);
      this.body.add(tip);
      this.exhausts.push(tip);

      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.17, 1.0, 6),
        new THREE.MeshBasicMaterial({ color: 0xffa53a, transparent: true, opacity: 0.9 }));
      flame.rotation.x = Math.PI / 2;
      flame.position.set(s * 0.32, 0.56, -2.4);
      flame.visible = false;
      this.body.add(flame);
      this.boostFlames.push(flame);
    }
    this.materials.push(tipMat);

    // ---- wheels: fat rear + nimble front, hub with 5 spokes --------------------
    this.buildProceduralWheels();
  }

  // ------------------------------------------------------------ character

  /**
   * Procedural chibi racer v2 — cel-shaded (toon materials), meatier torso,
   * visible legs + boots, harness straps, chunky gloved hands gripping the
   * wheel and a per-species head with NO generic helmet (the old one sat on
   * every head like a floating bowl and hid the faces).
   */
  private buildCharacter(id: string): void {
    const c = CHARACTER_MAP[id];
    const skinMat = toonMat(c.accent);
    const outfitMat = toonMat(c.color);
    const suitMat = toonMat(0x32343f);
    const gloveMat = toonMat(0xf0f2f7);
    const bootMat = toonMat(0x272933);
    this.materials.push(skinMat, outfitMat, suitMat, gloveMat, bootMat);

    // seat placement: GLB karts carry a cockpit anchor + scale in the manifest
    const seat = this.seatAnchor();
    this.characterRoot.position.set(seat.x, seat.y, seat.z);
    this.characterRoot.scale.setScalar(this.seatScale);
    this.seatY = seat.y;

    // ---- torso: seated racing posture (slight recline, weight in the seat)
    this.torso.position.y = 0.42;
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.3, 5, 10), outfitMat);
    chest.position.y = 0.3;
    chest.scale.set(1.06, 1, 0.92);
    chest.castShadow = true;
    this.torso.add(chest);
    // belly — a soft sphere breaks the capsule monotony (chibi read)
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), suitMat);
    belly.scale.set(1.05, 0.82, 0.78);
    belly.position.set(0, 0.08, 0.13);
    this.torso.add(belly);
    // chunky shoulders
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.155, 9, 7), outfitMat);
      shoulder.position.set(s * 0.33, 0.52, 0.02);
      this.torso.add(shoulder);
    }
    // harness: two straps crossing the chest in the accent color
    for (const s of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.05), suitMat);
      strap.position.set(s * 0.15, 0.32, 0.275);
      strap.rotation.z = s * 0.55;
      strap.rotation.x = -0.1;
      this.torso.add(strap);
    }
    // racing collar (neck brace) — the #1 "that's a racer" tell
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.08, 8, 14), suitMat);
    collar.rotation.x = Math.PI / 2 - 0.3;
    collar.position.set(0, 0.62, 0.0);
    this.torso.add(collar);
    // chest number panel — race-grade livery
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.15, 18),
      new THREE.MeshBasicMaterial({ map: getNumberTexture(id), transparent: true }));
    badge.position.set(0, 0.3, 0.31);
    badge.rotation.x = -0.18;
    this.torso.add(badge);
    this.characterRoot.add(this.torso);

    // ---- legs: go-kart drivers stretch to the pedals — thighs + boots read
    // instantly from the side/rear chase camera and fix the "floating bust"
    for (const s of [-1, 1]) {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.3, 4, 8), outfitMat);
      thigh.position.set(s * 0.185, -0.02, 0.36);
      thigh.rotation.x = 1.25;
      thigh.scale.set(1, 1, 0.9);
      this.torso.add(thigh);
      const boot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 7), bootMat);
      boot.scale.set(0.85, 0.7, 1.5);
      boot.position.set(s * 0.19, -0.22, 0.56);
      this.torso.add(boot);
    }

    // ---- arms: two-segment reach to the wheel with mitten gloves
    for (const [arm, s] of [[this.armL, -1], [this.armR, 1]] as [THREE.Group, number][]) {
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.3, 4, 8), outfitMat);
      upper.position.set(0, -0.06, 0.14);
      upper.rotation.x = 1.0; upper.rotation.z = s * 0.22;
      arm.add(upper);
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), outfitMat);
      elbow.position.set(0, -0.18, 0.27);
      arm.add(elbow);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.24, 4, 8), outfitMat);
      fore.position.set(0, -0.24, 0.38);
      fore.rotation.x = 1.35;
      arm.add(fore);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.096, 0.1, 10), suitMat);
      cuff.position.set(0, -0.3, 0.45);
      cuff.rotation.x = 1.35;
      arm.add(cuff);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.115, 9, 7), gloveMat);
      glove.scale.set(1, 0.92, 1.12);
      glove.position.set(0, -0.34, 0.52);
      arm.add(glove);
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 5), gloveMat);
      thumb.position.set(s * 0.06, -0.3, 0.56);
      arm.add(thumb);
      arm.position.set(s * 0.31, 0.5, 0.08);
      arm.rotation.x = -0.12;
      this.torso.add(arm);
    }

    this.buildSpeciesHead(id, skinMat, outfitMat);
    this.head.position.y = 0.86;
    this.head.scale.setScalar(1.12);   // still chibi, no longer a lollipop
    this.torso.add(this.head);
  }

  // ------------------------------------------------------------ glider

  /**
   * Parachute/glider rig: striped canopy + suspension lines, hidden until a
   * long fall pops it open (MK7/8 glide sections). Sits on `group` (not the
   * trick-tumbling body) so the canopy stays level above the kart.
   */
  private buildGlider(kartColor: number): void {
    const G = this.glider;
    const canopyTex = makeCanopyTexture(kartColor);
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.46),
      new THREE.MeshLambertMaterial({ map: canopyTex, side: THREE.DoubleSide }),
    );
    canopy.scale.set(1, 0.58, 1);
    G.add(canopy);
    // bright rim so the canopy reads against the sky
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.44, 0.05, 6, 24),
      toonMat(0xf2f4f8));
    rim.rotation.x = Math.PI / 2;
    G.add(rim);
    // hub + suspension lines down to the kart
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8dce6 });
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), lineMat);
    hub.position.y = -1.05;
    G.add(hub);
    const lineGeo: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * 1.38, z = Math.sin(a) * 1.38;
      const dx = x, dy = -1.0, dz = z;
      const len = Math.hypot(dx, dy, dz);
      const cyl = new THREE.CylinderGeometry(0.014, 0.014, len, 4);
      // orient: from rim point down to hub
      const mid = new THREE.Vector3(x / 2, -0.5, z / 2);
      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      cyl.applyQuaternion(q);
      cyl.translate(mid.x, mid.y, mid.z);
      lineGeo.push(cyl);
    }
    const lines = new THREE.Mesh(mergeGeometries(lineGeo) ?? new THREE.BoxGeometry(0.01, 0.01, 0.01), lineMat);
    G.add(lines);
    G.position.set(0, 2.5, 0.1);
    G.visible = false;
    this.group.add(G);
  }

  // ------------------------------------------------------------ face helpers

  /** Cartoon eye: white sclera + dark pupil + specular glint (the "alive" look). */
  private addEye2(
    H: THREE.Group, s: number,
    o: { x?: number; y?: number; z?: number; r?: number; iris?: number; sclera?: number } = {},
  ): void {
    const { x = 0.12, y = 0.07, z = 0.27, r = 0.105, iris = 0x1a1a22, sclera = 0xffffff } = o;
    const g = new THREE.Group();
    const white = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color: sclera }));
    white.scale.set(1, 1.16, 0.62);
    g.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 8, 6), new THREE.MeshBasicMaterial({ color: iris }));
    pupil.position.z = r * 0.5;
    pupil.scale.set(1, 1, 0.5);
    g.add(pupil);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(r * 0.17, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(-r * 0.16, r * 0.3, r * 0.74);
    g.add(glint);
    g.position.set(s * x, y, z);
    H.add(g);
  }

  /** Cheerful open smile with an upper teeth strip. */
  private addSmile(H: THREE.Group, y: number, z: number, w = 0.15): void {
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(w, 10, 8), new THREE.MeshBasicMaterial({ color: 0x421a20 }));
    mouth.scale.set(1.5, 0.58, 0.42);
    mouth.position.set(0, y, z);
    H.add(mouth);
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(w * 1.55, w * 0.3, 0.03), new THREE.MeshBasicMaterial({ color: 0xfff6ea }));
    teeth.position.set(0, y + w * 0.24, z + w * 0.36);
    H.add(teeth);
  }

  /** Small expressive eyebrows (angle > 0 = determined, < 0 = worried). */
  private addBrows(H: THREE.Group, color: number, y = 0.2, z = 0.24, angle = 0.22, w = 0.13): void {
    for (const s of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(w, 0.038, 0.045), new THREE.MeshLambertMaterial({ color }));
      brow.position.set(s * 0.12, y, z);
      brow.rotation.z = -s * angle;
      H.add(brow);
    }
  }

  /** Soft blush cheeks for the cute species. */
  private addCheeks(H: THREE.Group, color = 0xff9a8a): void {
    for (const s of [-1, 1]) {
      const ch = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }));
      ch.position.set(s * 0.2, -0.05, 0.245);
      H.add(ch);
    }
  }

  private buildSpeciesHead(id: string, skin: THREE.MeshToonMaterial, outfit: THREE.MeshToonMaterial): void {
    const H = this.head;

    switch (id) {
      case 'pip': { // raccoon: grey head, bandit mask, ears, striped tail
        const headM = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), toonMat(0x9a9aa6));
        this.materials.push(headM.material as THREE.MeshToonMaterial);
        H.add(headM);
        const mask = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.2), toonMat(0x2c2c34));
        mask.position.set(0, 0.06, 0.24); H.add(mask);
        for (const s of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 5), toonMat(0x8a8a96));
          ear.position.set(s * 0.17, 0.3, 0); H.add(ear);
          const inner = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 5), toonMat(0x54545e));
          inner.position.set(s * 0.17, 0.29, 0.03); H.add(inner);
        }
        this.addEye2(H, -1, { y: 0.06, z: 0.3 }); this.addEye2(H, 1, { y: 0.06, z: 0.3 });
        this.addSmile(H, -0.12, 0.27, 0.12);
        // striped tail poking out the back
        const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.55, 4, 6),
          toonMat(0xb59a6a));
        tail.position.set(0, 0.9, -1.15); tail.rotation.x = 0.9;
        this.body.add(tail);
        const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), toonMat(0x3a3a44));
        tailTip.position.set(0, 1.12, -1.32);
        this.body.add(tailTip);
        break;
      }
      case 'zippy': { // electric imp: purple, cyan horns, glowing eyes
        const headM = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), toonMat(0x7a4ac8));
        H.add(headM);
        for (const s of [-1, 1]) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 6), toonMat(0x35e0d8, { emissive: 0x0c4a48 }));
          horn.position.set(s * 0.15, 0.31, 0); horn.rotation.z = s * 0.35; H.add(horn);
        }
        // lightning bolt crest
        const bolt = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 4), new THREE.MeshBasicMaterial({ color: 0xffe94a }));
        bolt.position.set(0, 0.34, -0.12); bolt.rotation.x = -0.5; H.add(bolt);
        // big glowing eyes with dark slit pupils
        for (const s of [-1, 1]) {
          const glow = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), new THREE.MeshBasicMaterial({ color: 0x35ffe8 }));
          glow.scale.set(1, 1.1, 0.6);
          glow.position.set(s * 0.12, 0.07, 0.26); H.add(glow);
          const slit = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), new THREE.MeshBasicMaterial({ color: 0x0a2a28 }));
          slit.scale.set(0.6, 1.4, 0.5);
          slit.position.set(s * 0.12, 0.07, 0.3); H.add(slit);
        }
        this.addBrows(H, 0x3a2068, 0.19, 0.27, 0.3);
        this.addSmile(H, -0.11, 0.26, 0.14);
        // tiny fangs
        for (const s of [-1, 1]) {
          const fang = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.08, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
          fang.position.set(s * 0.07, -0.06, 0.3); fang.rotation.x = Math.PI; H.add(fang);
        }
        break;
      }
      case 'mimi': { // flower sprite: green head + petal crown
        const headM = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), toonMat(0x8ad86a));
        H.add(headM);
        for (let i = 0; i < 7; i++) {
          const petal = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 6), toonMat(i % 2 ? 0xff8ac8 : 0xffb0d8));
          const a = (i / 7) * Math.PI * 2;
          petal.position.set(Math.cos(a) * 0.23, 0.2 + Math.sin(a) * 0.1, Math.sin(a) * 0.14);
          petal.rotation.z = -Math.cos(a) * 1.2; petal.rotation.x = Math.sin(a) * 0.8;
          H.add(petal);
        }
        this.addEye2(H, -1, { r: 0.1, iris: 0x2a5a1a, z: 0.25 });
        this.addEye2(H, 1, { r: 0.1, iris: 0x2a5a1a, z: 0.25 });
        this.addSmile(H, -0.1, 0.24, 0.13);
        this.addCheeks(H, 0xff7ab0);
        break;
      }
      case 'kalle': { // street surfer: cap backwards + hair tuft
        const headM = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skin);
        H.add(headM);
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
          toonMat(0x3a2a1e));
        hair.position.y = 0.02; H.add(hair);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.15, 12), outfit);
        cap.position.y = 0.24; H.add(cap);
        const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.24), outfit);
        brim.position.set(0, 0.2, 0.3); H.add(brim);
        this.addEye2(H, -1, { z: 0.27 }); this.addEye2(H, 1, { z: 0.27 });
        this.addSmile(H, -0.1, 0.25, 0.12);
        this.addBrows(H, 0x3a2a1e, 0.18, 0.26, 0.18);
        break;
      }
      case 'bolt': { // golden retriever: floppy ears, muzzle, tongue out
        const headM = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 10), toonMat(0xc8905a));
        H.add(headM);
        for (const s of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.26, 4, 8), toonMat(0xa87848));
          ear.position.set(s * 0.27, 0.0, 0.02); ear.rotation.z = s * 0.5; H.add(ear);
        }
        const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), toonMat(0xe8c8a0));
        muzzle.scale.set(1.15, 0.85, 1);
        muzzle.position.set(0, -0.05, 0.26); H.add(muzzle);
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ color: 0x201820 }));
        nose.scale.set(1.2, 0.9, 0.8);
        nose.position.set(0, 0.0, 0.38); H.add(nose);
        const tongue = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.09, 4, 6), new THREE.MeshBasicMaterial({ color: 0xff7a8a }));
        tongue.position.set(0.02, -0.15, 0.36); tongue.rotation.x = 0.45; H.add(tongue);
        this.addEye2(H, -1, { y: 0.09, z: 0.26, iris: 0x4a2c10 }); this.addEye2(H, 1, { y: 0.09, z: 0.26, iris: 0x4a2c10 });
        this.addBrows(H, 0x8a5a2a, 0.2, 0.25, 0.15);
        break;
      }
      case 'rex': { // dragon hatchling: snout, horns, tiny wings
        const headM = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 10), toonMat(0x5ad85a));
        H.add(headM);
        const snout = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.15, 0.24), toonMat(0x7ae87a));
        snout.position.set(0, -0.03, 0.26); H.add(snout);
        for (const s of [-1, 1]) {
          const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), new THREE.MeshBasicMaterial({ color: 0x1a3a1a }));
          nostril.position.set(s * 0.07, 0.01, 0.38); H.add(nostril);
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), toonMat(0xf2d04a));
          horn.position.set(s * 0.12, 0.27, -0.05); horn.rotation.z = s * 0.4; H.add(horn);
        }
        this.addEye2(H, -1, { y: 0.1, z: 0.25, iris: 0xaa5a10, r: 0.095 });
        this.addEye2(H, 1, { y: 0.1, z: 0.25, iris: 0xaa5a10, r: 0.095 });
        this.addBrows(H, 0x2a7a2a, 0.22, 0.24, 0.32);
        // cheeky grin with a fang
        const grin = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: 0x3a1418 }));
        grin.scale.set(1.5, 0.55, 0.4);
        grin.position.set(0, -0.14, 0.32); H.add(grin);
        const fang = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.075, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        fang.position.set(0.06, -0.08, 0.37); fang.rotation.x = Math.PI; H.add(fang);
        // little wings on the seat back
        for (const s of [-1, 1]) {
          const wing = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 4), toonMat(0x48b848));
          wing.position.set(s * 0.35, 1.25, -0.75); wing.rotation.z = s * -1.9;
          this.body.add(wing);
        }
        break;
      }
      case 'nova': { // pop star: side ponytail, headset + mic, star pin
        const headM = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skin);
        H.add(headM);
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
          toonMat(0xff6ab8));
        hair.position.y = 0.03; H.add(hair);
        const ponytail = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8), toonMat(0xff6ab8));
        ponytail.position.set(-0.26, 0.05, -0.16); ponytail.rotation.z = 0.7; H.add(ponytail);
        // headset band + earcup + mic boom
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 12, Math.PI), toonMat(0x222228));
        band.rotation.z = 0; band.position.y = 0.08; band.rotation.y = Math.PI / 2; H.add(band);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 8), toonMat(0xff6ab8, { emissive: 0x501030 }));
        cup.rotation.z = Math.PI / 2; cup.position.set(0.26, 0.06, 0); H.add(cup);
        const mic = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.16, 4, 6), toonMat(0x222228));
        mic.position.set(0.19, -0.12, 0.2); mic.rotation.z = 0.9; H.add(mic);
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), new THREE.MeshBasicMaterial({ color: 0xffe94a }));
        star.position.set(0.16, 0.27, 0.14); H.add(star);
        this.addEye2(H, -1, { y: 0.07, z: 0.26, iris: 0x8a2a8a, r: 0.095 });
        this.addEye2(H, 1, { y: 0.07, z: 0.26, iris: 0x8a2a8a, r: 0.095 });
        this.addSmile(H, -0.1, 0.25, 0.13);
        this.addCheeks(H, 0xff8ab0);
        break;
      }
      case 'gus': { // dwarf: braided beard + golden helm
        const headM = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 10), skin);
        H.add(headM);
        const beard = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), toonMat(0xc8603a));
        beard.scale.set(1.2, 1.35, 0.75);
        beard.position.set(0, -0.2, 0.14); H.add(beard);
        const helm = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
          toonMat(0xd8b23a));
        helm.position.y = 0.05; H.add(helm);
        const rivet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.06), toonMat(0x8a6a1a));
        rivet.position.set(0, 0.13, 0.28); H.add(rivet);
        this.addEye2(H, -1, { y: 0.05, z: 0.27 }); this.addEye2(H, 1, { y: 0.05, z: 0.27 });
        this.addBrows(H, 0x8a3a1a, 0.16, 0.26, 0.35, 0.15);
        break;
      }
      case 'tiki': { // volcano golem: rock cube head, lava cracks, ember top
        const headM = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.42), toonMat(0x3a2e28));
        H.add(headM);
        // deep-set glowing eyes (rect visor slits)
        for (const s of [-1, 1]) {
          const socket = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.06), toonMat(0x1a120e));
          socket.position.set(s * 0.11, 0.08, 0.2); H.add(socket);
          const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.05), new THREE.MeshBasicMaterial({ color: 0xffb63a }));
          eye.position.set(s * 0.11, 0.08, 0.23); H.add(eye);
          const brow = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.06, 0.06), toonMat(0x241a14));
          brow.position.set(s * 0.11, 0.18, 0.21); brow.rotation.z = -s * 0.35; H.add(brow);
        }
        // lava crack mouth
        const crack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xff7a2a }));
        crack.position.set(0, -0.1, 0.21); H.add(crack);
        const crack2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), new THREE.MeshBasicMaterial({ color: 0xff5a2a }));
        crack2.position.set(0.13, 0.0, 0.21); crack2.rotation.z = 0.4; H.add(crack2);
        const ember = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a2a }));
        ember.scale.y = 1.5;
        ember.position.y = 0.32; H.add(ember);
        break;
      }
      case 'bruiser': { // boxing bear: round head, little ears, muzzle, headband
        const headM = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 10), toonMat(0x9a6a3a));
        H.add(headM);
        for (const s of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toonMat(0x8a5a30));
          ear.position.set(s * 0.22, 0.26, 0); H.add(ear);
          const inner = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), toonMat(0xd8b088));
          inner.position.set(s * 0.22, 0.26, 0.05); H.add(inner);
        }
        const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), toonMat(0xd8b088));
        muzzle.scale.set(1.2, 0.85, 1);
        muzzle.position.set(0, -0.06, 0.24); H.add(muzzle);
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1c1418 }));
        nose.scale.set(1.3, 0.9, 0.8);
        nose.position.set(0, -0.01, 0.37); H.add(nose);
        // red boxing headband with a knot
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.045, 6, 14), toonMat(0xd84040));
        band.rotation.x = Math.PI / 2; band.position.y = 0.13; band.scale.z = 0.8; H.add(band);
        const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), toonMat(0xb83030));
        knot.position.set(0.24, 0.1, -0.1); H.add(knot);
        this.addEye2(H, -1, { y: 0.09, z: 0.27, iris: 0x2a1a0a }); this.addEye2(H, 1, { y: 0.09, z: 0.27, iris: 0x2a1a0a });
        this.addBrows(H, 0x5a3a1a, 0.2, 0.26, 0.4, 0.15);
        break;
      }
      case 'magnus': { // knight: riveted full helm, glowing visor, twin plume
        const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.42, 12), toonMat(0xb8c0cc));
        H.add(helm);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
          toonMat(0xc8d0dc));
        dome.position.y = 0.21; H.add(dome);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.09, 0.06), new THREE.MeshBasicMaterial({ color: 0x18181e }));
        visor.position.set(0, 0.06, 0.25); H.add(visor);
        // glowing cyan slits inside the visor
        for (const s of [-1, 1]) {
          const slit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.03), new THREE.MeshBasicMaterial({ color: 0x4ae0ff }));
          slit.position.set(s * 0.1, 0.06, 0.28); H.add(slit);
        }
        // rivets along the helm
        for (const s of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            const riv = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), toonMat(0x707a88));
            riv.position.set(s * 0.24, 0.12 - i * 0.11, 0.1); H.add(riv);
          }
        }
        // twin plume
        for (const s of [-1, 1]) {
          const plume = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 6), toonMat(0xe8324a));
          plume.position.set(s * 0.07, 0.45, -0.05); plume.rotation.x = -0.3; plume.rotation.z = s * 0.18; H.add(plume);
        }
        break;
      }
      case 'gigi': { // mammoth calf: segmented trunk, tusks, big soft ears
        const headM = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), toonMat(0xc8a88a));
        H.add(headM);
        // trunk: two segments curving down
        const trunk1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.2, 4, 8), toonMat(0xb8987a));
        trunk1.position.set(0, -0.1, 0.3); trunk1.rotation.x = 1.0; H.add(trunk1);
        const trunk2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.16, 4, 8), toonMat(0xb8987a));
        trunk2.position.set(0, -0.26, 0.42); trunk2.rotation.x = 1.7; H.add(trunk2);
        for (const s of [-1, 1]) {
          const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.32, 6), toonMat(0xf2ead8));
          tusk.position.set(s * 0.17, -0.1, 0.26); tusk.rotation.x = 0.9; tusk.rotation.z = s * 0.35; H.add(tusk);
          const ear = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), toonMat(0xb8987a, { side: THREE.DoubleSide }));
          ear.position.set(s * 0.3, 0.08, -0.02); ear.rotation.y = s * 1.2; H.add(ear);
          const earIn = new THREE.Mesh(new THREE.CircleGeometry(0.13, 8), toonMat(0xe8c8b0, { side: THREE.DoubleSide }));
          earIn.position.set(s * 0.3, 0.08, -0.015); earIn.rotation.y = s * 1.2; H.add(earIn);
        }
        // hair tuft on top
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), toonMat(0x8a6a4a));
        tuft.position.set(0, 0.33, 0.05); tuft.rotation.x = 0.3; H.add(tuft);
        this.addEye2(H, -1, { x: 0.13, y: 0.09, z: 0.27, iris: 0x3a2a1a, r: 0.085 });
        this.addEye2(H, 1, { x: 0.13, y: 0.09, z: 0.27, iris: 0x3a2a1a, r: 0.085 });
        this.addCheeks(H, 0xe8a89a);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- API

  setKartColor(hex: number): void {
    for (const m of this.chassisMats) m.color.setHex(hex);
  }

  /** Rainbow flash while a star-core boost is active. */
  setStarTint(t: number | null): void {
    for (const m of this.materials) {
      if (t == null) {
        m.emissive?.setHex((m as any).__baseEmissive ?? 0);
      } else {
        m.emissive?.setHSL((t * 0.5) % 1, 0.9, 0.4);
      }
    }
  }

  setAnim(a: KartAnim): void {
    if (a !== this.anim) { this.anim = a; this.animT = 0; }
  }

  /** Register an externally-created drift trail/flame mesh. */
  addTrailMesh(m: THREE.Mesh): void { this.trailMeshes.push(m); }

  /** Landing impulse for the suspension spring. */
  land(strength: number): void { this.bounceVel = -Math.min(1.4, strength * 0.08); }

  update(dt: number, t: number, v: VisualState): void {
    this.animT += dt;

    // suspension spring (visual) — the ground drift engages with a weight
    // pop (no hop: the kart squats and digs in instead of leaving the road)
    this.bounceVel += ((-this.bounce - v.driftKick * 0.16) * 90 - this.bounceVel * 12) * dt;
    this.bounce += this.bounceVel * dt;
    if (this.wasAirborne && v.grounded) { this.bounceVel = -1.2; }
    this.wasAirborne = v.airborne;

    // wheels
    const spin = v.speedRatio * 22 * dt;
    for (const w of this.wheels) w.rotation.x -= spin;
    // NOTE steering sign: positive steer = right on screen = yaw decreases,
    // so the front wheels visually counter-rotate to point into the turn.
    for (const f of this.frontWheels) f.rotation.y = -v.steer * 0.38;
    // GLB-detected wheels: same animation, applied to model nodes
    for (const w of this.glbWheels) w.rotation.x -= spin;
    for (const f of this.glbFrontWheels) {
      f.rotation.y = (this.glbSteerBase.get(f) ?? 0) - v.steer * 0.38;
    }

    // body roll + drift lean + idle bob + stunt rotation
    const driftLean = v.drifting ? 0.16 : 0;
    // stunt: full 360° over the trick progress (flip or barrel roll)
    let trickRollZ = 0, trickPitchX = 0;
    if (v.trickSpin > 0) {
      const ang = v.trickSpin * Math.PI * 2;
      if (v.trickKind === 0) trickPitchX = -ang;                 // front flip
      else trickRollZ = (v.trickKind === 1 ? 1 : -1) * ang;      // barrel roll
    }
    this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, -v.steer * (0.055 + driftLean), 0.5) + trickRollZ;
    this.body.position.y = this.bounce + (v.grounded ? Math.sin(t * 9) * 0.012 * (0.3 + v.speedRatio) : 0);
    // gliding: nose up under the canopy (after the stunt rotation settles)
    const glidePitch = v.glider > 0 ? 0.14 * v.glider : 0;
    this.body.rotation.x = (v.boost ? -0.03 : 0.01) + trickPitchX + glidePitch;

    // ---- glider / parachute ------------------------------------------------
    this.glider.visible = v.glider > 0.001;
    if (v.glider > 0.001) {
      // springy pop with a little overshoot
      const p = v.glider;
      const overshoot = 1 + Math.sin(Math.min(1, p) * Math.PI) * 0.18;
      const pop = THREE.MathUtils.lerp(0.18, 1, p) * overshoot;
      this.glider.scale.setScalar(pop);
      this.glider.rotation.z = Math.sin(t * 2.1) * 0.07 - v.steer * 0.22;
      this.glider.rotation.x = -0.1 + Math.sin(t * 1.6) * 0.035;
      this.glider.position.y = 2.5 + Math.sin(t * 1.3) * 0.06;
    }

    // character animation
    const lean = v.steer * 0.22 + (v.drifting ? 0.3 : 0);
    this.torso.rotation.z = THREE.MathUtils.lerp(this.torso.rotation.z, -lean, dt * 8);
    this.torso.rotation.x = (v.boost ? -0.12 : 0.05 + Math.sin(t * 4) * 0.02) + (v.glider > 0 ? -0.1 * v.glider : 0);
    this.head.rotation.z = -lean * 0.5;
    this.head.rotation.y = lean * 0.8;
    // hands follow the wheel through the turn (subtle but sells the drive);
    // under the canopy both arms reach UP to the risers (MK glider pose)
    const wheelTurn = v.steer * 0.3 + (v.drifting ? Math.sign(v.steer || 1) * 0.18 : 0);
    this.armL.rotation.y = THREE.MathUtils.lerp(this.armL.rotation.y, wheelTurn, dt * 10);
    this.armR.rotation.y = THREE.MathUtils.lerp(this.armR.rotation.y, wheelTurn, dt * 10);
    if (v.glider > 0.01 && this.anim === 'idle') {
      const up = v.glider;
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, 2.25 * up, dt * 9);
      this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, -2.25 * up, dt * 9);
    }
    // chin tuck at full boost, alert bob while drifting
    this.head.rotation.x = (v.boost ? 0.14 : 0) + Math.sin(t * (v.drifting ? 11 : 3.2)) * (v.drifting ? 0.05 : 0.02);

    if (this.anim === 'victory') {
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, 2.6, dt * 6);
      this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, -2.6, dt * 6);
      this.characterRoot.position.y = this.seatY + Math.abs(Math.sin(this.animT * 6)) * 0.22;
      this.head.rotation.x = -0.3;
    } else if (this.anim === 'defeat') {
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, 0.9, dt * 4);
      this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, -0.9, dt * 4);
      this.torso.rotation.x = 0.35;
      this.head.rotation.x = 0.5;
    } else if (this.anim === 'hit') {
      const shake = Math.sin(this.animT * 40) * 0.12 * Math.max(0, 1 - this.animT * 2);
      this.head.rotation.z += shake;
      this.torso.rotation.z += shake * 0.6;
      if (this.animT > 0.5) this.anim = 'idle';
    } else {
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, 0.1, dt * 8);
      this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, -0.1, dt * 8);
      this.characterRoot.position.y = this.seatY;
    }

    // boost flames
    const flameOn = v.boost;
    for (const f of this.boostFlames) {
      f.visible = flameOn;
      if (flameOn) {
        f.scale.set(1 + Math.sin(t * 30) * 0.25, 1 + Math.sin(t * 24) * 0.3, 1);
        (f.material as THREE.MeshBasicMaterial).color.setHSL(0.08 + Math.sin(t * 20) * 0.02, 1, 0.6);
      }
    }
    for (const e of this.exhausts) {
      (e.material as THREE.MeshLambertMaterial).emissive.setHex(flameOn ? 0xaa5500 : 0x220000);
    }

    // hit flash tint
    const flash = this.anim === 'hit' ? 0.7 * Math.max(0, 1 - this.animT * 2) : 0;
    for (const m of this.materials) {
      if (!(m as any).__baseEmissive) (m as any).__baseEmissive = (m.emissive.getHex?.() ?? 0);
      m.emissive?.setHex((m as any).__baseEmissive | ((flash > 0) ? 0x662222 : 0));
    }
  }

  dispose(): void {
    this.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}
