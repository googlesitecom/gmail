'use client';

/**
 * APEX KART — Results screen: animated podium (top-3), full standings,
 * GP total points, unlock notices and continue/retry actions.
 */

import { useEffect, useState, type JSX } from 'react';
import { RaceResultRow } from '@/game/core/Types';
import { CHARACTER_MAP } from '@/game/karts/KartStats';
import { formatMs } from '@/game/core/MathUtils';
import { ItemIcon } from './ItemIcon';

const PODIUM_BASE = ['from-amber-300 to-amber-500', 'from-slate-200 to-slate-400', 'from-orange-400 to-orange-600'];
const MEDAL = ['🥇', '🥈', '🥉'];

export function ResultsScreen({ rows, gpFinal, gpNext, mode, online, onContinue, onRetry, onMenu }: {
  rows: RaceResultRow[];
  gpFinal: boolean;
  gpNext: boolean;          // GP: more races to come
  mode: string;
  online?: boolean;         // online race: no retry, continue returns to lobby
  onContinue: () => void;
  onRetry: () => void;
  onMenu: () => void;
}): JSX.Element {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const podium = rows.slice(0, 3);
  const player = rows.find(r => r.isPlayer);
  const useTotal = gpFinal || (mode === 'grandprix' && rows[0]?.totalPoints > 0);
  const playerWon = player?.position === 1;

  return (
    <div className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-black/85 via-black/75 to-black/90 backdrop-blur-[2px]">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center gap-5 px-4 py-8">

        {/* title */}
        <h1 className={`text-4xl font-black tracking-wide drop-shadow ${playerWon ? 'text-amber-300' : 'text-white'}`}>
          {mode === 'battle' ? 'BATALLA TERMINADA'
            : gpFinal ? '¡COPA COMPLETADA!'
            : playerWon ? '¡VICTORIA!' : 'RESULTADOS'}
        </h1>

        {/* podium */}
        <div className="flex h-52 w-full max-w-lg items-end justify-center gap-3">
          {[1, 0, 2].map(displayIdx => {
            const r = podium[displayIdx];
            if (!r) return null;
            const ch = CHARACTER_MAP[r.characterId];
            const h = displayIdx === 0 ? 'h-40' : displayIdx === 1 ? 'h-28' : 'h-20';
            return (
              <div key={r.kartId} className="flex w-28 flex-col items-center">
                <span className="mb-1 text-3xl">{MEDAL[displayIdx]}</span>
                <div
                  className="mb-1 h-12 w-12 rounded-full border-4 shadow-lg"
                  style={{ borderColor: `#${(ch?.color ?? 0xcc4444).toString(16).padStart(6, '0')}`, background: `#${(ch?.accent ?? 0x333333).toString(16).padStart(6, '0')}` }}
                />
                <span className="max-w-full truncate text-xs font-black text-white">{r.name ?? ch?.displayName ?? r.characterId}</span>
                {r.isPlayer && <span className="text-[9px] font-black text-amber-300">TÚ</span>}
                <div
                  className={`w-full rounded-t-xl bg-gradient-to-b ${PODIUM_BASE[displayIdx]} ${h} flex items-start justify-center pt-2 text-2xl font-black text-black/70 transition-all duration-500`}
                  style={{ height: mounted ? undefined : 0, opacity: mounted ? 1 : 0, transitionDelay: `${displayIdx === 0 ? 0 : displayIdx === 1 ? 120 : 240}ms` }}
                >
                  {displayIdx + 1}
                </div>
              </div>
            );
          })}
        </div>

        {/* standings */}
        <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-black/50">
          <div className={`grid grid-cols-[2.2rem_1fr_4.5rem_4.5rem_5rem] gap-1 border-b border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/40 ${
            useTotal ? 'grid-cols-[2.2rem_1fr_4.5rem_4.5rem_5rem]' : ''
          }`}>
            <span>#</span><span>Corredor</span>
            <span className="text-right">Tiempo</span>
            <span className="text-right">Mejor vta</span>
            <span className="text-right">{useTotal ? 'TOTAL' : 'Pts'}</span>
          </div>
          <div className="max-h-[34vh] overflow-y-auto">
            {rows.map(r => {
              const ch = CHARACTER_MAP[r.characterId];
              return (
                <div
                  key={r.kartId}
                  className={`grid grid-cols-[2.2rem_1fr_4.5rem_4.5rem_5rem] items-center gap-1 px-3 py-1.5 text-sm font-bold ${
                    r.isPlayer ? 'bg-amber-400/15 text-amber-200' : 'text-white/80'
                  }`}
                >
                  <span className="font-black">{r.position}</span>
                  <span className="flex items-center gap-2 truncate">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `#${(ch?.color ?? 0x888888).toString(16).padStart(6, '0')}` }} />
                    {r.name ?? ch?.displayName ?? r.characterId}{r.isPlayer && <span className="text-[9px] text-amber-300">(TÚ)</span>}
                  </span>
                  <span className="text-right font-mono text-xs">{r.finishTimeMs != null ? formatMs(r.finishTimeMs) : '—'}</span>
                  <span className="text-right font-mono text-xs">{r.bestLapMs != null ? formatMs(r.bestLapMs) : '—'}</span>
                  <span className="text-right font-black">{useTotal ? (r.totalPoints || r.points) : r.points}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* hint */}
        <div className="flex items-center gap-2 text-xs font-semibold text-white/40">
          <ItemIcon id="star_core" size={18} />
          {online ? 'El anfitrión puede devolver a todos a la sala' : 'Gana copas para desbloquear corredores y el modo espejo'}
        </div>

        {/* actions */}
        <div className="mb-4 flex w-full max-w-lg flex-wrap justify-center gap-3">
          <button
            onClick={onContinue}
            className="flex-1 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3 text-lg font-black tracking-wider text-black shadow-lg transition hover:scale-[1.02] active:scale-95"
          >
            {gpNext ? 'SIGUIENTE PISTA →' : online ? 'VOLVER A LA SALA' : 'CONTINUAR'}
          </button>
          {mode !== 'grandprix' && !online && (
            <button onClick={onRetry} className="rounded-2xl bg-white/10 px-6 py-3 font-black text-white transition hover:bg-white/20 active:scale-95">
              ↻ REINTENTAR
            </button>
          )}
          <button onClick={onMenu} className="rounded-2xl bg-white/10 px-6 py-3 font-black text-white transition hover:bg-white/20 active:scale-95">
            MENÚ
          </button>
        </div>
      </div>
    </div>
  );
}
