/**
 * APEX KART — Track construction & runtime world.
 * Turns a TrackDef into meshes + a queryable world model:
 *  - textured road ribbon (asphalt grain, lane paint) with banking + jump gaps
 *  - diagonal kerbs, wide terrain skirt + outer apron (no more void beside road)
 *  - guardrails on both edges (visual + physical wallConstrain), opened at
 *    shortcut branches and jump gaps
 *  - arched tunnels with portals, ribs and ceiling lights
 *  - shortcuts (OpenPath branches with mapped progress)
 *  - boost pads, item boxes (respawning), hazards (mover/faller/zone/gate)
 *  - finish arch + checker start line + start grid + minimap polyline
 *  - precomputed AI racing line (apex-cutting lateral + speed profile)
 * The TrackWorld.groundQuery() is the single source of truth for physics.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HazardDef, TrackDef } from '../core/Types';
import { makeRng, wrapAngle } from '../core/MathUtils';
import { OpenPath, Projection, Spline } from './Spline';
import { buildCrowd, buildProp, buildSky, mat, PropKind, THEMES, ThemeStyle } from './Decorations';
import { ITEMS, PHYS } from '../core/Config';
import { billboardTexture, checkerTexture, chevronTexture, groundTexture, kerbTexture, railTexture, roadPhotoTexture, roadTexture, tunnelTexture } from './Textures';

export const SAMPLE_COUNT = 320;

export interface GroundInfo {
  height: number; hasGround: boolean; onRoad: boolean; roughness: number;
  s: number; lateral: number; onShortcut: number; mainIdx: number; pathIdx: number;
  onJump: boolean; ptIdx: number;
  /** exact road slope (tangent.y) — fuels launches & crest physics */
  slope: number;
}

export interface ItemBox {
  pos: THREE.Vector3; mesh: THREE.Group; active: boolean; respawnAt: number;
  /** golden boxes (every 3rd row) hand out TWO items at 150cc+ */
  golden: boolean;
}

/** A collectible coin (MK-style speed economy). Rendered via one InstancedMesh. */
export interface CoinInstance {
  pos: THREE.Vector3;
  active: boolean;
  respawnAt: number;
  idx: number;            // index into the InstancedMesh
  s: number;              // track s (0..1) — AI coin-seeking without projection
  lat: number;            // lateral offset (m) at placement
}

export interface HazardInstance {
  def: HazardDef;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  radius: number;
  active: boolean;          // gates: currently solid; movers: always; fallers: near ground
  update: (t: number, dt: number) => void;
}

export interface PadInstance { pos: THREE.Vector3; s: number; }

/** Precomputed racing line: per-sample lateral offset & safe speed (m/s). */
export interface RacingLine {
  lat: Float32Array;
  vMax: Float32Array;
}

interface Animatable { update: (t: number, dt: number) => void; }

const ROAD_V_REPEAT = 11;      // meters per road texture repeat (asphalt grain)
const KERB_V_REPEAT = 1.9;     // meters per kerb stripe pair
const GROUND_V_REPEAT = 17;    // meters per terrain tile
const APRON_WIDTH = 30;        // base terrain beyond the drivable skirt
const APRON_PER_M_LIFT = 1.5;  // extra embankment width per meter of elevation
const RAIL_LATERAL = 1.35;     // rail band center beyond road edge (over the kerb)
const WALL_LIMIT = 0.45;       // kart CENTER clamp beyond road edge (wheels touch rail)
const RAMP_RUN = 20;           // meters of launch ramp baked before each gap
const RAMP_SLOPE = 0.22;       // launch ramp slope (vy = slope * speed at the lip)
// --- terrain fold protection (the "terreno en medio de la curva" bug) ---
const CLEAR_EXCL_ARC = 30;     // arc meters of same-track neighborhood to ignore
const CLEAR_MARGIN = 2.4;      // terrain keeps this distance from other ribbons
const CLEAR_ERODE = 2;         // samples of min-erosion (ramps instead of spikes)
const MIN_SKIRT = 2.2;         // absolute floor for the drivable shoulder

export class TrackWorld {
  readonly def: TrackDef;
  readonly style: ThemeStyle;
  readonly spline: Spline;
  readonly shortcuts: OpenPath[] = [];
  readonly group = new THREE.Group();
  readonly minimap: { x: number; z: number }[];
  readonly itemBoxes: ItemBox[] = [];
  readonly coins: CoinInstance[] = [];
  readonly pads: PadInstance[] = [];
  readonly hazards: HazardInstance[] = [];
  readonly spawnPoints: THREE.Vector3[] = [];
  readonly respawnPoints: THREE.Vector3[] = [];
  readonly animatables: Animatable[] = [];
  readonly mirror: boolean;
  readonly racingLine: RacingLine;
  /** per-side: rail disabled (jump gap / shortcut entry-exit windows) */
  readonly railOpen: { left: Uint8Array; right: Uint8Array };
  /** per-side max lateral terrain extent (meters from road CENTER) so the
   * skirt/apron never fold over another ribbon of the same track — hairpin
   * inners, ess folds and parallel passes used to put terrain walls right
   * through the asphalt. [0] = +right side, [1] = -right side. */
  readonly terrainClear: [Float32Array, Float32Array];
  /** per-side clamped drivable skirt (meters beyond kerb) — physics matches
   * the visual terrain exactly. */
  readonly skirtAt: [Float32Array, Float32Array];
  finishPos = new THREE.Vector3();
  private coinMesh: THREE.InstancedMesh | null = null;

  constructor(def: TrackDef, mirror: boolean, decorScale: number, crowdScale: number) {
    this.def = def;
    this.mirror = mirror;
    const style = { ...THEMES[def.theme] };
    this.style = style;
    this.minimap = [];

    // Mirror = flip X of every control point before spline sampling.
    const ctrl = mirror
      ? def.points.map(p => ({ ...p, x: -p.x }))
      : def.points;
    this.spline = new Spline(ctrl, SAMPLE_COUNT, def.halfWidth);
    this.applyJumpRamps();
    this.minimap = this.spline.minimapPolyline();

    // shortcut spans must be known before rails (they open holes in them)
    const spans = this.computeShortcutSpans();
    this.railOpen = this.computeRailOpen(spans);
    this.terrainClear = this.computeTerrainClearance();
    this.skirtAt = [
      this.clampedSkirt(this.terrainClear[0]),
      this.clampedSkirt(this.terrainClear[1]),
    ];

    this.buildRoad();
    this.buildShortcuts(spans);
    this.buildRails();
    this.buildTunnels();
    this.buildPads();
    this.buildItemBoxes();
    this.buildCoins();
    this.buildFinishArch();
    this.buildHazards();
    this.buildSpawns();
    this.buildDecorations(decorScale, crowdScale);
    this.buildEdgeDressing(decorScale);
    this.buildBunting();
    this.racingLine = this.computeRacingLine();
  }

  // ------------------------------------------------------------ jump ramps

