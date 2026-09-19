/**
 * APEX KART — Theme styling + procedural decoration kits.
 * Every track theme gets: a palette (road/curb/ground/sky/fog), a scatter
 * prop kit (all primitives, zero external assets) and a sky shader setup.
 * All geometry is generated from code — 100% original IP.
 */

import * as THREE from 'three';
import { TrackTheme } from '../core/Types';
import { makeRng } from '../core/MathUtils';

export interface ThemeStyle {
  road: number; curbA: number; curbB: number; ground: number;
  skirt: number;            // meters of drivable-ish terrain beside the road
  skyTop: number; skyBottom: number;
  fog: number; fogNear: number; fogFar: number;
  sun: number; sunIntensity: number; ambient: number;
  hemiSky: number; hemiGround: number;
  pad: number;               // boost pad color
  stars: boolean; aurora: boolean;
  rainbowRoad: boolean;
  props: PropKind[];
  propDensity: number;       // multiplier on scatter count
}

export type PropKind =
  | 'tree' | 'pine' | 'palm' | 'cactus' | 'bush' | 'rock' | 'iceSpike'
  | 'building' | 'tower' | 'gear' | 'pipe' | 'crystal' | 'temple' | 'balloon';

export const THEMES: Record<TrackTheme, ThemeStyle> = {
  meadow: {
    road: 0x6a6d72, curbA: 0xe8e8e8, curbB: 0xd84848, ground: 0x6fae4e,
    skirt: 26, skyTop: 0x8fd0f5, skyBottom: 0xdff2ff,
    fog: 0xcfe8f8, fogNear: 90, fogFar: 420,
    sun: 0xfff3d6, sunIntensity: 1.15, ambient: 0x88aacc, hemiSky: 0xbfe3ff, hemiGround: 0x6fae4e,
    pad: 0x35d17a, stars: false, aurora: false, rainbowRoad: false,
    props: ['tree', 'bush', 'balloon'], propDensity: 1.0,
  },
  desert: {
    road: 0x6b635b, curbA: 0xf2e2c0, curbB: 0xc07a3a, ground: 0xe0c07a,
    skirt: 30, skyTop: 0x7ec8e3, skyBottom: 0xffd9a0,
    fog: 0xf2ddb0, fogNear: 110, fogFar: 480,
    sun: 0xffd9a0, sunIntensity: 1.3, ambient: 0xbba27a, hemiSky: 0xffe6bb, hemiGround: 0xd9b678,
    pad: 0xffb63a, stars: false, aurora: false, rainbowRoad: false,
    props: ['cactus', 'rock'], propDensity: 0.8,
  },
  beach: {
    road: 0x66696e, curbA: 0xfff6e0, curbB: 0x48b8d8, ground: 0xf2e3b3,
    skirt: 22, skyTop: 0x6ec6ff, skyBottom: 0xffb37a,
    fog: 0xffd9b8, fogNear: 100, fogFar: 430,
    sun: 0xffc98a, sunIntensity: 1.25, ambient: 0x99ccee, hemiSky: 0xffd9b8, hemiGround: 0xf2e3b3,
    pad: 0x48e0d8, stars: false, aurora: false, rainbowRoad: false,
    props: ['palm', 'bush'], propDensity: 0.9,
  },
  city: {
    road: 0x4c4c58, curbA: 0x35e0e0, curbB: 0xe035a0, ground: 0x22222a,
    skirt: 18, skyTop: 0x0b0b1f, skyBottom: 0x1b2440,
    fog: 0x14141f, fogNear: 70, fogFar: 380,
    sun: 0x8899ff, sunIntensity: 0.55, ambient: 0x334466, hemiSky: 0x334a77, hemiGround: 0x1a1a22,
    pad: 0xffe94a, stars: true, aurora: false, rainbowRoad: false,
    props: ['building'], propDensity: 1.2,
  },
  snow: {
    road: 0x71767f, curbA: 0xffffff, curbB: 0x4878c8, ground: 0xf4f9ff,
    skirt: 26, skyTop: 0xbcd7ee, skyBottom: 0xeef6ff,
    fog: 0xe8f2fc, fogNear: 80, fogFar: 380,
    sun: 0xf0f6ff, sunIntensity: 1.0, ambient: 0xaaccee, hemiSky: 0xdfeeff, hemiGround: 0xf4f9ff,
    pad: 0x48c8ff, stars: false, aurora: false, rainbowRoad: false,
    props: ['pine', 'rock'], propDensity: 0.9,
  },
  volcano: {
    road: 0x504442, curbA: 0x8a8078, curbB: 0xff5a2a, ground: 0x3a2e2c,
    skirt: 20, skyTop: 0x2a1015, skyBottom: 0x7a2a1a,
    fog: 0x3a1a14, fogNear: 60, fogFar: 330,
    sun: 0xff9a5a, sunIntensity: 0.9, ambient: 0x7a4438, hemiSky: 0x8a3a20, hemiGround: 0x3a2e2c,
    pad: 0xff7a2a, stars: false, aurora: false, rainbowRoad: false,
    props: ['rock'], propDensity: 1.0,
  },
  castle: {
    road: 0x5f5c57, curbA: 0xd8cfa8, curbB: 0x884838, ground: 0x7fa35f,
    skirt: 24, skyTop: 0x9db4d0, skyBottom: 0xe6eefc,
    fog: 0xd8e4f0, fogNear: 90, fogFar: 400,
    sun: 0xfff0d0, sunIntensity: 1.05, ambient: 0x99a8c0, hemiSky: 0xcfe0f0, hemiGround: 0x7fa35f,
    pad: 0xd8b23a, stars: false, aurora: false, rainbowRoad: false,
    props: ['tower', 'bush'], propDensity: 0.9,
  },
  space: {
    road: 0x565b6e, curbA: 0x35e0ff, curbB: 0xff35c8, ground: 0x181826,
    skirt: 3, skyTop: 0x05060f, skyBottom: 0x0c1024,
    fog: 0x07080f, fogNear: 120, fogFar: 520,
    sun: 0xaaccff, sunIntensity: 0.7, ambient: 0x33406a, hemiSky: 0x2a3560, hemiGround: 0x101018,
    pad: 0x35e0ff, stars: true, aurora: false, rainbowRoad: false,
    props: ['crystal'], propDensity: 0.7,
  },
  jungle: {
    road: 0x54574f, curbA: 0xc8b888, curbB: 0x3a7a3a, ground: 0x3f7d3a,
    skirt: 20, skyTop: 0x8fd0ff, skyBottom: 0xd8f2d0,
    fog: 0xbfe0c0, fogNear: 55, fogFar: 300,
    sun: 0xf0ffd0, sunIntensity: 1.05, ambient: 0x77aa66, hemiSky: 0xbfe8c0, hemiGround: 0x3f7d3a,
    pad: 0x8ae035, stars: false, aurora: false, rainbowRoad: false,
    props: ['tree', 'temple'], propDensity: 1.3,
  },
  factory: {
    road: 0x50525a, curbA: 0xd8a83a, curbB: 0x8a3030, ground: 0x44444c,
    skirt: 20, skyTop: 0x5a5a66, skyBottom: 0xcf9a5a,
    fog: 0x8a7a5a, fogNear: 70, fogFar: 340,
    sun: 0xffd9a0, sunIntensity: 0.85, ambient: 0x778899, hemiSky: 0xcfa070, hemiGround: 0x44444c,
    pad: 0xffc83a, stars: false, aurora: false, rainbowRoad: false,
    props: ['gear', 'pipe'], propDensity: 1.1,
  },
  glacier: {
    road: 0x69727e, curbA: 0xffffff, curbB: 0x48a8e0, ground: 0xdceefc,
    skirt: 22, skyTop: 0xa8d8f0, skyBottom: 0xeaf8ff,
    fog: 0xd8ecf8, fogNear: 80, fogFar: 380,
    sun: 0xeaf6ff, sunIntensity: 1.0, ambient: 0xa8d0e8, hemiSky: 0xd0ecff, hemiGround: 0xdceefc,
    pad: 0x48e0ff, stars: false, aurora: true, rainbowRoad: false,
    props: ['iceSpike', 'crystal'], propDensity: 1.0,
  },
  prism: {
    road: 0xffffff, curbA: 0xffffff, curbB: 0xffffff, ground: 0x12081f,
    skirt: 2, skyTop: 0x0d0418, skyBottom: 0x2a0a3a,
    fog: 0x12081f, fogNear: 130, fogFar: 560,
    sun: 0xb08aff, sunIntensity: 0.8, ambient: 0x554488, hemiSky: 0x6a4aa8, hemiGround: 0x181026,
    pad: 0xffffff, stars: true, aurora: false, rainbowRoad: true,
    props: ['crystal'], propDensity: 0.8,
  },
};

