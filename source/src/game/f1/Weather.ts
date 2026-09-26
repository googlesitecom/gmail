/**
 * APEX GP — Weather system (v11 "Immersion").
 *
 * Four selectable conditions — CLEAR / CLOUDY / RAIN / NIGHT — each resolving
 * to a full environment style layered on top of the circuit's base look:
 *  - sky shader v2: gradient + sun disk & glow + horizon haze (+ stars/moon at night)
 *  - light rig: sun/hemi/ambient intensities, fog, exposure
 *  - physics: rain multiplies grip down (car + AI racing line)
 *  - decor: night races get floodlight masts + follow spotlights
 */

import * as THREE from 'three';
import type { Weather } from '../core/Types';
import type { F1EnvStyle } from '../f1/F1TrackBuilder';

export interface WeatherStyle extends F1EnvStyle {
  /** grip multiplier applied to every car + the AI racing line */
  gripScale: number;
  /** wet asphalt look (low roughness, strong env reflections) */
  wetRoad: boolean;
  /** billboard clouds count / tint */
  clouds: number;
  cloudColor: number;
  cloudOpacity: number;
  /** night: stars + moon + floodlights */
  night: boolean;
  /** ambient light bump (night rig) */
  ambient: number;
  /** cloud drifting speed */
  cloudDrift: number;
}

/** Layer a weather condition over the circuit's base env style. */
export function resolveWeather(base: F1EnvStyle, weather: Weather): WeatherStyle {
  const c = (hex: number, mul: number): number => {
    const col = new THREE.Color(hex).multiplyScalar(mul);
    return col.getHex();
  };
  switch (weather) {
    case 'cloudy':
      return {
        ...base,
        skyTop: 0x9aa6b8, skyBottom: 0xd8dde4,
        sunColor: 0xf2f4f8, sunIntensity: base.sunIntensity * 0.34,
        hemiSky: 0xc4ccd8, hemiGround: c(base.hemiGround, 0.9), hemiIntensity: base.hemiIntensity * 1.25,
        fog: 0xc9cfd8, fogNear: base.fogNear * 0.72, fogFar: base.fogFar * 0.72,
        exposure: 1.0, ambient: 0.42,
        gripScale: 0.97, wetRoad: false,
        clouds: 22, cloudColor: 0xe8ecf2, cloudOpacity: 0.92, cloudDrift: 1.4,
        night: false,
      };
    case 'rain':
      return {
        ...base,
        skyTop: 0x39424e, skyBottom: 0x78828e,
        sunColor: 0xbcc4d0, sunIntensity: base.sunIntensity * 0.16,
        hemiSky: 0x8b95a4, hemiGround: c(base.hemiGround, 0.7), hemiIntensity: base.hemiIntensity * 1.35,
        fog: 0x8b939e, fogNear: base.fogNear * 0.5, fogFar: base.fogFar * 0.55,
        exposure: 0.96, ambient: 0.5,
        gripScale: 0.86, wetRoad: true,
        clouds: 30, cloudColor: 0x59626e, cloudOpacity: 0.96, cloudDrift: 2.6,
        night: false,
      };
    case 'night':
      return {
        ...base,
        skyTop: 0x050810, skyBottom: 0x101a2c,
        sunColor: 0x9fb4ff, sunIntensity: 0.5, sunDir: [-0.35, 0.8, 0.3],
        hemiSky: 0x2c3550, hemiGround: 0x0c1018, hemiIntensity: 0.85,
        fog: 0x0b1018, fogNear: 300, fogFar: 1100,
        exposure: 1.06, ambient: 0.62,
        gripScale: 0.99, wetRoad: false,
        clouds: 0, cloudColor: 0x1a2233, cloudOpacity: 0.35, cloudDrift: 0.7,
        night: true,
      };
    case 'clear':
    default:
      return {
        ...base,
        ambient: 0.14,          // LOW fill — the sun owns the light, shadows read deep
        gripScale: 1.0, wetRoad: false,
        clouds: 15, cloudColor: 0xffffff, cloudOpacity: 0.9, cloudDrift: 1.0,
        night: false,
      };
  }
}

// ============================================================ sky shader v2

export interface SkyUniforms extends Record<string, THREE.IUniform> {
  top: THREE.IUniform<THREE.Color>;
  bottom: THREE.IUniform<THREE.Color>;
  sunDir: THREE.IUniform<THREE.Vector3>;
  sunColor: THREE.IUniform<THREE.Color>;
  sunGlow: THREE.IUniform<number>;
  night: THREE.IUniform<number>;
}

