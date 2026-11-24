// A screenshot's pixels: an 8-bit RGB or RGBA PNG (not interlaced) as { w, h, data } RGBA. (tools/art/png.js reads
// RGBA only; a browser's screenshot of an opaque page is RGB.)
import { inflateSync } from 'node:zlib';

export function readPNG(buf) {
  let w = 0, h = 0, n = 0; const idat = [];
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8 || (d[9] !== 2 && d[9] !== 6) || d[12]) throw new Error('readPNG: 8-bit RGB or RGBA, not interlaced, only'); n = d[9] === 6 ? 4 : 3; }
    else if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), row = w * n, cur = new Uint8Array(row), data = new Uint8ClampedArray(w * h * 4); let prev = new Uint8Array(row);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], line = raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1));
    for (let i = 0; i < row; i++) {
      const a = i >= n ? cur[i - n] : 0, b = prev[i], c = i >= n ? prev[i - n] : 0;
      let p = 0; if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1; else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = (line[i] + p) & 255;
    }
    for (let x = 0; x < w; x++) { data[(y * w + x) * 4] = cur[x * n]; data[(y * w + x) * 4 + 1] = cur[x * n + 1]; data[(y * w + x) * 4 + 2] = cur[x * n + 2]; data[(y * w + x) * 4 + 3] = n === 4 ? cur[x * n + 3] : 255; }
    prev.set(cur);
  }
  return { w, h, data };
}
