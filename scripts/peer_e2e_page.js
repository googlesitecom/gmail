// APEX KART — in-page P2P protocol E2E (host + guest NetClients over real
// WebRTC via the PeerJS broker). Covers: create/join, config relay,
// v10 ready handshake (race:start startAt=0 → race:ready → synchronized
// race:go), bidirectional state relay, event relay, finish/race:over,
// back-to-lobby, heartbeat survival through silence, host-leave kick.
// Run inside the page: window.__e2e holds the final result string.
window.__e2e = null;
window.__e2eLog = [];
(async () => {
  const log = (m) => { window.__e2eLog.push(m); };
  try {
    const A = window.__apex;
    const host = A.makeNet(), guest = A.makeNet();
    const ev = { host: {}, guest: {} };
    host.useHooks({
      onRoomState: r => { ev.host.room = r; },
      onRaceStart: s => { ev.host.start = s; },
      onRaceGo: at => { ev.host.goAt = at; },
      onRaceOver: rows => { ev.host.over = rows; },
      onLobby: () => { ev.host.lobby = true; },
      onPeerState: (id, st) => { (ev.host.peerState = ev.host.peerState || []).push([id, st.prog]); },
      onPeerEvent: (id, e) => { ev.host.peerEv = e; },
    });
    guest.useHooks({
      onRoomState: r => { ev.guest.room = r; },
      onRaceStart: s => { ev.guest.start = s; },
      onRaceGo: at => { ev.guest.goAt = at; },
      onRaceOver: rows => { ev.guest.over = rows; },
      onLobby: () => { ev.guest.lobby = true; },
      onPeerState: (id, st) => { (ev.guest.peerState = ev.guest.peerState || []).push([id, st.prog]); },
    });

    const room = await host.createRoom('Anfitrion', 'zippy', 0xe03030);
    if (!room) throw new Error('FAIL create: ' + host.lastError);
    log('created ' + room.code);

    const joined = await guest.joinRoom(room.code, 'Invitado', 'mimi', 0x2f6fe0);
    if (!joined) throw new Error('FAIL join: ' + guest.lastError);
    log('joined players=' + joined.players.length);
    if (joined.players.length !== 2) throw new Error('FAIL player count ' + joined.players.length);

    host.setConfig({ trackId: 'beach', laps: 2, cc: 150, bots: 0 });
    await new Promise(r => setTimeout(r, 700));
    const gCfg = ev.guest.room && ev.guest.room.config;
    if (!gCfg || gCfg.trackId !== 'beach' || gCfg.cc !== 150) throw new Error('FAIL config relay ' + JSON.stringify(gCfg));
    log('config relayed beach/150');

    // v10 prewarm: abrir el peer de señalización ANTES (mientras "escribe"),
    // esperar a que esté ABIERTO y unirse reutilizándolo — sin handshake
    const early = A.makeNet();
    early.prewarm();
    for (let i = 0; i < 40 && early.status !== 'connected'; i++) {
      await new Promise(r => setTimeout(r, 500));
    }
    if (early.status !== 'connected') throw new Error('FAIL prewarm nunca abrió (status=' + early.status + ')');
    const myIdBefore = early.myId;
    const tJoin = Date.now();
    const joinedEarly = await early.joinRoom(room.code, 'Early', 'rex', 0x28c8c8);
    if (!joinedEarly) throw new Error('FAIL prewarm join: ' + early.lastError);
    const joinMs = Date.now() - tJoin;
    if (early.myId !== myIdBefore) throw new Error('FAIL prewarm: no reutilizó el peer (myId cambió)');
    if (joinMs > 16000) throw new Error('FAIL prewarm join lento: ' + joinMs + 'ms');
    log('prewarm join OK en ' + joinMs + 'ms con el MISMO peer (players=' + joinedEarly.players.length + ')');
    early.leaveRoom();
    await new Promise(r => setTimeout(r, 400));

    host.startRace();
    await new Promise(r => setTimeout(r, 900));
    if (!ev.guest.start) throw new Error('FAIL guest race:start');
    if (ev.guest.start.startAt !== 0) throw new Error('FAIL v10: race:start.startAt debe ser 0 (prepare), llegó ' + ev.guest.start.startAt);
    log('race:start(prepare) ' + ev.guest.start.config.trackId + '/' + ev.guest.start.config.cc + ' grid=' + ev.guest.start.grid.length);

    // v10 READY HANDSHAKE: ambos clientes terminaron de "construir" →
    // el host debe disparar race:go sincronizado (startAt en el futuro)
    host.raceReady();
    guest.raceReady();
    for (let i = 0; i < 40 && !(ev.host.goAt && ev.guest.goAt); i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (!ev.host.goAt || !ev.guest.goAt) throw new Error('FAIL v10 race:go host=' + ev.host.goAt + ' guest=' + ev.guest.goAt);
    if (ev.guest.goAt <= Date.now()) throw new Error('FAIL v10 race:go no está en el futuro');
    if (Math.abs(ev.host.goAt - ev.guest.goAt) > 50) throw new Error('FAIL v10 race:go no sincronizado: ' + ev.host.goAt + ' vs ' + ev.guest.goAt);
    log('v10 race:go sincronizado en ' + ev.guest.goAt + ' (ambos, delta ' + Math.abs(ev.host.goAt - ev.guest.goAt) + 'ms)');

    host.sendState({ p: [1, 0, 2], ry: 0, s: 20, d: 0, st: 0, lap: 0, prog: 0.15, f: 0 });
    guest.sendState({ p: [2, 0, 1], ry: 1, s: 18, d: 1, st: 0, lap: 0, prog: 0.10, f: 0 });
    await new Promise(r => setTimeout(r, 600));
    if (!ev.host.peerState || !ev.host.peerState.length) throw new Error('FAIL host got no guest state');
    if (!ev.guest.peerState || !ev.guest.peerState.length) throw new Error('FAIL guest got no host state');
    log('states relayed both ways (host msgs=' + ev.guest.peerState.length + ', guest msgs=' + ev.host.peerState.length + ')');

    // v9: host batches the whole CPU roster in ONE message — guests must
    // receive every row with the owner clock stamp (t) + vy intact.
    const before = (ev.guest.peerState || []).length;
    host.sendBotStates([
      ['bot-0', { t: 91234, p: [1, 0, 3], ry: 0, s: 12.5, vy: 2.1, d: 0, st: 0, lap: 0, prog: 0.20, f: 0 }],
      ['bot-1', { t: 91234, p: [2, 0, 3], ry: 1, s: 13.5, vy: -0.4, d: 2, st: 0, lap: 0, prog: 0.21, f: 0 }],
    ]);
    await new Promise(r => setTimeout(r, 600));
    const botRows = (ev.guest.peerState || []).slice(before);
    const okBots = botRows.length >= 2 && botRows.some(r => r[0] === 'bot-0' && r[1] === 0.20)
      && botRows.some(r => r[0] === 'bot-1' && r[1] === 0.21);
    if (!okBots) throw new Error('FAIL v9 bot batch relay: ' + JSON.stringify(botRows));
    log('v9 bot batch relayed in one message (rows=' + botRows.length + ')');

    guest.sendEvent({ t: 'coin', idx: 5 });
    await new Promise(r => setTimeout(r, 500));
    if (!ev.host.peerEv) throw new Error('FAIL event relay');
    log('event relayed: ' + JSON.stringify(ev.host.peerEv));

    guest.finishRace(42000); host.finishRace(41000);
    await new Promise(r => setTimeout(r, 900));
    if (!ev.guest.over || !ev.host.over) throw new Error('FAIL race:over host=' + !!ev.host.over + ' guest=' + !!ev.guest.over);
    if (ev.guest.over[0].name !== 'Anfitrion') throw new Error('FAIL winner ' + ev.guest.over[0].name);
    log('race:over winner=' + ev.guest.over[0].name + ' rows=' + ev.guest.over.length);

    host.backToLobby();
    await new Promise(r => setTimeout(r, 600));
    if (!ev.guest.lobby) throw new Error('FAIL lobby');
    log('back to lobby OK');

    // heartbeat survival: 8 s of pure silence (only host pings / guest pongs)
    await new Promise(r => setTimeout(r, 8000));
    if (!guest.room) throw new Error('FAIL guest dropped during lobby silence');
    log('heartbeat keeps room alive through 8 s silence');

    host.leaveRoom();
    await new Promise(r => setTimeout(r, 800));
    if (guest.room !== null) throw new Error('FAIL guest not kicked on host leave');
    log('host leave kicks guest cleanly');

    window.__e2e = 'E2E OK :: ' + window.__e2eLog.join(' | ');
  } catch (e) {
    window.__e2e = 'E2E FAIL :: ' + (e && e.message ? e.message : String(e)) + ' :: progress=' + window.__e2eLog.join(' | ');
  }
})();
'queued';
