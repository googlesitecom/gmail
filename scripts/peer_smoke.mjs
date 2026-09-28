/**
 * PeerJS smoke test: host + guest over the public broker.
 * Verifies: id registration, WebRTC data channel, JSON round-trip.
 */
import Peer from 'peerjs/dist/bundler.mjs';

const CODE = 'TEST' + Math.floor(Math.random() * 1000);
const log = (...a) => console.log('[smoke]', ...a);

const host = new Peer(`apexkart-test-${CODE}`, { debug: 0 });
let done = false;

const fail = (msg) => { if (!done) { done = true; console.error('FAIL:', msg); process.exit(1); } };
setTimeout(() => fail('timeout'), 25000);

host.on('open', (id) => {
  log('host open as', id);
  host.on('connection', (conn) => {
    conn.on('data', (d) => {
      log('host got', JSON.stringify(d));
      if (d.t === 'room:join') {
        conn.send({ t: 'ack', rid: d.rid, payload: { ok: true, room: { code: CODE } } });
      } else if (d.t === 'ping') {
        conn.send({ t: 'pong', seq: d.seq });
      }
    });
  });

  const guest = new Peer({ debug: 0 });
  guest.on('open', () => {
    log('guest open as', guest.id);
    const conn = guest.connect(`apexkart-test-${CODE}`, { reliable: true });
    conn.on('open', () => {
      log('channel open');
      conn.send({ t: 'room:join', rid: 1, name: 'Bot', charId: 'zippy', color: 0xff0000 });
      let seq = 0;
      conn.on('data', (d) => {
        if (d.t === 'ack' && d.payload.ok) {
          log('guest got ack, room =', JSON.stringify(d.payload.room));
          conn.send({ t: 'ping', seq: ++seq });
        } else if (d.t === 'pong') {
          log('guest got pong seq', d.seq);
          if (d.seq >= 2) {
            done = true;
            log('SMOKE OK: join handshake + ping/pong round-trip');
            host.destroy(); guest.destroy();
            process.exit(0);
          }
          conn.send({ t: 'ping', seq: ++seq });
        }
      });
    });
    guest.on('error', (e) => fail('guest: ' + e.message));
  });
});
host.on('error', (e) => fail('host: ' + e.message));
