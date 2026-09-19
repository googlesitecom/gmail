'use client';

/**
 * APEX KART — Online multiplayer: nickname → create/join room by code →
 * lobby (pick character + kart color, host configures the race) → the host
 * starts and every client launches the same session via race:start.
 */

import { useEffect, useRef, useState, type JSX } from 'react';
import { CHARACTERS } from '@/game/karts/KartStats';
import { TRACKS } from '@/game/tracks/TrackCatalog';
import type { NetClient } from '@/game/net/NetClient';
import type { NetRoomState } from '@/game/net/NetTypes';

const PALETTE = [0xe03030, 0x2f6fe0, 0x28b85c, 0xe8b52a, 0xb04ae0, 0xe06a2a,
  0x28c8c8, 0xe84a8a, 0x8a9aa8, 0x5a3a28, 0x88d838, 0xf0f0f4];

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

export function OnlineScreen({ net, character, kartColor, setCharacter, setKartColor, onBack }: {
  net: NetClient;
  character: string;
  kartColor: number;
  setCharacter: (id: string) => void;
  setKartColor: (c: number) => void;
  onBack: () => void;
}): JSX.Element {
  const [nickname, setNickname] = useState(() => localStorage.getItem('apexNick') ?? '');
  const [room, setRoom] = useState<NetRoomState | null>(net.room);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(net.status);
  const [copied, setCopied] = useState('');
  const roomRef = useRef<NetRoomState | null>(net.room);
  const characterRef = useRef(character);
  const colorRef = useRef(kartColor);
  characterRef.current = character;
  colorRef.current = kartColor;

  // deep link: https://…/gmail/?sala=CODE prefills (and auto-joins with a
  // saved nickname) so hosts can share one clickable link
  useEffect(() => {
    const sala = new URLSearchParams(window.location.search).get('sala');
    if (!sala) return;
    const code = sala.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (!code) return;
    setJoinCode(code);
    const nick = localStorage.getItem('apexNick');
    if (nick) {
      // one-shot: read the CURRENT picks, never re-run on later changes
      const t = setTimeout(() => { void net.joinRoom(code, nick, characterRef.current, colorRef.current); }, 250);
      return () => clearTimeout(t);
    }
  }, [net]);

  // keep the latest room for render + host checks
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    net.useHooks({
      onStatus: s => setStatus(s),
      onRoomState: r => { setRoom(r); roomRef.current = r; },
    });
    return () => net.useHooks({ onStatus: null, onRoomState: null });
  }, [net]);

  // NOTE: no leave-on-unmount here! The screen unmounts when a race STARTS
  // (GameShell swaps to the race UI) — leaving the room then would drop the
  // host mid-race. Leaving happens ONLY via the explicit back button, page
  // close/refresh (socket disconnect) or GameShell's backToMenu.

  const myName = (): string => {
    const n = nickname.trim().slice(0, 14);
    if (n) localStorage.setItem('apexNick', n);
    return n || 'Piloto';
  };

  const handleCreate = async (): Promise<void> => {
    setBusy(true); setError('');
    const r = await net.createRoom(myName(), character, kartColor);
    setBusy(false);
    if (!r) setError(net.lastError || 'No se pudo crear la sala');
  };

  const handleBack = (): void => {
    net.leaveRoom();
    onBack();
  };

  const handleJoin = async (): Promise<void> => {
    if (joinCode.trim().length < 3) { setError('Escribe el código de la sala'); return; }
    setBusy(true); setError('');
    const r = await net.joinRoom(joinCode, myName(), character, kartColor);
    setBusy(false);
    if (!r) setError(net.lastError || 'Sala no encontrada');
  };

  const isHost = room?.hostId === net.myId;
  const cfg = room?.config;

  const copy = async (text: string, tag: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(''), 1600);
    } catch { /* clipboard blocked — the code is on screen anyway */ }
  };

  const shareLink = room ? `${window.location.origin}${window.location.pathname}?sala=${room.code}` : '';

  // ------------------------------------------------------------------ lobby
  if (room && cfg) {
    return (
      <div className="apex-bg absolute inset-0 overflow-y-auto">
        <div className="relative z-10 mx-auto flex min-h-full w-full max-w-4xl flex-col gap-5 px-5 py-8">

          {/* header: code + connection */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="apex-font text-3xl text-amber-300">SALA ONLINE</div>
              <div className="mt-1 text-xs font-bold text-white/50">
                Comparte este código con tus amigos
              </div>
            </div>
            <div className="apex-panel flex items-center gap-3 rounded-xl px-5 py-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Código</span>
              <span className="apex-font text-4xl tracking-[0.3em] text-white">{room.code}</span>
              <button
                onClick={() => void copy(room.code, 'code')}
                className="apex-btn rounded-lg bg-white/10 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-white/20"
              >
                {copied === 'code' ? '¡COPIADO!' : 'COPIAR'}
              </button>
              <span className={`ml-2 flex items-center gap-1.5 text-xs font-black ${status === 'connected' ? 'text-emerald-400' : 'text-rose-400'}`}>
                <span className={`inline-block h-2 w-2 rounded-full ${status === 'connected' ? 'bg-emerald-400 apex-pulse' : 'bg-rose-400'}`} />
                {status === 'connected' ? 'CONECTADO' : 'CONECTANDO…'}
              </span>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
            {/* players */}
            <div className="apex-panel rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-widest text-white/50">
                  Pilotos ({room.players.length}/8)
                </span>
                <span className="text-[11px] font-bold text-white/35">El anfitrión configura la carrera</span>
              </div>
              <div className="flex flex-col gap-2">
                {room.players.map(p => (
                  <div key={p.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${p.id === net.myId ? 'bg-amber-400/15' : 'bg-white/5'}`}>
                    <span className="h-6 w-6 shrink-0 rounded-full border-2" style={{ borderColor: hex(p.color), background: hex(p.color) }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-white">
                        {p.name} {p.id === room.hostId && <span className="ml-1 rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-black">ANFITRIÓN</span>}
                        {p.id === net.myId && <span className="ml-1 text-[10px] font-black text-amber-300">(TÚ)</span>}
                      </div>
                      <div className="text-[11px] font-bold text-white/45">
                        {CHARACTERS.find(c => c.id === p.charId)?.displayName ?? p.charId}
                      </div>
                    </div>
                  </div>
                ))}
                {room.players.length < 2 && (
                  <div className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-xs font-bold text-white/35">
                    Esperando a que entren rivales con el código…
                  </div>
                )}
              </div>
            </div>

            {/* my setup + host config */}
            <div className="flex flex-col gap-4">
              <div className="apex-panel rounded-2xl p-4">
                <div className="mb-2 text-xs font-black uppercase tracking-widest text-white/50">Tu corredor</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {CHARACTERS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setCharacter(c.id); net.updatePlayer({ charId: c.id }); }}
                      className={`rounded-lg px-1.5 py-2 text-[10px] font-black transition ${character === c.id ? 'bg-amber-400 text-black' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                    >
                      {c.displayName}
                    </button>
                  ))}
                </div>
                <div className="mb-2 mt-3 text-xs font-black uppercase tracking-widest text-white/50">Color de kart</div>
                <div className="flex flex-wrap gap-1.5">
                  {PALETTE.map(col => (
                    <button
                      key={col}
                      onClick={() => { setKartColor(col); net.updatePlayer({ color: col }); }}
                      className={`h-7 w-7 rounded-md border-2 transition ${kartColor === col ? 'border-white scale-110' : 'border-white/20'}`}
                      style={{ background: hex(col) }}
                    />
                  ))}
                </div>
              </div>

              {isHost ? (
                <div className="apex-panel flex flex-col gap-3 rounded-2xl p-4">
                  <div className="text-xs font-black uppercase tracking-widest text-white/50">Configuración de carrera</div>
                  <div>
                    <div className="mb-1 text-[11px] font-bold text-white/45">Pista</div>
                    <select
                      value={cfg.trackId}
                      onChange={e => net.setConfig({ trackId: e.target.value })}
                      className="w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-sm font-bold text-white"
                    >
                      {Object.values(TRACKS).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="mb-1 text-[11px] font-bold text-white/45">Vueltas</div>
                      <select
                        value={cfg.laps}
                        onChange={e => net.setConfig({ laps: Number(e.target.value) })}
                        className="w-full rounded-lg border border-white/15 bg-black/60 px-2 py-2 text-sm font-bold text-white"
                      >
                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] font-bold text-white/45">Cilindrada</div>
                      <select
                        value={cfg.cc}
                        onChange={e => net.setConfig({ cc: Number(e.target.value) as 50 | 100 | 150 | 200 })}
                        className="w-full rounded-lg border border-white/15 bg-black/60 px-2 py-2 text-sm font-bold text-white"
                      >
                        <option value={50}>50cc</option>
                        <option value={100}>100cc</option>
                        <option value={150}>150cc</option>
                        <option value={200}>200cc ⚡</option>
                      </select>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] font-bold text-white/45">Objetos</div>
                      <button
                        onClick={() => net.setConfig({ items: !cfg.items })}
                        className={`w-full rounded-lg px-2 py-2 text-sm font-black transition ${cfg.items ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white/50'}`}
                      >
                        {cfg.items ? 'SÍ' : 'NO'}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => net.startRace()}
                    className="apex-btn mt-1 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3 text-lg font-black tracking-wider text-black"
                  >
                    ¡EMPEZAR CARRERA!
                  </button>
                  <div className="text-center text-[11px] font-bold text-white/40">
                    Los puestos libres se rellenan con CPU (parrilla de 12)
                  </div>
                </div>
              ) : (
                <div className="apex-panel flex items-center justify-center gap-2 rounded-2xl p-5 text-sm font-bold text-white/50">
                  <span className="apex-pulse inline-block h-2 w-2 rounded-full bg-amber-300" />
                  Esperando a que el anfitrión empiece…
                </div>
              )}
            </div>
          </div>

          {/* host: the room lives in this tab — share link + keep-open warning */}
          {isHost && (
            <div className="apex-panel flex flex-col gap-2 rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/40">Enlace para invitar</div>
                  <div className="truncate text-xs font-bold text-amber-200/90">{shareLink}</div>
                </div>
                <button
                  onClick={() => void copy(shareLink, 'link')}
                  className="apex-btn shrink-0 rounded-lg bg-amber-400 px-3 py-2 text-[10px] font-black text-black"
                >
                  {copied === 'link' ? '¡COPIADO!' : 'COPIAR'}
                </button>
              </div>
              <div className="text-[11px] font-bold text-white/45">
                ⚠ La sala vive en tu navegador: mantén esta pestaña abierta hasta terminar.
              </div>
            </div>
          )}

          {error && <div className="rounded-xl bg-rose-600/80 px-4 py-2 text-center text-sm font-black">{error}</div>}

          <button
            onClick={handleBack}
            className="apex-btn mx-auto rounded-full border border-white/15 bg-white/10 px-8 py-2.5 text-sm font-black text-white"
          >
            ← SALIR DE LA SALA
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ entry
  return (
    <div className="apex-bg absolute inset-0 overflow-y-auto">
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-lg flex-col items-center justify-center gap-6 px-6 py-12">

        <div className="text-center">
          <div className="apex-font apex-title text-5xl">ONLINE</div>
          <div className="mt-2 text-xs font-bold tracking-widest text-white/40">
            CREA UNA SALA Y COMPITE CON TUS AMIGOS
          </div>
        </div>

        <div className="apex-panel flex w-full flex-col gap-4 rounded-2xl p-6">
          <div>
            <div className="mb-1.5 text-xs font-black uppercase tracking-widest text-white/50">Tu apodo</div>
            <input
              value={nickname}
              maxLength={14}
              onChange={e => setNickname(e.target.value)}
              placeholder="Piloto"
              className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-lg font-black text-white placeholder:text-white/25 focus:border-amber-300 focus:outline-none"
            />
          </div>

          <button
            disabled={busy}
            onClick={handleCreate}
            className="apex-btn rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3.5 text-lg font-black tracking-wider text-black disabled:opacity-50"
          >
            {busy ? 'CREANDO…' : 'CREAR SALA'}
          </button>

          <div className="flex items-center gap-3 text-[10px] font-black text-white/30">
            <div className="h-px flex-1 bg-white/15" /> O ÚNETE CON UN CÓDIGO <div className="h-px flex-1 bg-white/15" />
          </div>

          <div className="flex gap-2">
            <input
              value={joinCode}
              maxLength={4}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
              placeholder="CÓDIGO"
              className="apex-font w-32 rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-center text-xl tracking-[0.3em] text-white placeholder:text-white/20 focus:border-amber-300 focus:outline-none"
            />
            <button
              disabled={busy}
              onClick={handleJoin}
              className="apex-btn flex-1 rounded-xl bg-white/10 px-6 py-3 text-lg font-black text-white disabled:opacity-50"
            >
              UNIRSE
            </button>
          </div>

          {(status === 'error' || error) && (
            <div className="rounded-xl bg-rose-600/80 px-4 py-2 text-center text-sm font-black">
              {error || `Sin conexión: ${net.lastError || 'reintenta'}`}
            </div>
          )}
          {busy && (
            <div className="text-center text-xs font-bold text-white/40">
              Conectando (P2P con relé TURN)… puede tardar unos segundos
            </div>
          )}
        </div>

        <button
          onClick={handleBack}
          className="apex-btn rounded-full border border-white/15 bg-white/10 px-8 py-2.5 text-sm font-black text-white"
        >
          ← VOLVER
        </button>
      </div>
    </div>
  );
}
