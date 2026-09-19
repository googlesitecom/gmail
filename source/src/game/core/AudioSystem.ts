/**
 * APEX KART — Audio system.
 *
 * Two channels, two technologies:
 *  - MUSIC: HTMLAudioElement with `loop` — the browser streams the mp3 from
 *    disk instead of holding it decoded in memory (the BGM is a 3 MB file;
 *    a decoded AudioBuffer would be ~30 MB of float PCM).
 *  - SFX: WebAudio AudioBuffers through a shared gain node — low latency and
 *    overlapping plays (coin cascades must overlap, not queue).
 *
 * Autoplay policy: browsers block audio until a user gesture. The game boots
 * into menus that require clicks, so we simply `resume()` on every pointer /
 * key interaction until the context is running and the music is playing.
 * Volumes are persisted through SaveData.options.
 */

import { publicAsset } from './Paths';

export interface AudioVolumes {
  music: number;   // 0..1
  sfx: number;     // 0..1
}

class AudioSystemImpl {
  // ---- music -------------------------------------------------------------
  private musicEl: HTMLAudioElement | null = null;
  private musicWanted = true;          // user-facing toggle (mute button)
  private musicStarted = false;

  // ---- sfx ---------------------------------------------------------------
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private unlocking = false;

  private volumes: AudioVolumes = { music: 0.55, sfx: 0.8 };

  /** Injected by Game at boot so the system reflects the saved options. */
  init(volumes: AudioVolumes): void {
    this.volumes = { ...volumes };
    this.attachUnlock();
    this.startMusic();
  }

  // ------------------------------------------------------------------ music

  private startMusic(): void {
    if (this.musicEl || typeof Audio === 'undefined') return;
    const el = new Audio(publicAsset('audio/Musica_Fondo.mp3'));
    el.loop = true;
    el.preload = 'auto';
    el.volume = this.musicWanted ? this.volumes.music : 0;
    // Cross-page-navigation safe: if the tab can't play yet, the unlock
    // listeners retry on every interaction.
    const tryPlay = (): void => {
      el.play().then(() => { this.musicStarted = true; }).catch(() => { /* wait for gesture */ });
    };
    tryPlay();
    this.musicEl = el;
  }

  setMusicVolume(v: number): void {
    this.volumes.music = Math.max(0, Math.min(1, v));
    if (this.musicEl) this.musicEl.volume = this.musicWanted ? this.volumes.music : 0;
  }

  setSfxVolume(v: number): void {
    this.volumes.sfx = Math.max(0, Math.min(1, v));
    if (this.sfxGain) this.sfxGain.gain.value = this.volumes.sfx;
  }

  getVolumes(): AudioVolumes { return { ...this.volumes }; }

  get musicMuted(): boolean { return !this.musicWanted || this.volumes.music <= 0; }

  /** HUD mute toggle. Returns the new muted state. */
  toggleMusic(): boolean {
    this.musicWanted = !this.musicWanted;
    if (this.musicEl) this.musicEl.volume = this.musicWanted ? this.volumes.music : 0;
    if (this.musicWanted) this.resumeAll();
    return this.musicMuted;
  }

  // ------------------------------------------------------------------ sfx

  /** One-shot sound effect by public path (loaded lazily, cached). */
  play(path: string, opts: { volume?: number; rate?: number } = {}): void {
    if (this.volumes.sfx <= 0) return;
    if (!this.ctx) this.ensureCtx();
    if (!this.ctx || this.ctx.state !== 'running') return; // will work after a gesture
    let buf = this.buffers.get(path);
    if (buf === undefined) {
      // not loaded yet — kick off the load and drop this play silently
      this.loadBuffer(path);
      return;
    }
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = (opts.volume ?? 1) * this.volumes.sfx;
    src.connect(g).connect(this.sfxGain ?? this.ctx.destination);
    src.start();
  }

  /** Coin pickup — the classic rising ding, layered slightly per coin count. */
  playCoin(coinIndex = 0): void {
    this.play('audio/chieuk-coin-257878.mp3', {
      volume: 0.9,
      rate: 1 + Math.min(coinIndex, 10) * 0.035, // subtle pitch ladder like MK
    });
  }

  /**
   * Glider/parachute deploy — a synthesized canvas-snatch whoosh (filtered
   * noise sweep). No asset needed; pure WebAudio so it always loads.
   */
  playGlider(): void {
    if (this.volumes.sfx <= 0) return;
    if (!this.ctx) this.ensureCtx();
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const dur = 0.55;
      const sr = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, Math.floor(sr * dur), sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        // noise with a rising envelope then soft decay
        data[i] = (Math.random() * 2 - 1) * Math.sin(Math.min(1, t * 4) * Math.PI) * (1 - t * 0.55);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(500, this.ctx.currentTime);
      filt.frequency.exponentialRampToValueAtTime(2600, this.ctx.currentTime + 0.28);
      filt.Q.value = 1.1;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.5 * this.volumes.sfx, this.ctx.currentTime + 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
      src.connect(filt).connect(g).connect(this.sfxGain ?? this.ctx.destination);
      src.start();
    } catch { /* synthesized — nothing to fall back to */ }
  }

  private ensureCtx(): void {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    try {
      this.ctx = new AudioContext();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.volumes.sfx;
      this.sfxGain.connect(this.ctx.destination);
      this.loadBuffer('audio/chieuk-coin-257878.mp3');
    } catch { /* audio unavailable — game runs silent */ }
  }

  private async loadBuffer(path: string): Promise<void> {
    if (!this.ctx) return;
    if (this.buffers.has(path)) return;
    try {
      const res = await fetch(publicAsset(path));
      const raw = await res.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(raw);
      this.buffers.set(path, buf);
    } catch {
      this.buffers.set(path, null as unknown as AudioBuffer); // negative cache
    }
  }

  // ------------------------------------------------------------------ unlock

  /** Browsers require a gesture before audio; retry on each interaction. */
  private attachUnlock(): void {
    if (typeof window === 'undefined') return;
    const unlock = (): void => { this.resumeAll(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private resumeAll(): void {
    if (this.unlocking) return;
    this.unlocking = true;
    if (!this.ctx) this.ensureCtx();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => { /* gesture may not count — next one will */ });
    }
    if (this.musicEl && !this.musicStarted && this.musicWanted) {
      this.musicEl.play()
        .then(() => { this.musicStarted = true; })
        .catch(() => { /* retry on next gesture */ });
    }
    setTimeout(() => { this.unlocking = false; }, 120);
  }
}

export const AudioSys = new AudioSystemImpl();