/** Gradient dome with sun disk + glow + horizon haze; stars & moon at night. */
export function makeSkyDomeV2(style: F1EnvStyle, weather: Weather): THREE.Mesh {
  const night = weather === 'night';
  const overcast = weather === 'rain' || weather === 'cloudy';
  const uniforms: SkyUniforms = {
    top: { value: new THREE.Color(style.skyTop) },
    bottom: { value: new THREE.Color(style.skyBottom) },
    sunDir: { value: new THREE.Vector3(...style.sunDir).normalize() },
    sunColor: { value: new THREE.Color(style.sunColor) },
    sunGlow: { value: overcast ? 0.12 : night ? 0.5 : 1.0 },
    night: { value: night ? 1 : 0 },
  };
  const geo = new THREE.SphereGeometry(1200, 40, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor;
      uniform float sunGlow; uniform float night;
      varying vec3 vDir;

      float hash(vec3 p) {
        p = fract(p * 443.8975);
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(bottom, top, pow(h, 0.58));

        // horizon haze band (atmospheric thickness — thick enough to melt
        // into the fogged terrain instead of a sharp sky/ground cut)
        col += bottom * 0.34 * pow(1.0 - h, 4.0);

        // ---- sun / moon -------------------------------------------------
        float sd = dot(d, normalize(sunDir));
        // TIGHT glare (pow 48/160): a crisp sun with a small halo — the old
        // pow-18 wash read as fake "bloom" over a quarter of the sky
        float glow = pow(max(sd, 0.0), 48.0) * 0.38 + pow(max(sd, 0.0), 160.0) * 0.85;
        col += sunColor * glow * sunGlow;
        float disk = smoothstep(0.99955, 0.99985, sd);
        col = mix(col, sunColor * (night > 0.5 ? 1.6 : 4.5), disk * (night > 0.5 ? 0.9 : 1.0));

        // ---- stars (night only, above the haze) --------------------------
        if (night > 0.5) {
          vec3 sp = floor(d * 220.0);
          float star = step(0.9975, hash(sp));
          float tw = 0.55 + 0.45 * hash(sp + 7.7);
          col += vec3(0.85, 0.9, 1.0) * star * tw * smoothstep(0.02, 0.25, d.y) * 0.85;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.name = 'skyDome';
  return m;
}

// ============================================================ clouds

let cloudTexCache: THREE.Texture | null = null;

/** Soft radial cloud sprite texture. */
function cloudTexture(): THREE.Texture {
  if (cloudTexCache) return cloudTexCache;
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const ctx = cv.getContext('2d')!;
  // a few stacked blobs = puffy cloud
  const blob = (x: number, y: number, r: number, a: number): void => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(255,255,255,${a * 0.45})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(128, 140, 95, 0.75);
  blob(80, 150, 60, 0.6);
  blob(180, 150, 62, 0.6);
  blob(128, 110, 55, 0.5);
  cloudTexCache = new THREE.CanvasTexture(cv);
  cloudTexCache.colorSpace = THREE.SRGBColorSpace;
  return cloudTexCache;
}

export interface CloudLayer {
  group: THREE.Group;
  update(dt: number): void;
}

// ============================================================ rain

/**
 * Rain field: a curtain of streak lines that follows the camera (falling,
 * wrapping inside a cylinder around the eye) plus a mist/spray pool behind
 * fast cars (rooster tails on a wet track).
 */
export interface RainSystem {
  group: THREE.Group;
  /** dt, camera position, player position, player speed (m/s) */
  update(dt: number, camPos: THREE.Vector3, playerPos: THREE.Vector3, playerSpeed: number): void;
  dispose(): void;
}

const RAIN_COUNT = 750;          // streak lines
const RAIN_R = 34;               // curtain radius around the camera (m)
const RAIN_H = 26;               // curtain height (m)
const SPRAY_COUNT = 150;         // mist sprites in the pool

export function makeRainSystem(): RainSystem {
  const group = new THREE.Group();
  group.name = 'rainSystem';

  // ---- streaks ------------------------------------------------------------------
  const pos = new Float32Array(RAIN_COUNT * 2 * 3);
  const vel = new Float32Array(RAIN_COUNT);        // fall speed per drop
  const drift = new Float32Array(RAIN_COUNT);      // slight lateral wind
  for (let i = 0; i < RAIN_COUNT; i++) {
    vel[i] = 24 + Math.random() * 12;
    drift[i] = (Math.random() - 0.5) * 4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xaebdd0, transparent: true, opacity: 0.34, fog: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  group.add(lines);

  const spawn = (i: number, cx: number, cz: number, anywhere: boolean): void => {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * RAIN_R;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const y = anywhere ? Math.random() * RAIN_H : RAIN_H * (0.85 + Math.random() * 0.15);
    pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
  };
  // seed anywhere inside the volume (relative to origin; recentered on 1st update)
  for (let i = 0; i < RAIN_COUNT; i++) spawn(i, 0, 0, true);

  // ---- spray pool ---------------------------------------------------------------
  const sprayTex = cloudTexture();                 // soft radial blob works for mist too
  const sprays: { m: THREE.Sprite; vx: number; vy: number; vz: number; life: number }[] = [];
  for (let i = 0; i < SPRAY_COUNT; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sprayTex, transparent: true, opacity: 0, color: 0xcfd9e4,
      depthWrite: false, fog: true,
    }));
    m.visible = false;
    group.add(m);
    sprays.push({ m, vx: 0, vy: 0, vz: 0, life: 0 });
  }
  let sprayIdx = 0;
  const emitSpray = (x: number, y: number, z: number, back: { x: number; z: number }, s: number): void => {
    const p = sprays[sprayIdx];
    sprayIdx = (sprayIdx + 1) % sprays.length;
    p.m.visible = true;
    p.m.position.set(x, y, z);
    const sc = 0.7 + s * 0.05;
    p.m.scale.set(sc, sc, 1);
    p.vx = back.x * (3 + Math.random() * 3) + (Math.random() - 0.5) * 2.5;
    p.vy = 1.2 + Math.random() * 2.2 + s * 0.04;
    p.vz = back.z * (3 + Math.random() * 3) + (Math.random() - 0.5) * 2.5;
    p.life = 0.55 + Math.random() * 0.4;
    (p.m.material as THREE.SpriteMaterial).opacity = 0.32;
  };

  const tmp = new THREE.Vector3();
  return {
    group,
    update(dt, camPos, playerPos, playerSpeed) {
      // streaks fall + wrap, recentered on the camera XZ
      const cx = camPos.x, cz = camPos.z;
      const len = 0.55 + Math.min(0.65, playerSpeed * 0.012);  // longer streaks at speed
      for (let i = 0; i < RAIN_COUNT; i++) {
        const y = pos[i * 6 + 1] - vel[i] * dt;
        const x = pos[i * 6] + drift[i] * dt;
        const z = pos[i * 6 + 2] + drift[i] * 0.6 * dt;
        if (y < 0 || Math.abs(x - cx) > RAIN_R + 6 || Math.abs(z - cz) > RAIN_R + 6) {
          spawn(i, cx, cz, false);
          continue;
        }
        pos[i * 6] = x; pos[i * 6 + 2] = z;
        pos[i * 6 + 1] = y;
        pos[i * 6 + 3] = x - drift[i] * 0.05;
        pos[i * 6 + 4] = y + len;
        pos[i * 6 + 5] = z - drift[i] * 0.03;
      }
      geo.attributes.position.needsUpdate = true;

      // rooster-tail spray behind the player when fast
      if (playerSpeed > 16) {
        const n = playerSpeed > 45 ? 3 : 2;
        for (let k = 0; k < n; k++) {
          // behind the car, biased to the sides
          tmp.set(playerPos.x + (Math.random() - 0.5) * 1.9,
            0.25 + Math.random() * 0.2,
            playerPos.z + (Math.random() - 0.5) * 1.9);
          emitSpray(tmp.x, tmp.y, tmp.z,
            { x: Math.random() - 0.5, z: Math.random() - 0.5 }, playerSpeed);
        }
      }
      // mist pool motion (sprites are auto-camera-facing billboards)
      for (const p of sprays) {
        if (!p.m.visible) continue;
        p.life -= dt;
        if (p.life <= 0) { p.m.visible = false; continue; }
        p.m.position.x += p.vx * dt;
        p.m.position.y += p.vy * dt;
        p.m.position.z += p.vz * dt;
        p.vy -= 2.2 * dt;
        const grow = 1 + 2.4 * dt;
        p.m.scale.x *= grow; p.m.scale.y *= grow;
        (p.m.material as THREE.SpriteMaterial).opacity = Math.min(0.32, p.life * 0.5);
      }
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      for (const p of sprays) {
        (p.m.material as THREE.SpriteMaterial).dispose();
      }
    },
  };
}

/** Billboard cloud field around the circuit. */
export function makeCloudLayer(style: WeatherStyle, cx: number, cz: number): CloudLayer {
  const group = new THREE.Group();
  const tex = cloudTexture();
  const count = Math.round(style.clouds);
  const drifters: { m: THREE.Mesh; vx: number }[] = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: style.cloudOpacity * (0.55 + Math.random() * 0.4),
      color: style.cloudColor, depthWrite: false, fog: false,
    });
    // wide, LOW banks hugging the horizon band — the chase cam has a narrow
    // FOV and looks slightly down, so clouds at 250 m altitude are never
    // in frame; 55-115 m at 320-800 m sits right in the visible sky band.
    const size = 260 + Math.random() * 340;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.42), mat);
    const a = Math.random() * Math.PI * 2;
    const r = 320 + Math.random() * 520;
    m.position.set(cx + Math.cos(a) * r, 55 + Math.random() * 60, cz + Math.sin(a) * r);
    m.rotation.y = Math.random() * Math.PI;
    m.renderOrder = -5;
    group.add(m);
    drifters.push({ m, vx: (4 + Math.random() * 5) * style.cloudDrift });
  }
  let t = 0;
  return {
    group,
    update(dt: number): void {
      t += dt;
      for (const d of drifters) {
        d.m.position.x += d.vx * dt;
        // keep clouds roughly around the circuit
        if (d.m.position.x - cx > 950) d.m.position.x = cx - 950;
      }
      void t;
    },
  };
}
