/**
 * APEX KART — Game orchestrator.
 * Owns the renderer, post-processing, lighting, the fixed-step simulation
 * and the session lifecycle (race modes + battle + GP progression).
 * React only talks to this class through the GameBridge + public API.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Difficulty, ItemId, KartControls, RaceResultRow, SessionConfig, AIPersonality } from './Types';
import { PHYS, RACE, VIDEO } from './Config';
import { InputManager } from './InputManager';
import { GameBridge } from './GameBridge';
import { SaveData } from '../persistence/SaveData';
import { CHARACTERS, CHARACTER_MAP } from '../karts/KartStats';
import { KartController } from '../karts/KartController';
import { KartVisual, type VisualModels } from '../karts/KartVisual';
import { ModelLibrary } from '../assets/ModelLibrary';
import { BattleWorld, TrackWorld } from '../tracks/TrackBuilder';
import { ARENAS, CUPS, TRACKS } from '../tracks/TrackCatalog';
import { AIDriver } from '../ai/AIDriver';
import { ItemSystem } from '../items/ItemSystem';
import { ITEM_MAP } from '../items/ItemData';
import { RaceManager } from '../race/RaceManager';
import { GhostPlayer, GhostRecorder } from '../race/Ghost';
import { ParticleSystem } from '../fx/ParticleSystem';
import { CameraController } from '../fx/CameraController';
import { makeRng } from './MathUtils';
import { AudioSys } from './AudioSystem';
import { NetClient } from '../net/NetClient';
import { RemoteDriver } from '../net/RemoteDriver';
import type { NetEvent, NetKartState, NetResultRow } from '../net/NetTypes';
import { ST_BOOST, ST_HELD, ST_INVULN, ST_SHRINK, ST_SPIN, ST_STAR } from '../net/NetTypes';

const VignetteShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, strength: { value: 0.55 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - smoothstep(0.35, 0.92, d) * strength;
      gl_FragColor = c;
    }`,
};

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private vignette: ShaderPass;
  private outputPass: OutputPass;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;

  readonly camera: CameraController;
  readonly input = new InputManager();
  readonly bridge: GameBridge;
  private particles = new ParticleSystem();

  private world: TrackWorld | BattleWorld | null = null;
  private karts: KartController[] = [];
  private visuals = new Map<string, KartVisual>();
  private aiDrivers = new Map<string, AIDriver>();
  private items: ItemSystem | null = null;
  private race: RaceManager | null = null;
  private ghostRecorder: GhostRecorder | null = null;
  private ghostPlayer: GhostPlayer | null = null;

  private session: SessionConfig | null = null;
  private phase: 'idle' | 'countdown' | 'racing' | 'finished' = 'idle';
  private paused = false;
  private rafId = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private elapsed = 0;

  // online play (null in offline sessions)
  net: NetClient | null = null;
  /** QA: when set, overrides the player's controls (deterministic tests) */
  qaControls: KartControls | null = null;
  private remoteDrivers = new Map<string, RemoteDriver>();
  private netNameTags = new Map<string, THREE.Sprite>();
  private netTick = 0;
  /** online CPU fillers simulated by THIS client (host only) */
  private netBotIds = new Set<string>();
  private prevCoins = new Map<string, number>();

  // GP progression state (persists across the 3 races of a cup)
  private gp: { cupId: string; cupName: string; trackIndex: number; points: Map<string, number>; roster: string[] } | null = null;
  // battle state
  private battle: { startAtMs: number; durationMs: number } | null = null;

  // HUD canvases drawn by the engine (bypass React for 60fps elements)
  private minimapCtx: CanvasRenderingContext2D | null = null;
  private speedoCtx: CanvasRenderingContext2D | null = null;

  private rng = makeRng(Date.now() & 0xffff);
  private hudPublishAt = 0;
  private playerFinishAtMs = 0;
  private resultPublished = false;
  private fps = 0;
  private fpsFrames = 0;
  private fpsAt = 0;
  private framesRendered = 0;

  constructor(canvas: HTMLCanvasElement, minimapCanvas: HTMLCanvasElement | null,
    speedoCanvas: HTMLCanvasElement | null, bridge: GameBridge) {
    this.bridge = bridge;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // r186: PCFSoft removed

    this.camera = new CameraController(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    // three >= r155 uses physically-correct lights (no legacy π factor), so
    // intensities live in the ~3-4 range for sunny outdoor scenes.
    this.sun = new THREE.DirectionalLight(0xffffff, 3.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 10; sc.far = 260;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 2.4);
    this.ambient = new THREE.AmbientLight(0x8899bb, 0);
    this.scene.add(this.sun, this.sun.target, this.hemi, this.ambient);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.45, 0.5, 0.86);
    this.composer.addPass(this.bloom);
    this.vignette = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignette);
    // OutputPass: applies ACES tone mapping + sRGB conversion at the END of
    // the chain. Without it the composer writes linear values straight to the
    // screen and the whole scene renders ~5x too dark (muddy, texture-less).
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.scene.add(this.particles.points);

    if (minimapCanvas) this.minimapCtx = minimapCanvas.getContext('2d');
    if (speedoCanvas) this.speedoCtx = speedoCanvas.getContext('2d');

    this.input.attach();

    // GLB model library (public/models + manifest.json): loads in the
    // background while the player is in the menus; races pick up whatever
    // is ready and fall back to procedural visuals otherwise.
    ModelLibrary.get().init();
    const savedOpts = SaveData.options;
    AudioSys.init({ music: savedOpts.musicVolume, sfx: savedOpts.sfxVolume });
    this.applyQuality(savedOpts.quality);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.lastFrame = performance.now();
    this.rafId = requestAnimationFrame(this.loop);

    // QA debug hook (harmless in production)
    (window as unknown as Record<string, unknown>).__apex = {
      version: 'calm1',
      /** QA: the live Game instance (startSession etc.) */
      game: (): unknown => this,
      /** QA: jump straight into a race without touching the menus */
      qaRace: (trackId: string, cc = 100, aiCount = 11): void => {
        this.startSession({
          mode: 'vs', difficulty: cc as Difficulty, mirror: false,
          trackId, laps: 3, aiCount, itemsEnabled: true, aiRubberBand: 0.5,
          playerId: 'rex', playerKartColor: 0xe85a5a,
        });
      },
      /** QA: live scene access (decor verification etc.) */
      scene: (): unknown => (this as unknown as { scene?: unknown }).scene ?? null,
      /** QA: fresh NetClient instances for in-page P2P protocol tests */
      makeNet: (): unknown => new NetClient(),
      state: (): unknown => ({
        phase: this.phase,
        karts: this.karts.map(k => ({
          id: k.id, s: +k.progressS.toFixed(4),
          lap: this.race?.states.get(k.id)?.lap ?? k.lap,
          sector: k.sector,
          hp: k.battleHp, ko: k.battleKo, team: k.battleTeam, finished: k.finished,
          item: k.itemSlot as string | null, roulette: k.rouletteUntil > 0, held: k.itemHeldOut,
          coins: k.coins, trick: +(k.trickT || 0).toFixed(2), air: +(k.airTime || 0).toFixed(2),
          speed: +k.speed.toFixed(1), rank: k.rank, grounded: k.grounded, yaw: +k.yaw.toFixed(3),
          drift: k.drifting, driftLv: k.driftLevel, boost: k.boosting,
          ctrl: this.lastControls.get(k.id) ?? null,
          grind: +(k.railGrindT || 0).toFixed(2),
          wobble: +(k.wobbleT || 0).toFixed(2),
          wallHit: +(k.wallHit || 0).toFixed(2),
          ai: this.aiDrivers.get(k.id)?.dbg ?? null,
          pos: k.pos.toArray().map((v: number) => +v.toFixed(1)),
          resp: k.requestRespawn,
          gi: k.ginfo ? {
            rough: +k.ginfo.roughness.toFixed(2), onRoad: k.ginfo.onRoad,
            onSc: k.ginfo.onShortcut, hasG: k.ginfo.hasGround,
            h: +k.ginfo.height.toFixed(1), lat: +k.ginfo.lateral.toFixed(1),
            jump: k.ginfo.onJump, spin: +(k.spinT || 0).toFixed(2),
            smPos: (k.ginfo.mainIdx >= 0 ? ((this.world as unknown as { spline?: { samples: { pos: THREE.Vector3 }[] } }).spline?.samples?.[k.ginfo.mainIdx]?.pos?.toArray() ?? null) : null),
          } : null,
        })),
        race: this.race ? {
          phase: this.race.phase, goAt: this.race.goAtMs,
          states: [...this.race.states.entries()].map(([id, st]) => ({
            id, lap: st.lap, sectors: st.sectors.map(Number), lastS: +st.lastS.toFixed(4), totalM: +st.totalM.toFixed(1),
          })),
        } : null,
        battle: this.battle ? { t: +(this.elapsed).toFixed(1), proj: this.items ? this.items.activeProjectiles : 0, traps: this.items ? this.items.activeTraps : 0 } : null,
        ghost: { loaded: !!this.ghostPlayer, playing: this.ghostPlayer?.playing ?? false, recording: !!this.ghostRecorder },
        coins: this.world && 'coins' in this.world
          ? {
              total: (this.world as unknown as { coins: { active: boolean; pos: THREE.Vector3 }[] }).coins.length,
              active: (this.world as unknown as { coins: { active: boolean }[] }).coins.filter(c => c.active).length,
              first: (this.world as unknown as { coins: { pos: THREE.Vector3 }[] }).coins.slice(0, 2).map(c => c.pos.toArray().map(v => +v.toFixed(1))),
            }
          : null,
        fps: this.fps,
        frames: this.framesRendered,
      }),
      /** QA: inspect live scene materials. */
      probe: (): unknown => {
        const out: Record<string, unknown> = { meshes: 0, basic: 0, lambert: 0, roadSample: null as unknown };
        let roadChecked = false;
        this.scene.traverse(o => {
          const m = o as THREE.Mesh;
          if (!(m as THREE.Mesh).isMesh) return;
          out.meshes = (out.meshes as number) + 1;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mm of mats) {
            if ((mm as THREE.Material).type === 'MeshBasicMaterial') out.basic = (out.basic as number) + 1;
            else if ((mm as THREE.Material).type === 'MeshLambertMaterial') out.lambert = (out.lambert as number) + 1;
          }
          const geo = m.geometry as THREE.BufferGeometry;
          if (!roadChecked && geo.getAttribute && geo.getAttribute('uv') && (geo.getAttribute('uv') as THREE.BufferAttribute).count > 1000) {
            roadChecked = true;
            const mat = Array.isArray(m.material) ? m.material[0] : m.material;
            const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
            let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
            for (let i = 0; i < uv.count; i += 97) {
              uMin = Math.min(uMin, uv.getX(i)); uMax = Math.max(uMax, uv.getX(i));
              vMin = Math.min(vMin, uv.getY(i)); vMax = Math.max(vMax, uv.getY(i));
            }
            out.roadSample = {
              matType: mat.type,
              hasMap: !!(mat as THREE.MeshLambertMaterial).map,
              mapW: ((mat as THREE.MeshLambertMaterial).map?.image as { width?: number } | undefined)?.width ?? 0,
              verts: uv.count,
              uRange: [uMin, uMax], vRange: [vMin, vMax],
              colorAttr: !!geo.getAttribute('color'),
            };
          }
          if (!roadChecked && out.roadSample === null && geo.getAttribute && geo.getAttribute('color') && (geo.getAttribute('color') as THREE.BufferAttribute).count > 5000) {
            const col = geo.getAttribute('color') as THREE.BufferAttribute;
            const mat = Array.isArray(m.material) ? m.material[0] : m.material;
            out.roadSample = {
              matType: mat.type,
              verts: col.count,
              c0: [col.getX(0), col.getY(0), col.getZ(0)],
              cMid: [col.getX(Math.floor(col.count / 2)), col.getY(Math.floor(col.count / 2)), col.getZ(Math.floor(col.count / 2))],
            };
          }
        });
        return out;
      },
      /** QA: dump the road texture as a data URL for visual inspection. */
      dumpRoadTexture: (): string | null => {
        let found: THREE.Texture | null = null;
        this.scene.traverse(o => {
          const m = o as THREE.Mesh;
          if (found || !(m as THREE.Mesh).isMesh) return;
          const geo = m.geometry as THREE.BufferGeometry;
          if (!geo.getAttribute || !geo.getAttribute('uv')) return;
          if ((geo.getAttribute('uv') as THREE.BufferAttribute).count < 1000) return;
          const mat = Array.isArray(m.material) ? m.material[0] : m.material;
          const map = (mat as THREE.MeshLambertMaterial).map;
          if (map) found = map;
        });
        const img = (found as unknown as { image?: HTMLCanvasElement } | null)?.image;
        return img && img.toDataURL ? img.toDataURL('image/png') : null;
      },
      /** QA helper: start any session instantly, bypassing menus. */
      start: (over: Partial<SessionConfig>): void => {
        this.startSession({
          mode: 'grandprix',
          difficulty: 100,
          mirror: false,
          playerId: 'zippy',
          playerKartColor: 0x35d17a,
          aiCount: 11,
          itemsEnabled: true,
          aiRubberBand: 0.5,
          cupId: 'copa_verde',
          trackId: 'meadow',
          ...over,
        });
      },
      /** QA helper: deterministic headless simulation stepping. */
      step: (seconds: number): number => this.qaStep(seconds),
      /** QA helper: override player controls (null = real input). */
      ctrl: (c: Partial<KartControls> | null): string => {
        if (c == null) { this.qaControls = null; return 'real-input'; }
        this.qaControls = { ...this.NEUTRAL, ...c };
        return 'qa-ctrl';
      },
      /** QA helper: force an item roulette on the player (resolves next step). */
      giveItem: (): string => {
        const k = this.karts[0];
        if (!k || !this.items) return 'no-kart';
        k.itemSlot = null; k.itemCharges = 0;
        k.itemSlot2 = null; k.itemCharges2 = 0;
        this.items.giveRoulette(k);
        k.rouletteUntil = performance.now() - 1;   // resolve on next update
        return 'roulette';
      },
      /** QA helper: teleport the player kart to track progress s. */
      tp: (s: number): string => {
        const w = this.world;
        if (!(w instanceof TrackWorld) || !this.karts[0]) return 'no-world';
        const sp = w.spline;
        const sm = sp.sampleAt(((s % 1) + 1) % 1);
        this.karts[0].respawnAt(sp.roadPoint(((s % 1) + 1) % 1, 0), Math.atan2(sm.tangent.x, sm.tangent.z));
        this.karts[0].speed = 18;
        return 'tp-' + ((s % 1) + 1) % 1;
      },
      /** QA helper: teleport the player to world coords with explicit yaw/speed. */
      tp3: (x: number, y: number, z: number, yaw: number, speed: number): string => {
        const k = this.karts[0];
        if (!k) return 'no-kart';
        k.pos.set(x, y, z);
        k.yaw = yaw;
        k.speed = speed;
        k.vy = 0;
        k.grounded = true;
        return 'tp3';
      },
      /** QA helper: jump-run and tunnel spans of the loaded track. */
      spans: (): unknown => {
        const w = this.world;
        if (!(w instanceof TrackWorld)) return null;
        const sp = w.spline;
        const runs: [number, number][] = [];
        const tunnels: [number, number][] = [];
        const N = sp.samples.length;
        let i = 0;
        while (i < N) {
          const flag = sp.samples[i].jump ? 'j' : sp.samples[i].tunnel ? 't' : '';
          if (!flag) { i++; continue; }
          const start = i;
          while (i < N && (flag === 'j' ? sp.samples[i].jump : sp.samples[i].tunnel)) i++;
          (flag === 'j' ? runs : tunnels).push([
            +sp.samples[start % N].s.toFixed(3),
            +sp.samples[Math.min(i, N - 1) % N].s.toFixed(3),
          ]);
        }
        return { len: Math.round(sp.length), runs, tunnels };
      },
      /** QA helper: deep diagnostics for every large road-like mesh. */
      roadDebug: (): unknown => {
        const out: unknown[] = [];
        this.scene.traverse(o => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const geo = m.geometry as THREE.BufferGeometry;
          if (!geo.getAttribute || !geo.getAttribute('uv')) return;
          const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
          if (uv.count < 600) return; // road-scale meshes only
          geo.computeBoundingSphere();
          const bs = geo.boundingSphere!;
          const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshLambertMaterial;
          const nrm = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
          const p0 = m.getWorldPosition(new THREE.Vector3());
          out.push({
            name: m.name || m.parent?.name || '(anon)',
            type: m.constructor.name,
            visible: m.visible,
            parentVisible: m.parent?.visible ?? true,
            layer: m.layers.mask,
            verts: uv.count,
            worldPos: p0.toArray().map((v: number) => +v.toFixed(1)),
            bsRadius: +bs.radius.toFixed(1),
            bsCenter: bs.center.toArray().map((v: number) => +v.toFixed(1)),
            matType: mat.type,
            side: mat.side,
            transparent: mat.transparent,
            opacity: mat.opacity,
            hasMap: !!mat.map,
            mapImg: (mat.map?.image as { width?: number } | undefined)?.width ?? 0,
            colorHex: '#' + mat.color?.getHexString?.(),
            n0: nrm ? [ +nrm.getX(0).toFixed(2), +nrm.getY(0).toFixed(2), +nrm.getZ(0).toFixed(2) ] : null,
            nMid: nrm ? [ +nrm.getX(Math.floor(nrm.count / 2)).toFixed(2), +nrm.getY(Math.floor(nrm.count / 2)).toFixed(2), +nrm.getZ(Math.floor(nrm.count / 2)).toFixed(2) ] : null,
          });
        });
        return out;
      },
      /** QA helper: force DoubleSide on all road-like materials (winding test). */
      roadDoubleSide: (): string => {
        let n = 0;
        this.scene.traverse(o => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshLambertMaterial;
          if (mat.type === 'MeshLambertMaterial' || mat.type === 'MeshBasicMaterial') {
            const geo = m.geometry as THREE.BufferGeometry;
            if (geo.getAttribute('uv') && (geo.getAttribute('uv') as THREE.BufferAttribute).count >= 600) {
              mat.side = THREE.DoubleSide; n++;
            }
          }
        });
        return 'doubleside-' + n;
      },
    };
  }

  private onResize = (): void => {
    const canvas = this.renderer.domElement;
    const parent = canvas.parentElement;
    const w = parent?.clientWidth ?? window.innerWidth;
    const h = parent?.clientHeight ?? window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.resize(w / Math.max(1, h));
  };

  applyQuality(q: 'low' | 'medium' | 'high'): void {
    const cfg = VIDEO.quality[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cfg.pixelRatio));
    this.renderer.shadowMap.enabled = cfg.shadows;
    this.sun.castShadow = cfg.shadows;
    this.bloom.enabled = cfg.bloom;
  }

  /** HUD canvases mount with the race screen — attach once available. */
  attachHudCanvases(minimap: HTMLCanvasElement, speedo: HTMLCanvasElement): void {
    this.minimapCtx = minimap.getContext('2d');
    this.speedoCtx = speedo.getContext('2d');
  }

  /** Player chose to skip spectating. */
  forceResults(): void {
    if (this.resultPublished) return;
    if (this.race) this.finishRace();
    else if (this.battle) {
      const red = this.karts.filter(k => k.battleTeam === 0 && !k.battleKo).length;
      const blue = this.karts.filter(k => k.battleTeam === 1 && !k.battleKo).length;
      this.finishBattle(red, blue);
    }
  }

  // ============================================================ session setup

  startSession(cfg: SessionConfig): void {
    this.disposeSession();
    this.session = cfg;
    this.resultPublished = false;
    this.playerFinishAtMs = 0;
    this.rng = makeRng((Date.now() ^ (cfg.trackId?.length ?? 3) * 7919) & 0xffff);

    const q = VIDEO.quality[SaveData.options.quality];
    const opts = SaveData.options;

    // ---- world ------------------------------------------------------------
    if (cfg.mode === 'battle') {
      const arena = ARENAS[cfg.arenaId ?? 'arena_meadow'];
      this.world = new BattleWorld(arena.id, arena.name, arena.theme, arena.radius, arena.obstacles, q.decor);
    } else {
      const def = TRACKS[cfg.trackId ?? 'meadow'];
      this.world = new TrackWorld(def, cfg.mirror, q.decor, q.crowd);
    }
    this.scene.add(this.world.group);

    const style = this.world.style;
    this.scene.fog = new THREE.Fog(style.fog, style.fogNear, style.fogFar);
    const theme = this.world instanceof TrackWorld ? this.world.def.theme : (this.world as BattleWorld).theme;
    const darkTheme = ['city', 'space', 'volcano', 'prism'].includes(theme);
    this.sun.color.setHex(style.sun);
    // Light calibration for the now-VISIBLE road strips (they used to be
    // backface-culled, so the π-scaled units overexposed nothing). Lambert
    // albedo/π × irradiance: sun ≈ sunIntensity·1.85 + hemi ≈ 1.35 keeps the
    // photo-asphalt reading ~130/255 after ACES instead of clipping white.
    this.sun.intensity = style.sunIntensity * (darkTheme ? 2.05 : 1.85) + (darkTheme ? 1.35 : 0);
    this.hemi.color.setHex(style.hemiSky);
    this.hemi.groundColor.setHex(style.hemiGround);
    this.hemi.intensity = darkTheme ? 1.6 : 1.35;
    this.ambient.intensity = darkTheme ? 0.9 : 0.3;
    this.renderer.toneMappingExposure = darkTheme ? 1.3 : 1.0;
    // pull the fog back so the nearby track stays readable on dark themes
    if (darkTheme && this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near *= 1.6;
      this.scene.fog.far *= 1.25;
    }

    // ---- GP bookkeeping ------------------------------------------------------
    if (cfg.mode === 'grandprix') {
      const cup = CUPS.find(c => c.id === cfg.cupId) ?? CUPS[0];
      if (!this.gp || this.gp.cupId !== cup.id) {
        this.gp = { cupId: cup.id, cupName: cup.name, trackIndex: 0, points: new Map(), roster: [] };
      }
      this.gp.trackIndex = cup.tracks.indexOf(cfg.trackId ?? cup.tracks[0]);
    } else {
      this.gp = null;
    }

    // ---- karts -------------------------------------------------------------------
    const cc = PHYS.ccScale[cfg.difficulty] ?? 1;

    const playerStats = CHARACTER_MAP[cfg.playerId];
    const player = new KartController(playerStats, true, `player-${cfg.playerId}`);
    player.ccScale = cc;
    player.itemSlot = null;
    this.karts.push(player);

    if (cfg.online) {
      // ---- online: peer puppets + CPU FILL ----------------------------------
      // Host simulates the CPU fillers (grid entries flagged `bot`) and
      // streams their state; guests race them as interpolated puppets.
      const isHost = !!cfg.online.isHost;
      const personalities: AIPersonality[] = ['aggressive', 'defensive', 'reckless'];
      let botIdx = 0;
      for (const g of cfg.online.grid) {
        if (g.id === cfg.online.localId) continue;
        const stats = CHARACTER_MAP[g.charId] ?? CHARACTER_MAP.zippy;
        if (g.bot) {
          if (isHost) {
            // host authority: a real AI racer keyed by its grid id
            const kart = new KartController(stats, false, g.id);
            kart.ccScale = cc;
            this.karts.push(kart);
            this.aiDrivers.set(kart.id, new AIDriver(kart,
              personalities[botIdx % personalities.length], botIdx * 1013 + 7));
            this.netBotIds.add(g.id);
          } else {
            // guest: puppet with the SAME id so net events resolve everywhere
            const kart = new KartController(stats, false, g.id);
            kart.remoteDriven = true;
            kart.ccScale = cc;
            this.karts.push(kart);
            this.remoteDrivers.set(g.id, new RemoteDriver(kart));
          }
          botIdx++;
        } else {
          const kart = new KartController(stats, false, `net-${g.id}`);
          kart.remoteDriven = true;
          kart.ccScale = cc;
          this.karts.push(kart);
          this.remoteDrivers.set(g.id, new RemoteDriver(kart));
        }
      }
    } else {
      // ---- AI roster: the other characters (locked ones still race as rivals)
      const pool = CHARACTERS.filter(c => c.id !== cfg.playerId);
      const shuffled = [...pool].sort(() => this.rng() - 0.5);
      const personalities: AIPersonality[] = [
        'aggressive', 'defensive', 'reckless', 'aggressive', 'defensive',
        'reckless', 'aggressive', 'defensive', 'reckless', 'aggressive', 'defensive',
      ];
      const aiCount = cfg.mode === 'timetrial' ? 0 : Math.min(cfg.aiCount, 11);
      for (let i = 0; i < aiCount; i++) {
        const stats = shuffled[i % shuffled.length];
        const kart = new KartController(stats, false, `ai${i}-${stats.id}`);
        kart.ccScale = cc;
        kart.battleTeam = i < 5 ? 0 : 1;      // first 5 join player's red team
        this.karts.push(kart);
        this.aiDrivers.set(kart.id, new AIDriver(kart, personalities[i % personalities.length], (i + 1) * 1013 + 7));
      }
    }
    player.battleTeam = 0;

    // ---- spawn placement ------------------------------------------------------------
    const spawns = this.world instanceof TrackWorld ? this.world.spawnPoints : this.makeArenaSpawns();
    // online: grid order comes from the server; GP: later races by standings
    let order = this.karts;
    if (cfg.online) {
      const byId = new Map(this.karts.map(k => [k.id, k] as const));
      order = cfg.online.grid
        .map(g => byId.get(g.id === cfg.online!.localId
          ? `player-${cfg.playerId}`
          : (g.bot ? g.id : `net-${g.id}`)))
        .filter((k): k is KartController => !!k);
    } else if (this.gp && this.gp.trackIndex > 0) {
      order = [...this.karts].sort((a, b) =>
        (this.gp!.points.get(b.id) ?? 0) - (this.gp!.points.get(a.id) ?? 0));
    }
    order.forEach((kart, i) => {
      const sp = spawns[i % spawns.length];
      kart.respawnAt(sp, this.spawnYaw(sp));
      kart.lap = 0;
      kart.finished = false;
      kart.battleHp = 3;
      kart.battleKo = false;
    });

    // ---- visuals -------------------------------------------------------------------------
    for (const kart of this.karts) {
      let color = kart.isPlayer ? cfg.playerKartColor : (kart.stats as any).color ?? 0xcc4444;
      if (cfg.online && !kart.isPlayer) {
        const g = cfg.online.grid.find(x => (x.bot ? x.id : `net-${x.id}`) === kart.id);
        if (g) color = g.color;
      }
      const visual = new KartVisual(kart.stats.id, color, this.resolveModels(kart.stats.id));
      this.visuals.set(kart.id, visual);
      this.scene.add(visual.group);
    }
    // floating name tags for online HUMAN peers (CPU fillers stay clean)
    if (cfg.online) {
      for (const g of cfg.online.grid) {
        if (g.id === cfg.online.localId || g.bot) continue;
        this.attachNameTag(`net-${g.id}`, g.name);
      }
    }

    // ---- systems ------------------------------------------------------------------------------
    const stepWorld = this.world as unknown as import('../karts/KartController').StepWorld;
    this.items = new ItemSystem(stepWorld as any, this.karts, (Date.now() & 0xffff));
    // MK-style hold-behind: while the item button is held when the roulette
    // resolves, the item trails behind the kart as a rear shield (fire on release)
    this.items.holdIntent = (k) =>
      k.isPlayer ? (this.lastControls.get(k.id)?.itemHeld ?? false) : k.itemHeldOut;
    this.items.teamMode = cfg.mode === 'battle';
    this.items.onEvent = (e) => this.onItemEvent(e);
    this.scene.add(this.items.group);

    if (cfg.online) {
      this.items.netMode = true;
      // locally-authoritative karts: the player + (on the host) the CPU fillers
      this.items.localKartIds = new Set([player.id, ...this.netBotIds]);
    }

    if (cfg.mode === 'battle') {
      this.battle = {
        startAtMs: performance.now() + RACE.countdownStepMs * 3 + RACE.goDelayMs,
        durationMs: (cfg.battleTime ?? 180) * 1000,
      };
      for (const k of this.karts) k.battleHp = 3;
    } else {
      this.battle = null;
      // VS and time-trial honor a lap override; GP uses the track default
      const defLaps = TRACKS[cfg.trackId ?? 'meadow'].laps;
      const laps = cfg.mode === 'vs' || cfg.mode === 'timetrial' ? (cfg.laps ?? defLaps) : defLaps;
      this.race = new RaceManager(this.karts, this.world as TrackWorld, cfg.mode, laps);
      if (cfg.online) {
        // align GO with the server clock (race:start.startAt is epoch-ms)
        this.race.goAtMs = performance.now() + Math.max(1500, cfg.online.startAt - Date.now());
      }
      this.race.onAnnounce = (m) => {
        if (!m.text) return;
        this.bridge.pushAnnouncer(m.text, m.tone);
        if (m.kind === 'countdown') this.bridge.publish({ countdown: parseInt(m.text, 10) });
        if (m.kind === 'go') {
          this.bridge.publish({ countdown: 0 });
          setTimeout(() => this.bridge.publish({ countdown: null }), 800);
        }
      };
      this.race.onLap = (kart, lap, lapMs) => this.onLapComplete(kart, lap, lapMs);
      this.race.onFinish = (kart, pos) => this.onKartFinish(kart, pos);

      if (cfg.mode === 'timetrial') {
        this.ghostRecorder = new GhostRecorder(cfg.trackId!, cfg.playerId);
        const ghostData = SaveData.getGhost(cfg.trackId!);
        if (ghostData) {
          this.ghostPlayer = new GhostPlayer(ghostData, this.scene);
        }
      }
    }

    // ---- go! ----------------------------------------------------------------------------------------
    this.phase = 'countdown';
    this.input.throttleHeldMs = 0;
    this.camera.snapBehind(player);

    // ---- online hooks ------------------------------------------------------------------------------
    if (cfg.online && this.net) {
      this.net.onPeerState = (id, st) => { this.remoteDrivers.get(id)?.push(st); };
      this.net.onPeerEvent = (id, ev) => this.handleNetEvent(id, ev);
      this.net.onPeerLeft = (id) => {
        const d = this.remoteDrivers.get(id);
        if (d) d.kart.finished = true;   // stop scoring; visual stays frozen
      };
      this.net.onRaceOver = (rows) => this.onNetRaceOver(rows);
    }
    this.bridge.publish({
      screen: 'race', phase: 'countdown', paused: false, countdown: null,
      results: null, needsContinue: false,
      position: 1, totalKarts: this.karts.length, lap: 0,
      laps: this.race?.laps ?? 0,
      itemSlot: null, itemCharges: 0, rouletteActive: false,
      announcer: [],
      gp: this.gp ? {
        cupId: this.gp.cupId, cupName: this.gp.cupName,
        trackIndex: this.gp.trackIndex, trackCount: 3,
        trackName: (TRACKS[cfg.trackId ?? ''] ?? { name: '' }).name,
      } : null,
      battle: this.battle ? { hp: 3, timeLeft: Math.round(this.battle.durationMs / 1000), redAlive: 6, blueAlive: 6, playerTeamKo: false } : null,
      timeTrial: cfg.mode === 'timetrial' ? {
        lapMs: 0, bestLapMs: SaveData.getBestLap(cfg.trackId!), bestTotalMs: SaveData.getBestRace(cfg.trackId!)?.time ?? null, totalMs: 0,
      } : null,
    });
  }

  private makeArenaSpawns(): THREE.Vector3[] {
    const r = this.world instanceof BattleWorld ? this.world.radius * 0.72 : 30;
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      out.push(new THREE.Vector3(Math.cos(a) * r, 0.5, Math.sin(a) * r));
    }
    return out;
  }

  private spawnYaw(sp: THREE.Vector3): number {
    // face the track direction (or arena center-outward for battle)
    if (this.world instanceof TrackWorld) {
      const proj = this.world.spline.project(sp, -1);
      const sm = this.world.spline.sampleAt(proj.s);
      return Math.atan2(sm.tangent.x, sm.tangent.z);
    }
    return Math.atan2(-sp.x, -sp.z) + Math.PI; // face center
  }

  // ============================================================ main loop

  private loop = (now: number): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const dtFrame = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    // rolling FPS meter
    this.fpsFrames++;
    if (now - this.fpsAt > 500) {
      this.fps = Math.round(this.fpsFrames * 1000 / (now - this.fpsAt));
      this.fpsFrames = 0;
      this.fpsAt = now;
    }
    if (this.phase === 'idle' || !this.world) return;

    this.input.poll(dtFrame);
    if (this.input.pausePressed && (this.phase === 'racing' || this.phase === 'countdown') && !this.resultPublished) {
      this.togglePause();
    }

    if (!this.paused) {
      this.accumulator += dtFrame;
      let steps = 0;
      while (this.accumulator >= PHYS.fixedDt && steps < PHYS.maxSubSteps) {
        this.fixedStep(PHYS.fixedDt, now);
        this.accumulator -= PHYS.fixedDt;
        steps++;
      }
      if (steps === PHYS.maxSubSteps) this.accumulator = 0;
      this.elapsed += dtFrame;
      this.world.update(this.elapsed, dtFrame);
      this.particles.update(dtFrame);
      this.updateVisuals(dtFrame, this.elapsed);
      this.updateCamera(dtFrame);
    }
    this.drawMinimap();
    this.drawSpeedo();
    this.publishHud(now);
    this.composer.render();
    this.framesRendered++;
  };

  private get stepWorld(): import('../karts/KartController').StepWorld {
    return this.world as unknown as import('../karts/KartController').StepWorld;
  }

  private NEUTRAL: KartControls = {
    throttle: 0, brake: 0, steer: 0, drift: false, driftRelease: false, fireItem: false, itemHeld: false, lookBack: false,
  };

  private lastControls = new Map<string, KartControls>();
  private battleTickStep = -1;

  private fixedStep(dt: number, nowMs: number): void {
    const player = this.karts[0];
    const cfg = this.session!;

    // ---------------- countdown phase ----------------
    if (this.phase === 'countdown') {
      if (this.race) {
        this.race.update(dt, nowMs);
        if (this.race.phase === 'racing') {
          this.phase = 'racing';
          this.race.evaluateTurboStart(player, this.input.throttleHeldMs);
          this.ghostPlayer?.start();
        }
      } else if (this.battle) {
        const remain = this.battle.startAtMs - nowMs;
        if (remain <= 0) {
          this.phase = 'racing';
          this.bridge.pushAnnouncer('¡YA!', 'hype');
          this.bridge.publish({ countdown: 0 });
          setTimeout(() => this.bridge.publish({ countdown: null }), 800);
        } else {
          const step = Math.ceil(remain / RACE.countdownStepMs);
          if (step !== this.battleTickStep) {
            this.battleTickStep = step;
            this.bridge.pushAnnouncer(`${step}`, 'info');
            this.bridge.publish({ countdown: step });
          }
        }
      }
      // karts settle on the grid with locked controls
      for (const k of this.karts) k.step(dt, this.stepWorld, this.karts, this.NEUTRAL, false);
      return;
    }

    // ---------------- racing / finished ----------------
    const racing = this.phase === 'racing';
    const itemsOn = cfg.itemsEnabled && racing;

    // AI context
    const playerTotalM = this.race?.states.get(player.id)?.totalM ?? 0;
    // shared AI perception, built ONCE per frame (not per kart).
    // battle worlds have no coins/trap lanes — guard with instanceof.
    const twShared = this.world instanceof TrackWorld ? this.world : null;
    const aiCoins = twShared && twShared.coins.length
      ? twShared.coins.reduce<{ s: number; lat: number }[]>((acc, c) => {
        if (c.active) acc.push({ s: c.s, lat: c.lat });
        return acc;
      }, [])
      : undefined;
    const aiTraps = this.items && this.items.trapHazards.length ? this.items.trapHazards : undefined;

    for (const kart of this.karts) {
      if (kart.battleKo) continue;
      if (kart.remoteDriven) continue;   // online puppet — pose set by RemoteDriver below
      let controls: KartControls;
      if (kart.isPlayer) {
        controls = this.qaControls ?? this.input.readControls();
        if (kart.finished) { controls.throttle = 0; controls.brake = 0.6; controls.drift = false; }
        if (kart.itemHeldOut && kart.itemSlot) {
          // item trailing behind as a shield — releasing the button fires it
          if (!controls.itemHeld) this.items!.useItem(kart, false);
        } else if (controls.fireItem && itemsOn && kart.itemSlot) {
          this.items!.useItem(kart, controls.lookBack);
        }
      } else {
        const driver = this.aiDrivers.get(kart.id);
        if (!driver || kart.finished || !racing) {
          controls = this.NEUTRAL;
        } else if (this.battle) {
          controls = driver.updateBattle(dt, {
            boxes: this.world!.itemBoxes.filter(b => b.active).map(b => b.pos),
            karts: this.karts, time: this.elapsed,
          });
        } else {
          const tw = this.world as TrackWorld;
          controls = driver.update(dt, {
            spline: tw.spline,
            shortcuts: tw.shortcuts,
            line: tw.racingLine,
            hazards: tw.hazards,
            boxes: tw.itemBoxes.filter(b => b.active).map(b => b.pos),
            karts: this.karts,
            playerTotalProgress: playerTotalM,
            aiTotalProgress: this.race?.states.get(kart.id)?.totalM ?? 0,
            rubberBand: cfg.aiRubberBand,
            unfair: cfg.difficulty >= 150,
            difficulty: cfg.difficulty,
            itemsEnabled: cfg.itemsEnabled,
            trackSpeedScale: tw.def.aiSpeedScale,
            time: this.elapsed,
            goElapsed: this.race ? (nowMs - this.race.goAtMs) / 1000 : undefined,
            coins: aiCoins,
            traps: aiTraps,
          });
        }
        if (controls.fireItem && itemsOn && kart.itemSlot) {
          this.items!.useItem(kart, false);
        }
      }
      this.lastControls.set(kart.id, controls);
      kart.step(dt, this.stepWorld, this.karts, controls, racing && !kart.finished);
    }

    // online: advance peer puppets to their interpolated pose + stream own state
    if (cfg.online) {
      for (const d of this.remoteDrivers.values()) d.update(nowMs);
      this.netTick++;
      if (this.net && this.netTick % 4 === 0 && !player.finished) {
        this.net.sendState(this.buildNetState(player));
      }
      // HOST: stream every CPU filler to the guests (same 15 Hz, staggered)
      if (this.net && cfg.online.isHost && this.netBotIds.size && this.netTick % 4 === 2) {
        for (const id of this.netBotIds) {
          const k = this.karts.find(x => x.id === id);
          if (k && !k.finished) this.net.sendBotState(id, this.buildNetState(k));
        }
      }
    }

    this.kartCollisions();
    this.pickupBoxes();
    if (this.world instanceof TrackWorld) this.pickupCoins();
    this.items!.update(dt, this.elapsed, racing && cfg.itemsEnabled);

    // guardrail scrapes: sparks + a camera kick for the local driver
    if (player.wallHit > 0.25) {
      this.camera.kick(player.wallHit * 0.8);
      const fwd = player.forward();
      this.particles.sparkBurst(new THREE.Vector3(
        player.pos.x + fwd.x * 0.9, player.pos.y + 0.35, player.pos.z + fwd.z * 0.9),
        player.wallHit);
    }

    if (this.race) {
      this.race.update(dt, nowMs);
      if (this.race.phase === 'finished' && !this.resultPublished) this.finishRace();
      if (this.playerFinishAtMs > 0 && nowMs - this.playerFinishAtMs > RACE.finishSpectateMs && !this.resultPublished) {
        this.finishRace();
      }
      // ghost record / replay
      if (racing && !player.finished && this.ghostRecorder) {
        this.ghostRecorder.record(dt, player.pos, player.yaw);
      }
      if (this.ghostPlayer) {
        this.ghostPlayer.update(Math.max(0, (nowMs - this.race.goAtMs) / 1000), this.elapsed);
      }
    }
    if (this.battle) this.battleTick(nowMs);
  }

  /** Resolve GLB overrides for a character (null → fully procedural). */
  private resolveModels(characterId: string): VisualModels | undefined {
    const lib = ModelLibrary.get();
    if (!lib.ready) return undefined;
    const models: VisualModels = {};
    const kart = lib.kartTemplate();
    if (kart) { models.kart = kart.scene; models.kartMeta = kart.meta; }
    const driver = lib.driverTemplate(characterId);
    if (driver) { models.driver = driver.scene; models.driverIncludesKart = driver.includesKart; }
    return models.kart || models.driver ? models : undefined;
  }

  // ============================================================ collisions

  private kartCollisions(): void {
    const R = PHYS.kartRadius * 2;
    for (let i = 0; i < this.karts.length; i++) {
      const a = this.karts[i];
      if (a.battleKo) continue;
      for (let j = i + 1; j < this.karts.length; j++) {
        const b = this.karts[j];
        if (b.battleKo) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const dy = b.pos.y - a.pos.y;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R || Math.abs(dy) > 1.4) continue;
        const d = Math.max(0.001, Math.sqrt(d2));
        const nx = dx / d, nz = dz / d;
        const overlap = R - d;
        const ma = a.stats.weight, mb = b.stats.weight;
        const total = ma + mb;

        // closing speed along the contact normal (a → b) BEFORE any impulse
        const da = a.velocityDir(), db = b.velocityDir();
        const vaN = a.speed * (da.x * nx + da.z * nz);          // a → b
        const vbN = b.speed * (db.x * -nx + db.z * -nz);         // b → a
        const closing = vaN + vbN;

        // ---- CRASH MECHANIC ------------------------------------------------
        // hard closing speeds wreck the lighter/softer kart: spin-out above
        // crashSpinClosing, a wobble + line loss above crashWobbleClosing.
        // Titans shrug hits off (bumpResist), heavies deal extra (bumpMul).
        if (closing > PHYS.crashWobbleClosing) {
          const power = Math.min(1.6, (closing - PHYS.crashWobbleClosing)
            / (PHYS.crashSpinClosing - PHYS.crashWobbleClosing));
          // who is the RAMMER? the one driving into the other along the normal
          const aRams = vaN > vbN;
          const victim = aRams ? b : a;
          const rammer = aRams ? a : b;
          const resist = victim.stats.bumpResist ?? 0;
          const effPower = power * (1 - resist * 0.6);
          if (victim.invulnT <= 0 && victim.spinT <= 0) {
            if (closing > PHYS.crashSpinClosing && effPower > 0.45 && resist < 0.35) {
              // full crash: victim spins out and showers sparks
              if (!victim.remoteDriven && victim.spinOut()) {
                this.announceCrash(rammer, victim);
                this.netHitFrom(rammer, victim);
              } else if (victim.remoteDriven) {
                this.netHitFrom(rammer, victim);
              }
            } else if (!victim.remoteDriven) {
              // wobble: keeps rolling but loses the line
              victim.wobble(Math.max(0.4, effPower));
            }
          }
        }

        // positional separation weighted by mass (+ bounce ejection so they
        // never weld together). Online puppets are immovable — their owner
        // client is the authority for their position.
        const bounce = closing > PHYS.crashWobbleClosing ? 1 + PHYS.crashBounce : 1;
        const push = (overlap + 0.03) * bounce;
        if (!a.remoteDriven) {
          a.pos.x -= nx * push * (mb / total);
          a.pos.z -= nz * push * (mb / total);
        }
        if (!b.remoteDriven) {
          b.pos.x += nx * push * (ma / total);
          b.pos.z += nz * push * (ma / total);
        }

        // impulse ONLY while closing into each other (prevents the
        // mutual-speed-annihilation wedge when karts overlap at rest);
        // class passives scale it (Ariete deals more, Roca Sólida takes less)
        if (closing > 1.5) {
          const bumpA = (a.stats.bumpMul ?? 1) * (1 - (b.stats.bumpResist ?? 0));
          const bumpB = (b.stats.bumpMul ?? 1) * (1 - (a.stats.bumpResist ?? 0));
          const j = Math.min(closing * 0.32, 4.5);
          const jA = j * bumpA;   // impulse INTO b (dealt by a)
          const jB = j * bumpB;   // impulse INTO a (dealt by b)
          const dotA = Math.max(0, da.x * nx + da.z * nz);
          const dotB = Math.max(0, db.x * -nx + db.z * -nz);
          if (!a.remoteDriven) a.speed -= jB * (mb / total) * dotA;
          if (!b.remoteDriven) b.speed -= jA * (ma / total) * dotB;
          // lateral yaw jolt — the shove twists the victim's nose offline
          if (!a.remoteDriven && jB > 2.5) {
            a.yaw += (dx * da.z - dz * da.x > 0 ? 1 : -1) * 0.03 * jB;
            a.slip *= 0.8;
          }
          if (!b.remoteDriven && jA > 2.5) {
            b.yaw += (dx * db.z - dz * db.x > 0 ? 1 : -1) * 0.03 * jA;
            b.slip *= 0.8;
          }
        } else if (Math.abs(a.speed) < 3 && Math.abs(b.speed) < 3) {
          // dead wedge (pileup at a gate / after a spin): jiggle the pair
          // apart perpendicular so the stuck-recovery can actually escape.
          // Keep it tiny: a large per-step offset would dominate the kart's
          // own motion and turn the pile into a lateral-sliding blob.
          const sign = (i * 31 + j * 17) % 2 === 0 ? 1 : -1;
          const px = -nz * sign, pz = nx * sign;
          a.pos.x += px * 0.012; a.pos.z += pz * 0.012;
          b.pos.x -= px * 0.012; b.pos.z -= pz * 0.012;
        }

        // star-core plows (broadcast when the victim is an online puppet)
        if (a.starT > 0 && !b.invincible && b.spinOut()) {
          this.netHitFrom(a, b);
        }
        if (b.starT > 0 && !a.invincible && a.spinOut()) {
          this.netHitFrom(b, a);
        }

        // fx: sparks scale with impact speed
        if (closing > 2.5) {
          const mid = new THREE.Vector3((a.pos.x + b.pos.x) / 2, Math.max(a.pos.y, b.pos.y), (a.pos.z + b.pos.z) / 2);
          const strength = Math.min(1.4, closing / 14);
          if (a.isPlayer || b.isPlayer) {
            this.camera.kick(Math.min(1, strength * 0.8));
            this.particles.sparkBurst(mid, strength);
            if (strength > 0.55) this.particles.puff(mid, [1, 0.9, 0.7]);
          } else if (strength > 0.8) {
            // big AI crashes still spark near the camera
            this.particles.sparkBurst(mid, strength * 0.6);
          }
        }
      }
      // battle obstacles: positional push-out + proportional scrub
      if (this.battle && this.world instanceof BattleWorld) {
        const ob = this.world.obstacleAt(a.pos);
        if (ob) {
          const dx = a.pos.x - ob.pos.x, dz = a.pos.z - ob.pos.z;
          const d = Math.max(0.001, Math.hypot(dx, dz));
          const nx = dx / d, nz = dz / d;
          a.pos.x = ob.pos.x + nx * (ob.r + 1.1);
          a.pos.z = ob.pos.z + nz * (ob.r + 1.1);
          const fwd = a.forward();
          const out = Math.max(0, fwd.x * -nx + fwd.z * -nz); // driving INTO obstacle
          if (out > 0) {
            a.speed *= 1 - out * 0.5;
            if (out > 0.4 && Math.abs(a.speed) > 8) {
              a.wallHit = Math.max(a.wallHit, out);
            }
          }
        }
      }
    }
  }

  /** Crash announcer line + camera shake for wrecked karts. */
  private announceCrash(rammer: KartController, victim: KartController): void {
    if (victim.isPlayer) {
      this.camera.kick(1.2);
      this.bridge.pushAnnouncer(`¡${rammer.stats.displayName} te embistió!`, 'bad');
    } else if (rammer.isPlayer) {
      this.camera.kick(0.7);
      this.bridge.pushAnnouncer(`¡Reventaste a ${victim.stats.displayName}!`, 'good');
    }
  }

  // ============================================================ item boxes

  private pickupBoxes(): void {
    if (!this.session!.itemsEnabled || !this.items) return;
    const boxes = this.world!.itemBoxes;
    for (const kart of this.karts) {
      if (kart.battleKo || kart.finished) continue;
      if (kart.remoteDriven) continue;   // peers pick boxes on their own client
      if (kart.itemSlot || kart.rouletteUntil > 0) continue;
      for (const box of boxes) {
        if (!box.active) continue;
        const dx = kart.pos.x - box.pos.x;
        const dz = kart.pos.z - box.pos.z;
        const dy = kart.pos.y + 0.8 - box.pos.y;
        if (dx * dx + dz * dz < 2.0 * 2.0 && Math.abs(dy) < 1.8) {
          if (this.world instanceof TrackWorld) {
            this.world.consumeBox(box);
            if (this.isNetAuthority(kart) && this.net && this.session?.online) {
              this.net.sendEvent({ t: 'box', idx: boxes.indexOf(box) });
            }
          } else {
            box.active = false;
            box.mesh.visible = false;
            box.respawnAt = performance.now() + 3000;
          }
          // golden boxes roll TWO items at 150cc+ (MK8D-style doubles)
          const dbl = box.golden && (this.session!.difficulty ?? 100) >= 150;
          this.items.giveRoulette(kart, dbl);
          if (kart.isPlayer) this.particles.puff(box.pos, dbl ? [1, 0.85, 0.3] : [1, 0.95, 0.5]);
          break;
        }
      }
    }
  }

  // ============================================================ coins

  /** MK-style coin pickups: any kart rolling over an active coin takes it. */
  private pickupCoins(): void {
    const world = this.world as TrackWorld;
    if (!world.coins.length) return;
    const R2 = PHYS.coinPickupRadius * PHYS.coinPickupRadius;
    const online = !!this.session?.online && !!this.net;
    for (const kart of this.karts) {
      if (kart.battleKo || kart.finished) continue;
      if (kart.remoteDriven) continue;   // peers collect on their own client
      for (const coin of world.coins) {
        if (!coin.active) continue;
        const dx = kart.pos.x - coin.pos.x;
        const dz = kart.pos.z - coin.pos.z;
        const dy = kart.pos.y - coin.pos.y;
        if (dx * dx + dz * dz < R2 && Math.abs(dy) < 1.7) {
          if (kart.addCoin()) {
            world.consumeCoin(coin);
            this.particles.coinSparkle(coin.pos);
            if (kart.isPlayer) AudioSys.playCoin(kart.coins);
            if (online && this.isNetAuthority(kart)) {
              this.net!.sendEvent({ t: 'coin', idx: world.coins.indexOf(coin) });
            }
            break;
          }
        }
      }
    }
  }

  private onItemEvent(e: import('../items/ItemSystem').ItemEvent): void {
    const cfg = this.session;
    if (!cfg) return;
    const kart = this.karts.find(k => k.id === e.kartId);

    // ---- online broadcasts (actions of karts THIS client simulates travel) -----
    if (cfg.online && this.net) {
      if (kart && this.isNetAuthority(kart)) {
        if (e.type === 'fire' && e.itemId) {
          this.net.sendEvent({ t: 'item', item: e.itemId, behind: this.items?.lastFireBehind ?? false });
        } else if (e.type === 'storm') {
          this.net.sendEvent({ t: 'storm' });
        } else if (e.type === 'steal' && e.targetId) {
          const victim = this.karts.find(k => k.id === e.targetId);
          if (victim?.remoteDriven) {
            const targetId = victim.id.startsWith('net-') ? victim.id.slice(4) : victim.id;
            this.net.sendEvent({ t: 'steal', target: targetId, item: e.itemId ?? null });
          }
        }
      }
      // my (or my bot's) projectile/trap hit a remote puppet → broadcast the hit
      if (e.type === 'hit' && e.ownerId) {
        const owner = this.karts.find(k => k.id === e.ownerId);
        const victim = this.karts.find(k => k.id === e.kartId);
        if (owner && this.isNetAuthority(owner) && victim?.remoteDriven) {
          const targetId = victim.id.startsWith('net-') ? victim.id.slice(4) : victim.id;
          this.net.sendEvent({ t: 'hit', target: targetId });
        }
      }
    }

    // ---- battle damage model: items cost 1 HP ----------------------------------
    if (cfg.mode === 'battle' && this.battle && kart) {
      if (e.type === 'hit') {
        // victim id is not in the event — damage applied by caller? find spinT fresh:
        // ItemSystem reports hits with kartId = VICTIM for 'hit' events.
        kart.battleHp -= 1;
        if (kart.battleHp <= 0) this.koKart(kart);
      } else if (e.type === 'storm') {
        for (const k of this.karts) {
          if (k.battleKo || k.battleTeam === kart.battleTeam) continue;
          k.battleHp -= 1;
          if (k.battleHp <= 0) this.koKart(k);
        }
      }
    }

    // ---- announcer + fx ------------------------------------------------------------
    switch (e.type) {
      case 'fire':
        if (kart?.isPlayer && e.itemId) {
          this.bridge.pushAnnouncer(e.text ?? ITEM_MAP[e.itemId].name, 'info');
        }
        break;
      case 'hit':
        if (kart) {
          // per-family burst — reads as WHAT hit you (zap/seeker/blast/goo)
          this.particles.itemHitBurst(kart.pos, e.fx ?? '');
          const hard = e.fx === 'blast';
          if (kart.isPlayer) {
            this.camera.kick(hard ? 1.5 : 1.0);
            this.bridge.pushAnnouncer(e.text ?? '¡Golpeado!', 'bad');
          } else {
            // the player landed the shot: reward feedback (owner side)
            const owner = e.ownerId ? this.karts.find(k => k.id === e.ownerId) : null;
            if (owner?.isPlayer) {
              this.camera.kick(0.3);
              this.bridge.pushAnnouncer(e.text === '¡Mina!' ? '¡Mina colocada!' : e.text === '¡Cianobomba!' ? '¡Cianobomba!' : '¡Impacto confirmado!', 'good');
            }
          }
        }
        break;
      case 'shield':
        if (kart?.isPlayer) {
          this.particles.trickBurst(kart.pos);
          this.bridge.pushAnnouncer('¡Bloqueado!', 'good');
        }
        break;
      case 'steal':
        this.bridge.pushAnnouncer(e.text ?? '¡Robo!', kart?.isPlayer ? 'good' : 'bad');
        if (e.targetId) {
          const victim = this.karts.find(k => k.id === e.targetId);
          if (victim) this.particles.itemHitBurst(victim.pos, 'seeker');
        }
        break;
      case 'storm':
        this.bridge.pushAnnouncer(e.text ?? '¡Chip Tormenta!', kart?.isPlayer ? 'good' : 'bad');
        // violet rain over every shrunk victim
        for (const k of this.karts) {
          if (k === kart || k.battleKo) continue;
          if (this.session?.mode === 'battle' && k.battleTeam === kart?.battleTeam) continue;
          if (k.shrinkT > 0) this.particles.itemHitBurst(k.pos, 'storm');
        }
        break;
    }
  }

  // ============================================================ online plumbing

  /**
   * Is THIS client the simulation authority for the kart online?
   * True for the local player, and for CPU fillers on the room host
   * (guests see those bots as puppets).
   */
  private isNetAuthority(kart: KartController): boolean {
    if (!this.session?.online) return false;
    if (kart.isPlayer) return true;
    return !!this.session.online.isHost && this.netBotIds.has(kart.id);
  }

  /**
   * Broadcast an owner-authoritative hit when a locally-driven kart (the
   * player, or a host-side bot) plows a remote puppet. The victim's client
   * applies the spin-out on its own kart — its sim, its authority.
   */
  private netHitFrom(attacker: KartController, victim: KartController): void {
    if (!this.session?.online || !this.net || !victim.remoteDriven) return;
    const attackerIsLocal = attacker.isPlayer || (!attacker.remoteDriven && !attacker.isPlayer && this.session.online.isHost);
    if (!attackerIsLocal) return;
    const targetId = victim.id.startsWith('net-') ? victim.id.slice(4) : victim.id;
    this.net.sendEvent({ t: 'hit', target: targetId });
  }

  /** Compact kart snapshot for the ~15 Hz state stream. */
  private buildNetState(k: KartController): NetKartState {
    let st = 0;
    if (k.spinT > 0) st |= ST_SPIN;
    if (k.shrinkT > 0) st |= ST_SHRINK;
    if (k.starT > 0) st |= ST_STAR;
    if (k.boostTimer > 0 || k.slipActive > 0) st |= ST_BOOST;
    if (k.invincible) st |= ST_INVULN;
    if (k.itemHeldOut && k.itemSlot) st |= ST_HELD;
    const rs = this.race?.states.get(k.id);
    return {
      p: [Math.round(k.pos.x * 50) / 50, Math.round(k.pos.y * 50) / 50, Math.round(k.pos.z * 50) / 50],
      ry: Math.round(k.yaw * 100) / 100,
      s: Math.round(k.speed * 10) / 10,
      d: k.driftLevel, st,
      lap: rs?.lap ?? k.lap,
      prog: Math.round(k.progressS * 10000) / 10000,
      f: k.finished ? 1 : 0,
    };
  }

  /** A peer event arrived — replicate the world-affecting parts locally. */
  private handleNetEvent(peerId: string, ev: NetEvent): void {
    const cfg = this.session;
    if (!cfg?.online || !this.items) return;
    const player = this.karts[0];
    // sender's kart: bots keep their grid id; human peers use the net- prefix
    const puppet = this.karts.find(k => k.id === peerId || k.id === `net-${peerId}`);
    switch (ev.t) {
      case 'item':
        if (puppet) this.items.netUseItem(puppet, ev.item, ev.behind);
        break;
      case 'hit': {
        if (ev.target === cfg.online.localId && !player.finished) {
          if (!player.invincible && player.spinT <= 0) {
            player.spinOut();
            this.camera.kick(1);
          }
          break;
        }
        // bots keep their grid id everywhere; human peers use the net- prefix
        const victim = this.karts.find(k =>
          k.id === ev.target || k.id === `net-${ev.target}`);
        if (victim && victim.remoteDriven && !victim.invincible && victim.spinT <= 0) {
          victim.spinOut();
        }
        break;
      }
      case 'coin': {
        const w = this.world as TrackWorld | null;
        const coin = w?.coins[ev.idx];
        if (coin?.active) w!.consumeCoin(coin);
        break;
      }
      case 'box': {
        const w = this.world as TrackWorld | null;
        const box = w?.itemBoxes[ev.idx];
        if (box && box.active) w!.consumeBox(box);
        break;
      }
      case 'storm':
        if (!player.invincible && !player.finished) {
          player.shrinkNow();
          player.spinT = Math.min(player.spinT + 0.6, PHYS.spinTime);
          player.speed *= 0.5;
          this.bridge.pushAnnouncer('¡Chip Tormenta!', 'bad');
        }
        break;
      case 'steal':
        if (ev.target === cfg.online.localId) {
          player.itemSlot = null;
          player.itemCharges = 0;
          this.bridge.pushAnnouncer('¡Te robaron el ítem!', 'bad');
        }
        break;
      case 'trick':
        if (puppet) this.particles.trickBurst(puppet.pos);
        break;
    }
  }

  /** Server's final standings — publish the shared results screen. */
  private onNetRaceOver(rows: NetResultRow[]): void {
    const cfg = this.session;
    if (!cfg?.online) return;
    this.phase = 'finished';
    const resultRows: RaceResultRow[] = rows.map(r => {
      const isMe = r.id === cfg.online!.localId;
      return {
        // bots keep their grid id; human peers use the net- prefix
        kartId: isMe ? `player-${cfg.playerId}` : (r.id.startsWith('bot-') ? r.id : `net-${r.id}`),
        characterId: r.charId,
        isPlayer: isMe,
        position: r.pos, points: 0, totalPoints: 0,
        finishTimeMs: r.timeMs, bestLapMs: null,
        name: r.name,
      };
    });
    this.stagePodium();
    this.bridge.publish({ results: resultRows, needsContinue: true, phase: 'finished' });
  }

  /** Floating player-name sprite over an online kart. */
  private attachNameTag(kartId: string, name: string): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(name, 128, 34);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, 128, 34);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(2.6, 0.65, 1);
    sprite.renderOrder = 999;
    this.scene.add(sprite);
    this.netNameTags.set(kartId, sprite);
  }

  // ============================================================ battle rules

  private battleTick(nowMs: number): void {
    const b = this.battle!;
    if (this.phase !== 'racing') return;
    const timeLeftMs = b.startAtMs + b.durationMs - nowMs;
    const red = this.karts.filter(k => k.battleTeam === 0 && !k.battleKo).length;
    const blue = this.karts.filter(k => k.battleTeam === 1 && !k.battleKo).length;
    if (timeLeftMs <= 0 || red === 0 || blue === 0) {
      this.finishBattle(red, blue);
    }
  }

  private koKart(kart: KartController): void {
    if (kart.battleKo) return;
    kart.battleKo = true;
    kart.speed = 0;
    this.items?.clearShield(kart);
    const v = this.visuals.get(kart.id);
    if (v) v.group.visible = false;
    this.particles.puff(kart.pos, [1, 0.4, 0.3]);
    this.particles.confettiBurst(kart.pos);
    this.bridge.pushAnnouncer(`¡${kart.stats.displayName} fuera!`, kart.isPlayer ? 'bad' : 'info');
  }

  private finishBattle(red: number, blue: number): void {
    if (this.resultPublished) return;
    this.resultPublished = true;
    this.phase = 'finished';
    const playerTeam = this.karts[0].battleTeam;
    const winnerTeam = red === blue ? (playerTeam === 0 ? 1 : 0) : red > blue ? 0 : 1;
    const playerWon = winnerTeam === playerTeam;
    const rows: RaceResultRow[] = this.karts
      .filter(k => !k.battleKo || true)
      .sort((a, b) => {
        const aw = a.battleTeam === winnerTeam ? 0 : 1;
        const bw = b.battleTeam === winnerTeam ? 0 : 1;
        if (aw !== bw) return aw - bw;
        return b.battleHp - a.battleHp;
      })
      .map((k, i) => ({
        kartId: k.id, characterId: k.stats.id, isPlayer: k.isPlayer,
        position: i + 1, points: 0, totalPoints: 0,
        finishTimeMs: null, bestLapMs: null,
      }));
    // winners celebrate
    for (const k of this.karts) {
      if (k.battleKo) continue;
      this.visuals.get(k.id)?.setAnim(k.battleTeam === winnerTeam ? 'victory' : 'defeat');
      if (k.battleTeam === winnerTeam) this.particles.confettiBurst(k.pos);
    }
    this.bridge.pushAnnouncer(playerWon ? '¡VICTORIA ROJA!' : '¡GANÓ EL EQUIPO AZUL!', playerWon ? 'hype' : 'bad');
    this.podiumFocus = new THREE.Vector3(0, 0, 0);
    this.podiumActive = true;
    this.bridge.publish({
      phase: 'finished', results: rows, needsContinue: true,
      battle: {
        hp: this.karts[0].battleHp, timeLeft: 0,
        redAlive: red, blueAlive: blue,
        playerTeamKo: this.karts[0].battleKo,
      },
    });
  }

  // ============================================================ race events

  private onLapComplete(kart: KartController, lap: number, lapMs: number): void {
    const cfg = this.session!;
    if (kart.isPlayer) {
      this.bridge.publish({ lap });
      if (cfg.mode === 'timetrial') {
        const isBest = SaveData.recordLap(cfg.trackId!, lapMs);
        if (isBest) this.bridge.pushAnnouncer('¡Mejor vuelta!', 'good');
        this.bridge.publish({
          timeTrial: {
            lapMs: 0, bestLapMs: SaveData.getBestLap(cfg.trackId!),
            bestTotalMs: SaveData.getBestRace(cfg.trackId!)?.time ?? null,
            totalMs: (this.bridge.getSnapshot().timeTrial?.totalMs ?? 0) + lapMs,
          },
        });
      }
    }
  }

  private onKartFinish(kart: KartController, pos: number): void {
    if (kart.isPlayer) {
      this.playerFinishAtMs = performance.now();
      this.particles.confettiBurst(kart.pos.clone().add(new THREE.Vector3(0, 2, 0)));
      this.bridge.pushAnnouncer(pos === 1 ? '¡VICTORIA!' : `Llegaste ${pos}º`, pos <= 3 ? 'hype' : 'info');
      // online: report my time; the server aggregates + ends the race
      if (this.session?.online && this.net && this.race) {
        const st = this.race.states.get(kart.id);
        this.net.finishRace(st?.finishMs ?? performance.now());
      }
    } else if (this.session?.online && this.net && this.race) {
      // HOST: report the finish of a CPU filler this client simulates
      if (this.isNetAuthority(kart)) {
        const st = this.race.states.get(kart.id);
        this.net.finishRaceFor(kart.id, st?.finishMs ?? performance.now());
      }
    }
  }

  private finishRace(): void {
    if (!this.race || this.resultPublished) return;
    const cfg = this.session!;

    // online: the SERVER owns the final standings (race:over). Locally we
    // just stop scoring — results arrive via onNetRaceOver.
    if (cfg.online) {
      this.phase = 'finished';
      this.resultPublished = true;
      return;
    }

    this.resultPublished = true;
    this.phase = 'finished';
    const rows = this.race.getResults();

    // ---- time trial records --------------------------------------------------
    if (cfg.mode === 'timetrial') {
      const playerRow = rows.find(r => r.isPlayer)!;
      if (playerRow.finishTimeMs != null) {
        const ghost = this.ghostRecorder?.finish(playerRow.finishTimeMs) ?? null;
        const better = SaveData.recordRace(cfg.trackId!, playerRow.finishTimeMs, cfg.playerId, ghost);
        this.bridge.pushAnnouncer(better ? '¡NUEVO RÉCORD!' : 'Carrera completada', better ? 'hype' : 'info');
      }
    }

    // ---- grand prix points -----------------------------------------------------
    if (this.gp) {
      for (const r of rows) {
        this.gp.points.set(r.kartId, (this.gp.points.get(r.kartId) ?? 0) + r.points);
      }
      const totalRows = rows.map(r => ({ ...r, totalPoints: this.gp!.points.get(r.kartId) ?? 0 }));
      const isFinalRace = this.gp.trackIndex >= 2;
      if (isFinalRace) {
        // cup complete: unlocks
        const sorted = [...totalRows].sort((a, b) => b.totalPoints - a.totalPoints);
        const playerRank = sorted.findIndex(r => r.isPlayer) + 1;
        if (playerRank === 1) {
          SaveData.winCup(this.gp.cupId, cfg.difficulty);
          // character unlocks by cup
          const cupCharUnlocks: Record<string, string> = {
            copa_verde: 'nova', copa_ambar: 'tiki', copa_escarcha: 'magnus', copa_cosmica: 'gigi',
          };
          const unlockId = cupCharUnlocks[this.gp.cupId];
          if (unlockId && this.gp.cupId !== 'copa_cosmica') SaveData.unlockChar(unlockId);
          if (unlockId && this.gp.cupId === 'copa_cosmica' && cfg.difficulty >= 150) SaveData.unlockChar(unlockId);
          // mirror mode when all 4 cups won
          const allCups = CUPS.every(c => SaveData.cupChainReady(c.id) || c.id === this.gp!.cupId);
          if (allCups) SaveData.setMirror(true);
          this.bridge.pushAnnouncer('¡COPA CONSEGUIDA!', 'hype');
        }
        this.bridge.publish({ results: totalRows.sort((a, b) => b.totalPoints - a.totalPoints), needsContinue: true, phase: 'finished' });
      } else {
        this.bridge.publish({ results: totalRows, needsContinue: true, phase: 'finished' });
      }
    } else {
      this.bridge.publish({ results: rows, needsContinue: true, phase: 'finished' });
    }

    this.stagePodium();
  }

  private podiumActive = false;
  private podiumFocus = new THREE.Vector3();

  /** Teleport the top-3 karts onto physical podium blocks past the line. */
  private stagePodium(): void {
    if (!this.race || this.karts.length < 3) return;
    const world = this.world as TrackWorld;
    const rows = this.race.getResults();
    const top3 = rows.slice(0, 3).map(r => this.karts.find(k => k.id === r.kartId)!).filter(Boolean);
    if (top3.length === 0) return;

    const sm = world.spline.sampleAt(0.012);
    const base = world.spline.roadPoint(0.012, 0);
    const right = sm.right;
    const heights = [1.6, 1.1, 0.75];
    const laterals = [0, -5.5, 5.5];
    // podium blocks
    const blockMat = new THREE.MeshLambertMaterial({ color: 0xe8b23a });
    for (let i = 0; i < 3; i++) {
      const h = heights[i];
      const block = new THREE.Mesh(new THREE.BoxGeometry(4.2, h, 4.2), i === 0 ? blockMat : new THREE.MeshLambertMaterial({ color: 0x9aa0b0 }));
      const p = base.clone().addScaledVector(right, laterals[i]);
      block.position.copy(p).add(new THREE.Vector3(0, h / 2 - 0.4, 0));
      this.scene.add(block);
    }
    top3.forEach((kart, i) => {
      const p = base.clone().addScaledVector(right, laterals[i]);
      kart.respawnAt(p.add(new THREE.Vector3(0, heights[i] - 0.4, 0)), Math.atan2(right.x, right.z));
      kart.finished = true;
      const v = this.visuals.get(kart.id);
      v?.setAnim(i === 0 ? 'victory' : i === 1 ? 'victory' : 'defeat');
      if (i === 0) this.particles.confettiBurst(kart.pos.clone().add(new THREE.Vector3(0, 3, 0)));
    });
    this.podiumFocus.copy(base).add(new THREE.Vector3(0, 1.5, 0));
    this.podiumActive = true;
  }

  /** React calls this on "Continuar" from results. */
  continueFlow(): void {
    const cfg = this.session;
    if (!cfg) { this.quitToMenu(); return; }
    if (cfg.mode === 'grandprix' && this.gp) {
      const cup = CUPS.find(c => c.id === this.gp!.cupId)!;
      if (this.gp.trackIndex < cup.tracks.length - 1) {
        const nextTrack = cup.tracks[this.gp.trackIndex + 1];
        this.startSession({ ...cfg, trackId: nextTrack });
        return;
      }
    }
    this.quitToMenu();
  }

  /** Retry current session (used by time trial & VS). */
  retrySession(): void {
    if (this.session) this.startSession(this.session);
  }

  /**
   * QA: advance the simulation deterministically without waiting for rAF
   * (headless browsers throttle background tabs, which would freeze tests).
   * Only valid while racing; visuals are not refreshed.
   */
  qaStep(seconds: number): number {
    if ((this.phase !== 'racing' && this.phase !== 'countdown') || !this.world) return 0;
    const steps = Math.min(20000, Math.round(seconds / PHYS.fixedDt));
    let now = performance.now();
    for (let i = 0; i < steps; i++) {
      now += PHYS.fixedDt * 1000;
      this.fixedStep(PHYS.fixedDt, now);
    }
    this.elapsed += steps * PHYS.fixedDt;
    this.world.update(this.elapsed, PHYS.fixedDt);
    return steps;
  }

  // ============================================================ camera & visuals

  private updateCamera(dt: number): void {
    if (this.podiumActive) {
      this.camera.updateOrbit(dt, this.podiumFocus);
      return;
    }
    let view = this.karts[0];
    if (view.battleKo) {
      const mate = this.karts.find(k => k.battleTeam === view.battleTeam && !k.battleKo);
      if (mate) view = mate;
    }
    const lookBack = view.isPlayer && this.lastControls.get(view.id)?.lookBack && !view.finished;
    this.camera.updateChase(dt, view, !!lookBack);
    // shadow camera follows
    this.sun.target.position.copy(view.pos);
    this.sun.position.copy(view.pos).add(new THREE.Vector3(35, 60, 25));
  }

  private updateVisuals(dt: number, t: number): void {
    for (const kart of this.karts) {
      const v = this.visuals.get(kart.id);
      if (!v) continue;
      if (kart.battleKo) { v.group.visible = false; continue; }
      v.group.visible = true;
      v.group.position.copy(kart.pos);
      v.group.rotation.y = kart.yaw;
      const targetScale = kart.shrinkT > 0 ? PHYS.shrinkScale : 1;
      const s = THREE.MathUtils.lerp(v.group.scale.x, targetScale, 1 - Math.exp(-8 * dt));
      v.group.scale.setScalar(s);
      v.setStarTint(kart.starT > 0 ? t : null);

      const controls = this.lastControls.get(kart.id) ?? this.NEUTRAL;
      v.update(dt, t, {
        speedRatio: kart.speedRatio,
        steer: controls.steer,
        drifting: kart.drifting,
        driftLevel: kart.driftLevel,
        grounded: kart.grounded,
        boost: kart.boosting || kart.starT > 0,
        shrink: kart.shrinkT > 0,
        airborne: kart.airborne,
        trickSpin: kart.trickSpin,
        trickKind: kart.trickKind,
      });
      if (kart.suspensionLand > 0) { v.land(kart.suspensionLand); kart.suspensionLand = 0; }

      // stunt landed clean: MK8-style payoff
      if (kart.trickLanded > 0) {
        kart.trickLanded = 0;
        this.particles.trickBurst(kart.pos);
        if (kart.isPlayer) {
          this.camera.kick(0.5);
          this.bridge.pushAnnouncer('¡TRUCO!', 'good');
          if (this.net && this.session?.online) this.net.sendEvent({ t: 'trick' });
        }
      }

      // online: keep peer name tags glued above their karts
      if (this.netNameTags.size) {
        const tag = this.netNameTags.get(kart.id);
        if (tag) tag.position.set(kart.pos.x, kart.pos.y + 2.75, kart.pos.z);
      }

      // coin loss burst (golden fountain when a hit shakes coins loose)
      const prevCoins = this.prevCoins.get(kart.id) ?? 0;
      if (kart.coins < prevCoins) this.particles.coinLossBurst(kart.pos, prevCoins - kart.coins);
      this.prevCoins.set(kart.id, kart.coins);

      // ---- fx emissions
      const back = kart.forward().multiplyScalar(-1.5);
      const rear = kart.pos.clone().add(back).add(new THREE.Vector3(0, 0.35, 0));
      if (kart.drifting && kart.grounded && Math.abs(kart.speed) > 8) {
        this.particles.driftSpark(rear, Math.max(1, kart.driftLevel), 1);
        this.particles.driftSpark(rear, Math.max(1, kart.driftLevel), -1);
      }
      if (kart.ginfo && kart.ginfo.roughness > 1.5 && kart.grounded && Math.abs(kart.speed) > 8) {
        if (Math.random() < 0.4) this.particles.offroadDust(kart.pos);
      }
      if (kart.boosting && kart.grounded) this.particles.boostFlame(rear);
      if (kart.starT > 0) this.particles.starTrail(kart.pos, t);
      if (kart.spinT > 0 && Math.random() < 0.3) this.particles.puff(kart.pos, [0.7, 0.7, 0.8]);
    }
  }

  // ============================================================ HUD publishing

  private publishHud(now: number): void {
    if (now < this.hudPublishAt) return;
    this.hudPublishAt = now + 120;
    const player = this.karts[0];
    if (!player) return;
    const snap = this.bridge.getSnapshot();
    const patch: Record<string, unknown> = {
      position: player.rank,
      totalKarts: this.karts.length,
      lap: this.race?.states.get(player.id)?.lap ?? 0,
      itemSlot: player.itemSlot as ItemId | null,
      itemCharges: player.itemCharges,
      itemSlot2: player.itemSlot2 as ItemId | null,
      itemCharges2: player.itemCharges2,
      rouletteActive: player.rouletteUntil > 0 || player.rouletteUntil2 > 0,
      speedKmh: Math.round(player.speedKmh),
      boostActive: player.boosting || player.starT > 0,
      driftLevel: player.driftLevel,
      coins: player.coins,
      trickActive: player.trickT > 0,
      phase: this.phase === 'countdown' ? 'countdown' : this.phase === 'racing' ? 'racing' : this.phase === 'finished' ? 'finished' : 'loading',
    };
    if (this.battle && this.phase !== 'countdown') {
      const timeLeft = Math.max(0, Math.round((this.battle.startAtMs + this.battle.durationMs - now) / 1000));
      patch.battle = {
        hp: player.battleHp, timeLeft,
        redAlive: this.karts.filter(k => k.battleTeam === 0 && !k.battleKo).length,
        blueAlive: this.karts.filter(k => k.battleTeam === 1 && !k.battleKo).length,
        playerTeamKo: player.battleKo,
      };
    }
    if (this.session?.mode === 'timetrial' && this.race) {
      const st = this.race.states.get(player.id)!;
      patch.timeTrial = {
        lapMs: this.race.phase === 'racing' && !player.finished ? now - st.lapStartMs : 0,
        bestLapMs: st.bestLapMs ?? SaveData.getBestLap(this.session.trackId!),
        bestTotalMs: SaveData.getBestRace(this.session.trackId!)?.time ?? null,
        totalMs: player.finished ? (st.finishMs ?? 0) : (now - this.race.goAtMs),
      };
    }
    this.bridge.publish(patch as any);
  }

  // ============================================================ engine-drawn canvases

  private minimapBounds: { minX: number; minZ: number; scale: number } | null = null;

  private drawMinimap(): void {
    const ctx = this.minimapCtx;
    if (!ctx || !this.world) return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(8, 10, 22, 0.62)';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 14);
    ctx.fill();

    const drawDot = (x: number, z: number, color: string, r: number, ring = false): void => {
      ctx.beginPath();
      ctx.arc(x, z, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (ring) { ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
    };

    if (this.world instanceof TrackWorld) {
      const poly = this.world.minimap;
      if (!this.minimapBounds) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of poly) {
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        }
        const pad = 14;
        const scale = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
        this.minimapBounds = { minX, minZ, scale };
      }
      const { minX, minZ, scale } = this.minimapBounds;
      // center the bounding box inside the canvas
      const mapX = (x: number): number => (x - minX) * scale + (W - trackWidth(poly, 'x', minX) * scale) / 2;
      const mapZ = (z: number): number => (z - minZ) * scale + (H - trackWidth(poly, 'z', minZ) * scale) / 2;

      ctx.beginPath();
      ctx.moveTo(mapX(poly[0].x), mapZ(poly[0].z));
      for (const p of poly) ctx.lineTo(mapX(p.x), mapZ(p.z));
      ctx.closePath();
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(230, 232, 240, 0.75)';
      ctx.lineJoin = 'round';
      ctx.stroke();
      // finish tick
      const f = poly[0];
      const f2 = poly[2];
      ctx.beginPath();
      ctx.moveTo(mapX(f.x) - (mapZ(f2.z) - mapZ(f.z)) * 0.06, mapZ(f.z) + (mapX(f2.x) - mapX(f.x)) * 0.06);
      ctx.lineTo(mapX(f.x) + (mapZ(f2.z) - mapZ(f.z)) * 0.06, mapZ(f.z) - (mapX(f2.x) - mapX(f.x)) * 0.06);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffe94a';
      ctx.stroke();

      for (const kart of this.karts) {
        if (kart.battleKo) continue;
        const col = kart.isPlayer ? '#ffe94a' : '#' + ((kart.stats as any).color ?? 0xcc4444).toString(16).padStart(6, '0');
        drawDot(mapX(kart.pos.x), mapZ(kart.pos.z), col, kart.isPlayer ? 6 : 4, kart.isPlayer);
      }
    } else if (this.world instanceof BattleWorld) {
      const cx = W / 2, cy = H / 2;
      const R = Math.min(W, H) / 2 - 12;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(230, 232, 240, 0.75)';
      ctx.stroke();
      for (const ob of this.world.obstacles) {
        drawDot(cx + ob.pos.x / this.world.radius * R, cy + ob.pos.z / this.world.radius * R, 'rgba(160,164,180,0.8)', 3);
      }
      for (const kart of this.karts) {
        if (kart.battleKo) continue;
        const col = kart.isPlayer ? '#ffe94a' : kart.battleTeam === 0 ? '#e0453a' : '#3a7de0';
        drawDot(cx + kart.pos.x / this.world.radius * R, cy + kart.pos.z / this.world.radius * R, col, kart.isPlayer ? 6 : 4, kart.isPlayer);
      }
    }
  }

  private drawSpeedo(): void {
    const ctx = this.speedoCtx;
    if (!ctx) return;
    const player = this.karts[0];
    if (!player) return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const cx = W / 2, cy = H / 2 + 8;
    const R = Math.min(W, H) / 2 - 10;
    ctx.clearRect(0, 0, W, H);

    const ratio = Math.min(1.25, player.speedRatio / 1.0);
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    // background arc
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a1);
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.stroke();
    // speed arc
    const aSpeed = a0 + (a1 - a0) * Math.min(1, ratio);
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, aSpeed);
    ctx.lineWidth = 9;
    ctx.strokeStyle = player.boosting || player.starT > 0 ? '#ffb63a' : '#5affc8';
    ctx.lineCap = 'round';
    ctx.stroke();
    // ticks
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (a1 - a0) * (i / 8);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12));
      ctx.lineTo(cx + Math.cos(a) * (R - 18), cy + Math.sin(a) * (R - 18));
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.stroke();
    }
    // digital readout
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(player.speedKmh)}`, cx, cy + 2);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('km/h', cx, cy + 16);
    if (player.boosting) {
      ctx.fillStyle = '#ffb63a';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('TURBO', cx, cy - R + 18);
    }
  }

  // ============================================================ flow control

  togglePause(): void {
    this.paused = !this.paused;
    this.bridge.publish({ paused: this.paused });
  }

  resume(): void {
    if (this.paused) { this.paused = false; this.bridge.publish({ paused: false }); }
  }

  quitToMenu(): void {
    this.disposeSession();
    this.phase = 'idle';
    this.bridge.resetToMenu();
  }

  private disposeSession(): void {
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
      this.world = null;
    }
    for (const v of this.visuals.values()) {
      this.scene.remove(v.group);
      v.dispose();
    }
    this.visuals.clear();
    if (this.items) {
      this.scene.remove(this.items.group);
      this.items.dispose();
      this.items = null;
    }
    if (this.ghostPlayer) { this.ghostPlayer.dispose(); this.ghostPlayer = null; }
    this.ghostRecorder = null;
    this.race = null;
    this.karts = [];
    this.aiDrivers.clear();
    this.lastControls.clear();
    this.remoteDrivers.clear();
    this.netBotIds.clear();
    this.prevCoins.clear();
    for (const tag of this.netNameTags.values()) {
      this.scene.remove(tag);
      (tag.material as THREE.SpriteMaterial).map?.dispose();
      tag.material.dispose();
    }
    this.netNameTags.clear();
    if (this.net) {
      this.net.onPeerState = null;
      this.net.onPeerEvent = null;
      this.net.onPeerLeft = null;
      this.net.onRaceOver = null;
    }
    this.minimapBounds = null;
    this.podiumActive = false;
    this.battle = null;
    this.paused = false;
    this.accumulator = 0;
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.input.detach();
    this.disposeSession();
    this.renderer.dispose();
  }
}

// small helper for minimap fitting
const trackWidth = (poly: { x: number; z: number }[], axis: 'x' | 'z', min: number): number => {
  let max = -Infinity;
  for (const p of poly) max = Math.max(max, p[axis]);
  return max - min;
};

