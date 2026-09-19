/**
 * APEX KART — The 12 original circuits, 4 cups and 3 battle arenas.
 * Authoring format: control point tuples
 *   [x, y, z, bank?, width?, jump?, tunnel?]
 * converted to TrackControlPoint. Progress-based fields (shortcuts, hazards,
 * boost pads) use normalized 0..1 track progress.
 *
 * v4 RE-AUTHORING — every circuit is ~30% longer and carries a SIGNATURE
 * section no other track has (audited with scripts/track_audit.ts):
 *   meadow  — Carrusel del Molino: full far-east carousel + diagonal return
 *   beach   — Muelle del Faro: narrow pier out over the bay + buoy chicane
 *   jungle  — Escalera del Templo: climbing staircase zigzag + temple plaza
 *   desert  — Carrusel del Cráter: 270° ring around the crater + whoops
 *   factory — Nave de Ensamblaje: warehouse slalom + loading-dock tunnel
 *   volcano — Calzada de Lava: narrow causeway across the caldera + SE ring
 *   snow    — Pueblo Nevada: chalet slalom + frozen-lake hook + plaza flick
 *   glacier — Zigzag de las Grietas: narrow crevasse weave + bridge LEAP
 *   castle  — Patio del Bastión: ramparts bridge OVER the start straight
 *   city    — Bulevar Elevado: elevated banked avenue + metro tunnel
 *   space   — Anillo Solar: deep-space S + solar ring hook
 *   prism   — Doble Espiral: a second neon coil before THE DIVE
 *
 * Design language (Mario-Kart-scale):
 *  - ~1500-1600 m per lap => ~75 s at 100cc
 *  - 25-35 significant corners per lap, banked turns, one or two tunnels,
 *    one or two flyable gaps (jump pairs; engine bakes a 0.22-slope ramp)
 *  - boost pad on every gap approach; hazards placed clear of gaps/tunnels
 */

import { ArenaDef, CupDef, TrackControlPoint, TrackDef } from '../core/Types';

type Pt = [number, number, number, number?, number?, boolean?, boolean?];

const pts = (arr: Pt[]): TrackControlPoint[] =>
  arr.map(([x, y, z, bank, width, jump, tunnel]) => ({ x, y, z, bank, width, jump, tunnel }));

// ============================================================ COPA VERDE

const meadow: TrackDef = {
  id: 'meadow',
  name: 'Pradera Aurora',
  theme: 'meadow',
  laps: 3,
  halfWidth: 11.7,
  points: pts([
    [0, 0, -163.8], [0, 0, -112.6], [7.7, 0, -64.0],                 // grid straight
    [38.4, 1, -20.5, 0.12], [102.4, 3, -7.7], [161.3, 5, -2.6],      // banked right sweeper
    [209.9, 8, -7.7], [222.7, 11, 35.8],                             // the climb (east side)
    [207.4, 12, 79.4],                                        // summit hairpin (full width)
    [145.9, 10, 74.2],
    [117.8, 8, 56.3, 0, 0, false, true],                             // hill tunnel (descending)
    [71.7, 7, 66.6, 0, 0, false, true],
    [23.0, 6, 79.4], [-20.5, 4, 87.0], [-58.9, 3, 71.7],             // valley esses (dip)
    [-99.8, 4, 74.2],
    [-112.6, 4, 67.8, 0, 0, true], [-119.0, 2, 62.7, 0, 0, true],    // creek gap
    [-153.6, 3, 43.5], [-189.4, 3, -5.1, 0.12],                      // left sweeper
    [-194.6, 4, -58.9], [-156.2, 5, -92.2], [-115.2, 4, -79.4],      // windmill S
    // ---- SIGNATURE: Carrusel del Molino (deep south belt + far-east carousel) ----
    [-92.0, 4, -120.0], [-56.0, 4, -172.0],                          // south belt (under everything)
    [-44.0, 5, -220.0], [16.0, 6, -242.0], [84.0, 6, -224.0], [128.0, 6, -200.0], // the south sweep (deep)
    [162.0, 4, -152.0], [110.0, 4, -84.0],                           // the carousel (far east)
    [56.0, 2, -162.0], [20.0, 1, -198.0],                           // carousel return + final flick
    [-16.6, 0, -194.6],                                              // final bend onto straight
  ]),
  shortcuts: [
    { from: 0.23, to: 0.27, points: pts([[215.0, 11, 53.8], [186.9, 11, 66.6]]), rough: 0.72 },
    { from: 0.56, to: 0.60, points: pts([[-143.4, 4, -105.0], [-117.8, 4, -102.4]]), rough: 0.72 },
    { from: 0.80, to: 0.88, points: pts([[110.0, 4, -140.0], [70.0, 3, -120.0]]), rough: 0.75 }, // carousel cut
  ],
  hazards: [
    { kind: 'mover', at: 0.13, speed: 9, radius: 1.2, label: 'hay' },
    { kind: 'zone', at: 0.38, radius: 6, effect: 'grip', power: 0.7, label: 'mud' },
    { kind: 'mover', at: 0.72, speed: 9, radius: 1.2, label: 'hay' },
    { kind: 'mover', at: 0.83, speed: 9, radius: 1.2, phase: 0.5, label: 'hay' },
  ],
  boostPads: [0.03, 0.20, 0.42, 0.53, 0.62, 0.90],
  aiSpeedScale: 0.97,
};

