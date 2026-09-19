'use client';

import { useEffect, useRef, type JSX } from 'react';
import * as THREE from 'three';
import { KartVisual, type VisualModels } from '@/game/karts/KartVisual';
import { ModelLibrary } from '@/game/assets/ModelLibrary';

/**
 * APEX KART — Live 3D showroom: renders the actual in-game kart (same
 * KartVisual mesh) on a slow turntable with studio lighting. Used by the
 * character & color selectors so players always see the real thing.
 */
export function KartShowroom({ characterId, color, height = 300 }: {
  characterId: string;
  color: number;
  height?: number;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visualRef = useRef<KartVisual | null>(null);

  // ---- engine lifecycle ------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.set(3.6, 2.5, 5.2);
    camera.lookAt(0, 0.75, 0);

    // studio rig: warm key + cool rim + soft fill
    const key = new THREE.DirectionalLight(0xfff2d8, 1.55);
    key.position.set(4, 6, 3);
    const rim = new THREE.DirectionalLight(0x7aa2ff, 1.1);
    rim.position.set(-5, 3, -4);
    const fill = new THREE.AmbientLight(0xffffff, 0.42);
    scene.add(key, rim, fill);

    // turntable group
    const turntable = new THREE.Group();
    scene.add(turntable);
    // GLB models when available (loads at app boot; menus give it time)
    const lib = ModelLibrary.get();
    const models: VisualModels = {};
    if (lib.ready) {
      const kart = lib.kartTemplate();
      if (kart) { models.kart = kart.scene; models.kartMeta = kart.meta; }
      const driver = lib.driverTemplate(characterId);
      if (driver) { models.driver = driver.scene; models.driverIncludesKart = driver.includesKart; }
    }
    const visual = new KartVisual(characterId, color, models.kart || models.driver ? models : undefined);
    visualRef.current = visual;
    turntable.add(visual.group);

    // showroom disc + glow ring
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(2.3, 2.45, 0.16, 40),
      new THREE.MeshLambertMaterial({ color: 0x232032 }),
    );
    disc.position.y = -0.08;
    scene.add(disc);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.42, 0.05, 8, 60),
      new THREE.MeshBasicMaterial({ color: 0xffe94a, transparent: true, opacity: 0.75 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    scene.add(ring);

    let raf = 0;
    let last = performance.now();
    let t = 0;
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      turntable.rotation.y += dt * 0.55;
      visual.group.position.y = 0.12 + Math.sin(t * 1.6) * 0.05;
      visual.update(dt, t, {
        speedRatio: 0, steer: Math.sin(t * 0.8) * 0.25, drifting: false, driftLevel: 0,
        grounded: true, boost: false, shrink: false, airborne: false, trickSpin: 0, trickKind: 0,
      });
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    const onResize = (): void => {
      const w = canvas.clientWidth || 320;
      const h = canvas.clientHeight || height;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    onResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      visual.dispose();
      renderer.dispose();
      visualRef.current = null;
    };
  }, [characterId, height]);

  // ---- live color swap (no rebuild) --------------------------------------------
  useEffect(() => {
    visualRef.current?.setKartColor(color);
  }, [color]);

  return (
    <div className="relative w-full" style={{ height }}>
      <canvas ref={canvasRef} className="h-full w-full" />
      {/* floor glow */}
      <div
        className="pointer-events-none absolute inset-x-8 bottom-2 h-8 rounded-full blur-xl"
        style={{ background: `#${color.toString(16).padStart(6, '0')}55` }}
      />
    </div>
  );
}
