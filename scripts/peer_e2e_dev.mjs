// E2E del protocolo P2P contra el DEV server (localhost:3000)
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3000/';
const SCRIPT = fs.readFileSync(new URL('./peer_e2e_page.js', import.meta.url), 'utf8');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);
if (!(await page.evaluate(() => !!window.__apex))) { console.log('FAIL: no __apex'); process.exit(1); }

await page.addScriptTag({ content: SCRIPT });
try {
  await page.waitForFunction(() => window.__e2e !== null, null, { timeout: 140000 });
} catch { /* fall through to print progress */ }
const verdict = await page.evaluate(() => window.__e2e || 'E2E TIMEOUT :: ' + (window.__e2eLog || []).join(' | '));
console.log(verdict);
await browser.close();
process.exit(verdict.startsWith('E2E OK') ? 0 : 1);
