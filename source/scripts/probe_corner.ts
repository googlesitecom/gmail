/** Probe glacier rail openness + curvature around the (-160, 80) corner. */
import { TRACKS } from '../src/game/tracks/TrackCatalog';
import { TrackWorld } from '../src/game/tracks/TrackBuilder';

const fakeCtx: Record<string, unknown> = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'canvas') return { width: 64, height: 64 };
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient')
      return (): { addColorStop: () => void } => ({ addColorStop: () => {} });
    if (prop === 'measureText') return (): { width: number } => ({ width: 0 });
    if (prop === 'getImageData') return (): unknown => ({ data: new Uint8ClampedArray(4) });
    return (): void => undefined;
  },
  set: () => true,
});
(globalThis as unknown as Record<string, unknown>).document = {
  createElement: (): unknown => ({ width: 0, height: 0, style: {}, getContext: (): unknown => fakeCtx, addEventListener: (): void => undefined }),
  createElementNS: (): unknown => ({ style: {} }),
  addEventListener: (): void => undefined,
  body: { appendChild: (): void => undefined },
};
(globalThis as unknown as Record<string, unknown>).window = globalThis;
(globalThis as unknown as Record<string, unknown>).localStorage = { getItem: (): null => null, setItem: (): void => undefined };
(globalThis as unknown as Record<string, unknown>).navigator = { userAgent: 'bun-sim' };

const world = new TrackWorld(TRACKS.glacier, false, 0.1, 0);
const sp = world.spline;
const N = sp.samples.length;
console.log('samples:', N, 'len:', Math.round(sp.length));

// find the sample nearest (-160, 80)
let near = 0, nearD = Infinity;
for (let i = 0; i < N; i++) {
  const p = sp.samples[i].pos;
  const d = (p.x + 160) ** 2 + (p.z - 80) ** 2;
  if (d < nearD) { nearD = d; near = i; }
}
console.log('nearest sample to (-160,80):', near, 's=', sp.samples[near].s.toFixed(3),
  'pos=', sp.samples[near].pos.toArray().map(v => +v.toFixed(1)));

for (let d = -14; d <= 22; d++) {
  const i = ((near + d) % N + N) % N;
  const sm = sp.samples[i];
  // curvature: angle between tangents of i-1 and i+1
  const a = sp.samples[((i - 1) % N + N) % N];
  const b = sp.samples[((i + 1) % N + N) % N];
  const t1 = Math.atan2(b.tangent.x, b.tangent.z);
  const t0 = Math.atan2(a.tangent.x, a.tangent.z);
  let dd = t1 - t0;
  while (dd > Math.PI) dd -= Math.PI * 2;
  while (dd < -Math.PI) dd += Math.PI * 2;
  console.log(
    `#${i} s=${sm.s.toFixed(3)} pos=(${sm.pos.x.toFixed(0)},${sm.pos.z.toFixed(0)}) hw=${sm.halfWidth.toFixed(1)}` +
    ` curve=${(dd * 180 / Math.PI).toFixed(1)}deg railL=${world.railOpen.left[i]} railR=${world.railOpen.right[i]}` +
    ` jump=${sm.jump ? 1 : 0} vMax=${world.racingLine.vMax[i].toFixed(1)} lat=${world.racingLine.lat[i].toFixed(1)}`
  );
}
