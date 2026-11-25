// The docs' sprite crops: what tools/docs/crops.mjs cuts from the game's art (public/art/new) and the pages show on their
// round plates (the rosters, the trees, the diagrams, the home's tiles, About's strip). The crops need a browser to encode
// WebP, so they are cut by that tool and committed (like public/og.png); tools/docs/sprites.json records, for each, a
// hash of the frames and pages it was cut from, and test/docs.test.js fails when the art has changed since
// (run `node tools/docs/crops.mjs` again). The units and buildings are drawn from sharp pictures that are not in the repo
// (`SHARP`, `sharpPack`): their hash takes the frames and the committed crops themselves, so the test needs no picture.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { BLDG_LOOK } from '../../src/client/look.js';
import { SHADOW } from '../newart/tone.mjs';
import { PEOPLES } from './data.mjs';

/** The game's art: index.json's groups, their pages' frames. */
export const ART = new URL('../../public/art/new/', import.meta.url);
/** The crops' folder in public/ (served at /docs/img/sprites/). */
export const SPRITE_DIR = new URL('../../public/docs/img/sprites/', import.meta.url);
export const SPRITE_URL = '/docs/img/sprites/';

/**
 * The recipe (the designer's, PRD "Docs microsite", with the docs visual plan's notes): a unit in facing 2, its first
 * pose; a building with its head (facing 2) on the same ground point; the solid art (alpha over 200) fit to 72% of a
 * square for a building, 84% for a unit and the wide gold mine (90% for the tall Balloon), so the units read on a phone,
 * never enlarged past `enlarge` times the frame's own pixels; a unit drawn from its sharp picture, over its frame's shadow
 * (`shadow`: its color, its most alpha, `soft` the blur in px of the frame); the shadow faded from
 * 86% of the plate's radius to its edge; seat 0's blue. Sizes are CSS pixels, desktop and phone; files are 2x. Bump
 * `version` when the recipe changes so every crop is cut again.
 */
export const RECIPE = {
  version: 5, tint: '#2a5ddf', foe: '#ee376a', fill: 0.72, unitFill: 0.84, fade: 0.43, solid: 200, enlarge: 2.2,
  fills: { observer: 0.9, mine: 0.84, lumen: 0.72, siegeTank: 0.74, monolith: 0.76, bastion: 0.78, scythe: 0.78 }, // (the square ones less, or the round plate cuts their corners)
  shadow: { color: SHADOW.color, alpha: 112, soft: 0.5 },
  sizes: { unit: { desktop: 96, phone: 72 }, building: { desktop: 168, phone: 104 } },
};

/**
 * The units' sharp pictures: standing, facing 2, 3 to 8 times the pack's pixels, the body's paint neutral and a team mask
 * beside it (`<name>_2.png`, `<name>_2_m.png`), no shadow, in a local folder that is never committed (EBBFALL_PICTURES,
 * as the packs' builders'). Only tools/docs/crops.mjs reads them.
 */
const SHARP = {
  harvester: 'villager', trooper: 'guard', lancer: 'archer', rider: 'rider', knight: 'knight', bastion: 'ballista',
  siegeTank: 'cannon', observer: 'balloon', lumen: 'bot', scythe: 'buggy', prism: 'sellsword', bruiser: 'bruiser',
  umbra: 'android', monolith: 'rover', shrike: 'drone',
};
const PICTURES = process.env.EBBFALL_PICTURES || '/home/mazzucci/projects/ebbfall-article/nano-test';
/** A unit's sharp picture and mask: [body, mask] paths; null for what has none. */
export const sharpOf = (key, kind) => (kind === 'unit' && SHARP[key] ? ['', '_m'].map(m => `${PICTURES}/leftovers/hires/${SHARP[key]}_2${m}.png`) : null);
/** The buildings' sharp frames: the pack's builder run again at twice its scale (BUILD), into a local folder. */
export const BUILD = ['tools/newart/bldg/build.mjs', '--scale', '4', '--lossless', '--out', 'target/bldg4'];
/** Every frame of that pack: name -> { page, rec, dir }; built by crops.mjs, never committed. */
export function sharpPack() {
  const dir = new URL('../../target/bldg4/', import.meta.url), out = {};
  for (const p of JSON.parse(readFileSync(new URL('index.json', dir), 'utf8')).groups.bldg.pages) {
    const sheet = JSON.parse(readFileSync(new URL(p, dir), 'utf8'));
    for (const [name, rec] of Object.entries(sheet.frames)) out[name] = { page: sheet.meta.image, rec, dir };
  }
  return out;
}
/** The sharp pictures the crops need that are not there. */
export const missingSharp = () => [...new Set(crops().flatMap(c => sharpOf(c.key, c.kind) || []))].filter(f => !existsSync(f));

