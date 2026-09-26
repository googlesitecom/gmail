/**
 * APEX GP — Circuit catalog. Three fictional layouts with real F1 bones:
 *
 *  - Velocità    (temperate): temple of speed — 1.1 km main straight,
 *                two chicanes, Lesmos, Ascari and a long Parabolica. Low wing.
 *  - Bahía       (coast):     semi-street harbor course — 90° corners,
 *                walls close, hairpin over the marina, slow chicane.
 *  - Alpino      (alpine):    technical mountain GP — elevation sweeps,
 *                esses, a uphill hairpin and a crest before the main straight.
 */

import type { CircuitDef } from '../core/Types';

export const CIRCUITS: CircuitDef[] = [
  {
    id: 'velocita',
    name: 'Autodromo Nazionale Velocità',
    country: 'ITA',
    laps: 5,
    halfWidth: 7.2,
    sectors: [0.27, 0.63],
    aiBasePace: 62,
    env: 'temperate',
    drsZones: [
      { detect: 0.955, start: 0.988, end: 0.026 },   // main straight
      { detect: 0.345, start: 0.375, end: 0.505 },   // Serraglio back straight
    ],
    points: [
      { x: 0, z: 130 },
      { x: 0, z: 225 },
      { x: 10, z: 272, sharp: 0.7, runoff: 'asphalt', runoffW: 24 },
      { x: 0, z: 318, sharp: 0.7, runoff: 'asphalt', runoffW: 24 },
      { x: 12, z: 364, sharp: 0.65 },
      { x: -8, z: 408 },
      { x: -56, z: 452 },
      { x: -118, z: 486 },
      { x: -150, z: 492, sharp: 0.8, runoff: 'asphalt', runoffW: 20 },
      { x: -158, z: 522, sharp: 0.8 },
      { x: -186, z: 548, sharp: 0.7 },
      { x: -212, z: 564, sharp: 0.8, runoff: 'asphalt', runoffW: 16 },
      { x: -252, z: 570, sharp: 0.75 },
      { x: -276, z: 542 },
      { x: -290, z: 508 },
      { x: -322, z: 494, sharp: 0.7, runoff: 'asphalt', runoffW: 14 },
      { x: -352, z: 502, sharp: 0.65 },
      { x: -362, z: 534 },
      { x: -398, z: 540 },
      { x: -478, z: 500 },
      { x: -552, z: 442 },
      { x: -606, z: 364 },
      { x: -636, z: 280 },
      { x: -672, z: 236, sharp: 0.8, runoff: 'asphalt', runoffW: 20 },
      { x: -690, z: 210, sharp: 0.75 },
      { x: -724, z: 196, sharp: 0.8 },
      { x: -754, z: 166, sharp: 0.7, runoff: 'asphalt', runoffW: 20 },
      { x: -742, z: 112 },
      { x: -700, z: 44 },
      { x: -634, z: -26 },
      { x: -548, z: -80 },
      { x: -452, z: -112 },
      { x: -352, z: -128, sharp: 0.6, runoff: 'asphalt', runoffW: 30 },
      { x: -248, z: -126, sharp: 0.55 },
      { x: -152, z: -104, sharp: 0.5 },
      { x: -84, z: -88 },
      { x: 0, z: -70 },
      { x: 0, z: -10 },
      { x: 0, z: 60 }
    
    ],
  },

  {
    id: 'bahia',
    name: 'Circuito de la Bahía',
    country: 'ESP',
    laps: 5,
    halfWidth: 6.4,
    sectors: [0.31, 0.68],
    aiBasePace: 54,
    env: 'coast',
    drsZones: [
      { detect: 0.93, start: 0.965, end: 0.024 },   // pit straight
      { detect: 0.44, start: 0.47, end: 0.55 },     // marina boardwalk
    ],
    points: [
      { x: 0, z: 70 },
      { x: 0, z: 150 },
      { x: 16, z: 186, sharp: 1, runoff: 'asphalt', runoffW: 9 },
      { x: 44, z: 196, sharp: 1 },
      { x: 78, z: 218 },
      { x: 104, z: 250, sharp: 0.7, runoff: 'asphalt', runoffW: 8 },
      { x: 100, z: 284, sharp: 0.7 },
      { x: 110, z: 306 },
      { x: 158, z: 348 },
      { x: 226, z: 372 },
      { x: 300, z: 376 },
      { x: 362, z: 356 },
      { x: 402, z: 322, sharp: 1, runoff: 'asphalt', runoffW: 8 },
      { x: 404, z: 282, sharp: 1 },
      { x: 370, z: 254, sharp: 1 },
      { x: 300, z: 238 },
      { x: 220, z: 232 },
      { x: 150, z: 226 },
      { x: 104, z: 200, sharp: 0.85, runoff: 'asphalt', runoffW: 7 },
      { x: 62, z: 150, sharp: 0.95, runoff: 'asphalt', runoffW: 7 },
      { x: 30, z: 104, sharp: 0.85 },
      { x: 26, z: 30 },
      { x: 22, z: -56 },
      { x: 14, z: -128 },
      { x: -14, z: -176, sharp: 0.8, runoff: 'asphalt', runoffW: 8 },
      { x: -44, z: -186, sharp: 0.75 },
      { x: -74, z: -162, sharp: 0.7 },
      { x: -96, z: -120 },
      { x: -88, z: -64, sharp: 0.6, runoff: 'asphalt', runoffW: 10 },
      { x: -60, z: -26, sharp: 0.5 },
      { x: -24, z: -8 },
      { x: 0, z: 8 },
      { x: 0, z: 38 }
    
    ],
  },

  {
    id: 'alpino',
    name: 'Gran Premio Alpino',
    country: 'AUT',
    laps: 5,
    halfWidth: 6.8,
    sectors: [0.33, 0.67],
    aiBasePace: 56,
    env: 'alpine',
    drsZones: [
      { detect: 0.925, start: 0.958, end: 0.030 },   // valley straight
    ],
    points: [
      { x: 0, z: 56, y: 1.5 },
      { x: 0, z: 130, y: 4 },
      { x: 18, z: 170, y: 7, sharp: 0.85, runoff: 'asphalt', runoffW: 14 },
      { x: 52, z: 190, y: 9, sharp: 0.7 },
      { x: 96, z: 176, y: 11, sharp: 0.65 },
      { x: 128, z: 198, y: 13, sharp: 0.7, runoff: 'asphalt', runoffW: 14 },
      { x: 172, z: 196, y: 15, sharp: 0.6 },
      { x: 208, z: 226, y: 17, sharp: 0.6, runoff: 'asphalt', runoffW: 12 },
      { x: 232, z: 268, y: 19 },
      { x: 218, z: 314, y: 19.5 },
      { x: 176, z: 348, y: 17.5, sharp: 0.75, runoff: 'asphalt', runoffW: 14 },
      { x: 126, z: 360, y: 15, sharp: 0.7 },
      { x: 88, z: 388, y: 13, sharp: 0.65 },
      { x: 62, z: 436, y: 11 },
      { x: 24, z: 470, y: 9.5, sharp: 0.55 },
      { x: -30, z: 492, y: 8, sharp: 0.5 },
      { x: -84, z: 512, y: 7 },
      { x: -132, z: 530, y: 6.5, sharp: 1, runoff: 'asphalt', runoffW: 16 },
      { x: -156, z: 502, y: 6, sharp: 1 },
      { x: -136, z: 466, y: 5.5, sharp: 1 },
      { x: -110, z: 402, y: 4 },
      { x: -128, z: 320, y: 3, sharp: 0.55 },
      { x: -172, z: 268, y: 2.5, sharp: 0.6, runoff: 'asphalt', runoffW: 12 },
      { x: -216, z: 300, y: 2, sharp: 0.6 },
      { x: -252, z: 336, y: 1.5, sharp: 0.65, runoff: 'asphalt', runoffW: 14 },
      { x: -268, z: 284, y: 1, sharp: 0.7 },
      { x: -240, z: 224, y: 0.5, sharp: 0.6 },
      { x: -206, z: 150, y: 0 },
      { x: -178, z: 76, sharp: 0.55, runoff: 'asphalt', runoffW: 12 },
      { x: -132, z: 18, sharp: 0.5 },
      { x: -84, z: -24 },
      { x: -30, z: -48 },
      { x: 0, z: -30, y: 0 },
      { x: 0, z: 8, y: 0 }
    
    ],
  },
];

export const CIRCUIT_MAP: Record<string, CircuitDef> = Object.fromEntries(CIRCUITS.map(c => [c.id, c]));
