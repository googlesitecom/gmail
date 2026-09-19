'use client';

/**
 * APEX KART — Pause menu: resume / restart / options / quit.
 */

import { useState, type JSX } from 'react';
import { OptionsPanel } from './OptionsPanel';
import { QualityLevel } from '@/game/core/Types';

export function PauseMenu({ onResume, onRestart, onQuit, onApplyQuality }: {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onApplyQuality: (q: QualityLevel) => void;
}): JSX.Element {
  const [showOptions, setShowOptions] = useState(false);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-[#15101f]/95 p-6 shadow-2xl">
        <h2 className="mb-1 text-center text-3xl font-black tracking-widest text-white">PAUSA</h2>
        <p className="mb-5 text-center text-xs font-semibold text-white/40">ESC para continuar</p>

        {!showOptions ? (
          <div className="flex flex-col gap-2.5">
            <button onClick={onResume} className="rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 py-3 font-black text-black transition hover:scale-[1.02] active:scale-95">
              ▶ CONTINUAR
            </button>
            <button onClick={onRestart} className="rounded-2xl bg-white/10 py-3 font-black text-white transition hover:bg-white/20 active:scale-95">
              ↻ REINICIAR
            </button>
            <button onClick={() => setShowOptions(true)} className="rounded-2xl bg-white/10 py-3 font-black text-white transition hover:bg-white/20 active:scale-95">
              ⚙ OPCIONES
            </button>
            <button onClick={onQuit} className="rounded-2xl bg-rose-600/80 py-3 font-black text-white transition hover:bg-rose-500 active:scale-95">
              ⏻ SALIR AL MENÚ
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <OptionsPanel embedded onClose={() => setShowOptions(false)} onApplyQuality={onApplyQuality} />
            <button onClick={() => setShowOptions(false)} className="rounded-2xl bg-amber-400 py-2.5 font-black text-black transition hover:bg-amber-300">
              ← ATRÁS
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
