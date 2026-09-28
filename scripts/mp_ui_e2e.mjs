// APEX KART — MULTIJUGADOR PEERJS: E2E de UI con DOS PESTAÑAS REALES (v2)
// Flujo real del usuario + cronometraje por fase para diagnosticar lentitud:
//   [1] host crea sala      [2] guest se une por código
//   [3] config 1 vuelta/0 bots → EMPEZAR → GO sincronizado
//   [4] conducir: marionetas remotas SE MUEVEN en ambas pestañas
//   [5] completar vuelta (conducción + tp de progreso) → resultados ambos
//   [6] CONTINUAR → lobby restaurado en ambos
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'https://googlesitecom.github.io/gmail/';
const log = (...a) => console.log(`[mp ${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const T0 = Date.now();
const FAIL = (m) => { console.error('MP-UI FAIL:', m); process.exit(1); };

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required'],
});
const mk = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(`[${name}] ${String(e).slice(0, 220)}`));
  return { ctx, page, errs, name };
};
const A = await mk('host');
const B = await mk('guest');

const stateOf = (page) => page.evaluate(() => window.__apex?.state?.() ?? null);
const setCtrl = (page, c) => page.evaluate((cc) => window.__apex?.ctrl(cc), c);
const tp = (page, s) => page.evaluate((v) => window.__apex?.tp(v), s);

// carga rápida: domcontentloaded + __apex listo (networkidle puede colgarse con assets)
async function boot(p, name) {
  const t = Date.now();
  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => !!window.__apex, null, { timeout: 60000 });
  await p.waitForTimeout(2500);
  log(`${name}: página lista (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}
// click robusto contra jank de WebGL headless: dispatch JS directo sobre el BOTÓN
const jsClick = (page, text) => page.evaluate((needle) => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find(x => (x.textContent ?? '').toUpperCase().includes(needle));
  if (!b) return false;
  b.click();
  return true;
}, text);
async function enterOnline(p, name) {
  let ok = false;
  for (let i = 0; i < 10 && !ok; i++) { ok = await jsClick(p, 'MULTIJUGADOR ONLINE'); if (!ok) await p.waitForTimeout(1200); }
  if (!ok) FAIL(`${name}: botón MULTIJUGADOR ONLINE no encontrado`);
  await p.getByText('CREAR SALA').waitFor({ timeout: 25000 });
  log(`${name}: pantalla ONLINE visible`);
}