const beach: TrackDef = {
  id: 'beach',
  name: 'Bahía Atardecer',
  theme: 'beach',
  laps: 3,
  halfWidth: 11.1,
  points: pts([
    [0, 0, -176.9], [0, 0, -123.3], [10.7, 0, -72.4],
    [48.2, 1, -29.5, 0.10], [112.6, 3, -8.0], [160.8, 4, 21.4],      // shore sweeper
    [163.5, 5, 72.4], [107.2, 5, 69.7],                        // cape hairpin (pinch)
    [72.4, 4, 59.0, 0, 0, true], [65.7, 2, 53.6, 0, 0, true],        // inlet gap
    [29.5, 2, 40.2], [-10.7, 3, 18.8], [-50.9, 4, 56.3],             // lagoon chicane
    [-99.2, 6, 72.4], [-144.7, 6, 50.9, 0.12],                       // cliff climb
    [-179.6, 8, 2.7, 0, 0, false, true],                             // cliff arch tunnel
    [-158.1, 10, -45.6, 0, 0, false, true],
    [-117.9, 11, -83.1],
    [-69.7, 10, -101.8], [-37.5, 8, -88.4], [-59.0, 6, -131.3],      // downhill esses
    [-99.2, 4, -155.4],
    // ---- SIGNATURE: Muelle del Faro (pier over the bay + buoy chicane) ----
    [-64.0, 3, -170.0], [-52.0, 2, -208.0], [-32.0, 2, -238.0],
    [16.0, 1.5, -246.0, 0, 9.5], [60.0, 1.5, -248.0, 0, 9.5],        // the pier (over the water)
    [98.0, 1.5, -232.0, 0, 11], [124.0, 2, -178.0, 0, 12],          // lighthouse tip (plaza)
    [96.0, 2.5, -138.0, 0, 11], [60.0, 3, -150.0], [20.0, 1, -206.0], // buoy chicane (wide entry) (wide of the straight)
    [-16.0, 1, -212.0],                                              // final bend
  ]),
  shortcuts: [
    { from: 0.20, to: 0.24, points: pts([[150.1, 4, 42.9], [128.6, 5, 59.0]]), rough: 0.72 },
    { from: 0.60, to: 0.64, points: pts([[-45.6, 7, -104.5], [-56.3, 5, -139.4]]), rough: 0.72 },
    { from: 0.955, to: 0.015, points: pts([[60.0, 2, -200.0], [80.0, 2, -180.0]]), rough: 0.7 }, // pier cut
  ],
  hazards: [
    { kind: 'mover', at: 0.15, speed: 7, radius: 1.2, label: 'crab' },
    { kind: 'mover', at: 0.37, speed: 7, radius: 1.2, phase: 0.5, label: 'crab' },
    { kind: 'zone', at: 0.50, radius: 8, effect: 'grip', power: 0.65, label: 'wet' },
    { kind: 'mover', at: 0.88, speed: 7, radius: 1.2, phase: 0.25, label: 'crab' },   // on the pier
  ],
  boostPads: [0.04, 0.26, 0.45, 0.63, 0.93],
  aiSpeedScale: 0.98,
};

