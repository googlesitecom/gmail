/**
 * APEX GP — Circuit world builder.
 *
 * From the circuit control points, builds:
 *  - the asphalt ribbon (per-sample half width) with white edge lines
 *  - red/white kerbs on corner insides/outsides (curvature-detected)
 *  - run-off areas (asphalt / gravel traps) on corner outsides
 *  - grass skirt with anti-fold clamping (parallel sections never overlap)
 *  - barrier walls at the run-off edge (physics clamp + visuals)
 *  - grid boxes, checkered line, sector lines, DRS boards, brake markers
 *  - pit building, grandstands, marshal posts, trees & env backdrop
 *  - start-light gantry (RaceManager drives setStartLights)
 *
 * groundQuery() is the single source of truth for the physics.
 */

import * as THREE from 'three';
import type { CircuitDef, CircuitPoint, Weather } from '../core/Types';
import { Spline } from '../tracks/Spline';
import { clamp } from '../core/MathUtils';
import { computeRacingLine, type F1RacingLine } from './RacingLine';
import type { F1Car, F1GroundInfo, Surface } from './F1Car';
import { PHYS, WEATHER } from '../core/Config';
import { F1Assets } from './F1Assets';
import {
  asphaltTexture, asphaltRoughness, asphaltRoughnessWet, kerbTexture, runoffTexture,
  grassTexture, gravelTexture, crowdTexture, boardTexture, checkerTexture, foliageTexture,
} from './Textures';

export const SAMPLES = 480;
const KERB_W = 1.9;
const STRAIGHT_GRASS = 6;       // grass before the wall on straights
const WALL_INSET = 0.4;
const FOLD_ARC_M = 75;          // arc-distance beyond which ribbons can fold
const WALL_THICK_CONC = 0.62;   // visual barrier thickness (solid boxes)
const WALL_THICK_TIRE = 0.55;
/** effective car half-width against walls */
const WALL_CAR_R = 1.02;

export interface F1EnvStyle {
  skyTop: number; skyBottom: number;
  sunColor: number; sunIntensity: number; sunDir: [number, number, number];
  hemiSky: number; hemiGround: number; hemiIntensity: number;
  fog: number; fogNear: number; fogFar: number;
  exposure: number;
}

export const ENV_STYLES: Record<CircuitDef['env'], F1EnvStyle> = {
  temperate: {
    skyTop: 0x5f83c8, skyBottom: 0xdccba6,
    sunColor: 0xffdcae, sunIntensity: 3.9, sunDir: [0.62, 0.42, 0.28],
    hemiSky: 0xbcd0f0, hemiGround: 0x4a5238, hemiIntensity: 0.55,
    fog: 0xd4d2c8, fogNear: 300, fogFar: 1550, exposure: 1.02,
  },
  coast: {
    skyTop: 0x3f7ed2, skyBottom: 0xcfe8f4,
    sunColor: 0xfff4dc, sunIntensity: 4.1, sunDir: [0.5, 0.62, 0.35],
    hemiSky: 0xcfe2f6, hemiGround: 0x8a8f7a, hemiIntensity: 0.6,
    fog: 0xd8e9f2, fogNear: 350, fogFar: 1650, exposure: 1.0,
  },
  alpine: {
    skyTop: 0x4a72c8, skyBottom: 0xe6ecf4,
    sunColor: 0xf2f6ff, sunIntensity: 3.7, sunDir: [0.55, 0.5, -0.3],
    hemiSky: 0xd6e4f6, hemiGround: 0x50604a, hemiIntensity: 0.65,
    fog: 0xe2ecf6, fogNear: 280, fogFar: 1500, exposure: 1.0,
  },
};

export interface GridSlot { pos: THREE.Vector3; yaw: number; s: number; }

export class F1CircuitWorld {
  readonly def: CircuitDef;
  readonly style: F1EnvStyle;
  readonly spline: Spline;
  readonly group = new THREE.Group();
  readonly minimap: { x: number; z: number }[];
  readonly gridSlots: GridSlot[] = [];
  readonly racingLine: F1RacingLine;
  readonly spawnPoints: THREE.Vector3[] = [];
  /** selected weather ('clear' default — retro-compatible) */
  readonly weather: Weather;
  /** grip scale from weather (rain) — Game applies it to every car */
  readonly weatherGrip: number;
  /** night race: floodlight mast head positions (Game drives spotlights) */
  readonly floodHeads: THREE.Vector3[] = [];

  // per-sample world facts
  private kerbL: Uint8Array;
  private kerbR: Uint8Array;
  private runoffType: Surface[];          // 'runoff' (asphalt) | 'gravel' | 'grass'
  private runoffEff: Float32Array;        // effective width (fold-clamped)
  private runoffSide: Int8Array;          // +1 right outside, -1 left outside
  private wallL: Float32Array;
  private wallR: Float32Array;
  private curvature: Float32Array;        // signed: + = left turn (yaw+)
  private ctrlRunoff: (CircuitPoint | undefined)[];
  /** samples of OTHER track sections closer than 95 m (facing walls) */
  private neighbors: number[][] = [];

  private disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  private lightPods: THREE.Mesh[] = [];
  private crowdMats: THREE.MeshBasicMaterial[] = [];
  private assistGroup: THREE.Group | null = null;

  constructor(def: CircuitDef, decorScale: number, crowdScale: number, weather: Weather = 'clear') {
    this.def = def;
    this.style = ENV_STYLES[def.env];
    this.weather = weather;
    this.weatherGrip = weather === 'rain' ? WEATHER.rainGrip : 1;
    this.spline = new Spline(def.points, SAMPLES, def.halfWidth);
    this.minimap = this.spline.minimapPolyline();
    const N = SAMPLES;

    // control-point runoff per sample (via the original Catmull segment mapping)
    const nCtrl = def.points.length;
    this.ctrlRunoff = def.points.map(p => p);
    this.runoffType = new Array(N).fill('grass');
    this.runoffEff = new Float32Array(N);
    this.runoffSide = new Int8Array(N);
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const seg = Math.min(nCtrl - 1, Math.floor(t * nCtrl));
      const lt = t * nCtrl - seg;
      const a = def.points[seg], b = def.points[(seg + 1) % nCtrl];
      const wA = a.runoffW ?? 0, wB = b.runoffW ?? 0;
      const w = wA + (wB - wA) * lt;
      const type = lt < 0.5 ? (a.runoff ?? 'grass') : (b.runoff ?? 'grass');
      this.runoffEff[i] = w;
      this.runoffType[i] = type === 'asphalt' ? 'runoff' : type === 'gravel' ? 'gravel' : 'grass';
    }

