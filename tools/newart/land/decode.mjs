// The pictures' pixels: a JPEG decoded once in headless Chromium (the repo has no JPEG decoder in Node), kept as raw
// RGBA under target/newart/land/cache (the worktree's own, never the pictures' folder), keyed by the file's size and
// time. Every later step is plain arithmetic in Node on these bytes.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChromium } from '../../chromium.mjs';

/** `{ w, h, data }` (RGBA, 8 bits) for each of `files` (paths under `dir`), in order. */
export async function decodeAll(dir, files, cache) {
  mkdirSync(cache, { recursive: true });
  const out = new Map(), todo = [];
  for (const f of files) {
    const src = join(dir, f);
    if (!existsSync(src)) throw new Error(`newart land: the picture ${src} is missing`);
    const st = statSync(src), key = join(cache, `${f.replace(/[\\/]/g, '_')}.${st.size}.${Math.floor(st.mtimeMs)}.rgba`);
    if (existsSync(key)) { const b = readFileSync(key); out.set(f, { w: b.readUInt32LE(0), h: b.readUInt32LE(4), data: new Uint8Array(b.buffer, b.byteOffset + 8, b.length - 8) }); }
    else todo.push([f, src, key]);
  }
  if (todo.length) {
    const browser = await launchChromium([]);
    try {
      const page = await (await browser.newContext()).newPage();
      for (const [f, src, key] of todo) {
        const b64 = readFileSync(src).toString('base64');
        const r = await page.evaluate(async (b64) => {
          const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
          const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight), g = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data; let s = '';
          for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode.apply(null, d.subarray(i, i + 32768));
          return { w: c.width, h: c.height, b64: btoa(s) };
        }, b64);
        const data = Buffer.from(r.b64, 'base64'), head = Buffer.alloc(8); head.writeUInt32LE(r.w, 0); head.writeUInt32LE(r.h, 4);
        writeFileSync(key, Buffer.concat([head, data]));
        out.set(f, { w: r.w, h: r.h, data: new Uint8Array(data.buffer, data.byteOffset, data.length) });
      }
    } finally { await browser.close(); }
  }
  return files.map(f => out.get(f));
}
