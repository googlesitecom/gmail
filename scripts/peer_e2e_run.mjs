// APEX KART v9 — PeerJS REAL-network E2E runner: loads the built game,
// injects peer_e2e_page.js (host + guest NetClients over the public PeerJS
// broker + WebRTC), waits for the verdict. Validates the v9 netcode end to
// end: room create/join, config, race:start, state relay both ways, the new
// ONE-message bot batch, events, finish, lobby, heartbeat, host-leave kick.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:4173/gmail/';
const SCRIPT = fs.readFileSync(new URL('./peer_e2e_page.js', import.meta.url), 'utf8');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
if (!(await page.evaluate(() => !!window.__apex))) { console.log('FAIL: no __apex'); process.exit(1); }

await page.addScriptTag({ content: SCRIPT });
try {
  await page.waitForFunction(() => window.__e2e !== null, null, { timeout: 90000 });
} catch { /* fall through to print progress */ }
const verdict = await page.evaluate(() => window.__e2e || 'E2E TIMEOUT :: ' + (window.__e2eLog || []).join(' | '));
console.log(verdict);
await browser.close();
process.exit(verdict.startsWith('E2E OK') ? 0 : 1);