const jungle: TrackDef = {
  id: 'jungle',
  name: 'Templo de Lianas',
  theme: 'jungle',
  laps: 3,
  halfWidth: 10.4,
  points: pts([
    [0, 0, -156.2], [0, 0, -109.1], [12.4, 1, -64.5],
    [59.5, 2, -34.7, 0.10], [119.0, 4, -44.6], [158.7, 6, -9.9],     // double right
    [138.9, 8, 34.7], [176.1, 10, 71.9],                       // chicane pinch
    [129.0, 12, 101.7, 0, 0, false, true],                           // temple cave climb
    [81.8, 14, 114.1, 0, 0, false, true],
    [34.7, 15, 106.6],
    [-7.4, 14, 91.8], [-39.7, 12, 114.1], [-84.3, 11, 106.6],        // canopy esses
    [-119.0, 10, 89.3, 0, 0, true], [-125.2, 8, 83.1, 0, 0, true],   // vine gap
    [-153.8, 8, 52.1], [-129.0, 6, 12.4],                            // descent sweeper
    [-163.7, 5, -27.3, 0.12], [-126.5, 4, -64.5],                    // double-apex left
    [-81.8, 3, -57.0], [-57.0, 2, -94.2],
    // ---- SIGNATURE: Escalera del Templo (deep south belt + plaza) ----
    [-72.0, 3, -124.0], [-56.0, 4, -164.0], [-48.0, 5, -204.0],      // west approach (clear of the straight)
    [-32.0, 6, -244.0], [24.0, 7, -252.0], [84.0, 7, -240.0],        // the deep south belt (climbing)
    [128.0, 7, -214.0], [96.0, 7, -192.0],                           // the stairs (high plaza)
    [44.0, 5, -198.0],
    [-16.0, 2, -212.0],                                              // jungle drop
    [7.4, 0, -191.0],                                                // final bend
  ]),
  shortcuts: [
    { from: 0.37, to: 0.41, points: pts([[-34.7, 13, 99.2], [-64.5, 12, 104.2]]), rough: 0.72 },
    { from: 0.56, to: 0.59, points: pts([[-109.1, 4, -42.2], [-86.8, 3, -54.6]]), rough: 0.72 },
    { from: 0.86, to: 0.91, points: pts([[92.0, 6, -196.0], [60.0, 5, -200.0]]), rough: 0.68 }, // plaza cut
  ],
  hazards: [
    { kind: 'mover', at: 0.18, speed: 11, radius: 1.4, label: 'log' },
    { kind: 'zone', at: 0.40, radius: 9, effect: 'grip', power: 0.6, label: 'mud' },
    { kind: 'mover', at: 0.55, speed: 11, radius: 1.4, phase: 0.5, label: 'log' },
    { kind: 'mover', at: 0.80, speed: 9, radius: 1.3, phase: 0.3, label: 'log' },    // on the belt
  ],
  boostPads: [0.05, 0.28, 0.43, 0.62, 0.85],
  aiSpeedScale: 0.96,
};

// ============================================================ COPA ÁMBAR

const desert: TrackDef = {
  id: 'desert',
  name: 'Rally Duna Ígnea',
  theme: 'desert',
  laps: 3,
  halfWidth: 12.3,
  points: pts([
    [0, 0, -172.7], [0, 0, -121.9], [0, 0, -73.7],                   // flat-out straight
    [40.6, 1, -30.5, 0.12], [111.8, 3, -10.2], [177.8, 6, 12.7],     // banked climb right
    [221.0, 9, 61.0], [182.9, 7, 104.1], [124.5, 9, 121.9],          // dune rollers
    [63.5, 7, 111.8], [15.2, 9, 132.1], [-38.1, 11, 119.4],          // whoops up-down
    [-91.4, 12, 86.4, 0, 0, false, true],                            // slot canyon tunnel
    [-137.2, 12, 53.3, 0, 0, false, true],
    [-165.1, 11, 10.2],
    [-182.9, 10, -30.5, 0, 0, true], [-188.0, 8, -35.6, 0, 0, true], // dune leap
    [-177.8, 8, -78.7], [-124.5, 6, -119.4], [-68.6, 4, -157.5],     // big left home
    // ---- SIGNATURE: Carrusel del Cráter (south belt ring + whoops exit) ----
    [-52.0, 5, -184.0], [-28.0, 6, -212.0],                          // ring entry (SW)
    [24.0, 6, -230.0], [76.0, 6, -234.0], [128.0, 6, -222.0],        // the ring (crater rim)
    [140.0, 4, -186.0], [108.0, 3, -160.0],                          // ring north (whoops)
    [50.0, 3, -180.0],
    [10.2, 0, -185.4],                                               // final kink
  ]),
  shortcuts: [
    { from: 0.21, to: 0.27, points: pts([[193.0, 7, 40.6], [188.0, 7, 78.7]]), rough: 0.68 },
    { from: 0.63, to: 0.66, points: pts([[-152.4, 6, -88.9], [-124.5, 5, -111.8]]), rough: 0.70 },
    { from: 0.78, to: 0.96, points: pts([[76.0, 5, -224.0], [64.0, 4, -204.0]]), rough: 0.66 }, // crater interior
  ],
  hazards: [
    { kind: 'zone', at: 0.10, radius: 10, effect: 'slow', power: 0.75, label: 'dust' },
    { kind: 'mover', at: 0.25, speed: 12, radius: 1.5, label: 'tumble' },
    { kind: 'mover', at: 0.62, speed: 12, radius: 1.5, phase: 0.5, label: 'tumble' },
    { kind: 'mover', at: 0.85, speed: 12, radius: 1.5, phase: 0.25, label: 'tumble' }, // on the ring
  ],
  boostPads: [0.04, 0.22, 0.44, 0.56, 0.71, 0.93],
  aiSpeedScale: 1.0,
};

