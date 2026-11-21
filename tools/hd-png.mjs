// A PNG of 8-bit RGB or RGBA, not interlaced (Playwright's screenshots are RGB): { w, h, data } as RGBA.
import { inflateSync } from 'node:zlib';
export function decodeAny(buf) {
  const idat = []; let w = 0, h = 0, bpp = 4;
  for (let at = 8; at < buf.length;) {
    const len = buf.readUInt32BE(at), type = buf.toString('ascii', at + 4, at + 8), d = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8 || (d[9] !== 6 && d[9] !== 2) || d[12]) throw new Error('unsupported PNG'); bpp = d[9] === 6 ? 4 : 3; }
    else if (type === 'IDAT') idat.push(d);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, cur = new Uint8Array(stride), out = new Uint8Array(w * h * 4); let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = (row[i] + p) & 255;
    }
    for (let x = 0; x < w; x++) { out[(y * w + x) * 4] = cur[x * bpp]; out[(y * w + x) * 4 + 1] = cur[x * bpp + 1]; out[(y * w + x) * 4 + 2] = cur[x * bpp + 2]; out[(y * w + x) * 4 + 3] = bpp === 4 ? cur[x * bpp + 3] : 255; }
    prev = cur.slice();
  }
  return { w, h, data: out };
}
