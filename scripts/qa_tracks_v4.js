// 12-track AI sanity on the WIDER roads: every track, 11 AI + player idle,
// 90 s of sim. Checks: field progresses (median progress), nobody hard-stuck
// at the grid, no mass respawns. Result on window.__tk.
window.__tk = null;
(async () => {
  const A = window.__apex;
  const tracks = ['meadow', 'beach', 'jungle', 'desert', 'factory', 'volcano',
    'snow', 'glacier', 'castle', 'city', 'space', 'prism'];
  const out = [];
  for (const t of tracks) {
    A.start({ trackId: t, aiCount: 11, itemsEnabled: false, difficulty: 100 });
    A.step(5);                       // countdown
    A.ctrl({ throttle: 0.6, steer: 0, drift: false });   // player rolls gently
    A.step(90);
    const s = A.state();
    const karts = s.karts;
    const progs = karts.map(k => k.s);
    const sorted = [...progs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const stuck = karts.filter(k => k.s < 0.01 && k.speed < 1).length;
    const resp = karts.filter(k => k.resp).length;
    const maxLap = Math.max(...karts.map(k => k.lap));
    out.push({ t, median: +median.toFixed(3), stuck, resp, maxLap,
      min: +sorted[0].toFixed(3), max: +sorted[sorted.length - 1].toFixed(3) });
    A.ctrl(null);
  }
  window.__tk = out;
})();
