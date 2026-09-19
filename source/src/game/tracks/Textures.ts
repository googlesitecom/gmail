/**
 * APEX KART — Procedural canvas textures.
 * Every surface you see on track is painted here at runtime: asphalt with
 * grain + lane markings, diagonal kerbs, mottled terrain, guardrail steel
 * and tunnel wall panels. Zero external assets, one small canvas per theme
 * (cached), so memory stays tiny while the road stops looking like flat void.
 */

import * as THREE from 'three';
import { TrackTheme } from '../core/Types';
import { makeRng } from '../core/MathUtils';
import { publicAsset } from '../core/Paths';
import { THEMES } from './Decorations';

const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

// ---------------------------------------------------------------- photo assets
// Real-world surface photos shot for the game (public/models, 9 total):
// one asphalt, seven themed road surfaces, one grass, one curbstone.
// Every theme picks its road/ground photo from the map below; the photo is
// composited UNDER the painted lane markings so the surface reads as the
// real material while staying crisp at racing speed. Loaded once at module
// import; until decode finishes we fall back to procedural paint, and caches
// are invalidated on load so the NEXT session uses the photos.
type PhotoKey =
  | 'asfalto' | 'borde' | 'pasto'
  | 'pista2' | 'pista3' | 'pista4' | 'pista5' | 'pista6' | 'pista7';

const PHOTO_FILES: Record<PhotoKey, string> = {
  asfalto: 'models/road_asfalto.jpg',
  borde: 'models/borde.jpg',
  pasto: 'models/pasto.jpg',
  pista2: 'models/pista2.jpg',
  pista3: 'models/pista3.jpg',
  pista4: 'models/pista4.jpg',
  pista5: 'models/pista5.jpg',
  pista6: 'models/pista6.jpg',
  pista7: 'models/pista7.jpg',
};

const PHOTOS = new Map<PhotoKey, HTMLImageElement>();

function startPhotoPreload(): void {
  for (const [key, file] of Object.entries(PHOTO_FILES) as [PhotoKey, string][]) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      // rebuild track textures on the next session
      ROAD_CACHE.clear();
      ROAD_PHOTO_CACHE.clear();
      GROUND_CACHE.clear();
      KERB_CACHE.clear();
    };
    img.src = publicAsset(file);
    PHOTOS.set(key, img);
  }
}

function drawPhotoCover(
  ctx: CanvasRenderingContext2D, key: PhotoKey | null, size: number,
  grade: { tint?: THREE.Color | null; brightness?: number } = {},
): boolean {
  const img = key ? PHOTOS.get(key) : null;
  if (!img || !img.complete || !img.naturalWidth) return false;
  const s = size / Math.min(img.naturalWidth, img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  // exposure lift first — the photos ship a touch underexposed so the full
  // frame reads bright under ACES; a full multiply tint then crushed them
  // to near-black. Grade = brightness lift + SOFT color multiply (mostly
  // white so the photo's own character survives).
  if (grade.brightness && grade.brightness !== 1) {
    ctx.filter = `brightness(${grade.brightness}) contrast(1.06)`;
  }
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  ctx.filter = 'none';
  if (grade.tint) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#' + grade.tint.getHexString();
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }
  return true;
}

/** Which road photo each theme uses (null → procedural paint). */
const ROAD_PHOTO: Record<TrackTheme, PhotoKey | null> = {
  meadow: 'asfalto', jungle: 'asfalto', castle: 'asfalto', beach: 'asfalto',
  city: 'asfalto', desert: 'pista2', volcano: 'pista3', snow: 'pista6',
  glacier: 'pista6', space: 'pista5', factory: 'pista5', prism: null,
};

/** Which terrain photo each theme uses (null → procedural mottle). */
const GROUND_PHOTO: Record<TrackTheme, PhotoKey | null> = {
  meadow: 'pasto', jungle: 'pasto', castle: 'pasto',
  desert: 'pista4', beach: 'pista4', snow: 'pista6', glacier: 'pista6',
  city: 'pista3', volcano: 'pista7', space: null, factory: null, prism: null,
};

if (typeof document !== 'undefined') startPhotoPreload();

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, ctx: c.getContext('2d')! };
}

function toTexture(c: HTMLCanvasElement, repeatVScale = 1): THREE.Texture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const ROAD_CACHE = new Map<string, THREE.Texture>();
const ROAD_PHOTO_CACHE = new Map<string, THREE.Texture>();

/**
 * Road PHOTO base texture (no painted markings) — tiled 2-3× across the
 * road width by the builder so the grain reads at racing distance.
 * Falls back to procedural aggregate if the photo hasn't decoded.
 */
