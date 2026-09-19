/**
 * APEX KART — Original inline SVG icons for all 13 items.
 * Used by the HUD item slot (roulette + resolved) and menus.
 */

import type { JSX } from 'react';
import { ItemId } from '@/game/core/Types';

export function ItemIcon({ id, size = 34 }: { id: ItemId; size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      {renderIcon(id)}
    </svg>
  );
}

function renderIcon(id: ItemId): JSX.Element {
  switch (id) {
    case 'photon_dart':
      return <g fill="#35e0ff"><path d="M4 16 L20 10 L16 16 L20 22 Z" /><rect x="20" y="14.6" width="8" height="2.8" rx="1.4" /></g>;
    case 'seeker_orb':
      return <g><circle cx="16" cy="16" r="7" fill="#ff5ad8" /><circle cx="16" cy="16" r="10.5" fill="none" stroke="#ff5ad8" strokeWidth="2" strokeDasharray="4 3" /><circle cx="13.5" cy="14" r="1.6" fill="#fff" /></g>;
    case 'triple_dart':
      return <g fill="#35e0ff"><path d="M2 8 L12 5 L10 8 L12 11 Z" /><path d="M2 24 L12 21 L10 24 L12 27 Z" /><path d="M18 16 L30 11 L26 16 L30 21 Z" /></g>;
    case 'goo_trap':
      return <g fill="#8a4ae8"><path d="M6 22 Q8 12 16 13 Q24 12 26 22 Z" /><circle cx="12" cy="18" r="1.6" fill="#c9a6ff" /><circle cx="20" cy="19" r="1.2" fill="#c9a6ff" /><circle cx="16" cy="16" r="1" fill="#c9a6ff" /></g>;
    case 'rear_mine':
      return <g><circle cx="16" cy="16" r="8" fill="#222228" /><path d="M16 5 L18 10 L14 10 Z M16 27 L18 22 L14 22 Z M5 16 L10 14 L10 18 Z M27 16 L22 14 L22 18 Z" fill="#e8483a" /><circle cx="16" cy="16" r="3" fill="#ff4422" /></g>;
    case 'turbo_cell':
      return <path d="M18 3 L8 17 L15 17 L13 29 L24 14 L16 14 Z" fill="#35d17a" />;
    case 'turbo_stack':
      return <g fill="#2ae89a"><path d="M12 3 L6 12 L10 12 L9 18 L16 8 L11 8 Z" /><path d="M22 3 L16 12 L20 12 L19 18 L26 8 L21 8 Z" /><path d="M17 14 L11 23 L15 23 L14 29 L21 19 L16 19 Z" /></g>;
    case 'star_core':
      return <path d="M16 2 L19.5 11 L29 12 L21.5 18 L24 28 L16 22.5 L8 28 L10.5 18 L3 12 L12.5 11 Z" fill="#ffd83a" stroke="#b8860b" strokeWidth="1" />;
    case 'orbit_shield':
      return <g><circle cx="16" cy="16" r="5" fill="#35aaff" /><circle cx="16" cy="16" r="11" fill="none" stroke="#35aaff" strokeWidth="1.4" opacity="0.5" /><circle cx="16" cy="5" r="3.2" fill="#7ac8ff" /><circle cx="6.5" cy="22" r="3.2" fill="#7ac8ff" /><circle cx="25.5" cy="22" r="3.2" fill="#7ac8ff" /></g>;
    case 'aegis_star':
      return <g><path d="M16 4 L27 8 L27 16 Q27 24 16 28 Q5 24 5 16 L5 8 Z" fill="#f2f2ff" opacity="0.9" /><path d="M16 10 L17.8 14.5 L22.5 15 L18.8 18 L20 23 L16 20.2 L12 23 L13.2 18 L9.5 15 L14.2 14.5 Z" fill="#35aaff" /></g>;
    case 'storm_chip':
      return <g><path d="M8 10 Q16 2 24 10 Q28 14 24 17 L8 17 Q4 14 8 10 Z" fill="#4a4a58" /><path d="M15 9 L10 18 L14 18 L12 26 L20 15 L16 15 L19 9 Z" fill="#ffe94a" /></g>;
    case 'track_hunter':
      return <g><path d="M16 3 L21 12 L21 22 L11 22 L11 12 Z" fill="#ff7a2a" /><circle cx="16" cy="12" r="2.4" fill="#ffe0c0" /><path d="M11 22 L13 28 L16 24 L19 28 L21 22 Z" fill="#e8483a" /></g>;
    case 'magnet_drone':
      return <g><path d="M8 6 L8 16 Q8 24 16 24 Q24 24 24 16 L24 6 L20 6 L20 16 Q20 20 16 20 Q12 20 12 16 L12 6 Z" fill="#d8d84a" /><rect x="8" y="6" width="5" height="5" fill="#e8483a" /><rect x="19" y="6" width="5" height="5" fill="#e8483a" /><rect x="13" y="2" width="6" height="4" fill="#444450" /></g>;
  }
}

export const ITEM_NAME: Record<ItemId, string> = {
  photon_dart: 'Dardo Fotónico',
  seeker_orb: 'Orbe Rastreador',
  triple_dart: 'Triple Dardo',
  goo_trap: 'Charco Gel',
  rear_mine: 'Mina Retro',
  turbo_cell: 'Célula Turbo',
  turbo_stack: 'Pila Turbo',
  star_core: 'Núcleo Estelar',
  orbit_shield: 'Escudo Orbital',
  aegis_star: 'Égida',
  storm_chip: 'Chip Tormenta',
  track_hunter: 'Cazador',
  magnet_drone: 'Dron Imán',
};
