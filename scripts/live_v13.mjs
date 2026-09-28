// LIVE smoke test for https://googlesitecom.github.io/gmail/ (v13)
import { chromium } from 'playwright';

const BASE = 'https://googlesitecom.github.io/gmail/';
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
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(6000);

// click the intro GATE (this is what starts the music for real users),
// then let the sequence run a beat and skip the visuals
await page.mouse.click(720, 400);
await page.waitForTimeout(1200);
await page.evaluate(() => window.__vgpIntro?.skip?.()).catch(() => {});
await page.waitForTimeout(2500);

const ver = await page.evaluate(() => window.__apex?.version ?? 'MISSING');
log('boot + version v13', ver === 'velocitygp-v13.0', ver);

// menu music (repo track)
let a = await page.evaluate(() => window.__apex.audio());
log('menu music: Triumph in Motion playing', a.musicFileOk === true && a.musicPaused === false && String(a.musicSrc).includes('TriumphInMotion'),
  `src ok=${a.musicFileOk} paused=${a.musicPaused}`);
log('Motor.mp3 engine sample decoded', a.engSampleReady === true, `ready=${a.engSampleReady}`);

// start a race
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 9 }));
await page.waitForTimeout(4000);
a = await page.evaluate(() => window.__apex.audio());
log('music silent in race', a.musicPaused === true, `paused=${a.musicPaused}`);

await page.evaluate(() => { window.__apex.auto(true); window.__apex.step(12); window.__apex.unfreeze(); });
await page.waitForTimeout(3500);
a = await page.evaluate(() => window.__apex.audio());
log('engine sample audible while driving', (a.engSampleGain ?? 0) > 0.02, `gain=${a.engSampleGain} rate=${a.engSampleRate}`);

// cockpit camera on the LIVE build
await page.evaluate(() => { window.__apex.game().camera.cycleMode(); });
await page.waitForTimeout(1500);
const cams = await page.evaluate(() => window.__apex.cams());
log('cockpit camera active', cams.mode === 'cockpit', JSON.stringify(cams));
await page.waitForTimeout(1500);
await page.screenshot({ path: '/home/z/my-project/scripts/qa/v13/live_cockpit.png' });

// chase shot for shadows
await page.evaluate(() => { window.__apex.game().camera.cycleMode(); window.__apex.game().camera.cycleMode(); window.__apex.game().camera.cycleMode(); });
await page.waitForTimeout(2000);
await page.screenshot({ path: '/home/z/my-project/scripts/qa/v13/live_chase.png' });

// shadow rig on live
const rig = await page.evaluate(() => {
  const g = window.__apex, game = g.game();
  return { shadowMap: game.renderer.shadowMap.enabled, sunShadow: game.sun.castShadow,
    map: game.sun.shadow.map ? game.sun.shadow.map.width : 0 };
});
log('sun + shadows ON (live)', rig.shadowMap && rig.sunShadow && rig.map === 4096, JSON.stringify(rig));

log('zero page errors', pageErrors === 0, `${pageErrors}`);
await browser.close();
const pass = results.filter(r => r.ok).length;
console.log(`\n=== LIVE v13 SMOKE: ${pass}/${results.length} passed ===`);
process.exit(pass === results.length ? 0 : 1);
