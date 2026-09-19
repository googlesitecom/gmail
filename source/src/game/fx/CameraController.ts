/**
 * APEX KART — Chase camera with dynamic FOV, drift lateral offset,
 * rear-view, landing shake and a slow orbit for the results podium.
 */

import * as THREE from 'three';
import { CAMERA } from '../core/Config';
import { damp, lerp } from '../core/MathUtils';
import { KartController } from '../karts/KartController';

export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  private pos = new THREE.Vector3(0, 30, 30);
  private look = new THREE.Vector3();
  private shake = 0;
  private orbitAngle = 0;
  mode: 'chase' | 'orbit' = 'chase';

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fovBase, aspect, 0.3, 1100);
    this.camera.position.copy(this.pos);
  }

  kick(strength: number): void { this.shake = Math.max(this.shake, strength); }

  resize(aspect: number): void { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }

  updateChase(dt: number, kart: KartController, lookBack: boolean): void {
    const fwd = kart.forward();
    const back = lookBack ? fwd.clone().negate() : fwd;
    const speedT = Math.min(1, kart.speedRatio);

    // camera sits behind (or in front when looking back), slides outward on drift
    const lateralSide = kart.drifting ? -kart.driftDir : 0;
    const desired = kart.pos.clone()
      .addScaledVector(back, -CAMERA.distance * (1 + speedT * 0.18))
      .add(new THREE.Vector3(0, CAMERA.height, 0))
      .addScaledVector(new THREE.Vector3(back.z, 0, -back.x).normalize(), lateralSide * CAMERA.driftLateral);

    // don't sink under the road
    const minY = (kart.ginfo?.height ?? kart.pos.y) + 1.4;
    desired.y = Math.max(desired.y, minY);

    this.pos.copy(dampV3(this.pos, desired, CAMERA.posLerp, dt));
    this.look.copy(dampV3(this.look, kart.pos.clone().addScaledVector(fwd, CAMERA.lookAhead * 0.5).add(new THREE.Vector3(0, 1.2, 0)), 14, dt));

    // dynamic FOV: base → boost
    const boosting = kart.boosting || kart.starT > 0;
    const targetFov = boosting ? CAMERA.fovBoost : CAMERA.fovBase + speedT * 6;
    this.camera.fov = lerp(this.camera.fov, targetFov, 1 - Math.exp(-CAMERA.fovLerp * dt));
    this.camera.updateProjectionMatrix();

    // apply shake
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * 0.35;
    this.camera.position.copy(this.pos).add(new THREE.Vector3(
      (Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
  }

  /** Results podium: slow orbit around a focus point. */
  updateOrbit(dt: number, focus: THREE.Vector3, radius = 13): void {
    this.orbitAngle += dt * 0.35;
    this.camera.fov = lerp(this.camera.fov, 55, 1 - Math.exp(-3 * dt));
    this.camera.updateProjectionMatrix();
    this.camera.position.set(
      focus.x + Math.cos(this.orbitAngle) * radius,
      focus.y + 5.5,
      focus.z + Math.sin(this.orbitAngle) * radius,
    );
    this.camera.lookAt(focus.x, focus.y + 1.5, focus.z);
  }

  snapBehind(kart: KartController): void {
    const fwd = kart.forward();
    this.pos.copy(kart.pos).addScaledVector(fwd, -CAMERA.distance).add(new THREE.Vector3(0, CAMERA.height, 0));
    this.look.copy(kart.pos);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}

const dampV3 = (a: THREE.Vector3, b: THREE.Vector3, lambda: number, dt: number): THREE.Vector3 =>
  new THREE.Vector3(
    damp(a.x, b.x, lambda, dt),
    damp(a.y, b.y, lambda, dt),
    damp(a.z, b.z, lambda, dt),
  );
