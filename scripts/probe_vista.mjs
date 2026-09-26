import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.evaluate(() => window.__apex.start({ weather: 'clear', laps: 3, aiCount: 9 }));
await page.waitForTimeout(2000);
await page.evaluate(() => { window.__apex.auto(true); window.__apex.step(10); window.__apex.unfreeze(); });
await page.waitForTimeout(600);

const info = await page.evaluate(() => {
  const g = window.__apex.game();
  const cam = g.camera.camera;
  // plain-math frustum census: camera forward + half-FOV cone (approx)
  // get camera world direction via lookAt math: use cam.matrixWorldInverse elements
  const m = cam.matrixWorldInverse.elements;
  // camera forward in world = -Z row of inverse = -(m[8], m[9], m[10])
  const fx = -m[8], fy = -m[9], fz = -m[10];
  const cpos = cam.position;
  let total = 0, inView = 0, nearest = null;
  const clouds = [];
  const halfFov = (cam.fov * Math.PI / 180) / 2 * 1.35; // generous margin
  g.scene.traverse(o => {
    if (o.isMesh && o.material?.transparent && o.material.map) {
      total++;
      const dx = o.position.x - cpos.x, dy = o.position.y - cpos.y, dz = o.position.z - cpos.z;
      const d = Math.hypot(dx, dy, dz);
      const dot = (dx * fx + dy * fy + dz * fz) / d;
      const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (ang < halfFov) { inView++; clouds.push([Math.round(o.position.x), Math.round(o.position.y), Math.round(o.position.z), Math.round(d)]); }
      if (!nearest || d < nearest.d) nearest = { d: Math.round(d), pos: [Math.round(o.position.x), Math.round(o.position.y), Math.round(o.position.z)] };
    }
  });
  return { camPos: [Math.round(cpos.x), Math.round(cpos.y), Math.round(cpos.z)], total, inView, nearest, clouds: clouds.slice(0, 6), fov: cam.fov };
});
console.log('camera:', info.camPos);
// ridge freshness probe: count ridge strips (194 verts) + foothill cones
const ridgeInfo = await page.evaluate(() => {
  const g = window.__apex.game();
  let ridges = 0, cones = 0;
  g.scene.traverse(o => {
    if (o.isMesh && o.geometry?.attributes?.position) {
      if (o.geometry.attributes.position.count === 194) ridges++;
      if (o.geometry.type === 'ConeGeometry' && o.geometry.attributes.position.count > 60) cones++;
    }
  });
  return { ridges, cones };
});
console.log('ridge strips (fresh code => 2):', ridgeInfo.ridges, '| big cones:', ridgeInfo.cones);
console.log('cloud meshes in scene:', info.total, '| in camera cone:', info.inView, '| fov', info.fov);
console.log('nearest cloud:', info.nearest);
console.log('in-view clouds:', JSON.stringify(info.clouds));

// look slightly up at the horizon for a vista shot
await page.evaluate(() => {
  const g = window.__apex.game();
  const cam = g.camera.camera;
  const p = g.cars[0].pos;
  cam.position.set(p.x - 40, p.y + 14, p.z - 40);
  cam.lookAt(p.x + 200, p.y + 30, p.z + 200);
  cam.updateProjectionMatrix();
  void 0;
});
await page.waitForTimeout(300);
await page.screenshot({ path: '/home/z/my-project/scripts/qa/v11/vista_clear.png' });

// rain road probe
await page.evaluate(() => { window.__apex.game().quitToMenu(); });
await page.waitForTimeout(500);
await page.evaluate(() => window.__apex.start({ weather: 'rain', laps: 3, aiCount: 9 }));
await page.waitForTimeout(2500);
const rain = await page.evaluate(() => {
  const g = window.__apex.game();
  let road = null;
  g.scene.traverse(o => {
    if (road == null && o.isMesh && o.material?.roughnessMap && o.material.roughness < 0.5) {
      road = { roughness: o.material.roughness, metal: o.material.metalness, env: o.material.envMapIntensity, sceneEnv: g.scene.environmentIntensity };
    }
  });
  return road;
});
console.log('rain road material:', JSON.stringify(rain));
await page.evaluate(() => { window.__apex.auto(true); window.__apex.step(8); window.__apex.unfreeze(); });
await page.evaluate(() => {
  const g = window.__apex.game();
  const cam = g.camera.camera;
  const p = g.cars[0];
  const f = p.forward();
  cam.position.set(p.pos.x - f.x * 9, p.pos.y + 2.2, p.pos.z - f.z * 9);
  cam.lookAt(p.pos.x + f.x * 18, p.pos.y + 0.8, p.pos.z + f.z * 18);
});
await page.waitForTimeout(300);
await page.screenshot({ path: '/home/z/my-project/scripts/qa/v11/vista_rain.png' });
await browser.close();
