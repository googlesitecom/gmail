// LIVE music verification: hook the Audio constructor, track play/pause.
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
let errors = 0;
page.on('pageerror', e => { errors++; console.log('[pageerror]', String(e).slice(0, 220)); });

// track every Audio element created by the page
await page.addInitScript(() => {
  window.__audioEls = [];
  const Orig = window.Audio;
  window.Audio = function (src) {
    const el = new Orig(src);
    window.__audioEls.push(el);
    return el;
  };
  window.Audio.prototype = Orig.prototype;
});

await page.goto('https://googlesitecom.github.io/gmail/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(8000);
await page.mouse.click(800, 450);           // intro gate → music starts
await page.waitForTimeout(2500);
const menuAudio = await page.evaluate(() => window.__audioEls.map(e => ({
  src: e.src.split('/').pop(), paused: e.paused, vol: +e.volume.toFixed(2), loop: e.loop,
  t: +e.currentTime.toFixed(1),
})));
console.log('MENU audio:', JSON.stringify(menuAudio));

await page.evaluate(() => window.__vgpIntro?.skip());
await page.waitForTimeout(1000);

// start a race — music must fade out and pause
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 19 }));
await page.waitForFunction(() => window.__apex.game().cars?.length === 20, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3500);
const raceAudio = await page.evaluate(() => window.__audioEls.map(e => ({
  src: e.src.split('/').pop(), paused: e.paused, t: +e.currentTime.toFixed(1),
})));
console.log('RACE audio (must be paused):', JSON.stringify(raceAudio));

// back to menu — music resumes
await page.evaluate(() => window.__apex.game().quitToMenu());
await page.waitForTimeout(2000);
const menuAudio2 = await page.evaluate(() => window.__audioEls.map(e => ({
  paused: e.paused, t: +e.currentTime.toFixed(1),
})));
console.log('MENU-RETURN audio (must be playing):', JSON.stringify(menuAudio2));
console.log('pageErrors:', errors);
await browser.close();
