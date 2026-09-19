'use client';

/**
 * APEX KART — React shell: owns the canvas, the Game engine instance and
 * the full menu flow (menu → character → kart → mode config → cup/track/arena).
 * In-race it renders the HUD overlay, pause menu and results.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type JSX } from 'react';
import { Game } from '@/game/core/Game';
import { GameBridge } from '@/game/core/GameBridge';
import { Difficulty, GameMode, QualityLevel, SessionConfig } from '@/game/core/Types';
import { SaveData } from '@/game/persistence/SaveData';
import { CUPS } from '@/game/tracks/TrackCatalog';
import { defaultUnlockState, CHARACTERS } from '@/game/karts/KartStats';

import { MainMenu } from './MainMenu';
import { CharacterSelect } from './CharacterSelect';
import { KartColorSelect } from './KartColorSelect';
import { ArenaSelect, CupSelect, ModeConfig, ModeConfigDraft, TrackSelect } from './ModeScreens';
import { OptionsPanel } from './OptionsPanel';
import { PauseMenu } from './PauseMenu';
import { ResultsScreen } from './ResultsScreen';
import { HUD } from './HUD';
import { OnlineScreen } from './OnlineScreen';
import { NetClient } from '@/game/net/NetClient';

type MenuScreen = 'menu' | 'character' | 'kart' | 'mode' | 'cup' | 'track' | 'arena' | 'options' | 'online';

export default function GameShell(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const speedoRef = useRef<HTMLCanvasElement>(null);
  const [bridge] = useState(() => new GameBridge());
  const gameRef = useRef<Game | null>(null);
  const [net] = useState(() => new NetClient());
  const onlineActive = useRef(false);   // true while an online race session runs

  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);

  // ---- menu flow state ------------------------------------------------------------
  const [screen, setScreen] = useState<MenuScreen>('menu');
  const [mode, setMode] = useState<GameMode>('grandprix');
  const [character, setCharacter] = useState(() => {
    const defaults = defaultUnlockState();
    return CHARACTERS.find(c => SaveData.isCharUnlocked(c.id, defaults))?.id ?? 'zippy';
  });
  const [kartColor, setKartColor] = useState(0xe03030);
  const [cfg, setCfgState] = useState<ModeConfigDraft>(() => ({
    difficulty: 100 as Difficulty,
    mirror: false,
    laps: 3,
    aiCount: 11,
    items: true,
    rubber: SaveData.options.rubberBand,
    battleTime: 180,
  }));
  const setCfg = (patch: Partial<ModeConfigDraft>): void => setCfgState(c => ({ ...c, ...patch }));

  // ---- engine lifecycle --------------------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new Game(canvasRef.current, null, null, bridge);
    game.net = net;
    gameRef.current = game;
    game.input.setBindings(SaveData.bindings);
    return () => { game.dispose(); gameRef.current = null; };
  }, [bridge, net]);

  // attach HUD canvases once the race screen mounts
  useEffect(() => {
    if (state.screen === 'race' && minimapRef.current && speedoRef.current) {
      gameRef.current?.attachHudCanvases(minimapRef.current, speedoRef.current);
    }
  }, [state.screen]);

  // ---- session launcher ---------------------------------------------------------------
  const startRace = useCallback((over: Partial<SessionConfig>): void => {
    const session: SessionConfig = {
      mode,
      difficulty: cfg.difficulty,
      mirror: cfg.mirror,
      playerId: character,
      playerKartColor: kartColor,
      aiCount: mode === 'timetrial' ? 0 : mode === 'grandprix' ? 11 : cfg.aiCount,
      itemsEnabled: mode === 'timetrial' ? false : mode === 'grandprix' ? true : cfg.items,
      aiRubberBand: mode === 'timetrial' ? 0 : cfg.rubber,
      laps: mode === 'vs' ? cfg.laps : undefined,
      battleTime: cfg.battleTime,
      ...over,
    };
    gameRef.current?.startSession(session);
  }, [mode, cfg, character, kartColor]);

  // ---- online: server-driven session launch + lobby return -------------------------
  useEffect(() => {
    const onRaceStart = (start: import('@/game/net/NetTypes').NetRaceStart): void => {
      onlineActive.current = true;
      setMode('vs');
      startRace({
        mode: 'vs',
        trackId: start.config.trackId,
        laps: start.config.laps,
        difficulty: start.config.cc,
        mirror: start.config.mirror,
        itemsEnabled: start.config.items,
        aiCount: 0,
        aiRubberBand: 0,
        online: {
          grid: start.grid,
          localId: net.myId,
          startAt: start.startAt,
          isHost: net.isHost,   // CPU fill is simulated by the host
        },
      });
    };
    const onLobby = (): void => {
      onlineActive.current = false;
      if (bridge.getSnapshot().screen === 'race') {
        gameRef.current?.quitToMenu();
        setScreen('online');
      }
    };
    const onKicked = (): void => {
      onlineActive.current = false;
      if (bridge.getSnapshot().screen === 'race') gameRef.current?.quitToMenu();
      setScreen('menu');
    };
    net.useHooks({ onRaceStart, onLobby, onKicked });
    return () => net.useHooks({ onRaceStart: null, onLobby: null, onKicked: null });
  }, [net, bridge, startRace]);

  useEffect(() => () => net.dispose(), [net]);

  // closing the tab/refreshing must tear the room down EXPLICITLY: WebRTC
  // close events are best-effort (mobile backgrounding never fires them) and
  // a vanishing host would otherwise leave guests hanging until timeout
  useEffect(() => {
    const bye = (): void => { net.leaveRoom(); };
    window.addEventListener('beforeunload', bye);
    window.addEventListener('pagehide', bye);
    return () => {
      window.removeEventListener('beforeunload', bye);
      window.removeEventListener('pagehide', bye);
    };
  }, [net]);

  // ---- in-race actions ------------------------------------------------------------
  const backToMenu = useCallback((): void => {
    if (onlineActive.current) {
      onlineActive.current = false;
      net.leaveRoom();
    }
    gameRef.current?.quitToMenu();
    setScreen('menu');
  }, [net]);
  const handleContinue = useCallback((): void => {
    // online: the host returns everyone to the lobby (server broadcasts it)
    if (onlineActive.current) {
      net.backToLobby();
      return;
    }
    // GP with remaining races: engine starts the next track directly.
    const gpNext = !!state.gp && state.gp.trackIndex < state.gp.trackCount - 1;
    gameRef.current?.continueFlow();
    if (!gpNext) setScreen('menu');
  }, [state.gp, net]);
  const handleForceResults = useCallback((): void => {
    gameRef.current?.forceResults();
  }, []);

  const inRace = state.screen === 'race';

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      {/* 3D canvas (always mounted — engine owns it) */}
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

      {/* ------------------------------ menus ------------------------------ */}
      {!inRace && (
        <>
          {screen === 'menu' && (
            <MainMenu
              onMode={m => { setMode(m); setScreen('character'); }}
              onOptions={() => setScreen('options')}
              onOnline={() => setScreen('online')}
            />
          )}
          {screen === 'online' && (
            <OnlineScreen
              net={net}
              character={character}
              kartColor={kartColor}
              setCharacter={setCharacter}
              setKartColor={setKartColor}
              onBack={() => setScreen('menu')}
            />
          )}
          {screen === 'character' && (
            <CharacterSelect
              selected={character}
              onSelect={setCharacter}
              onBack={() => setScreen('menu')}
              onNext={() => setScreen('kart')}
            />
          )}
          {screen === 'kart' && (
            <KartColorSelect
              color={kartColor}
              onSelect={setKartColor}
              onBack={() => setScreen('character')}
              onNext={() => setScreen('mode')}
              characterId={character}
              racerName={CHARACTERS.find(c => c.id === character)?.displayName ?? ''}
            />
          )}
          {screen === 'mode' && (
            <ModeConfig
              mode={mode}
              draft={cfg}
              setDraft={setCfg}
              onBack={() => setScreen('kart')}
              onNext={() => {
                if (mode === 'grandprix') setScreen('cup');
                else if (mode === 'battle') setScreen('arena');
                else setScreen('track');
              }}
            />
          )}
          {screen === 'cup' && (
            <CupSelect
              onBack={() => setScreen('mode')}
              onPick={cupId => {
                const cup = CUPS.find(c => c.id === cupId)!;
                startRace({ cupId, trackId: cup.tracks[0] });
              }}
            />
          )}
          {screen === 'track' && (
            <TrackSelect
              showBest={mode === 'timetrial'}
              title={mode === 'timetrial' ? 'CONTRARRELOJ — PISTA' : 'CARRERA VS — PISTA'}
              onBack={() => setScreen('mode')}
              onPick={trackId => startRace({ trackId })}
            />
          )}
          {screen === 'arena' && (
            <ArenaSelect
              onBack={() => setScreen('mode')}
              onPick={arenaId => startRace({ arenaId })}
            />
          )}
          {screen === 'options' && (
            <OptionsPanel
              onClose={() => setScreen('menu')}
              onApplyQuality={(q: QualityLevel) => gameRef.current?.applyQuality(q)}
              onBindingsChanged={b => gameRef.current?.input.setBindings(b)}
            />
          )}
        </>
      )}

      {/* ------------------------------ race UI ------------------------------ */}
      {inRace && (
        <>
          <HUD
            state={state}
            minimapRef={minimapRef}
            speedoRef={speedoRef}
            onContinue={handleForceResults}
          />
          {state.paused && !state.results && (
            <PauseMenu
              onResume={() => gameRef.current?.resume()}
              onRestart={onlineActive.current ? () => gameRef.current?.resume() : () => gameRef.current?.retrySession()}
              onQuit={backToMenu}
              onApplyQuality={(q: QualityLevel) => gameRef.current?.applyQuality(q)}
            />
          )}
          {state.results && state.needsContinue && (
            <ResultsScreen
              rows={state.results}
              mode={mode}
              online={onlineActive.current}
              gpFinal={!!state.gp && state.gp.trackIndex >= state.gp.trackCount - 1}
              gpNext={!!state.gp && state.gp.trackIndex < state.gp.trackCount - 1}
              onContinue={handleContinue}
              onRetry={() => gameRef.current?.retrySession()}
              onMenu={backToMenu}
            />
          )}
        </>
      )}
    </div>
  );
}
