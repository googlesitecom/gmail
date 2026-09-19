/**
 * APEX KART — Time-trial ghost recorder & replayer.
 * Records the player transform at 20 Hz; replays with linear interpolation.
 * Serialized compactly (arrays of rounded numbers, base64 payload in SaveData).
 */

import * as THREE from 'three';
import { KartVisual, type VisualModels } from '../karts/KartVisual';
import { CHARACTER_MAP } from '../karts/KartStats';
import { ModelLibrary } from '../assets/ModelLibrary';

const HZ = 20;

export interface GhostData {
  trackId: string;
  characterId: string;
  totalTimeMs: number;
  t: number[];   // seconds since GO
  x: number[];
  y: number[];
  z: number[];
  yaw: number[];
}

export class GhostRecorder {
  private t: number[] = [];
  private x: number[] = [];
  private y: number[] = [];
  private z: number[] = [];
  private yaw: number[] = [];
  private acc = 0;
  readonly trackId: string;
  readonly characterId: string;

  constructor(trackId: string, characterId: string) {
    this.trackId = trackId;
    this.characterId = characterId;
  }

  record(dt: number, pos: THREE.Vector3, yaw: number): void {
    this.acc += dt;
    if (this.acc >= 1 / HZ) {
      this.acc = 0;
      this.t.push(+(this.t.length === 0 ? 0 : this.t[this.t.length - 1] + 1 / HZ).toFixed(3));
      this.x.push(+pos.x.toFixed(2));
      this.y.push(+pos.y.toFixed(2));
      this.z.push(+pos.z.toFixed(2));
      this.yaw.push(+yaw.toFixed(3));
    }
  }

  finish(totalTimeMs: number): GhostData {
    return { trackId: this.trackId, characterId: this.characterId, totalTimeMs, t: this.t, x: this.x, y: this.y, z: this.z, yaw: this.yaw };
  }
}

export class GhostPlayer {
  readonly data: GhostData;
  readonly visual: KartVisual;
  private idx = 0;
  playing = false;

  constructor(data: GhostData, parent: THREE.Object3D) {
    this.data = data;
    // GLB overrides when the model library has them (ghost of the player's own kart)
    const lib = ModelLibrary.get();
    const models: VisualModels = {};
    if (lib.ready) {
      const kart = lib.kartTemplate();
      if (kart) { models.kart = kart.scene; models.kartMeta = kart.meta; }
      const driver = lib.driverTemplate(data.characterId);
      if (driver) { models.driver = driver.scene; models.driverIncludesKart = driver.includesKart; }
    }
    this.visual = new KartVisual(data.characterId, CHARACTER_MAP[data.characterId]?.color ?? 0x999999,
      models.kart || models.driver ? models : undefined);
    // translucent ghost tint
    this.visual.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of mats) {
          const lm = mm as THREE.MeshLambertMaterial;
          if (lm.color) { lm.transparent = true; lm.opacity = 0.42; }
        }
      }
    });
    parent.add(this.visual.group);
    this.visual.group.visible = false;
  }

  start(): void { this.playing = true; this.idx = 0; this.visual.group.visible = true; }

  /** raceTimeSec: seconds since GO. */
  update(raceTimeSec: number, t: number): void {
    if (!this.playing) return;
    const d = this.data;
    while (this.idx < d.t.length - 1 && d.t[this.idx + 1] < raceTimeSec) this.idx++;
    if (this.idx >= d.t.length - 1) { this.playing = false; this.visual.group.visible = false; return; }
    const t0 = d.t[this.idx], t1 = d.t[this.idx + 1];
    const f = t1 > t0 ? Math.min(1, (raceTimeSec - t0) / (t1 - t0)) : 1;
    const x = d.x[this.idx] + (d.x[this.idx + 1] - d.x[this.idx]) * f;
    const y = d.y[this.idx] + (d.y[this.idx + 1] - d.y[this.idx]) * f;
    const z = d.z[this.idx] + (d.z[this.idx + 1] - d.z[this.idx]) * f;
    this.visual.group.position.set(x, y, z);
    this.visual.group.rotation.y = d.yaw[this.idx];
    this.visual.update(1 / 60, t, {
      speedRatio: 0.7, steer: 0, drifting: false, driftLevel: 0,
      grounded: true, boost: false, shrink: false, airborne: false, trickSpin: 0, trickKind: 0,
    });
  }

  dispose(): void {
    this.visual.group.parent?.remove(this.visual.group);
    this.visual.dispose();
  }
}
