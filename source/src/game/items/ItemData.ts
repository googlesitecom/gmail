/**
 * APEX KART — 13 original items: definitions + position-weighted loot tables.
 * Design: racers in front get defense/traps, racers behind get comeback
 * firepower. All names & visuals are original (no licensed IP).
 */

import { ItemId } from '../core/Types';

export interface ItemDef {
  id: ItemId;
  name: string;
  color: number;         // theme color for 3D + UI
  desc: string;
  kind: 'projectile' | 'trap' | 'boost' | 'defense' | 'global' | 'special';
  /** weight per rank index 0..11 (0 = leader) */
  weights: number[];
}

export const ITEMS_LIST: ItemDef[] = [
  {
    id: 'photon_dart', name: 'Dardo Fotónico', color: 0x35e0ff, kind: 'projectile',
    desc: 'Proyectil recto a toda velocidad.',
    weights: [0, 1, 3, 5, 6, 6, 6, 6, 5, 4, 2, 1],
  },
  {
    id: 'seeker_orb', name: 'Orbe Rastreador', color: 0xff5ad8, kind: 'projectile',
    desc: 'Persigue al rival que va delante de ti.',
    weights: [0, 0, 1, 2, 3, 4, 5, 6, 6, 6, 5, 3],
  },
  {
    id: 'triple_dart', name: 'Triple Dardo', color: 0x35e0ff, kind: 'projectile',
    desc: 'Tres dardos orbitando; dispara uno a uno.',
    weights: [0, 0, 0, 1, 2, 3, 4, 5, 5, 5, 4, 3],
  },
  {
    id: 'goo_trap', name: 'Charco Gel', color: 0x8a4ae8, kind: 'trap',
    desc: 'Obstáculo viscoso en el asfalto.',
    weights: [4, 5, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0],
  },
  {
    id: 'rear_mine', name: 'Mina Retro', color: 0xe8483a, kind: 'trap',
    desc: 'Lánzala hacia atrás: explosión contundente.',
    weights: [3, 4, 5, 4, 3, 3, 2, 1, 0, 0, 0, 0],
  },
  {
    id: 'turbo_cell', name: 'Célula Turbo', color: 0x35d17a, kind: 'boost',
    desc: 'Impulso instantáneo.',
    weights: [0, 1, 2, 4, 5, 6, 6, 6, 6, 5, 4, 3],
  },
  {
    id: 'turbo_stack', name: 'Pila Turbo', color: 0x2ae89a, kind: 'boost',
    desc: 'Tres cargas de turbo.',
    weights: [0, 0, 0, 1, 2, 3, 4, 4, 5, 5, 5, 4],
  },
  {
    id: 'star_core', name: 'Núcleo Estelar', color: 0xffd83a, kind: 'boost',
    desc: 'Turbo dorado: invencible y arrollador.',
    weights: [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5],
  },
  {
    id: 'orbit_shield', name: 'Escudo Orbital', color: 0x35aaff, kind: 'defense',
    desc: 'Tres orbes bloquean impactos.',
    weights: [3, 4, 5, 5, 4, 3, 2, 1, 0, 0, 0, 0],
  },
  {
    id: 'aegis_star', name: 'Égida', color: 0xf2f2ff, kind: 'defense',
    desc: 'Invencibilidad temporal.',
    weights: [0, 1, 2, 3, 3, 3, 2, 2, 1, 0, 0, 0],
  },
  {
    id: 'storm_chip', name: 'Chip Tormenta', color: 0xffe94a, kind: 'global',
    desc: 'Un rayo encoge a todos los rivales.',
    weights: [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5],
  },
  {
    id: 'track_hunter', name: 'Cazador', color: 0xff7a2a, kind: 'special',
    desc: 'Misil que recorre la pista buscando al de delante.',
    weights: [0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 3],
  },
  {
    id: 'magnet_drone', name: 'Dron Imán', color: 0xd8d84a, kind: 'special',
    desc: 'Roba el objeto del rival de delante.',
    weights: [0, 0, 0, 0, 1, 2, 2, 3, 3, 2, 1, 1],
  },
];

export const ITEM_MAP: Record<string, ItemDef> = Object.fromEntries(ITEMS_LIST.map(i => [i.id, i]));

/** Weighted roll for a kart at rank (0-based). */
export function rollItem(rank: number, rng: () => number): ItemId {
  const entries = ITEMS_LIST.map(d => ({ v: d.id, w: d.weights[Math.min(rank, 11)] ?? 0 }));
  let total = 0;
  for (const e of entries) total += e.w;
  if (total <= 0) return 'turbo_cell';
  let r = rng() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.v;
  }
  return 'turbo_cell';
}