const factory: TrackDef = {
  id: 'factory',
  name: 'Línea Retro',
  theme: 'factory',
  laps: 3,
  halfWidth: 11.1,
  points: pts([
    [0, 0, -181.8], [0, 0, -130.6], [11.4, 0, -82.4],
    [59.6, 1, -48.3], [110.0, 2, -38.0], [116.0, 3, 8.0],          // wide right sweeper
    [88.0, 4, 62.5], [125.0, 6, 68.2],                               // climb NE
    [190.3, 8, 71.0],                                         // top hairpin (full width)
    [130.6, 8, 122.1],
    [68.2, 8, 119.3, 0, 0, false, true],                             // plant tunnel (north)
    [5.7, 8, 102.2, 0, 0, false, true],
    [-59.6, 8, 73.8],
    [-96.6, 8, 62.5], [-103.7, 6.5, 56.8],                          // conveyor pass (solid)
    [-142.0, 5, 25.6], [-170.4, 4, -34.1, 0.12],                     // NW descent + gates
    [-130.6, 3, -76.7], [-82.4, 2, -102.2],
    // ---- SIGNATURE: Nave de Ensamblaje (warehouse slalom + dock tunnel) ----
    [-56.0, 3, -124.0], [-28.0, 4, -152.0], [-64.0, 4, -180.0],      // slalom gates (SW)
    [-72.0, 4, -224.0], [-44.0, 4, -264.0],                          // deep gate + south belt
    [24.0, 4, -268.0], [80.0, 4, -258.0],                            // assembly bay (E)
    [112.0, 4, -240.0, 0, 0, false, true], [78.0, 4, -214.0, 0, 0, false, true], // loading dock
    [36.0, 4, -202.0], [4.0, 3, -234.0], [-14.0, 2, -240.0],         // dock exit + S dip
    [-14.2, 0, -210.2],                                              // final bend
  ]),
  shortcuts: [
    { from: 0.79, to: 0.90, points: pts([[66.0, 4, -232.0], [52.0, 4, -218.0]]), rough: 0.72 }, // dock cut
  ],
  hazards: [
    { kind: 'mover', at: 0.14, speed: 10, radius: 1.8, label: 'press' },
    { kind: 'zone', at: 0.47, radius: 12, effect: 'boost', power: 1.35, label: 'belt' },
    { kind: 'mover', at: 0.64, speed: 10, radius: 1.8, phase: 0.5, label: 'press' },
    { kind: 'mover', at: 0.85, speed: 10, radius: 1.8, phase: 0.25, label: 'press' }, // at the dock
  ],
  boostPads: [0.04, 0.27, 0.37, 0.55, 0.74, 0.95],
  aiSpeedScale: 0.99,
};

const volcano: TrackDef = {
  id: 'volcano',
  name: 'Cráter Fundido',
  theme: 'volcano',
  laps: 3,
  halfWidth: 11.1,
  points: pts([
    [0, 0, -176.9], [0, 0, -126.7], [13.2, 2, -76.6],
    [60.7, 4, -39.6, 0.10], [121.4, 8, -18.5],                       // crater wall climb
    [171.6, 12, 13.2], [198.0, 16, 60.7, 0.14],                      // high banked right
    [163.7, 19, 105.6], [97.7, 21, 121.4],
    [42.2, 23, 126.7, 0, 0, false, true],                            // lava tube at the rim
    [-13.2, 24, 110.9, 0, 0, false, true],
    [-63.4, 24, 84.5],
    [-100.3, 23, 68.6, 0, 0, true], [-105.6, 21, 63.4, 0, 0, true],  // lava leap
    [-145.2, 19, 34.3], [-187.4, 15, -13.2],                         // the big descent
    [-153.1, 11, -63.4, 0.12], [-97.7, 8, -79.2],                    // dive-bank left
    // ---- SIGNATURE: Calzada de Lava (HIGH bridge over the start + SE ring) ----
    [-52.0, 11, -96.0, 0, 9], [-8.0, 13, -106.0, 0, 9],              // the lava bridge (over the straight!)
    [40.0, 10, -98.0, 0, 9], [88.0, 8, -108.0, 0, 9],                // across the caldera mouth
    [136.0, 7, -132.0], [170.0, 6, -158.0],                          // SE ring (climb out)
    [124.0, 5, -180.0], [76.0, 4, -190.0],
    [36.0, 3, -222.0], [-32.0, 3, -228.0],                           // ember field hairpin (clear south)
    [5.3, 0, -203.3],                                                // final bend
  ]),
  shortcuts: [
    { from: 0.22, to: 0.26, points: pts([[179.5, 15, 81.8], [163.7, 17, 103.0]]), rough: 0.62 },
    { from: 0.75, to: 0.94, points: pts([[100.0, 6, -170.0], [50.0, 5, -190.0]]), rough: 0.62 }, // crater interior
  ],
  hazards: [
    { kind: 'faller', at: 0.23, period: 3.2, radius: 1.7, label: 'lavarock' },
    { kind: 'zone', at: 0.35, radius: 9, effect: 'slow', power: 0.7, label: 'lava' },
    { kind: 'zone', at: 0.69, radius: 10, effect: 'slow', power: 0.72, label: 'lava' },  // on the lava bridge
    { kind: 'faller', at: 0.80, period: 3.8, phase: 1.2, radius: 1.7, label: 'lavarock' },
    { kind: 'faller', at: 0.90, period: 3.5, phase: 2.1, radius: 1.7, label: 'lavarock' },
  ],
  boostPads: [0.05, 0.25, 0.43, 0.62, 0.78, 0.93],
  aiSpeedScale: 0.98,
};

