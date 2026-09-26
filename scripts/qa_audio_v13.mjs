// v13 AUDIO QA: Triumph in Motion.mp3 menu music (full volume, pauses in
// race) + Motor.mp3 real engine sample (RPM-pitched, audible while driving).
import { chromium } from 'playwright';

const results = [];
const log = (name, ok, info = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${info ? ' — ' + info : ''}`);
};

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-notify-renderer-suspend'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
let pageErrors = 0;
page.on('pageerror', e => { pageErrors++; console.log('[pageerror]', String(e).slice(0, 200)); });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4500);

// audio requests observed on the network
const audioReqs = [];
page.on('request', r => { if (r.url().includes('/audio/')) audioReqs.push(r.url().split('/audio/')[1]); });

// dismiss the intro gate if present (click to start → unlocks audio)
const gate = await page.$('text=/click|start/i').catch(() => null);
if (gate) { await gate.click().catch(() => {}); await page.waitForTimeout(1500); }
// also try the skip
await page.evaluate(() => window.__vgpIntro?.skip?.()).catch(() => {});
await page.waitForTimeout(3500);

// ---- 1. menu music: Triumph in Motion, playing, loud -----------------------
let a = await page.evaluate(() => window.__apex.audio());
log('menu music file loaded', a.musicFileOk === true && String(a.musicSrc).includes('TriumphInMotion'),
  `${a.musicSrc} ok=${a.musicFileOk}`);
log('menu music PLAYING (not paused)', a.musicPlaying === true && a.musicPaused === false,
  `playing=${a.musicPlaying} paused=${a.musicPaused}`);
log('menu music FULL VOLUME', a.musicVol >= 0.9, `vol=${a.musicVol}`);

// ---- 2. engine sample loaded silently at menu ------------------------------
a = await page.evaluate(() => window.__apex.audio());
log('Motor.mp3 engine sample decoded', a.engSampleReady === true, `ready=${a.engSampleReady}`);
log('engine sample SILENT at menu', (a.engSampleGain ?? 1) === 0, `gain=${a.engSampleGain}`);

// ---- 3. start a race: music pauses immediately -----------------------------
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 9 }));
await page.waitForTimeout(2500);
a = await page.evaluate(() => window.__apex.audio());
log('music PAUSED in race', a.musicPaused === true, `paused=${a.musicPaused}`);

// ---- 4. driving: engine sample audible + RPM-pitched -----------------------
await page.evaluate(() => { window.__apex.auto(true); window.__apex.step(8); window.__apex.unfreeze(); });
await page.waitForTimeout(3500);
a = await page.evaluate(() => window.__apex.audio());
log('engine sample AUDIBLE while driving', (a.engSampleGain ?? 0) > 0.02, `gain=${a.engSampleGain}`);
log('engine sample pitch follows RPM', (a.engSampleRate ?? 0) > 0.6 && (a.engSampleRate ?? 0) < 1.35,
  `rate=${a.engSampleRate}`);
log('engine filter opens with rpm', (a.engSampleFilterHz ?? 0) > 1200, `hz=${a.engSampleFilterHz}`);

// rev it: hold full throttle from a stop → rate must rise
await page.evaluate(() => { window.__apex.auto(false); window.__apex.ctrl({ throttle: 1, steer: 0, brake: 0 }); window.__apex.step(3.5); });
await page.waitForTimeout(1200);
const a2 = await page.evaluate(() => window.__apex.audio());
await page.evaluate(() => { window.__apex.step(3.5); });
await page.waitForTimeout(1200);
const a3 = await page.evaluate(() => window.__apex.audio());
log('pitch RISES with throttle', (a3.engSampleRate ?? 0) > (a2.engSampleRate ?? 0) - 0.001,
  `${a2.engSampleRate} → ${a3.engSampleRate}`);
log('gain RISES with throttle', (a3.engSampleGain ?? 0) >= (a2.engSampleGain ?? 0) - 0.05,
  `${a2.engSampleGain} → ${a3.engSampleGain}`);
await page.evaluate(() => window.__apex.ctrl(null));

// ---- 5. audio files actually served ----------------------------------------
const uniq = [...new Set(audioReqs)];
log('Motor.mp3 requested', uniq.some(u => u.startsWith('Motor.mp3')), uniq.join(', '));
log('TriumphInMotion.mp3 requested', uniq.some(u => u.startsWith('TriumphInMotion.mp3')), '');

// ---- 6. quit to menu: music resumes ---------------------------------------
await page.evaluate(() => window.__apex.game().quitToMenu());
await page.waitForTimeout(2500);
a = await page.evaluate(() => window.__apex.audio());
log('music RESUMES at menu return', a.musicPaused === false && a.musicPlaying === true,
  `playing=${a.musicPlaying} paused=${a.musicPaused}`);
log('engine sample silenced at menu', (a.engSampleGain ?? 1) === 0, `gain=${a.engSampleGain}`);

log('zero page errors', pageErrors === 0, `${pageErrors}`);
await browser.close();
const pass = results.filter(r => r.ok).length;
console.log(`\n=== AUDIO v13 QA: ${pass}/${results.length} passed ===`);
process.exit(pass === results.length ? 0 : 1);
