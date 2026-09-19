'use client';

/**
 * APEX KART — In-race HUD overlay.
 * Position/lap/item/countdown/announcer live here (React); the minimap and
 * speedometer canvases are drawn by the engine each frame.
 */

import { useEffect, useState, type JSX } from 'react';
import { UIState } from '@/game/core/GameBridge';
import { ItemIcon, ITEM_NAME } from './ItemIcon';
import { ITEMS_LIST } from '@/game/items/ItemData';
import { formatMs } from '@/game/core/MathUtils';
import { AudioSys } from '@/game/core/AudioSystem';

const POS_COLOR = (p: number): string =>
  p === 1 ? '#ffd83a' : p === 2 ? '#d8e0ec' : p === 3 ? '#e8a05a' : '#ffffff';

const ORDINAL = ['', '1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º', '10º', '11º', '12º'];

export function HUD({ state, minimapRef, speedoRef, onContinue }: {
  state: UIState;
  minimapRef: React.RefObject<HTMLCanvasElement | null>;
  speedoRef: React.RefObject<HTMLCanvasElement | null>;
  onContinue: () => void;
}): JSX.Element {
  // ---- item roulette animation ----
  const [rouletteIdx, setRouletteIdx] = useState(0);
  const [muted, setMuted] = useState(AudioSys.musicMuted);
  // M key toggles music anywhere during a race
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.code === 'KeyM') setMuted(AudioSys.toggleMusic());
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => {
    if (!state.rouletteActive) return;
    const iv = setInterval(() => setRouletteIdx(i => (i + 1) % ITEMS_LIST.length), 80);
    return () => clearInterval(iv);
  }, [state.rouletteActive]);

  const driftColors = ['#4ac8ff', '#ffa53a', '#b45aff'];
  const raceInfo = state.timeTrial == null;

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-sans">
      {/* ------- top left: position + lap ------- */}
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <span
            className="text-6xl font-black leading-none drop-shadow-[0_3px_0_rgba(0,0,0,0.45)]"
            style={{ color: POS_COLOR(state.position) }}
          >
            {state.position}
          </span>
          <span className="mb-1.5 text-xl font-bold text-white/80 drop-shadow">{ORDINAL[state.position] ?? ''}</span>
          <span className="mb-1.5 text-sm text-white/50">/ {state.totalKarts}</span>
        </div>
        {raceInfo && state.battle == null && (
          <div className="rounded-xl bg-black/45 px-3 py-1.5 text-lg font-bold tracking-wide backdrop-blur-sm">
            VUELTA <span className="text-amber-300">{Math.min(state.lap + 1, state.laps)}</span>
            <span className="text-white/50">/{state.laps}</span>
          </div>
        )}
        {state.battle == null && (
          <div className="flex items-center gap-2 rounded-xl bg-black/45 px-3 py-1.5 backdrop-blur-sm">
            {/* golden coin */}
            <span
              className="inline-block h-5 w-5 rounded-full border-2 border-amber-200 shadow-[0_0_8px_rgba(255,200,60,0.6)]"
              style={{ background: 'radial-gradient(circle at 35% 30%, #ffe08a 0%, #ffc83a 55%, #c98f12 100%)' }}
            />
            <span className="text-lg font-black tabular-nums text-amber-200">{state.coins}</span>
            <span className="text-sm font-bold text-white/40">/10</span>
          </div>
        )}
        {state.gp && (
          <div className="rounded-xl bg-black/45 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur-sm">
            {state.gp.cupName} · Pista {state.gp.trackIndex + 1}/{state.gp.trackCount} — {state.gp.trackName}
          </div>
        )}
      </div>

      {/* ------- top right: minimap + mode info ------- */}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <canvas ref={minimapRef} width={190} height={150} className="rounded-2xl shadow-lg" />
        {state.battle && (
          <div className="rounded-xl bg-black/50 px-3 py-2 text-right backdrop-blur-sm">
            <div className="flex items-center justify-end gap-1.5 text-lg font-black">
              {Array.from({ length: 3 }).map((_, i) => (
                <span key={i} className={i < state.battle!.hp ? 'text-rose-500' : 'text-white/20'}>●</span>
              ))}
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-sm font-bold">
              <span className="text-rose-400">ROJO {state.battle.redAlive}</span>
              <span className="text-white/60 tabular-nums">{state.battle.timeLeft}s</span>
              <span className="text-sky-400">{state.battle.blueAlive} AZUL</span>
            </div>
          </div>
        )}
        {state.timeTrial && (
          <div className="rounded-xl bg-black/50 px-3 py-2 text-right font-mono text-sm backdrop-blur-sm">
            <div className="text-white/60 text-[11px] font-sans font-semibold">VUELTA ACTUAL</div>
            <div className="text-xl font-bold text-emerald-300">{formatMs(state.timeTrial.lapMs)}</div>
            <div className="mt-1 text-white/60 text-[11px] font-sans font-semibold">MEJOR</div>
            <div className="font-bold">{formatMs(state.timeTrial.bestLapMs ?? 0)}</div>
            <div className="mt-1 text-white/60 text-[11px] font-sans font-semibold">TOTAL</div>
            <div className="font-bold">{formatMs(state.timeTrial.totalMs)}</div>
          </div>
        )}
      </div>

      {/* ------- bottom left: item slots (golden doubles add a 2nd slot) ------- */}
      <div className="absolute bottom-5 left-5 flex items-end gap-2">
        <div>
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-2xl border-4 backdrop-blur-sm transition-all ${
              state.rouletteActive
                ? 'animate-pulse border-amber-300 bg-amber-300/20'
                : state.itemSlot
                  ? 'border-white/80 bg-black/55 shadow-[0_0_18px_rgba(255,255,255,0.25)]'
                  : 'border-white/25 bg-black/35'
            }`}
          >
            {state.rouletteActive ? (
              <ItemIcon id={ITEMS_LIST[rouletteIdx % ITEMS_LIST.length].id} size={44} />
            ) : state.itemSlot ? (
              <div className="flex flex-col items-center">
                <ItemIcon id={state.itemSlot} size={44} />
                {state.itemCharges > 1 && (
                  <span className="mt-0.5 rounded bg-amber-400 px-1.5 text-xs font-black text-black">
                    ×{state.itemCharges}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-3xl font-black text-white/20">?</span>
            )}
          </div>
          {state.itemSlot && !state.rouletteActive && (
            <div className="mt-1 text-center text-[11px] font-bold tracking-wide text-white/70">
              {ITEM_NAME[state.itemSlot]}
            </div>
          )}
        </div>
        {state.itemSlot2 && (
          <div>
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-amber-300/80 bg-amber-400/15 shadow-[0_0_14px_rgba(255,200,60,0.35)] backdrop-blur-sm">
              <div className="flex flex-col items-center">
                <ItemIcon id={state.itemSlot2} size={30} />
                {state.itemCharges2 > 1 && (
                  <span className="rounded bg-amber-400 px-1 text-[10px] font-black text-black">
                    ×{state.itemCharges2}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-1 text-center text-[9px] font-bold tracking-wide text-amber-200/80">RESERVA</div>
          </div>
        )}
      </div>

      {/* ------- bottom right: speedometer + drift gauge ------- */}
      <div className="absolute bottom-5 right-5 flex flex-col items-end gap-2">
        <button
          className="pointer-events-auto rounded-full bg-black/45 px-2.5 py-1.5 text-base backdrop-blur-sm transition hover:bg-black/65"
          title="Música (M)"
          onClick={() => setMuted(AudioSys.toggleMusic())}
        >
          {muted ? '🔇' : '🎵'}
        </button>
        {state.driftLevel > 0 && (
          <div className="flex gap-1.5 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm">
            {[1, 2, 3].map(l => (
              <span
                key={l}
                className={`h-3 w-6 rounded-full transition-all ${l <= state.driftLevel ? '' : 'bg-white/15'}`}
                style={l <= state.driftLevel ? { background: driftColors[l - 1], boxShadow: `0 0 8px ${driftColors[l - 1]}` } : undefined}
              />
            ))}
          </div>
        )}
        <canvas ref={speedoRef} width={150} height={130} className="drop-shadow-lg" />
      </div>

      {/* ------- center: countdown ------- */}
      {state.countdown != null && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            key={state.countdown}
            className={`text-[9rem] font-black leading-none drop-shadow-[0_6px_0_rgba(0,0,0,0.4)] ${
              state.countdown === 0 ? 'text-emerald-400' : 'text-white'
            }`}
            style={{ animation: 'countdownPop 0.85s ease-out' }}
          >
            {state.countdown === 0 ? '¡YA!' : state.countdown}
          </div>
        </div>
      )}

      {/* ------- announcer banners ------- */}
      <div className="absolute left-1/2 top-16 flex -translate-x-1/2 flex-col items-center gap-1.5">
        {state.announcer.map(a => (
          <div
            key={a.id}
            className={`rounded-full px-5 py-1.5 text-lg font-black tracking-wide backdrop-blur-sm ${
              a.tone === 'good' ? 'bg-emerald-500/80' :
              a.tone === 'bad' ? 'bg-rose-600/80' :
              a.tone === 'hype' ? 'bg-amber-400/90 text-black' : 'bg-black/60'
            }`}
            style={{ animation: 'bannerIn 0.25s ease-out' }}
          >
            {a.text}
          </div>
        ))}
      </div>

      {/* ------- finished: prompt ------- */}
      {state.phase === 'finished' && !state.results && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-2xl bg-black/70 px-10 py-6 text-center backdrop-blur">
            <div className="text-3xl font-black text-amber-300">ESPERANDO RIVALES…</div>
            <button
              className="pointer-events-auto mt-4 rounded-xl bg-amber-400 px-6 py-2.5 font-black text-black transition hover:bg-amber-300"
              onClick={onContinue}
            >
              VER RESULTADOS
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes countdownPop {
          0% { transform: scale(2.2); opacity: 0; }
          30% { transform: scale(1); opacity: 1; }
          80% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.85); opacity: 0; }
        }
        @keyframes bannerIn {
          from { transform: translateY(-12px) scale(0.9); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
