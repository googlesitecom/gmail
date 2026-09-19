'use client';

/**
 * APEX KART — Mode configuration + cup/track selection screens.
 * GP: difficulty & mirror · TT: track + records · VS: full config · Battle: arena + time.
 */

import { useState, type JSX } from 'react';
import { Difficulty, GameMode, TrackTheme } from '@/game/core/Types';
import { ARENAS, CUPS, TRACKS } from '@/game/tracks/TrackCatalog';
import { SaveData } from '@/game/persistence/SaveData';
import { formatMs } from '@/game/core/MathUtils';

const THEME_UI: Record<TrackTheme, { grad: string; emoji: string }> = {
  meadow:  { grad: 'from-emerald-400 to-lime-600', emoji: '🌿' },
  desert:  { grad: 'from-amber-300 to-orange-600', emoji: '🌵' },
  beach:   { grad: 'from-sky-300 to-amber-400', emoji: '🏖️' },
  city:    { grad: 'from-indigo-900 to-fuchsia-700', emoji: '🌃' },
  snow:    { grad: 'from-sky-100 to-sky-400', emoji: '🏔️' },
  volcano: { grad: 'from-orange-600 to-red-900', emoji: '🌋' },
  castle:  { grad: 'from-stone-400 to-amber-700', emoji: '🏰' },
  space:   { grad: 'from-slate-800 to-violet-900', emoji: '🚀' },
  jungle:  { grad: 'from-green-600 to-emerald-900', emoji: '🌴' },
  factory: { grad: 'from-zinc-500 to-amber-800', emoji: '⚙️' },
  glacier: { grad: 'from-cyan-200 to-blue-500', emoji: '🧊' },
  prism:   { grad: 'from-fuchsia-500 via-cyan-400 to-amber-300', emoji: '🌈' },
};

