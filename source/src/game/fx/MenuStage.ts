/**
 * APEX KART — 3D menu stage.
 *
 * The menus float over a live night-showroom: five karts endlessly lapping a
 * glowing podium ring, candy item boxes orbiting overhead, confetti sparkles
 * and a sunset dome. It replaces the dead black canvas that made the old
 * front-end feel generic — the party starts on the title screen.
 */

import * as THREE from 'three';
import { KartVisual, type VisualModels } from '../karts/KartVisual';
import { ModelLibrary } from '../assets/ModelLibrary';
import { CHARACTER_MAP } from '../karts/KartStats';
import { makeItemBoxMesh } from '../tracks/TrackBuilder';

interface LapKart {
  visual: KartVisual;
  a: number;        // angle on the ring
  w: number;        // angular speed
  r: number;        // ring radius
  bob: number;      // bob phase
}

const STAGE_CHARS = ['zippy', 'nova', 'rex', 'bolt', 'gigi'];
const RING_R = 7.2;

function makeCheckerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#e9edf4' : '#191b26';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFloorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(256, 256, 30, 256, 256, 256);
  g.addColorStop(0, '#2b2050');
  g.addColorStop(0.55, '#171232');
  g.addColorStop(1, '#07050f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  // faint grid lines — showroom floor
  ctx.strokeStyle = 'rgba(140,120,255,0.10)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(512, i * 64); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSkyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#07050f');     // zenith night
  g.addColorStop(0.45, '#1c1440');  // violet
  g.addColorStop(0.72, '#7a3a6e');  // magenta band
  g.addColorStop(0.88, '#ff8a4a');  // sunset glow
  g.addColorStop(1, '#ffb45a');     // horizon
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  // a few stars
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 16, y = Math.random() * 92;
    ctx.globalAlpha = 0.25 + Math.random() * 0.6;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MenuStage {
  readonly group = new THREE.Group();
  private karts: LapKart[] = [];
  private boxes: { mesh: THREE.Group; a: number; r: number; y: number; w: number }[] = [];
  private checkerRing: THREE.Mesh | null = null;
  private sparkles: THREE.Points | null = null;
  private glowRings: THREE.Mesh[] = [];
  private t = 0;
  private camera: THREE.PerspectiveCamera;
  private disposed = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;

    // ---- sky dome ------------------------------------------------------------
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(150, 24, 16),
      new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false }),
    );
    this.group.add(sky);

    // ---- glossy showroom floor ------------------------------------------------
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(60, 48),
      new THREE.MeshPhongMaterial({ map: makeFloorTexture(), shininess: 60, specular: 0x6a5aff }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // ---- glowing podium ring (the karts lap around it) -------------------------
    const podium = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.7, 0.5, 28),
      new THREE.MeshPhongMaterial({ color: 0x241d3e, shininess: 80, specular: 0x8a7aff }),
    );
    podium.position.y = 0.25;
    this.group.add(podium);
    const crown = new THREE.Mesh(
      new THREE.TorusGeometry(2.42, 0.09, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc83a }),
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 0.52;
    this.group.add(crown);

    // ---- checkered ring band on the floor --------------------------------------
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(RING_R - 1.15, RING_R + 1.15, 64, 1, 0, Math.PI * 2),
      new THREE.MeshBasicMaterial({ map: makeCheckerTexture(), transparent: true, opacity: 0.5 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.group.add(ring);
    this.checkerRing = ring;

    // ---- neon glow rings under the lap line ------------------------------------
    for (const [r, col] of [[RING_R - 1.5, 0x38bdf8], [RING_R + 1.5, 0xb45aff]] as [number, number][]) {
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.045, 6, 72),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75 }),
      );
      torus.rotation.x = Math.PI / 2;
      torus.position.y = 0.03;
      this.group.add(torus);
      this.glowRings.push(torus);
    }

    // ---- the lapping karts -------------------------------------------------------
    const lib = ModelLibrary.get();
    STAGE_CHARS.forEach((id, i) => {
      const stats = CHARACTER_MAP[id];
      const models: VisualModels = {};
      if (lib.ready) {
        const kart = lib.kartTemplate();
        if (kart) { models.kart = kart.scene; models.kartMeta = kart.meta; }
        const driver = lib.driverTemplate(id);
        if (driver) { models.driver = driver.scene; models.driverIncludesKart = driver.includesKart; }
      }
      const visual = new KartVisual(id, stats.color, models.kart || models.driver ? models : undefined);
      this.group.add(visual.group);
      this.karts.push({
        visual,
        a: (i / STAGE_CHARS.length) * Math.PI * 2,
        w: 0.34 + i * 0.021,
        r: RING_R + (i % 2 ? 0.45 : -0.45),
        bob: i * 1.7,
      });
    });

    // ---- orbiting candy item boxes -----------------------------------------------
    for (let i = 0; i < 5; i++) {
      const mesh = makeItemBoxMesh(i === 2);
      mesh.scale.setScalar(0.9);
      this.group.add(mesh);
      this.boxes.push({
        mesh,
        a: (i / 5) * Math.PI * 2,
        r: RING_R + 2.6,
        y: 2.4 + (i % 3) * 0.65,
        w: 0.5 - i * 0.05,
      });
    }

    // ---- floating sparkles --------------------------------------------------------
    const N = 90;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 16;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.5 + Math.random() * 7;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparkles = new THREE.Points(geo,
      new THREE.PointsMaterial({ color: 0xffd88a, size: 0.14, transparent: true, opacity: 0.85, sizeAttenuation: true }));
    this.group.add(this.sparkles);

    // ---- stage lights (extra colored fills; sun/hemi are configured by Game) ----
    const spotA = new THREE.PointLight(0xff9a4a, 60, 40, 1.8);
    spotA.position.set(-9, 7, -6);
    const spotB = new THREE.PointLight(0x6a8aff, 55, 40, 1.8);
    spotB.position.set(9, 6, 7);
    this.group.add(spotA, spotB);
  }

  update(dt: number): void {
    if (this.disposed) return;
    this.t += dt;
    const t = this.t;

    // karts lap the ring, leaning into the turn
    for (const k of this.karts) {
      k.a += k.w * dt;
      const x = Math.cos(k.a) * k.r;
      const z = Math.sin(k.a) * k.r;
      k.visual.group.position.set(x, 0.04 + Math.sin(t * 5 + k.bob) * 0.03, z);
      // heading = tangent of the circle (counterclockwise): forward = (-sin a, cos a)
      k.visual.group.rotation.y = Math.atan2(-Math.sin(k.a), Math.cos(k.a));
      k.visual.update(dt, t, {
        speedRatio: 0.5,
        steer: -0.35 + Math.sin(t * 0.9 + k.bob) * 0.3,
        drifting: false,
        driftLevel: 0,
        grounded: true,
        boost: Math.sin(t * 0.5 + k.bob) > 0.86,
        shrink: false,
        airborne: false,
        trickSpin: 0,
        trickKind: 0,
        glider: 0,
        driftKick: 0,
      });
    }

    // candy boxes orbit + spin
    for (const b of this.boxes) {
      b.a += b.w * dt;
      b.mesh.position.set(Math.cos(b.a) * b.r, b.y + Math.sin(t * 1.6 + b.a * 2) * 0.3, Math.sin(b.a) * b.r);
      b.mesh.rotation.y = t * 1.3 + b.a;
      b.mesh.rotation.x = t * 0.7;
    }

    // slow counter-rotating checker + breathing glow rings
    if (this.checkerRing) this.checkerRing.rotation.z = t * 0.05;
    this.glowRings.forEach((g, i) => {
      const m = g.material as THREE.MeshBasicMaterial;
      m.opacity = 0.55 + Math.sin(t * 2 + i * 1.4) * 0.25;
    });

    // sparkles drift
    if (this.sparkles) {
      this.sparkles.rotation.y = t * 0.03;
      (this.sparkles.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(t * 1.7) * 0.25;
    }

    // slow cinematic orbit around the podium
    const camA = t * 0.07;
    const camR = 14.5 + Math.sin(t * 0.11) * 1.2;
    this.camera.position.set(Math.cos(camA) * camR, 4.6 + Math.sin(t * 0.16) * 0.5, Math.sin(camA) * camR);
    this.camera.lookAt(0, 1.15, 0);
  }

  dispose(): void {
    this.disposed = true;
    for (const k of this.karts) k.visual.dispose();
    this.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.karts = [];
    this.boxes = [];
    this.checkerRing = null;
    this.sparkles = null;
    this.glowRings = [];
  }
}
