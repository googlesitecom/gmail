/**
 * APEX KART — Runtime GLB model library.
 *
 * Optional drop-in 3D models for karts & drivers. Everything is graceful:
 * if a file is missing, malformed or the manifest doesn't exist, the game
 * falls back to the procedural visuals without a hitch.
 *
 * USAGE
 *  1. Drop .glb files into  public/models/   (served at /models/<file>)
 *  2. Describe them in      public/models/manifest.json:
 *     {
 *       "kart":   "models/standard_kart.glb",   // shared chassis (tinted per racer color)
 *       "kartYaw": 0,                            // degrees: rotate model to face +Z
 *       "tint": "dominant",                      // chassis color mode: dominant|named|none
 *       "characters": {
 *         "zippy":  "models/mario.glb",          // driver figure (seated / standing)
 *         "rex":    { "file": "models/dk.glb", "includesKart": false },
 *         "magnus": { "file": "models/bowser.glb", "includesKart": true }
 *       },
 *       "props": { "tree": "models/tree.glb" }   // optional prop overrides
 *     }
 *  3. That's it — karts, showroom, ghosts and AI drivers pick them up on
 *     the next session start (loading begins at boot, menus cover the wait).
 *
 * Normalization (any export works):
 *  - kart models are fitted to a 3.6 × 2.2 × 2.0 m box, grounded at y=0,
 *    centered on x/z, facing +Z (apply kartYaw if the export faces another way)
 *  - driver models are fitted to 1.15 m height and seated at y=0 of the cockpit
 *  - wheels are detected by node name (wheel|rueda|tire|tyre); if the model
 *    ships ≥3, they spin & steer with the race animation; otherwise the
 *    procedural wheels are re-used so nothing ever looks dead
 *  - "tint:dominant" re-colors the most-used material to the racer's chassis
 *    color; "named" only re-colors materials called chassis/body/paint;
 *    "none" keeps the authored colors
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { publicAsset } from '../core/Paths';

export interface KartModelMeta {
  /** wheel nodes found by name (empty if the model has none detectable) */
  wheels: THREE.Object3D[];
  /** subset of wheels with local z > 0 (front axle → steering) */
  frontWheels: THREE.Object3D[];
  /** fitted rear z extent (for exhaust flame placement) */
  rearZ: number;
  /** materials safe to re-color with the racer chassis color */
  tintables: THREE.Material[];
  /** the model ships its own wheels → do NOT add procedural ones */
  modelWheels: boolean;
  /** cockpit seat anchor in fitted kart space (character root offset) */
  seat: { x: number; y: number; z: number; scale?: number };
}

interface ManifestEntry {
  file: string;
  includesKart?: boolean;
}
type CharacterSpec = string | ManifestEntry;

interface Manifest {
  kart?: string;
  kartYaw?: number;
  tint?: 'dominant' | 'named' | 'none';
  /** custom fit box for the kart chassis (meters) */
  kartBox?: { l: number; w: number; h: number };
  /** the model includes its own wheels */
  modelWheels?: boolean;
  /** cockpit seat anchor in fitted space (where the driver sits) */
  seat?: { x: number; y: number; z: number; scale?: number };
  characters?: Record<string, CharacterSpec>;
  props?: Record<string, string>;
}

const KART_BOX = { l: 3.6, w: 2.2, h: 2.0 };
const DEFAULT_SEAT = { x: 0, y: 0.6, z: -0.3 };
const DRIVER_HEIGHT = 1.15;
const WHEEL_NAME_RE = /(wheel|rueda|tire|tyre)/i;
const NAMED_TINT_RE = /(chassis|body|paint|carroceria|principal)/i;

export class ModelLibrary {
  private static instance: ModelLibrary | null = null;
  static get(): ModelLibrary {
    if (!ModelLibrary.instance) ModelLibrary.instance = new ModelLibrary();
    return ModelLibrary.instance;
  }

  private manifest: Manifest = {};
  private manifestLoaded = false;
  private cache = new Map<string, THREE.Object3D | null>();
  private pending = new Map<string, Promise<THREE.Object3D | null>>();
  private loader = new GLTFLoader();
  private booted = false;

  /** Kick off manifest + model loading (call once at boot; never throws). */
  init(): Promise<void> {
    if (this.booted) return Promise.resolve();
    this.booted = true;
    return (async () => {
      try {
        const res = await fetch(publicAsset('models/manifest.json'));
        if (res.ok) this.manifest = await res.json();
      } catch { /* no manifest — procedural everything */ }
      this.manifestLoaded = true;
      const jobs: Promise<unknown>[] = [];
      if (this.manifest.kart) jobs.push(this.load(this.manifest.kart));
      for (const spec of Object.values(this.manifest.characters ?? {})) {
        const file = typeof spec === 'string' ? spec : spec.file;
        jobs.push(this.load(file));
      }
      for (const file of Object.values(this.manifest.props ?? {})) {
        jobs.push(this.load(file));
      }
      await Promise.allSettled(jobs);
    })();
  }

  get ready(): boolean { return this.manifestLoaded; }

  private async load(file: string): Promise<THREE.Object3D | null> {
    if (this.cache.has(file)) return this.cache.get(file) ?? null;
    if (this.pending.has(file)) return this.pending.get(file)!;
    const p = (async () => {
      try {
        const gltf = await this.loader.loadAsync(publicAsset(file));
        const root = gltf.scene;
        root.traverse(o => {
          const m = o as THREE.Mesh;
          if (m.isMesh) { m.castShadow = true; m.frustumCulled = true; }
        });
        this.cache.set(file, root);
        return root;
      } catch (e) {
        console.warn(`[ModelLibrary] no se pudo cargar ${file} — usando visual procedural`, e);
        this.cache.set(file, null);
        return null;
      }
    })();
    this.pending.set(file, p);
    const r = await p;
    this.pending.delete(file);
    return r;
  }