// ============================================================ COPA ESCARCHA

const snow: TrackDef = {
  id: 'snow',
  name: 'Pico Escarcha',
  theme: 'snow',
  laps: 3,
  halfWidth: 11.7,
  points: pts([
    [0, 8, -163.8], [0, 6, -114.4], [13.0, 4, -67.6],                // village drop
    [57.2, 2, -28.6, 0.10], [104.0, 1, -14.0],                       // valley floor straight
    [124.0, 1, 4.0], [134.0, 1, 14.0],                               // frozen creek (solid, FLAT)
    [146.0, 1, 26.0], [158.0, 1, 42.0],                              // straight run-out
    [168.0, 2, 66.0], [160.0, 5, 96.0],                              // wide gentle climb
    [157.0, 7, 110.0],
    [154.0, 8, 134.0], [150.0, 9, 148.0],                            // to the summit
    [128.0, 9, 150.0],                                               // summit hairpin left
    [112.0, 8, 124.0], [70.0, 10, 102.0],                            // return leg SSW
    [28.6, 12, 122.2, 0, 0, false, true],                            // ice cave through pass
    [-26.0, 14, 101.4, 0, 0, false, true],
    [-75.4, 15, 65.0],
    [-119.6, 14, 31.2], [-163.8, 12, -15.6],                         // plateau sweeper
    [-130.0, 10, -62.4], [-78.0, 8, -80.6],                          // descent switchback
    [-41.6, 7, -59.8],
    // ---- SIGNATURE: Pueblo Nevada (chalet slalom + frozen lake hook) ----
    [-24.0, 7, -84.0], [-60.0, 6, -108.0], [-28.0, 6, -130.0],       // chalet gates
    [-72.0, 5, -154.0], [-32.0, 5, -178.0],                          // deeper gates
    [-76.0, 5, -202.0], [-120.0, 4, -236.0],                         // onto the frozen lake
    [-72.0, 4, -248.0], [-28.0, 5, -252.0], [28.0, 6, -238.0],       // lake hook + plaza flick
    [7.8, 7, -197.6],                                                // final bend
  ]),
  shortcuts: [
    { from: 0.72, to: 0.79, points: pts([[-50.0, 5, -155.0], [-44.0, 5, -170.0]]), rough: 0.72 }, // between chalets
  ],
  hazards: [
    { kind: 'mover', at: 0.10, speed: 14, radius: 1.8, label: 'snowball' },
    { kind: 'zone', at: 0.30, radius: 10, effect: 'grip', power: 0.55, label: 'ice' },
    { kind: 'mover', at: 0.45, speed: 14, radius: 1.8, phase: 0.4, label: 'snowball' },
    { kind: 'mover', at: 0.72, speed: 14, radius: 1.8, phase: 0.7, label: 'snowball' }, // in the village
    { kind: 'zone', at: 0.88, radius: 10, effect: 'grip', power: 0.6, label: 'ice' },  // frozen lake
  ],
  boostPads: [0.04, 0.40, 0.58, 0.85, 0.95],
  aiSpeedScale: 0.98,
};

const glacier: TrackDef = {
  id: 'glacier',
  name: 'Grieta Glaciar',
  theme: 'glacier',
  laps: 3,
  halfWidth: 10.4,
  points: pts([
    [0, 0, -171.6], [0, 0, -121.4], [13.2, 2, -71.3],
    [63.4, 4, -37.0, 0.12], [108.0, 6, -20.0],                        // banked approach straight
    [124.0, 6.5, 3.0], [130.0, 5.5, 10.0],                           // crevasse ford (solid)
    [142.0, 4, 28.0], [152.0, 4, 50.0],                              // straight run
    [140.0, 5, 74.0],
    [95.0, 6, 92.4, 0, 0, false, true],                              // blue ice tunnel
    [39.6, 8, 110.9, 0, 0, false, true],
    [-18.5, 10, 105.6, 0, 13],
    [-71.3, 11, 81.8], [-121.4, 12, 89.8],                            // north straight
    [-152.0, 12, 92.0], [-158.0, 11, 87.0, 0.15],                     // north straight (banked 90 deg)
    [-163.7, 8, 15.8], [-187.4, 7, -39.6, 0.12],                     // banked icy left
    // ---- SIGNATURE: Zigzag de las Grietas (seracs + narrow weave + LEAP) ----
    [-178.0, 6, -74.0], [-144.0, 5, -58.0], [-124.0, 4, -104.0],     // serac field approach
    [-60.0, 4, -102.0],
    [-40.0, 4, -113.0, 0, 7], [-86.0, 4, -158.0, 0, 7],               // the grietas (93-degree weave)
    [-40.0, 4, -203.0, 0, 7], [-86.0, 4, -248.0, 0, 7],
    [-114.0, 3, -268.0, 0, 8], [-124.0, 1, -278.0, 0, 8],             // the ice bridge (solid, narrow)
    [-76.0, 1, -288.0], [-16.0, 1, -266.0],                           // ice run-out
    [7.9, 0, -203.3],                                                // final bend
  ]),
  shortcuts: [
    { from: 0.66, to: 0.79, points: pts([[-66.0, 4, -150.0], [-60.0, 4, -180.0]]), rough: 0.7 }, // through the grietas
  ],
  hazards: [
    { kind: 'zone', at: 0.07, radius: 10, effect: 'grip', power: 0.45, label: 'ice' },
    { kind: 'faller', at: 0.27, period: 3.0, radius: 1.3, label: 'icicle' },
    { kind: 'zone', at: 0.34, radius: 12, effect: 'grip', power: 0.5, label: 'ice' },
    { kind: 'faller', at: 0.55, period: 3.4, phase: 1.5, radius: 1.3, label: 'icicle' },
    { kind: 'mover', at: 0.72, speed: 10, radius: 1.3, label: 'icechunk' },          // in the zigzag
  ],
  boostPads: [0.04, 0.25, 0.55, 0.90],
  aiSpeedScale: 0.85,
};

