// APEX GP v11 in-browser QA: "Immersion + ULTRA lock" — weather system wiring,
// locked graphics, and regression of the core race flow under every condition.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:3000/';
const SHOT = '/home/z/my-project/scripts/qa/v11';
fs.mkdirSync(SHOT, { recursive: true });
const results = [];
const log = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? '✓' : '✗'} ${name}${info ? ' — ' + info : ''}`);
};

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 });
let pageErrors = 0;
page.on('console', m => {
  const t = m.text();
  if (/error|Error|ERROR/.test(t) && !/favicon/.test(t)) { pageErrors++; console.log('  [console]', t.slice(0, 180)); }
});
page.on('pageerror', e => { pageErrors++; console.log('  [pageerror]', String(e).slice(0, 220)); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
log('boot + __apex', await page.evaluate(() => !!(window.__apex && window.__apex.game)));
const ver = await page.evaluate(() => window.__apex.version);
log('version v12.0 (bundle freshness)', ver === 'velocitygp-v13.0', ver);

// ---------- ULTRA graphics lock -------------------------------------------------
const pr = await page.evaluate(() => window.__apex.game().renderer.getPixelRatio());
log('ULTRA lock: pixelRatio 2.0 at DPR 2', Math.abs(pr - 2) < 0.01, `pixelRatio=${pr}`);
const shadowsOn = await page.evaluate(() => {
  const g = window.__apex.game();
  return g.renderer.shadowMap.enabled && g.sun.castShadow;
});
log('ULTRA lock: shadows always on', shadowsOn);
const mapSize = await page.evaluate(() => window.__apex.game().sun.shadow.mapSize.x);
log('ULTRA lock: 4096 shadow map', mapSize === 4096, `${mapSize}`);

// ---------- per-weather session checks ------------------------------------------
const conditions = ['clear', 'cloudy', 'rain', 'night'];
for (const w of conditions) {
  await page.evaluate(weather => window.__apex.start({ weather, laps: 3, aiCount: 9 }), w);
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => window.__apex.state());
  log(`${w}: session starts`, st.phase === 'grid' || st.phase === 'lights' || st.phase === 'racing', st.phase);
  log(`${w}: weather flag`, st.weather === w, `${st.weather}`);
  log(`${w}: wet grip scale`, w === 'rain' ? Math.abs(st.wetGrip - 0.86) < 0.001 : st.wetGrip === 1, `${st.wetGrip}`);

  const sceneInfo = await page.evaluate(() => {
    const g = window.__apex.game();
    const scene = g.scene;
    let skyMat = null, cloudCount = 0, rainLines = 0, spots = 0;
    for (const c of scene.children) {
      if (c.name === 'skyDome' && c.material?.uniforms) skyMat = c.material.uniforms;
      if (c.name === 'rainSystem') {
        for (const cc of c.children) {
          if (cc.isLineSegments) rainLines = cc.geometry.attributes.position.count / 2;
        }
      }
    }
    return {
      hasSky: !!skyMat,
      skyTop: skyMat ? `#${skyMat.top.value.getHexString()}` : null,
      sunGlow: skyMat ? skyMat.sunGlow.value : null,
      night: skyMat ? skyMat.night.value : null,
      clouds: !!g.clouds,
      rain: rainLines,
      nightSpots: g.nightSpots.length + g.nightFills.length,
      env: !!scene.environment,
      fog: !!scene.fog,
    };
  });
  log(`${w}: sky v2 shader dome`, sceneInfo.hasSky, `top=${sceneInfo.skyTop} glow=${sceneInfo.sunGlow} night=${sceneInfo.night}`);
  log(`${w}: clouds layer`, w === 'night' ? !sceneInfo.clouds : sceneInfo.clouds, `${sceneInfo.clouds}`);
  log(`${w}: rain system`, w === 'rain' ? sceneInfo.rain >= 700 : sceneInfo.rain === 0, `${sceneInfo.rain} streaks`);
  log(`${w}: night floodlights`, w === 'night' ? sceneInfo.nightSpots >= 8 : sceneInfo.nightSpots === 0, `${sceneInfo.nightSpots} lights`);
  log(`${w}: PMREM env + fog`, sceneInfo.env && sceneInfo.fog);

  // wet road material in the rain (dielectric water film + clearcoat)
  if (w === 'rain') {
    const roadWet = await page.evaluate(() => {
      const g = window.__apex.game();
      let found = null;
      g.scene.traverse(o => {
        if (found == null && o.isMesh && o.material?.roughnessMap && o.material.roughness < 0.45
          && o.material.clearcoat > 0.5 && o.material.envMapIntensity > 1.5) {
          found = {
            roughness: +o.material.roughness.toFixed(2),
            clearcoat: +o.material.clearcoat.toFixed(2),
            env: +o.material.envMapIntensity.toFixed(2),
          };
        }
      });
      return found;
    });
    log('rain: wet road material (clearcoat + mirror env)', !!roadWet, JSON.stringify(roadWet));
  }

  // let the race run a bit with the autopilot, then screenshot
  await page.evaluate(() => window.__apex.auto(true));
  await page.evaluate(() => window.__apex.step(14));
  const st2 = await page.evaluate(() => window.__apex.state());
  const player = st2.cars[0];
  const moving = st2.cars.filter(c => c.speed > 15).length;
  log(`${w}: cars racing (autopilot 14 s)`, st2.phase === 'racing' && moving >= 5,
    `phase=${st2.phase} moving=${moving}/${st2.cars.length} P1=${player.kmh} km/h`);
  await page.evaluate(() => window.__apex.unfreeze());
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOT}/weather_${w}.png`, timeout: 90000, animations: 'disabled' }).catch(() => console.log('  [warn] screenshot skipped (throttled tab)'));

  // quit back to the menu for the next condition
  await page.evaluate(() => window.__apex.game().quitToMenu());
  await page.waitForTimeout(800);
}

// ---------- English UI sweep -----------------------------------------------------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__vgpIntro?.skip());   // dismiss the F1 intro (QA)
await page.waitForTimeout(400);
await page.waitForTimeout(3000);
const menuText = await page.evaluate(() => document.body.innerText);
const hasEnglish = ['GRAND PRIX', 'TIME TRIAL', 'MULTIPLAYER', 'OPTIONS'].every(s => menuText.includes(s));
const noSpanish = !/GRAN PREMIO|CONTRARRELOJ|MULTIJUGADOR|Opciones|VOLVER|PARRILLA/.test(menuText);
log('menu is fully English', hasEnglish && noSpanish);
await page.screenshot({ path: `${SHOT}/menu_english.png`, timeout: 90000, animations: 'disabled' }).catch(() => console.log('  [warn] screenshot skipped'));

// weather chips visible on the circuit screen
await page.click('text=GRAND PRIX');
await page.waitForTimeout(400);
await page.click('text=CHOOSE YOUR SEAT >> nth=0').catch(() => {});
await page.waitForTimeout(400);
// walk to the circuit screen (pick default team + setup)
for (const t of ['CAR SETUP →', 'CHOOSE CIRCUIT →']) {
  await page.click(`text=${t}`).catch(() => {});
  await page.waitForTimeout(400);
}
const circuitText = await page.evaluate(() => document.body.innerText);
const weatherChips = ['CLEAR', 'CLOUDY', 'RAIN', 'NIGHT'].every(s => circuitText.includes(s));
log('circuit screen: weather selector present', weatherChips);
await page.screenshot({ path: `${SHOT}/circuit_weather.png`, timeout: 90000, animations: 'disabled' }).catch(() => console.log('  [warn] screenshot skipped'));

// ---------- final ----------------------------------------------------------------
log('zero page errors', pageErrors === 0, `${pageErrors}`);
await browser.close();

const failed = results.filter(r => !r.ok);
console.log(`\n=== v11 QA: ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) {
  console.log('FAILED:');
  for (const f of failed) console.log(`  ✗ ${f.name} — ${f.info}`);
  process.exit(1);
}
