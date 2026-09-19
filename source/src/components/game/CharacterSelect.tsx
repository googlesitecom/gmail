'use client';

import type { JSX } from 'react';

/**
 * APEX KART — Character select: live 3D showroom of the real kart + racer,
 * 12 cards with class badges, visible stat bars and lock states.
 */

import { CHARACTERS, CLASS_LABEL, CLASS_PASSIVE, defaultUnlockState } from '@/game/karts/KartStats';
import { SaveData } from '@/game/persistence/SaveData';
import { EngineClass } from '@/game/core/Types';
import { KartShowroom } from './KartShowroom';

const CLASS_STYLE: Record<EngineClass, string> = {
  feather: 'bg-sky-400/25 text-sky-200',
  light: 'bg-emerald-400/25 text-emerald-200',
  medium: 'bg-amber-400/25 text-amber-200',
  heavy: 'bg-orange-500/30 text-orange-200',
  titan: 'bg-rose-500/30 text-rose-200',
};

function StatBar({ label, value, max }: { label: string; value: number; max: number }): JSX.Element {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-[72px] shrink-0 text-[10px] font-black uppercase tracking-wider text-white/45">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-300 to-rose-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function CharacterSelect({ selected, onSelect, onBack, onNext }: {
  selected: string;
  onSelect: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}): JSX.Element {
  const defaults = defaultUnlockState();
  const sel = CHARACTERS.find(c => c.id === selected)!;

  return (
    <div className="apex-bg absolute inset-0 overflow-y-auto">
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-6xl flex-col gap-5 px-6 py-8">

        {/* header */}
        <header className="flex items-center justify-between">
          <button onClick={onBack} className="apex-btn rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white/85">
            <span>← VOLVER</span>
          </button>
          <h1 className="apex-font apex-title text-3xl">ELIGE CORREDOR</h1>
          <div className="w-[104px]" />
        </header>

        <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">

          {/* ---------------- showroom + stats ---------------- */}
          <div className="apex-panel apex-float flex flex-col items-center p-5">
            <div className="flex items-center gap-3 self-start">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${CLASS_STYLE[sel.klass]}`}>
                Clase {CLASS_LABEL[sel.klass]}
              </span>
              <span className="apex-font text-2xl text-white">{sel.displayName}</span>
            </div>

            <KartShowroom characterId={sel.id} color={sel.color} height={290} />

            <div className="mt-1 w-full space-y-1.5">
              <StatBar label="Velocidad" value={sel.topSpeed} max={27} />
              <StatBar label="Aceleración" value={sel.acceleration} max={16} />
              <StatBar label="Peso" value={sel.weight} max={10} />
              <StatBar label="Manejo" value={sel.handling} max={1.1} />
              <StatBar label="Agarre" value={sel.grip} max={1.15} />
            </div>

            {/* passive ability — class trait */}
            <div className="mt-3 w-full rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                Habilidad · {CLASS_PASSIVE[sel.klass].name}
              </div>
              <div className="text-[11px] font-bold leading-snug text-white/70">
                {CLASS_PASSIVE[sel.klass].desc}
              </div>
            </div>

            <div className="mt-3 text-center text-[11px] font-semibold leading-relaxed text-white/45">
              {sel.klass === 'feather' || sel.klass === 'light'
                ? 'Aceleración brutal y punta baja: ligero de empujar y fácil de empujar.'
                : sel.klass === 'medium'
                  ? 'Equilibrio total: funciona en cualquier pista y situación.'
                  : 'Punta brutal y arranque lento: reparte empujones en cada curva.'}
            </div>
          </div>

          {/* ---------------- roster grid ---------------- */}
          <div className="grid content-start grid-cols-2 gap-3 sm:grid-cols-3">
            {CHARACTERS.map(c => {
              const locked = !SaveData.isCharUnlocked(c.id, defaults);
              const isSel = c.id === selected;
              const cHex = `#${c.color.toString(16).padStart(6, '0')}`;
              return (
                <button
                  key={c.id}
                  disabled={locked}
                  onClick={() => onSelect(c.id)}
                  className={`apex-panel relative overflow-hidden p-3 text-left transition-all ${
                    isSel
                      ? 'outline outline-2 outline-amber-300 shadow-[0_0_28px_rgba(255,217,58,0.3)]'
                      : 'hover:brightness-125'
                  } ${locked ? 'opacity-45 saturate-0' : 'active:scale-95'}`}
                >
                  {/* corner accent */}
                  <div className="absolute right-0 top-0 h-8 w-8" style={{
                    background: `linear-gradient(225deg, ${cHex}66, transparent 70%)`,
                  }} />
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-white/15"
                      style={{ background: `linear-gradient(160deg, ${cHex}, #101018)` }}
                    >
                      <span className="apex-font text-lg text-white drop-shadow">{c.displayName.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-white">{c.displayName}</div>
                      <div className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase ${CLASS_STYLE[c.klass]}`}>
                        {CLASS_LABEL[c.klass]}
                      </div>
                    </div>
                  </div>
                  {locked && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70">
                      <span className="text-2xl">🔒</span>
                      <span className="px-2 text-center text-[10px] font-bold text-white/70">{c.unlockHint}</span>
                    </div>
                  )}
                  {isSel && (
                    <div className="apex-font absolute bottom-1.5 right-2 text-[10px] tracking-widest text-amber-300">
                      ✓ ELEGIDO
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={onNext}
          className="apex-btn mx-auto mb-4 w-full max-w-sm rounded-xl bg-gradient-to-r from-amber-300 via-orange-400 to-red-500 py-3.5 text-lg font-black tracking-wider text-black"
        >
          <span>ELEGIR KART →</span>
        </button>
      </div>
    </div>
  );
}