export function roadPhotoTexture(theme: TrackTheme): THREE.Texture {
  const key = `roadphoto-${theme}`;
  const hit = ROAD_PHOTO_CACHE.get(key);
  if (hit) return hit;

  const style = THEMES[theme];
  const S = 512;
  const { c, ctx } = makeCanvas(S, S);
  const rng = makeRng(theme.length * 977 + 31);

  const tint = new THREE.Color(style.road).multiplyScalar(0.9);
  // photo grade: brighten the photo, then tint only 35% toward the theme
  // color — the asphalt's real grain carries the look, the theme just sets
  // the mood (blue night asphalt, warm desert dirt, icy blue...)
  const photoGrade = new THREE.Color(0xffffff).lerp(tint, 0.35);

  if (drawPhotoCover(ctx, ROAD_PHOTO[theme], S, { tint: photoGrade, brightness: 1.45 })) {
    // even out exposure a touch
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, S, S);
  } else {
    // procedural base asphalt
    ctx.fillStyle = '#' + tint.getHexString();
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 5200; i++) {
      const x = rng() * S, y = rng() * S;
      const dark = rng() > 0.45;
      ctx.fillStyle = dark ? 'rgba(8,9,12,0.30)' : 'rgba(232,236,242,0.12)';
      const s = rng() * 4.2 + 1.1;
      ctx.fillRect(x, y, s, s);
    }
  }

  const tex = toTexture(c);
  tex.anisotropy = 8;
  ROAD_PHOTO_CACHE.set(key, tex);
  return tex;
}

/**
 * Painted road MARKINGS overlay (transparent background): tar snakes,
 * patch repairs, cracks, tire-wear grooves, bold white edge lines and a
 * yellow center dash. U spans the full road width once (0..1).
 */
export function roadTexture(theme: TrackTheme): THREE.Texture {
  const key = `road-${theme}`;
  const hit = ROAD_CACHE.get(key);
  if (hit) return hit;

  const style = THEMES[theme];
  const S = 512;
  const { c, ctx } = makeCanvas(S, S);
  const rng = makeRng(theme.length * 977 + 31);
  const tint = new THREE.Color(style.road).multiplyScalar(0.9);

  // tar repair snakes — dark meandering seams
  ctx.strokeStyle = 'rgba(10,10,14,0.34)';
  for (let i = 0; i < 7; i++) {
    ctx.lineWidth = rng() * 2.6 + 1.6;
    ctx.beginPath();
    let x = rng() * S, y = rng() * S;
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (rng() - 0.5) * 120;
      y += rng() * 70 + 20;
      ctx.quadraticCurveTo(x + (rng() - 0.5) * 60, y - 20, x, y);
    }
    ctx.stroke();
  }

  // rectangular patch repairs with visible edge seams
  for (let i = 0; i < 6; i++) {
    const w = rng() * 90 + 50, h = rng() * 60 + 34;
    const x = rng() * (S - w), y = rng() * (S - h);
    const col = new THREE.Color(style.road).multiplyScalar(0.60);
    ctx.fillStyle = `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},0.55)`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  // hairline cracks radiating from seams
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const x = rng() * S, y = rng() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 70, y + (rng() - 0.5) * 70);
    ctx.stroke();
  }

  // tire-wear darker bands (two racing grooves, heavier than before)
  const grad = (x: number): void => {
    const g = ctx.createLinearGradient(x - 34, 0, x + 34, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.30)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 34, 0, 68, S);
  };
  grad(S * 0.33); grad(S * 0.67);

  // edge lines (white, bold, dark outline) near both borders
  for (const x of [17, 487]) {
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(x - 3, 0, 25, S);
    ctx.fillStyle = 'rgba(250,252,255,0.97)';
    ctx.fillRect(x, 0, 19, S);
  }

  // center dashes (bold warm yellow, outlined, 60% duty)
  for (let y = 0; y < S; y += 112) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(239, y, 34, 74);
    ctx.fillStyle = 'rgba(255,222,64,0.98)';
    ctx.fillRect(243, y, 26, 66);
  }

  const tex = toTexture(c);
  tex.anisotropy = 8;
  ROAD_CACHE.set(key, tex);
  return tex;
}

const KERB_CACHE = new Map<string, THREE.Texture>();

