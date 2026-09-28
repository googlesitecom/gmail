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
    if (this.volumes.sfx <= 0) {
      // silence the persistent loops too (engine drone must not survive a
      // volume slider moved to zero mid-race)
      try {
        if (this.engGain) this.engGain.gain.value = 0;
        if (this.skidGain) this.skidGain.gain.value = 0;
      } catch { /* nodes gone */ }
    }
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

  /**
   * Cup-victory fanfare — a bright synth arpeggio (C5-E5-G5-C6) with a
   * sustained final chord. Pure WebAudio, no asset.
   */
  playFanfare(): void {
    if (this.volumes.sfx <= 0) return;
    if (!this.ctx) this.ensureCtx();
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const t0 = this.ctx.currentTime + 0.05;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => this.tone(f, t0 + i * 0.14, 0.34, 'triangle', 0.30));
      // final triumphant chord (C major, two octaves)
      this.tone(523.25, t0 + 0.62, 1.15, 'sawtooth', 0.10);
      this.tone(659.25, t0 + 0.62, 1.15, 'sawtooth', 0.08);
      this.tone(783.99, t0 + 0.62, 1.15, 'sawtooth', 0.08);
      this.tone(1046.5, t0 + 0.62, 1.15, 'triangle', 0.22);
      // shimmer sparkle on top
      this.tone(2093.0, t0 + 0.66, 0.5, 'sine', 0.10);
      this.tone(1568.0, t0 + 0.80, 0.5, 'sine', 0.08);
    } catch { /* synthesized — nothing to fall back to */ }
  }

  // ---------------------------------------------- feel loops (engine + skid)

  private engOsc: OscillatorNode | null = null;
  private engSub: OscillatorNode | null = null;
  private engGain: GainNode | null = null;
  private engFilter: BiquadFilterNode | null = null;
  private skidSrc: AudioBufferSourceNode | null = null;
  private skidGain: GainNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private loopsBuilt = false;

  /** Build the persistent engine + skid voice graph (needs a running ctx). */
  private buildLoops(): void {
    if (this.loopsBuilt || !this.ctx || this.ctx.state !== 'running') return;
    try {
      const ctx = this.ctx;
      const out = this.sfxGain ?? ctx.destination;

      // ENGINE: saw + sub-square → lowpass → gain. Pitch follows speed,
      // load follows throttle — the constant motor hum is half of what
      // makes a kart racer READ as one.
      this.engGain = ctx.createGain();
      this.engGain.gain.value = 0;
      this.engFilter = ctx.createBiquadFilter();
      this.engFilter.type = 'lowpass';
      this.engFilter.frequency.value = 420;
      this.engFilter.Q.value = 1.1;
      this.engOsc = ctx.createOscillator();
      this.engOsc.type = 'sawtooth';
      this.engOsc.frequency.value = 55;
      this.engSub = ctx.createOscillator();
      this.engSub.type = 'square';
      this.engSub.frequency.value = 27;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.55;
      this.engOsc.connect(this.engFilter);
      this.engSub.connect(subGain);
      subGain.connect(this.engFilter);
      this.engFilter.connect(this.engGain);
      this.engGain.connect(out);
      this.engOsc.start();
      this.engSub.start();

      // SKID: looping white noise → bandpass (tire scrub while drifting)
      const dur = 0.6;
      const sr = ctx.sampleRate;
      const nBuf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
      const nd = nBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.skidSrc = ctx.createBufferSource();
      this.skidSrc.buffer = nBuf;
      this.skidSrc.loop = true;
      this.skidFilter = ctx.createBiquadFilter();
      this.skidFilter.type = 'bandpass';
      this.skidFilter.frequency.value = 1100;
      this.skidFilter.Q.value = 2.4;
      this.skidGain = ctx.createGain();
      this.skidGain.gain.value = 0;
      this.skidSrc.connect(this.skidFilter);
      this.skidFilter.connect(this.skidGain);
      this.skidGain.connect(out);
      this.skidSrc.start();

      this.loopsBuilt = true;
    } catch { /* loops unavailable — one-shots still work */ }
  }

  /**
   * Per-frame engine voice for the local kart. Call every rendered frame
   * with the player's state; pass zeros to fade out (menus, pause, bg tab).
   */
  engine(speedT: number, throttle: number, boosting: boolean, drifting: boolean, airborne: boolean): void {
    if (this.volumes.sfx <= 0) return;
    if (!this.ctx) this.ensureCtx();
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this.loopsBuilt) this.buildLoops();
    if (!this.engGain || !this.skidGain || !this.engOsc || !this.engSub || !this.engFilter || !this.skidFilter) return;
    const t = this.ctx.currentTime;
    const rpm = 0.16 + Math.min(1.35, Math.max(0, speedT)) * 0.84;
    let f = 46 + rpm * 165;
    if (boosting) f *= 1.24;
    if (airborne) f *= 1.08;
    this.engOsc!.frequency.setTargetAtTime(f, t, 0.07);
    this.engSub!.frequency.setTargetAtTime(f * 0.5, t, 0.07);
    let load = 0.05 + 0.15 * Math.min(1, Math.max(0, throttle)) + rpm * 0.10 + (boosting ? 0.13 : 0);
    if (speedT < 0.02 && throttle <= 0 && !boosting) load = 0;   // idle off
    this.engGain!.gain.setTargetAtTime(load * this.volumes.sfx * 0.9, t, 0.09);
    this.engFilter!.frequency.setTargetAtTime(240 + rpm * 2100 + (boosting ? 900 : 0), t, 0.09);
    const skidOn = drifting && !airborne;
    this.skidGain!.gain.setTargetAtTime(skidOn ? 0.14 * this.volumes.sfx : 0, t, 0.05);
    this.skidFilter!.frequency.setTargetAtTime(skidOn ? 880 + speedT * 760 : 1200, t, 0.08);
  }

  // ---------------------------------------------- feel one-shots

  /** Generic short blip (countdown, UI, confirmations). */
  playBeep(freq: number, dur = 0.09, type: OscillatorType = 'square', vol = 0.18): void {
    if (this.volumes.sfx <= 0) return;
    if (!this.ctx) this.ensureCtx();
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      this.tone(freq, this.ctx.currentTime + 0.01, dur, type, vol);
    } catch { /* synthesized */ }
  }

  /** Mini-turbo release — pitch ladder by charge level (blue/orange/purple). */
  playMiniTurbo(level: number): void {
    if (this.volumes.sfx <= 0) return;
    if (!this.ctx) this.ensureCtx();
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const ctx = this.ctx;
      const t0 = ctx.currentTime + 0.01;
      const base = 290 + Math.min(3, Math.max(1, level)) * 130;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(base, t0);
      osc.frequency.exponentialRampToValueAtTime(base * 2.5, t0 + 0.16);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.15 * this.volumes.sfx, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
      osc.connect(g).connect(this.sfxGain ?? ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.27);
    } catch { /* synthesized */ }
  }

  /** Boost mushroom/pad — rising noise whoosh + low growl. */
  playBoost(): void {
    if (this.volumes.sfx <= 0) return;
    if (!this.ctx) this.ensureCtx();
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const ctx = this.ctx;
      const t0 = ctx.currentTime;
      const dur = 0.42;
      const sr = ctx.sampleRate;
      const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * (0.35 + t * 0.65);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(420, t0);
      filt.frequency.exponentialRampToValueAtTime(2900, t0 + dur * 0.8);
      filt.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.34 * this.volumes.sfx, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filt).connect(g).connect(this.sfxGain ?? ctx.destination);
      src.start();
    } catch { /* synthesized */ }
  }

  /** Getting wrecked — descending buzz + body thud. */
  playHit(): void {
    if (this.volumes.sfx <= 0) return;
    if (!this.ctx) this.ensureCtx();
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const ctx = this.ctx;
      const t0 = ctx.currentTime + 0.01;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(230, t0);
      osc.frequency.exponentialRampToValueAtTime(52, t0 + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.22 * this.volumes.sfx, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
      osc.connect(g).connect(this.sfxGain ?? ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.38);
      this.tone(96, t0, 0.16, 'sine', 0.24);   // chassis thud
    } catch { /* synthesized */ }
  }

  /** Position change — rising pair (gained) / single low (lost). */
  playPosition(up: boolean): void {
    if (up) {
      this.playBeep(660, 0.07, 'triangle', 0.16);
      setTimeout(() => this.playBeep(880, 0.09, 'triangle', 0.16), 75);
    } else {
      this.playBeep(392, 0.1, 'triangle', 0.13);
    }
  }

  /** Lap / final-lap jingle (final = brighter, faster, MK8 "last lap" punch). */
  playLapJingle(final: boolean): void {
    if (this.volumes.sfx <= 0) return;
    if (!this.ctx) this.ensureCtx();
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const t0 = this.ctx.currentTime + 0.02;
      if (final) {
        const seq = [392, 523.25, 659.25, 783.99, 1046.5];
        seq.forEach((f, i) => this.tone(f, t0 + i * 0.09, 0.14, 'square', 0.16));
        this.tone(1318.5, t0 + 0.5, 0.4, 'triangle', 0.2);
      } else {
        const seq = [523.25, 659.25, 783.99];
        seq.forEach((f, i) => this.tone(f, t0 + i * 0.08, 0.12, 'triangle', 0.14));
      }
    } catch { /* synthesized */ }
  }

  /** Star invincibility pickup jingle. */
  playStar(): void {
    if (this.volumes.sfx <= 0) return;
    if (!this.ctx) this.ensureCtx();
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const t0 = this.ctx.currentTime + 0.02;
      const seq = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1046.5, 1318.5];
      seq.forEach((f, i) => this.tone(f, t0 + i * 0.07, 0.1, 'square', 0.14));
    } catch { /* synthesized */ }
  }

  /** Hard landing thud (suspension compress). */
  playLanding(strength: number): void {
    if (this.volumes.sfx <= 0) return;
    if (!this.ctx) this.ensureCtx();
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const t0 = this.ctx.currentTime + 0.01;
      this.tone(110 - Math.min(30, strength * 8), t0, 0.14, 'sine', 0.1 + 0.12 * Math.min(1, strength));
    } catch { /* synthesized */ }
  }

  /** Item box pop. */
  playBoxPop(): void {
    this.playBeep(740, 0.05, 'triangle', 0.2);
    setTimeout(() => this.playBeep(1180, 0.06, 'triangle', 0.16), 45);
  }

  /** v8 MK8 hop — a tight spring "pop": pitch snaps up then settles. */
  playHop(): void {
    if (this.volumes.sfx <= 0) return;
    if (!this.ctx) this.ensureCtx();
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const ctx = this.ctx;
      const t0 = ctx.currentTime + 0.01;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, t0);
      osc.frequency.exponentialRampToValueAtTime(560, t0 + 0.07);
      osc.frequency.exponentialRampToValueAtTime(320, t0 + 0.16);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16 * this.volumes.sfx, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.17);
      osc.connect(g).connect(this.sfxGain ?? ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    } catch { /* synthesized */ }
  }

  /** v8 slipstream catch — airy whoosh as the draft grabs on. */
  playSlipstream(): void {
    if (this.volumes.sfx <= 0) return;
    if (!this.ctx) this.ensureCtx();
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const ctx = this.ctx;
      const t0 = ctx.currentTime;
      const dur = 0.35;
      const sr = ctx.sampleRate;
      const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI) * 0.5;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(900, t0);
      filt.frequency.exponentialRampToValueAtTime(2200, t0 + dur);
      filt.Q.value = 2.2;
      const g = ctx.createGain();
      g.gain.value = 0.16 * this.volumes.sfx;
      src.connect(filt).connect(g).connect(this.sfxGain ?? ctx.destination);
      src.start(t0);
      src.stop(t0 + dur);
    } catch { /* synthesized */ }
  }

  // ---------------------------------------------- item roulette ticking

  private rouletteTimer: ReturnType<typeof setInterval> | null = null;

  /** Start/stop the roulette ticker (resolve blip on stop). */
  setRoulette(active: boolean): void {
    if (active && !this.rouletteTimer) {
      let i = 0;
      this.rouletteTimer = setInterval(() => {
        this.playBeep(960 + (i++ % 2) * 150, 0.03, 'square', 0.09);
      }, 86);
    } else if (!active && this.rouletteTimer) {
      clearInterval(this.rouletteTimer);
      this.rouletteTimer = null;
      this.playBeep(1320, 0.1, 'square', 0.18);
    }
  }

  // ---------------------------------------------- music tempo

  /** MK8-style last-lap music speed-up (1 = normal, 1.06 = final lap). */
  setMusicRate(rate: number): void {
    if (!this.musicEl) return;
    try {
      this.musicEl.playbackRate = Math.max(0.5, Math.min(2, rate));
      // keep loudness roughly constant when speeding up
      this.musicEl.volume = (this.musicWanted ? this.volumes.music : 0) * (rate > 1 ? 0.92 : 1);
    } catch { /* playbackRate unsupported — ignore */ }
  }

  /** Single oscillator tone with a soft attack/decay envelope. */
  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * this.volumes.sfx), at + 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(this.sfxGain ?? ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.05);
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