    // signed curvature per sample
    this.curvature = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = this.spline.samples[i];
      const b = this.spline.samples[(i + 4) % N];
      const cross = a.tangent.x * b.tangent.z - a.tangent.z * b.tangent.x;
      const turn = Math.asin(clamp(-cross, -1, 1));       // + = yaw+ = left
      this.curvature[i] = turn / Math.max(1, this.spline.length / N * 4);
    }
    // smooth curvature
    const curvS = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let acc = 0;
      for (let k = -3; k <= 3; k++) acc += this.curvature[(i + k + N) % N];
      curvS[i] = acc / 7;
    }
    this.curvature = curvS;

    // kerb masks: |curv| above threshold, dilated ±10 samples
    this.kerbL = new Uint8Array(N);
    this.kerbR = new Uint8Array(N);
    const KERB_K = 0.0042;
    for (let i = 0; i < N; i++) {
      if (Math.abs(this.curvature[i]) > KERB_K) {
        for (let k = -10; k <= 10; k++) {
          const j = (i + k + N) % N;
          this.kerbL[j] = 1;
          this.kerbR[j] = 1;
        }
      }
    }
    // runoff side: outside of the corner
    for (let i = 0; i < N; i++) {
      this.runoffSide[i] = this.curvature[i] > 0 ? 1 : -1;   // left turn → outside is right
    }

    // anti-fold: min distance to a non-neighbor ribbon section
    const minD = new Float32Array(N).fill(Infinity);
    const spacing = this.spline.length / N;
    for (let i = 0; i < N; i++) {
      const pi = this.spline.samples[i].pos;
      for (let j = i + 1; j < N; j++) {
        const arc = Math.min(j - i, N - (j - i)) * spacing;
        if (arc < FOLD_ARC_M) continue;
        const d = pi.distanceTo(this.spline.samples[j].pos);
        if (d < minD[i]) minD[i] = d;
        if (d < minD[j]) minD[j] = d;
      }
    }

    // neighbor sections within 95 m — their facing walls must also collide
    // (the OLD single-projection clamp only tested the wall of the section
    // you projected onto: at seams between facing sections you slipped
    // straight through into the infield — "too easy to cross the barriers")
    for (let i = 0; i < N; i++) {
      const list: number[] = [];
      const pi = this.spline.samples[i].pos;
      for (let j = 0; j < N; j++) {
        const arc = Math.min(Math.abs(j - i), N - Math.abs(j - i)) * spacing;
        if (arc < FOLD_ARC_M) continue;
        if (pi.distanceTo(this.spline.samples[j].pos) < 95) list.push(j);
      }
      this.neighbors.push(list);
    }

    // effective widths + wall positions
    this.wallL = new Float32Array(N);
    this.wallR = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const hw = this.spline.samples[i].halfWidth;
      const foldRoom = isFinite(minD[i]) ? minD[i] / 2 - hw - 2 : 40;
      this.runoffEff[i] = clamp(this.runoffEff[i], 0, Math.max(2, Math.min(foldRoom, 34)));
      const side = this.runoffSide[i];
      const runoff = this.runoffEff[i] > 1.5 ? this.runoffEff[i] : STRAIGHT_GRASS;
      // walls: runoff edge on the outside, grass band on the inside of corners
      const wallRt = hw + KERB_W + (side > 0 ? runoff : STRAIGHT_GRASS) + WALL_INSET;
      const wallLf = hw + KERB_W + (side < 0 ? runoff : STRAIGHT_GRASS) + WALL_INSET;
      this.wallR[i] = Math.min(wallRt, hw + Math.max(3, foldRoom) - 1);
      this.wallL[i] = -Math.min(wallLf, hw + Math.max(3, foldRoom) - 1);
    }

    // ---- grid slots (needed by buildLinesAndGrid) ------------------------------
    this.gridSlots.push(...this.computeGridSlots());
    for (const g of this.gridSlots) this.spawnPoints.push(g.pos.clone());

    // ---- build all the meshes ------------------------------------------------
    this.buildRoad();
    this.buildKerbs();
    this.buildRunoffs();
    this.buildGrass();
    this.buildWalls();
    this.buildLinesAndGrid();
    this.buildStartLights();
    this.buildBoards();
    this.buildEnv(decorScale, crowdScale);
    this.buildBackdrop();

    // ---- racing line ------------------------------------------------------------
    // wet weather: the AI profile must match the physics grip or the bots fly
    // off the road in the rain
    this.racingLine = computeRacingLine(this.spline, {
      mu: 1.92 * (weather === 'rain' ? WEATHER.rainLineMu : 1),
      cla: PHYS.claBase, powerW: PHYS.icePower * 0.98,
      mass: PHYS.chassisMass + 60, margin: 1.35,
    });
    this.buildAssistLine();
    this.buildFloodlights();
  }

  // ------------------------------------------------------------------ meshes

  private ribbon(latA: (i: number) => number, latB: (i: number) => number,
    yOff: number, mat: THREE.Material, vScale: number, mask?: (i: number) => boolean): THREE.Mesh {
    const N = SAMPLES;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const usable: boolean[] = [];
    for (let i = 0; i < N; i++) usable[i] = !mask || mask(i);
    // segment i connects sample i → i+1; include if either end usable
    for (let i = 0; i < N; i++) {
      if (!usable[i] && !usable[(i + 1) % N]) continue;
      const a = this.spline.samples[i];
      const b = this.spline.samples[(i + 1) % N];
      const la = latA(i), lb = latB(i);
      const la2 = latA((i + 1) % N), lb2 = latB((i + 1) % N);
      const base = pos.length / 3;
      pos.push(
        a.pos.x + a.right.x * la, a.pos.y + yOff, a.pos.z + a.right.z * la,
        a.pos.x + a.right.x * lb, a.pos.y + yOff, a.pos.z + a.right.z * lb,
        b.pos.x + b.right.x * la2, b.pos.y + yOff, b.pos.z + b.right.z * la2,
        b.pos.x + b.right.x * lb2, b.pos.y + yOff, b.pos.z + b.right.z * lb2,
      );
      const v0 = i * vScale;
      uv.push(0, v0, 1, v0, 0, v0 + vScale, 1, v0 + vScale);
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  /** Real photo texture (shared, never disposed here) or procedural fallback. */
  private roadPhoto(): THREE.Texture | null { return F1Assets.textures?.road ?? null; }

  private buildRoad(): void {
    const photo = this.roadPhoto();
    const tex = photo ?? asphaltTexture();
    const wet = this.weather === 'rain';
    const rough = wet ? asphaltRoughnessWet() : asphaltRoughness();
    // WET ROAD = dielectric water film: near-zero metalness (metal tints the
    // reflection dark; water mirrors the sky bright), LOW roughness, strong
    // env reflections and a CLEARCOAT sheen — the classic wet-asphalt look.
    // The wet roughness map carries mirror PUDDLES so the sky visibly
    // patches on the road even under a flat overcast env.
    const mat = wet
      ? new THREE.MeshPhysicalMaterial({
          map: tex, roughnessMap: rough, roughness: 0.2, metalness: 0.02,
          bumpMap: tex, bumpScale: 0.02,
          envMapIntensity: 2.3, side: THREE.DoubleSide,
          clearcoat: 0.8, clearcoatRoughness: 0.12,
          // LIFTED: the photo asphalt is dark (mean 88/255) — without a >1
          // multiplier the albedo lands ≈0.04 linear = near-black, the road
          // swallows every shadow. 1.1× ≈ sunlit wet tarmac.
          color: photo ? new THREE.Color(1.10, 1.11, 1.15) : 0x6a6c74,
        })
      : new THREE.MeshStandardMaterial({
          map: tex, roughnessMap: rough, roughness: 0.85, metalness: 0.04,
          bumpMap: tex, bumpScale: 0.045,   // micro-relief: aggregate & patches
          envMapIntensity: 0.55, side: THREE.DoubleSide,
          // BRIGHT SUNLIT ASPHALT: photo mean 88/255 × old 0xb4b6ba tint gave
          // albedo 0.044 linear — nearly black, shadows invisible on it.
          // >1 multiplier → albedo ≈0.15: mid-grey tarmac with DEEP readable
          // sun shadows (the user's "realistic sun, everything with shadows")
          color: photo ? new THREE.Color(1.24, 1.24, 1.28) : 0xffffff,
        });
    this.disposables.push(mat, rough);
    if (!photo) this.disposables.push(tex);
    this.ribbon(
      i => -this.spline.samples[i].halfWidth,
      i => this.spline.samples[i].halfWidth,
      0.0, mat, this.spline.length / SAMPLES / 11);
    // white edge lines (wider — thick, readable track limits)
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f6, roughness: 0.7 });
    this.disposables.push(lineMat);
    for (const side of [-1, 1]) {
      this.ribbon(
        i => side * (this.spline.samples[i].halfWidth - 0.62),
        i => side * (this.spline.samples[i].halfWidth - 0.12),
        0.015, lineMat, this.spline.length / SAMPLES / 8);
    }
  }

  private buildKerbs(): void {
    const photo = F1Assets.textures?.kerb ?? null;
    const tex = photo ?? kerbTexture();
    const wet = this.weather === 'rain';
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: wet ? 0.3 : 0.55, metalness: wet ? 0.1 : 0.05,
      envMapIntensity: wet ? 1.6 : 0.7, side: THREE.DoubleSide,
    });
    this.disposables.push(mat);
    if (!photo) this.disposables.push(tex);
    for (const side of [-1, 1]) {
      const mask = side < 0 ? (i: number) => !!this.kerbL[i] : (i: number) => !!this.kerbR[i];
      this.ribbon(
        i => side * this.spline.samples[i].halfWidth,
        i => side * (this.spline.samples[i].halfWidth + KERB_W),
        0.055, mat, this.spline.length / SAMPLES / 1.9, mask);
    }
  }

  private buildRunoffs(): void {
    const asphaltTex = runoffTexture();
    const gravelTex = gravelTexture();
    const wet = this.weather === 'rain';
    const asphaltMat = new THREE.MeshStandardMaterial({
      map: asphaltTex, roughness: wet ? 0.4 : 0.9, metalness: 0.02, envMapIntensity: wet ? 1.2 : 0.5,
      side: THREE.DoubleSide,
    });
    const gravelMat = new THREE.MeshStandardMaterial({ map: gravelTex, roughness: 1.0, metalness: 0, side: THREE.DoubleSide });
    this.disposables.push(asphaltMat, gravelMat, asphaltTex, gravelTex);
    for (const side of [-1, 1]) {
      const mask = (i: number): boolean => {
        const onThisSide = this.runoffSide[i] === side && this.runoffEff[i] > 1.5;
        return onThisSide;
      };
      const asphaltMask = (i: number): boolean => mask(i) && this.runoffType[i] === 'runoff';
      const gravelMask = (i: number): boolean => mask(i) && this.runoffType[i] === 'gravel';
      const from = (i: number): number =>
        side * (this.spline.samples[i].halfWidth + KERB_W);
      const to = (i: number): number =>
        side * (this.spline.samples[i].halfWidth + KERB_W + this.runoffEff[i]);
      // layered ABOVE the grass skirt that now runs underneath everything
      this.ribbon(from, to, -0.012, asphaltMat, this.spline.length / SAMPLES / 12, asphaltMask);
      this.ribbon(from, to, -0.022, gravelMat, this.spline.length / SAMPLES / 9, gravelMask);
    }
  }

  private buildGrass(): void {
    const photo = F1Assets.textures?.grass ?? null;
    const tex = photo ?? grassTexture();
    const wet = this.weather === 'rain';
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 1.0, side: THREE.DoubleSide,
      // LIFTED grass: photo mean 74/255 ≈ 0.07 linear albedo — too dark for
      // sunlit turf. 1.32× ≈ 0.12: fresh green that still takes tree shadows
      color: wet ? new THREE.Color(1.12, 1.18, 1.10) : new THREE.Color(1.32, 1.32, 1.26),
    });
    this.disposables.push(mat);
    if (!photo) this.disposables.push(tex);
    // VERGE FIX: the skirt now runs continuously from the KERB EDGE all the
    // way past the wall — before, it only started AT the wall, leaving a hole
    // between kerb and barrier where you saw the distant ground plane 0.6 m
    // below ("the grass beside the track sits lower"). Also only 3-5 cm
    // below the asphalt instead of a 14 cm cliff.
    for (const side of [-1, 1]) {
      const arr = side < 0 ? this.wallL : this.wallR;
      const y = side < 0 ? -0.05 : -0.035;   // sides differ slightly → no coplanar z-fight
      this.ribbon(
        i => side * (this.spline.samples[i].halfWidth + KERB_W - 0.1),
        i => side < 0
          ? Math.min(arr[i] - 26, -(this.spline.samples[i].halfWidth + KERB_W))
          : Math.max(arr[i] + 26, this.spline.samples[i].halfWidth + KERB_W),
        y, mat, this.spline.length / SAMPLES / 17);
    }
    // distant ground plane (own texture instance — repeat differs)
    const planeTex = photo ? photo.clone() : grassTexture();
    planeTex.repeat.set(200, 200);
    planeTex.needsUpdate = true;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2600, 2600),
      new THREE.MeshStandardMaterial({ map: planeTex, roughness: 1.0, color: new THREE.Color(1.32, 1.32, 1.26) }),
    );
    this.disposables.push(plane.geometry, plane.material as THREE.Material, planeTex);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;           // tree & structure shadows land on the ground
    let minY = Infinity;
    for (const sm of this.spline.samples) minY = Math.min(minY, sm.pos.y);
    plane.position.y = minY - 0.6;
    this.group.add(plane);
  }

  private buildWalls(): void {
    // SOLID THICK BARRIERS: extruded box strips (inner + outer + top faces)
    // instead of a thin plane. The physics matches with true segment
    // collision (wallConstrain) so nothing passes through — even at seams
    // between facing track sections.
    const concrete = new THREE.MeshStandardMaterial({ color: 0xd6d8dc, roughness: 0.78 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.95 });
    const capRed = new THREE.MeshStandardMaterial({ color: 0xc03028, roughness: 0.7 });
    const capWhite = new THREE.MeshStandardMaterial({ color: 0xeceef0, roughness: 0.7 });
    this.disposables.push(concrete, tire, capRed, capWhite);
    const N = SAMPLES;

    /** push a vertical quad (ax,ay,az)-(bx,by,bz)-(cx,cy,cz)-(dx,dy,dz) */
    const quad = (pos: number[], idx: number[], a: number[], b: number[], c: number[], d: number[]): void => {
      const base = pos.length / 3;
      pos.push(...a, ...b, ...c, ...d);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    const build = (arr: Float32Array, side: 1 | -1): void => {
      // bucket geometries: body / red caps / white caps
      const buckets: Record<string, { pos: number[]; idx: number[] }> = {
        conc: { pos: [], idx: [] }, capR: { pos: [], idx: [] }, capW: { pos: [], idx: [] },
        tire: { pos: [], idx: [] },
      };
      for (let i = 0; i < N; i++) {
        const isTire = this.runoffType[i] === 'gravel' && this.runoffSide[i] === side;
        const a = this.spline.samples[i];
        const b = this.spline.samples[(i + 1) % N];
        const la = arr[i], lb = arr[(i + 1) % N];
        const thick = (isTire ? WALL_THICK_TIRE : WALL_THICK_CONC) * side;
        // inner (track-side) & outer faces
        const iax = a.pos.x + a.right.x * la, iaz = a.pos.z + a.right.z * la;
        const oax = a.pos.x + a.right.x * (la + thick), oaz = a.pos.z + a.right.z * (la + thick);
        const ibx = b.pos.x + b.right.x * lb, ibz = b.pos.z + b.right.z * lb;
        const obx = b.pos.x + b.right.x * (lb + thick), obz = b.pos.z + b.right.z * (lb + thick);
        const ay = a.pos.y - 0.12, by = b.pos.y - 0.12;   // sink the base below the grass
        const h = isTire ? 0.95 : 1.15;
        const bucket = isTire ? buckets.tire : buckets.conc;
        // inner face
        quad(bucket.pos, bucket.idx,
          [iax, ay, iaz], [ibx, by, ibz], [ibx, by + h, ibz], [iax, ay + h, iaz]);
        // outer face
        quad(bucket.pos, bucket.idx,
          [oax, ay, oaz], [obx, by, obz], [obx, by + h, obz], [oax, ay + h, oaz]);
        // top face
        quad(bucket.pos, bucket.idx,
          [iax, ay + h, iaz], [ibx, by + h, ibz], [obx, by + h, obz], [oax, ay + h, oaz]);
        // concrete: striped cap rail on top (red/white every 6 segments)
        if (!isTire) {
          const cap = i % 12 < 6 ? buckets.capR : buckets.capW;
          const ch = 0.16;
          quad(cap.pos, cap.idx,
            [iax, ay + h, iaz], [ibx, by + h, ibz], [ibx, by + h + ch, ibz], [iax, ay + h + ch, iaz]);
        }
      }
      const mats: Record<string, THREE.Material> = { conc: concrete, capR: capRed, capW: capWhite, tire };
      for (const [key, bk] of Object.entries(buckets)) {
        if (!bk.pos.length) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(bk.pos, 3));
        geo.setIndex(bk.idx);
        geo.computeVertexNormals();
        this.disposables.push(geo);
        const mesh = new THREE.Mesh(geo, mats[key]);
        mesh.material.side = THREE.DoubleSide;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    };
    build(this.wallR, 1);
    build(this.wallL, -1);
  }

  /** Flat painted quad across the road at progress s. */
  private paintQuad(s: number, mat: THREE.Material, length = 1.4): void {
    const sm = this.spline.sampleAt(s);
    const geo = new THREE.PlaneGeometry(sm.halfWidth * 2, length);
    this.disposables.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(sm.pos.x, sm.pos.y + 0.025, sm.pos.z);
    m.rotation.set(-Math.PI / 2, 0, 0);
    m.rotateZ(-Math.atan2(sm.tangent.x, sm.tangent.z));
    this.group.add(m);
  }

  private buildLinesAndGrid(): void {
    const checker = checkerTexture();
    checker.repeat.set(8, 2);
    const checkerMat = new THREE.MeshStandardMaterial({ map: checker, roughness: 0.8 });
    this.disposables.push(checkerMat, checker);
    this.paintQuad(0.0005, checkerMat, 1.8);
    // sector lines
    const secMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    this.disposables.push(secMat);
    for (const sec of this.def.sectors) this.paintQuad(sec, secMat, 0.9);
    // grid slot L-shapes (local: +Z = car forward)
    const boxMat = new THREE.MeshBasicMaterial({ color: 0xf0f0f0 });
    this.disposables.push(boxMat);
    for (const slot of this.gridSlots) {
      const holder = new THREE.Group();
      holder.position.copy(slot.pos).add(new THREE.Vector3(0, 0.028, 0));
      holder.rotation.y = slot.yaw;
      for (const [ox, oz, w, d] of [[-1.6, 0.6, 0.14, 1.2], [1.6, 0.6, 0.14, 1.2], [0, 1.25, 3.3, 0.14]] as const) {
        const geo = new THREE.PlaneGeometry(w, d);
        this.disposables.push(geo);
        const m = new THREE.Mesh(geo, boxMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(ox, 0, oz);
        holder.add(m);
      }
      this.group.add(holder);
    }
  }

  private buildStartLights(): void {
    const sm = this.spline.sampleAt(0.002);
    const right = sm.right;
    const g = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.7, roughness: 0.4 });
    this.disposables.push(postMat);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 6.4, 8), postMat);
      this.disposables.push(post.geometry);
      post.position.set(sm.pos.x + right.x * side * (sm.halfWidth + 1.4), sm.pos.y + 3.2, sm.pos.z + right.z * side * (sm.halfWidth + 1.4));
      post.castShadow = true;
      g.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(sm.halfWidth * 2 + 3.2, 0.35, 0.35), postMat);
    this.disposables.push(beam.geometry);
    beam.position.set(sm.pos.x, sm.pos.y + 6.3, sm.pos.z);
    beam.rotation.y = Math.atan2(right.x, right.z) + Math.PI / 2;
    g.add(beam);
    // 5 pods across the beam
    const podMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.6 });
    this.disposables.push(podMat);
    const tan = sm.tangent;
    for (let i = 0; i < 5; i++) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.3), podMat);
      this.disposables.push(pod.geometry);
      const off = (i - 2) * 1.05;
      pod.position.set(sm.pos.x + right.x * off, sm.pos.y + 5.6, sm.pos.z + right.z * off);
      pod.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI;   // face the grid (backwards)
      g.add(pod);
      // 2 lamps per pod
      for (const l of [-1, 1]) {
        const lampMat = new THREE.MeshStandardMaterial({
          color: 0x400a0a, emissive: 0xff1a1a, emissiveIntensity: 0, roughness: 0.4,
        });
        this.disposables.push(lampMat);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), lampMat);
        this.disposables.push(lamp.geometry);
        const back = tan.clone().multiplyScalar(-0.18);
        lamp.position.set(pod.position.x + right.x * l * 0.16 + back.x, pod.position.y + l * 0.18, pod.position.z + right.z * l * 0.16 + back.z);
        g.add(lamp);
        this.lightPods.push(lamp);
      }
    }
    this.group.add(g);
  }

  /** 0..5 lit pods (5 = all on, 0 = out → GO). */
  setStartLights(n: number): void {
    this.lightPods.forEach((lamp, i) => {
      const pod = Math.floor(i / 2);
      const mat = lamp.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = pod < n ? 4.2 : 0;
      mat.color.setHex(pod < n ? 0xff2a2a : 0x400a0a);
    });
  }

  private buildBoards(): void {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x8a8d94, metalness: 0.6, roughness: 0.5 });
    this.disposables.push(poleMat);
    const place = (s: number, side: 1 | -1, tex: THREE.Texture, w = 1.6, h = 1.2, tall = 2.6): void => {
      this.disposables.push(tex);
      const sm = this.spline.sampleAt(s);
      const lat = side * (sm.halfWidth + 3.4);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65 });
      this.disposables.push(mat);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      this.disposables.push(board.geometry);
      board.position.set(sm.pos.x + sm.right.x * lat, sm.pos.y + tall, sm.pos.z + sm.right.z * lat);
      board.rotation.y = Math.atan2(sm.tangent.x, sm.tangent.z) + Math.PI;  // face oncoming
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, tall, 6), poleMat);
      this.disposables.push(pole.geometry);
      pole.position.set(sm.pos.x + sm.right.x * lat, sm.pos.y + tall / 2, sm.pos.z + sm.right.z * lat);
      this.group.add(board, pole);
    };
    // DRS zone boards
    for (const z of this.def.drsZones) {
      place(z.detect, 1, boardTexture('drs'));
      place(z.start, 1, boardTexture('drs'));
      place(z.end, -1, boardTexture('chevron'), 1.2, 1.0);
    }
    // brake markers at the biggest stops (curvature jumps ahead)
    const N = SAMPLES;
    const drops: { s: number; drop: number }[] = [];
    for (let i = 0; i < N; i++) {
      const ahead = (i + 12) % N;
      const drop = Math.abs(this.curvature[ahead]) - Math.abs(this.curvature[i]);
      if (drop > 0.009 && Math.abs(this.curvature[i]) < 0.002 && Math.abs(this.curvature[ahead]) > 0.012) {
        drops.push({ s: this.spline.samples[i].s, drop });
      }
    }
    drops.sort((a, b) => b.drop - a.drop);
    const placed = drops.slice(0, 4);
    for (const d of placed) {
      const back100 = ((d.s - 100 / this.spline.length) % 1 + 1) % 1;
      const back50 = ((d.s - 50 / this.spline.length) % 1 + 1) % 1;
      place(back100, 1, boardTexture('brake', '100'), 1.1, 1.3);
      place(back50, 1, boardTexture('brake', '50'), 0.95, 1.15);
    }
  }

  /** True when (x,z) keeps `margin` meters of clearance from EVERY track
   *  section — the anti-"grandstand growing out of the road" check. */
  private clearOfTrack(x: number, z: number, margin: number): boolean {
    const N = SAMPLES;
    for (let j = 0; j < N; j++) {
      const sm = this.spline.samples[j];
      const dx = x - sm.pos.x, dz = z - sm.pos.z;
      const lim = sm.halfWidth + margin;
      if (dx * dx + dz * dz < lim * lim) return false;
    }
    return true;
  }

  private buildEnv(decorScale: number, crowdScale: number): void {
    // ---- pit building along the main straight ------------------------------
    const smMid = this.spline.sampleAt(0.995);
    const side = new THREE.Vector3(-smMid.right.x, 0, -smMid.right.z);   // left of the road
    const lat = smMid.halfWidth + 16;
    const buildYaw = Math.atan2(smMid.tangent.x, smMid.tangent.z) + Math.PI / 2;
    // clearance: the 180 m box must not touch another track section
    let buildOk = true;
    for (let d = -85; d <= 85 && buildOk; d += 17) {
      const x = smMid.pos.x + side.x * lat + smMid.tangent.x * d;
      const z = smMid.pos.z + side.z * lat + smMid.tangent.z * d;
      if (!this.clearOfTrack(x, z, 8)) buildOk = false;
    }
    if (buildOk) {
      const build = new THREE.Mesh(
        new THREE.BoxGeometry(180, 9, 12),
        new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.6, metalness: 0.15 }),
      );
      this.disposables.push(build.geometry, build.material as THREE.Material);
      build.position.set(smMid.pos.x + side.x * lat, smMid.pos.y + 4.5, smMid.pos.z + side.z * lat);
      build.rotation.y = buildYaw;
      build.castShadow = true;
      this.group.add(build);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(179, 2.6, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x9fd4e8, metalness: 0.6, roughness: 0.15, emissive: 0x223844, emissiveIntensity: this.weather === 'night' ? 1.6 : 0.3 }),
      );
      this.disposables.push(glass.geometry, glass.material as THREE.Material);
      glass.position.copy(build.position).add(new THREE.Vector3(side.x * 6.2, 1.2, side.z * 6.2));
      glass.rotation.y = buildYaw;
      this.group.add(glass);
    }

    if (decorScale < 0.3) return;

    // ---- grandstands at the top curvature clusters ---------------------------
    if (crowdScale > 0.25) {
      const N = SAMPLES;
      const hot: number[] = [];
      for (let i = 0; i < N; i += 6) {
        if (Math.abs(this.curvature[i]) > 0.008) hot.push(i);
      }
      const clusters: number[] = [];
      for (const i of hot) {
        if (!clusters.length || this.arcDist(clusters[clusters.length - 1], i) > 34) clusters.push(i);
        if (clusters.length >= 5) break;
      }
      const crowdTex = crowdTexture();
      this.disposables.push(crowdTex);
      for (const i of clusters) {
        const sm = this.spline.samples[i];
        const outSide = this.curvature[i] > 0 ? 1 : -1;
        // push outward until BOTH wing tips clear every track section (a 46 m
        // stand on a hairpin used to curl right across the road)
        let lat = (outSide > 0 ? this.wallR[i] : -this.wallL[i]) + 10;
        let ok = false;
        for (let tries = 0; tries < 4 && !ok; tries++, lat += 14) {
          const px = sm.pos.x + sm.right.x * lat, pz = sm.pos.z + sm.right.z * lat;
          // wing axis ≈ perpendicular to the line from stand to track point
          const dirX = sm.pos.x - px, dirZ = sm.pos.z - pz;
          const dl = Math.hypot(dirX, dirZ) || 1;
          const wx = -dirZ / dl, wz = dirX / dl;
          ok = this.clearOfTrack(px, pz, 5)
            && this.clearOfTrack(px + wx * 21, pz + wz * 21, 6)
            && this.clearOfTrack(px - wx * 21, pz - wz * 21, 6);
        }
        if (!ok) continue;   // no room for a stand here — skip it
        const crowdMat = new THREE.MeshBasicMaterial({ map: crowdTex.clone() });
        crowdMat.map!.repeat.set(9, 3);
        crowdMat.map!.needsUpdate = true;
        this.disposables.push(crowdMat, crowdMat.map!);
        this.crowdMats.push(crowdMat);
        const stand = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(46, 7.5, 12),
          new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 0.85 }),
        );
        this.disposables.push(body.geometry, body.material as THREE.Material);
        body.position.y = 3.4;
        body.castShadow = true;
        stand.add(body);
        const crowd = new THREE.Mesh(new THREE.PlaneGeometry(44, 6), crowdMat);
        this.disposables.push(crowd.geometry);
        crowd.position.set(0, 5.2, 6.2);
        stand.add(crowd);
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(48, 0.5, 13),
          new THREE.MeshStandardMaterial({ color: 0xd8dae0, roughness: 0.6, metalness: 0.2 }),
        );
        this.disposables.push(roof.geometry, roof.material as THREE.Material);
        roof.position.y = 8.4;
        roof.castShadow = true;
        stand.add(roof);
        const dirx = sm.right.x * lat, dirz = sm.right.z * lat;
        stand.position.set(sm.pos.x + dirx, sm.pos.y, sm.pos.z + dirz);
        stand.lookAt(sm.pos.x, sm.pos.y, sm.pos.z);
        this.group.add(stand);
      }
    }

    // ---- trees -----------------------------------------------------------------
    // Mixed woodland: 3-tier flat-shaded conifers + round noise-blob
    // deciduous trees — variety reads as real woodland instead of a cone farm.
    const treeCount = Math.round(120 * decorScale);
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 2.6, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x54422e, roughness: 1 });
    const crownTiers: [number, number, number][] = [
      [2.3, 3.1, 0.0],    // radius, height, base offset (in tiers)
      [1.75, 2.6, 1.9],
      [1.15, 2.2, 3.7],
    ];
    const crownGeos = crownTiers.map(([r, h]) => new THREE.ConeGeometry(r, h, 7));
    // deciduous crown: icosahedron blob with vertex noise (shared geometry)
    const blobGeo = new THREE.IcosahedronGeometry(2.1, 1);
    {
      const pa = blobGeo.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < pa.count; v++) {
        const vx = pa.getX(v), vy = pa.getY(v), vz = pa.getZ(v);
        const n = 1 + Math.sin(vx * 2.1 + vy * 1.3) * 0.16 + Math.cos(vz * 2.7 + vx) * 0.12;
        pa.setXYZ(v, vx * n * 1.15, vy * n * 0.8, vz * n * 1.15);   // squashed dome
      }
      blobGeo.computeVertexNormals();
    }
    const greens = this.def.env === 'alpine'
      ? [0x2c4f34, 0x35593c, 0x274830]
      : [0x39682f, 0x42733a, 0x315d2c];
    const leafTones = [0x4a7a35, 0x568843, 0x40702e];     // deciduous (lighter, yellower)
    const foliage = foliageTexture();                     // shared, cached — never disposed here
    const crownMats = greens.map(c => new THREE.MeshStandardMaterial({
      color: c, map: foliage, roughness: 1, flatShading: true,
    }));
    const leafMats = leafTones.map(c => new THREE.MeshStandardMaterial({
      color: c, map: foliage, roughness: 1, flatShading: true,
    }));
    this.disposables.push(trunkGeo, trunkMat, blobGeo, ...crownGeos, ...crownMats, ...leafMats);
    const N = SAMPLES;
    let placed = 0;
    for (let k = 0; k < treeCount * 3 && placed < treeCount; k++) {
      const i = Math.floor((k / (treeCount * 3)) * N * 2.7) % N;
      const sm = this.spline.samples[i];
      const side = k % 2 === 0 ? 1 : -1;
      const wall = side > 0 ? this.wallR[i] : -this.wallL[i];
      const lat = side * (wall + 10 + Math.random() * 40);
      const x = sm.pos.x + sm.right.x * lat;
      const z = sm.pos.z + sm.right.z * lat;
      if (!this.clearOfTrack(x, z, 4)) continue;   // never on (or hanging over) the road
      placed++;
      const y = sm.pos.y - 0.1;
      const s = 0.75 + Math.random() * 0.9;
      const conifer = placed % 5 < 3;              // ~60% conifers / 40% round
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, y + 1.3 * s, z);
      trunk.scale.setScalar(s);
      trunk.castShadow = true;             // every tree shadows the ground
      this.group.add(trunk);
      if (conifer) {
        const mat = crownMats[placed % crownMats.length];
        for (let t = 0; t < crownTiers.length; t++) {
          const [r, h, base] = crownTiers[t];
          const crown = new THREE.Mesh(crownGeos[t], mat);
          crown.position.set(x, y + (base + h * 0.5 + 0.9) * s, z);
          crown.scale.set(s * (0.9 + Math.random() * 0.2), s * (0.9 + Math.random() * 0.25), s);
          crown.rotation.y = Math.random() * Math.PI;
          crown.castShadow = true;         // EVERY tier — full tree shadows
          this.group.add(crown);
        }
      } else {
        const crown = new THREE.Mesh(blobGeo, leafMats[placed % leafMats.length]);
        crown.position.set(x, y + (2.9 + 1.4) * s, z);
        crown.scale.set(s * (0.9 + Math.random() * 0.35), s * (0.85 + Math.random() * 0.3), s * (0.9 + Math.random() * 0.35));
        crown.rotation.y = Math.random() * Math.PI;
        crown.castShadow = true;           // EVERY tree — full tree shadows
        this.group.add(crown);
      }
    }
  }

  private buildBackdrop(): void {
    // distant ring of mountains — ALWAYS beyond the outermost track point
    // (the old fixed 700 m radius cut straight across the long circuits)
    const N = SAMPLES;
    let cx = 0, cz = 0, minY = Infinity, maxR = 0;
    for (const sm of this.spline.samples) {
      cx += sm.pos.x; cz += sm.pos.z; minY = Math.min(minY, sm.pos.y);
    }
    cx /= N; cz /= N;
    for (const sm of this.spline.samples) {
      maxR = Math.max(maxR, Math.hypot(sm.pos.x - cx, sm.pos.z - cz));
    }
    const night = this.weather === 'night';
    const alpine = this.def.env === 'alpine';
    const baseTone = alpine ? (night ? 0x2c3648 : 0x8fa3bd)
      : this.def.env === 'coast' ? (night ? 0x22303c : 0x6f8f6a)
        : (night ? 0x25302a : 0x5d7050);
    // three slightly different rock tones → layered ridges, not clone-stamped
    const rockMats = [0, 1, 2].map(i => {
      const c = new THREE.Color(baseTone);
      c.offsetHSL(0, 0, (i - 1) * 0.035);
      return new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true });
    });
    const snowMat = new THREE.MeshStandardMaterial({ color: night ? 0x9aa8c4 : 0xf2f5fa, roughness: 0.9 });
    this.disposables.push(...rockMats, snowMat);

    /** one mountain = 3-4 overlapping elongated cones with FULL vertex-noise
     *  displacement — every vertex is jittered (two noise scales) so the
     *  straight cone edges break into fractured rock. Reads as a ridge. */
    const range = (cxm: number, czm: number, ang: number, r: number, hMax: number, snow: boolean): void => {
      const g = new THREE.Group();
      const peaks = 3 + Math.floor(Math.random() * 2);
      const tangent = ang + Math.PI / 2;
      for (let p = 0; p < peaks; p++) {
        const h = hMax * (0.55 + Math.random() * 0.45);
        const geo = new THREE.ConeGeometry(h * (0.85 + Math.random() * 0.35), h, 14, 3);
        // full-volume noise: radial + vertical jitter on EVERY vertex
        const pa = geo.attributes.position as THREE.BufferAttribute;
        const seedR = Math.random() * 100;
        for (let v = 0; v < pa.count; v++) {
          const vx = pa.getX(v), vy = pa.getY(v), vz = pa.getZ(v);
          const n1 = Math.sin(vx * 0.35 + seedR) * Math.cos(vz * 0.41 + seedR * 1.7);
          const n2 = Math.sin(vx * 1.3 + seedR * 2.1) * Math.sin(vz * 1.7 + seedR * 0.6);
          const rr = 1 + n1 * 0.34 + n2 * 0.2;
          pa.setX(v, vx * rr);
          pa.setZ(v, vz * rr);
          pa.setY(v, vy + n2 * h * 0.08);           // broken crest line
        }
        geo.computeVertexNormals();
        this.disposables.push(geo);
        const m = new THREE.Mesh(geo, rockMats[(p + peaks) % 3]);
        const along = (p - (peaks - 1) / 2) * h * 0.75;
        m.position.set(Math.cos(tangent) * along, h / 2 - 4, Math.sin(tangent) * along);
        m.scale.set(0.8 + Math.random() * 0.3, 1, 2.1 + Math.random() * 1.6);  // elongated along the ridge
        m.rotation.y = Math.random() * 0.4 - 0.2;
        g.add(m);
        // snow cap on the tall peaks (alpine look)
        if (snow && h > hMax * 0.72) {
          const capGeo = new THREE.ConeGeometry(h * 0.34, h * 0.36, 14);
          this.disposables.push(capGeo);
          const cap = new THREE.Mesh(capGeo, snowMat);
          cap.position.set(m.position.x, h - h * 0.18 - 4, m.position.z);
          cap.scale.set(0.8, 1, 2.1);
          cap.rotation.y = m.rotation.y;
          g.add(cap);
        }
      }
      g.position.set(cxm + Math.cos(ang) * r, minY - 4, czm + Math.sin(ang) * r);
      g.rotation.y = -ang;
      this.group.add(g);
    };

    // FAR RING — jagged ridge silhouettes: a single strip mesh whose top edge
    // is a 2-octave noise profile. This is how distant ranges actually read
    // from a circuit (a continuous serrated horizon), instead of lone pyramids.
    const ridgeTone = new THREE.Color(baseTone).offsetHSL(0, 0, -0.04);
    const ridgeMat = new THREE.MeshStandardMaterial({
      color: ridgeTone, roughness: 1, side: THREE.DoubleSide,
    });
    this.disposables.push(ridgeMat);
    const buildRidge = (rBase: number, maxH: number, seed: number): void => {
      const SEG = 240;
      const pos: number[] = [], idx: number[] = [];
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        const wob = Math.sin(i * 0.33 + seed) * 90 + Math.sin(i * 0.11 + seed * 2.1) * 140;
        const r = rBase + wob;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        // BROAD massifs (slow waves → long mountain groups) with a fine
        // serrated crest on top — a real distant range, not isolated spikes.
        const t = i / SEG * Math.PI * 2;
        const massif = Math.sin(t * 3 + seed) * 0.5 + Math.sin(t * 7 + seed * 2.2) * 0.28
          + Math.sin(t * 11 + seed * 0.7) * 0.16;
        const base = 0.3 + Math.max(0, massif) * 0.62;
        const serr = Math.abs(Math.sin(i * 1.9 + seed * 3.1)) * 0.1
          + Math.abs(Math.sin(i * 3.7 + seed)) * 0.05;
        const h = maxH * (base * 0.88 + serr);
        pos.push(x, 0, z, x, h, z);
        if (i < SEG) {
          const b = i * 2;
          idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      this.disposables.push(geo);
      const m = new THREE.Mesh(geo, ridgeMat);
      m.position.set(cx, minY - 2, cz);
      this.group.add(m);
    };
    buildRidge(maxR + 720, alpine ? 210 : 95, 3.1);    // grand far range
    buildRidge(maxR + 460, alpine ? 130 : 58, 8.7);    // mid range (lighter fog)
    // alpine: a few snow-capped rocky peaks between the ridges and the hills
    if (alpine) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.7;
        range(cx, cz, a, maxR + 380 + (i % 2) * 90, 150 + (i % 3) * 45, true);
      }
    }

    // NEAR ring — ROLLING HILLS (noise-displaced flattened hemispheres):
    // reads as terrain between the track and the distant ridges, never as
    // pyramids.
    const nearCount = 12;
    const hillMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(baseTone).offsetHSL(0, 0.02, -0.02), roughness: 1, flatShading: true,
    });
    this.disposables.push(hillMat);
    for (let i = 0; i < nearCount; i++) {
      const a = ((i + 0.5) / nearCount) * Math.PI * 2 + Math.cos(i * 5.1) * 0.14;
      const r = maxR + 250 + Math.sin(i * 1.7) * 110 + (i % 2) * 70;
      const h = alpine ? 52 + (i % 3) * 24 : 22 + (i % 3) * 14;
      const geo = new THREE.SphereGeometry(h, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2);
      const pa = geo.attributes.position as THREE.BufferAttribute;
      const seedR = Math.random() * 10;
      for (let v = 0; v < pa.count; v++) {
        const vx = pa.getX(v), vy = pa.getY(v), vz = pa.getZ(v);
        const n = 1 + Math.sin(vx * 0.08 + seedR) * 0.3 + Math.cos(vz * 0.11 + seedR * 1.9) * 0.22;
        pa.setXYZ(v, vx * n * 2.6, vy * (1 + Math.sin(vz * 0.07 + seedR) * 0.25), vz * n * 1.9);  // long & flat
      }
      geo.computeVertexNormals();
      this.disposables.push(geo);
      const m = new THREE.Mesh(geo, hillMat);
      m.position.set(cx + Math.cos(a) * r, minY - 3, cz + Math.sin(a) * r);
      m.rotation.y = Math.random() * Math.PI;
      this.group.add(m);
    }
    if (this.def.env === 'coast') {
      // the sea on the far side
      const sea = new THREE.Mesh(
        new THREE.PlaneGeometry(2400, 1600),
        new THREE.MeshStandardMaterial({
          color: night ? 0x0a1420 : 0x2d6f9e, roughness: night ? 0.35 : 0.25,
          metalness: 0.4, envMapIntensity: night ? 0.5 : 1.0,
        }),
      );
      this.disposables.push(sea.geometry, sea.material as THREE.Material);
      sea.rotation.x = -Math.PI / 2;
      sea.rotation.z = 0.4;
      sea.position.set(cx + 480, minY - 1.2, cz);
      this.group.add(sea);
    }
  }

  // ------------------------------------------------------------------ assist line (F1-style guidance)

  /** Show/hide the on-track guidance arrows (racing line assist). */
  setAssistLine(on: boolean): void {
    if (this.assistGroup) this.assistGroup.visible = on;
  }

  /**
   * F1-game driving line: a colored strip along the racing line PLUS
   * chevron arrows on the floor pointing the way. Color = what the car
   * should be doing right here:
   *   RED   — braking zone (deceleration required ahead)
   *   AMBER — corner (hold, trail to apex)
   *   GREEN — flat out (or accelerating out)
   */
  private buildAssistLine(): void {
    const line = this.racingLine;
    const N = SAMPLES;
    const ds = this.spline.length / N;

    // ---- classify each sample -------------------------------------------
    const GREEN: [number, number, number] = [0.14, 0.92, 0.25];
    const AMBER: [number, number, number] = [1.0, 0.72, 0.08];
    const RED:   [number, number, number] = [0.95, 0.10, 0.10];
    const cols: [number, number, number][] = [];
    for (let i = 0; i < N; i++) {
      // required deceleration if we keep rolling into the next ~85 m
      let need = 0;
      const vHere = line.vTarget[i];
      for (let k = 2; k < 42; k++) {
        const j = (i + k) % N;
        const vj = line.vTarget[j];
        if (vj < vHere) {
          const decel = (vHere * vHere - vj * vj) / (2 * k * ds);
          if (decel > need) need = decel;
        }
      }
      const cornering = line.curv[i] > 0.0033;
      let c: [number, number, number];
      if (need > 3.2) {
        const t = clamp((need - 3.2) / 6, 0, 1);
        c = mix3(AMBER, RED, t);
      } else if (cornering || need > 1.1) {
        c = AMBER;
      } else {
        c = GREEN;
      }
      cols.push(c);
    }
    // smooth the color transitions (±3 samples)
    const sm: [number, number, number][] = cols.map(() => [0, 0, 0]);
    for (let i = 0; i < N; i++) {
      let r = 0, g = 0, b = 0;
      for (let k = -3; k <= 3; k++) {
        const c = cols[(i + k + N) % N];
        r += c[0]; g += c[1]; b += c[2];
      }
      sm[i] = [r / 7, g / 7, b / 7];
    }

    const group = new THREE.Group();
    group.name = 'assistLine';
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const lineW = 0.30;   // half width of the strip

    const pushVert = (x: number, y: number, z: number, c: [number, number, number]): number => {
      pos.push(x, y, z); col.push(c[0], c[1], c[2]);
      return pos.length / 3 - 1;
    };

    // ---- strip along the line --------------------------------------------
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = this.linePoint(i, line.lat[i]);
      const b = this.linePoint(j, line.lat[j]);
      const ra = this.spline.samples[i].right;
      const rb = this.spline.samples[j].right;
      const a0 = pushVert(a.x - ra.x * lineW, a.y + 0.045, a.z - ra.z * lineW, sm[i]);
      const a1 = pushVert(a.x + ra.x * lineW, a.y + 0.045, a.z + ra.z * lineW, sm[i]);
      const b0 = pushVert(b.x - rb.x * lineW, b.y + 0.045, b.z - rb.z * lineW, sm[j]);
      const b1 = pushVert(b.x + rb.x * lineW, b.y + 0.045, b.z + rb.z * lineW, sm[j]);
      idx.push(a0, b0, b1, a0, b1, a1);
    }

    // ---- chevron arrows every ~9 m ----------------------------------------
    const step = Math.max(5, Math.round(9 / ds));
    for (let i = 0; i < N; i += step) {
      const p = this.linePoint(i, line.lat[i]);
      const t = this.spline.samples[i].tangent;
      const r = this.spline.samples[i].right;
      const c = sm[i];
      const y = p.y + 0.055;
      const L = 1.15, W = 0.62, notch = 0.34;
      const tip    = pushVert(p.x + t.x * L * 0.5, y, p.z + t.z * L * 0.5, c);
      const backL  = pushVert(p.x - t.x * L * 0.5 + r.x * W, y, p.z - t.z * L * 0.5 + r.z * W, c);
      const backC  = pushVert(p.x - t.x * L * 0.5 + t.x * notch, y, p.z - t.z * L * 0.5 + t.z * notch, c);
      const backR  = pushVert(p.x - t.x * L * 0.5 - r.x * W, y, p.z - t.z * L * 0.5 - r.z * W, c);
      idx.push(tip, backL, backC, tip, backC, backR);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.88,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.disposables.push(geo, mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    group.add(mesh);
    this.assistGroup = group;
    this.group.add(group);
  }

  private linePoint(i: number, lat: number): THREE.Vector3 {
    const sm = this.spline.samples[i];
    return new THREE.Vector3(
      sm.pos.x + sm.right.x * lat, sm.pos.y, sm.pos.z + sm.right.z * lat);
  }

  // ------------------------------------------------------------------ night floodlights

  /** Night race: floodlight masts around the circuit (heads exposed for the
   *  Game to drive a small pool of real SpotLights). */
  private buildFloodlights(): void {
    if (this.weather !== 'night') return;
    const N = SAMPLES;
    const masts = 14;
    const step = Math.floor(N / masts);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, metalness: 0.7, roughness: 0.4 });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xf8fbff, emissive: 0xf2f7ff, emissiveIntensity: 5.5, roughness: 0.3,
    });
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xbfd4ff, transparent: true, opacity: 0.05, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.disposables.push(poleMat, headMat, coneMat);
    for (let m = 0; m < masts; m++) {
      const i = (m * step + Math.floor(step / 2)) % N;
      const sm = this.spline.samples[i];
      const side = m % 2 === 0 ? 1 : -1;
      const wall = side > 0 ? this.wallR[i] : -this.wallL[i];
      const lat = side * (wall + 7);
      const px = sm.pos.x + sm.right.x * lat, pz = sm.pos.z + sm.right.z * lat;
      if (!this.clearOfTrack(px, pz, 3)) continue;
      const py = sm.pos.y;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 17, 8), poleMat);
      this.disposables.push(pole.geometry);
      pole.position.set(px, py + 8.5, pz);
      pole.castShadow = true;
      this.group.add(pole);
      // head bar with 4 lamps aimed at the track
      const head = new THREE.Group();
      head.position.set(px, py + 17, pz);
      head.lookAt(sm.pos.x, py, sm.pos.z);
      for (let l = 0; l < 4; l++) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.4, 0.24), headMat);
        this.disposables.push(lamp.geometry);
        lamp.position.set((l - 1.5) * 1.05, 0, 0);
        head.add(lamp);
      }
      this.group.add(head);
      // soft light cone toward the tarmac
      const cone = new THREE.Mesh(new THREE.ConeGeometry(7.5, 17.5, 12, 1, true), coneMat);
      this.disposables.push(cone.geometry);
      cone.position.set(px, py + 8.6, pz);
      cone.lookAt(sm.pos.x, py - 1, sm.pos.z);
      cone.rotateX(Math.PI / 2);
      this.group.add(cone);
      this.floodHeads.push(new THREE.Vector3(px, py + 16.6, pz));
    }
  }

  // ------------------------------------------------------------------ grid

  private computeGridSlots(): GridSlot[] {
    const slots: GridSlot[] = [];
    const L = this.spline.length;
    for (let i = 0; i < 20; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const back = 16 + row * 8.5;
      const s = (((1 - back / L) % 1) + 1) % 1;
      const sm = this.spline.sampleAt(s);
      // pole side alternates per row (staggered F1 grid)
      const sideSign = (row % 2 === 0 ? 1 : -1) * (col === 0 ? -1 : 1);
      const lat = sideSign * sm.halfWidth * 0.42;
      slots.push({
        s,
        pos: new THREE.Vector3(sm.pos.x + sm.right.x * lat, sm.pos.y, sm.pos.z + sm.right.z * lat),
        yaw: Math.atan2(sm.tangent.x, sm.tangent.z),
      });
    }
    return slots;
  }

  private arcDist(a: number, b: number): number {
    const d = Math.abs(a - b);
    return Math.min(d, SAMPLES - d) * (this.spline.length / SAMPLES);
  }

  // ------------------------------------------------------------------ physics queries

  groundQuery(p: THREE.Vector3, state: { mainIdx: number }): F1GroundInfo {
    const proj = this.spline.project(p, state.mainIdx);
    const idx = proj.index;
    const sm = this.spline.samples[idx];
    const hw = proj.halfWidth;
    const lat = proj.lateral;
    const absL = Math.abs(lat);

    let surface: Surface = 'road';
    const kerbHere = lat >= 0 ? this.kerbR[idx] === 1 : this.kerbL[idx] === 1;
    if (absL > hw - 0.15) {
      if (absL <= hw + KERB_W && kerbHere) surface = 'kerb';
      else if (absL <= hw + KERB_W + 0.2 && !kerbHere) surface = 'road';
      else {
        const eff = this.runoffEff[idx] > 1.5 && this.runoffSide[idx] === Math.sign(lat) ? this.runoffEff[idx] : 0;
        if (eff > 0 && absL <= hw + KERB_W + eff) surface = this.runoffType[idx];
        else surface = 'grass';
      }
    }

    const height = sm.pos.y + Math.sin(sm.bank) * lat + (surface === 'kerb' ? 0.055 : 0);
    return {
      height, hasGround: true, surface,
      s: proj.s, lateral: lat, slope: sm.tangent.y,
      mainIdx: idx, halfWidth: hw,
      wallL: this.wallL[idx] - 0.9,   // car half-width inset
      wallR: this.wallR[idx] - 0.9,
      onKerb: surface === 'kerb',
    };
  }

  wallConstrain(car: F1Car): void {
    // TRUE SEGMENT COLLISION: the car is a circle (r ≈ half width) tested
    // against every nearby wall segment — the local section's walls AND the
    // facing sections' walls (this.neighbors). Position is resolved out of
    // penetration every step, so no speed and no seam can push you through.
    const gi = car.ginfo;
    if (!gi) return;
    const N = SAMPLES;
    const idx = gi.mainIdx;
    for (let k = -3; k <= 2; k++) {
      const s = ((idx + k) % N + N) % N;
      this.wallSeg(car, s, 1);
      this.wallSeg(car, s, -1);
    }
    for (const j of this.neighbors[idx]) {
      for (let k = -2; k <= 1; k++) {
        const s = ((j + k) % N + N) % N;
        this.wallSeg(car, s, 1);
        this.wallSeg(car, s, -1);
      }
    }
  }

  /** Circle-vs-segment resolution against one wall segment. */
  private wallSeg(car: F1Car, k: number, side: 1 | -1): void {
    const N = SAMPLES;
    const a = this.spline.samples[k];
    const b = this.spline.samples[(k + 1) % N];
    const la = side > 0 ? this.wallR[k] : this.wallL[k];
    const lb = side > 0 ? this.wallR[(k + 1) % N] : this.wallL[(k + 1) % N];
    const ax = a.pos.x + a.right.x * la, az = a.pos.z + a.right.z * la;
    const bx = b.pos.x + b.right.x * lb, bz = b.pos.z + b.right.z * lb;
    const abx = bx - ax, abz = bz - az;
    const len2 = abx * abx + abz * abz;
    if (len2 < 1e-6) return;
    let t = ((car.pos.x - ax) * abx + (car.pos.z - az) * abz) / len2;
    t = clamp(t, 0, 1);
    const cx = ax + abx * t, cz = az + abz * t;
    let dx = car.pos.x - cx, dz = car.pos.z - cz;
    const dist = Math.hypot(dx, dz);
    if (dist >= WALL_CAR_R) return;

    // track-side normal: wall midpoint → sample center
    const mx = (ax + bx) * 0.5, mz = (az + bz) * 0.5;
    let nx = a.pos.x - mx, nz = a.pos.z - mz;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;

    let px: number, pz: number, pen: number;
    if (dist < 1e-4) {
      px = nx; pz = nz; pen = WALL_CAR_R;
    } else {
      const dnx = dx / dist, dnz = dz / dist;
      if (dnx * nx + dnz * nz < 0) {
        // crossed the wall line within one step — push all the way back
        px = nx; pz = nz; pen = WALL_CAR_R + dist;
      } else {
        px = dnx; pz = dnz; pen = WALL_CAR_R - dist;
      }
    }
    car.pos.x += px * pen;
    car.pos.z += pz * pen;

    // kill the into-wall velocity component (restitution + scrub)
    const v = car.velocity;
    const vn = v.x * px + v.z * pz;
    if (vn < 0) {
      const impact = -vn;
      v.x -= px * vn * (1 + PHYS.wallRestitution);
      v.z -= pz * vn * (1 + PHYS.wallRestitution);
      v.multiplyScalar(PHYS.wallScrub);
      const fwd = car.forward();
      const rightB = new THREE.Vector3(Math.cos(car.yaw), 0, -Math.sin(car.yaw));
      car.vLong = v.dot(fwd);
      car.vLat = v.dot(rightB);
      car.wallHit = Math.max(car.wallHit, Math.min(1, impact / 14));
      if (impact > 15 && car.spinT <= 0) car.spinFromContact(impact / 24);
    }
  }

  update(_t: number, _dt: number): void {
    // crowd shimmer + flags could live here; lights are event-driven
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    for (const d of this.disposables) d.dispose();
  }
}

/** linear mix of two rgb triples */
function mix3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
