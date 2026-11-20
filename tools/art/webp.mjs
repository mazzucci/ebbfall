// The atlas pages' image format: WebP, lossless (libwebp through @jsquash/webp, its WASM build: no native tools, the same
// on a Mac and on Linux). Lossless WebP is about half the bytes of the same page as PNG and every pixel the same, team
// masks included; lossy settings saved a little more but changed edges and masks (the numbers: the PR that brought
// WebP in, art-webp-atlases). Every browser Ebbfall runs in decodes WebP (the build's es2022 and top-level await need
// Safari 15; WebP is in Safari 14), so the pages are WebP only.
//   node tools/art/webp.mjs     converts any atlas-<n>.png left in public/art/ to atlas-<n>.webp (and its page's
//                               meta.image); tools/art/generate.mjs writes WebP itself.
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePNG } from './png.js';

const pkg = (f) => fileURLToPath(import.meta.resolve(`@jsquash/webp/${f}`));
/** libwebp's settings for the pages: lossless at its slowest, smallest method. `exact` keeps the colour under
 *  transparent pixels as drawn (bytes-neutral here, and a pixel-for-pixel round trip). */
export const WEBP = { lossless: 1, quality: 100, method: 6, exact: 1 };

/** An Emscripten module of the package's (`codec/enc/webp_enc` or `codec/dec/webp_dec`; the plain build, not the SIMD
 *  one, so every machine runs the same code), its .wasm read from disk (Node's fetch takes no file: URLs). */
async function codec(base) {
  const { default: factory } = await import(`@jsquash/webp/${base}.js`);
  const wasm = await WebAssembly.compile(readFileSync(pkg(`${base}.wasm`)));
  return factory({ noInitialRun: true, instantiateWasm: (imports, done) => { const i = new WebAssembly.Instance(wasm, imports); done(i); return i.exports; } });
}
let encoder = null, decoder = null;
const DEFAULTS = (await import('@jsquash/webp/meta.js')).defaultOptions;

/** A WebP of RGBA pixels { w, h, data } (8-bit, not premultiplied), as a Buffer. */
export async function encodeWebP({ w, h, data }, options = WEBP) {
  encoder ||= await codec('codec/enc/webp_enc');
  const out = encoder.encode(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), w, h, { ...DEFAULTS, ...WEBP, ...options });
  if (!out) throw new Error('encodeWebP: libwebp failed');
  return Buffer.from(out);
}

/** The pixels of a WebP: { w, h, data } (RGBA 8-bit, not premultiplied). */
export async function decodeWebP(buf) {
  decoder ||= await codec('codec/dec/webp_dec');
  const img = decoder.decode(new Uint8Array(buf));
  if (!img) throw new Error('decodeWebP: not a WebP');
  return { w: img.width, h: img.height, data: new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.length) };
}

/** Convert public/art's PNG pages to WebP, checking each round trip pixel for pixel. */
async function convert() {
  const root = new URL('../../public/art/', import.meta.url);
  for (const f of readdirSync(root).filter(f => /^atlas-\d+\.png$/.test(f)).sort()) {
    const png = readFileSync(new URL(f, root)), img = decodePNG(png), webp = await encodeWebP(img), name = f.replace(/\.png$/, '.webp');
    const back = await decodeWebP(webp);
    if (back.w !== img.w || back.h !== img.h || Buffer.compare(Buffer.from(back.data), Buffer.from(img.data))) throw new Error(`${f}: the WebP is not the same pixels`);
    writeFileSync(new URL(name, root), webp);
    const json = new URL(f.replace(/\.png$/, '.json'), root), sheet = JSON.parse(readFileSync(json, 'utf8'));
    sheet.meta.image = name;
    writeFileSync(json, JSON.stringify(sheet));
    rmSync(new URL(f, root));
    console.log(`${f} ${png.length} B -> ${name} ${webp.length} B (${Math.round(webp.length / png.length * 100)}%)`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await convert();
