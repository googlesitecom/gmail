'use client';

/**
 * APEX KART — Cup victory cinematic overlay.
 * The engine drives the 3D camera (podium orbit, trophy descent, fireworks);
 * this layer adds the titles and the skip control on top.
 */

import { useEffect, useState, type JSX } from 'react';
import type { CinematicState } from '@/game/core/GameBridge';

export function CupCinematicOverlay({ cinematic, onSkip }: {
  cinematic: CinematicState;
  onSkip: () => void;
}): JSX.Element {
  const [showSkip, setShowSkip] = useState(false);

  // the skip control fades in after a beat so the first shots read clean
  useEffect(() => {
    const t = setTimeout(() => setShowSkip(true), 1800);
    return () => clearTimeout(t);
  }, []);

  // any confirm key skips (engine also listens directly)
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (['Space', 'Enter', 'Escape', 'ShiftLeft', 'KeyE'].includes(e.code)) onSkip();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onSkip]);

  return (
    <div className="absolute inset-0 select-none overflow-hidden" style={{ pointerEvents: 'none' }}>

      {/* cinematic letterbox bars */}
      <div className="absolute inset-x-0 top-0 h-[9vh] bg-black" style={{ animation: 'cineBar 1.2s ease-out both' }} />
      <div className="absolute inset-x-0 bottom-0 h-[9vh] bg-black" style={{ animation: 'cineBar 1.2s ease-out both' }} />

      {/* titles */}
      <div className="absolute inset-x-0 top-[13vh] flex flex-col items-center gap-1.5 px-4 text-center">
        <div
          className="apex-font apex-outline text-5xl text-amber-300 sm:text-6xl"
          style={{ animation: 'cineTitle 0.9s cubic-bezier(0.2, 1.6, 0.4, 1) 0.35s both', textShadow: '0 0 26px rgba(255, 190, 60, 0.55)' }}
        >
          ¡CAMPEÓN!
        </div>
        <div
          className="apex-font text-2xl text-white sm:text-3xl"
          style={{ animation: 'cineTitle 0.9s cubic-bezier(0.2, 1.6, 0.4, 1) 0.7s both' }}
        >
          🏆 {cinematic.cupName}
        </div>
        <div
          className="text-sm font-black tracking-widest text-white/70"
          style={{ animation: 'cineTitle 0.9s ease-out 1.05s both' }}
        >
          {cinematic.championName.toUpperCase()} GANA LA COPA
        </div>
      </div>

      {/* skip control */}
      <div
        className="absolute bottom-[11.5vh] left-1/2 -translate-x-1/2 transition-opacity duration-500"
        style={{ opacity: showSkip ? 1 : 0, pointerEvents: showSkip ? 'auto' : 'none' }}
      >
        <button
          onClick={onSkip}
          className="apex-btn rounded-full border border-white/25 bg-black/55 px-7 py-2.5 text-sm font-black tracking-wider text-white backdrop-blur hover:bg-black/75"
        >
          SALTAR ▶ <span className="ml-1 text-[10px] font-bold text-white/50">ESPACIO</span>
        </button>
      </div>

      <style jsx global>{`
        @keyframes cineBar {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
        @keyframes cineTitle {
          0% { transform: translateY(-26px) scale(0.72); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