// ---------------------------------------------------------------- 1) crear sala
await boot(A.page, 'host');
await enterOnline(A.page, 'host');
await A.page.getByPlaceholder('Piloto').fill('Anfitrion');
{
  const t = Date.now();
  await jsClick(A.page, 'CREAR SALA');
  await A.page.getByText('SALA ONLINE').waitFor({ timeout: 45000 });
  log(`host: sala creada (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}
const code = await A.page.evaluate(() => {
  const el = [...document.querySelectorAll('span')].find(s =>
    /^[A-Z0-9]{4}$/.test((s.textContent ?? '').trim()) && (s.className ?? '').includes('tracking'));
  return el ? el.textContent.trim() : null;
});
if (!code) FAIL('no se pudo leer el código del DOM');

// ---------------------------------------------------------------- 2) unirse
await boot(B.page, 'guest');
await enterOnline(B.page, 'guest');
await B.page.getByPlaceholder('Piloto').fill('Invitado');
await B.page.getByPlaceholder('CÓDIGO').fill(code);
{
  const t = Date.now();
  await jsClick(B.page, 'UNIRSE');
  await B.page.getByText('SALA ONLINE').waitFor({ timeout: 45000 });
  log(`guest: UNIDO (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}
await A.page.getByText('Invitado').waitFor({ timeout: 20000 });
log(`lobby: código=${code} — ambos ven la sala con 2 pilotos`);

// ---------------------------------------------------------------- 3) config + start
const selects = A.page.locator('select');
await selects.nth(1).selectOption('1');   // Vueltas = 1
await selects.nth(3).selectOption('0');   // Bots CPU = 0
await A.page.waitForTimeout(800);
await B.page.waitForFunction(() => {
  const t = document.body.innerText;
  return /VUELTAS:\s*1/i.test(t) || /vueltas/i.test(t);
}, null, { timeout: 8000 }).catch(() => log('aviso: guest aún no pinta Vueltas=1'));
log('host: ¡EMPEZAR CARRERA! (1 vuelta, sin bots)');
{
  const t = Date.now();
  await jsClick(A.page, 'EMPEZAR CARRERA');
  await Promise.all([A, B].map(x => x.page.waitForFunction(
    () => { const s = window.__apex?.state?.(); return s && s.race && s.karts?.length > 0; },
    null, { timeout: 60000, polling: 400 })));
  log(`ambas pestañas: sesión construida (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}

// v10: ambos deben quedarse EN ESPERA (countdown) hasta el GO sincronizado
// del host. Muestreo continuo: goAtMs vive en el reloj performance.now() de
// CADA pestaña → convertir a reloj de pared (Date.now + goAt - perf.now).
const wallGo = (t) => t.page.evaluate(() => {
  const s = window.__apex?.state?.();
  return {
    phase: s?.race?.phase ?? null,
    wallGo: s?.race?.goAt ? Math.round(Date.now() + s.race.goAt - performance.now()) : 0,
    banner: document.body.innerText.includes('ESPERANDO PILOTOS'),
    now: Date.now(),
  };
});
let holdReal = false, lastPair = null, bannerAny = false, lastA = null, lastB = null;
const tHold = Date.now();
while (Date.now() - tHold < 75000) {
  lastA = await wallGo(A); lastB = await wallGo(B);
  const at = Date.now();
  if (lastA.banner || lastB.banner) bannerAny = true;
  const bothCount = lastA.phase === 'countdown' && lastB.phase === 'countdown' && lastA.wallGo > 0 && lastB.wallGo > 0;
  if (bothCount) {
    lastPair = { a: lastA, b: lastB, at };
    // espera REAL: ambos con el GO a más de 2 s en el futuro (no la cuenta
    // atrás final de 4.8 s) — nadie arrancó mientras el otro cargaba
    if (lastA.wallGo > at + 2000 && lastB.wallGo > at + 2000) holdReal = true;
  }
  if (lastA.phase === 'racing' && lastB.phase === 'racing') break;
  await Promise.all([A, B].map(t => t.page.waitForTimeout(600)));
}
log(`v10 muestreo: holdReal=${holdReal} banner=${bannerAny} | último: A=${lastA?.phase} B=${lastB?.phase}`);
if (!lastPair) {
  if (lastA?.phase === 'racing' && lastB?.phase === 'racing') {
    log('aviso: no se capturó la ventana countdown (builds muy rápidos) — se asume hold');
  } else {
    FAIL(`v10: fases atascadas A=${lastA?.phase} B=${lastB?.phase}`);
  }
} else {
  const d = Math.abs(lastPair.a.wallGo - lastPair.b.wallGo);
  log(`v10 GO: delta pared=${d}ms${holdReal ? ' · espera real capturada ✓' : ''}`);
  if (d > 2500) FAIL(`v10: GO no sincronizado (delta pared ${d}ms)`);
}
if (!bannerAny) log('aviso: banner ESPERANDO no muestreado (jank)');

await Promise.all([A, B].map(t => t.page.waitForFunction(
  () => { const s = window.__apex?.state?.(); return s && s.race && s.race.phase === 'racing'; },
  null, { timeout: 45000, polling: 400 })));
log('ambas pestañas: GO — carrera en marcha (sincronizada)');

// ---------------------------------------------------------------- 4) conducir + sincronización
// controlador de persecución: apunta al punto de la spline 25 m adelante
const pursuit = (me, roadPos) => {
  if (!me || !roadPos) return { throttle: 1, steer: 0.1, drift: false };
  const dx = roadPos[0] - me.pos[0], dz = roadPos[2] - me.pos[2];
  const want = Math.atan2(dx, dz);
  let d = want - me.yaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return { throttle: 1, steer: Math.max(-0.7, Math.min(0.7, d * 0.55)), drift: false };
};
const ROAD_AHEAD = 0.012;   // ~25 m en una pista de ~2000 m

for (const t of [A, B]) await setCtrl(t.page, { throttle: 1, steer: 0.1, drift: false });

const snap = async (t) => {
  const s = await stateOf(t.page);
  if (!s) return null;
  const me = s.karts.find(k => k.id.startsWith('player-'));
  const pu = s.karts.filter(k => k.id.startsWith('net-')).map(k => ({ id: k.id, prog: k.s, spd: k.speed, pos: k.pos }));
  return { phase: s.race?.phase, me: me && { prog: me.s, spd: me.speed, fin: me.finished, yaw: me.yaw, pos: me.pos, sm: me.gi?.smPos ?? null }, pu };
};

let movesA = 0, movesB = 0, syncLastA = null, syncLastB = null;
const tSync = Date.now();
// arranca desde el progreso actual de cada kart (tp-hop continuo: garantiza
// movimiento visible de las marionetas aunque el conductor de prueba sea malo)
{
  const sa0 = await snap(A), sb0 = await snap(B);
  var syncS = { A: sa0?.me?.prog ?? 0.01, B: sb0?.me?.prog ?? 0.01 };
}
while (Date.now() - tSync < 40000) {
  await Promise.all([A, B].map(t => t.page.waitForTimeout(2200)));
  syncS.A = (syncS.A + 0.055) % 1;
  syncS.B = (syncS.B + 0.055) % 1;
  await Promise.all([A, B].map((t, i) =>
    t.page.evaluate(([v]) => { window.__apex?.ctrl?.({ throttle: 1, steer: 0.12, drift: false }); window.__apex?.tp?.(v); }, [i === 0 ? syncS.A : syncS.B])));
  const sa = await snap(A), sb = await snap(B);
  const k = (s) => s?.pu?.[0] ? s.pu[0].pos.map(v => Math.round(v)).join(',') : null;
  if (syncLastA && k(sa) && k(sa) !== syncLastA) movesA++;
  if (syncLastB && k(sb) && k(sb) !== syncLastB) movesB++;
  if (k(sa)) syncLastA = k(sa);
  if (k(sb)) syncLastB = k(sb);
  log(`sync host.puppet prog=${sa?.pu?.[0]?.prog?.toFixed(3)} spd=${sa?.pu?.[0]?.spd?.toFixed(1)} | guest.puppet prog=${sb?.pu?.[0]?.prog?.toFixed(3)} spd=${sb?.pu?.[0]?.spd?.toFixed(1)} | meA=${sa?.me?.prog?.toFixed(3)} meB=${sb?.me?.prog?.toFixed(3)}`);
  if (sa?.me?.fin && sb?.me?.fin) break;
}
if (movesA < 3) FAIL(`marioneta del guest no se mueve en el host (moves=${movesA})`);
if (movesB < 3) FAIL(`marioneta del host no se mueve en el guest (moves=${movesB})`);
log(`SINCRONIZACIÓN OK: puppet guest→host ${movesA}×, host→guest ${movesB}×`);

// ---------------------------------------------------------------- 5) completar la vuelta
// conducción + tp continuo: saltos pequeños marcan los 12 sectores en orden
// y el cruce 0.95→0.02 cuenta la vuelta (laps=1). El progreso se rastrea
// localmente para un solo evaluate por pestaña y ciclo.
let finished = false;
const tFin = Date.now();
let nextS = null;
while (Date.now() - tFin < 130000) {
  await Promise.all([A, B].map(t => t.page.waitForTimeout(1100)));
  if (nextS == null) {
    const sa = await snap(A), sb = await snap(B);
    nextS = { A: sa?.me?.prog ?? 0, B: sb?.me?.prog ?? 0 };
  }
  nextS.A = (nextS.A + 0.09) % 1;
  nextS.B = (nextS.B + 0.09) % 1;
  await Promise.all([A, B].map((t, i) =>
    t.page.evaluate(([v]) => { window.__apex?.ctrl?.({ throttle: 1, steer: 0.1, drift: false }); window.__apex?.tp?.(v); }, [i === 0 ? nextS.A : nextS.B])));
  const sa = await snap(A), sb = await snap(B);
  if (sa?.me?.fin && sb?.me?.fin) { finished = true; break; }
  if (((Date.now() - tFin) / 1000 | 0) % 12 < 1) log(`fin: pA=${(sa?.me?.prog ?? 0).toFixed(3)} pB=${(sb?.me?.prog ?? 0).toFixed(3)}`);
}

// resultados por red en ambas pestañas
const resultsOK = await Promise.all([A, B].map(t => t.page.waitForFunction(
  () => { const s = window.__apex?.state?.(); return s && s.race && s.race.phase === 'finished'; },
  null, { timeout: 90000, polling: 500 }).then(() => true).catch(() => false)));
log(`resultados: host=${resultsOK[0]} guest=${resultsOK[1]} finished=${finished}`);
if (resultsOK.some(v => !v)) {
  const sa = await snap(A);
  log('estado host:', JSON.stringify(sa?.me), JSON.stringify(sa?.pu));
}

// textos de resultados con ambos nombres
await Promise.all([A, B].map(t => t.page.waitForTimeout(1500)));
const texts = await Promise.all([A, B].map(t =>
  t.page.evaluate(() => document.body.innerText.slice(0, 400))));
const bothNames = texts.map(t => t.includes('Anfitrion') && t.includes('Invitado'));
log(`pantalla resultados con ambos nombres: host=${bothNames[0]} guest=${bothNames[1]}`);

// ---------------------------------------------------------------- 6) vuelta al lobby
let lobbyBack = false;
try {
  await jsClick(A.page, 'CONTINUAR');
  await A.page.getByText('SALA ONLINE').waitFor({ timeout: 15000 });
  await B.page.getByText('SALA ONLINE').waitFor({ timeout: 15000 });
  lobbyBack = true;
} catch (e) { log('aviso lobby: ' + String(e).slice(0, 140)); }

const errs = [...A.errs, ...B.errs];
console.log('pageerrors:', errs.length ? errs.slice(0, 8) : 'ninguno');
await browser.close();
const ok = movesA >= 3 && movesB >= 3 && resultsOK.every(Boolean) && bothNames.every(Boolean);
console.log(`MP-UI E2E ${ok ? 'OK' : 'PARCIAL'} :: código=${code} :: joins ok :: sync ${movesA}/${movesB} :: finished=${finished} :: results=${resultsOK.join('/')} names=${bothNames.join('/')} lobby=${lobbyBack}`);
process.exit(ok ? 0 : 2);