// ---------------------------------------------------------------- prop kit

const MAT_CACHE = new Map<string, THREE.Material>();
export function mat(color: number, opts: { emissive?: number; rough?: boolean; opacity?: number } = {}): THREE.Material {
  const key = `${color}-${opts.emissive ?? 0}-${opts.opacity ?? 1}`;
  if (MAT_CACHE.has(key)) return MAT_CACHE.get(key)!;
  const m = new THREE.MeshLambertMaterial({
    color,
    emissive: opts.emissive ?? 0x000000,
    transparent: (opts.opacity ?? 1) < 1,
    opacity: opts.opacity ?? 1,
  });
  MAT_CACHE.set(key, m);
  return m;
}

export interface ScatterCtx {
  rng: () => number;
  style: ThemeStyle;
  decorScale: number;      // quality factor
  group: THREE.Group;      // receive props
}

/** Build one prop instance (a small Object3D subtree of primitives). */
export function buildProp(kind: PropKind, rng: () => number, theme: TrackTheme): THREE.Object3D {
  const g = new THREE.Group();
  const s = 0.8 + rng() * 0.5;

  switch (kind) {
    case 'tree': { // rounded tree + trunk
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.2, 6), mat(0x8a5a3a));
      trunk.position.y = 0.6;
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 0), mat(theme === 'jungle' ? 0x2f8f3a : 0x4faa3a));
      crown.position.y = 1.9; crown.scale.y = theme === 'jungle' ? 1.5 : 1.1;
      if (theme === 'jungle') { // second crown blob
        const c2 = crown.clone(); c2.position.set(0.9, 1.4, 0.4); c2.scale.setScalar(0.7); g.add(c2);
      }
      g.add(trunk, crown);
      break;
    }
    case 'pine': { // snow pine: stacked cones
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1, 6), mat(0x6a4a30));
      trunk.position.y = 0.5; g.add(trunk);
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(1.15 - i * 0.3, 1.3, 7),
          mat(i === 2 ? 0xeef6ff : 0x2f7a4a));
        cone.position.y = 1.2 + i * 0.85; g.add(cone);
      }
      break;
    }
    case 'palm': {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 3.4, 6), mat(0x9a7a4a));
      trunk.position.y = 1.7; trunk.rotation.z = (rng() - 0.5) * 0.25; g.add(trunk);
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.34, 2.2, 4), mat(0x3faa5a));
        leaf.position.y = 3.4; leaf.rotation.z = Math.PI * 0.42; leaf.rotation.y = (i / 5) * Math.PI * 2;
        leaf.scale.set(1, 1, 0.4); g.add(leaf);
      }
      break;
    }
    case 'cactus': {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.8, 4, 8), mat(0x4a9a3a));
      body.position.y = 1.3; g.add(body);
      if (rng() > 0.4) {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 8), mat(0x4a9a3a));
        arm.position.set(0.55, 1.7, 0); arm.rotation.z = -0.9; g.add(arm);
      }
      break;
    }
    case 'bush': {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), mat(theme === 'beach' ? 0x5ab86a : 0x4a9a4a));
      b.position.y = 0.5; b.scale.set(1.2, 0.8, 1.2);
      if (theme === 'meadow') { // flowers
        for (let i = 0; i < 3; i++) {
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4),
            mat([0xe86a8a, 0xf2d04a, 0xffffff][i % 3], { emissive: 0x332211 }));
          f.position.set((rng() - 0.5), 0.9, (rng() - 0.5)); g.add(f);
        }
      }
      g.add(b);
      break;
    }
    case 'rock': {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + rng() * 0.7, 0),
        mat(theme === 'volcano' ? 0x5a4440 : 0x8a8880));
      r.position.y = 0.4; r.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      r.scale.y = 0.7; g.add(r);
      if (theme === 'volcano' && rng() > 0.6) {
        const lava = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5), mat(0xff5a2a, { emissive: 0xff3a0a }));
        lava.position.set(0.4, 0.2, 0.3); g.add(lava);
      }
      break;
    }
    case 'iceSpike': {
      const ice = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4 + rng() * 2, 5), mat(0xbfe8ff, { opacity: 0.9 }));
      ice.position.y = 1.6; ice.rotation.z = (rng() - 0.5) * 0.4; g.add(ice);
      break;
    }
    case 'building': { // neon highrise with emissive window strips
      const h = 14 + rng() * 34;
      const w = 5 + rng() * 5, d = 5 + rng() * 5;
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(0x1c2030));
      base.position.y = h / 2; g.add(base);
      const neonCols = [0x35e0e0, 0xe035a0, 0xffe94a, 0x3577ff];
      for (let i = 0; i < 4; i++) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.5, 0.18),
          mat(neonCols[i % neonCols.length], { emissive: neonCols[i % neonCols.length] }));
        strip.position.set(0, h * (0.25 + i * 0.18), d / 2 + 0.02); g.add(strip);
        const strip2 = strip.clone(); strip2.position.z = -d / 2 - 0.02; strip2.rotation.y = Math.PI; g.add(strip2);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 1.4, d * 0.4), mat(0x2a3048));
      roof.position.y = h + 0.7; g.add(roof);
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 4), mat(0x445066));
      antenna.position.y = h + 2.7; g.add(antenna);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), mat(0xff4444, { emissive: 0xff2222 }));
      tip.position.y = h + 4.7; g.add(tip);
      break;
    }
    case 'tower': { // castle tower + cone roof + banner
      const h = 7 + rng() * 5;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, h, 8), mat(0xb5a888));
      body.position.y = h / 2; g.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.6, 8), mat(0x884858));
      roof.position.y = h + 1.3; g.add(roof);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), mat(0xd8b23a, { emissive: 0x332200 }));
      flag.position.set(0.65, h + 2.4, 0); g.add(flag);
      break;
    }
    case 'gear': {
      const gear = new THREE.Group();
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.5, 12), mat(0x8a8a92));
      gear.add(disk);
      for (let i = 0; i < 8; i++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.9), mat(0x8a8a92));
        const a = (i / 8) * Math.PI * 2;
        tooth.position.set(Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4);
        tooth.rotation.y = -a; gear.add(tooth);
      }
      gear.rotation.x = Math.PI / 2;
      gear.position.y = 2.5 + rng() * 3;
      gear.rotation.z = rng() * Math.PI;
      (gear as unknown as { userData: { spin?: number } }).userData.spin = 0.2 + rng() * 0.5;
      g.add(gear);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, gear.position.y, 6), mat(0x55555e));
      stand.position.y = gear.position.y / 2; g.add(stand);
      break;
    }
    case 'pipe': {
      const len = 4 + rng() * 6;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, len, 8), mat(0x9a8a5a));
      pipe.rotation.z = Math.PI / 2 + (rng() - 0.5) * 0.4;
      pipe.rotation.y = rng() * Math.PI;
      pipe.position.y = 1.2 + rng() * 2.5; g.add(pipe);
      break;
    }
    case 'crystal': {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.8 + rng() * 0.6, 0),
        mat(theme === 'prism' ? 0xb07aff : 0x7ac8ff, { emissive: theme === 'prism' ? 0x5a2a8a : 0x1a3050, opacity: 0.92 }));
      c.position.y = 1 + rng() * 1.6; c.rotation.set(rng(), rng(), rng()); g.add(c);
      break;
    }
    case 'temple': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 4), mat(0x8a8878));
      base.position.y = 0.6; g.add(base);
      const mid = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 3), mat(0x9a9888));
      mid.position.y = 2.1; g.add(mid);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.8, 4), mat(0x7a7a60));
      roof.position.y = 3.9; roof.rotation.y = Math.PI / 4; g.add(roof);
      break;
    }
    case 'balloon': {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), mat([0xe85a5a, 0x5a8ae8, 0xf2c84a][Math.floor(rng() * 3)]));
      b.scale.y = 1.2; b.position.y = 0; g.add(b);
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), mat(0x8a6a3a));
      basket.position.y = -2.1; g.add(basket);
      g.position.y += 16 + rng() * 10; // floats high
      break;
    }
  }
  g.scale.multiplyScalar(s);
  return g;
}