const castle: TrackDef = {
  id: 'castle',
  name: 'Bastión Real',
  theme: 'castle',
  laps: 3,
  halfWidth: 11.1,
  points: pts([
    [0, 0, -171.6], [0, 0, -121.4], [15.8, 0, -71.3],
    [68.6, 2, -39.6, 0.10], [132.0, 4, -21.1], [174.2, 6, 18.5],     // rampart climb
    [145.2, 8, 66.0], [182.2, 10, 103.0],                      // courtyard chicane
    [132.0, 12, 126.7, 0, 0, false, true],                           // dungeon tunnel
    [73.9, 13, 132.0, 0, 0, false, true],
    [13.2, 12, 116.2],
    [-55.4, 11, 84.5],                                               // keep descent
    [-95.0, 10, 66.0, 0, 0, true], [-100.3, 7.5, 60.7, 0, 0, true],  // moat gap
    [-139.9, 8, 29.0], [-179.5, 6, -18.5],                           // outer wall sweeper
    [-142.6, 4, -63.4, 0.12], [-87.1, 3, -79.2], [-124.1, 2, -118.8], // switchback
    // ---- SIGNATURE: Patio del Bastión (ramparts bridge over the start!) ----
    [-112.0, 3, -148.0], [-60.0, 4, -170.0],                         // the bailey (clear of the ramparts)
    [-84.0, 6, -192.0], [-48.0, 8, -204.0],                          // ramparts climb (S hook)
    [-4.0, 10, -172.0], [32.0, 10, -136.0],                          // THE BRIDGE over the straight
    [52.0, 9, -118.0],                                               // ward gate (descending)
    [64.0, 7, -146.0], [44.0, 6, -196.0], [24.0, 5, -226.0],         // inner yard (S dip)
    [-12.0, 4, -240.0],                                              // yard S approach
    [5.3, 0, -203.3],                                                // final bend
  ]),
  shortcuts: [
    { from: 0.24, to: 0.28, points: pts([[147.8, 9, 81.8], [132.0, 10, 110.9]]), rough: 0.70 },
    { from: 0.63, to: 0.67, points: pts([[-121.4, 3, -79.2], [-108.2, 3, -108.2]]), rough: 0.62 },
    { from: 0.76, to: 0.82, points: pts([[10.0, 5, -220.0]]), rough: 0.68 }, // yard cut
  ],
  hazards: [
    { kind: 'mover', at: 0.15, speed: 9, radius: 1.7, label: 'knight' },
    { kind: 'mover', at: 0.43, speed: 8, radius: 1.7, label: 'knight' },
    { kind: 'mover', at: 0.64, speed: 9, radius: 1.7, phase: 0.5, label: 'knight' },
    { kind: 'mover', at: 0.76, speed: 9, radius: 1.7, phase: 0.25, label: 'knight' }, // in the yard
  ],
  boostPads: [0.05, 0.27, 0.44, 0.70, 0.88, 0.96],
  aiSpeedScale: 0.97,
};

// ============================================================ COPA CÓSMICA

