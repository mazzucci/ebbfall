// The frames of the older atlas (public/art/atlas-<n>) the game still draws, cut from its committed pages pixel for
// pixel (nothing is rendered) into one small page, public/art/new/remains-0.webp + .json: the worn dirt under a building,
// the effects, the shots and the light. Its entry in public/art/new/index.json (the group `remains`) also
// carries what the game needs of atlas.json: the seats' paint (`tints`), the facings and the effects' animations.
//   node tools/art/remains.mjs     (output is committed; test/newart.test.js checks the pixels against the pages)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeWebP, encodeWebP } from './webp.mjs';
import { stamp } from '../newart/bytes.mjs';

const ART = fileURLToPath(new URL('../../public/art/', import.meta.url)), OUT = `${ART}new/`;
/** The animations the client plays from this page (gl/render.js addEffect), and the single frames. The gray smoke
 *  (`puff`) is not here: the client paints it (gl/puff.js). */
export const ANIMS = ['boom_small', 'flash', 'spark', 'glint', 'muzzle', 'trail'];
export const SINGLES = ['light', 'arrow', 'ballista_bolt', 'cannonball', 'tracer', 'tower_shot', 'rocket',
  ...[2, 3, 4].map(n => `worn_${n}`)];
const PAD = 4, WIDTH = 576; // (the gutters of the pages it is cut from: mip levels 0 to 2 clean)

async function cut() {
  const atlas = JSON.parse(readFileSync(`${ART}atlas.json`, 'utf8')), found = new Map();
  const want = new Set([...SINGLES, ...ANIMS.flatMap(a => atlas.animations[a])]);
  for (const p of atlas.pages) {
    const s = JSON.parse(readFileSync(ART + p, 'utf8')); let im = null;
    for (const [name, f] of Object.entries(s.frames)) if (want.has(name)) { im ??= await decodeWebP(readFileSync(ART + s.meta.image)); found.set(name, { name, f, im }); }
  }
  for (const n of want) if (!found.has(n)) throw new Error(`no frame ${n} in public/art`);
  const list = [...found.values()].sort((a, b) => b.f.frame.h - a.f.frame.h || b.f.frame.w - a.f.frame.w || (a.name < b.name ? -1 : 1));
  let x = 0, y = 0, row = 0;
  for (const q of list) { const { w, h } = q.f.frame; if (x + w > WIDTH) { x = 0; y += row + PAD; row = 0; } q.x = x; q.y = y; x += w + PAD; row = Math.max(row, h); }
  const W = WIDTH, H = y + row, data = new Uint8ClampedArray(W * H * 4), frames = {};
  for (const { name, f, im, x, y } of list) {
    const r = f.frame;
    for (let v = 0; v < r.h; v++) data.set(im.data.subarray(((r.y + v) * im.w + r.x) * 4, ((r.y + v) * im.w + r.x + r.w) * 4), ((y + v) * W + x) * 4);
    frames[name] = { ...f, frame: { ...r, x, y } };
  }
  const webp = await encodeWebP({ w: W, h: H, data });
  writeFileSync(`${OUT}remains-0.webp`, webp);
  writeFileSync(`${OUT}remains-0.json`, JSON.stringify({ frames, meta: { app: 'endfall tools/art/remains', image: 'remains-0.webp', format: 'RGBA8888', size: { w: W, h: H }, scale: String(atlas.scale ?? 2) } }));
  const ix = JSON.parse(readFileSync(`${OUT}index.json`, 'utf8'));
  const remains = { pages: ['remains-0.json'], tints: atlas.tints, facings: atlas.facings, animations: Object.fromEntries(ANIMS.map(a => [a, atlas.animations[a]])) };
  const { remains: _, ...rest } = ix.groups;
  ix.groups = { remains, ...rest };
  writeFileSync(`${OUT}index.json`, JSON.stringify(ix, null, 1));
  stamp(OUT);
  console.log(`remains-0: ${W}x${H}, ${list.length} frames, ${webp.length} B`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await cut();
