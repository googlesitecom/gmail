// LIVE E2E host wiring — mirrors GameShell's onRaceStart for the engine.
window.__lh = null;
(() => {
  try {
    const A = window.__apex;
    const net = A.makeNet();
    net.useHooks({
      onRaceStart: (start) => {
        A.start({
          mode: 'vs',
          trackId: start.config.trackId,
          laps: start.config.laps,
          difficulty: start.config.cc,
          mirror: start.config.mirror,
          itemsEnabled: start.config.items,
          aiCount: 0,
          aiRubberBand: 0,
          online: { grid: start.grid, localId: net.myId, startAt: start.startAt, isHost: net.isHost },
        });
        window.__lhRace = true;
      },
      onLobby: () => { window.__lhLobby = true; },
      onKicked: () => { window.__lhKicked = true; },
    });
    window.__lhNet = net;
    window.__lh = 'wired';
  } catch (e) {
    window.__lh = 'error: ' + (e && e.message || e);
  }
})();