  // ---------------------------------------------------------------- kart slot

  /** Clone + normalize the shared kart chassis. Null → procedural kart. */
  kartTemplate(): { scene: THREE.Object3D; meta: KartModelMeta } | null {
    if (!this.manifest.kart) return null;
    const src = this.cache.get(this.manifest.kart) ?? null;
    if (!src) return null;
    const scene = src.clone(true);
    // re-clone materials so per-racer tinting never bleeds across karts
    scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone();
    });
    const box = { ...KART_BOX, ...this.manifest.kartBox };
    fitBox(scene, box.l, box.w, box.h);
    const yaw = THREE.MathUtils.degToRad(this.manifest.kartYaw ?? 0);
    if (yaw) rotateAboutCenterY(scene, yaw);
    const { wheels, frontWheels } = collectWheels(scene);
    const tintables: THREE.Material[] = [];
    if (this.manifest.tint !== 'none') {
      collectTintables(scene, tintables, this.manifest.tint ?? 'dominant');
    }
    const rearZ = rearExtent(scene);
    const modelWheels = !!this.manifest.modelWheels || wheels.length >= 3;
    const seat = { ...DEFAULT_SEAT, ...this.manifest.seat };
    if (this.manifest.seat?.scale !== undefined) seat.scale = this.manifest.seat.scale;
    else seat.scale = 1;
    return { scene, meta: { wheels, frontWheels, rearZ, tintables, modelWheels, seat } };
  }

  // ------------------------------------------------------------- driver slot

  /** Clone + normalize a character model. Null → procedural character. */
  driverTemplate(characterId: string): { scene: THREE.Object3D; includesKart: boolean } | null {
    const spec = this.manifest.characters?.[characterId];
    if (!spec) return null;
    const file = typeof spec === 'string' ? spec : spec.file;
    const includesKart = typeof spec === 'object' ? !!spec.includesKart : false;
    const src = this.cache.get(file) ?? null;
    if (!src) return null;
    const scene = src.clone(true);
    if (includesKart) {
      fitBox(scene, KART_BOX.l, KART_BOX.w, KART_BOX.h);
      return { scene, includesKart: true };
    }
    fitHeight(scene, DRIVER_HEIGHT);
    return { scene, includesKart: false };
  }

  // --------------------------------------------------------------- prop slot

  propTemplate(name: string): THREE.Object3D | null {
    const file = this.manifest.props?.[name];
    if (!file) return null;
    const src = this.cache.get(file) ?? null;
    return src ? src.clone(true) : null;
  }
}

// ============================================================== normalization

/** Fit an object inside a L×W×H box (Z length, X width, Y height), grounded & centered. */
function fitBox(obj: THREE.Object3D, l: number, w: number, h: number): void {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  if (size.lengthSq() < 1e-9) return;
  const scale = Math.min(l / Math.max(size.z, 1e-4), w / Math.max(size.x, 1e-4), h / Math.max(size.y, 1e-4));
  const center = box.getCenter(new THREE.Vector3());
  obj.scale.multiplyScalar(scale);
  obj.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  obj.updateMatrixWorld(true);
}

/** Scale to a target height, grounded & centered on x/z. */
function fitHeight(obj: THREE.Object3D, height: number): void {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  if (size.y < 1e-4) return;
  const scale = height / size.y;
  const center = box.getCenter(new THREE.Vector3());
  obj.scale.multiplyScalar(scale);
  obj.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  obj.updateMatrixWorld(true);
}

/** Rotate an already-fitted object around its own center (keeps ground contact). */
function rotateAboutCenterY(obj: THREE.Object3D, yaw: number): void {
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  const parent = obj.parent;
  pivot.add(obj);
  obj.position.set(0, 0, 0);
  pivot.position.copy(center);
  pivot.rotation.y = yaw;
  parent?.add(pivot);
  pivot.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(pivot);
  pivot.position.y -= box2.min.y;
  pivot.updateMatrixWorld(true);
}

/** Find wheel nodes by name; split front (z>0) / rear. */
function collectWheels(root: THREE.Object3D): { wheels: THREE.Object3D[]; frontWheels: THREE.Object3D[] } {
  const wheels: THREE.Object3D[] = [];
  const frontWheels: THREE.Object3D[] = [];
  root.traverse(o => {
    if (!o.name || !WHEEL_NAME_RE.test(o.name)) return;
    const world = new THREE.Vector3();
    o.getWorldPosition(world);
    wheels.push(o);
    if (world.z > 0.1) frontWheels.push(o);
  });
  return { wheels, frontWheels };
}

/**
 * Materials eligible for chassis recolor.
 *  - "named": only materials whose name matches chassis/body/paint
 *  - "dominant": the material covering the most meshes (fallback: named)
 */
function collectTintables(root: THREE.Object3D, out: THREE.Material[], mode: 'dominant' | 'named'): void {
  const byName: THREE.Material[] = [];
  const usage = new Map<THREE.Material, number>();
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (!(mat as THREE.MeshStandardMaterial).color) continue;
      usage.set(mat, (usage.get(mat) ?? 0) + 1);
      if (mat.name && NAMED_TINT_RE.test(mat.name)) byName.push(mat);
    }
  });
  if (mode === 'named') { out.push(...byName); return; }
  if (byName.length) { out.push(...byName); return; }
  let best: THREE.Material | null = null; let bestN = 0;
  for (const [mat, n] of usage) if (n > bestN) { best = mat; bestN = n; }
  if (best) out.push(best);
}

function rearExtent(root: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(root);
  return box.min.z;
}