const city: TrackDef = {
  id: 'city',
  name: 'Centro Neón',
  theme: 'city',
  laps: 3,
  halfWidth: 11.7,
  points: pts([
    [0, 0, -158.6], [0, 0, -114.7], [12.2, 1, -70.8],
    [58.6, 2, -48.8], [129.3, 4, -53.7], [153.7, 6, -2.4],           // avenue rights
    [124.4, 7, 43.9], [158.6, 9, 85.4],                        // block chicane
    [107.4, 10, 107.4, 0, 0, true], [102.5, 7.5, 102.5, 0, 0, true], // overpass gap
    [58.6, 8, 107.4],
    [9.8, 7, 97.6, 0, 0, false, true],                               // subway tube
    [-34.2, 6, 63.4, 0, 0, false, true],
    [-78.1, 5, 41.5],
    [-119.6, 4, 56.1], [-102.5, 3, 14.6], [-141.5, 3, -24.4],        // grid turns
    [-102.5, 2, -53.7], [-63.4, 2, -36.6],
    // ---- SIGNATURE: Cinturón Neón (SW slalom + south belt + metro) ----
    [-72.0, 3, -72.0], [-48.0, 4, -108.0], [-84.0, 5, -144.0],       // neon slalom (SW)
    [-48.0, 5, -176.0],
    [-104.0, 5, -204.0], [-64.0, 5, -224.0], [-16.0, 5, -232.0],     // south belt
    [32.0, 5, -226.0],
    [76.0, 6, -238.0], [120.0, 6, -222.0, 0, 0, false, true],        // metro neón (in)
    [84.0, 6, -200.0, 0, 0, false, true],                            // metro neón (out)
    [44.0, 5, -192.0],
    [8.0, 3, -190.0],                                                // final bend
  ]),
  shortcuts: [
    { from: 0.12, to: 0.17, points: pts([[136.6, 5, -24.4], [124.4, 6, 26.8]]), rough: 0.75 },
    { from: 0.70, to: 0.88, points: pts([[60.0, 5, -210.0], [52.0, 5, -198.0]]), rough: 0.75 }, // metro cut
  ],
  hazards: [
    { kind: 'mover', at: 0.15, speed: 15, radius: 2.0, label: 'traffic' },
    { kind: 'mover', at: 0.33, speed: 15, radius: 2.0, phase: 0.5, label: 'traffic' },
    { kind: 'mover', at: 0.45, speed: 15, radius: 2.0, phase: 0.25, label: 'traffic' },
    { kind: 'mover', at: 0.68, speed: 15, radius: 2.0, phase: 0.7, label: 'traffic' }, // on the south belt
    { kind: 'mover', at: 0.90, speed: 15, radius: 2.0, phase: 0.3, label: 'traffic' }, // neon return
  ],
  boostPads: [0.04, 0.20, 0.36, 0.55, 0.68, 0.92],
  aiSpeedScale: 1.0,
};

const space: TrackDef = {
  id: 'space',
  name: 'Estación Orbital',
  theme: 'space',
  laps: 3,
  halfWidth: 9.8,
  points: pts([
    [0, 12, -192.0], [0, 12, -138.0], [15.0, 13, -84.0],
    [78.0, 15, -48.0, 0.10], [153.0, 17, -24.0], [201.0, 19, 24.0],  // approach sweep
    [144.0, 20, 84.0, 0, 0, false, true],                            // station tube
    [81.0, 21, 105.0, 0, 0, false, true],
    [21.0, 22, 93.0],
    [-24.0, 22, 69.0, 0, 0, true], [-28.5, 20.5, 63.0, 0, 0, true],  // star gap
    [-78.0, 20, 42.0],
    [-132.0, 19, 9.0, 0, 0, false, true],                            // return tube
    [-102.0, 18, -45.0, 0, 0, false, true],
    [-48.0, 17, -69.0],
    // ---- SIGNATURE: Anillo Solar (high solar bridge + ring hook) ----
    [-52.0, 22, -100.0], [44.0, 22, -120.0],                         // the solar bridge (over the start!)
    [92.0, 16, -144.0], [124.0, 15, -164.0], [156.0, 14, -190.0],    // solar dive + ring approach
    [176.0, 13, -218.0], [184.0, 12, -252.0], [140.0, 12, -272.0],   // the solar ring
    [76.0, 13, -262.0], [18.0, 13, -244.0],
    [-18.0, 12, -230.0],                                             // final esses (new)
  ]),
  shortcuts: [
    { from: 0.22, to: 0.26, points: pts([[174.0, 18, 30.0], [159.0, 19, 66.0]]), rough: 0.70 },
    { from: 0.70, to: 0.80, points: pts([[120.0, 13, -235.0], [100.0, 13, -250.0]]), rough: 0.68 }, // ring cut
  ],
  hazards: [
    { kind: 'mover', at: 0.13, speed: 10, radius: 1.9, label: 'asteroid' },
    { kind: 'mover', at: 0.33, speed: 10, radius: 1.9, phase: 0.5, label: 'asteroid' },
    { kind: 'mover', at: 0.50, speed: 12, radius: 1.9, phase: 0.25, label: 'asteroid' },
    { kind: 'mover', at: 0.75, speed: 10, radius: 1.9, phase: 0.7, label: 'asteroid' }, // in the ring
  ],
  boostPads: [0.06, 0.30, 0.40, 0.63, 0.78, 0.95],
  aiSpeedScale: 0.99,
};

/** Final track: the prism coil — rising neon tube, double spiral and one
 *  huge dive-jump back down to the finish straight. */
