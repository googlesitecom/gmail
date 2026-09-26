/**
 * APEX GP — Racing line & speed profile (quasi-static method).
 *
 * Line: iterative centerline smoothing with track-edge clamping — converges
 * to the classic clip-the-apex / open-the-exit trajectory.
 *
 * Speed profile: per-sample lateral limit from the aero grip model
 *   v²·κ = μ·g + μ·(½ρ·ClA/m)·v²   →   v² = μg / (κ − c)   (flat-out if κ ≤ c)
 * followed by a backward braking pass and a forward traction pass.
 *
 * The AI drives this line; the delta-time HUD also uses it as "ideal lap".
 */

import { Spline } from '../tracks/Spline';
import { PHYS } from '../core/Config';

export interface F1RacingLine {
  /** lateral offset from the centerline per sample (m, + = right) */
  lat: Float32Array;
  /** physical maximum speed per sample (m/s) */
  vTarget: Float32Array;
  /** local curvature of the line (1/m) */
  curv: Float32Array;
  count: number;
}

export function computeRacingLine(spline: Spline, opts: {
  mu: number;              // tire friction coefficient
  cla: number;             // downforce area
  powerW: number;          // engine watts
  mass: number;            // kg incl. fuel
  margin: number;          // meters kept from the track edge
}): F1RacingLine {
  const N = spline.samples.length;

  // ---- 1. line: world-space iterative shortening with edge clamping ---------
  // Each pass pulls every point toward the midpoint of its neighbors (true
  // curve-shortening — it has real shrink pressure, unlike averaging the
  // lateral offsets whose all-zero centerline is a fixed point), then clamps
  // back inside the track edges. Corners get cut naturally.
  const lat = new Float32Array(N);
  {
    const pts: { x: number; z: number }[] = spline.samples.map(sm => ({ x: sm.pos.x, z: sm.pos.z }));
    const mid: { x: number; z: number }[] = pts.map(() => ({ x: 0, z: 0 }));
    const ITER = 300;
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < N; i++) {
        const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
        mid[i].x = (a.x + b.x) / 2;
        mid[i].z = (a.z + b.z) / 2;
      }
      for (let i = 0; i < N; i++) {
        const sm = spline.samples[i];
        const dx = mid[i].x - sm.pos.x;
        const dz = mid[i].z - sm.pos.z;
        let l = dx * sm.right.x + dz * sm.right.z;
        const lim = Math.max(0.5, sm.halfWidth - opts.margin);
        if (l > lim) l = lim;
        if (l < -lim) l = -lim;
        pts[i].x = sm.pos.x + sm.right.x * l;
        pts[i].z = sm.pos.z + sm.right.z * l;
      }
    }
    for (let i = 0; i < N; i++) {
      const sm = spline.samples[i];
      lat[i] = (pts[i].x - sm.pos.x) * sm.right.x + (pts[i].z - sm.pos.z) * sm.right.z;
    }
  }

  // ---- 2. curvature of the resulting line (1/m) --------------------------------
  const curv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const i0 = (i - 1 + N) % N, i2 = (i + 1) % N;
    const p0 = linePoint(spline, lat, i0);
    const p1 = linePoint(spline, lat, i);
    const p2 = linePoint(spline, lat, i2);
    const a = Math.atan2(p2.x - p1.x, p2.z - p1.z);
    const b = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const ds = Math.max(0.5, (Math.hypot(p0.x - p1.x, p0.z - p1.z) + Math.hypot(p1.x - p2.x, p1.z - p2.z)) / 2);
    curv[i] = Math.abs(d) / ds;
  }
  // light smoothing of curvature (killer noise on straight-ish sections)
  const curvS = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let acc = 0;
    for (let k = -2; k <= 2; k++) acc += curv[(i + k + N) % N];
    curvS[i] = acc / 5;
  }
  // KINK CLAMP: the shortening pass can snap the line across a hairpin apex
  // (lat +lim → −lim in a couple of samples), producing a fake sub-1 m-radius
  // kink → a ~4 m/s pocket in the profile → the whole field crawls through a
  // hairpin and bunches. No F1 car follows a radius under ~6 m: clamp.
  const KINK_MAX = 0.16;             // 1/m → 6.25 m minimum radius
  for (let i = 0; i < N; i++) if (curvS[i] > KINK_MAX) curvS[i] = KINK_MAX;

  // ---- 3. lateral speed limit (aero grip model) ------------------------------------
  const mu = opts.mu;
  const c = mu * 0.5 * PHYS.airDensity * opts.cla / opts.mass;   // v² coefficient
  const vTarget = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const k = curvS[i];
    if (k <= c * 1.02) vTarget[i] = 200;   // aero beats demand — flat out
    // 5% grip margin: the profile must be DRIVABLE, not theoretical
    else vTarget[i] = Math.sqrt((mu * 9.81 * 0.92) / (k - c));
    // a race car never TARGETS below strong-hairpin pace — crawl pockets
    // (profile artifacts, kink leftovers) jam the whole field
    if (vTarget[i] < 9.5) vTarget[i] = 9.5;
  }

  // ---- 4. backward braking pass ---------------------------------------------------------
  const ds = spline.length / N;
  const brakeA = (v: number): number =>
    mu * (9.81 + 0.5 * PHYS.airDensity * opts.cla * v * v / opts.mass);
  for (let pass = 0; pass < 3; pass++) {
    for (let ii = N; ii > 0; ii--) {
      const i = (ii - 1) % N;
      const nx = (i + 1) % N;
      const vNext = vTarget[nx];
      const a = brakeA(Math.max(vTarget[i], vNext));
      const vAllow = Math.sqrt(vNext * vNext + 2 * a * ds);
      if (vTarget[i] > vAllow) vTarget[i] = vAllow;
    }
  }

  // ---- 5. forward traction pass ------------------------------------------------------------
  const accelA = (v: number): number => {
    const drag = 0.5 * PHYS.airDensity * 1.42 * v * v;
    const tractionCap = mu * 9.81 * 0.94;             // rwd + weight transfer
    const engineA = opts.powerW / Math.max(v, 12) / opts.mass;
    return Math.min(tractionCap, engineA) - drag / opts.mass;
  };
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i <= N; i++) {
      const idx = i % N;
      const pv = vTarget[(idx - 1 + N) % N];
      const a = Math.max(0.8, accelA(pv));
      const vAllow = Math.sqrt(pv * pv + 2 * a * ds);
      if (vTarget[idx] > vAllow) vTarget[idx] = vAllow;
    }
  }

  return { lat, vTarget, curv: curvS, count: N };
}

function linePoint(spline: Spline, lat: Float32Array, i: number): Pt {
  const sm = spline.samples[i];
  return { x: sm.pos.x + sm.right.x * lat[i], y: sm.pos.y, z: sm.pos.z + sm.right.z * lat[i] };
}
interface Pt { x: number; y: number; z: number; }