// ---------------------------------------------------------------- sky

export function buildSky(style: ThemeStyle, theme: TrackTheme): THREE.Group {
  const group = new THREE.Group();

  // gradient dome
  const skyGeo = new THREE.SphereGeometry(900, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(style.skyTop) },
      bottom: { value: new THREE.Color(style.skyBottom) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
      void main() {
        float h = clamp(vPos.y / 900.0 * 0.5 + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0);
      }`,
  });
  const dome = new THREE.Mesh(skyGeo, skyMat);
  dome.renderOrder = -10;
  group.add(dome);

  // starfield for night themes
  if (style.stars) {
    const N = 700;
    const pos = new Float32Array(N * 3);
    const rng = makeRng(1234);
    for (let i = 0; i < N; i++) {
      const th = rng() * Math.PI * 2, ph = Math.acos(rng() * 0.9 + 0.05);
      const r = 850;
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      pos[i * 3 + 1] = Math.cos(ph) * r;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, fog: false }));
    group.add(stars);
  }

  // aurora ribbon for glacier
  if (style.aurora) {
    const aurora = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 160),
      new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.16, fog: false, side: THREE.DoubleSide }),
    );
    aurora.position.set(0, 220, -300);
    aurora.rotation.x = 0.35;
    group.add(aurora);
    const aurora2 = aurora.clone();
    aurora2.material = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.13, fog: false, side: THREE.DoubleSide });
    aurora2.position.set(-250, 200, 200); aurora2.rotation.y = 1.2;
    group.add(aurora2);
  }

  // theme backdrop features
  if (theme === 'volcano') { // central distant volcano cone
    const cone = new THREE.Mesh(new THREE.ConeGeometry(190, 170, 9), mat(0x3a2a28));
    cone.position.set(0, 60, -430);
    group.add(cone);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(28, 8, 6), mat(0xff5a2a, { emissive: 0xff3a0a }));
    glow.position.set(0, 148, -430);
    group.add(glow);
  }
  if (theme === 'space') { // ringed planet
    const planet = new THREE.Mesh(new THREE.SphereGeometry(70, 16, 12), mat(0x5a7ae0, { emissive: 0x1a2a5a }));
    planet.position.set(-320, 190, -520);
    group.add(planet);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(110, 8, 8, 32), mat(0xb8c8ff, { opacity: 0.7 }));
    ring.position.copy(planet.position);
    ring.rotation.x = Math.PI / 2.4;
    group.add(ring);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(26, 10, 8), mat(0xd8d8e8));
    moon.position.set(280, 120, -480);
    group.add(moon);
  }
  if (theme === 'prism') { // giant floating prisms
    const rng = makeRng(99);
    for (let i = 0; i < 10; i++) {
      const p = new THREE.Mesh(new THREE.OctahedronGeometry(14 + rng() * 22, 0),
        mat([0xff5a8a, 0x5affc8, 0xffe05a, 0x8a5aff, 0x5a9aff][i % 5], { emissive: 0x332244, opacity: 0.95 }));
      const th = rng() * Math.PI * 2, r = 300 + rng() * 200;
      p.position.set(Math.cos(th) * r, 60 + rng() * 160, Math.sin(th) * r);
      p.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      group.add(p);
    }
  }
  // sun / moon disc
  const disc = new THREE.Mesh(new THREE.CircleGeometry(38, 20),
    new THREE.MeshBasicMaterial({ color: style.stars ? 0xdfe8ff : style.sun, fog: false }));
  disc.position.set(-260, 210, -560);
  disc.lookAt(0, 0, 0);
  group.add(disc);

  // low-poly mountain ring backdrop for organic themes
  if (['meadow', 'snow', 'jungle', 'castle', 'glacier', 'desert'].includes(theme)) {
    const rng = makeRng(77);
    const mMat = mat(theme === 'snow' || theme === 'glacier' ? 0xcfe0ee : theme === 'desert' ? 0xd9b678 : 0x7a9a6a);
    for (let i = 0; i < 14; i++) {
      const th = (i / 14) * Math.PI * 2 + rng() * 0.3;
      const h = 60 + rng() * 90;
      const m = new THREE.Mesh(new THREE.ConeGeometry(70 + rng() * 50, h, 5), mMat);
      m.position.set(Math.cos(th) * 480, h / 2 - 12, Math.sin(th) * 480);
      m.rotation.y = rng() * Math.PI;
      group.add(m);
    }
  }
  return group;
}

// ---------------------------------------------------------------- crowd

/**
 * Grandstand beside the start straight, built in a LOCAL frame and then
 * oriented to the road:
 *   - local X = alongDir  (seat rows RUN PARALLEL TO THE ROAD — this was the
 *     "grandstand crossing the track" bug: seats used to spread along the
 *     LATERAL axis, putting 42 m of seating straight across the asphalt)
 *   - local Z = awayDir   (rows step AWAY from the road and UP, like a real
 *     stadium block: r-th row sits 0.95 m further out and 0.62 m higher)
 * Structure: stepped platforms, back wall, 4 posts + canopy roof.
 */
export function buildCrowd(
  count: number,
  basePos: THREE.Vector3,
  alongDir: THREE.Vector3,
  awayDir: THREE.Vector3,
  length: number,
): { group: THREE.Group; update: (t: number) => void } {
  const group = new THREE.Group();

  // ---- orient the local frame to the road -------------------------------
  const along = alongDir.clone().setY(0).normalize();
  const away = awayDir.clone().setY(0).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(along.dot(away)) > 0.9) {
    // degenerate input — fall back to a perpendicular
    away.copy(along).cross(up).normalize();
  }
  // RIGHT-HANDED basis, always. The old code passed `away` straight into
  // makeBasis as the Z column; for the stand on one side of the road that
  // matrix is LEFT-handed (det -1), and Quaternion.setFromRotationMatrix
  // silently degrades it to a near-identity rotation — the entire 42 m
  // grandstand rendered ACROSS the finish straight instead of beside it
  // (the "todas las metas tienen una grada enfrente" bug).
  // The only Z that keeps (along, up) a rotation is zAxis = along × up.
  // If the stand's away side is the other way, flip BOTH X and Z (two
  // flips preserve handedness; the stand geometry is X-symmetric).
  const zAxis = new THREE.Vector3().crossVectors(along, up).normalize();
  const flip = away.dot(zAxis) < 0;
  const xAxis = flip ? along.clone().negate() : along.clone();
  const basis = new THREE.Matrix4().makeBasis(xAxis, up, flip ? zAxis.clone().negate() : zAxis);
  group.quaternion.setFromRotationMatrix(basis);
  group.position.copy(basePos);
  const baseY = basePos.y;

  // ---- instanced spectators --------------------------------------------
  const rows = 4;
  const perRow = Math.max(4, Math.floor(count / rows));
  const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.5, 3, 6);
  const headGeo = new THREE.SphereGeometry(0.22, 6, 5);
  const colors = [0xe86a8a, 0x5a8ae8, 0xf2c84a, 0x66cc77, 0xd88a5a, 0xffffff, 0x9a6ad8];

  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), perRow * rows);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xffd9b0 }), perRow * rows);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const rng = makeRng(4242);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < perRow; c++) {
      const alongOff = (c / perRow - 0.5) * length;
      const rowAway = 0.85 + r * 0.95;
      const rowUp = 1.5 + r * 0.62;
      pos.set(alongOff, rowUp, rowAway);
      m.compose(pos, q, scale);
      bodies.setMatrixAt(r * perRow + c, m);
      bodies.setColorAt(r * perRow + c, new THREE.Color(colors[Math.floor(rng() * colors.length)]));
      const hp = pos.clone().add(new THREE.Vector3(0, 0.62, 0));
      m.compose(hp, q, scale);
      heads.setMatrixAt(r * perRow + c, m);
    }
  }
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  group.add(bodies, heads);

  // ---- stepped platforms -------------------------------------------------
  const standMat = mat(0x9a94a0);
  for (let r = 0; r < rows; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(length, 0.6, 2.4), standMat);
    step.position.set(0, 0.55 + r * 0.62, r * 0.95 + 0.55);
    group.add(step);
  }
  // front fascia along the nearest edge
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(length, 1.1, 0.3), mat(0x7a7484));
  fascia.position.set(0, 0.55, -0.35);
  group.add(fascia);

  // ---- back wall + posts + canopy roof -------------------------------------
  const backZ = rows * 0.95 + 0.9;
  const topY = 0.55 + rows * 0.62 + 0.3;
  const back = new THREE.Mesh(new THREE.BoxGeometry(length, topY + 1.9, 0.35), mat(0x6a6474));
  back.position.set(0, (topY + 1.9) / 2 - 0.2, backZ);
  group.add(back);

  const postGeo = new THREE.CylinderGeometry(0.14, 0.14, 3.4, 6);
  const postMat = mat(0x4a4552);
  const roofY = topY + 3.0;
  for (const sx of [-length / 2 + 0.8, length / 2 - 0.8]) {
    for (const sz of [0.1, backZ - 0.2]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(sx, roofY - 1.7, sz);
      group.add(post);
    }
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 1.4, 0.22, backZ + 1.6), mat(0xd8dce4));
  roof.position.set(0, roofY, (backZ - 0.4) / 2);
  roof.rotation.x = 0.06; // slight shed slope so it reads as a canopy
  group.add(roof);

  const update = (t: number): void => {
    // gentle crowd bob (the whole block breathes; cheap and lively)
    const kick = Math.abs(Math.sin(t * 2.2)) * 0.06;
    group.position.y = baseY + kick * 0.5;
    bodies.rotation.z = Math.sin(t * 2.2) * 0.012;
    heads.rotation.z = -Math.sin(t * 2.2) * 0.02;
  };
  return { group, update };
}
