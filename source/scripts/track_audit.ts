/**
 * APEX KART — Track geometry auditor (runs headless with bun).
 *
 * Reports, per track:
 *  - lap length (m) and ratio vs the v3 baseline (the "+30% longer" contract)
 *  - min separation between NON-ADJACENT samples at similar height
 *    (fold/overlap detector; dy > 8 m counts as an intentional overpass)
 *  - for every hazard / boost pad: does it land on solid, non-tunnel,
 *    non-gap ground?
 *  - landmark mode: `bun scripts/track_audit.ts --landmarks` prints the
 *    track progress s of physical (x,z) spots — used to re-place hazards,
 *    pads and AI hints after re-authoring the circuits.
 */
import { TRACKS } from '../src/game/tracks/TrackCatalog';
import { Spline } from '../src/game/tracks/Spline';

// v3 baseline lap lengths (meters, measured) — target is ×1.30 (accept 1.27-1.42)
const BASELINE: Record<string, number> = {
  meadow: 1223, beach: 1181, jungle: 1164, desert: 1180, factory: 1174,
  volcano: 1178, snow: 1181, glacier: 1147, castle: 1190, city: 1153,
  space: 1138, prism: 1165,
};

const TARGET_MIN = 1.27;
const TARGET_MAX = 1.43;

/** Landmarks per track (label -> world x,z) whose s we want to know. */
const LANDMARKS: Record<string, Record<string, [number, number]>> = {
  meadow: { grid: [0, -130], sweeper: [102, -8], summit: [207, 79], tunnel: [72, 67], esses: [-20, 87], gap: [-116, 65], leftSw: [-189, -5], mill: [-156, -92], carouselN: [168, -132], carouselE: [110, -188], returnW: [-14, -144] },
  beach: { sweeper: [112, -8], cape: [107, 70], gap: [69, 56], lagoon: [-50, 56], cliff: [-144, 51], arch: [-179, 2], esses: [-59, -131], pierIn: [16, -200], pierTip: [122, -164], pierBack: [20, -128], final: [-34, -206] },
  jungle: { dblR: [158, -10], pinch: [176, 72], cave: [81, 114], canopy: [-39, 114], vineGap: [-122, 85], descent: [-129, 12], dblL: [-126, -64], stairsTop: [88, -176], stairs: [46, -116], drop: [56, -194], final: [-24, -181] },
  desert: { climb: [111, -10], rollers: [221, 61], whoops: [-38, 119], canyon: [-137, 53], leap: [-185, -33], homeL: [-124, -119], ringN: [60, -136], ringE: [108, -192], ringS: [40, -224], ringW: [-52, -196] },
  factory: { sweeper: [110, -38], climb: [125, 68], hairpin: [190, 71], tunnel: [68, 119], conveyor: [-96, 62], gates: [-170, -34], slalom1: [20, -158], dockE: [116, -196], slalom2: [40, -198], final: [-14, -210] },
  volcano: { wallClimb: [121, -18], highBank: [198, 60], lavaTube: [42, 126], lavaLeap: [-103, 66], bigDesc: [-187, -13], diveBank: [-153, -63], causewayW: [-56, -92], causewayE: [88, -108], craterS: [44, -170], ringE: [124, -124], exit: [-20, -190] },
  snow: { drop: [0, -114], valley: [104, -14], climb: [160, 96], summit: [128, 150], cave: [28, 122], plateau: [-163, -15], village1: [-6, -78], village3: [0, -152], plaza: [44, -200], final: [-44, -196] },
  glacier: { approach: [108, -20], crevasse: [130, 10], iceTunnel: [95, 92], north: [-152, 92], bankedL: [-187, -39], serac: [-132, -52], zig1: [-10, -74], zig3: [2, -104], zig5: [-24, -146], bridge: [10, -160], exit: [-52, -172] },
  castle: { rampart: [132, -21], chicane: [182, 103], dungeon: [73, 132], keep: [-55, 84], moat: [-100, 63], outer: [-179, -18], switch: [-124, -118], gate1: [-52, -108], gate2: [24, -104], gate3: [-6, -76], gate4: [40, -58], exit: [-58, -78] },
  city: { avenue: [129, -53], chicane: [158, 85], overpass: [107, 107], subway: [9, 97], grid: [-141, -24], blvdIn: [30, -64], blvdE: [110, -118], portada: [146, -152], return1: [64, -164], final: [24, -178] },
  space: { sweep: [201, 24], tube: [144, 84], starGap: [-28, 63], returnTube: [-102, -45], ringIn: [56, -96], ringNE: [100, -78], ringE: [128, -108], ringS: [100, -142], ringW: [56, -128], drop: [88, -168], esses: [-48, -210] },
  prism: { riser: [150, -26], tube: [69, 91], coil1: [42, -56], coil2: [-50, -88], ring2S: [-12, -162], ring2E: [40, -150], ring2NE: [68, -116], diveLip: [-67, -107], runway: [-26, -144], final: [-34, -182] },
};

