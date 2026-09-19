'use client';

/**
 * APEX KART — Options: video quality, HUD toggles, default rubber-band,
 * and full control remapping with live key capture (keyboard).
 */

import { useEffect, useState, type JSX } from 'react';
import { Action, Binding } from '@/game/core/InputManager';
import { SaveData } from '@/game/persistence/SaveData';
import { QualityLevel } from '@/game/core/Types';
import { AudioSys } from '@/game/core/AudioSystem';

const ACTION_LABEL: Record<Action, string> = {
  accelerate: 'Acelerar',
  brake: 'Frenar / Reversa',
  steerLeft: 'Girar izquierda',
  steerRight: 'Girar derecha',
  drift: 'Drift / Salto',
  item: 'Usar objeto',
  lookBack: 'Mirar atrás',
  pause: 'Pausa',
};

const KEY_LABEL: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Space: 'ESPACIO', ShiftLeft: 'SHIFT IZQ', ShiftRight: 'SHIFT DER',
  Enter: 'ENTER', Escape: 'ESC', ControlLeft: 'CTRL IZQ', ControlRight: 'CTRL DER',
  Tab: 'TAB', Backspace: 'RETROCESO',
};

export function prettyKey(code: string): string {
  if (KEY_LABEL[code]) return KEY_LABEL[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export function OptionsPanel({ onApplyQuality, onBindingsChanged, onClose, embedded }: {
  onApplyQuality?: (q: QualityLevel) => void;
  onBindingsChanged?: (b: Binding[]) => void;
  onClose: () => void;
  embedded?: boolean;
}): JSX.Element {
  const [quality, setQuality] = useState<QualityLevel>(SaveData.options.quality);
  const [showSpeedo, setShowSpeedo] = useState(SaveData.options.showSpeedometer);
  const [musicVol, setMusicVol] = useState(SaveData.options.musicVolume);
  const [sfxVol, setSfxVol] = useState(SaveData.options.sfxVolume);
  const [bindings, setBindings] = useState<Binding[]>(SaveData.bindings);
  const [capturing, setCapturing] = useState<{ action: Action; index: number } | null>(null);

  // key capture for remapping
  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent): void => {
      e.preventDefault();
      if (e.code !== 'Escape') {
        const next = bindings.map((b, idx) =>
          idx === capturing.index ? { ...b, code: e.code, label: prettyKey(e.code) } : b);
        setBindings(next);
        SaveData.setBindingsList(next);
        onBindingsChanged?.(next);
      }
      setCapturing(null);
    };
    window.addEventListener('keydown', handler, { once: true, capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [capturing, bindings, onBindingsChanged]);

  const saveQuality = (q: QualityLevel): void => {
    setQuality(q);
    SaveData.setOptions({ ...SaveData.options, quality: q });
    onApplyQuality?.(q);
  };

  const saveSpeedo = (v: boolean): void => {
    setShowSpeedo(v);
    SaveData.setOptions({ ...SaveData.options, showSpeedometer: v });
  };

  const saveMusic = (v: number): void => {
    setMusicVol(v);
    AudioSys.setMusicVolume(v);
    SaveData.setOptions({ ...SaveData.options, musicVolume: v });
  };

  const saveSfx = (v: number): void => {
    setSfxVol(v);
    AudioSys.setSfxVolume(v);
    SaveData.setOptions({ ...SaveData.options, sfxVolume: v });
  };

  const resetBindings = (): void => {
    const fresh = bindings.map(b => ({ ...b }));
    setBindings(fresh);
    SaveData.setBindingsList(fresh);
    onBindingsChanged?.(fresh);
  };

  const body = (
    <div className={`flex w-full flex-col gap-5 overflow-y-auto ${embedded ? 'max-h-[70vh]' : 'min-h-full'} px-1 py-1`}>
      {/* video */}
      <section className="rounded-2xl border border-white/10 bg-black/40 p-4">
        <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-white/50">Vídeo</h2>
        <div className="flex flex-wrap gap-2">
          {(['low', 'medium', 'high'] as QualityLevel[]).map(q => (
            <button
              key={q}
              onClick={() => saveQuality(q)}
              className={`rounded-full px-4 py-2 text-sm font-black transition active:scale-95 ${
                quality === q ? 'bg-amber-400 text-black' : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {q === 'low' ? 'BAJA (60fps seguro)' : q === 'medium' ? 'MEDIA' : 'ALTA (bloom + sombras)'}
            </button>
          ))}
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm font-bold text-white/80">
          <input type="checkbox" checked={showSpeedo} onChange={e => saveSpeedo(e.target.checked)} className="h-4 w-4 accent-amber-400" />
          Mostrar velocímetro
        </label>
      </section>

      {/* audio */}
      <section className="rounded-2xl border border-white/10 bg-black/40 p-4">
        <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-white/50">Audio</h2>
        <label className="flex items-center gap-3 text-sm font-bold text-white/80">
          <span className="w-28 shrink-0">Música</span>
          <input
            type="range" min={0} max={1} step={0.05} value={musicVol}
            onChange={e => saveMusic(parseFloat(e.target.value))}
            className="h-2 w-full cursor-pointer accent-amber-400"
          />
          <span className="w-10 text-right font-mono text-xs text-amber-300">{Math.round(musicVol * 100)}</span>
        </label>
        <label className="mt-3 flex items-center gap-3 text-sm font-bold text-white/80">
          <span className="w-28 shrink-0">Efectos</span>
          <input
            type="range" min={0} max={1} step={0.05} value={sfxVol}
            onChange={e => saveSfx(parseFloat(e.target.value))}
            className="h-2 w-full cursor-pointer accent-amber-400"
          />
          <span className="w-10 text-right font-mono text-xs text-amber-300">{Math.round(sfxVol * 100)}</span>
        </label>
        <div className="mt-2 text-[11px] text-white/40">La música arranca con el primer clic de la sesión (política de los navegadores).</div>
      </section>

      {/* controls */}
      <section className="rounded-2xl border border-white/10 bg-black/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-white/50">Controles (teclado)</h2>
          <button onClick={resetBindings} className="rounded-lg bg-white/10 px-3 py-1 text-xs font-black text-white/70 hover:bg-white/20">
            RESTABLECER
          </button>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {bindings.map((b, i) => (
            <button
              key={`${b.action}-${i}`}
              onClick={() => setCapturing({ action: b.action, index: i })}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-bold transition ${
                capturing?.index === i
                  ? 'animate-pulse border-amber-400 bg-amber-400/20 text-amber-300'
                  : 'border-white/10 bg-white/5 text-white/80 hover:border-white/25'
              }`}
            >
              <span>{ACTION_LABEL[b.action]}</span>
              <span className="rounded-lg bg-black/50 px-2 py-0.5 font-mono text-xs text-amber-300">
                {capturing?.index === i ? 'PULSA UNA TECLA…' : prettyKey(b.code)}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 text-[11px] leading-relaxed text-white/40">
          El mando se configura solo: stick izquierdo para girar, gatillo derecho acelera, izquierdo frena,
          A/Cruz drift, B/Círculo objeto. ESC cancela una reasignación.
        </div>
      </section>
    </div>
  );

  if (embedded) return body;

  return (
    <div className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-[#141a2c] via-[#0d0a18] to-black">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-5 px-6 py-8">
        <header className="flex w-full items-center justify-between">
          <button onClick={onClose} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-black text-white/80 hover:bg-white/20">← VOLVER</button>
          <h1 className="text-2xl font-black tracking-wide text-white">OPCIONES</h1>
          <div className="w-[104px]" />
        </header>
        {body}
        <button
          onClick={onClose}
          className="mx-auto mb-4 w-full max-w-xs rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3 text-lg font-black tracking-wider text-black shadow-lg transition hover:scale-[1.02] active:scale-95"
        >
          GUARDAR Y VOLVER
        </button>
      </div>
    </div>
  );
}
