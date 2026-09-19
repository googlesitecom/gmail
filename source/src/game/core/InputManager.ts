/**
 * APEX KART — Input management.
 * - Keyboard + standard gamepad (XInput layout).
 * - Fully remappable action bindings, persisted by SaveData.
 * - Produces a normalized KartControls struct each frame for the player kart.
 */

import { KartControls } from './Types';

export type Action = 'accelerate' | 'brake' | 'steerLeft' | 'steerRight' | 'drift' | 'item' | 'lookBack' | 'pause';

export interface Binding {
  code: string;      // KeyboardEvent.code or 'pad:N' gamepad button index
  action: Action;
  label: string;
}

export const DEFAULT_BINDINGS: Binding[] = [
  { code: 'ArrowUp',    action: 'accelerate',  label: 'W / ↑' },
  { code: 'KeyW',       action: 'accelerate',  label: 'W / ↑' },
  { code: 'ArrowDown',  action: 'brake',       label: 'S / ↓' },
  { code: 'KeyS',       action: 'brake',       label: 'S / ↓' },
  { code: 'ArrowLeft',  action: 'steerLeft',   label: 'A / ←' },
  { code: 'KeyA',       action: 'steerLeft',   label: 'A / ←' },
  { code: 'ArrowRight', action: 'steerRight',  label: 'D / →' },
  { code: 'KeyD',       action: 'steerRight',  label: 'D / →' },
  { code: 'Space',      action: 'drift',       label: 'ESPACIO' },
  { code: 'ShiftLeft',  action: 'item',        label: 'SHIFT' },
  { code: 'KeyE',       action: 'item',        label: 'SHIFT / E' },
  { code: 'KeyQ',       action: 'lookBack',    label: 'Q' },
  { code: 'Escape',     action: 'pause',       label: 'ESC' },
  { code: 'Enter',      action: 'pause',       label: 'ESC / ENTER' },
];

/** Gamepad button map (standard). Triggers handled via axes in poll(). */
const PAD_BUTTONS: Partial<Record<number, Action>> = {
  0: 'drift',      // A / cross
  1: 'item',       // B / circle
  2: 'item',       // X / square
  3: 'lookBack',   // Y / triangle
  9: 'pause',      // start
};

export class InputManager {
  private down = new Set<string>();
  private bindings: Binding[] = DEFAULT_BINDINGS.map(b => ({ ...b }));
  private gamepadIndex: number | null = null;
  private padAxes = { steer: 0, throttle: 0, brake: 0 };

  // edge detection for item / pause
  private prevItem = false;
  private prevPause = false;
  public itemPressed = false;
  public pausePressed = false;

  // countdown turbo-start bookkeeping (throttle held at GO?)
  public throttleHeldMs = 0;

  private onKey = (e: KeyboardEvent, isDown: boolean) => {
    if (e.repeat) return;
    // prevent page scroll during gameplay
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (isDown) this.down.add(e.code); else this.down.delete(e.code);
  };
  private kd = (e: KeyboardEvent) => this.onKey(e, true);
  private ku = (e: KeyboardEvent) => this.onKey(e, false);
  private padConnect = (e: GamepadEvent) => { this.gamepadIndex = e.gamepad.index; };
  private padDisconnect = () => { this.gamepadIndex = null; };

  attach(): void {
    window.addEventListener('keydown', this.kd, { passive: false });
    window.addEventListener('keyup', this.ku);
    window.addEventListener('gamepadconnected', this.padConnect as EventListener);
    window.addEventListener('gamepaddisconnected', this.padDisconnect as EventListener);
  }

  detach(): void {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    window.removeEventListener('gamepadconnected', this.padConnect as EventListener);
    window.removeEventListener('gamepaddisconnected', this.padDisconnect as EventListener);
    this.down.clear();
  }

  setBindings(b: Binding[]): void { this.bindings = b.map(x => ({ ...x })); }
  getBindings(): Binding[] { return this.bindings.map(b => ({ ...b })); }
  rebind(action: Action, code: string): void {
    const existing = this.bindings.find(b => b.action === action);
    if (existing) existing.code = code;
  }

  isDown(action: Action): boolean {
    for (const b of this.bindings) if (b.action === action && this.down.has(b.code)) return true;
    return false;
  }

  /** Call once per rendered frame BEFORE physics substeps. */
  poll(dt: number): void {
    // --- gamepad merge -----------------------------------------------------
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = this.gamepadIndex != null ? pads[this.gamepadIndex] : (pads.find(p => p && p.connected) || null);
    let steer = 0, throttle = 0, brake = 0;
    let itemDown = false, pauseDown = false;

    if (pad) {
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.12) steer = ax;
      // analog triggers: axes 2/3 or buttons 6/7 values
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      throttle = Math.max(throttle, rt);
      brake = Math.max(brake, lt);
      if ((pad.buttons[0]?.value ?? 0) > 0.5) this.down.add('pad:0'); else this.down.delete('pad:0');
      for (const [btn, act] of Object.entries(PAD_BUTTONS)) {
        const pressed = (pad.buttons[+btn]?.value ?? 0) > 0.5;
        const code = `pad:${btn}`;
        if (act === 'item') itemDown = itemDown || pressed;
        if (act === 'pause') pauseDown = pauseDown || pressed;
        if (pressed) this.down.add(code); else this.down.delete(code);
      }
    }
    // override pad:0 entry for drift if pad present but A not mapped to down-set properly
    this.padAxes.steer = steer;
    this.padAxes.throttle = throttle;
    this.padAxes.brake = brake;

    // --- keyboard merge ----------------------------------------------------
    const kAcc = this.isDown('accelerate') ? 1 : 0;
    const kBrake = this.isDown('brake') ? 1 : 0;
    let kSteer = (this.isDown('steerRight') ? 1 : 0) - (this.isDown('steerLeft') ? 1 : 0);

    const acc = Math.max(kAcc, throttle);
    const brk = Math.max(kBrake, brake);
    const str = Math.abs(steer) > Math.abs(kSteer) ? steer : kSteer;
    itemDown = itemDown || this.isDown('item');
    pauseDown = pauseDown || this.isDown('pause');

    this.itemPressed = itemDown && !this.prevItem;
    this.pausePressed = pauseDown && !this.prevPause;
    this.prevItem = itemDown;
    this.prevPause = pauseDown;

    this.throttleHeldMs = acc > 0.4 ? this.throttleHeldMs + dt * 1000 : 0;
  }

  /** Build the player controls struct for the current frame. */
  readControls(): KartControls {
    const kSteer = (this.isDown('steerRight') ? 1 : 0) - (this.isDown('steerLeft') ? 1 : 0);
    const str = Math.abs(this.padAxes.steer) > Math.abs(kSteer) ? this.padAxes.steer : kSteer;
    return {
      throttle: Math.max(this.isDown('accelerate') ? 1 : 0, this.padAxes.throttle),
      brake: Math.max(this.isDown('brake') ? 1 : 0, this.padAxes.brake),
      steer: Math.max(-1, Math.min(1, str)),
      drift: this.isDown('drift'),
      driftRelease: false, // set by controller state machine
      fireItem: this.itemPressed,
      itemHeld: this.isDown('item'),
      lookBack: this.isDown('lookBack'),
    };
  }
}