/** The frames a kind's crop is drawn from: [base, head or null]. */
export function framesOf(key, kind) {
  if (kind === 'unit') return [`${key}_2_0`, null];
  if (kind === 'mine') return ['mine_full', null];
  const head = BLDG_LOOK[key]?.head;
  return [`bldg_${key}`, head ? `${head}_2` : null];
}

/**
 * Every crop: { name, key, kind, tint, fill, files: { which: [file, css px] } }. Each unit and building of the rosters
 * at desktop and phone size; the gold mine (no team color); an enemy Data center (seat 1's color, the loop's "their
 * base"); About's four large plates (128 px).
 */
export function crops() {
  const out = [];
  const add = (name, key, kind, tint, sizes) => out.push({
    name, key, kind, tint, fill: RECIPE.fills[key] ?? (kind === 'unit' ? RECIPE.unitFill : RECIPE.fill),
    files: Object.fromEntries(Object.entries(sizes).map(([w, px]) => [w, [`${name}-${px * 2}.webp`, px]])),
  });
  for (const p of PEOPLES) for (const b of p.buildings) {
    add(b.key, b.key, 'building', RECIPE.tint, RECIPE.sizes.building);
    for (const u of b.units) add(u.key, u.key, 'unit', RECIPE.tint, RECIPE.sizes.unit);
  }
  add('mine', 'mine', 'mine', null, { phone: 72 });
  add('conflux-foe', 'conflux', 'building', RECIPE.foe, { phone: 104 });
  for (const k of ['trooper', 'knight', 'lumen', 'shrike']) add(`${k}-large`, k, 'unit', RECIPE.tint, { large: 128 });
  return out;
}
/** A crop by name. */
export const cropOf = (name) => crops().find(c => c.name === name);

let atlasCache = null;
/** Every frame of the game's art with the page it is on: name -> { page, rec }. */
export function atlasFrames() {
  if (atlasCache) return atlasCache;
  const { groups } = JSON.parse(readFileSync(new URL('index.json', ART), 'utf8'));
  const frames = {};
  for (const p of Object.values(groups).flatMap(g => g.pages)) {
    const sheet = JSON.parse(readFileSync(new URL(p, ART), 'utf8'));
    for (const [name, rec] of Object.entries(sheet.frames)) frames[name] = { page: sheet.meta.image, rec };
  }
  return (atlasCache = frames);
}

const pageHash = new Map();
/** A hash of what a crop is cut from: its frames' records (and their team masks') and the pages they are on, its tint,
 *  fill and sizes, and the recipe's version; for one drawn from a sharp picture, its committed files too. */
export function sourceHash(c) {
  const frames = atlasFrames(), h = createHash('sha256');
  h.update(JSON.stringify([RECIPE.version, RECIPE.solid, RECIPE.fade, RECIPE.enlarge, RECIPE.shadow, c.tint, c.fill, c.files]));
  for (const n of framesOf(c.key, c.kind).filter(Boolean).flatMap(n => [n, `${n}_m`])) {
    const f = frames[n];
    if (!f) { h.update(`${n}:none`); continue; }
    if (!pageHash.has(f.page)) pageHash.set(f.page, createHash('sha256').update(readFileSync(new URL(f.page, ART))).digest('hex'));
    h.update(`${n}:${JSON.stringify(f.rec)}:${pageHash.get(f.page)}`);
  }
  if (c.kind !== 'mine') for (const [file] of Object.values(c.files)) h.update(existsSync(new URL(file, SPRITE_DIR)) ? readFileSync(new URL(file, SPRITE_DIR)) : `${file}:none`);
  return h.digest('hex').slice(0, 16);
}

/** sprites.json: { name: hash } as the crops were last cut. */
export const MANIFEST = new URL('./sprites.json', import.meta.url);
export const manifest = () => JSON.parse(readFileSync(MANIFEST, 'utf8'));