  /**
   * Bake launch lips before jump gaps: a constant ~0.22 slope over ~20 m,
   * so karts arrive at the gap already rising. KartController converts that
   * slope into vertical velocity at takeoff — gaps are flown, not fallen
   * into. A slightly deeper landing (authored in the catalog) extends the
   * flight for free.
   */
  private applyJumpRamps(): void {
    const sp = this.spline;
    const N = sp.samples.length;
    let i = 0;
    while (i < N) {
      if (!sp.samples[i].jump) { i++; continue; }
      // found a jump run: find its start
      let start = i;
      while (start > 0 && sp.samples[start - 1].jump) start--;
      // walk back from the gap edge, lifting on a linear slope
      let back = 0;
      for (let k = 1; k <= 12; k++) {
        const idx = ((start - k) % N + N) % N;
        if (sp.samples[idx].jump) break; // wrapped into another run
        back += sp.samples[(idx + 1) % N].pos.distanceTo(sp.samples[idx].pos);
        if (back > RAMP_RUN) break;
        sp.samples[idx].pos.y += RAMP_SLOPE * (RAMP_RUN - back);
        // FUNNEL: neck the road down to 78% of its width toward the lip —
        // karts channel toward the center (too tight a neck shoved 12-kart
        // packs off the road at the lip; 78% funnels without pileups)
        const neck = 0.78 + 0.22 * Math.min(1, back / RAMP_RUN);
        sp.samples[idx].halfWidth *= neck;
      }
      // skip the whole run
      while (i < N && sp.samples[i].jump) i++;
      // widen the landing zone: +5 m of halfWidth fading over ~14 samples
      // after the gap, so slightly-wide flights still land on the road
      for (let k = 0; k < 14; k++) {
        const idx = i + k;
        if (idx >= N) break;
        if (sp.samples[idx].jump) continue;
        sp.samples[idx].halfWidth += 5 * (1 - k / 14);
      }
    }

    // The ramp lifts moved sample POSITIONS — recompute tangents & rights
    // from the lifted geometry so GroundInfo.slope reports the real ramp
    // slope (0.22), which is what converts speed into launch velocity.
    for (let i2 = 0; i2 < N; i2++) {
      const a = sp.samples[(i2 - 1 + N) % N].pos;
      const b = sp.samples[(i2 + 1) % N].pos;
      sp.samples[i2].tangent.set(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
      sp.samples[i2].right.set(
        sp.samples[i2].tangent.z, 0, -sp.samples[i2].tangent.x).normalize();
    }
  }

  // ------------------------------------------------------------ road mesh

  private vertexAt(smIdx: number, lateral: number, yOff = 0): THREE.Vector3 {
    const sm = this.spline.samples[smIdx];
    return new THREE.Vector3(
      sm.pos.x + sm.right.x * lateral,
      sm.pos.y + sm.right.y * lateral + lateral * Math.sin(sm.bank) + yOff,
      sm.pos.z + sm.right.z * lateral,
    );
  }

  // ------------------------------------------------------------ fold guard

  /**
   * Max lateral terrain extent per sample per side so the skirt/apron can
   * never fold over ANOTHER ribbon of the same track (hairpin inners, ess
   * folds, parallel passes). A ribbon only constrains us when our terrain
   * would sit at-or-above ITS surface — terrain passing UNDER a higher
   * bridge section is fine (that's what hills under bridges look like).
   */
  private computeTerrainClearance(): [Float32Array, Float32Array] {
    const sp = this.spline;
    const N = sp.samples.length;
    const INF = 4096;
    const raw: [Float32Array, Float32Array] = [
      new Float32Array(N).fill(INF),  // +lateral side
      new Float32Array(N).fill(INF),  // -lateral side
    ];
    for (let i = 0; i < N; i++) {
      const si = sp.samples[i];
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const arcRaw = Math.abs(sp.samples[j].dist - si.dist);
        const arc = Math.min(arcRaw, sp.length - arcRaw);
        if (arc < CLEAR_EXCL_ARC) continue;         // same stretch of road
        const sj = sp.samples[j];
        // our terrain top (~si.y - 0.45) must stay clear of sj's surface
        // only when it would poke AT or ABOVE it
        if (si.pos.y - 0.45 <= sj.pos.y - 1.0) continue;
        const dx = sj.pos.x - si.pos.x, dz = sj.pos.z - si.pos.z;
        const d = Math.hypot(dx, dz);
        const lim = d - sj.halfWidth - CLEAR_MARGIN;
        if (lim <= 0) {
          // other ribbon basically on top of us on this side — wall it off
          const latJ = dx * si.right.x + dz * si.right.z;
          const side = latJ >= 0 ? 0 : 1;
          raw[side][i] = Math.min(raw[side][i], si.halfWidth + 0.9 + MIN_SKIRT);
          continue;
        }
        // which side of sample i does j sit on?
        const latJ = dx * si.right.x + dz * si.right.z;
        const side = latJ >= 0 ? 0 : 1;
        if (lim < raw[side][i]) raw[side][i] = lim;
      }
    }
    // EROSION (min over ±CLEAR_ERODE samples): the bound holds across the
    // whole neighborhood, so a single-sample pinch becomes a smooth ramp
    // instead of a jagged terrain edge. Conservative but always safe.
    const out: [Float32Array, Float32Array] = [
      new Float32Array(N), new Float32Array(N),
    ];
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < N; i++) {
        let m = INF;
        for (let k = -CLEAR_ERODE; k <= CLEAR_ERODE; k++) {
          const j = ((i + k) % N + N) % N;
          if (raw[s][j] < m) m = raw[s][j];
        }
        out[s][i] = m;
      }
    }
    return out;
  }

  /** Per-sample drivable skirt for one side: clamp style width by clearance. */
  private clampedSkirt(clear: Float32Array): Float32Array {
    const sp = this.spline;
    const N = sp.samples.length;
    const sk = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const room = clear[i] - (sp.samples[i].halfWidth + 0.9);
      sk[i] = Math.max(MIN_SKIRT, Math.min(this.style.skirt, room));
    }
    return sk;
  }

  /** skirt index helper: side +1 → array 0, side -1 → array 1. */
  private skIdx(side: number): 0 | 1 { return side >= 0 ? 0 : 1; }

  /**
   * Road + kerbs + drivable skirt + visual apron + start line.
   * One merged geometry per material (road / kerb / terrain / apron).
   */
  private buildRoad(): void {
    const sp = this.spline;
    const N = sp.samples.length;
    const style = this.style;
    const theme = this.def.theme;
    const rainbow = !!style.rainbowRoad;

    // ---- accumulators per material ------------------------------------
    const mk = (): { pos: number[]; uv: number[]; idx: number[] } => ({ pos: [], uv: [], idx: [] });
    const road = mk(), markings = mk(), kerb = mk(), ground = mk(), apron = mk(), rainbowAcc = mk(), verge = mk();

    // verge shoulder tint — the band between kerb and terrain reads as a
    // maintained shoulder instead of "empty grass right next to the road"
    const VERGE_TINT: Record<string, number> = {
      meadow: 0x8fa860, desert: 0xcbb27c, beach: 0xd8cc9a, city: 0x55565e,
      snow: 0xdfe8f2, volcano: 0x57453c, castle: 0x93a878, space: 0x444a5e,
      jungle: 0x6d9a4e, factory: 0x6e7076, glacier: 0xcfe0ec, prism: 0xffffff,
    };

    const distOf = (i: number): number => (i === N ? sp.length : sp.samples[i % N].dist);

    const pushStrip = (
      acc: { pos: number[]; uv: number[]; idx: number[] },
      i: number, lat0: number, lat1: number, yOff0: number, yOff1: number,
      vRep: number, uRepeat = 1, vOffset = 0,
    ): void => {
      const j = (i + 1) % N;
      const base = acc.pos.length / 3;
      const a = this.vertexAt(i, lat0, yOff0);
      const b = this.vertexAt(i, lat1, yOff1);
      const c = this.vertexAt(j, lat1, yOff1);
      const d = this.vertexAt(j, lat0, yOff0);
      const v0 = distOf(i) / vRep + vOffset;
      const v1 = distOf(i + 1) / vRep + vOffset;
      acc.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
      acc.uv.push(0, v0, uRepeat, v0, uRepeat, v1, 0, v1);
      // winding: with `right` pointing to the track's LEFT (up x tangent
      // convention), lat0 sits on the TRUE right — so (a,b,c) as pushed is
      // clockwise seen from above and gets backface-culled. Reversed index
      // order makes every strip face UP. This was the invisible-road bug.
      // (Mirror mode too: the spline RECOMPUTES right from the mirrored
      // tangent, so a mirrored strip is the reflection of the SWAPPED-vertex
      // triangle (b,a,d) — which faces up — meaning both orientations need
      // this same reversed order. Verified by probe: n0=(0,1,0) on both.)
      acc.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    };

    const skirt = style.skirt;

    // auto-embankment baseline: outer terrain falls to the background plane
    // so elevated sections read as hillsides, not floating ribbons
    let minY = Infinity;
    for (const sm of sp.samples) minY = Math.min(minY, sm.pos.y);
    const planeY = minY - 2.5;

    // variable-width outer apron (trapezoid per segment — widths follow the
    // local elevation, so each side stays watertight with its neighbors).
    // The outer extent is CLAMPED by the fold-guard clearance so the apron
    // can never spill across another ribbon (the terrain-in-the-curve bug).
    const apronQuad = (i: number, side: 1 | -1): void => {
      const j = (i + 1) % N;
      const si = sp.samples[i], sj = sp.samples[j];
      const skI = this.skirtAt[this.skIdx(side)][i];
      const innerI = side * (si.halfWidth + 0.9 + skI);
      const innerJ = side * (sj.halfWidth + 0.9 + this.skirtAt[this.skIdx(side)][j]);
      const wantI = Math.abs(innerI) + APRON_WIDTH
        + Math.max(0, si.pos.y - minY) * APRON_PER_M_LIFT;
      const wantJ = Math.abs(innerJ) + APRON_WIDTH
        + Math.max(0, sj.pos.y - minY) * APRON_PER_M_LIFT;
      // fold guard: never cross another ribbon's clearance envelope
      const capI = this.terrainClear[this.skIdx(side)][i];
      const capJ = this.terrainClear[this.skIdx(side)][j];
      const outerI = side * Math.min(wantI, capI);
      const outerJ = side * Math.min(wantJ, capJ);
      // degenerate (cap tighter than the drivable skirt) → skip this quad
      if (Math.abs(outerI) <= Math.abs(innerI) + 0.6 && Math.abs(outerJ) <= Math.abs(innerJ) + 0.6) return;
      // order corners by increasing lateral so winding matches pushStrip
      const loI = Math.min(innerI, outerI), hiI = Math.max(innerI, outerI);
      const loJ = Math.min(innerJ, outerJ), hiJ = Math.max(innerJ, outerJ);
      const yLoI = loI === innerI ? -0.45 : planeY - si.pos.y;
      const yHiI = hiI === innerI ? -0.45 : planeY - si.pos.y;
      const yLoJ = loJ === innerJ ? -0.45 : planeY - sj.pos.y;
      const yHiJ = hiJ === innerJ ? -0.45 : planeY - sj.pos.y;
      const a = this.vertexAt(i, loI, yLoI);
      const b = this.vertexAt(i, hiI, yHiI);
      const c = this.vertexAt(j, hiJ, yHiJ);
      const d = this.vertexAt(j, loJ, yLoJ);
      const base = apron.pos.length / 3;
      const v0 = distOf(i) / (GROUND_V_REPEAT * 2.4);
      const v1 = distOf(i + 1) / (GROUND_V_REPEAT * 2.4);
      apron.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
      apron.uv.push(0, v0, 1.7, v0, 1.7, v1, 0, v1);
      // winding — see pushStrip note (faces UP, both orientations)
      apron.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    };

    for (let i = 0; i < N; i++) {
      const sm = sp.samples[i];
      const nx = sp.samples[(i + 1) % N];
      if (sm.jump || nx.jump) continue; // gap!

      // ---- main tarmac (photo base, or rainbow vertex colors) ---------
      if (rainbow) {
        pushStrip(rainbowAcc, i, -sm.halfWidth, sm.halfWidth, 0, 0, ROAD_V_REPEAT);
      } else {
        // photo grain tiles 2-3× across the WIDTH so it reads at distance;
        // painted markings ride on their own transparent overlay above
        const uRep = Math.max(2, Math.round(sm.halfWidth / 5.5));
        pushStrip(road, i, -sm.halfWidth, sm.halfWidth, 0, 0, ROAD_V_REPEAT, uRep);
        pushStrip(markings, i, -sm.halfWidth, sm.halfWidth, 0.012, 0.012, ROAD_V_REPEAT, 1);
      }

      // ---- kerbs --------------------------------------------------------
      pushStrip(kerb, i, sm.halfWidth, sm.halfWidth + 0.9, 0.02, 0.02, KERB_V_REPEAT);
      pushStrip(kerb, i, -sm.halfWidth - 0.9, -sm.halfWidth, 0.02, 0.02, KERB_V_REPEAT);

      // ---- verge band + drivable terrain skirt ----------------------------
      // Per-side widths from the fold guard: tight folds/hairpins get a
      // narrow shoulder instead of terrain walls through the neighbor road.
      if (skirt > 3) {
        for (const side of [1, -1] as const) {
          const sk = this.skirtAt[this.skIdx(side)][i];
          const inner = sm.halfWidth + 0.9;
          if (sk > 2.6) {
            // tinted ~2.5 m shoulder right past the kerb (its own material →
            // the road edge reads as dressed instead of dropping into grass)
            const vEnd = sm.halfWidth + 3.4;
            pushStrip(verge, i, side * inner, side * vEnd, -0.06, -0.16, GROUND_V_REPEAT, 0.42);
            // terrain continues from the verge outwards
            pushStrip(ground, i, side * vEnd, side * (inner + sk), -0.16, -0.45,
              GROUND_V_REPEAT, Math.max(0.3, (sk - 2.5) / GROUND_V_REPEAT * 2));
          } else {
            // clamped-tight zone: one short dressed shoulder, no extra skirt
            pushStrip(verge, i, side * inner, side * (inner + sk), -0.06, -0.45, GROUND_V_REPEAT, 0.42);
          }
        }
        // visual-only outer apron sloping down to the terrain plane; widens
        // with elevation so climbs look like supported hillsides (clamped
        // by the fold guard inside apronQuad)
        apronQuad(i, 1);
        apronQuad(i, -1);
      }
    }

    const buildMesh = (
      acc: { pos: number[]; uv: number[]; idx: number[] },
      material: THREE.Material,
      colors?: number[],
    ): THREE.Mesh => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
      if (colors) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(acc.idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      return mesh;
    };

    if (road.pos.length) {
      const m = new THREE.MeshLambertMaterial({ map: roadPhotoTexture(theme) });
      this.group.add(buildMesh(road, m));
    }
    if (markings.pos.length) {
      // transparent painted-line overlay just above the photo tarmac
      const m = new THREE.MeshLambertMaterial({ map: roadTexture(theme), transparent: true, depthWrite: false });
      const mesh = buildMesh(markings, m);
      mesh.renderOrder = 1;
      this.group.add(mesh);
    }
    if (rainbowAcc.pos.length) {
      // prism: per-vertex rainbow hue
      const colors: number[] = [];
      for (let i = 0; i < rainbowAcc.pos.length / 3; i++) {
        const c = new THREE.Color().setHSL((i * 0.13) % 1, 0.95, 0.72);
        colors.push(c.r, c.g, c.b);
      }
      this.group.add(buildMesh(rainbowAcc, new THREE.MeshBasicMaterial({ vertexColors: true }), colors));
    }
    if (kerb.pos.length) {
      const m = new THREE.MeshLambertMaterial({ map: kerbTexture(theme) });
      this.group.add(buildMesh(kerb, m));
    }
    if (ground.pos.length) {
      const m = new THREE.MeshLambertMaterial({ map: groundTexture(theme) });
      this.group.add(buildMesh(ground, m));
    }
    if (verge.pos.length) {
      const m = new THREE.MeshLambertMaterial({ map: groundTexture(theme), color: VERGE_TINT[theme] ?? 0xa8b08a });
      this.group.add(buildMesh(verge, m));
    }
    if (apron.pos.length) {
      const m = new THREE.MeshLambertMaterial({ map: groundTexture(theme), color: 0xb9c0c9 });
      this.group.add(buildMesh(apron, m));
    }

    // ---- checker start line overlay --------------------------------------
    const startAcc = mk();
    for (let i = 0; i < N; i++) {
      const sm = sp.samples[i];
      const nx = sp.samples[(i + 1) % N];
      if (sm.jump || nx.jump) continue;
      if (sm.dist > 6.5) break;
      pushStrip(startAcc, i, -sm.halfWidth, sm.halfWidth, 0.045, 0.045, 3.2);
    }
    if (startAcc.pos.length) {
      const m = new THREE.MeshLambertMaterial({ map: checkerTexture() });
      this.group.add(buildMesh(startAcc, m));
    }

    // ---- distant ground plane: world terrain to the horizon -----------------
    // Fills the gap between the road apron and the mountain backdrop so the
    // scene reads as landscape instead of a floating ribbon. Void themes
    // (space / prism) intentionally skip it.
    if (theme !== 'space' && theme !== 'prism') {
      let minY = Infinity;
      let cx = 0, cz = 0;
      for (const sm of sp.samples) {
        minY = Math.min(minY, sm.pos.y);
        cx += sm.pos.x; cz += sm.pos.z;
      }
      cx /= N; cz /= N;
      const planeTex = groundTexture(theme).clone();
      planeTex.needsUpdate = true;
      planeTex.repeat.set(80, 80);
      const plane = new THREE.Mesh(
        new THREE.CircleGeometry(640, 48),
        new THREE.MeshLambertMaterial({ map: planeTex, color: 0x8f96a3 }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(cx, minY - 2.5, cz);
      plane.receiveShadow = false;
      this.group.add(plane);
    }
  }

  // ------------------------------------------------------------ shortcuts

  /** Derive the from/to progress of every shortcut from its geometry. */
  private computeShortcutSpans(): { from: number; to: number; inner: THREE.Vector3[] }[] {
    const out: { from: number; to: number; inner: THREE.Vector3[] }[] = [];
    for (const sc of this.def.shortcuts) {
      if (sc.points.length < 1) continue;
      const inner = sc.points.map(p => new THREE.Vector3(this.mirror ? -p.x : p.x, p.y ?? 0, p.z));
      const from = this.nearestRoadS(inner[0]);
      const to = this.nearestRoadS(inner[inner.length - 1]);
      let span = to - from;
      if (span < 0) span += 1; // wrap across the finish line
      if (span > 0.3 || span < 0.012) continue; // sanity: not a real shortcut
      out.push({ from, to, inner });
    }
    return out;
  }

  private buildShortcuts(spans: { from: number; to: number; inner: THREE.Vector3[] }[]): void {
    for (const span of spans) {
      const { from, to } = span;
      const entry = this.spline.sampleAt(from);
      const exit = this.spline.sampleAt(to);
      const pts = [entry.pos.clone(), ...span.inner, exit.pos.clone()];
      // handle wrap: mapped progress may exceed 1 near the finish line
      const path = new OpenPath(pts, from, to < from ? to + 1 : to, this.def.shortcuts.find(
        s => this.nearestRoadSPre(s.points[0]) === from,
      )?.rough ?? 0.75, 48);
      this.shortcuts.push(path);

      // visual: dirt ribbon with kerb-like edge stripes
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      const halfW = 3.4;
      for (let i = 0; i < path.pts.length - 1; i++) {
        const a = path.pts[i], b = path.pts[i + 1];
        const base = positions.length / 3;
        positions.push(
          a.pos.x - a.right.x * halfW, a.pos.y + 0.04, a.pos.z - a.right.z * halfW,
          a.pos.x + a.right.x * halfW, a.pos.y + 0.04, a.pos.z + a.right.z * halfW,
          b.pos.x + b.right.x * halfW, b.pos.y + 0.04, b.pos.z + b.right.z * halfW,
          b.pos.x - b.right.x * halfW, b.pos.y + 0.04, b.pos.z - b.right.z * halfW,
        );
        const v0 = a.dist / 8, v1 = b.dist / 8;
        uvs.push(0, v0, 1, v0, 1, v1, 0, v1);
        // winding — faces UP (see pushStrip note), both orientations
        indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const dirt = new THREE.MeshLambertMaterial({ map: groundTexture(this.def.theme), color: 0xb59d7a });
      const mesh = new THREE.Mesh(geo, dirt);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  /** Road progress of the sample nearest to a shortcut control point. */
  private nearestRoadSPre(p: { x: number; y?: number; z: number }): number {
    return this.nearestRoadS(new THREE.Vector3(this.mirror ? -p.x : p.x, p.y ?? 0, p.z));
  }

  /** Road progress of the sample nearest to a world point. */
  private nearestRoadS(p: THREE.Vector3): number {
    let best = 0, bestD = Infinity;
    const sp = this.spline;
    for (let i = 0; i < sp.samples.length; i += 2) {
      const d = sp.samples[i].pos.distanceToSquared(p);
      if (d < bestD) { bestD = d; best = i; }
    }
    return sp.samples[best].s;
  }

  // ------------------------------------------------------------ guardrails

  /**
   * Per-side rail openings. Jump gaps open BOTH sides. Shortcuts open ONLY
   * the side facing the branch, ONLY in a short window around the entry and
   * the exit — the rest of the span keeps its rails, so karts that drift
   * wide mid-span can never fall off the world through a shortcut zone.
   */
  private computeRailOpen(
    spans: { from: number; to: number; inner: THREE.Vector3[] }[],
  ): { left: Uint8Array; right: Uint8Array } {
    const sp = this.spline;
    const N = sp.samples.length;
    const left = new Uint8Array(N);
    const right = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (sp.samples[i].jump) { left[i] = 1; right[i] = 1; }

    for (const span of spans) {
      const mid = span.inner[Math.floor(span.inner.length / 2)] ?? span.inner[0];
      const openAt = (s: number, which: 'from' | 'to'): void => {
        const sm = sp.sampleAt(s);
        const toward = which === 'from'
          ? span.inner[0]
          : span.inner[span.inner.length - 1];
        const ref = toward ?? mid;
        const side = Math.sign(
          (ref.x - sm.pos.x) * sm.right.x + (ref.z - sm.pos.z) * sm.right.z) >= 0 ? right : left;
        const w = 4; // samples (~±15 m) — just wide enough to slip through
        const center = Math.floor(Spline.wrapS(s) * N);
        for (let k = -w; k <= w; k++) {
          side[((center + k) % N + N) % N] = 1;
        }
      };
      openAt(span.from, 'from');
      openAt(span.to, 'to');
    }
    return { left, right };
  }

  /** Physical + visual guardrails on both edges. */
  private buildRails(): void {
    const sp = this.spline;
    const N = sp.samples.length;
    const dark = ['city', 'space', 'volcano', 'prism'].includes(this.def.theme);

    // posts (merged into one geometry)
    const postGeos: THREE.BufferGeometry[] = [];
    const bandPos: number[] = [], bandUv: number[] = [], bandIdx: number[] = [];
    const topPos: number[] = [], topIdx: number[] = [];
    const railLat = (i: number): number => sp.samples[i].halfWidth + RAIL_LATERAL;

    const quad = (acc: { pos: number[]; uv?: number[]; idx: number[] }, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, u0 = 0, u1 = 1, v0 = 0, v1 = 1): void => {
      const base = acc.pos.length / 3;
      acc.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
      if (acc.uv) acc.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      acc.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const sm = sp.samples[i];

      for (const side of [-1, 1] as const) {
        // side-aware rail gaps (jump runs open both sides; shortcut entry
        // windows open only the branch side)
        const openSide = side < 0 ? this.railOpen.left : this.railOpen.right;
        if (openSide[i] || openSide[j]) continue;
        const lat = side * railLat(i);

        // rail band (0.52 → 0.98 above local road edge) + top tube strip
        const a0 = this.vertexAt(i, lat, 0.52);
        const a1 = this.vertexAt(i, lat, 0.98);
        const b0 = this.vertexAt(j, lat, 0.52);
        const b1 = this.vertexAt(j, lat, 0.98);
        const v0 = sm.dist / 6, v1 = (j <= i ? sp.length : sp.samples[j].dist) / 6;
        quad({ pos: bandPos, uv: bandUv, idx: bandIdx }, a0, a1, b1, b0, v0, v1, 0, 1);

        const t0 = this.vertexAt(i, lat, 0.98);
        const t1 = this.vertexAt(i, lat, 1.12);
        const u0 = this.vertexAt(j, lat, 0.98);
        const u1 = this.vertexAt(j, lat, 1.12);
        quad({ pos: topPos, idx: topIdx }, t0, t1, u1, u0);

        // posts every 3 samples
        if (i % 3 === 0) {
          const base = this.vertexAt(i, lat, 0);
          const g = new THREE.BoxGeometry(0.22, 1.05, 0.22);
          g.translate(base.x, base.y + 0.5, base.z);
          postGeos.push(g);
        }
      }
    }

    if (postGeos.length) {
      const merged = mergeGeometries(postGeos);
      if (merged) {
        const m = new THREE.Mesh(merged, mat(0x3c414c));
        m.castShadow = false;
        this.group.add(m);
      }
      for (const g of postGeos) g.dispose();
    }
    if (bandIdx.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(bandPos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(bandUv, 2));
      geo.setIndex(bandIdx);
      geo.computeVertexNormals();
      const m = new THREE.MeshLambertMaterial({ map: railTexture(), side: THREE.DoubleSide });
      this.group.add(new THREE.Mesh(geo, m));
    }
    if (topIdx.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(topPos, 3));
      geo.setIndex(topIdx);
      geo.computeVertexNormals();
      const m = dark
        ? new THREE.MeshBasicMaterial({
          color: this.def.theme === 'prism' ? 0xff5a8a : this.def.theme === 'space' ? 0x35e0ff : this.def.theme === 'volcano' ? 0xff7a2a : 0x35e0e0,
          side: THREE.DoubleSide,
        })
        : new THREE.MeshLambertMaterial({ color: 0xc9ced8, emissive: 0x1a1c22, side: THREE.DoubleSide });
      this.group.add(new THREE.Mesh(geo, m));
    }
  }

  /**
   * Physical rail: clamp kart inside the kerb zone unless on a jump gap,
   * inside a shortcut, or on an opened span. Grazing keeps most speed; a
   * kart grinding INTO the rail gets gently redirected along it (arcade
   * bumper-rail behavior) instead of stalling in a scrub equilibrium.
   */
  wallConstrain(kart: import('../karts/KartController').KartController): void {
    const gi = kart.ginfo;
    // Rails constrain karts NEAR road level (grounded OR hopping — a drift
    // hop must not sail over the 1.12 m rail into the void). Karts far
    // BELOW the road (void falls) fall cleanly: clamping them dragged them
    // sideways and corrupted their track progress.
    if (!gi || gi.onJump || gi.onShortcut >= 0) return;
    if (kart.pos.y - gi.height > 1.6) return;   // above rail height
    if (gi.height - kart.pos.y > 3) return;     // deep in a fall
    const idx = gi.mainIdx;
    if (idx < 0) return;
    const openSide = gi.lateral < 0 ? this.railOpen.left : this.railOpen.right;
    if (openSide[idx]) return;
    const sm = this.spline.samples[idx];
    const limit = sm.halfWidth + WALL_LIMIT;
    if (Math.abs(gi.lateral) <= limit) {
      kart.railGrindT = 0; // clean stretch — reset the grind detector
      return;
    }

    const sign = Math.sign(gi.lateral);
    // LATERAL-ONLY clamp: remove exactly the outward overshoot along the
    // sample's right vector — NEVER the along-track motion. The old version
    // teleported the kart to the rail point of its projected sample, which
    // also cancelled the FORWARD component of every step; the kart then
    // re-projected to the same sample, got teleported to the same point,
    // and sat in a perfect fixed-point attractor (frozen position, 4.5 m/s
    // wheelspin, minutes on end). Grazing karts now keep their speed and
    // SLIDE along the rail; only the outward escape is blocked.
    const overshoot = Math.abs(gi.lateral) - limit;
    if (overshoot > 1e-4) {
      const pull = Math.min(overshoot, 1.5); // ≤ 1.5 m per frame, never a teleport
      kart.pos.x -= sm.right.x * sign * pull;
      kart.pos.z -= sm.right.z * sign * pull;
      // spring BACK into the road a touch (restitution) — a hard hit throws
      // the kart off the wall instead of gluing it to the rail
      const back = Math.min(0.25 * pull, 0.3);
      kart.pos.x -= sm.right.x * sign * back;
      kart.pos.z -= sm.right.z * sign * back;
    }

    // RAIL-GRIND TIMER (detection only — the AI rescues itself): the clamp
    // above can cancel a kart's motion every frame, leaving it in a perfect
    // wheelspin equilibrium against the rail. The wall used to fight back
    // by overriding yaw — that overpowered the driver's steering and froze
    // karts for minutes. Now it just measures; AIDriver reads railGrindT
    // and re-aims deep into the road to peel off the wall.
    kart.railGrindT += 1 / 60;
    const tanYaw = Math.atan2(sm.tangent.x, sm.tangent.z);

    // proportional scrub: head-on into the rail loses ~40%, grazing ~nothing
    const fwd = kart.forward();
    const out = Math.max(0, fwd.x * sm.right.x * sign + fwd.z * sm.right.z * sign);
    if (out > 0) kart.speed *= 1 - out * 0.4;
    // impact intensity for FX (sparks + camera kick) — anything above a
    // shallow graze counts; deep hits (head-on at speed) scale to 1
    if (out > 0.18 && Math.abs(kart.speed) > 7) {
      kart.wallHit = Math.max(kart.wallHit, Math.min(1, out * Math.abs(kart.speed) / 16));
      kart.slip *= 0.6;
    }
    // redirect grinding karts along the rail so they never stall against it
    if (out > 0.25 && Math.abs(kart.speed) > 2) {
      const delta = wrapAngle(tanYaw - kart.yaw);
      kart.yaw += delta * 0.14;
      kart.slip *= 0.5;
    }
  }

  // ------------------------------------------------------------ tunnels

  /** Arched tunnel over every `tunnel` run: tube + portals + ribs + lights. */
  private buildTunnels(): void {
    const sp = this.spline;
    const N = sp.samples.length;
    const runs: { start: number; end: number }[] = [];

    // collect wrap-aware runs of consecutive tunnel samples
    let any = false;
    for (let i = 0; i < N; i++) if (sp.samples[i].tunnel) { any = true; break; }
    if (!any) return;

    // find run starts: tunnel sample whose predecessor is not tunnel
    for (let i = 0; i < N; i++) {
      if (!sp.samples[i].tunnel) continue;
      if (!sp.samples[(i - 1 + N) % N].tunnel) {
        // walk to the end of the run
        let end = i;
        while (sp.samples[(end + 1) % N].tunnel && end < i + N) end = (end + 1) % N;
        runs.push({ start: i, end });
      }
    }

    const wallMat = new THREE.MeshLambertMaterial({ map: tunnelTexture(this.def.theme), side: THREE.DoubleSide });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8 });
    const ribMat = mat(0x2e323c);

    // arch profile (lateral, height above road center)
    const profile = (hw: number): { lat: number; y: number }[] => [
      { lat: -(hw + 3.0), y: -0.4 },
      { lat: -(hw + 3.0), y: 2.8 },
      { lat: -(hw + 1.7), y: 4.6 },
      { lat: -(hw * 0.45), y: 5.9 },
      { lat: 0, y: 6.5 },
      { lat: hw * 0.45, y: 5.9 },
      { lat: hw + 1.7, y: 4.6 },
      { lat: hw + 3.0, y: 2.8 },
      { lat: hw + 3.0, y: -0.4 },
    ];

    for (const run of runs) {
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      const len = (run.end - run.start + N) % N;
      // include one solid sample before/after for a clean junction
      for (let k = 0; k <= len + 1; k++) {
        const i = (run.start + k) % N;
        const j = (i + 1) % N;
        const prof = profile(sp.samples[i].halfWidth);
        const profN = profile(sp.samples[j].halfWidth);
        const base = pos.length / 3;
        for (let p = 0; p < prof.length; p++) {
          const a = this.vertexAt(i, prof[p].lat, prof[p].y);
          const b = this.vertexAt(j, profN[p].lat, profN[p].y);
          pos.push(a.x, a.y, a.z);
          uv.push(p / (prof.length - 1) * 3, sp.samples[i].dist / 9);
          pos.push(b.x, b.y, b.z);
          uv.push(p / (prof.length - 1) * 3, (j <= i ? sp.length : sp.samples[j].dist) / 9);
        }
        for (let p = 0; p < prof.length - 1; p++) {
          const v0 = base + p * 2, v1 = base + p * 2 + 1;
          const v2 = base + (p + 1) * 2, v3 = base + (p + 1) * 2 + 1;
          idx.push(v0, v1, v2, v1, v3, v2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      this.group.add(new THREE.Mesh(geo, wallMat));

      // portals (entrance + exit facades)
      for (const at of [run.start, (run.end + 1) % N]) {
        const sm = sp.sampleAt(sp.samples[at].s);
        const portal = new THREE.Group();
        for (const side of [-1, 1]) {
          const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 7.4, 1.4), ribMat);
          pillar.position.copy(sm.pos).addScaledVector(sm.right, side * (sm.halfWidth + 2.6));
          pillar.position.y += 3.3;
          portal.add(pillar);
        }
        const beam = new THREE.Mesh(
          new THREE.BoxGeometry((sm.halfWidth + 3.4) * 2, 1.6, 1.4), ribMat);
        beam.position.copy(sm.pos).add(new THREE.Vector3(0, 6.6, 0));
        beam.rotation.y = -Math.atan2(sm.tangent.z, sm.tangent.x) + Math.PI / 2;
        portal.add(beam);
        this.group.add(portal);
      }

      // ribs every 6 samples + ceiling light strips every 4 samples
      for (let k = 0; k <= len; k++) {
        const i = (run.start + k) % N;
        const sm = sp.samples[i];
        if (k % 6 === 0) {
          for (const side of [-1, 1]) {
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.6, 0.5), ribMat);
            pillar.position.copy(this.vertexAt(i, side * (sm.halfWidth + 2.2), 2.1));
            this.group.add(pillar);
          }
        }
        if (k % 4 === 2) {
          const light = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.4), lightMat);
          light.rotation.x = Math.PI / 2; // face down
          light.rotation.z = -Math.atan2(sm.tangent.z, sm.tangent.x) + Math.PI / 2;
          light.position.copy(this.vertexAt(i, 0, 6.15));
          this.group.add(light);
        }
      }
    }
  }

  // ------------------------------------------------------------ boost pads

  private buildPads(): void {
    const padTex = makeChevronTexture(this.style.pad);
    for (const p of this.def.boostPads) {
      const sm = this.spline.sampleAt(this.mirror ? 1 - p : p);
      const geo = new THREE.PlaneGeometry(sm.halfWidth * 1.7, 4.2);
      const m = new THREE.MeshBasicMaterial({ map: padTex, transparent: true });
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.copy(sm.pos).add(new THREE.Vector3(0, 0.07, 0));
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      mesh.rotateZ(-Math.atan2(sm.tangent.z, sm.tangent.x) + Math.PI / 2);
      this.group.add(mesh);
      this.pads.push({ pos: mesh.position.clone(), s: p });
      this.animatables.push({
        update: (t) => { padTex.offset.y = -t * 1.6; },
      });
    }
  }

  // ------------------------------------------------------------ item boxes

  private buildItemBoxes(): void {
    const rng = makeRng(1337);
    const count = ITEMS.boxesPerTrack;
    for (let i = 0; i < count; i++) {
      // start the first row after the first corner (i+2), not on the grid
      const s = (((i + 2) % count) + 0.5) / count;
      const sm = this.spline.sampleAt(s);
      const lateral = (rng() * 2 - 1) * Math.max(1, sm.halfWidth - 2.4);
      const pos = this.spline.roadPoint(s, lateral).add(new THREE.Vector3(0, ITEMS.boxFloatHeight, 0));
      const golden = i % 3 === 1;                 // MK8D-style double item boxes
      const mesh = makeItemBoxMesh(golden);
      mesh.position.copy(pos);
      this.group.add(mesh);
      this.itemBoxes.push({ pos, mesh, active: true, respawnAt: 0, golden });
      this.animatables.push({
        update: (t) => {
          mesh.rotation.y = t * 1.4; mesh.rotation.x = t * 0.9;
          mesh.position.y = pos.y + Math.sin(t * 2 + i) * 0.22;
          if (!this.itemBoxes[i].active && performance.now() >= this.itemBoxes[i].respawnAt) {
            this.itemBoxes[i].active = true;
            mesh.visible = true;
          }
        },
      });
    }
  }

  // ------------------------------------------------------------ coins

  /**
   * MK-style coin economy: rows of 3 coins spread over the lap (center line
   * plus both flanks). One InstancedMesh keeps it at a single draw call;
   * consumed coins hide via zero-scale and respawn after PHYS.coinRespawnMs.
   */
  private buildCoins(): void {
    const rows = PHYS.coinRows;
    const perRow = 3;
    const count = rows * perRow;

    const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 14);
    geo.rotateX(Math.PI / 2);   // stand the disc up facing down the road
    const goldMat = new THREE.MeshLambertMaterial({
      color: 0xffc83a, emissive: 0x5a3c00,
    });
    const inst = new THREE.InstancedMesh(geo, goldMat, count);
    inst.castShadow = false;
    inst.frustumCulled = false;
    this.group.add(inst);
    this.coinMesh = inst;

    const dummy = new THREE.Object3D();
    let n = 0;
    for (let r = 0; r < rows; r++) {
      // start past the grid; rows spread over the remaining lap
      const s = (0.035 + (r / rows) * 0.93) % 1;
      const sm = this.spline.sampleAt(s);
      const latBase = Math.max(1.2, (sm.halfWidth - 2.2) * 0.55);
      for (let k = 0; k < perRow; k++) {
        const lateral = (k - 1) * latBase;   // -1 / 0 / +1 flanks
        const pos = this.spline.roadPoint(s, lateral).add(new THREE.Vector3(0, 0.75, 0));
        const coin: CoinInstance = { pos, active: true, respawnAt: 0, idx: n, s, lat: lateral };
        this.coins.push(coin);
        this.writeCoinMatrix(dummy, coin, 0);
        n++;
      }
    }
    inst.instanceMatrix.needsUpdate = true;

    // shared spin — the classic MK coin twirl
    this.animatables.push({
      update: (t) => {
        const spin = t * 3.4;
        const now = performance.now();
        let dirty = false;
        for (const c of this.coins) {
          if (!c.active && now >= c.respawnAt) {
            c.active = true;
            dirty = true;
          }
        }
        if (dirty || true) {  // spin requires a matrix write each frame anyway
          for (const c of this.coins) {
            if (c.active) this.writeCoinMatrix(dummy, c, spin);
          }
          inst.instanceMatrix.needsUpdate = true;
        }
      },
    });
  }

  private writeCoinMatrix(dummy: THREE.Object3D, c: CoinInstance, spin: number): void {
    if (!this.coinMesh) return;
    if (!c.active) {
      dummy.position.set(0, -1000, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.001);
    } else {
      dummy.position.copy(c.pos);
      dummy.rotation.set(0, spin + c.idx * 0.7, 0);
      dummy.scale.setScalar(1);
    }
    dummy.updateMatrix();
    this.coinMesh.setMatrixAt(c.idx, dummy.matrix);
  }

  /** Hide a coin & schedule its respawn. */
  consumeCoin(c: CoinInstance): void {
    c.active = false;
    c.respawnAt = performance.now() + PHYS.coinRespawnMs;
  }

  // ------------------------------------------------------------ finish arch

  private buildFinishArch(): void {
    const sm = this.spline.sampleAt(0);
    this.finishPos.copy(sm.pos);
    const pillarGeo = new THREE.BoxGeometry(1.1, 6.5, 1.1);
    const pillarMat = mat(0xe8e8ee);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.copy(sm.pos).addScaledVector(sm.right, side * (sm.halfWidth + 1.6));
      p.position.y += 3.25;
      this.group.add(p);
    }
    // banner with scrolling checker
    const tex = makeBannerTexture();
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry((sm.halfWidth + 2.2) * 2, 2.2, 0.35),
      [mat(0x222233), mat(0x222233), mat(0x222233), mat(0x222233), new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ map: tex })],
    );
    banner.position.copy(sm.pos).add(new THREE.Vector3(0, 7.3, 0));
    banner.rotation.y = -Math.atan2(sm.tangent.z, sm.tangent.x);
    this.group.add(banner);
    this.animatables.push({ update: (t) => { tex.offset.x = t * 0.15; } });
  }

  // ------------------------------------------------------------ hazards

  private buildHazards(): void {
    for (const def of this.def.hazards) {
      const inst = this.makeHazard(def);
      if (inst) { this.hazards.push(inst); this.group.add(inst.mesh); }
    }
  }

  private makeHazard(def: HazardDef): HazardInstance | null {
    const sm = this.spline.sampleAt(this.mirror ? 1 - def.at : def.at);
    const roadHalf = sm.halfWidth;

    switch (def.kind) {
      case 'mover': {
        const mesh = makeMoverMesh(def.label ?? 'rock');
        // sweep only ~42% of the road width: dodging room on BOTH sides
        // (55% crammed the whole pack into one dodge lane and jammed chicanes)
        const amp = (roadHalf - 1) * 0.42;
        const speed = def.speed ?? 8;
        const phase = def.phase ?? 0;
        const pos = new THREE.Vector3();
        const inst: HazardInstance = {
          def, mesh, pos, radius: def.radius ?? 1.5, active: true,
          update: (t) => {
            const lat = Math.sin(phase + t * speed / Math.max(amp, 1)) * amp;
            const p = this.spline.roadPoint(def.at, lat);
            pos.copy(p).add(new THREE.Vector3(0, mesh.userData.lift ?? 0.7, 0));
            mesh.position.copy(pos);
            mesh.rotation.y = t * (mesh.userData.spin ?? 1.5);
          },
        };
        return inst;
      }
      case 'faller': {
        const mesh = makeFallerMesh(def.label ?? 'lavarock');
        const period = def.period ?? 3;
        const phase = def.phase ?? 0;
        const top = sm.pos.y + 26;
        const pos = new THREE.Vector3();
        // telegraph ring
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.5, 12),
          new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(sm.pos).add(new THREE.Vector3(0, 0.08, 0));
        this.group.add(ring);
        const inst: HazardInstance = {
          def, mesh, pos, radius: def.radius ?? 1.6, active: false,
          update: (t) => {
            const cyc = ((t + phase) % period) / period;
            const fallT = Math.max(0, cyc - 0.35) / 0.65; // 35% hover, 65% fall
            const y = top - fallT * (top - sm.pos.y);
            pos.set(sm.pos.x, Math.min(y, sm.pos.y), sm.pos.z);
            mesh.position.copy(pos);
            mesh.rotation.x += 0.05; mesh.rotation.z += 0.03;
            const near = y - sm.pos.y < 2.2;
            inst.active = near && fallT > 0.9 ? true : near;
            ring.scale.setScalar(0.9 + cyc * 0.5);
            (ring.material as THREE.MeshBasicMaterial).opacity = 0.2 + cyc * 0.5;
          },
        };
        return inst;
      }
      case 'zone': {
        const mesh = makeZoneMesh(def, sm);
        const pos = sm.pos.clone();
        const inst: HazardInstance = {
          def, mesh, pos, radius: def.radius ?? 8, active: true,
          update: (t) => { mesh.rotation.z = t * 0.3; },
        };
        return inst;
      }
      case 'gate': {
        const frame = new THREE.Group();
        const postMat = mat(0x555566);
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.6, 0.6), postMat);
          post.position.copy(sm.pos).addScaledVector(sm.right, side * (roadHalf + 0.3));
          post.position.y += 2.3;
          frame.add(post);
        }
        const wallMat = new THREE.MeshBasicMaterial({
          color: def.label === 'prism' ? 0xff5a8a : def.label === 'airlock' ? 0x35e0ff : 0xffb63a,
          transparent: true, opacity: 0.75, side: THREE.DoubleSide,
        });
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(roadHalf * 2, 4.2), wallMat);
        wall.position.copy(sm.pos).add(new THREE.Vector3(0, 2.1, 0));
        wall.rotation.y = -Math.atan2(sm.tangent.z, sm.tangent.x) + Math.PI / 2;
        frame.add(wall);
        const period = def.period ?? 2.5;
        const phase = def.phase ?? 0;
        const pos = wall.position.clone();
        const inst: HazardInstance = {
          def, mesh: frame, pos, radius: roadHalf + 0.6, active: true,
          update: (t) => {
            const cyc = ((t + phase) / period) % 1;
            const active = cyc < 0.52;
            inst.active = active;
            wallMat.opacity = active ? 0.75 : 0.08;
            wall.scale.y = active ? 1 : 0.25;
          },
        };
        return inst;
      }
    }
    return null;
  }

  // ------------------------------------------------------------ spawns

  private buildSpawns(): void {
    const sp = this.spline;
    for (let i = 0; i < 12; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2 === 0 ? -1 : 1;
      const s = Spline.wrapS(-(7 + row * 3.4) / sp.length);
      const lateral = col * 2.7;
      this.spawnPoints.push(sp.roadPoint(s, lateral));
    }
    // respawn anchors: nearest SOLID sample per sector (never mid-gap)
    for (let k = 0; k < 12; k++) {
      let s = (k + 0.5) / 12;
      const sm = sp.sampleAt(s);
      if (sm.jump) {
        // nudge forward to next solid sample
        for (let d = 0.004; d < 0.1; d += 0.004) {
          if (!sp.sampleAt(Spline.wrapS(s + d)).jump) { s = Spline.wrapS(s + d); break; }
        }
      }
      this.respawnPoints.push(sp.roadPoint(s, 0));
    }
  }

  // ------------------------------------------------------------ decorations

  private buildDecorations(decorScale: number, crowdScale: number): void {
    const rng = makeRng(this.def.id.length * 7919 + 13);
    const style = this.style;
    const sp = this.spline;

    // scatter props along both sides of the road
    if (style.props.length > 0 && style.skirt > 4) {
      const perKind = Math.floor(52 * style.propDensity * decorScale);
      for (const kind of style.props) {
        for (let i = 0; i < perKind; i++) {
          const s = rng();
          const sm = sp.sampleAt(s);
          if (sm.tunnel) continue; // don't plant trees inside tunnels
          const side = rng() > 0.5 ? 1 : -1;
          // fold guard: props stay INSIDE this side's clearance envelope so
          // trees never stand on (or through) another section of the track
          const idx = sp.indexAtS(s);
          const cap = this.terrainClear[this.skIdx(side)][idx];
          const maxOff = Math.min(
            Math.max(2, style.skirt * 0.6),
            Math.max(1.5, cap - sm.halfWidth - 1.2),
          );
          const lateral = side * (sm.halfWidth + 4.5 + rng() * maxOff);
          const pos = sp.roadPoint(s, lateral);
          pos.y -= 0.15;
          const prop = buildProp(kind as PropKind, rng, this.def.theme);
          prop.position.copy(pos);
          prop.rotation.y = rng() * Math.PI * 2;
          this.group.add(prop);
          if ((prop.children[0] as THREE.Mesh & { userData: { spin?: number } }).userData?.spin) {
            const spin = (prop.children[0] as THREE.Mesh & { userData: { spin?: number } }).userData.spin ?? 0.3;
            this.animatables.push({ update: (_t, dt) => { prop.children[0].rotation.z += dt * spin; } });
          }
        }
      }
    } else if (style.props.length > 0) { // void themes: float props beside road
      const perKind = Math.floor(26 * style.propDensity * decorScale);
      for (const kind of style.props) {
        for (let i = 0; i < perKind; i++) {
          const s = rng();
          const sm = sp.sampleAt(s);
          if (sm.tunnel) continue;
          const side = rng() > 0.5 ? 1 : -1;
          const lateral = side * (sm.halfWidth + 6 + rng() * 16);
          const pos = sp.roadPoint(s, lateral);
          pos.y += rng() * 6 - 2;
          const prop = buildProp(kind as PropKind, rng, this.def.theme);
          prop.position.copy(pos);
          this.group.add(prop);
          this.animatables.push({ update: (t) => { prop.position.y = pos.y + Math.sin(t * 0.7 + i) * 0.8; prop.rotation.y += 0.002; } });
        }
      }
    }

    // sky
    this.group.add(buildSky(style, this.def.theme));

    // crowd grandstands beside the start straight
    // (buildCrowd builds in a local frame: X along the road, Z away from it —
    // the stands now run PARALLEL to the start straight, never across it)
    if (crowdScale > 0) {
      const s0 = 0.035;
      const sm = sp.sampleAt(s0);
      const along = new THREE.Vector3(sm.tangent.x, 0, sm.tangent.z).normalize();
      const idx0 = sp.indexAtS(s0);
      // stands sit on the skirt — pull them in if a fold clamps it tight
      const standOff = (side: 1 | -1): number => {
        const cap = this.terrainClear[this.skIdx(side)][idx0];
        return Math.min(7.2, Math.max(3.4, cap - sm.halfWidth - 4.2));
      };
      // left-side stand (lateral < 0): steps away along -right
      const offL = standOff(-1);
      const baseL = sp.roadPoint(s0, -sm.halfWidth - offL - 1.2);
      baseL.y -= 0.25; // sit on the skirt terrain, which slopes off the kerb
      const crowdL = buildCrowd(Math.floor(72 * crowdScale), baseL, along, sm.right.clone().negate(), 34);
      this.group.add(crowdL.group);
      this.animatables.push({ update: (t) => crowdL.update(t) });
      // right-side stand
      const offR = standOff(1);
      const baseR = sp.roadPoint(s0, sm.halfWidth + offR + 1.2);
      baseR.y -= 0.25;
      const crowdR = buildCrowd(Math.floor(56 * crowdScale), baseR, along, sm.right.clone(), 34);
      this.group.add(crowdR.group);
      this.animatables.push({ update: (t) => crowdR.update(t) });
    }
  }

  // ------------------------------------------------------------ edge dressing

  /**
   * Everything that makes the road VERGE read as a raced-on circuit instead
   * of an empty ribbon: sponsor billboards, tyre stacks on corner outsides,
   * chevron boards before corner entries, reflector delineator posts and
   * instanced verge scrub. All merged/instanced — ~9 extra draw calls.
   */
  private buildEdgeDressing(decorScale: number): void {
    const sp = this.spline;
    const N = sp.samples.length;
    const theme = this.def.theme;
    const rng = makeRng(this.def.id.length * 613 + 91);
    const skip = this.style.skirt <= 3; // void themes keep clean edges

    // signed curvature (rad/m) — same recipe as the racing line
    const kappa = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = sp.samples[(i - 3 + N) % N];
      const b = sp.samples[(i + 3) % N];
      const cross = a.tangent.x * b.tangent.z - a.tangent.z * b.tangent.x;
      const ds = Math.max(0.5, b.pos.distanceTo(a.pos));
      kappa[i] = Math.asin(Math.max(-1, Math.min(1, cross))) / ds;
    }
    // ok to dress? (not in a tunnel, not over a gap, not in a rail window,
    // and INSIDE this side's fold-guard envelope — no billboards standing
    // on a neighbor road in the tight folds)
    const dressable = (i: number, side: 1 | -1, lat = 0): boolean => {
      const sm = sp.samples[i];
      if (sm.tunnel || sm.jump) return false;
      if (sp.samples[(i + 1) % N].jump) return false;
      if (sp.samples[(i - 1 + N) % N].jump) return false;
      if (lat > 0 && lat >= this.terrainClear[this.skIdx(side)][i] - 0.6) return false;
      const open = side < 0 ? this.railOpen.left : this.railOpen.right;
      for (let k = -6; k <= 6; k++) if (open[((i + k) % N + N) % N]) return false;
      return true;
    };
    // kappa<0 = left turn (inside is +lat, i.e. the track-left side)
    const outsideSign = (k: number): 1 | -1 => (k < 0 ? -1 : 1);

    // ---- 1. sponsor billboards every ~75 m, alternating sides --------------
    if (!skip) {
      const step = 75 / sp.length;
      let side: 1 | -1 = 1;
      let bi = 0;
      const panelGeos: THREE.BufferGeometry[][] = [[], [], [], []];
      const postGeos: THREE.BufferGeometry[] = [];
      for (let s = 0.05; s < 1; s += step) {
        const i = sp.indexAtS(Spline.wrapS(s));
        const sm = sp.samples[i];
        const billLat = side * (sm.halfWidth + 4.6);
        if (!dressable(i, side, Math.abs(billLat))) { side = -side as 1 | -1; continue; }
        const lat = billLat;
        const base = sp.roadPoint(Spline.wrapS(s), lat);
        // panel faces the road: normal = -side * right
        const nrm = sm.right.clone().multiplyScalar(-side);
        const yaw = Math.atan2(nrm.x, nrm.z);
        const panel = new THREE.PlaneGeometry(7.2, 2.3);
        const mtx = new THREE.Matrix4().makeRotationY(yaw);
        mtx.setPosition(base.x, base.y + 2.7, base.z);
        panelGeos[bi % 4].push(panel.clone().applyMatrix4(mtx));
        // two legs
        for (const lx of [-2.6, 2.6]) {
          const leg = new THREE.CylinderGeometry(0.11, 0.13, 2.9, 6);
          const m2 = new THREE.Matrix4().makeRotationY(yaw);
          const off = new THREE.Vector3(lx, 1.15, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(yaw));
          m2.setPosition(base.x + off.x, base.y + 1.15, base.z + off.z);
          postGeos.push(leg.applyMatrix4(m2));
        }
        bi++;
        side = -side as 1 | -1;
      }
      for (let t = 0; t < 4; t++) {
        if (!panelGeos[t].length) continue;
        const merged = mergeGeometries(panelGeos[t]);
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged,
          new THREE.MeshLambertMaterial({ map: billboardTexture(t), side: THREE.DoubleSide }));
        mesh.castShadow = false;
        this.group.add(mesh);
      }
      if (postGeos.length) {
        const merged = mergeGeometries(postGeos);
        if (merged) this.group.add(new THREE.Mesh(merged, mat(0x3c414c)));
        for (const g of postGeos) g.dispose();
      }
    }

    // ---- 2. tyre stacks on corner outsides (instanced tori) -----------------
    if (!skip) {
      const spots: { pos: THREE.Vector3 }[] = [];
      let i = 0;
      while (i < N) {
        if (Math.abs(kappa[i]) < 0.035) { i++; continue; }
        let end = i;
        while (end < N && Math.abs(kappa[end]) >= 0.028) end++;
        const runLen = (end - i) * (sp.length / N);
        const side = outsideSign(kappa[(i + end) >> 1]);
        if (runLen > 12) {
          const every = Math.max(3, Math.round(4.5 / (sp.length / N)));
          for (let k = i; k < end - 2; k += every) {
            const smk = sp.samples[k];
            const tyreLat = side * (smk.halfWidth + 2.0);
            if (!dressable(k, side, Math.abs(tyreLat))) continue;
            const sm = smk;
            spots.push({ pos: sp.roadPoint(sm.s, tyreLat) });
            if (spots.length >= 110) break;
          }
        }
        if (spots.length >= 110) break;
        i = end;
      }
      if (spots.length) {
        const tyreGeo = new THREE.TorusGeometry(0.55, 0.22, 8, 14);
        tyreGeo.rotateX(Math.PI / 2);
        const tyres = new THREE.InstancedMesh(tyreGeo,
          new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length * 2);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const sc = new THREE.Vector3(1, 1, 1);
        let n = 0;
        for (let sIdx = 0; sIdx < spots.length; sIdx++) {
          const p = spots[sIdx].pos;
          // bottom tyre
          m.compose(new THREE.Vector3(p.x, p.y + 0.24, p.z), q, sc);
          tyres.setMatrixAt(n, m);
          tyres.setColorAt(n, new THREE.Color(0x181a20));
          n++;
          // top tyre, slightly rotated & every 3rd stack painted white
          const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.35);
          m.compose(new THREE.Vector3(p.x, p.y + 0.62, p.z), q2, sc);
          tyres.setMatrixAt(n, m);
          tyres.setColorAt(n, new THREE.Color(sIdx % 3 === 1 ? 0xe8e8ee : 0x232630));
          n++;
        }
        tyres.instanceMatrix.needsUpdate = true;
        this.group.add(tyres);
      }
    }

    // ---- 3. chevron boards before corner entries ------------------------------
    if (!skip) {
      const boards: { pos: THREE.Vector3; yaw: number; flip: boolean }[] = [];
      const lookAhead = Math.max(2, Math.round(14 / (sp.length / N)));
      for (let i = 0; i < N; i++) {
        if (Math.abs(kappa[i]) > 0.012) continue;
        const j = (i + lookAhead) % N;
        if (Math.abs(kappa[j]) < 0.05) continue;
        const k = kappa[(j + 4) % N];
        const side = outsideSign(k);
        // place ~14 m before the entry, on the OUTSIDE, facing oncoming traffic
        const back = Math.max(2, Math.round(14 / (sp.length / N)));
        const at = (i - back + N) % N;
        const smAt = sp.samples[at];
        const chevLat = side * (smAt.halfWidth + 2.9);
        if (!dressable(at, side, Math.abs(chevLat))) continue;
        const sm = smAt;
        const pos = sp.roadPoint(sm.s, chevLat);
        const yaw = Math.atan2(-sm.tangent.x, -sm.tangent.z); // face backwards along the road
        if (boards.length && boards[boards.length - 1].pos.distanceToSquared(pos) < 30 * 30) continue;
        boards.push({ pos, yaw, flip: k < 0 });
        if (boards.length >= 12) break;
      }
      if (boards.length) {
        const geo = new THREE.PlaneGeometry(2.3, 1.15);
        const mtx = new THREE.Matrix4();
        const chevGeos: THREE.BufferGeometry[] = [];
        for (const b of boards) {
          const g = geo.clone();
          if (b.flip) g.scale(-1, 1, 1);
          mtx.makeRotationY(b.yaw);
          mtx.setPosition(b.pos.x, b.pos.y + 1.5, b.pos.z);
          chevGeos.push(g.applyMatrix4(mtx));
        }
        const merged = mergeGeometries(chevGeos);
        if (merged) {
          this.group.add(new THREE.Mesh(merged, new THREE.MeshBasicMaterial({
            map: chevronTexture(), side: THREE.DoubleSide,
          })));
        }
        for (const g of chevGeos) g.dispose();
        // posts under the boards
        const postGeos: THREE.BufferGeometry[] = [];
        for (const b of boards) {
          const leg = new THREE.CylinderGeometry(0.07, 0.07, 1.6, 5);
          const m2 = new THREE.Matrix4();
          m2.makeTranslation(b.pos.x, b.pos.y + 0.8, b.pos.z);
          postGeos.push(leg.applyMatrix4(m2));
        }
        const pm = mergeGeometries(postGeos);
        if (pm) this.group.add(new THREE.Mesh(pm, mat(0x555a66)));
        for (const g of postGeos) g.dispose();
      }
    }

    // ---- 4. reflector delineator posts (instanced, both edges) ---------------
    {
      const dark = ['city', 'space', 'volcano', 'prism'].includes(theme);
      const every = Math.max(2, Math.round(16 / (sp.length / N)));
      const spots: THREE.Vector3[] = [];
      for (let i = 0; i < N; i += every) {
        for (const side of [-1, 1] as const) {
          if (!dressable(i, side)) continue;
          const sm = sp.samples[i];
          spots.push(sp.roadPoint(sm.s, side * (sm.halfWidth + 1.15)));
        }
      }
      if (spots.length) {
        const postGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.85, 5);
        postGeo.translate(0, 0.42, 0);
        const posts = new THREE.InstancedMesh(postGeo,
          new THREE.MeshLambertMaterial({ color: dark ? this.style.pad : 0xf2f4f8, emissive: dark ? this.style.pad & 0x555555 : 0x000000 }),
          spots.length);
        const m = new THREE.Matrix4();
        for (let k = 0; k < spots.length; k++) {
          m.makeTranslation(spots[k].x, spots[k].y - 0.05, spots[k].z);
          posts.setMatrixAt(k, m);
        }
        posts.instanceMatrix.needsUpdate = true;
        this.group.add(posts);
      }
    }

    // ---- 5. verge scrub (instanced blobs just past the kerb) -----------------
    if (!skip && decorScale > 0.35) {
      const colorBy: Record<string, number> = {
        meadow: 0x4f9a3e, castle: 0x568a44, jungle: 0x2f7f36, desert: 0xb8a06a,
        beach: 0x8fc88a, snow: 0xe6f0fa, glacier: 0xd0e4f4, volcano: 0x4a3a34,
        factory: 0x5a5e52, city: 0x3c4148,
      };
      const col = colorBy[theme] ?? 0x4f9a3e;
      const every = Math.max(2, Math.round(11 / (sp.length / N)));
      const spots: { p: THREE.Vector3; s: number }[] = [];
      for (let i = 0; i < N; i += every) {
        const side = rng() > 0.5 ? 1 : -1;
        if (!dressable(i, side as 1 | -1)) continue;
        const sm = sp.samples[i];
        const lat = side * (sm.halfWidth + 1.9 + rng() * 1.8);
        spots.push({ p: sp.roadPoint(sm.s, lat), s: 0.55 + rng() * 0.75 });
      }
      if (spots.length) {
        const geo = new THREE.IcosahedronGeometry(0.5, 0);
        geo.scale(1.25, 0.75, 1.25);
        const scrub = new THREE.InstancedMesh(geo,
          new THREE.MeshLambertMaterial({ color: col }), spots.length);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        for (let k = 0; k < spots.length; k++) {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
          m.compose(new THREE.Vector3(spots[k].p.x, spots[k].p.y + 0.12, spots[k].p.z), q,
            new THREE.Vector3(spots[k].s, spots[k].s * 0.9, spots[k].s));
          scrub.setMatrixAt(k, m);
        }
        scrub.instanceMatrix.needsUpdate = true;
        this.group.add(scrub);
      }
    }
  }

  // ------------------------------------------------------------ bunting

  /**
   * Overhead pennant strings strung across the track every ~90 m — the
   * canopy-of-flags look of a classic party racer. Skipped over jumps,
   * tunnels and void themes.
   */
  private buildBunting(): void {
    if (this.style.skirt <= 3) return;
    const sp = this.spline;
    const N = sp.samples.length;
    const colA = this.style.curbA, colB = this.style.curbB;

    const flagGeos: [THREE.BufferGeometry[], THREE.BufferGeometry[]] = [[], []];
    const ropeGeos: THREE.BufferGeometry[] = [];
    const poleGeos: THREE.BufferGeometry[] = [];
    let made = 0;

    const spanOk = (i: number): boolean => {
      for (const k of [-2, -1, 0, 1, 2]) {
        const sm = sp.samples[((i + k) % N + N) % N];
        if (sm.tunnel || sm.jump) return false;
      }
      const openL = this.railOpen.left, openR = this.railOpen.right;
      for (let k = -4; k <= 4; k++) {
        const j = ((i + k) % N + N) % N;
        if (openL[j] || openR[j]) return false;
      }
      return true;
    };

    const step = 90 / sp.length;
    for (let s = 0.13; s < 0.97; s += step) {
      const i = sp.indexAtS(Spline.wrapS(s));
      if (!spanOk(i)) continue;
      const sm = sp.samples[i];
      const H = 6.6;
      const a = sp.roadPoint(Spline.wrapS(s), -(sm.halfWidth + 1.1)).add(new THREE.Vector3(0, H, 0));
      const b = sp.roadPoint(Spline.wrapS(s), sm.halfWidth + 1.1).add(new THREE.Vector3(0, H, 0));
      const yaw = Math.atan2(sm.tangent.x, sm.tangent.z);
      // anchor poles
      for (const p of [a, b]) {
        const pole = new THREE.CylinderGeometry(0.07, 0.09, H, 6);
        const m = new THREE.Matrix4();
        m.makeRotationY(yaw);
        m.setPosition(p.x, p.y - H / 2, p.z);
        poleGeos.push(pole.applyMatrix4(m));
      }
      // sagging rope: parabola dip 0.55 m, 8 segments
      const SEG = 8;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= SEG; k++) {
        const u = k / SEG;
        const dip = 4 * 0.55 * u * (1 - u);      // parabola: 0 at ends, max mid
        pts.push(new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -dip, 0)));
      }
      for (let k = 0; k < SEG; k++) {
        const p0 = pts[k], p1 = pts[k + 1];
        const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
        const len = p0.distanceTo(p1);
        const seg = new THREE.CylinderGeometry(0.025, 0.025, len, 4);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(p1, p0).normalize());
        const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
        m.setPosition(mid.x, mid.y, mid.z);
        ropeGeos.push(seg.applyMatrix4(m));
      }
      // pennant flags hanging from the rope points (skip the 2 pole ends)
      for (let k = 1; k < SEG; k++) {
        const flag = new THREE.ConeGeometry(0.3, 0.62, 4);
        flag.rotateX(Math.PI);                     // point down
        const m = new THREE.Matrix4().makeRotationY(yaw);
        m.setPosition(pts[k].x, pts[k].y - 0.36, pts[k].z);
        flagGeos[(k + made) % 2].push(flag.applyMatrix4(m));
      }
      made++;
      if (made >= 14) break;                       // enough canopy for one lap
    }

    if (poleGeos.length) {
      const merged = mergeGeometries(poleGeos);
      if (merged) this.group.add(new THREE.Mesh(merged, mat(0x2e313c)));
      for (const g of poleGeos) g.dispose();
    }
    if (ropeGeos.length) {
      const merged = mergeGeometries(ropeGeos);
      if (merged) this.group.add(new THREE.Mesh(merged, mat(0x1c1e26)));
      for (const g of ropeGeos) g.dispose();
    }
    for (const [geos, color] of [[flagGeos[0], colA], [flagGeos[1], colB]] as [THREE.BufferGeometry[], number][]) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged,
        new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
      this.group.add(mesh);
      for (const g of geos) g.dispose();
    }
  }

  // ------------------------------------------------------------ racing line

  /**
   * Precomputed racing line for the AI:
   *  - `lat`: apex-cutting lateral offset (inside of each corner, smoothed)
   *  - `vMax`: physical speed profile — corner limits from curvature, then a
   *    backward pass (braking) and forward pass (acceleration) so bots brake
   *    BEFORE the corner and power out of it, like real drivers.
   */
  private computeRacingLine(): RacingLine {
    const sp = this.spline;
    const N = sp.samples.length;
    const lat = new Float32Array(N);
    const vMax = new Float32Array(N);

    // signed curvature (rad per meter) between tangent[i-3] and tangent[i+3]
    const kappa = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = sp.samples[(i - 3 + N) % N];
      const b = sp.samples[(i + 3) % N];
      const cross = a.tangent.x * b.tangent.z - a.tangent.z * b.tangent.x;
      const ds = Math.max(0.5, b.pos.distanceTo(a.pos));
      kappa[i] = Math.asin(clampN(cross, -1, 1)) / ds;
    }

    // apex lateral: inside of the turn; magnitude scales with curvature
    for (let i = 0; i < N; i++) {
      const k = kappa[i];
      const strength = Math.min(1, Math.abs(k) * 85);
      const room = Math.max(0, sp.samples[i].halfWidth - 2.8);
      lat[i] = (k < 0 ? 1 : -1) * strength * room; // kappa<0 → turn toward +X → inside is +lat
    }
    // smooth twice with a wide circular-ish box filter (wrap-aware)
    const smooth = (src: Float32Array, radius: number): Float32Array => {
      const out = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let acc = 0, cnt = 0;
        for (let d = -radius; d <= radius; d++) {
          acc += src[(i + d + N) % N];
          cnt++;
        }
        out[i] = acc / cnt;
      }
      return out;
    };
    let latS = smooth(lat, 12);
    latS = smooth(latS, 8);
    for (let i = 0; i < N; i++) {
      const room = Math.max(0, sp.samples[i].halfWidth - 2.6);
      latS[i] = clampN(latS[i], -room, room);
    }

    // corner speed from lateral acceleration limit (arcadey: high grip),
    // with an arcade FLOOR of 12.5 m/s. The old floor (15) demanded
    // 18.7 m/s² of lateral grip through radius-12 hairpins — physically
    // impossible (grip tops at ~13.5), so bots understeered wide off every
    // tight switchback and wallowed in the grass. 12.5 clears a 12 m radius
    // at the limit; hairpin convoys stay prevented by the match-and-pass
    // car-following, not by a hot floor.
    const aLat = 13.5;
    const brake = 13.0;
    const accel = 8.5;
    const vTop = 30.0;
    for (let i = 0; i < N; i++) {
      const k = Math.max(Math.abs(kappa[i]), 1e-4);
      vMax[i] = Math.max(12.5, Math.min(vTop, Math.sqrt(aLat / k)));
    }
    // Gap zones are FLAT OUT: hold flight speed through the approach and
    // the landing. Letting the profile brake there piled 12 karts into the
    // landings (rear-enders, spins, backward drivers, falls) — the classic
    // gap-landing conga. The passes below propagate this correctly.
    for (let i = 0; i < N; i++) {
      if (!sp.samples[i].jump) continue;
      for (let d = -11; d <= 14; d++) {
        const j = (i + d + N) % N;
        vMax[j] = Math.max(vMax[j], 26);
      }
    }
    // backward pass (braking) + forward pass (traction), twice for wrap
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const j = (i + 1) % N;
        const ds = Math.max(0.5, sp.samples[j].pos.distanceTo(sp.samples[i].pos));
        vMax[i] = Math.min(vMax[i], Math.sqrt(vMax[j] * vMax[j] + 2 * brake * ds));
      }
      for (let i = 1; i <= N; i++) {
        const j = i % N;
        const p = i - 1;
        const ds = Math.max(0.5, sp.samples[j].pos.distanceTo(sp.samples[p].pos));
        vMax[j] = Math.min(vMax[j], Math.sqrt(vMax[p] * vMax[p] + 2 * accel * ds));
      }
    }

    return { lat: latS, vMax };
  }

  // ------------------------------------------------------------ queries

  /** True if sample idx sits inside or beside a jump run (gap span).
 *  Window is ±1 sample: the actual hole edges — a wider window also
 *  voided the LANDING shoulders and swallowed off-center flights that
 *  should have survived on the widened landing run-out. */
  private nearJumpRun(idx: number): boolean {
    const sp = this.spline;
    const N = sp.samples.length;
    for (let k = -1; k <= 1; k++) {
      if (sp.samples[((idx + k) % N + N) % N].jump) return true;
    }
    return false;
  }

  /** Single ground/environment query used by kart physics. */
  groundQuery(p: THREE.Vector3, state: { mainIdx: number; pathIdx: number; ptIdx: number }): GroundInfo {
    const sp = this.spline;

    // --- main spline (first: the entry gate below needs track progress) ----
    const proj: Projection = sp.project(p, state.mainIdx);
    const sm = sp.samples[proj.index];

    // --- shortcut branch ----------------------------------------------------
    // Adoption is STRICT: either the kart was already on the branch last
    // frame (continuation), or it is ENTERING — physically near the ribbon
    // START, at a track progress equal to the branch's from-progress, and
    // projecting onto the first few ribbon steps. Mid-span proximity
    // adoption used to hand out the whole mapped span as free progress
    // (prism's coil bypass = 183 m) and yanked karts off the main road.
    let pathId = -1;
    let scLat = Infinity;
    let scS = 0;
    let scPtIdx = -1;
    if (state.pathIdx >= 0 && state.pathIdx < this.shortcuts.length) {
      const pr = this.shortcuts[state.pathIdx].project(p, state.ptIdx);
      if (pr && Math.abs(pr.lateral) < 4.5) {
        pathId = state.pathIdx; scLat = pr.lateral; scS = pr.mappedS; scPtIdx = pr.index;
      }
    }
    if (pathId < 0) { // entering a branch?
      for (let i = 0; i < this.shortcuts.length; i++) {
        const sc = this.shortcuts[i];
        const from = sc.pts[0].mappedS;
        let dS = proj.s - from;
        dS = Spline.wrapS(dS + 0.5) - 0.5; // wrap to (-0.5, 0.5]
        if (dS < -0.015 || dS > 0.02) continue;   // must be AT the branch start
        // must be diving OFF the road toward the branch — a kart on the
        // racing line (small lateral) can never be yanked onto a shortcut
        if (Math.abs(proj.lateral) < proj.halfWidth * 0.55) continue;
        const entry = sc.pts[0].pos;
        if (entry.distanceToSquared(p) > 14 * 14) continue;
        const pr = sc.project(p, -1);
        if (pr && Math.abs(pr.lateral) < 4.0 && pr.index <= 8) {
          pathId = i; scLat = pr.lateral; scS = pr.mappedS; scPtIdx = pr.index;
        }
      }
    }

    const useShortcut = pathId >= 0 && Math.abs(scLat) < 3.4;
    const info: GroundInfo = {
      height: 0, hasGround: true, onRoad: false, roughness: 1,
      s: proj.s, lateral: proj.lateral, onShortcut: -1,
      mainIdx: proj.index, pathIdx: -1, onJump: proj.onJump, ptIdx: -1,
      slope: sm.tangent.y,
    };

    if (useShortcut) {
      const path = this.shortcuts[pathId];
      const pt = path.pts[scPtIdx];
      const nb = path.pts[Math.min(scPtIdx + 1, path.pts.length - 1)];
      const pb = path.pts[Math.max(scPtIdx - 1, 0)];
      const slope = nb.pos.distanceTo(pb.pos) > 0.01
        ? (nb.pos.y - pb.pos.y) / nb.pos.distanceTo(pb.pos) : 0;
      const info: GroundInfo = {
        height: pt.pos.y, hasGround: true, onRoad: Math.abs(scLat) < 3.4, roughness: 1,
        s: Spline.wrapS(scS), lateral: scLat, onShortcut: pathId,
        mainIdx: proj.index, pathIdx: pathId, onJump: false, ptIdx: scPtIdx,
        slope,
      };
      info.roughness = info.onRoad ? (path.rough) : 0.5;
      info.hasGround = Math.abs(scLat) < 3.4 + 3;
      return info;
    }

    // --- main surface classification ------------------------------------------
    // NOTE: hasGround is one-sided — a kart high above the road still has
    // ground (it can land), but a kart more than ~4 m BELOW the reported
    // surface is void-bound no matter its lateral (eternal-fall bug).
    const aboveSurface = p.y >= proj.height - 4;
    const absMainLat = Math.abs(proj.lateral);
    if (absMainLat <= proj.halfWidth) {
      info.onRoad = !proj.onJump;
      info.hasGround = !proj.onJump && aboveSurface;
      info.height = proj.height;
      info.roughness = 1;
    } else {
      // fold-guarded per-side skirt: the drivable band matches the visual
      // terrain exactly (a clamped hairpin shoulder is short on purpose)
      const sideArr = proj.lateral >= 0 ? this.skirtAt[0] : this.skirtAt[1];
      const skLimit = proj.halfWidth + 0.9 + sideArr[proj.index];
      if (absMainLat <= skLimit) {
        info.onRoad = false;
        info.roughness = 2.4; // offroad drag
        // A gap is a CHASM: no shoulder ground beside jump runs either, or
        // karts just drive around the hole through the terrain (which turned
        // every snow/glacier gap into a slow-motion churn zone).
        // no ledges beside jump gaps — the void extends laterally so fallen
        // karts drop cleanly to a respawn instead of lingering in a pocket
        // where the projection flips between the two gap edges (180 deg)
        info.hasGround = !proj.onJump && aboveSurface && !this.nearJumpRun(proj.index);
        const clampedLat = Math.sign(proj.lateral) * proj.halfWidth;
        info.height = sm.pos.y + clampedLat * Math.sin(sm.bank);
      } else {
        info.hasGround = false; // the void
        info.height = proj.height;
      }
    }
    return info;
  }

  /** Boost pad check: returns pad if kart is on it. */
  padAt(p: THREE.Vector3): PadInstance | null {
    for (const pad of this.pads) {
      const dx = p.x - pad.pos.x, dz = p.z - pad.pos.z;
      if (dx * dx + dz * dz < 2.4 * 2.4 + 4) return pad;
    }
    return null;
  }

  update(t: number, dt: number): void {
    for (const a of this.animatables) a.update(t, dt);
  }

  /** Hide an item box and schedule its respawn. */
  consumeBox(box: ItemBox): void {
    box.active = false;
    box.respawnAt = performance.now() + ITEMS.boxRespawnMs;
    box.mesh.visible = false;
  }

  dispose(): void {
    this.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

const clampN = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

// ============================================================ battle arena

export class BattleWorld {
  readonly arenaId: string;
  readonly theme: import('../core/Types').TrackTheme;
  readonly radius: number;
  readonly group = new THREE.Group();
  readonly itemBoxes: ItemBox[] = [];
  readonly obstacles: { pos: THREE.Vector3; r: number }[] = [];
  readonly animatables: Animatable[] = [];
  readonly style: ThemeStyle;
  readonly pads: PadInstance[] = [];
  readonly hazards: HazardInstance[] = [];
  readonly railOpen = new Uint8Array(0);
  readonly racingLine: RacingLine = { lat: new Float32Array(0), vMax: new Float32Array(0) };

  constructor(arenaId: string, name: string, theme: import('../core/Types').TrackTheme, radius: number,
    obstacles: { x: number; z: number; r: number; h?: number; kind?: string }[], decorScale: number) {
    this.arenaId = arenaId;
    this.theme = theme;
    this.radius = radius;
    const style = { ...THEMES[theme] };
    this.style = style;

    // floor disc
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(radius + 6, radius + 6, 0.6, 40),
      mat(style.ground));
    floor.position.y = -0.3;
    floor.receiveShadow = true;
    this.group.add(floor);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.62, 40), mat(style.road));
    inner.position.y = -0.29;
    this.group.add(inner);

    // ring wall with curb stripes
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(radius + 6.4, radius + 6.4, 2.6, 48, 1, true),
      new THREE.MeshLambertMaterial({ color: style.curbB, side: THREE.DoubleSide }));
    wall.position.y = 1.0;
    this.group.add(wall);

    // obstacles
    for (const ob of obstacles) {
      const h = ob.h ?? 2.4;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(ob.r, ob.r * 1.1, h, 10),
        mat(theme === 'volcano' ? (ob.kind === 'lavapool' ? 0xff5a2a : 0x5a4440) :
          ob.kind === 'machine' ? 0x8a8a92 : ob.kind === 'fountain' ? 0x9ad0e8 : 0x8a7a5a));
      if (ob.kind === 'lavapool') (m.material as THREE.MeshLambertMaterial).emissive = new THREE.Color(0xdd3300);
      m.position.set(ob.x, h / 2, ob.z);
      this.group.add(m);
      this.obstacles.push({ pos: new THREE.Vector3(ob.x, 0, ob.z), r: ob.r });
      if (ob.kind === 'machine') {
        this.animatables.push({ update: (t) => { m.rotation.y = t * 0.4; } });
      }
    }

    // item boxes scattered on a ring grid
    const rng = makeRng(555);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rng() * 0.3;
      const r = radius * (0.35 + rng() * 0.5);
      const pos = new THREE.Vector3(Math.cos(a) * r, ITEMS.boxFloatHeight, Math.sin(a) * r);
      const mesh = makeItemBoxMesh();
      mesh.position.copy(pos);
      this.group.add(mesh);
      const box: ItemBox = { pos, mesh, active: true, respawnAt: 0, golden: false };
      this.itemBoxes.push(box);
      this.animatables.push({
        update: (t) => {
          mesh.rotation.y = t * 1.4;
          mesh.position.y = pos.y + Math.sin(t * 2 + i) * 0.25;
          if (!box.active && performance.now() >= box.respawnAt) { box.active = true; mesh.visible = true; }
        },
      });
    }

    // themed scatter + sky
    const sky = buildSky(style, theme);
    this.group.add(sky);
    const props = style.props;
    if (props.length) {
      for (let i = 0; i < Math.floor(30 * decorScale); i++) {
        const a = rng() * Math.PI * 2;
        const r = radius + 12 + rng() * 18;
        const prop = buildProp(props[Math.floor(rng() * props.length)] as PropKind, rng, theme);
        prop.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        this.group.add(prop);
      }
    }
  }

  groundQuery(p: THREE.Vector3, _state: { mainIdx: number; pathIdx: number; ptIdx: number }): GroundInfo {
    const r = Math.hypot(p.x, p.z);
    const inside = r < this.radius;
    return {
      height: 0, hasGround: r < this.radius + 5,
      onRoad: inside, roughness: inside ? 1 : 2.2,
      s: 0, lateral: 0, onShortcut: -1, mainIdx: -1, pathIdx: -1, ptIdx: -1, onJump: false,
      slope: 0,
    };
  }

  /** Radial wall: keep karts inside, damp only the outward velocity component. */
  wallConstrain(kart: import('../karts/KartController').KartController): void {
    const r = Math.hypot(kart.pos.x, kart.pos.z);
    const limit = this.radius - 0.6;
    if (r > limit) {
      const nx = kart.pos.x / r, nz = kart.pos.z / r;
      kart.pos.x = nx * limit; kart.pos.z = nz * limit;
      // proportional scrub: head-on hits lose ~55%, grazing loses ~nothing
      const fwd = kart.forward();
      const out = Math.max(0, fwd.x * nx + fwd.z * nz);
      if (out > 0) kart.speed *= 1 - out * 0.55;
    }
  }

  obstacleAt(p: THREE.Vector3): { pos: THREE.Vector3; r: number } | null {
    for (const ob of this.obstacles) {
      const dx = p.x - ob.pos.x, dz = p.z - ob.pos.z;
      if (dx * dx + dz * dz < (ob.r + 1.1) ** 2) return ob;
    }
    return null;
  }

  update(t: number, dt: number): void {
    for (const a of this.animatables) a.update(t, dt);
  }

  dispose(): void {
    this.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

// ============================================================ small helpers

/** Floating item box: translucent cube + glowing core. */
export function makeItemBoxMesh(golden = false): THREE.Group {
  const g = new THREE.Group();
  const size = golden ? 1.32 : 1.15;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(size, size, size),
    new THREE.MeshLambertMaterial(golden
      ? { color: 0xffc23a, transparent: true, opacity: 0.62, emissive: 0x8a5a00 }
      : { color: 0x4a9af2, transparent: true, opacity: 0.5, emissive: 0x10305a }));
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(golden ? 0.5 : 0.42, 0),
    new THREE.MeshBasicMaterial({ color: golden ? 0xfff2b0 : 0xffffff }));
  const frame = new THREE.Mesh(new THREE.BoxGeometry(size + 0.07, size + 0.07, size + 0.07),
    new THREE.MeshBasicMaterial({ color: golden ? 0xffe08a : 0xbfe0ff, wireframe: true }));
  g.add(shell, core, frame);
  if (golden) {
    // little sparkles so doubles read at speed
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0),
        new THREE.MeshBasicMaterial({ color: 0xffe94a }));
      const a = (i / 4) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 0.95, Math.sin(a * 2) * 0.5, Math.sin(a) * 0.95);
      g.add(sp);
    }
  }
  return g;
}

