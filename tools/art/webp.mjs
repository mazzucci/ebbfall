// The atlas pages' image format: WebP, lossless (libwebp through @jsquash/webp, its WASM build: no native tools, the same
// on a Mac and on Linux). Lossless WebP is about half the bytes of the same page as PNG and every pixel the same, team
// masks included; lossy settings saved a little more but changed edges and masks (the numbers: the PR that brought
// WebP in, art-webp-atlases). Every browser Ebbfall runs in decodes WebP (the build's es2022 and top-level await need
// Safari 15; WebP is in Safari 14), so the pages are WebP only.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = (f) => fileURLToPath(import.meta.resolve(`@jsquash/webp/${f}`));
/** libwebp's settings for the pages: lossless at its slowest, smallest method. `exact` keeps the colour under
 *  transparent pixels as drawn (bytes-neutral here, and a pixel-for-pixel round trip). */
export const WEBP = { lossless: 1, quality: 100, method: 6, exact: 1 };

/** An Emscripten module of the package's (`codec/enc/webp_enc`; the plain build, not the SIMD
 *  one, so every machine runs the same code), its .wasm read from disk (Node's fetch takes no file: URLs). */
async function codec(base) {
  const { default: factory } = await import(`@jsquash/webp/${base}.js`);
  const wasm = await WebAssembly.compile(readFileSync(pkg(`${base}.wasm`)));
  return factory({ noInitialRun: true, instantiateWasm: (imports, done) => { const i = new WebAssembly.Instance(wasm, imports); done(i); return i.exports; } });
}
let encoder = null;
const DEFAULTS = (await import('@jsquash/webp/meta.js')).defaultOptions;

/** A WebP of RGBA pixels { w, h, data } (8-bit, not premultiplied), as a Buffer. */
export async function encodeWebP({ w, h, data }, options = WEBP) {
  encoder ||= await codec('codec/enc/webp_enc');
  const out = encoder.encode(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), w, h, { ...DEFAULTS, ...WEBP, ...options });
  if (!out) throw new Error('encodeWebP: libwebp failed');
  return Buffer.from(out);
}