function Header({ onBack, title }: { onBack: () => void; title: string }): JSX.Element {
  return (
    <header className="relative z-10 flex w-full items-center justify-between">
      <button onClick={onBack} className="apex-btn rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white/85">
        <span>← VOLVER</span>
      </button>
      <h1 className="apex-font apex-title text-3xl">{title}</h1>
      <div className="w-[104px]" />
    </header>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-black transition-all active:scale-95 ${
        active ? 'bg-amber-400 text-black shadow-lg' : 'bg-white/10 text-white/70 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- mode config

export interface ModeConfigDraft {
  difficulty: Difficulty;
  mirror: boolean;
  laps: number;
  aiCount: number;
  items: boolean;
  rubber: number;
  battleTime: number;
}

export function ModeConfig({ mode, draft, setDraft, onBack, onNext }: {
  mode: GameMode;
  draft: ModeConfigDraft;
  setDraft: (d: Partial<ModeConfigDraft>) => void;
  onBack: () => void;
  onNext: () => void;
}): JSX.Element {
  const mirrorUnlocked = SaveData.mirrorUnlocked;
  const nextLabel = mode === 'grandprix' ? 'ELEGIR COPA →' : mode === 'battle' ? '¡A LA ARENA!' : 'ELEGIR PISTA →';

  return (
    <div className="apex-bg absolute inset-0 overflow-y-auto">
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-2xl flex-col items-center gap-6 px-6 py-8">
        <Header onBack={onBack} title="CONFIGURA LA PARTIDA" />

        {mode === 'grandprix' && (
          <section className="w-full rounded-2xl border border-white/10 bg-black/40 p-5">
            <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-white/50">Cilindrada</h2>
            <div className="flex flex-wrap gap-2">
              {([50, 100, 150, 200] as Difficulty[]).map(cc => (
                <Pill key={cc} active={draft.difficulty === cc} onClick={() => setDraft({ difficulty: cc })}>
                  {cc}cc{cc === 200 ? ' ⚡' : ''}
                </Pill>
              ))}
            </div>
            {draft.difficulty === 200 && (
              <div className="mt-2 rounded-lg border border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-2 text-[11px] font-bold text-fuchsia-200">
                200cc EXTREMO: velocidad brutal — frena antes de las curvas y derrapa para sobrevivir.
              </div>
            )}
            <h2 className="mb-3 mt-5 text-sm font-black uppercase tracking-widest text-white/50">Espejo</h2>
            <button
              disabled={!mirrorUnlocked}
              onClick={() => setDraft({ mirror: !draft.mirror })}
              className={`w-full rounded-2xl border-2 p-4 text-left font-black transition ${
                !mirrorUnlocked
                  ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/30'
                  : draft.mirror
                    ? 'border-amber-400 bg-amber-400/15 text-white'
                    : 'border-white/15 bg-white/5 text-white/70 hover:border-white/30'
              }`}
            >
              🪞 MODO ESPEJO {draft.mirror ? '— ACTIVADO' : ''}
              <div className="mt-1 text-[11px] font-semibold text-white/50">
                {mirrorUnlocked ? 'La pista reflejada: todas las curvas al revés.' : 'Gana las 4 copas para desbloquear.'}
              </div>
            </button>
            <div className="mt-4 text-xs text-white/40">
              3 pistas por copa · puntuación 15/12/10/8… · podio y desbloqueos al final.
              {draft.difficulty >= 150 && ' En 150/200cc la IA remonta con más ganas (modo injusto).'}
            </div>
          </section>
        )}

        {mode === 'vs' && (
          <section className="w-full space-y-5 rounded-2xl border border-white/10 bg-black/40 p-5">
            <div>
              <h2 className="mb-2 text-sm font-black uppercase tracking-widest text-white/50">Cilindrada</h2>
              <div className="flex flex-wrap gap-2">
                {([50, 100, 150, 200] as Difficulty[]).map(cc => (
                  <Pill key={cc} active={draft.difficulty === cc} onClick={() => setDraft({ difficulty: cc })}>{cc}cc{cc === 200 ? ' ⚡' : ''}</Pill>
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-2 text-sm font-black uppercase tracking-widest text-white/50">Vueltas: {draft.laps}</h2>
              <div className="flex gap-2">{[1, 2, 3, 5].map(l => (
                <Pill key={l} active={draft.laps === l} onClick={() => setDraft({ laps: l })}>{l}</Pill>
              ))}</div>
            </div>
            <div>
              <h2 className="mb-2 text-sm font-black uppercase tracking-widest text-white/50">Rivales IA: {draft.aiCount}</h2>
              <input
                type="range" min={0} max={11} value={draft.aiCount}
                onChange={e => setDraft({ aiCount: +e.target.value })}
                className="w-full accent-amber-400"
              />
            </div>
            <div>
              <h2 className="mb-2 text-sm font-black uppercase tracking-widest text-white/50">Objetos</h2>
              <div className="flex gap-2">
                <Pill active={draft.items} onClick={() => setDraft({ items: true })}>CON objetos</Pill>
                <Pill active={!draft.items} onClick={() => setDraft({ items: false })}>SIN objetos</Pill>
              </div>
            </div>
            <div>
              <h2 className="mb-2 text-sm font-black uppercase tracking-widest text-white/50">
                Rubber-banding IA: {Math.round(draft.rubber * 100)}%
              </h2>
              <input
                type="range" min={0} max={100} value={Math.round(draft.rubber * 100)}
                onChange={e => setDraft({ rubber: +e.target.value / 100 })}
                className="w-full accent-amber-400"
              />
              <div className="mt-1 text-[11px] text-white/40">0% = IA pura · 100% = te persigue (injusto solo en 150cc)</div>
            </div>
          </section>
        )}

        {mode === 'battle' && (
          <section className="w-full rounded-2xl border border-white/10 bg-black/40 p-5">
            <h2 className="mb-2 text-sm font-black uppercase tracking-widest text-white/50">Duración</h2>
            <div className="flex gap-2">
              {[120, 180, 240].map(t => (
                <Pill key={t} active={draft.battleTime === t} onClick={() => setDraft({ battleTime: t })}>
                  {t / 60} min
                </Pill>
              ))}
            </div>
            <div className="mt-4 text-xs leading-relaxed text-white/40">
              6 vs 6 (tu equipo es el rojo). Cada kart tiene 3 puntos de vida: los objetos restan 1.
              Gana el equipo con más karts vivos al final. ¡Los escudos orbitales bloquean impactos!
            </div>
          </section>
        )}

        {mode === 'timetrial' && (
          <section className="w-full rounded-2xl border border-white/10 bg-black/40 p-5 text-sm leading-relaxed text-white/60">
            Contrarreloj puro: tú, la pista y tu fantasma. Sin rivales ni objetos.
            Cada vuelta y cada récord se guardan; tu mejor carrera se convierte en el fantasma a batir.
          </section>
        )}

        <button
          onClick={onNext}
          className="apex-btn mb-4 w-full max-w-xs rounded-xl bg-gradient-to-r from-amber-300 via-orange-400 to-red-500 py-3.5 text-lg font-black tracking-wider text-black"
        >
          <span>{nextLabel}</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- cup select

export function CupSelect({ onPick, onBack }: {
  onPick: (cupId: string) => void;
  onBack: () => void;
}): JSX.Element {
  const cupIcons = ['🥇', '⚙️', '❄️', '🌌'];
  return (
    <div className="apex-bg absolute inset-0 overflow-y-auto">
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-3xl flex-col items-center gap-6 px-6 py-8">
        <Header onBack={onBack} title="ELIGE COPA" />
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {CUPS.map((cup, i) => {
            const locked = !!cup.unlockAfter && !SaveData.cupChainReady(cup.unlockAfter);
            const won = SaveData.cupChainReady(cup.id);
            return (
              <button
                key={cup.id}
                disabled={locked}
                onClick={() => onPick(cup.id)}
                className={`relative overflow-hidden rounded-2xl border-2 p-5 text-left transition-all ${
                  locked
                    ? 'cursor-not-allowed border-white/10 bg-white/5 opacity-50'
                    : 'border-white/15 bg-white/5 hover:scale-[1.02] hover:border-amber-400/60 active:scale-95'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{cupIcons[i]}</span>
                  <div>
                    <div className="text-xl font-black text-white">{cup.name}</div>
                    <div className="text-[11px] font-semibold text-white/50">
                      {cup.tracks.map(t => TRACKS[t].name).join(' · ')}
                    </div>
                  </div>
                </div>
                {won && <span className="absolute right-3 top-3 text-xs font-black text-amber-400">✓ GANADA</span>}
                {locked && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/65 text-sm font-black text-white/80">
                    🔒 Gana la {CUPS.find(c => c.id === cup.unlockAfter)?.name}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- track select

export function TrackSelect({ onPick, onBack, showBest, title, exclude }: {
  onPick: (trackId: string) => void;
  onBack: () => void;
  showBest: boolean;
  title: string;
  exclude?: string[];
}): JSX.Element {
  const [, force] = useState(0);
  const list = Object.values(TRACKS).filter(t => !exclude?.includes(t.id));
  return (
    <div className="apex-bg absolute inset-0 overflow-y-auto">
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-4xl flex-col items-center gap-6 px-6 py-8">
        <Header onBack={onBack} title={title} />
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map(t => {
            const ui = THEME_UI[t.theme];
            const best = SaveData.getBestRace(t.id);
            const bestLap = SaveData.getBestLap(t.id);
            return (
              <button
                key={t.id}
                onClick={() => { onPick(t.id); force(n => n + 1); }}
                className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${ui.grad} p-4 text-left shadow-lg transition-all hover:scale-[1.03] active:scale-95`}
              >
                <div className="text-3xl">{ui.emoji}</div>
                <div className="mt-2 text-base font-black leading-tight text-white drop-shadow">{t.name}</div>
                <div className="text-[10px] font-bold text-white/70">{t.laps} vueltas · {(t.shortcuts?.length ?? 0)} atajos</div>
                {showBest && (
                  <div className="mt-1.5 rounded-lg bg-black/40 px-2 py-1 font-mono text-[10px] text-white/90">
                    {best ? formatMs(best.time) : '--:--.---'}
                    {bestLap ? ` · ${formatMs(bestLap)}` : ''}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {showBest && (
          <div className="text-xs text-white/40">Récord total · mejor vuelta — guardados en este dispositivo</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- arena select

export function ArenaSelect({ onPick, onBack }: {
  onPick: (arenaId: string) => void;
  onBack: () => void;
}): JSX.Element {
  const icons: Record<string, string> = { arena_meadow: '🏟️', arena_factory: '🏭', arena_volcano: '🌋' };
  return (
    <div className="apex-bg absolute inset-0 overflow-y-auto">
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-3xl flex-col items-center gap-6 px-6 py-8">
        <Header onBack={onBack} title="ELIGE ARENA" />
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {Object.values(ARENAS).map(a => {
            const ui = THEME_UI[a.theme];
            return (
              <button
                key={a.id}
                onClick={() => onPick(a.id)}
                className={`rounded-2xl bg-gradient-to-br ${ui.grad} p-5 text-center shadow-lg transition-all hover:scale-[1.03] active:scale-95`}
              >
                <div className="text-4xl">{icons[a.id] ?? '🏟️'}</div>
                <div className="mt-2 text-lg font-black text-white drop-shadow">{a.name}</div>
                <div className="text-[11px] font-bold text-white/70">{a.obstacles.length} obstáculos · r {a.radius}m</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
