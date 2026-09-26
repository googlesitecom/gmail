/**
 * QA bot: joins an APEX KART online room as a second player, waits for the
 * host to start, then streams a plausible kart state around the track and
 * finishes. Usage: bun scripts/net_bot.ts <CODE> [name]
 */
import { io } from 'socket.io-client';

const CODE = (process.argv[2] ?? '').toUpperCase();
const NAME = process.argv[3] ?? 'BotRival';
if (!CODE) { console.error('usage: bun net_bot.ts <CODE>'); process.exit(1); }

const sock = io('http://localhost:3003', { transports: ['websocket', 'polling'] });

let racing = false;
let startAt = 0;
let finished = false;
// simple loop over the meadow-like 1150m track: progress advances at ~23 m/s
const LEN = 1200;
const SPEED = 23;
let prog = 0.002;

sock.on('connect', () => {
  console.log('bot connected', sock.id);
  sock.emit('room:join', { code: CODE, name: NAME, charId: 'rex', color: 0x2f6fe0 }, (ack: any) => {
    console.log('join ack:', JSON.stringify(ack));
    if (!ack?.ok) process.exit(2);
  });
});

sock.on('room:state', (room: any) => {
  console.log(`room ${room.code}: ${room.players.length} players, phase=${room.phase}, host=${room.hostId === sock.id ? 'ME' : 'other'}`);
});

sock.on('race:start', (start: any) => {
  console.log('RACE START!', JSON.stringify(start.config));
  racing = true;
  startAt = Date.now();
  // drive in a circle around some plausible coords (the actual track shape is
  // irrelevant for the host's rendering: positions are what matter)
});

sock.on('race:over', (rows: any) => {
  console.log('RACE OVER', JSON.stringify(rows));
  process.exit(0);
});

sock.on('room:lobby', () => {
  console.log('back to lobby');
  racing = false;
  finished = false;
  prog = 0.002;
});

sock.on('peer:ev', (m: any) => {
  if (m.ev?.t === 'item') console.log('peer fired item:', m.ev.item);
});

// simulate at 15 Hz
setInterval(() => {
  if (!racing || finished) return;
  prog = (prog + (SPEED / LEN) / 15) % 1;
  const laps = 3;
  const totalProg = prog + (Date.now() - startAt > 60000 ? 3 : 0); // finish after ~1 min
  const a = prog * Math.PI * 2;
  const x = Math.cos(a) * 160;
  const z = Math.sin(a) * 160;
  const p: [number, number, number] = [x, 0.5, z];
  const elapsed = (Date.now() - startAt) / 1000;
  const done = elapsed > 55;   // ~3 quick laps then finish
  sock.emit('state', {
    p, ry: -a + Math.PI / 2, s: SPEED, d: 0, st: 0,
    lap: Math.min(2, Math.floor(elapsed / 19)), prog, f: done ? 1 : 0,
  });
  if (done && !finished) {
    finished = true;
    sock.emit('race:finish', { timeMs: Math.round(elapsed * 1000) });
    console.log('bot finished at', Math.round(elapsed * 1000), 'ms');
  }
}, 66);

sock.on('disconnect', () => console.log('bot disconnected'));
setTimeout(() => { console.log('bot timeout'); process.exit(3); }, 180000);