/** Curbstone kerb strip: the real red/white curb photo with theme tint. */
export function kerbTexture(theme: TrackTheme): THREE.Texture {
  const key = `kerb-${theme}`;
  const hit = KERB_CACHE.get(key);
  if (hit) return hit;

  const style = THEMES[theme];
  const { c, ctx } = makeCanvas(128, 128);
  const kerbTint = new THREE.Color(style.curbA).lerp(new THREE.Color(0xffffff), 0.55);
  if (drawPhotoCover(ctx, 'borde', 128, { tint: kerbTint, brightness: 1.2 })) {
    // curbstone photo carries the red/white read; theme tint is soft
  } else {
    // procedural fallback: diagonal stripes
    ctx.fillStyle = hex(style.curbA);
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = hex(style.curbB);
    ctx.save();
    ctx.translate(64, 64);
    ctx.rotate(Math.PI / 4);
    for (let x = -192; x < 192; x += 64) ctx.fillRect(x, -192, 32, 384);
    ctx.restore();
  }
  // subtle top shading
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);

  const tex = toTexture(c);
  KERB_CACHE.set(key, tex);
  return tex;
}

const GROUND_CACHE = new Map<string, THREE.Texture>();

/** Terrain texture: real surface photo where it fits the theme (tinted to
 *  the theme ground color), procedural mottle elsewhere. */
export function groundTexture(theme: TrackTheme): THREE.Texture {
  const key = `ground-${theme}`;
  const hit = GROUND_CACHE.get(key);
  if (hit) return hit;

  const style = THEMES[theme];
  const S = 256;
  const { c, ctx } = makeCanvas(S, S);
  const rng = makeRng(theme.length * 3571 + 5);
  const photoKey = GROUND_PHOTO[theme];
  const groundTint = theme === 'city' ? 0x8a8a96 : theme === 'snow' || theme === 'glacier' ? 0xeef4fa : style.ground;
  // photo grade: brighten + tint only 40% toward the theme ground color
  const groundGrade = new THREE.Color(0xffffff).lerp(new THREE.Color(groundTint), 0.4);

  if (drawPhotoCover(ctx, photoKey, S, { tint: groundGrade, brightness: 1.3 })) {
    if (theme === 'city') {
      // night-city darkening over the plaza photo
      ctx.fillStyle = 'rgba(12,14,24,0.42)';
      ctx.fillRect(0, 0, S, S);
    }
  } else {
    ctx.fillStyle = hex(style.ground);
    ctx.fillRect(0, 0, S, S);

    const dark = new THREE.Color(style.ground).multiplyScalar(0.72);
    for (let i = 0; i < 900; i++) {
      const x = rng() * S, y = rng() * S;
      const r = rng() * 7 + 2;
      ctx.fillStyle = rng() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // a few darker patches for organic clumping
    ctx.fillStyle = `rgba(${Math.round(dark.r * 255)},${Math.round(dark.g * 255)},${Math.round(dark.b * 255)},0.45)`;
    for (let i = 0; i < 26; i++) {
      const x = rng() * S, y = rng() * S;
      ctx.beginPath();
      ctx.ellipse(x, y, rng() * 16 + 6, rng() * 10 + 4, rng() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = toTexture(c);
  GROUND_CACHE.set(key, tex);
  return tex;
}

let RAIL_TEX: THREE.Texture | null = null;

/** Brushed guardrail steel with rivet rows and a warning stripe band. */
export function railTexture(): THREE.Texture {
  if (RAIL_TEX) return RAIL_TEX;
  const { c, ctx } = makeCanvas(64, 64);
  const rng = makeRng(88);
  // steel base with horizontal brushing
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#d7dbe2');
  g.addColorStop(0.45, '#aeb4bf');
  g.addColorStop(0.5, '#8d939e');
  g.addColorStop(1, '#c3c8d1');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, rng() * 64, 64, 1);
  }
  // rivets
  ctx.fillStyle = 'rgba(60,64,74,0.85)';
  for (let y = 8; y < 64; y += 16) {
    ctx.beginPath(); ctx.arc(8, y, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(56, y, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  RAIL_TEX = toTexture(c);
  return RAIL_TEX;
}

const TUNNEL_CACHE = new Map<string, THREE.Texture>();

/** Concrete tunnel wall panels with seams and grime (theme tint). */
export function tunnelTexture(theme: TrackTheme): THREE.Texture {
  const key = `tunnel-${theme}`;
  const hit = TUNNEL_CACHE.get(key);
  if (hit) return hit;

  const style = THEMES[theme];
  const { c, ctx } = makeCanvas(128, 128);
  const rng = makeRng(theme.length * 613 + 17);
  // base = darker mix of theme ground
  const base = new THREE.Color(style.ground).multiplyScalar(0.55).lerp(new THREE.Color(0x5a5f6a), 0.5);
  ctx.fillStyle = '#' + base.getHexString();
  ctx.fillRect(0, 0, 128, 128);
  // panel seams every 32px
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= 128; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke();
  }
  for (let y = 0; y <= 128; y += 42) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke();
  }
  // grime speckle
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(rng() * 128, rng() * 128, rng() * 3 + 1, rng() * 3 + 1);
  }
  // damp streaks from the seams
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(rng() * 4) * 32 + 16;
    ctx.fillRect(x - 2, rng() * 64, 4, 32 + rng() * 40);
  }

  const tex = toTexture(c);
  TUNNEL_CACHE.set(key, tex);
  return tex;
}

let CHECKER_TEX: THREE.Texture | null = null;

/** Bold start/finish checkerboard strip. */
export function checkerTexture(): THREE.Texture {
  if (CHECKER_TEX) return CHECKER_TEX;
  const { c, ctx } = makeCanvas(128, 32);
  const sq = 16;
  for (let y = 0; y < 32 / sq; y++) {
    for (let x = 0; x < 128 / sq; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f4f6fa' : '#14161f';
      ctx.fillRect(x * sq, y * sq, sq, sq);
    }
  }
  CHECKER_TEX = toTexture(c);
  return CHECKER_TEX;
}

// ---------------------------------------------------------------- trackside ads

const BILLBOARD_CACHE: (THREE.Texture | null)[] = [];
const SPONSORS: { name: string; bg: string; fg: string; tag: string }[] = [
  { name: 'APEX', bg: '#101422', fg: '#ffe94a', tag: 'NEUMATICOS' },
  { name: 'TURBO+', bg: '#8a1030', fg: '#ffffff', tag: 'COMBUSTIBLE' },
  { name: 'ZOOM', bg: '#0d3a2a', fg: '#7affc8', tag: 'REFRESCOS' },
  { name: 'NITRO', bg: '#1a1040', fg: '#b08aff', tag: 'GARAGE 24H' },
];

/** Fictional sponsor billboard (original brands, one per index). */
export function billboardTexture(i: number): THREE.Texture {
  const cached = BILLBOARD_CACHE[i];
  if (cached) return cached;
  const sp = SPONSORS[i % SPONSORS.length];
  const { c, ctx } = makeCanvas(512, 160);
  // panel base
  ctx.fillStyle = sp.bg;
  ctx.fillRect(0, 0, 512, 160);
  // subtle diagonal speed texture
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 14;
  for (let x = -160; x < 512; x += 46) {
    ctx.beginPath(); ctx.moveTo(x, 160); ctx.lineTo(x + 100, 0); ctx.stroke();
  }
  // brand block
  ctx.fillStyle = sp.fg;
  ctx.font = '900 86px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sp.name, 256, 66);
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(sp.tag, 256, 128);
  // frame
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 500, 148);
  const tex = toTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  BILLBOARD_CACHE[i] = tex;
  return tex;
}