const prism: TrackDef = {
  id: 'prism',
  name: 'Final Prisma',
  theme: 'prism',
  laps: 3,
  halfWidth: 10.4,
  points: pts([
    [0, 0, -184.9], [0, 0, -131.3], [13.4, 2, -80.4],
    [72.4, 5, -48.2, 0.10], [150.1, 8, -26.8], [187.6, 11, 24.1],    // rising sweeper
    [136.7, 14, 67.0],
    [69.7, 17, 91.1, 0, 0, false, true],                             // neon tube (rising)
    [8.0, 19, 80.4, 0, 0, false, true],
    [-59.0, 21, 48.2],
    [-123.3, 23, 8.0], [-85.8, 25, -40.2], [-24.1, 26, -26.8],       // the coil
    [42.9, 27, -56.3], [-2.7, 28, -77.7], [-50.9, 28, -88.4],
    // ---- SIGNATURE: Doble Espiral (second neon coil before THE DIVE) ----
    [-88.0, 29, -116.0], [-64.0, 30, -148.0], [-12.0, 31, -162.0],   // second coil (west, higher)
    [40.0, 30, -150.0], [68.0, 26, -116.0], [36.0, 22, -98.0],       // coil (east, high)
    [-20.0, 15, -96.0],                                              // dive S-bend (staggers + slows the pack)
    [-67.0, 16, -107.2, 0, 0, true], [-88.0, 8, -116.0, 0, 0, true],  // THE DIVE (22.8m, lands at 18-26 m/s)
    [-52.0, 2, -156.0], [-28.0, 0, -196.0], [-12.0, 0, -204.0],      // run-out + final bend
  ]),
  shortcuts: [],
  hazards: [
    { kind: 'mover', at: 0.20, speed: 12, radius: 2.0, label: 'prism' },
    { kind: 'mover', at: 0.55, speed: 12, radius: 2.0, phase: 0.5, label: 'prism' },
    { kind: 'mover', at: 0.76, speed: 12, radius: 2.0, phase: 0.25, label: 'prism' }, // in coil 2
  ],
  boostPads: [0.04, 0.30, 0.55, 0.80],
  aiSpeedScale: 0.95,
};

// ---------------------------------------------------------------- registry

export const TRACKS: Record<string, TrackDef> = {
  meadow, beach, jungle, desert, factory, volcano,
  snow, glacier, castle, city, space, prism,
};

export const CUPS: CupDef[] = [
  { id: 'copa_verde',    name: 'Copa Verde',    tracks: ['meadow', 'beach', 'jungle'] },
  { id: 'copa_ambar',    name: 'Copa Ámbar',    tracks: ['desert', 'factory', 'volcano'], unlockAfter: 'copa_verde' },
  { id: 'copa_escarcha', name: 'Copa Escarcha', tracks: ['snow', 'glacier', 'castle'], unlockAfter: 'copa_ambar' },
  { id: 'copa_cosmica',  name: 'Copa Cósmica',  tracks: ['city', 'space', 'prism'], unlockAfter: 'copa_escarcha' },
];

// ---------------------------------------------------------------- arenas

export const ARENAS: Record<string, ArenaDef> = {
  arena_meadow: {
    id: 'arena_meadow', name: 'Coliseo Pradera', theme: 'meadow', radius: 42,
    obstacles: [
      { x: 0, z: 0, r: 4, h: 6, kind: 'fountain' },
      { x: 22, z: 8, r: 2.2, h: 3, kind: 'hedge' },
      { x: -22, z: 8, r: 2.2, h: 3, kind: 'hedge' },
      { x: 14, z: -18, r: 2.2, h: 3, kind: 'hedge' },
      { x: -14, z: -18, r: 2.2, h: 3, kind: 'hedge' },
      { x: 0, z: 24, r: 2.6, h: 2, kind: 'pillar' },
      { x: 0, z: -24, r: 2.6, h: 2, kind: 'pillar' },
    ],
  },
  arena_factory: {
    id: 'arena_factory', name: 'Planta Retro', theme: 'factory', radius: 38,
    obstacles: [
      { x: 0, z: 0, r: 5, h: 4, kind: 'machine' },
      { x: 18, z: 12, r: 2, h: 2.4, kind: 'crate' },
      { x: -18, z: 12, r: 2, h: 2.4, kind: 'crate' },
      { x: 18, z: -12, r: 2, h: 2.4, kind: 'crate' },
      { x: -18, z: -12, r: 2, h: 2.4, kind: 'crate' },
      { x: 0, z: 20, r: 3, h: 1.2, kind: 'belt' },
      { x: 0, z: -20, r: 3, h: 1.2, kind: 'belt' },
    ],
  },
  arena_volcano: {
    id: 'arena_volcano', name: 'Cráter Menor', theme: 'volcano', radius: 36,
    obstacles: [
      { x: 0, z: 0, r: 4.5, h: 2, kind: 'lavapool' },
      { x: 16, z: 6, r: 2.4, h: 2.8, kind: 'rock' },
      { x: -16, z: 6, r: 2.4, h: 2.8, kind: 'rock' },
      { x: 10, z: -14, r: 2.4, h: 2.8, kind: 'rock' },
      { x: -10, z: -14, r: 2.4, h: 2.8, kind: 'rock' },
      { x: 0, z: 18, r: 2, h: 3.2, kind: 'vent' },
    ],
  },
};
