// Debug live music element load
import { chromium } from 'playwright';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-notify-renderer-suspend'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 200)); });
page.on('requestfailed', r => console.log('[reqfail]', r.url().slice(-60), r.failure()?.errorText));
await page.goto('https://googlesitecom.github.io/gmail/', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(5000);
await page.evaluate(() => window.__vgpIntro?.skip?.()).catch(() => {});
await page.waitForTimeout(2500);

const dbg = await page.evaluate(async () => {
  // try a raw Audio element like AudioSys does
  const el = new Audio('/gmail/audio/TriumphInMotion.mp3');
  el.preload = 'auto';
  const res = { canplay: false, err: null, networkState: null, readyState: null };
  await new Promise(resolve => {
    el.addEventListener('canplaythrough', () => { res.canplay = true; resolve(); }, { once: true });
    el.addEventListener('error', () => { res.err = el.error?.code + ' ' + (el.error?.message ?? ''); resolve(); }, { once: true });
    el.load();
    setTimeout(resolve, 8000);
  });
  res.networkState = el.networkState;   // 0 empty 1 idle 2 loading 3 no-source
  res.readyState = el.readyState;
  // also try fetch
  const fr = await fetch('/gmail/audio/TriumphInMotion.mp3', { method: 'HEAD' }).catch(e => ({ status: 'ERR ' + e.message }));
  res.fetchStatus = fr.status;
  res.fetchType = fr.headers?.get?.('content-type');
  // the game's own audio state
  res.game = window.__apex?.audio?.();
  return res;
});
console.log(JSON.stringify(dbg, null, 2));
await browser.close();
