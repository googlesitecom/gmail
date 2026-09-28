'use client';

/**
 * APEX KART — Turbo Party (APEX Studio).
 * Entry page: mounts the game shell client-side (WebGL cannot SSR).
 */

import type { JSX } from 'react';
import dynamic from 'next/dynamic';

const GameShell = dynamic(() => import('@/components/game/GameShell'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-black">
      <div
        className="text-5xl font-black tracking-tighter"
        style={{
          background: 'linear-gradient(180deg,#ffe94a 0%,#ff9a3a 55%,#e8324a 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        APEX KART
      </div>
      <div className="text-sm font-bold tracking-[0.4em] text-white/50">CARGANDO…</div>
    </div>
  ),
});

export default function Home(): JSX.Element {
  return <GameShell />;
}
