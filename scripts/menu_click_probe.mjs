// Sonda: ¿qué intercepta el click en "MULTIJUGADOR ONLINE" del menú live?
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'https://googlesitecom.github.io/gmail/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__apex, null, { timeout: 60000 });

for (const wait of [1500, 5000, 12000, 20000]) {
  await page.waitForTimeout(wait === 1500 ? 1500 : wait - 1500 > 0 ? wait - 5000 > 0 ? wait - 12000 - 5000 - 1500 : 0 : 0);
  const r = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div,span,button')].find(n =>
      (n.textContent ?? '').includes('MULTIJUGADOR ONLINE') && n.children.length <= 3);
    if (!el) return { err: 'no encontrado' };
    const b = el.getBoundingClientRect();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const top = document.elementFromPoint(cx, cy);
    const chain = [];
    let n = top;
    for (let i = 0; i < 6 && n; i++) { chain.push(`${n.tagName}.${(n.className + '').slice(0, 60)}`); n = n.parentElement; }
    // ¿qué elementos grandes cubren el punto?
    const coverers = [...document.querySelectorAll('body *')].filter(n => {
      const bb = n.getBoundingClientRect();
      if (bb.width < 200 || bb.height < 100) return false;
      const st = getComputedStyle(n);
      return st.position !== 'static' && cx >= bb.x && cx <= bb.x + bb.width && cy >= bb.y && cy <= bb.y + bb.height && st.pointerEvents !== 'none';
    }).map(n => `${n.tagName}.${(n.className + '').slice(0, 50)} pe=${getComputedStyle(n).pointerEvents}`);
    const scroll = document.querySelector('.overflow-y-auto');
    return {
      rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      viewport: { w: innerWidth, h: innerHeight },
      topAtPoint: chain,
      coverers: coverers.slice(0, 8),
      scrollInfo: scroll ? { sh: scroll.scrollHeight, ch: scroll.clientHeight, st: scroll.scrollTop } : null,
    };
  });
  console.log(`t=${wait}ms`, JSON.stringify(r, null, 1).slice(0, 900));
}
await browser.close();
