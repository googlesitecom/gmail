'use client';

import type { JSX } from 'react';

/**
 * APEX KART — Main menu. Arcade-style front-end: layered speed-line
 * background, big italic logo, skewed mode "tickets" and checkered strips.
 */

import { GameMode } from '@/game/core/Types';
import { CHARACTERS, defaultUnlockState } from '@/game/karts/KartStats';
import { CUPS } from '@/game/tracks/TrackCatalog';
import { SaveData } from '@/game/persistence/SaveData';

function ModeIcon({ kind }: { kind: GameMode }): JSX.Element {
  const common = 'h-9 w-9';
  switch (kind) {
    case 'grandprix':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" fill="currentColor" opacity=".25" />
          <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
          <path d="M12 13v3M8 20h8M10 16h4" strokeLinecap="round" />
        </svg>
      );
    case 'timetrial':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l3 2M9 2h6" strokeLinecap="round" />
        </svg>
      );
    case 'vs':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 15V9l4-3 3 3h3M20 15V9l-4-3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 15l-2 5M18 15l2 5" strokeLinecap="round" />
          <circle cx="12" cy="17" r="2.4" fill="currentColor" opacity=".3" />
          <circle cx="12" cy="17" r="2.4" />
        </svg>
      );
    case 'battle':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3l2.2 4.4L19 8.6l-3.5 3.4.8 4.9L12 14.6l-4.3 2.3.8-4.9L5 8.6l4.8-1.2L12 3z" />
        </svg>
      );
  }
}

export function MainMenu({ onMode, onOptions, onOnline }: {
  onMode: (m: GameMode) => void;
  onOptions: () => void;
  onOnline: () => void;
}): JSX.Element {
  const defaults = defaultUnlockState();
  const unlockedChars = CHARACTERS.filter(c => SaveData.isCharUnlocked(c.id, defaults)).length;
  const cupsWon = CUPS.filter(c => SaveData.cupChainReady(c.id)).length;
  const mirror = SaveData.mirrorUnlocked;

  const modes: { id: GameMode; title: string; sub: string; grad: string }[] = [
    { id: 'grandprix', title: 'GRAN PREMIO', sub: '4 copas · 50–200cc · espejo', grad: 'from-amber-400 via-orange-500 to-red-600' },
    { id: 'timetrial', title: 'CONTRARRELOJ', sub: 'Fantasma guardado · récords de vuelta', grad: 'from-emerald-400 via-teal-500 to-cyan-600' },
    { id: 'vs', title: 'CARRERA VS', sub: 'Vueltas, IA y objetos a tu gusto', grad: 'from-rose-400 via-red-500 to-rose-700' },
    { id: 'battle', title: 'MODO BATALLA', sub: 'Arena · equipos rojo vs azul', grad: 'from-violet-400 via-purple-500 to-fuchsia-700' },
  ];

  return (
    <div className="apex-bg absolute inset-0 overflow-y-auto">
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center gap-9 px-6 py-12">

        {/* ---------------- logo ---------------- */}
        <div className="relative text-center">
          <div className="apex-font apex-title text-6xl sm:text-8xl">
            APEX KART
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            <div className="apex-checker apex-checker-fade h-3.5 w-24 sm:w-36" />
            <span className="apex-font text-xs tracking-[0.42em] text-amber-200/90 sm:text-sm">
              TURBO PARTY RACING
            </span>
            <div className="apex-checker apex-checker-fade h-3.5 w-24 sm:w-36" />
          </div>
          <div className="mt-2 text-[11px] font-semibold text-white/35">
            Un juego original de APEX Studio · 9 corredores · 12 circuitos
          </div>
        </div>

        {/* ---------------- online banner ---------------- */}
        <button
          onClick={onOnline}
          className="apex-btn group flex w-full items-center gap-4 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 p-5 text-left text-white"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-black/25">
            <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="apex-font truncate text-xl tracking-wide">MULTIJUGADOR ONLINE</div>
            <div className="mt-0.5 truncate text-xs font-bold text-white/80">Crea una sala · comparte el código · hasta 8 pilotos</div>
          </div>
          <div className="apex-font shrink-0 text-2xl text-white/50 transition-transform duration-150 group-hover:translate-x-1.5">›</div>
        </button>

        {/* ---------------- mode tickets ---------------- */}
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {modes.map(m => (
            <button
              key={m.id}
              onClick={() => onMode(m.id)}
              className={`apex-btn group flex items-center gap-4 rounded-xl bg-gradient-to-br ${m.grad} p-5 text-left text-white`}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-black/25">
                <ModeIcon kind={m.id} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="apex-font truncate text-xl tracking-wide">{m.title}</div>
                <div className="mt-0.5 truncate text-xs font-bold text-white/80">{m.sub}</div>
              </div>
              <div className="apex-font shrink-0 text-2xl text-white/50 transition-transform duration-150 group-hover:translate-x-1.5">
                ›
              </div>
            </button>
          ))}
        </div>

        {/* ---------------- progress + options ---------------- */}
        <div className="flex w-full flex-wrap items-center justify-center gap-3">
          <div className="apex-panel flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black text-white/85">
            <span className="apex-pulse inline-block h-2 w-2 rounded-full bg-amber-300" />
            {unlockedChars}/{CHARACTERS.length} corredores · {cupsWon}/4 copas{mirror ? ' · espejo' : ''}
          </div>
          <button
            onClick={onOptions}
            className="apex-btn rounded-full border border-white/15 bg-white/10 px-6 py-2.5 text-sm font-black text-white"
          >
            <span>OPCIONES</span>
          </button>
        </div>

        {/* ---------------- controls hint + checkered footer ---------------- */}
        <div className="text-center text-[11px] font-semibold leading-relaxed text-white/30">
          Teclado: WASD / Flechas · ESPACIO drift · SHIFT objeto · Q mirar atrás · ESC pausa<br />
          También compatible con mando estándar (gatillos analógicos)
        </div>
        <div className="apex-checker apex-checker-fade absolute bottom-0 left-0 right-0 z-10 h-5 opacity-70" />
      </div>
    </div>
  );
}
