/**
 * APEX KART — Remote kart puppeteer.
 * Buffers ~15 Hz peer states and interpolates the puppet kart 120 ms in the
 * past for smooth motion; extrapolates with the last heading if the stream
 * stalls. Only touches presentation fields — the owner client is the
 * authority for a remote kart's simulation.
 */

import * as THREE from 'three';
import { KartController } from '../karts/KartController';
import { NetKartState, ST_BOOST, ST_HELD, ST_SHRINK, ST_SPIN, ST_STAR } from './NetTypes';

const INTERP_DELAY = 120;    // ms of buffering
const MAX_AGE = 2500;        // freeze puppet if no packets for this long

interface Frame {
  at: number;                // local received-at ms
  p: THREE.Vector3;
  ry: number;
  s: number;
  d: number;
  st: number;
  lap: number;
  prog: number;
  f: boolean;
  ho: boolean;               // item held out behind (visual)
}

export class RemoteDriver {
  readonly kart: KartController;
  private buf: Frame[] = [];
  private lastApplied = new THREE.Vector3();
  private haveApplied = false;

  constructor(kart: KartController) {
    this.kart = kart;
  }

  push(st: NetKartState): void {
    const now = performance.now();
    this.buf.push({
      at: now, p: new THREE.Vector3(st.p[0], st.p[1], st.p[2]),
      ry: st.ry, s: st.s, d: st.d, st: st.st, lap: st.lap, prog: st.prog, f: st.f === 1,
      ho: (st.st & ST_HELD) !== 0,
    });
    if (this.buf.length > 24) this.buf.shift();
  }

  /** Called each fixed step; moves the puppet to the interpolated pose. */
  update(nowMs: number): void {
    if (!this.buf.length) return;
    const renderAt = nowMs - INTERP_DELAY;

    // find the two frames bracketing renderAt (buf is time-ordered)
    let a = this.buf[0], b = this.buf[this.buf.length - 1];
    for (let i = this.buf.length - 1; i >= 0; i--) {
      if (this.buf[i].at <= renderAt) { a = this.buf[i]; b = this.buf[Math.min(i + 1, this.buf.length - 1)]; break; }
    }
    const stale = nowMs - b.at > MAX_AGE;
    if (stale) return;   // keep last pose; owner likely disconnected mid-race

    const span = Math.max(1, b.at - a.at);
    const t = Math.min(1.2, Math.max(0, (renderAt - a.at) / span));
    const k = this.kart;

    k.pos.lerpVectors(a.p, b.p, t);
    // shortest-arc yaw interpolation
    let dy = b.ry - a.ry;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    k.yaw = a.ry + dy * t;
    k.speed = a.s + (b.s - a.s) * t;
    k.driftLevel = b.d;
    k.driftActive = b.d > 0;
    k.lap = b.lap;
    k.progressS = b.prog;
    k.finished = b.f || k.finished;

    // status flags (visuals read these timers; physics is not stepped)
    k.spinT = (b.st & ST_SPIN) ? 0.12 : 0;
    k.shrinkT = (b.st & ST_SHRINK) ? Math.max(k.shrinkT, 0.12) : 0;
    k.starT = (b.st & ST_STAR) ? Math.max(k.starT, 0.12) : 0;
    k.boostTimer = (b.st & ST_BOOST) ? Math.max(k.boostTimer, 0.12) : 0;
    k.itemHeldOut = b.ho;

    this.lastApplied.copy(k.pos);
    this.haveApplied = true;
  }

  /** Initial teleport (before the race starts) so puppets grid up instantly. */
  snapToLatest(): void {
    const f = this.buf[this.buf.length - 1];
    if (!f) return;
    this.kart.pos.copy(f.p);
    this.kart.yaw = f.ry;
    this.kart.speed = f.s;
    this.kart.progressS = f.prog;
    this.kart.lap = f.lap;
  }
}
