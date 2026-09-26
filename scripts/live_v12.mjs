// LIVE smoke test on GitHub Pages: boot, intro, music element, arcade, no errors.
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
let errors = 0;
page.on('pageerror', e => { errors++; console.log('[pageerror]', String(e).slice(0, 220)); });
page.on('console', m => { const t = m.text(); if (/error|Error/i.test(t) && !/favicon|DevTools/.test(t)) console.log('[console]', t.slice(0, 180)); });

await page.goto('https://googlesitecom.github.io/gmail/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(8000);

// intro present?
const intro = await page.evaluate(() => !!window.__vgpIntro);
console.log('intro gate present:', intro);
await page.screenshot({ path: '/home/z/my-project/scripts/qa/v12/live_intro.png', timeout: 60000 }).catch(() => {});

// click to start → music + animation
await page.mouse.click(800, 450);
await page.waitForTimeout(1500);
const audio = await page.evaluate(() => {
  // probe the AudioSys static state through the game instance
  const g = window.__apex?.game();
  return { engineUp: !!g, version: window.__apex?.version };
});
console.log('game:', JSON.stringify(audio));

// skip intro → menu
await page.evaluate(() => window.__vgpIntro?.skip());
await page.waitForTimeout(1200);
await page.screenshot({ path: '/home/z/my-project/scripts/qa/v12/live_menu.png', timeout: 60000 }).catch(() => {});

// menu music playing? (AudioSys.musicActive via any exposed path — check audio elements)
const music = await page.evaluate(() => {
  const els = document.querySelectorAll('audio');
  return { n: els.length, playing: [...els].map(e => ({ src: e.src.split('/').pop(), paused: e.paused, vol: +e.volume.toFixed(2), loop: e.loop })) };
});
console.log('audio elements:', JSON.stringify(music));

// start a race — music must stop
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 19 }));
await page.waitForFunction(() => {
  const g = window.__apex.game();
  return g.cars && g.cars.length === 20;
}, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);
const raceMusic = await page.evaluate(() => {
  const els = document.querySelectorAll('audio');
  return [...els].map(e => ({ paused: e.paused }));
});
console.log('race: audio paused state:', JSON.stringify(raceMusic));

// fast-forward + live frame
await page.evaluate(() => { window.__apex.auto(true); window.__apex.step(30); window.__apex.unfreeze(); });
await page.waitForTimeout(2500);
const st = await page.evaluate(() => {
  const g = window.__apex.game();
  return { phase: g.phase, kmh: Math.round(g.cars[0].speedKmh), cars: g.cars.length, arcade: g.cars[0].arcade };
});
console.log('race state:', JSON.stringify(st));
await page.screenshot({ path: '/home/z/my-project/scripts/qa/v12/live_race.png', timeout: 90000 }).catch(e => console.log('[warn] live race shot skipped'));
console.log('pageErrors:', errors);
await browser.close();
