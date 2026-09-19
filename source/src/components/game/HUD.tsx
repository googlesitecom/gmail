'use client';

/**
 * APEX KART — In-race HUD overlay v2 (party-racer layout):
 * item slot top-left (big framed square), minimap + lap top-right, GIANT
 * position bottom-left, dial speedo + drift gauge bottom-right, boost
 * speed-lines at the screen edges. React renders the chrome; the minimap
 * and speedometer canvases are drawn by the engine each frame.
 */

import { useEffect, useState, type JSX } from 'react';
import { UIState } from '@/game/core/GameBridge';
import { ItemIcon, ITEM_NAME } from './ItemIcon';
import { ITEMS_LIST } from '@/game/items/ItemData';
import { formatMs } from '@/game/core/MathUtils';
import { AudioSys } from '@/game/core/AudioSystem';

const POS_COLOR = (p: number): string =>
  p === 1 ? '#ffd83a' : p === 2 ? '#e4ecf6' : p === 3 ? '#f0a45a' : '#ffffff';

const POS_GRAD = (p: number): string =>
  p === 1 ? 'linear-gradient(180deg,#ffe98a,#ffb02a)'
    : p === 2 ? 'linear-gradient(180deg,#ffffff,#aebccd)'
      : p === 3 ? 'linear-gradient(180deg,#ffd0a0,#d07a3a)'
        : 'linear-gradient(180deg,#ffffff55,#ffffff22)';

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
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* ------- boost speed-lines vignette ------- */}
      {state.boostActive && (
        <div className="apex-speedlines absolute inset-0" />
      )}

      {/* ------- top left: item slot + coins ------- */}
      <div className="absolute left-4 top-4 flex items-start gap-3">
        <div>
          <div
            className={`flex h-24 w-24 items-center justify-center rounded-[1.4rem] border-4 backdrop-blur-sm transition-all ${
              state.rouletteActive
                ? 'animate-pulse border-amber-300 bg-amber-300/20'
                : state.itemSlot
                  ? 'border-white/90 bg-gradient-to-br from-slate-900/70 to-slate-950/80 shadow-[0_0_24px_rgba(255,255,255,0.28),inset_0_2px_0_rgba(255,255,255,0.25)]'
                  : 'border-white/25 bg-black/40'
            }`}
          >
            {state.rouletteActive ? (
              <ItemIcon id={ITEMS_LIST[rouletteIdx % ITEMS_LIST.length].id} size={52} />
            ) : state.itemSlot ? (
              <div className="flex flex-col items-center">
                <ItemIcon id={state.itemSlot} size={52} />
                {state.itemCharges > 1 && (
                  <span className="apex-font -mt-1 rounded-md bg-amber-400 px-1.5 text-xs text-black">
                    ×{state.itemCharges}
                  </span>
                )}
              </div>
            ) : (
              <span className="apex-font text-4xl text-white/20">?</span>
            )}
          </div>
          {state.itemSlot && !state.rouletteActive && (
            <div className="apex-ui mt-1.5 text-center text-[11px] font-black uppercase tracking-wider text-white/80 [text-shadow:0_2px_4px_rgba(0,0,0,0.8)]">
              {ITEM_NAME[state.itemSlot]}
            </div>
          )}
        </div>
        {state.itemSlot2 && (
          <div>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-amber-300/90 bg-amber-400/15 shadow-[0_0_16px_rgba(255,200,60,0.4)] backdrop-blur-sm">
              <div className="flex flex-col items-center">
                <ItemIcon id={state.itemSlot2} size={34} />
                {state.itemCharges2 > 1 && (
                  <span className="apex-font rounded bg-amber-400 px-1 text-[10px] text-black">
                    ×{state.itemCharges2}
                  </span>
                )}
              </div>
            </div>
            <div className="apex-ui mt-1 text-center text-[9px] font-black tracking-wide text-amber-200/80">RESERVA</div>
          </div>
        )}
        {state.battle == null && (
          <div className="apex-panel flex items-center gap-2 rounded-2xl px-3 py-2">
            {/* golden coin */}
            <span
              className="inline-block h-6 w-6 rounded-full border-2 border-amber-200 shadow-[0_0_10px_rgba(255,200,60,0.65)]"
              style={{ background: 'radial-gradient(circle at 35% 30%, #ffe08a 0%, #ffc83a 55%, #c98f12 100%)' }}
            />
            <span className="apex-font text-2xl tabular-nums leading-none text-amber-200">{state.coins}</span>
            <span className="apex-ui text-xs font-bold text-white/40">/10</span>
          </div>
        )}
        {state.gp && (
          <div className="apex-panel apex-ui rounded-2xl px-3 py-2 text-[11px] font-bold text-white/85">
            {state.gp.cupName} · Pista {state.gp.trackIndex + 1}/{state.gp.trackCount} — {state.gp.trackName}
          </div>
        )}
      </div>

      {/* ------- top right: minimap + lap + mode info ------- */}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        {raceInfo && state.battle == null && (
          <div className="apex-panel flex items-center gap-2 rounded-2xl px-4 py-1.5">
            <span className="apex-checker h-4 w-4 rounded-sm" />
            <span className="apex-ui text-sm font-black uppercase tracking-wider text-white/85">Vuelta</span>
            <span className="apex-font text-2xl leading-none text-amber-300">{Math.min(state.lap + 1, state.laps)}</span>
            <span className="apex-font text-lg leading-none text-white/45">/{state.laps}</span>
          </div>
        )}
        <canvas ref={minimapRef} width={190} height={150} className="rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.45)]" />
        {state.battle && (
          <div className="apex-panel rounded-2xl px-3 py-2 text-right">
            <div className="flex items-center justify-end gap-1.5 text-lg font-black">
              {Array.from({ length: 3 }).map((_, i) => (
                <span key={i} className={i < state.battle!.hp ? 'text-rose-500' : 'text-white/20'}>●</span>
              ))}
            </div>
            <div className="apex-ui mt-0.5 flex items-center gap-3 text-sm font-bold">
              <span className="text-rose-400">ROJO {state.battle.redAlive}</span>
              <span className="text-white/60 tabular-nums">{state.battle.timeLeft}s</span>
              <span className="text-sky-400">{state.battle.blueAlive} AZUL</span>
            </div>
          </div>
        )}
        {state.timeTrial && (
          <div className="apex-panel rounded-2xl px-3 py-2 text-right font-mono text-sm">
            <div className="apex-ui text-white/60 text-[11px] font-sans font-semibold">VUELTA ACTUAL</div>
            <div className="apex-font text-xl text-emerald-300">{formatMs(state.timeTrial.lapMs)}</div>
            <div className="apex-ui mt-1 text-white/60 text-[11px] font-sans font-semibold">MEJOR</div>
            <div className="font-bold">{formatMs(state.timeTrial.bestLapMs ?? 0)}</div>
            <div className="apex-ui mt-1 text-white/60 text-[11px] font-sans font-semibold">TOTAL</div>
            <div className="font-bold">{formatMs(state.timeTrial.totalMs)}</div>
          </div>
        )}
      </div>

      {/* ------- bottom left: GIANT position ------- */}
      <div className="absolute bottom-5 left-5">
        <div className="flex items-end gap-2.5">
          <span
            className="apex-font apex-outline text-[7.5rem] leading-[0.85] sm:text-[9rem]"
            style={{ color: POS_COLOR(state.position) }}
          >
            {state.position}
          </span>
          <div className="mb-4 flex flex-col gap-1.5">
            <span
              className="apex-font rounded-lg px-2.5 py-0.5 text-xl text-[#1a1026]"
              style={{ background: POS_GRAD(state.position) }}
            >
              {ORDINAL[state.position] ?? ''}
            </span>
            <span className="apex-ui text-xs font-black text-white/50 [text-shadow:0_2px_4px_rgba(0,0,0,0.8)]">
              de {state.totalKarts}
            </span>
          </div>
        </div>
      </div>

      {/* ------- bottom right: speedo + drift gauge ------- */}
      <div className="absolute bottom-5 right-5 flex flex-col items-end gap-2">
        <button
          className="pointer-events-auto rounded-full bg-black/45 px-2.5 py-1.5 text-base backdrop-blur-sm transition hover:bg-black/65"
          title="Música (M)"
          onClick={() => setMuted(AudioSys.toggleMusic())}
        >
          {muted ? '🔇' : '🎵'}
        </button>
        {state.driftLevel > 0 && (
          <div className="flex gap-1.5 rounded-full bg-black/45 px-3 py-1.5 backdrop-blur-sm">
            {[1, 2, 3].map(l => (
              <span
                key={l}
                className={`h-3 w-7 rounded-full transition-all ${l <= state.driftLevel ? '' : 'bg-white/15'}`}
                style={l <= state.driftLevel ? { background: driftColors[l - 1], boxShadow: `0 0 10px ${driftColors[l - 1]}` } : undefined}
              />
            ))}
          </div>
        )}
        <canvas ref={speedoRef} width={170} height={150} className="drop-shadow-[0_8px_20px_rgba(0,0,0,0.5)]" />
      </div>

      {/* ------- center: countdown ------- */}
      {state.countdown != null && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            key={state.countdown}
            className={`apex-font apex-outline text-[10rem] leading-none sm:text-[12rem] ${
              state.countdown === 0 ? 'text-emerald-400' :
              state.countdown === 1 ? 'text-amber-300' : 'text-white'
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
            className={`apex-font rounded-full px-5 py-1.5 text-base tracking-wide shadow-[0_4px_0_rgba(0,0,0,0.35)] ${
              a.tone === 'good' ? 'bg-emerald-500/90 text-white' :
              a.tone === 'bad' ? 'bg-rose-600/90 text-white' :
              a.tone === 'hype' ? 'bg-amber-400/95 text-black' : 'bg-black/65 text-white'
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
          <div className="apex-panel rounded-3xl px-10 py-6 text-center backdrop-blur">
            <div className="apex-font text-3xl text-amber-300">ESPERANDO RIVALES…</div>
            <button
              className="apex-btn apex-font pointer-events-auto mt-4 rounded-xl bg-gradient-to-b from-amber-300 to-orange-500 px-6 py-2.5 text-black"
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