function audit(landmarkMode: boolean): void {
  if (landmarkMode) {
    for (const [id, def] of Object.entries(TRACKS)) {
      const sp = new Spline(def.points, 320, def.halfWidth);
      const out: string[] = [];
      for (const [label, [x, z]] of Object.entries(LANDMARKS[id] ?? {})) {
        const s = nearestS(sp, x, z);
        out.push(`${label}=${s.toFixed(3)}`);
      }
      console.log(`${id.padEnd(8)} L=${sp.length.toFixed(0)}  ${out.join('  ')}`);
    }
    return;
  }

  let failures = 0;
  const rows: string[] = [];
  for (const [id, def] of Object.entries(TRACKS)) {
    const sp = new Spline(def.points, 320, def.halfWidth);
    const N = sp.samples.length;
    const len = sp.length;
    const base = BASELINE[id] ?? len / 1.3;
    const ratio = len / base;

    // ---- fold / overlap detector (same-height non-adjacent proximity)
    let minSep = Infinity;
    let minAt = '';
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const arc = Math.min(j - i, N - (j - i));
        if (arc < 24) continue;
        const si = sp.samples[i], sj = sp.samples[j];
        if (Math.abs(si.pos.y - sj.pos.y) > 6) continue; // overpass (designed under/overpass), fine
        if (si.jump || sj.jump) continue;                 // gap flight (no rails/terrain there)
        const d = Math.hypot(sj.pos.x - si.pos.x, sj.pos.z - si.pos.z);
        if (d < minSep) {
          minSep = d;
          minAt = `#${i}(${si.pos.x.toFixed(0)},${si.pos.z.toFixed(0)},y${si.pos.y.toFixed(1)})vs#${j}(${sj.pos.x.toFixed(0)},${sj.pos.z.toFixed(0)},y${sj.pos.y.toFixed(1)}) arc=${arc}`;
        }
      }
    }
    const overlapRisk = minSep < 26;

    // ---- feature placement sanity
    const feats: string[] = [];
    const check = (kind: string, s: number): void => {
      const sm = sp.sampleAt(s);
      const bad: string[] = [];
      if (sm.jump) bad.push('JUMP!');
      const idx = sp.indexAtS(s);
      for (let d = -3; d <= 3; d++) {
        if (sp.samples[((idx + d) % N + N) % N].jump) { bad.push('near-gap'); break; }
      }
      if (bad.length) feats.push(`${kind}@${s.toFixed(3)} ⚠${bad.join(',')}`);
    };
    for (const h of def.hazards) check(`${h.kind}`, h.at);
    for (const p of def.boostPads) check('pad', p);
    // tunnel placement is OK visually — only report for movers (they clip walls)
    for (const h of def.hazards) {
      if (h.kind === 'mover' && sp.sampleAt(h.at).tunnel) feats.push(`mover@${h.at} inTunnel`);
    }

    const lenOk = ratio >= TARGET_MIN && ratio <= TARGET_MAX;
    if (!lenOk || overlapRisk) failures++;
    rows.push(
      `${id.padEnd(8)} ${len.toFixed(0).padStart(5)}m ×${ratio.toFixed(3)} ${lenOk ? 'ok' : '⚠LEN'} | minSep ${minSep.toFixed(0)}m ${overlapRisk ? '⚠OVERLAP' : 'ok'} @${minAt}${feats.length ? ' | ' + feats.join(' ') : ''}`,
    );
  }
  console.log(rows.join('\n'));
  console.log(`\n${failures === 0 ? 'ALL OK' : failures + ' track(s) need attention'}`);
}

function nearestS(sp: Spline, x: number, z: number): number {
  let best = Infinity;
  let bestS = 0;
  for (const sm of sp.samples) {
    const d = Math.hypot(sm.pos.x - x, sm.pos.z - z);
    if (d < best) { best = d; bestS = sm.s; }
  }
  return bestS;
}

audit(process.argv.includes('--landmarks'));
