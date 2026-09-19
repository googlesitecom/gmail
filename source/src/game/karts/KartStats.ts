/**
 * APEX KART — 9 original party racers, one per visual archetype, spanning all
 * five engine classes. Design rule: real tradeoffs (feather = rocket accel /
 * low top speed / gets bumped; titan = brutal speed / slow spool / shoves).
 * Every racer is 100% original: species heads are built procedurally in
 * KartVisual.buildSpeciesHead. The kart is shared; the player paints it with
 * any of the 12 chassis colors (KartColorSelect).
 */

import { CharacterStats, EngineClass } from '../core/Types';

const CLASS_BASE: Record<EngineClass, Omit<CharacterStats, 'id' | 'displayName' | 'klass' | 'unlockHint'>> = {
  feather: { topSpeed: 21.8, acceleration: 15.5, weight: 2.0, handling: 1.00, grip: 1.10, driftChargeMul: 1.2 },
  light:   { topSpeed: 22.8, acceleration: 13.4, weight: 3.5, handling: 0.95, grip: 1.05, slipMul: 1.35 },
  medium:  { topSpeed: 23.8, acceleration: 11.8, weight: 5.0, handling: 0.90, grip: 1.00, offroadMul: 0.7 },
  heavy:   { topSpeed: 25.2, acceleration: 9.7,  weight: 7.0, handling: 0.84, grip: 0.94, bumpMul: 1.35 },
  titan:   { topSpeed: 26.4, acceleration: 8.2,  weight: 9.5, handling: 0.77, grip: 0.92, bumpResist: 0.45, spinResist: 0.85 },
};

const mk = (
  id: string, displayName: string, klass: EngineClass,
  mods: Partial<Pick<CharacterStats, 'topSpeed' | 'acceleration' | 'weight' | 'handling' | 'grip'
    | 'driftChargeMul' | 'slipMul' | 'offroadMul' | 'bumpMul' | 'bumpResist' | 'spinResist'>>,
  color: number, accent: number, unlockHint = '',
): CharacterStats & { color: number; accent: number } => ({
  id, displayName, klass, unlockHint, color, accent,
  ...CLASS_BASE[klass],
  ...mods,
});

export interface RacerVisual {
  color: number;    // kart chassis color hint
  accent: number;   // outfit accent
}

/** Party roster: every archetype has its own species head + kart silhouette. */
export const CHARACTERS: (CharacterStats & RacerVisual)[] = [
  mk('zippy',   'Zippy Zot',    'feather', { topSpeed: 22.2, grip: 1.14, driftChargeMul: 1.25 }, 0x9a5ae8, 0x35e0d8, ''),
  mk('mimi',    'Mimi Pétalo',  'light',   { acceleration: 13.9, handling: 1.0, slipMul: 1.45 }, 0xff8ac8, 0x8ad86a, ''),
  mk('bolt',    'Bolt Guau',    'light',   { topSpeed: 23.1, grip: 1.08 },        0xe8a23a, 0xc8905a, ''),
  mk('rex',     'Rex Talon',    'medium',  { topSpeed: 24.1, handling: 0.88 },    0x5ad85a, 0xe8d04a, ''),
  mk('nova',    'Nova Nova',    'medium',  { acceleration: 12.4, handling: 0.94 },0xff6ab8, 0xffe94a, ''),
  mk('tiki',    'Tiki Magma',   'heavy',   { topSpeed: 25.5, weight: 7.4, bumpMul: 1.45 }, 0xff7a2a, 0x3a2e28, ''),
  mk('bruiser', 'Bruiser',      'heavy',   { weight: 8.2, topSpeed: 25.0, bumpMul: 1.4 },   0x9a6a3a, 0xd84040, ''),
  mk('magnus',  'Magnus Acero', 'titan',   { weight: 10.0, topSpeed: 26.6 },      0xb8c0cc, 0x3a5ad8, ''),
  mk('gigi',    'Gigi Colmillo','titan',   { acceleration: 8.8, weight: 9.2 },    0xc8a88a, 0x68c8e8, ''),
];

export const CHARACTER_MAP: Record<string, CharacterStats & RacerVisual> =
  Object.fromEntries(CHARACTERS.map(c => [c.id, c]));

export function defaultUnlockState(): Record<string, boolean> {
  const st: Record<string, boolean> = {};
  for (const c of CHARACTERS) st[c.id] = c.unlockHint === '';
  return st;
}

/** Class badge shown in UI. */
export const CLASS_LABEL: Record<EngineClass, string> = {
  feather: 'Pluma', light: 'Ligera', medium: 'Media', heavy: 'Pesada', titan: 'Titán',
};

/** Passive ability name + one-line description, shown in the character select. */
export const CLASS_PASSIVE: Record<EngineClass, { name: string; desc: string }> = {
  feather: { name: 'Derrape Chispa', desc: 'Carga mini-turbos un 20% más rápido' },
  light:   { name: 'Aspiradora', desc: 'Corriente de aire un 35% más potente' },
  medium:  { name: 'Todo Terreno', desc: 'Pierde mucha menos velocidad fuera de pista' },
  heavy:   { name: 'Ariete', desc: 'Sus embestidas empujan un 35% más fuerte' },
  titan:   { name: 'Roca Sólida', desc: 'Recibe 45% menos empujones y gira menos tiempo' },
};