let CHEVRON_TEX: THREE.Texture | null = null;

/** Corner warning board: red/white chevrons pointing the turn direction. */
export function chevronTexture(): THREE.Texture {
  if (CHEVRON_TEX) return CHEVRON_TEX;
  const { c, ctx } = makeCanvas(256, 128);
  ctx.fillStyle = '#c8182a';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#f4f6fa';
  for (let k = 0; k < 3; k++) {
    const x0 = 18 + k * 82;
    ctx.beginPath();
    ctx.moveTo(x0, 14);
    ctx.lineTo(x0 + 44, 64);
    ctx.lineTo(x0, 114);
    ctx.lineTo(x0 + 22, 114);
    ctx.lineTo(x0 + 66, 64);
    ctx.lineTo(x0 + 22, 14);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#f4f6fa';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 118);
  const tex = toTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  CHEVRON_TEX = tex;
  return tex;
}

/** Disposal for hot-reload sanity (textures are cached per theme). */
export function disposeTextureCache(): void {
  for (const t of [...ROAD_CACHE.values(), ...ROAD_PHOTO_CACHE.values(), ...KERB_CACHE.values(),
    ...GROUND_CACHE.values(), ...TUNNEL_CACHE.values()]) t.dispose();
  ROAD_CACHE.clear(); ROAD_PHOTO_CACHE.clear(); KERB_CACHE.clear(); GROUND_CACHE.clear(); TUNNEL_CACHE.clear();
  RAIL_TEX?.dispose(); RAIL_TEX = null;
  CHECKER_TEX?.dispose(); CHECKER_TEX = null;
  for (let i = 0; i < BILLBOARD_CACHE.length; i++) {
    BILLBOARD_CACHE[i]?.dispose();
    BILLBOARD_CACHE[i] = null;
  }
  CHEVRON_TEX?.dispose(); CHEVRON_TEX = null;
}
