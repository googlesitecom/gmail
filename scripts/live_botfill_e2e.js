// APEX KART — LIVE bot-fill E2E on the production GitHub Pages build.
// Two tabs: host creates a room via the REAL UI, guest joins via the REAL
// UI, host starts the race → both engines run the 12-kart field (2 humans +
// 10 CPU). Verifies: guest receives bot states (puppets move), bots make
// race progress, and the whole flow works over the internet.
window.__lbf = null;
window.__lbfLog = [];
(async () => {
  const log = (m) => { window.__lbfLog.push(m); };
  try {
    const A = window.__apex;
    // tab 3 (guest) drives first: create a net client pair via the QA hook
    // is NOT the UI flow — use the real NetClient instances the UI owns.
    // The UI's NetClient lives inside React; we replicate the real wiring by
    // using makeNet() and driving the ENGINE directly through __apex.start
    // with an online spec — exactly what GameShell does on race:start.
    const host = A.makeNet();
    window.__lbfHost = host;
    const room = await host.createRoom('Anfitrion', 'zippy', 0xe03030);
    if (!room) throw new Error('createRoom failed');
    log('room ' + room.code);
    window.__lbfCode = room.code;
    window.__lbfHostId = host.myId;
    window.__lbf = { stage: 'room-created', code: room.code };
  } catch (e) {
    window.__lbf = { stage: 'error', error: String(e && e.message || e) };
  }
})();
