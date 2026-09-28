// Test real de TURN: Allocate con autenticación long-term (RFC 5766)
// responde con XOR-RELAYED-ADDRESS = el relay funciona de verdad.
import dgram from 'node:dgram';
import crypto from 'node:crypto';

const MAGIC = 0x2112A442;

function attr(type, val) {
  const out = Buffer.alloc(4 + Math.ceil(val.length / 4) * 4);
  out.writeUInt16BE(type, 0);
  out.writeUInt16BE(val.length, 2);
  val.copy(out, 4);
  return out;
}
function findAttr(buf, type) {
  let off = 20;
  while (off + 4 <= buf.length) {
    const t = buf.readUInt16BE(off), l = buf.readUInt16BE(off + 2);
    if (t === type) return buf.subarray(off + 4, off + 4 + l);
    off += 4 + Math.ceil(l / 4) * 4;
  }
  return null;
}
function msg(type, attrs, txid) {
  const len = attrs.reduce((s, a) => s + a.length, 0);
  const head = Buffer.alloc(20);
  head.writeUInt16BE(type, 0);
  head.writeUInt16BE(len, 2);
  head.writeUInt32BE(MAGIC, 4);
  txid.copy(head, 8);
  return Buffer.concat([head, ...attrs]);
}

async function testTurn(host, port, user, pass) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const txid = crypto.randomBytes(12);
    const timer = setTimeout(() => { sock.close(); resolve({ host, ok: false, err: 'timeout' }); }, 6000);
    const done = (r) => { clearTimeout(timer); try { sock.close(); } catch {} resolve(r); };

    sock.on('message', (buf) => {
      const type = buf.readUInt16BE(0);
      if (type === 0x0113) { // Allocate Error 401
        const realm = findAttr(buf, 0x0014)?.toString() ?? '';
        const nonce = findAttr(buf, 0x0015) ?? Buffer.alloc(0);
        const userAttr = attr(0x0006, Buffer.from(user));
        const realmAttr = attr(0x0014, Buffer.from(realm));
        const nonceAttr = attr(0x0015, nonce);
        const reqT = attr(0x0019, Buffer.from([17, 0, 0, 0]));
        const key = crypto.createHash('md5').update(`${user}:${realm}:${pass}`).digest();
        // MESSAGE-INTEGRITY: HMAC sobre el mensaje con el attr MI (longitud provisional 0)
        const body = Buffer.concat([reqT, userAttr, realmAttr, nonceAttr]);
        const head = Buffer.alloc(20);
        head.writeUInt16BE(0x0003, 0);
        head.writeUInt16BE(body.length + 24, 2); // + MI attr (24 bytes)
        head.writeUInt32BE(MAGIC, 4);
        txid.copy(head, 8);
        const forHmac = Buffer.concat([head, body, attr(0x0008, Buffer.alloc(20))]);
        const hmac = crypto.createHmac('sha1', key).update(forHmac).digest();
        const mi = attr(0x0008, hmac);
        const pkt = Buffer.concat([head, body, mi]);
        sock.send(pkt, port, host);
        return;
      }
      if (type === 0x0104) { // Allocate Success
        const relay = findAttr(buf, 0x0016);
        if (!relay) return done({ host, ok: false, err: 'sin XOR-RELAYED-ADDRESS' });
        const ip = `${(relay[0] ^ 0x21)}.${(relay[1] ^ 0x12)}.${(relay[2] ^ 0xA4)}.${(relay[3] ^ 0x42)}`;
        const p = relay.readUInt16BE(4) ^ (MAGIC >>> 16);
        done({ host, ok: true, relay: `${ip}:${p}` });
        return;
      }
      const errCode = findAttr(buf, 0x0009);
      done({ host, ok: false, err: `tipo 0x${type.toString(16)} ${errCode ? `código ${errCode.readUInt16BE(2)}` : ''}` });
    });
    // Allocate inicial sin credenciales → 401 con realm+nonce
    sock.send(msg(0x0003, [attr(0x0019, Buffer.from([17, 0, 0, 0]))], txid), port, host);
  });
}

const results = await Promise.all([
  testTurn('openrelay.metered.ca', 80, 'openrelayproject', 'openrelayproject'),
  testTurn('openrelay.metered.ca', 443, 'openrelayproject', 'openrelayproject'),
]);
console.log(JSON.stringify(results, null, 1));
