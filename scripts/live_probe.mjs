// Probe the LIVE deployed build: __apex handle + makeNet availability
import { chromium } from 'playwright';
const BASE = 'https://googlesitecom.github.io/gmail/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => console.log('goto:', e.message));
await page.waitForTimeout(5000);
const probe = await page.evaluate(() => {
  const a = window.__apex;
  return {
    hasApex: !!a,
    keys: a ? Object.keys(a) : [],
    version: typeof a?.version === 'string' ? a.version : (typeof a?.version === 'function' ? a.version() : null),
    hasMakeNet: !!a?.makeNet,
    title: document.title,
    menuText: document.body.innerText.slice(0, 400),
  };
});
console.log(JSON.stringify(probe, null, 2));
console.log('pageerrors:', errors.length ? errors.slice(0, 6) : 'none');
await browser.close();
