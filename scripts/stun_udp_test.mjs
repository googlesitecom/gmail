// Test STUN Binding sobre UDP (¿el contenedor permite UDP saliente?)
import dgram from 'node:dgram';
import crypto from 'node:crypto';

const MAGIC = 0x2112A442;
function binding(txid) {
  const b = Buffer.alloc(20);
  b.writeUInt16BE(0x0001, 0);
  b.writeUInt16BE(0, 2);
  b.writeUInt32BE(MAGIC, 4);
  txid.copy(b, 8);
  return b;
}
async function stun(host, port) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const txid = crypto.randomBytes(12);
    const t = setTimeout(() => { try { sock.close(); } catch {} resolve({ host, ok: false, err: 'timeout' }); }, 4000);
    sock.on('message', (buf) => {
      clearTimeout(t);
      const type = buf.readUInt16BE(0);
      let ip = null;
      // XOR-MAPPED-ADDRESS 0x0020
      let off = 20;
      while (off + 4 <= buf.length) {
        const at = buf.readUInt16BE(off), al = buf.readUInt16BE(off + 2);
        if (at === 0x0020) {
          const a = buf.subarray(off + 4, off + 4 + al);
          ip = `${(a[0] ^ 0x21)}.${(a[1] ^ 0x12)}.${(a[2] ^ 0xA4)}.${(a[3] ^ 0x42)}:${a.readUInt16BE(4) ^ (MAGIC >>> 16)}`;
        }
        off += 4 + Math.ceil(al / 4) * 4;
      }
      try { sock.close(); } catch {}
      resolve({ host, ok: type === 0x0101, ip });
    });
    sock.on('error', (e) => { clearTimeout(t); resolve({ host, ok: false, err: e.message }); });
    sock.send(binding(txid), port, host);
  });
}
console.log(JSON.stringify(await Promise.all([
  stun('stun.l.google.com', 19302),
  stun('stun.cloudflare.com', 3478),
]), null, 1));