function makeChevronTexture(color: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d')!;
  const col = '#' + color.toString(16).padStart(6, '0');
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = col;
  for (let i = 0; i < 2; i++) {
    const y = i * 32;
    ctx.beginPath();
    ctx.moveTo(6, y + 26); ctx.lineTo(32, y + 4); ctx.lineTo(58, y + 26);
    ctx.lineTo(58, y + 18); ctx.lineTo(32, y - 4); ctx.lineTo(6, y + 18);
    ctx.closePath(); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeBannerTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#151522'; ctx.fillRect(0, 0, 512, 96);
  // checkered strips top + bottom
  const sq = 12;
  for (const rowY of [0, 96 - sq]) {
    for (let x = 0; x < 512 / sq; x++) {
      if (x % 2 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x * sq, rowY, sq, sq); }
    }
  }
  // red racing band with subtle sheen
  const grad = ctx.createLinearGradient(0, 12, 0, 84);
  grad.addColorStop(0, '#ff4a5a');
  grad.addColorStop(0.5, '#d8203a');
  grad.addColorStop(1, '#a81028');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 12, 512, 72);
  // brand text with outline
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#3a0a14';
  ctx.strokeText('APEX KART', 256, 48);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('APEX KART', 256, 48);
  // side pips
  ctx.fillStyle = '#ffe94a';
  ctx.beginPath(); ctx.arc(36, 48, 9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(476, 48, 9, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

function makeMoverMesh(label: string): THREE.Object3D {
  const g = new THREE.Group();
  switch (label) {
    case 'hay': {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.4, 10), mat(0xd8b64a));
      b.rotation.z = Math.PI / 2; g.add(b);
      g.userData.lift = 1.1; g.userData.spin = 3.2;
      break;
    }
    case 'crab': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), mat(0xe84a3a));
      body.scale.y = 0.5; body.position.y = 0.35; g.add(body);
      for (const s of [-1, 1]) {
        const claw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), mat(0xe84a3a));
        claw.position.set(s * 0.9, 0.5, 0.3); g.add(claw);
      }
      g.userData.lift = 0; g.userData.spin = 0;
      break;
    }
    case 'log': {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.2, 8), mat(0x7a5a3a));
      l.rotation.z = Math.PI / 2; g.add(l);
      g.userData.lift = 0.55; g.userData.spin = 2.2;
      break;
    }
    case 'snowball': {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1.35, 9, 7), mat(0xf4f9ff));
      g.add(b);
      g.userData.lift = 1.35; g.userData.spin = 4;
      break;
    }
    case 'traffic': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 4), mat(0xc8c8d0));
      body.position.y = 0.9; g.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.8), mat(0x35c8e0));
      cab.position.set(0, 1.6, -0.5); g.add(cab);
      const light = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, 0.15), mat(0xffe94a, { emissive: 0xccbb22 }));
      light.position.set(0, 0.9, 2.05); g.add(light);
      g.userData.lift = 0; g.userData.spin = 0;
      break;
    }
    case 'asteroid': {
      const a = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 0), mat(0x6a6a80));
      g.add(a);
      g.userData.lift = 1.2; g.userData.spin = 1.2;
      break;
    }
    case 'knight': {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.1, 4, 8), mat(0x9aa0b0));
      body.position.y = 1.1; g.add(body);
      const helm = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.7, 6), mat(0x7a8090));
      helm.position.y = 2.05; g.add(helm);
      const shield2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, 0.7), mat(0x884858));
      shield2.position.set(0.65, 1.2, 0); g.add(shield2);
      g.userData.lift = 0; g.userData.spin = 0;
      break;
    }
    case 'press': {
      // stamping press: piston column + red hot head sweeping the lane
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 2.6, 8), mat(0x8a8a96));
      column.position.y = 1.3; g.add(column);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 1.6), mat(0xd8483a, { emissive: 0x5a140c }));
      head.position.y = 0.35; g.add(head);
      g.userData.lift = 0; g.userData.spin = 0;
      break;
    }
    case 'prism': {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0),
        mat(0xff5a8a, { emissive: 0x661428 }));
      g.add(shard);
      g.userData.lift = 1.2; g.userData.spin = 2.4;
      break;
    }
    case 'tumble': {
      const t = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), mat(0xb59a5a));
      g.add(t);
      g.userData.lift = 0.9; g.userData.spin = 5;
      break;
    }
    default: {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), mat(0x8a8880));
      g.add(r);
      g.userData.lift = 1.0; g.userData.spin = 2;
    }
  }
  return g;
}

function makeFallerMesh(label: string): THREE.Object3D {
  const g = new THREE.Group();
  if (label === 'icicle') {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.6, 6), mat(0xa8e0ff, { opacity: 0.9 }));
    m.rotation.x = Math.PI; // point down
    g.add(m);
  } else { // lava rock
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 0), mat(0x4a3030));
    g.add(m);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 6, 5), mat(0xff7a2a, { emissive: 0xff3a0a }));
    glow.position.set(0.3, 0.4, 0.2); g.add(glow);
  }
  return g;
}

function makeZoneMesh(def: HazardDef, sm: { pos: THREE.Vector3; right: THREE.Vector3 }): THREE.Object3D {
  const r = def.radius ?? 8;
  const color = def.effect === 'boost' ? 0xffc83a : def.effect === 'grip' ? (def.label === 'ice' ? 0x9ad8ff : 0x8a6a3a) : 0xd9a05a;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 18),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: def.effect === 'boost' ? 0.5 : 0.42 }));
  disc.rotation.x = -Math.PI / 2;
  const pos = sm.pos.clone().add(new THREE.Vector3(0, 0.05, 0));
  if (def.offset) pos.addScaledVector(sm.right, def.offset);
  disc.position.copy(pos);
  return disc;
}
