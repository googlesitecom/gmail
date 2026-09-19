'use client';

import type { JSX } from 'react';

/**
 * APEX KART — Main menu v2: "night showroom".
 * The engine renders a live 3D stage (karts lapping a neon podium) behind
 * this translucent overlay; big chunky mode pills float over it, arcade
 * logo on top, progress + options docked at the bottom.
 */

import { GameMode } from '@/game/core/Types';
import { CHARACTERS, defaultUnlockState } from '@/game/karts/KartStats';
import { CUPS } from '@/game/tracks/TrackCatalog';
import { SaveData } from '@/game/persistence/SaveData';

function ModeIcon({ kind }: { kind: GameMode | 'online' }): JSX.Element {
  const common = 'h-8 w-8';
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
    case 'online':
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
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

  const modes: { id: GameMode; title: string; sub: string; grad: string; ring: string }[] = [
    { id: 'grandprix', title: 'GRAN PREMIO', sub: '4 copas · 50–200cc · espejo', grad: 'from-amber-300 via-orange-500 to-red-600', ring: 'rgba(255,180,60,0.65)' },
    { id: 'vs', title: 'CARRERA VS', sub: 'Vueltas, IA y objetos a tu gusto', grad: 'from-rose-400 via-red-500 to-rose-700', ring: 'rgba(255,90,120,0.6)' },
    { id: 'timetrial', title: 'CONTRARRELOJ', sub: 'Fantasma guardado · récords de vuelta', grad: 'from-emerald-400 via-teal-500 to-cyan-600', ring: 'rgba(80,230,180,0.6)' },
    { id: 'battle', title: 'MODO BATALLA', sub: 'Arena · equipos rojo vs azul', grad: 'from-violet-400 via-purple-500 to-fuchsia-700', ring: 'rgba(190,120,255,0.6)' },
  ];

  return (
    <div className="apex-bg absolute inset-0 overflow-y-auto">
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center gap-7 px-6 py-10">

        {/* ---------------- logo ---------------- */}
        <div className="relative text-center">
          <div className="apex-font apex-title text-6xl sm:text-8xl">
            APEX KART
          </div>
          <div className="mt-2.5 flex items-center justify-center gap-3">
            <div className="apex-checker apex-checker-fade h-3 w-20 sm:w-32" />
            <span className="apex-font text-[11px] tracking-[0.42em] text-amber-200/90 sm:text-sm">
              TURBO PARTY RACING
            </span>
            <div className="apex-checker apex-checker-fade h-3 w-20 sm:w-32" />
          </div>
        </div>

        {/* ---------------- online CTA ---------------- */}
        <button
          onClick={onOnline}
          className="apex-btn group flex w-full items-center gap-4 rounded-2xl bg-gradient-to-r from-cyan-300 via-sky-500 to-indigo-600 p-4 text-left text-white sm:p-5"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/30 sm:h-14 sm:w-14">
            <ModeIcon kind="online" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="apex-font flex items-center gap-2 truncate text-lg tracking-wide [text-shadow:0_2px_4px_rgba(10,5,25,0.55)] sm:text-2xl">
              MULTIJUGADOR ONLINE
              <span className="apex-pulse inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-300" />
            </div>
            <div className="apex-ui mt-0.5 truncate text-xs font-bold text-white/95 [text-shadow:0_1px_3px_rgba(10,5,25,0.6)] sm:text-sm">
              Crea una sala · comparte el código · hasta 8 pilotos
            </div>
          </div>
          <div className="apex-font shrink-0 text-2xl text-white/60 transition-transform duration-150 group-hover:translate-x-1.5">›</div>
        </button>

        {/* ---------------- mode pills ---------------- */}
        <div className="grid w-full grid-cols-1 gap-3.5 sm:gap-4">
          {modes.map(m => (
            <button
              key={m.id}
              onClick={() => onMode(m.id)}
              className={`apex-btn group flex items-center gap-4 rounded-2xl bg-gradient-to-r ${m.grad} p-4 text-left text-white sm:p-5`}
              style={{ boxShadow: `inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -3px 0 rgba(0,0,0,0.3), 0 5px 0 rgba(0,0,0,0.45), 0 14px 30px ${m.ring}` }}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/30 sm:h-14 sm:w-14">
                <ModeIcon kind={m.id} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="apex-font truncate text-lg tracking-wide [text-shadow:0_2px_4px_rgba(10,5,25,0.55)] sm:text-2xl">{m.title}</div>
                <div className="apex-ui mt-0.5 truncate text-xs font-bold text-white/95 [text-shadow:0_1px_3px_rgba(10,5,25,0.6)] sm:text-sm">{m.sub}</div>
              </div>
              <div className="apex-font shrink-0 text-2xl text-white/60 transition-transform duration-150 group-hover:translate-x-1.5">
                ›
              </div>
            </button>
          ))}
        </div>

        {/* ---------------- bottom dock: progress + options ---------------- */}
        <div className="flex w-full flex-wrap items-center justify-center gap-3">
          <div className="apex-panel apex-ui flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white/85">
            <span className="apex-pulse inline-block h-2 w-2 rounded-full bg-amber-300" />
            {unlockedChars}/{CHARACTERS.length} corredores · {cupsWon}/4 copas{mirror ? ' · espejo' : ''}
          </div>
          <button
            onClick={onOptions}
            className="apex-btn apex-font rounded-full border border-white/20 bg-white/10 px-6 py-2.5 text-sm text-white backdrop-blur-sm"
          >
            OPCIONES
          </button>
        </div>

        {/* ---------------- controls hint ---------------- */}
        <div className="apex-ui text-center text-[11px] font-semibold leading-relaxed text-white/40">
          WASD / Flechas conducir · ESPACIO derrape · SHIFT objeto · Q mirar atrás · ESC pausa<br />
          Compatible con mando estándar (gatillos analógicos)
        </div>
        <div className="apex-checker apex-checker-fade absolute bottom-0 left-0 right-0 z-10 h-4 opacity-60" />
      </div>
    </div>
  );
}
