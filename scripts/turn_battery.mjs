// Batería de TURN: prueba Allocate real (UDP y TCP) contra candidatos públicos.
import dgram from 'node:dgram';
import net from 'node:net';
import crypto from 'node:crypto';

const MAGIC = 0x2112A442;
const attr = (type, val) => {
  const out = Buffer.alloc(4 + Math.ceil(val.length / 4) * 4);
  out.writeUInt16BE(type, 0);
  out.writeUInt16BE(val.length, 2);
  val.copy(out, 4);
  return out;
};
const findAttr = (buf, type) => {
  let off = 20;
  while (off + 4 <= buf.length) {
    const t = buf.readUInt16BE(off), l = buf.readUInt16BE(off + 2);
    if (t === type) return buf.subarray(off + 4, off + 4 + l);
    off += 4 + Math.ceil(l / 4) * 4;
  }
  return null;
};
const head = (type, len, txid) => {
  const h = Buffer.alloc(20);
  h.writeUInt16BE(type, 0);
  h.writeUInt16BE(len, 2);
  h.writeUInt32BE(MAGIC, 4);
  txid.copy(h, 8);
  return h;
};

async function turnUdp(host, port, user, pass, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const txid = crypto.randomBytes(12);
    const finish = (r) => { clearTimeout(t); try { sock.close(); } catch {} resolve(r); };
    const t = setTimeout(() => finish({ ok: false, err: 'timeout' }), timeoutMs);
    sock.on('message', (buf) => {
      const type = buf.readUInt16BE(0);
      if (type === 0x0113) {
        const realm = findAttr(buf, 0x0014)?.toString() ?? '';
        const nonce = findAttr(buf, 0x0015) ?? Buffer.alloc(0);
        if (!realm || !nonce.length) return finish({ ok: false, err: '401 sin realm/nonce' });
        const key = crypto.createHash('md5').update(`${user}:${realm}:${pass}`).digest();
        const body = Buffer.concat([
          attr(0x0019, Buffer.from([17, 0, 0, 0])),
          attr(0x0006, Buffer.from(user)),
          attr(0x0014, Buffer.from(realm)),
          attr(0x0015, nonce),
        ]);
        const h = head(0x0003, body.length + 24, txid);
        const mi = attr(0x0008, crypto.createHmac('sha1', key)
          .update(Buffer.concat([h, body, attr(0x0008, Buffer.alloc(20))])).digest());
        sock.send(Buffer.concat([h, body, mi]), port, host);
        return;
      }
      if (type === 0x0104) {
        const relay = findAttr(buf, 0x0016);
        if (!relay) return finish({ ok: false, err: 'allocate sin relay' });
        const ip = `${(relay[0] ^ 0x21)}.${(relay[1] ^ 0x12)}.${(relay[2] ^ 0xA4)}.${(relay[3] ^ 0x42)}`;
        return finish({ ok: true, relay: `${ip}:${relay.readUInt16BE(4) ^ (MAGIC >>> 16)}` });
      }
      const ec = findAttr(buf, 0x0009);
      finish({ ok: false, err: `0x${type.toString(16)} ${ec ? ec.readUInt16BE(2) : ''}` });
    });
    sock.on('error', e => finish({ ok: false, err: e.message }));
    sock.send(Buffer.concat([head(0x0003, 4, txid), attr(0x0019, Buffer.from([17, 0, 0, 0]))]), port, host);
  });
}

async function turnTcp(host, port, user, pass, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port });
    sock.setTimeout(timeoutMs);
    const txid = crypto.randomBytes(12);
    let stage = 0;
    const finish = (r) => { try { sock.destroy(); } catch {} resolve(r); };
    sock.on('connect', () => {
      sock.write(Buffer.concat([head(0x0003, 4, txid), attr(0x0019, Buffer.from([17, 0, 0, 0]))]));
    });
    sock.on('data', (buf) => {
      const type = buf.readUInt16BE(0);
      if (type === 0x0113 && stage === 0) {
        stage = 1;
        const realm = findAttr(buf, 0x0014)?.toString() ?? '';
        const nonce = findAttr(buf, 0x0015) ?? Buffer.alloc(0);
        if (!realm) return finish({ ok: false, err: '401 sin realm' });
        const key = crypto.createHash('md5').update(`${user}:${realm}:${pass}`).digest();
        const body = Buffer.concat([
          attr(0x0019, Buffer.from([17, 0, 0, 0])),
          attr(0x0006, Buffer.from(user)),
          attr(0x0014, Buffer.from(realm)),
          attr(0x0015, nonce),
        ]);
        const h = head(0x0003, body.length + 24, txid);
        const mi = attr(0x0008, crypto.createHmac('sha1', key)
          .update(Buffer.concat([h, body, attr(0x0008, Buffer.alloc(20))])).digest());
        sock.write(Buffer.concat([h, body, mi]));
        return;
      }
      if (type === 0x0104) {
        const relay = findAttr(buf, 0x0016);
        if (!relay) return finish({ ok: false, err: 'allocate sin relay' });
        const ip = `${(relay[0] ^ 0x21)}.${(relay[1] ^ 0x12)}.${(relay[2] ^ 0xA4)}.${(relay[3] ^ 0x42)}`;
        return finish({ ok: true, relay: `${ip}:${relay.readUInt16BE(4) ^ (MAGIC >>> 16)}` });
      }
      const ec = findAttr(buf, 0x0009);
      finish({ ok: false, err: `0x${type.toString(16)} ${ec ? ec.readUInt16BE(2) : ''}` });
    });
    sock.on('timeout', () => finish({ ok: false, err: 'timeout' }));
    sock.on('error', e => finish({ ok: false, err: e.message }));
  });
}

const OR = ['openrelayproject', 'openrelayproject'];
const CANDIDATES = [
  ['openrelay.metered.ca', 80, ...OR, 'udp'],
  ['openrelay.metered.ca', 443, ...OR, 'udp'],
  ['openrelay.metered.ca', 80, ...OR, 'tcp'],
  ['openrelay.metered.ca', 443, ...OR, 'tcp'],
  ['standard.relay.metered.ca', 80, ...OR, 'udp'],
  ['standard.relay.metered.ca', 443, ...OR, 'udp'],
  ['standard.relay.metered.ca', 80, ...OR, 'tcp'],
  ['standard.relay.metered.ca', 443, ...OR, 'tcp'],
  ['relay1.expressturn.com', 3478, 'eZZDD', 'OcwP9S', 'udp'],
  ['turn.cloudflare.com', 3478, 'test', 'test', 'udp'],
  ['turn.anyfirewire.com', 3478, 'webrtc', 'webrtc', 'udp'],
  ['turn.dujiao.org', 3478, 'dujiao', 'dujiao', 'udp'],
];

const out = [];
const hard = (p, ms, tag) => Promise.race([
  p.catch(e => ({ ok: false, err: e.message })),
  new Promise(res => setTimeout(() => res({ ok: false, err: 'hard-timeout' }), ms)),
]);
for (const [host, port, u, p, proto] of CANDIDATES) {
  const fn = proto === 'udp' ? turnUdp : turnTcp;
  const r = await hard(fn(host, port, u, p), 9000, host);
  out.push({ host, port, proto, ...r });
  console.log(`${host}:${port}/${proto} → ${r.ok ? '✅ RELAY ' + r.relay : '❌ ' + r.err}`);
}
const live = out.filter(r => r.ok);
console.log(`\nRESUMEN: ${live.length}/${out.length} vivos`);
live.forEach(l => console.log(`  ✅ ${l.host}:${l.port}/${l.proto} → ${l.relay}`));
