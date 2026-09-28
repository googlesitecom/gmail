'use client';

import type { JSX } from 'react';

/**
 * APEX KART — Kart customization: chassis color palette (12 swatches) with a
 * live 3D preview of the actual in-game kart.
 */

import { KartShowroom } from './KartShowroom';

const PALETTE: { name: string; hex: number }[] = [
  { name: 'Rojo Furia', hex: 0xe03030 },
  { name: 'Amarillo Turbo', hex: 0xf2c822 },
  { name: 'Verde Neón', hex: 0x35d17a },
  { name: 'Cian Eléctrico', hex: 0x2ad8d8 },
  { name: 'Magenta Pop', hex: 0xe83aa8 },
  { name: 'Naranja Lava', hex: 0xff7a2a },
  { name: 'Violeta Cósmico', hex: 0x8a4ae8 },
  { name: 'Blanco Fantasma', hex: 0xf2f2f2 },
  { name: 'Negro Carbón', hex: 0x222228 },
  { name: 'Turquesa Glaciar', hex: 0x35a8b8 },
  { name: 'Dorado Trofeo', hex: 0xd8a83a },
  { name: 'Lima Ácida', hex: 0xa8e035 },
];

export function KartColorSelect({ color, onSelect, onBack, onNext, characterId, racerName }: {
  color: number;
  onSelect: (hex: number) => void;
  onBack: () => void;
  onNext: () => void;
  characterId: string;
  racerName: string;
}): JSX.Element {
  const sel = PALETTE.find(p => p.hex === color);
  return (
    <div className="apex-bg absolute inset-0 overflow-y-auto">
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-4xl flex-col items-center gap-6 px-6 py-8">

        <header className="flex w-full items-center justify-between">
          <button onClick={onBack} className="apex-btn rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white/85">
            <span>← VOLVER</span>
          </button>
          <h1 className="apex-font apex-title text-3xl">COLOR DEL KART</h1>
          <div className="w-[104px]" />
        </header>

        {/* ---------------- live showroom ---------------- */}
        <div className="apex-panel apex-float flex w-full flex-col items-center p-5">
          <div className="apex-font self-start text-sm text-white/60">
            APEX-R de <span className="text-white">{racerName}</span>
          </div>
          <KartShowroom characterId={characterId} color={color} height={280} />
          <div className="apex-font -mt-1 text-lg text-white">
            {sel ? sel.name.toUpperCase() : 'COLOR PERSONALIZADO'}
          </div>
        </div>

        {/* ---------------- palette ---------------- */}
        <div className="grid w-full grid-cols-4 gap-3 sm:grid-cols-6">
          {PALETTE.map(p => {
            const isSel = p.hex === color;
            return (
              <button
                key={p.name}
                onClick={() => onSelect(p.hex)}
                title={p.name}
                className={`group relative aspect-square overflow-hidden rounded-xl border-2 transition-all hover:scale-[1.06] active:scale-95 ${
                  isSel
                    ? 'border-white shadow-[0_0_22px_rgba(255,255,255,0.45)]'
                    : 'border-white/15'
                }`}
                style={{ background: `#${p.hex.toString(16).padStart(6, '0')}` }}
              >
                <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[9px] font-black uppercase tracking-wide text-white/85">
                  {p.name.split(' ')[0]}
                </span>
                {isSel && <span className="absolute right-1 top-1 text-xs text-white drop-shadow">✓</span>}
              </button>
            );
          })}
        </div>

        <button
          onClick={onNext}
          className="apex-btn mb-4 w-full max-w-sm rounded-xl bg-gradient-to-r from-amber-300 via-orange-400 to-red-500 py-3.5 text-lg font-black tracking-wider text-black"
        >
          <span>ELEGIR MODO →</span>
        </button>
      </div>
    </div>
  );
}
