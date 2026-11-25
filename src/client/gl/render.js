// WebGL renderer (PixiJS 8) over the generated sprite sheets in public/art/ (pre-rendered 3D units and buildings
// with their shadows baked in, painted terrain and effects, all at 2x resolution). Exports the camera, view,
// resize/centerOn, renderTerrain() once per map and render(sel, place) every frame. Draws terrain on a dual grid,
// resources, buildings, units in 16 facings, projectiles, explosions, additive lights and a soft fog layer. Visual-only randomness (smoke, debris) uses Math.random: it never feeds the sim.
import 'pixi.js/unsafe-eval'; // (PixiJS's eval-free shader and uniform code: the site's CSP allows no eval, site/cache.js)
import { AlphaFilter, Application, Assets, ColorMatrixFilter, Container, Graphics, Rectangle, RenderTexture, Sprite, Texture, TextureSource } from 'pixi.js';
import { G, map, idx, TILE, MW, MH, WW, WH, BUILDINGS, UNITS, clamp, mulberry, mapPreview, canPlace, visibleEnt, allRevealed, inLockstep, enemies, ground, RADIO, coverageOf, needsCoverage, FACTIONS } from '../../engine/index.js';
import { noteBuildings, shownBldgs } from '../memory.js';
import { fx, partSize } from '../fx.js';
import { BLDG_DEATH, BLDG_LOOK, selOval as selOvalOf, headFrame, portalOpen, chimneyActive, UNIT_FPS, UNIT_POSE, strikePose, inReach, deathOf, bldgDeath, ghostAt, portalGhost, BURN_FLASH, AIR_PUFF, DEATH_DUST, HIT_DUST, hitLift, SEAT_COLORS, UNIT_ART_SCALE, colorOf, shotArt, SHOT_TRAIL, SHOT_LIT, SHOT_STYLE, SHOT_BAR, SHOT_GLOW, HEAVY_TRAIL, HIT_LOOK, HIT_STEEL, WALKER_HIT_LIFT, MUZZLE_AT, hitTier, towerOf } from '../look.js';
import { REVEAL, revealRows, revealMatrix, frameOf, slabOf, slabMarks, RAW, GHOST, GANTRY, DONE, DONE_PUFF, BUILD_BAR, WORK, rawStage, rawMatrix, solidRows, ghostAlpha, headAt, doneAt, donePuffs, siteHurt, strikeCount, strikeAt, atSite, STRIKE_FX } from '../construct.js';
import { sfx } from '../audio.js';
import { drag } from '../input.js';
import { inRange, unionArcs, nearestRim } from '../range.js';
import { scatterDoodads } from '../scenery.js';
import { groundTile, rockTile, overlayTile, rockKinds, shadeLayers } from './ground.js';
import { planGround, planHash, startsOf } from './groundplan.js';
import { newArtIndex, loadGroups, staleMasks, unitSize } from './newart.js';
import { Land, loadGrounds, MINIMAP, GROUND } from './newlandgl.js';

export const cv = document.getElementById('game');
export const mm = document.getElementById('minimap'), mctx = mm.getContext('2d');
export const view = { w: 800, h: 500, dpr: 1 };
/** Camera: top-left corner in world px, and zoom (screen px per world px). */
export const cam = { x: 0, y: 0, zoom: matchMedia('(pointer: coarse)').matches ? 1.75 : innerWidth >= 1100 ? 2 : 1.5 };
/** The zoom's bounds: ZOOM_MIN the farthest out on a small window (a phone's stays there: its 0.75 shows less than
 *  MAX_SPAN's area), ZOOM_MAX the closest in. A larger window's farthest out is `zoomLimit`, closer than ZOOM_MIN. */
export const ZOOM_MIN = 0.75, ZOOM_MAX = 2.5;
/** The most map a window may show, as an area: MAX_SPAN x MAX_SPAN_H world px (16:9), in the window's own shape, so a
 *  bigger monitor shows bigger units, not more map (all the way out a 3440 px window showed the whole map, three times a
 *  phone's view: unfair in a game against people). 3440x1440 sees about 2090x870, 1440x900 about 1710x1070. */
const MAX_SPAN = 1800, MAX_SPAN_H = MAX_SPAN * 9 / 16;
/** The zoom-out limit: the zoom at which the window shows MAX_SPAN x MAX_SPAN_H world px², never under ZOOM_MIN. The
 *  min with ZOOM_MAX is for now, until the game's box comes (a fixed-shape box inside a very wide or very large window):
 *  a 32:9 window is never pinned closer than ZOOM_MAX by the area meanwhile. And never so far out that the window is
 *  wider or taller than the map (`fills`): the camera never shows past its edges (a 3440x1440 window's area alone saw
 *  2090 px across a 2048 px duel map; 1.68 now). That one may pass ZOOM_MAX, on a window over 2.5 maps wide (5120 px
 *  on a duel map is 2.5 exactly): `zoomTop` lets it. Read on each resize, the wheel and the pinch. */
export const zoomLimit = () => Math.max(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.sqrt(view.w * view.h / (MAX_SPAN * MAX_SPAN_H)))), fills());
/** The zoom at which the window is as wide as the map, or as tall, whichever is closer. */
const fills = () => Math.max(view.w / WW, view.h / WH);
/** The closest zoom: ZOOM_MAX, unless the map's own width asks for more (`zoomLimit`). */
const zoomTop = () => Math.max(ZOOM_MAX, zoomLimit());
/** How much of the map (world px across) a desktop's window shows when a game starts: the base and the ground round
 *  it, on any monitor (unless the window is so large that ZOOM_MAX or `zoomLimit` comes first). 1050: the product
 *  manager's choice (2026-11-24) from stills of 900, 1050, 1200 and 1500 on a full HD monitor, a retina laptop and a
 *  1440 px window, between two faults. At 900, the span until then, a desktop looked zoomed in: a Knight 11.3% of a 16:9
 *  window's height, the art stretched 1.28 times at 1920 px (1.10 at 1050; its own pixels at 1200), 900 x 506 px of
 *  ground. At 1200 a Knight stood 8.4% (7.6% at 1440x900) against 16% on a phone on its side and read as a demo's, as
 *  it had when the span was 1200 before, and the first screen was mostly the dark of ground not seen yet: a 1920x1080
 *  window is 61% seen ground at 900, 48% at 1050, 40% at 1200, 28% at 1500 (a base stands by the map's edge and the
 *  camera keeps to the map, so the dark is all on one side). At 1050 a Knight is 9.7% of a 16:9 window's height (8.7%
 *  at 1440x900, 9.9% where ZOOM_MAX holds a 3440 px window), and the Castle, its gold mine and the ground round them
 *  fill the first screen (1050 x 656 world px at 1440x900; the phone shows 830 x 350). */
const START_SPAN = 1050;
/** The zoom a game starts at: a phone (a coarse pointer) at 1, its world px one CSS px, where the units read; with a
 *  mouse the window shows START_SPAN px of the map across (1.22 at 1280 px, 1.37 at 1440, 1.83 at 1920, 2.44 at 2560;
 *  never under 1, never over ZOOM_MAX, the wheel's closest: a window from 2625 px wide starts there, a 3440 px one
 *  1376 px across), so the base reads and no window is wider than the smallest map (all the way
 *  out, ZOOM_MIN, a wide monitor showed the dark past the map's edges: a stranger's first sight of the game). Never
 *  farther out than `zoomLimit` (a window over twice as tall as it is wide: 1.12 at 1000x2400), which passes ZOOM_MAX
 *  only on a window over 2.5 maps wide. The wheel zooms out from there. */
export const startZoom = () => Math.max(matchMedia('(pointer: coarse)').matches ? 1 : clamp(view.w / START_SPAN, 1, ZOOM_MAX), zoomLimit());
export const ALLY = '#f5a524', FOE = '#e2457a'; // (orders and bursts: ours amber, theirs rose)
const ALLY_FRAME = 'rgba(255,255,255,0.9)'; // (the minimap: an ally's buildings in a team game)
const MM_GOLD = '#e8c04a'; // (the minimap: a gold mine, gold as its veins)
/** Units are drawn larger than their collision radius so they are easy to see and to tap. */
export const UNIT_SCALE = 1.2;
const hexn = (s) => parseInt(s.slice(1), 16);

TextureSource.defaultOptions.scaleMode = 'linear';
TextureSource.defaultOptions.autoGenerateMipmaps = true;
const app = new Application();
// Pixels per css px: the screen's, at most 2. `?res=1.5` (any number) sets a lower cap, to try on a phone whether fewer
// pixels make big games smoother (the GPU fills about 44% fewer at 1.5 than at 2).
const RES = Math.min(Math.max(0.5, +new URLSearchParams(location.search).get('res') || 2), window.devicePixelRatio || 1);
await app.init({ canvas: cv, background: 0x0b0f16, antialias: false, roundPixels: true, autoDensity: true, resolution: RES, autoStart: false, preference: 'webgl' });
// atlas.json indexes the pages (each a PixiJS spritesheet at scale 2) and the animations, which may span pages.
const artBase = new URL('art/', document.baseURI).href;
const index = await (await fetch(artBase + 'atlas.json')).json();
/** The new look's index (gl/newart.js: `?art=new`), or null; `newArt`: the groups that loaded whole, by name (`newArt.bldg`). */
const newIndex = await newArtIndex(artBase);
const textures = {}, frames = {};
function addSheet(path, sh) {
  Object.assign(textures, sh.textures);
  // HUD portraits are cut from a plain decoded copy of the page (the browser has it cached): reading back Pixi's
  // GPU-side texture costs about a second per page.
  const img = new Image(); img.src = new URL(sh.data.meta.image, artBase + path).href;
  for (const [n, f] of Object.entries(sh.data.frames)) frames[n] = { img, f: f.frame, a: f.anchor || { x: 0.5, y: 0.5 }, at: f.spriteSourceSize || { x: 0, y: 0 } }; // (at: a trimmed frame's place in the full one)
}
for (const [p, sh] of await Promise.all(index.pages.map(async p => [p, await Assets.load(artBase + p)]))) addSheet(p, sh);
export const newArt = {};
for (const { name, group, pages } of await loadGroups(newIndex, (p) => Assets.load(artBase + p))) {
  const names = new Set(pages.flatMap(([, sh]) => Object.keys(sh.data.frames)));
  for (const n of staleMasks(names, new Set(Object.keys(frames)))) { delete textures[n]; delete frames[n]; } // (a body never wears another's mask)
  for (const [p, sh] of pages) addSheet(p, sh);
  Object.assign(index.unitTops, group.unitTops); Object.assign(index.animations, group.animations);
  newArt[name] = group;
}
/** A building type's look (look.js BLDG_LOOK), the new look's own points over it (newArt.bldg `looks`: its lights, its
 *  smoke; null: none). */
const bldgLook = (type) => ({ ...BLDG_LOOK[type], ...newArt.bldg?.looks?.[type] });
await Promise.all([...new Set(Object.values(frames).map(f => f.img))].map(i => i.decode().catch(() => {})));
/** A spot's paint: the tint the art pipeline fitted to turn the neutral team mask into paint of the seat's color
 *  (atlas.json `tints`, from look.js SEAT_COLORS; Notion: Ebbfall art). */
export const spotTint = (spot) => index.tints?.[spot % index.tints.length] ?? SEAT_COLORS[spot % SEAT_COLORS.length];
/** The new look's size for a unit of `type` (gl/newart.js UNIT_SIZE), 1 for one drawn with today's frames: the sprite,
 *  `unitTop`, `unitRadius` and the selection ring take it. */
const unitK = (type) => unitSize(type, newArt.unit?.unitTops?.[type] != null);
/** How far (world px) a unit of `type` is drawn above its ground point: its art's height (atlas.json `unitTops`, measured
 *  by tools/art/generate.mjs) at the renderer's UNIT_SCALE; a flyer's includes the height it flies at. The hit test, the
 *  health bars and the silhouettes behind buildings go by it. */
export const unitTop = (type) => (index.unitTops?.[type] ?? (UNITS[type]?.r ?? 10) * 2.4) * UNIT_SCALE * unitK(type);
/** A unit's drawn radius (world px): its sim radius at the renderer's scale and the art's (look.js UNIT_ART_SCALE). */
export const unitRadius = (u) => u.r * UNIT_SCALE * UNIT_ART_SCALE * unitK(u.type);
/** A seat's paint in this game: its spot's (look.js `colorOf`: a player keeps its board spot's color). */
export const seatTint = (team) => spotTint(colorOf(team));
/** Two tints at once (a seat's paint under an effect's tint): channel by channel product. */
const mulTint = (a, b) => b === 0xffffff ? a : ((a >> 16) * (b >> 16) / 255) << 16 | ((a >> 8 & 255) * (b >> 8 & 255) / 255) << 8 | (a & 255) * (b & 255) / 255;
const hex6 = (c) => '#' + c.toString(16).padStart(6, '0');
const iconCache = new Map(), artTops = new Map();
/** The first and last rows of frame `name` (frame px from its top) with paint in it: a flyer's art starts far above its
 *  ground point (the height it flies at); a building's frame has room above its roof. Read once from the decoded page,
 *  cached. */
function artRows(name) {
  if (artTops.has(name)) return artTops.get(name);
  const fr = frames[name]; if (!fr) return { top: 0, bot: -1 };
  const { img, f } = fr, c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  const a = ctx.getImageData(0, 0, f.w, f.h).data;
  const opaque = (y) => { for (let x = 0; x < f.w; x++) if (a[(y * f.w + x) * 4 + 3] > 24) return true; return false; };
  let top = 0, bot = f.h - 1;
  while (top < f.h && !opaque(top)) top++;
  while (bot > top && !opaque(bot)) bot--;
  const r = { top, bot };
  artTops.set(name, r);
  return r;
}
const artTop = (name) => artRows(name).top;
const artBoxes = new Map();
/** The box of frame `name` with solid paint in it (frame px, inclusive: `l`, `t`, `r`, `b`): alpha past 110, so a
 *  unit's soft shadow is left out and the figure itself is measured (`artRows` counts any paint). Read once from the
 *  decoded page, cached. */
function artBox(name) {
  if (artBoxes.has(name)) return artBoxes.get(name);
  const fr = frames[name]; if (!fr) return null;
  const { img, f } = fr, c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  const a = ctx.getImageData(0, 0, f.w, f.h).data;
  let l = f.w, t = f.h, r = -1, b = -1;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (a[(y * f.w + x) * 4 + 3] > 110) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  const box = r < 0 ? { l: 0, t: 0, r: f.w - 1, b: f.h - 1 } : { l, t, r, b };
  artBoxes.set(name, box);
  return box;
}
/**
 * A small portrait of a sprite for the HTML HUD, as a data URL: the frame scaled so its larger side is `zoom` x
 * `size` css px, centered a little above its ground point, cut to a size x size square; with `fit`, lowered when its
 * art would start above the square's top (the Drone's rotors), so its top is never cut. With `tint`, its team mask
 * (`name_m`) in that color over it, as the renderer draws it. With `head`, that frame (a building's turret, dish or
 * rotor, BLDG_LOOK) over it on the same ground point and at the same scale, painted the same way. With `box`, the
 * sprite's solid box (`artBox`, united with its head's at rest) is what fills `zoom` of the square, centered: the
 * figure, not its frame (the group grid's tiles; drawn at up to 3 device px per css px, since a 3x phone shows them
 * at 28 px). Cached.
 */
export function artIcon(name, size = 28, zoom = 1, tint = null, fit = false, head = null, box = false) {
  const key = `${name}|${size}|${zoom}|${tint}|${fit}|${head}|${box}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const fr = frames[name]; let url = '';
  if (fr) {
    const dpr = Math.min(box ? 3 : 2, window.devicePixelRatio || 1), n = Math.round(size * dpr), { x, y, w, h } = fr.f;
    const c = document.createElement('canvas'); c.width = c.height = n;
    const ctx = c.getContext('2d', { willReadFrequently: true }); // a CPU canvas: no GPU upload of the page
    let k = n * zoom / Math.max(w, h), ox = n / 2 - w * fr.a.x * k, oy = Math.max(n / 2 - (h * fr.a.y - h * 0.08) * k, fit ? n * 0.04 - artTop(name) * k : -Infinity);
    const hf = head && frames[head];
    if (box) {
      let bx = artBox(name);
      if (hf) { // (the head's box, placed on the ground point as it is painted below)
        const hb = artBox(head), hx = w * fr.a.x - hf.f.w * hf.a.x, hy = h * fr.a.y - hf.f.h * hf.a.y;
        bx = { l: Math.min(bx.l, hx + hb.l), t: Math.min(bx.t, hy + hb.t), r: Math.max(bx.r, hx + hb.r), b: Math.max(bx.b, hy + hb.b) };
      }
      const bw = bx.r - bx.l + 1, bh = bx.b - bx.t + 1;
      k = n * zoom / Math.max(bw, bh); ox = n / 2 - (bx.l + bw / 2) * k; oy = n / 2 - (bx.t + bh / 2) * k;
    }
    ctx.imageSmoothingQuality = 'high';
    const paint = (nm, fx, ox, oy) => { // a frame and its team mask, its top left at ox, oy
      ctx.drawImage(fx.img, fx.f.x, fx.f.y, fx.f.w, fx.f.h, ox, oy, fx.f.w * k, fx.f.h * k);
      const m = tint == null ? null : frames[nm + '_m'];
      if (!m) return; // the mask on a canvas of its own, multiplied by the color, cut back to the mask's shape, then over the base
      const t = document.createElement('canvas'); t.width = t.height = n; // (a CPU canvas as well)
      const tc = t.getContext('2d', { willReadFrequently: true }), mask = () => tc.drawImage(m.img, m.f.x, m.f.y, m.f.w, m.f.h, ox + m.at.x * k, oy + m.at.y * k, m.f.w * k, m.f.h * k);
      tc.imageSmoothingQuality = 'high'; mask();
      tc.globalCompositeOperation = 'multiply'; tc.fillStyle = hex6(tint); tc.fillRect(0, 0, n, n);
      tc.globalCompositeOperation = 'destination-in'; mask();
      ctx.drawImage(t, 0, 0);
    };
    paint(name, fr, ox, oy);
    if (hf) { const gx = ox + w * fr.a.x * k, gy = oy + h * fr.a.y * k; paint(head, hf, gx - hf.f.w * hf.a.x * k, gy - hf.f.h * hf.a.y * k); } // (head frames are untrimmed, as the base)
    url = c.toDataURL();
  }
  iconCache.set(key, url);
  return url;
}
/** An <img> portrait of a unit type, building type or gold mine ('node'), or ''. In `team`'s
 * colors: this client's own seat unless told otherwise. A building with a head (BLDG_LOOK) has it on, at rest. With
 * `box`, the sprite's own box fills 86% of the square (the group grid's small tiles, where a frame-cut figure was a
 * smudge); without, the frame-based cut every other portrait uses. */
export function portrait(kind, type, size = 26, team = G.me, box = false) {
  const head = bldgLook(type).head, headFrame = head ? head + '_0' : null;
  const url = box ? artIcon(kind === 'unit' ? `${type}_2_0` : kind === 'node' ? 'mine_full' : `bldg_${type}`, size, 0.86, kind === 'node' ? null : seatTint(team), false, kind === 'bldg' ? headFrame : null, true)
    : kind === 'unit' ? artIcon(`${type}_2_0`, size, 2.1, seatTint(team), true) // unit frames carry room for the shadow
      : kind === 'node' ? artIcon('mine_full', size, 1.1) : artIcon(`bldg_${type}`, size, 1.1, seatTint(team), false, headFrame);
  return url ? `<img class="por" src="${url}" alt="" width="${size}" height="${size}">` : '';
}
const tex = (name) => textures[name] || Texture.EMPTY;
/** The new look's land (gl/newland.js, gl/newlandgl.js), or null: the group `land` loaded whole, its grounds too, and
 *  every piece of the table has its frame; else today's land, all of it. `?landcap=` tries another cap (tiles). */
let land = null;
if (newArt.land) {
  try { land = new Land(await loadGrounds(newArt.land, artBase), tex, null); if (!land.ready()) throw new Error('its page does not hold the table\'s pieces: run the builder'); }
  catch (e) { console.warn(`new art: the land is left out (${e?.message ?? e})`); land = null; delete newArt.land; }
}
const landCap = +new URLSearchParams(location.search).get('landcap') || undefined;
const sheet = { animations: Object.fromEntries(Object.entries(index.animations).map(([k, names]) => [k, names.map(tex)])) };
const FACINGS = index.facings || 16;
/** Point a sprite at a texture and adopt the texture's anchor (where the ground point sits in the art). */
const setTex = (s, t) => { if (s.texture !== t) { s.texture = t; s.anchor.copyFrom(t.defaultAnchor || { x: 0.5, y: 0.5 }); } };
/** A team-colored sprite is two: the neutral art and its team mask (`name_m`) over it in the seat's color. Effects
 *  (tint, alpha) go to both, the mask's tint multiplied into the seat's. (Below 1 alpha the paint reads a little more
 *  solid than the rest: two layers.) */
const teamSprite = (parent) => { const body = new Sprite(), paint = new Sprite(); parent.addChild(body, paint); return [body, paint]; };
function paintAs(body, paint, seat, tint = 0xffffff, alpha = 1) { body.tint = tint; paint.tint = mulTint(seat, tint); body.alpha = paint.alpha = alpha; }

// ---- scene ----
// Render groups (PixiJS 8): the camera moves the world as one transform, so panning or a shake does not recompute every
// sprite's. A group's draw list is built again whenever anything in it shows, hides, comes, goes or changes depth (a
// moving unit does, every frame): the terrain (some 16k tile sprites on 128x128), the scenery, the worn dirt under the
// buildings, decals, resources,
// the field's buildings and units and the flyers each keep their own, so one layer's churn does not rebuild the others'.
// Buildings and walking units share one layer (`ents`) sorted by where they stand (their ground y): a building hides
// what stands north of it, as the 40-degree camera shows its walls rising over them. Construction sites' foundations
// lie flat under everything (`found`); flyers stay above (`air`); `xray` draws this side's own units hidden behind a
// building as faint silhouettes over it.
const world = new Container({ isRenderGroup: true });
const L = {};
const GROUPS = new Set(['apron', 'terrain', 'scenery', 'worn', 'decals', 'found', 'ents', 'air']);
for (const k of ['apron', 'terrain', 'scenery', 'shade', 'worn', 'decals', 'found', 'sel', 'ents', 'xray', 'xrayFoe', 'air', 'projs', 'fx', 'lights', 'fog', 'overlay']) world.addChild(L[k] = new Container({ isRenderGroup: GROUPS.has(k) }));
L.ents.sortableChildren = true; L.air.sortableChildren = true;
L.lights.blendMode = 'add';
L.apron.tint = 0xb4b4b4; // (the apron a shade darker than the map's own rock: where the map ends still reads)
if (land) land.L = L;
const screen = new Container();
app.stage.addChild(world, screen);
// The silhouettes: each own unit behind a building drawn again in one flat color (a color matrix: any pixel to our
// seat's color a third of the way to white, `xrayColor`, its alpha kept), faint, and only where a building covers it:
// the layer is masked by an image of the buildings in front of those units, drawn each frame into a texture the size
// of the view (`occTex`). Nothing of it is drawn while none of our units is behind a building.
const XRAY_ALPHA = 0.5;
const flat = new ColorMatrixFilter();
function xrayColor(c) {
  const ch = (k) => ((c >> k & 255) + (255 - (c >> k & 255)) / 3) / 255; // (a third of the way to white: it reads on dark stone and pale canvas alike)
  flat.matrix = [0, 0, 0, 0, ch(16), 0, 0, 0, 0, ch(8), 0, 0, 0, 0, ch(0), 0, 0, 0, 1, 0];
}
L.xray.filters = [flat]; L.xray.alpha = XRAY_ALPHA; L.xray.visible = false;
const occl = new Container(), occTex = RenderTexture.create({ width: 800, height: 500, resolution: app.renderer.resolution });
const occMask = new Sprite(occTex); screen.addChild(occMask); L.xray.mask = occMask;
// The new look's land: a unit of another seat behind live trees or rocks (it is in our sight: it was drawn) shows the
// same way in the enemy's red, or it could not be found to be shot at; a layer and a mask sprite of its own.
// (Made only with the new land: without the switch the layer stays an empty container.)
let occMaskFoe = null;
L.xrayFoe.visible = false;
if (land) {
  const flatFoe = new ColorMatrixFilter(); flatFoe.matrix = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 1, 0];
  occMaskFoe = new Sprite(occTex); screen.addChild(occMaskFoe);
  L.xrayFoe.filters = [flatFoe]; L.xrayFoe.alpha = XRAY_ALPHA; L.xrayFoe.mask = occMaskFoe;
}
const foePool = [];
const occPool = []; // (sprites in `occl`, reused frame to frame)
const bars = new Graphics(); L.overlay.addChild(bars);
const lines = new Graphics(); L.overlay.addChild(lines);
const box = new Graphics(); screen.addChild(box);
const [ghost, ghostPaint] = teamSprite(L.overlay);
const ghostRect = new Graphics(); L.overlay.addChild(ghostRect);

// ---- camera ----
let quake = null; // (`quake`: a fall's shake, look.js fallShake: ± px dying away over its life)
export function resize() {
  const r = cv.parentElement.getBoundingClientRect(), mid = toWorld(view.w / 2, view.h / 2); // (the point in the middle stays there)
  view.w = Math.max(200, r.width | 0); view.h = Math.max(160, r.height | 0); view.dpr = app.renderer.resolution;
  const hud = document.getElementById('hud'), top = document.getElementById('top'); hudFloats = !hud || getComputedStyle(hud).position === 'fixed';
  bleed = !!top && getComputedStyle(top).position === 'fixed'; topRoom = bleed ? Math.max(0, top.getBoundingClientRect().bottom - r.top) + 8 : 0;
  const m = mm.getBoundingClientRect(), sel = document.getElementById('btnBox'), b = sel && !sel.hidden ? sel.getBoundingClientRect() : null; // (SELECT, HOME and ARMY: a touch screen's row over the minimap)
  footRoom = m.height ? Math.max(0, r.bottom - Math.min(m.top, b?.height ? b.top : Infinity, deskHud.matches ? cardTop() : Infinity)) + 4 : FOOT_ROOM;
  showApron();
  app.renderer.resize(view.w, view.h); occTex.resize(view.w, view.h, app.renderer.resolution);
  cam.zoom = Math.max(cam.zoom, zoomLimit()); centerOn(mid.x, mid.y); // (a larger window: closer in, no more map than the cap)
}
const vw = () => view.w / cam.zoom, vh = () => view.h / cam.zoom; // visible world size
/** Where the HUD floats over the map the camera may scroll that far past the edges (the panels are taller with a
 *  mouse), so what stands at the map's edge can be brought out from under them; a narrow window keeps them in a band
 *  below. Looked at on each resize. */
const coarse = matchMedia('(pointer: coarse)');
let hudFloats = true;
const overscroll = () => hudFloats ? (coarse.matches ? 120 : 170) / cam.zoom : 0;
/** A desktop's and a tablet's map edge to edge (style.css: the canvas fills the window, the top bar floats over it like
 *  the HUD; `bleed`, read on each resize from the top bar's position): the camera keeps to the map at the sides, and
 *  past the top and the foot only as far as the top bar (`topRoom`, screen px) and the panels (`footRoom`: up to the
 *  top of the tallest panel at the foot and 4 px more: the minimap or, on a touch screen, SELECT, HOME and ARMY over it;
 *  with the desktop HUD a three-row command card, taller than its minimap (`cardTop`). 170 px with a mouse under 1100
 *  px, 244 units and 6 px with the desktop HUD, 227 px on a tablet, style.css) cover,
 *  so the map's first and last rows can still be brought out from under them; what shows past the edge there is the
 *  apron (rock drawn past the map, `showApron`), never the dark. The sides need no room: no panel stands at a side but
 *  at the foot and the top, and their corners come out with the foot's and the top's room. Phones keep their box. */
const FOOT_ROOM = 170; // (before the minimap is laid out)
/** The desktop HUD's window (style.css's last block; hud.js asks the same): its command card can stand over its minimap. */
const deskHud = matchMedia('(min-width: 1100px) and (min-height: 560px) and (pointer: fine)');
/** The top of the command card when it has three rows (screen px), whatever it shows now: 228 units and its border,
 *  where the desktop HUD's minimap is 190. The camera's room past the foot reaches it, so the map's last rows come out
 *  from under a full card too. */
function cardTop() {
  const cmd = document.getElementById('cmd'), cs = getComputedStyle(cmd), px = (v) => parseFloat(v) || 0;
  return cmd.getBoundingClientRect().bottom - (3 * px(cs.gridAutoRows) + 2 * px(cs.rowGap) + px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth));
}
let bleed = false, topRoom = 0, footRoom = FOOT_ROOM;
export function clampCam() {
  if (bleed) {
    cam.x = clamp(cam.x, 0, Math.max(0, WW - vw()));
    cam.y = clamp(cam.y, -topRoom / cam.zoom, Math.max(0, WH - vh()) + footRoom / cam.zoom);
    return;
  }
  const o = overscroll(); cam.x = clamp(cam.x, -o, Math.max(0, WW - vw()) + o); cam.y = clamp(cam.y, -o / 2, Math.max(0, WH - vh()) + o);
}
export function centerOn(x, y) { cam.x = x - vw() / 2; cam.y = y - vh() / 2; clampCam(); }
/** The camera for a game's start: over (x, y), and on the map itself, nothing past its edges at the sides or the top
 *  (a base sits near a corner: the usual room past the edge showed dark down the first screen's side, on a desktop and
 *  on a phone on its side alike); at the foot the usual room stays, where the HUD floats over the map. */
export function startOn(x, y) {
  centerOn(x, y);
  cam.x = clamp(cam.x, 0, Math.max(0, WW - vw())); cam.y = Math.max(0, cam.y);
}
/** Screen (canvas css px) → world px. */
export const toWorld = (sx, sy) => ({ x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y });
/** Whether world point (x, y) is on screen or within `m` world px of it. With eight armies most fights are elsewhere:
 *  their effects are not made at all (decals are, and show once the camera comes). */
export const nearView = (x, y, m = 160) => x > cam.x - m && x < cam.x + vw() + m && y > cam.y - m && y < cam.y + vh() + m;
/** Zoom by `factor`, keeping the world point under screen point (sx, sy) fixed. */
export function zoomAt(factor, sx, sy) {
  const before = toWorld(sx, sy);
  cam.zoom = clamp(cam.zoom * factor, zoomLimit(), zoomTop());
  cam.x = before.x - sx / cam.zoom; cam.y = before.y - sy / cam.zoom; clampCam();
}

// ---- terrain (once per map) ----
// A pixel per tile: the minimap's ground and the fog, at the map's size (sizeGrids); the shade layers are made per map.
const thumb = document.createElement('canvas');
const fog = new Sprite(); fog.scale.set(TILE); L.fog.addChild(fog);
const FOG_DARK = [5, 7, 11, 255], FOG_SEEN = [18, 22, 34, 115], FOG_CLEAR = [18, 22, 34, 0]; // (RGBA per tile: never explored, explored, in sight)
/** The apron: tiles of rock drawn past the map's edges (each edge's rock kind carried out, the fog of its edge tiles
 *  too), so a desktop's or a tablet's camera room past the top and the foot (`clampCam`) shows ground, never the dark.
 *  Shown only edge to edge (`bleed`): a phone's box shows what it showed. As deep as the most room past an edge at the
 *  farthest zoom: the desktop HUD's foot room over its zoom limit, at most 340 px on a touch laptop (SELECT, HOME and
 *  ARMY over the minimap: 255 screen px at 0.75 in the largest window whose limit is 0.75, 1350 x 759; a larger
 *  window's grows with --u as its limit does, and --u stops at 1.1; 313 px with a mouse alone, a three-row card's top),
 *  11 tiles; a tablet's 227 screen px (231 over a home indicator) at 0.75, 308 px. */
const APRON = 13;
// (the fog canvas is APRON tiles larger each way, its edge pixels stretched out each update; the map's own part,
// `fogMapTex`, for a box)
let fogCv, fogCtx, fogImg, fogTex, fogMapTex, gridW = 0, gridH = 0;
/** Make the per-tile canvases and textures for a map of MW x MH (again only when a game's map has another size). */
function sizeGrids() {
  if (gridW === MW && gridH === MH) return;
  gridW = MW; gridH = MH;
  const texture = (c) => { const t = Texture.from(c); t.source.scaleMode = 'linear'; return t; };
  thumb.width = MW; thumb.height = MH;
  const [oldMap, oldTex] = [fogMapTex, fogTex];
  fogCv = document.createElement('canvas'); fogCv.width = MW + 2 * APRON; fogCv.height = MH + 2 * APRON;
  fogCtx = fogCv.getContext('2d'); fogCtx.imageSmoothingEnabled = false; fogImg = fogCtx.createImageData(MW, MH);
  fogCtx.fillStyle = `rgba(${FOG_DARK.slice(0, 3)},1)`; fogCtx.fillRect(0, 0, fogCv.width, fogCv.height);
  fogTex = texture(fogCv); fogMapTex = new Texture({ source: fogTex.source, frame: new Rectangle(APRON, APRON, MW, MH) });
  for (let i = 0; i < MW * MH; i++) fogImg.data.set(FOG_DARK, i * 4); // (updateFogImage sets each tile's)
  oldMap?.destroy(); oldTex?.destroy(true);
  showApron();
}
/** The apron and the fog's part past the map shown edge to edge only (`bleed`). */
function showApron() {
  if (!fogTex) return;
  L.apron.visible = bleed;
  fog.texture = bleed ? fogTex : fogMapTex; fog.position.set(bleed ? -APRON * TILE : 0);
}
sizeGrids();

const chunks = [];
const doodads = [];
let doodadCheck = 0, doodadBldgs = -1; // wall-clock time of the last check, building count then
/** Ground props under a building (its footprint or the tiles around their center) are hidden. The footprints come
 *  from the buildings themselves (the tiles the sim's occupancy grid gives them), not a copy of that grid. */
let footprints = new Uint8Array(0);
function hideCoveredDoodads() {
  if (footprints.length !== MW * MH) footprints = new Uint8Array(MW * MH); else footprints.fill(0);
  for (const b of shownBldgs()) for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) footprints[idx(b.tx + x, b.ty + y)] = 1; // (what this side may see: memory.js)
  for (const d of doodads) if (d.ground) {
    let covered = false;
    for (let dy = -1; dy <= 1 && !covered; dy++) for (let dx = -1; dx <= 1; dx++) if (footprints[idx(d.tx + dx, d.ty + dy)]) { covered = true; break; }
    if (d.s.visible === covered) d.s.visible = !covered;
  }
}
const apronChunks = [];
function cullTerrain(x0, y0, x1, y1) { for (const list of [chunks, apronChunks]) for (const c of list) if (c) c.visible = c.cx + 9 * TILE > x0 && c.cx - TILE < x1 && c.cy + 9 * TILE > y0 && c.cy - TILE < y1; }

/** The minimap's ground colors (renderTerrain): rock, water, the meadows, the worn dirt and the rock's lean. */
const MM_ROCK = { forest: [42, 63, 34], hill: [119, 117, 108] }, MM_WET = { shallow: [70, 124, 128], deep: [29, 54, 88] };
const MM_DRY = [149, 154, 76], MM_LUSH = [20, 64, 44], MM_WORN = [108, 99, 76], MM_WARM = [160, 112, 58], MM_COOL = [58, 90, 144];
/** An HSL color (hue in degrees, saturation and lightness 0-1) as RGB 0-255, as CSS's hsl() gives it. */
function hslRgb(hDeg, sat, lit) {
  const c = (1 - Math.abs(2 * lit - 1)) * sat, hp = hDeg / 60, x = c * (1 - Math.abs((hp % 2) - 1)), m = lit - c / 2;
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
/** The ground this map was given (read-only, for the tests): the starts its plan saw, its worn and crag tiles, the
 *  overlay sprites drawn, the plan's hash (groundplan.js planHash), and what laying it cost (ms: the plan, the shade
 *  layers, all of renderTerrain). */
let groundLaid = null;
export const groundShown = () => groundLaid && { ...groundLaid, ms: { ...groundLaid.ms } };

export function renderTerrain() {
  const t0 = performance.now(), ms = {};
  land?.clear(); // (the new look's land: its ground, its pieces among the units)
  L.terrain.removeChildren().forEach(c => c.destroy({ children: true }));
  L.apron.removeChildren().forEach(c => c.destroy({ children: true }));
  L.shade.removeChildren().forEach(c => c.destroy({ texture: true, textureSource: true }));
  sizeGrids(); fogTick = -1; mmAt = -Infinity; mmGroundOk = false; // (a new map, or a replay from its first tick: fog and minimap at once)
  xrayColor(SEAT_COLORS[colorOf(G.me) % SEAT_COLORS.length]); // (this side's own color, for its silhouettes)
  const rnd = mulberry(G.seed * 7 + 3);
  const rock = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH || map.rock[idx(x, y)] ? 1 : 0;
  const wetCell = (i, j) => [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].some(([x, y]) => !rock(x, y) && ground(x, y) !== 'land');
  // Each rock region a forest or a rocky hill, picked once per region (gl/ground.js rockKinds): a cell takes the kind
  // of its first rock corner, all of one region.
  const kinds = rockKinds(MW, MH, (x, y) => map.rock[idx(x, y)] !== 0, G.seed);
  const cellKind = (i, j) => { for (const [x, y] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) if (rock(x, y)) return kinds.kindAt(x, y); return 'hill'; };
  // The ground's plan (gl/groundplan.js): meadows, worn tracks and yards, the rock's tone, the crags, from the map alone
  // (every start, seated or not, from the menu's preview of this map): the same for every player whoever sits where.
  let lap = performance.now();
  const starts = startsOf(mapPreview(G.seed, G.mapKind, MW), MW, MH), depth = new Uint8Array(MW * MH), depthOf = { land: 0, shallow: 1, deep: 2 };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) depth[y * MW + x] = depthOf[ground(x, y)];
  const plan = planGround({ w: MW, h: MH, rock: map.rock, depth, nodes: map.nodes, starts, seed: G.seed, kindAt: kinds.kindAt, regionAt: kinds.regionAt });
  ms.plan = performance.now() - lap;
  const toneAt = (g, i, j) => (g[idx(Math.max(0, i), Math.max(0, j))] + g[idx(Math.min(MW - 1, i + 1), Math.max(0, j))] + g[idx(Math.max(0, i), Math.min(MH - 1, j + 1))] + g[idx(Math.min(MW - 1, i + 1), Math.min(MH - 1, j + 1))]) / 4;
  // Dual grid: the cell between tiles (i,j)..(i+1,j+1) is drawn at its center, offset half a tile.
  // Tiles go into 8x8-cell chunks so only the chunks on screen are drawn (no baking: it would cost a 4096² texture).
  chunks.length = 0;
  if (!land) for (let j = -1; j < MH; j++) for (let i = -1; i < MW; i++) { // (the new look's land draws its own ground: below)
    const m = rock(i, j) | rock(i + 1, j) << 1 | rock(i, j + 1) << 2 | rock(i + 1, j + 1) << 3;
    const r = rnd();
    const name = m === 0 ? `ground_${groundTile(r, i, j, G.seed, wetCell(i, j), toneAt(plan.dry, i, j), toneAt(plan.lush, i, j))}` : rockTile(m, r, cellKind(i, j));
    const ci = (j + 1) >> 3, cj = (i + 1) >> 3, key = ci * 64 + cj;
    let c = chunks[key]; if (!c) { c = chunks[key] = new Container(); c.cx = cj * 8 * TILE; c.cy = ci * 8 * TILE; L.terrain.addChild(c); }
    const s = new Sprite(tex(name)); s.anchor.set(0); s.position.set(i * TILE + 16, j * TILE + 16); c.addChild(s);
  }
  // The overlay grounds on the dual grid, over the tiles: the worn dirt on the grass, never in a cell with rock or water
  // in it (a hill's lip, a forest's rim and a shore keep their own pixels; the plan keeps it a tile off them, so no
  // piece of it is cut), each cell as strong as its worn corners on average (a track fading out before a pass); the
  // crags on a hill's inside cells only (all four tiles rock). Neither reaches the map's edge: the apron stays plain.
  let sprites = 0;
  for (const [kind, name] of land ? [] : [['dirt', 'worn'], ['crag', 'crag']]) {
    const g = plan[kind], on = (x, y) => (x >= 0 && y >= 0 && x < MW && y < MH && g[idx(x, y)] > 0 ? 1 : 0);
    for (let j = -1; j < MH; j++) for (let i = -1; i < MW; i++) {
      const m = on(i, j) | on(i + 1, j) << 1 | on(i, j + 1) << 2 | on(i + 1, j + 1) << 3, rocks = rock(i, j) + rock(i + 1, j) + rock(i, j + 1) + rock(i + 1, j + 1);
      if (!m || (kind === 'crag' ? rocks !== 4 : rocks !== 0 || wetCell(i, j))) continue;
      let sum = 0, k = 0; for (const [x, y] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) if (on(x, y)) { sum += g[idx(x, y)]; k++; }
      const s = new Sprite(tex(overlayTile(name, m, i, j, G.seed))); s.position.set(i * TILE + 16, j * TILE + 16); s.alpha = sum / k;
      chunks[((j + 1) >> 3) * 64 + ((i + 1) >> 3)].addChild(s); sprites++;
    }
  }
  // The apron (APRON): rock cells past the map's own, each its edge's kind (ground.js kindAt off the map), from a
  // random stream of its own (the map's cells keep theirs), in 8x8-cell chunks of its own.
  apronChunks.length = 0;
  const rndA = mulberry(G.seed * 7 + 5), apronAt = new Map();
  if (!land) for (let j = -1 - APRON; j < MH + APRON; j++) for (let i = -1 - APRON; i < MW + APRON; i++) {
    if (i >= -1 && i < MW && j >= -1 && j < MH) continue; // (the map's own, above)
    const name = rockTile(15, rndA(), cellKind(i, j)), cx = Math.floor((i + 1) / 8), cy = Math.floor((j + 1) / 8), key = `${cx},${cy}`;
    let c = apronAt.get(key); if (!c) { apronAt.set(key, c = new Container()); c.cx = cx * 8 * TILE; c.cy = cy * 8 * TILE; L.apron.addChild(c); apronChunks.push(c); }
    const s = new Sprite(tex(name)); s.anchor.set(0); s.position.set(i * TILE + 16, j * TILE + 16); c.addChild(s);
  }
  // Large-scale variation so the tiles never read as a grid, and the water (gl/ground.js): a multiply (the land's shade,
  // the meadows, the rock's tone, a wet line along the shore, the water's tints) and an add (the meadows' and the
  // rock's lift, the water's light), over the scenery too.
  lap = performance.now();
  const sh = shadeLayers(MW, MH, { rock: (x, y) => map.rock[idx(x, y)] !== 0, ground, shade: (x, y) => map.shade[idx(x, y)], tone: land ? land.tone(plan, kinds.kindAt) : { ...plan, kindAt: kinds.kindAt } });
  for (const [data, blendMode] of [[sh.mul, 'multiply'], [sh.add, 'add']]) {
    if (!data) continue;
    const cv = document.createElement('canvas'); cv.width = sh.w; cv.height = sh.h;
    cv.getContext('2d').putImageData(new ImageData(data, sh.w, sh.h), 0, 0);
    const t = Texture.from(cv); t.source.scaleMode = 'linear';
    const vs = new Sprite(t); vs.scale.set(TILE / sh.k); vs.blendMode = blendMode; L.shade.addChild(vs);
  }
  ms.shade = performance.now() - lap;
  // Scenery: props on the plateaus and the open ground (see scenery.js); ground props hide under buildings.
  L.scenery.removeChildren().forEach(c => c.destroy()); doodads.length = 0;
  const cores = G.bldgs.filter(b => b.d.hq).map(b => ({ tx: b.tx + b.w / 2, ty: b.ty + b.h / 2 }));
  for (const d of land ? [] : scatterDoodads(G.seed, map, cores, { MW, MH, TILE, mulberry })) {
    const s = new Sprite(); setTex(s, tex(`doodad_${d.name}`)); s.position.set(d.x, d.y); L.scenery.addChild(s);
    doodads.push({ s, tx: d.tx, ty: d.ty, ground: d.ground });
  }
  // The new look's land (gl/newlandgl.js): its ground in the terrain's place, trees and rocks on the blocked cells, on
  // the apron too; a live piece tinted by the land's shade at its foot (the multiply layer lies under the units).
  let landLaid = null;
  if (land) {
    const shadeAt = (x, y) => { const o = (clamp(Math.floor(y / TILE * sh.k), 0, sh.h - 1) * sh.w + clamp(Math.floor(x / TILE * sh.k), 0, sh.w - 1)) * 4; return sh.mul[o] << 16 | sh.mul[o + 1] << 8 | sh.mul[o + 2]; };
    landLaid = land.lay({ w: MW, h: MH, rock: map.rock, kindAt: kinds.kindAt, dirt: plan.dirt, seed: G.seed, apron: APRON, cap: landCap, shadeAt, apronTint: L.apron.tint, wet: (x, y) => ground(x, y) !== 'land', mines: map.nodes });
    doodads.push(...land.low); // (a low plant under a building hides, as today's ground props)
  }
  // Minimap background: the grass green by the map's shade, a forest darker, a hill gray, the sea teal and blue, as the
  // ground looks; the plan on it, faintly (the meadows, the tracks, the rock's lean). Written pixel by pixel (a fill
  // per tile cost a phone a tenth of a second).
  const img = new ImageData(MW, MH), px = img.data;
  const dot = (o, [r, g, b], a) => { px[o] += (r - px[o]) * a; px[o + 1] += (g - px[o + 1]) * a; px[o + 2] += (b - px[o + 2]) * a; };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = idx(x, y), o = (y * MW + x) * 4, g = map.rock[i] ? 'land' : ground(x, y);
    if (land) { // (the new land's own colors, gl/newlandgl.js MINIMAP: the grass by the map's shade, a wood dark, rock pale, the tracks sand)
      px.set(map.rock[i] ? MINIMAP[kinds.kindAt(x, y)] : MM_WET[g] || MINIMAP.grass.map(v => v * (MINIMAP.shade + (1 - MINIMAP.shade) * map.shade[i])), o); px[o + 3] = 255;
      if (plan.dirt[i] && !MM_WET[g]) dot(o, MINIMAP.dirt, plan.dirt[i] * MINIMAP.dirtAmount);
      continue;
    }
    px.set(map.rock[i] ? MM_ROCK[kinds.kindAt(x, y)] : MM_WET[g] || hslRgb(92, 0.24, 0.17 + map.shade[i] * 0.08), o); px[o + 3] = 255;
    if (plan.dry[i] > 0.05) dot(o, MM_DRY, plan.dry[i] * 0.1);
    if (plan.lush[i] > 0.05) dot(o, MM_LUSH, plan.lush[i] * 0.14);
    if (plan.dirt[i]) dot(o, MM_WORN, plan.dirt[i] * 0.45);
    if (plan.rockTone[i]) dot(o, plan.rockTone[i] > 0 ? MM_WARM : MM_COOL, Math.abs(plan.rockTone[i]) * 0.22);
  }
  thumb.getContext('2d').putImageData(img, 0, 0);
  ms.total = performance.now() - t0;
  let worn = 0, crag = 0; for (let i = 0; i < MW * MH; i++) { if (plan.dirt[i]) worn++; if (plan.crag[i]) crag++; }
  groundLaid = { size: [MW, MH], starts: starts.length, worn, crag, sprites, hash: planHash(plan), ms, land: landLaid };
  for (const pool of [unitObjs, bldgObjs, nodeObjs]) { for (const o of pool.values()) o.destroy(); pool.clear(); }
  for (const o of dying) o.destroy(); dying.length = 0; quake = null; pending.length = 0; for (const k of blinks) k.l.destroy(); blinks.length = 0;
  L.decals.removeChildren().forEach(c => c.destroy()); decals.length = 0;
  L.worn.removeChildren().forEach(c => c.destroy()); // (the buildings' own, gone with them above)
  for (const e of effects) { e.s.destroy(); if (e.l) e.l.destroy(); } effects.length = 0;
}

// ---- entity display objects, keyed by sim id ----
const unitObjs = new Map(), bldgObjs = new Map(), nodeObjs = new Map();
const light = (tint, scale, alpha) => { const s = new Sprite(tex('light')); s.anchor.set(0.5); s.tint = tint; s.scale.set(scale); s.alpha = alpha; L.lights.addChild(s); return s; };

// Selection marks: cool white (red for the enemy), unlike anything else on the field: health bars are green to red,
// orders amber, resources teal and violet.
const SEL = 0xeaf6ff, SEL_FOE = 0xff5a5a;
/** The Portal's swirl at rest: this faint (look.js portalOpen brightens it to full as a unit comes through). */
const PORTAL_SETTLED = 0.35;
const selG = new Graphics(); L.sel.addChild(selG); // (the selection marks, under the units and buildings: cleared every frame)
/** A selection mark: one thin whole ellipse on the ground, 1.5 px of its color over a 3.5 px dark underlay and a faint
 *  wash of it inside, in screen pixels at any zoom (in world pixels it grew with the zoom: 6 px strokes at a desktop's
 *  start, a toy's). A unit's round its feet, a building's round its footprint, an enemy's red. */
function selRing(cx, cy, rx, ry, color) {
  const px = 1 / cam.zoom;
  selG.ellipse(cx, cy, rx, ry).fill({ color, alpha: 0.06 }).stroke({ width: 3.5 * px, color: 0x000000, alpha: 0.38 });
  selG.ellipse(cx, cy, rx, ry).stroke({ width: 1.5 * px, color, alpha: 0.95 });
}
/** A selected building: its ring sized to its footprint (look.js `selOval`). */
function selOval(b, color) { const o = selOvalOf(b); selRing(o.x, o.y, o.rx, o.ry, color); }
class UnitObj {
  constructor(u) {
    const layer = u.d.air ? L.air : L.ents;
    this.air = !!u.d.air; this.type = u.type; this.r = unitRadius(u); this.top = unitTop(u.type); // (its drawn size: the silhouettes' test)
    this.frames = (sheet.animations[`${u.type}_0`] || [0]).length;
    // (the new look's units, tools/newart/unit/build.mjs: frame 0 the standing pose and the march in frames 1..n, at its
    // own pace; a load carried `_c<f>`, a builder's two strokes `_k0` `_k1`, a shot `_aim` `_shot` `_after`, set up `_set`)
    const A = newArt.unit || {}, has = (k) => !!A[k]?.includes(u.type);
    this.stand = has('stand'); this.fps = A.fps?.[u.type]; this.loads = has('carry'); this.works = has('work'); this.fires = A.fire?.[u.type]; this.sets = has('set');
    this.node = new Container(); this.node.scale.set(UNIT_SCALE * unitK(u.type)); layer.addChild(this.node); // (body, paint and flash sort as one)
    this.body = new Sprite(); this.flash = new Sprite(); this.paint = new Sprite(); this.paintFlash = new Sprite(); this.seat = seatTint(u.team);
    this.flash.blendMode = this.paintFlash.blendMode = 'add'; this.paintFlash.tint = this.seat;
    this.node.addChild(this.body, this.flash, this.paint, this.paintFlash); // (hit: each layer added onto itself, so paint brightens in its own color)
    // (an own walker: its silhouette, shown while a building hides it)
    if (u.team === G.me && !this.air) { this.xr = new Sprite(); this.xr.scale.set(UNIT_SCALE * unitK(u.type)); this.xr.visible = false; L.xray.addChild(this.xr); }
    this.size = (u.r > 12 ? 26 : 18) * UNIT_ART_SCALE * unitK(u.type); // (the selection ring round the feet: as large as the art)
    this.cargo = light(0xeee6d2, 0.14, 0.5); // (the gold a worker carries: pale, faint)
    this.id = u.id; this.px = u.x; this.py = u.y; this.walk = 0;
  }
  update(u, t, sel, dt) {
    const moved = Math.hypot(u.x - this.px, u.y - this.py); this.px = u.x; this.py = u.y;
    this.moveT = moved > 0.05 ? 0.25 : Math.max(0, (this.moveT || 0) - dt); this.moving = this.moveT > 0; // (on the move: held a moment, as frames between ticks see no step)
    if (moved > 0.05 || this.air) this.walk += dt * (this.fps ?? UNIT_FPS[u.type] ?? (this.air ? 14 : 8)); // rotors always spin
    // (a unit with poses: its march cycle, else the pose of its toggle: settling in or packing up, then on)
    const pose = UNIT_POSE[u.type], frames = pose ? pose.walk : this.frames;
    const f = pose && u.swap > 0 ? pose.swap : pose && u.mode ? pose.on : this.stand ? (this.moving ? 1 + Math.floor(this.walk) % frames : 0) : Math.floor(this.walk) % frames;
    const dir = ((Math.round(u.face / (Math.PI * 2) * FACINGS) % FACINGS) + FACINGS) % FACINGS;
    // (a melee unit in a fight: its strike poses, look.js strikePose, over the walk)
    const sp = strikePose(u) || this.newPose(u, t); this.pose = sp;
    const name = sp ? `${u.type}_${dir}_${sp}` : `${u.type}_${dir}_${this.loads && u.carry ? 'c' : ''}${f}`, tx = tex(name);
    const mx = tex(name + '_m'); setTex(this.body, tx); setTex(this.flash, tx); setTex(this.paint, mx); setTex(this.paintFlash, mx);
    const glide = UNIT_FPS[u.type] === 0, bob = this.air ? Math.sin(t * (glide ? 1.6 : 3) + u.id) * (glide ? 2 : 1.2) : 0; // (a glider rides a slower, deeper swell)
    // (sorted by its feet among the buildings, which sit half a px north of their bottom row: one standing on that line is
    // in front; units on one line apart by id)
    this.node.position.set(u.x, u.y + bob); this.node.zIndex = u.y + (u.id % 997) * 1e-5;
    this.work(u, t);
    if (this.xr) { setTex(this.xr, tx); this.xr.position.set(u.x, u.y); }
    this.flash.visible = this.paintFlash.visible = u.flash > 0; this.flash.alpha = this.paintFlash.alpha = 0.6;
    // (a toggle shows in its pose, UNIT_POSE: a deployed Cannon, a braced Guard)
    paintAs(this.body, this.paint, this.seat, 0xffffff, 1);
    if (sel.has(u)) selRing(u.x, u.y + 3, this.size * 0.84, this.size * 0.52, enemies(G.me, u.team) ? SEL_FOE : SEL); // (a little tighter than the art round the feet)
    this.cargo.visible = !!u.carry && !this.loads; // (a load drawn on its back needs no glint)
    if (u.carry) { this.cargo.tint = 0xeee6d2; this.cargo.position.set(u.x - Math.cos(u.face) * 7, u.y - Math.sin(u.face) * 7 - 11); this.cargo.alpha = 0.7 + 0.3 * Math.sin(t * 6); }
  }
  /** A pose only the new look's frames have (the constructor's lists), or null: set up or setting up; a builder at its
   *  site, the stroke 0.18 s from each strike; a shooter as its shot leaves (0.12 s), just after (to 0.3 s), and with
   *  its target in reach otherwise. `now`: the renderer's clock (s). */
  newPose(u, now) {
    const F = this.fires, cd = F && !u.inside && u.d?.weapon?.cd;
    if (cd && u.cd > cd - 0.12 && F.includes('shot')) return 'shot';
    if (cd && u.cd > cd - 0.3 && F.includes('after')) return 'after';
    if (this.sets && (u.swap > 0 || u.mode)) return 'set';
    if (this.works && this.strikes !== undefined) return now - (this.struckAt ?? -1) < 0.18 ? 'k1' : 'k0';
    return cd && F.includes('aim') && inReach(u) ? 'aim' : null;
  }
  /** A builder at work (construct.js WORK): standing in reach of its unfinished site, a strike every 0.55 s or so (its
   *  phase from its id): a pale glint and a little dust on a Kingdom wall, a welding spark on the Expedition's, a soft
   *  knock heard only on screen, and its body nudged towards the site for two frames. `now`: the renderer's clock (s). */
  work(u, now) {
    const b = u.task.t === 'build' ? u.task.b : null;
    if (!b || b.done || b.dead || this.moving || !atSite(u, b, TILE)) { this.strikes = undefined; this.nudge = 0; return; }
    const c = strikeCount(u.id, now);
    if (this.strikes !== undefined && c !== this.strikes) {
      const p = strikeAt(u, b); this.nudgeTo = p; this.nudge = WORK.nudgeFrames; this.struckAt = now;
      if (G.factions[u.team] === 'vael') { const f = STRIKE_FX.weld; addEffect(f.anim, p.x, p.y - f.lift, { life: f.life, scale: f.scale, tint: f.tint, fade: 1, light: f.light, lightScale: f.lightScale }); } // (the weld's core, at the contact point)
      else {
        const g = STRIKE_FX.glint, s = STRIKE_FX.dust;
        addEffect('glint', p.x, p.y - g.lift, { life: g.life, scale: g.scale, tint: g.tint, light: g.tint, lightScale: 0.1 });
        addEffect(HIT_DUST.anim, p.x, p.y + 1, { vx: -p.dx * s.drift, vy: s.vy, life: s.life, scale: s.scale, fade: s.fade, tint: HIT_DUST.tint });
      }
      if (nearView(p.x, p.y, 0)) sfx('knock', { x: p.x, y: p.y });
      this.strikesSeen = (this.strikesSeen || 0) + 1;
    }
    this.strikes = c;
    if (this.nudge > 0) { this.nudge--; this.node.x += this.nudgeTo.dx * WORK.nudge; this.node.y += this.nudgeTo.dy * WORK.nudge; }
  }
  show(v) { this.node.visible = v; if (!v) { this.cargo.visible = false; if (this.xr) this.xr.visible = false; } }
  destroy() { this.node.destroy({ children: true }); this.cargo.destroy(); this.xr?.destroy(); }
}

const stageTex = {};
/** Where a building's art begins and ends, in its full frame's rows (`base`: the building's name, its mask lined up by
 *  it): the reveal is measured on the art, not on the frame's empty room above the roof. */
function artSpan(base) { const r = artRows(base), at = frames[base]?.at.y || 0; return { top: r.top + at, bot: r.bot + at + 1 }; }
/** The bottom `k/stages` of a building texture `name` (the building's art or its mask, by the art of `base`), for the
 *  rising-from-the-ground construction reveal: the rows of it that fall in there, its bottom edge where the full
 *  sprite's is (the Kingdom's RAW.stages slices, the Expedition's GANTRY.rows). With `roof`, the rest instead: the rows
 *  above (the full frame, its anchor kept). */
function stage(name, k, base = name, roof = false, stages = RAW.stages) {
  const key = `${name}@${k}/${stages}${roof ? 'r' : ''}`; if (stageTex[key]) return stageTex[key];
  const tx = tex(name), fr = tx.frame, o = tx.orig, tr = tx.trim || new Rectangle(0, 0, o.width, o.height);
  const res = tx.source.resolution || 1, span = artSpan(base); // (the art's rows in the page's px, the texture's in world px)
  const top = Math.max(0, Math.min(o.height - 1, (span.bot - Math.round((span.bot - span.top) * k / stages)) / res));
  const none = (orig) => new Texture({ source: tx.source, frame: new Rectangle(fr.x, fr.y, 1, 1), orig, trim: new Rectangle(0, 0, 0, 0) }); // (no rows: nothing to draw)
  let t;
  if (roof) { // rows [tr.y, top) of the full frame
    const rows = Math.min(top, tr.y + tr.height) - tr.y;
    t = rows <= 0 ? none(new Rectangle(0, 0, o.width, o.height)) : new Texture({ source: tx.source, frame: new Rectangle(fr.x, fr.y, fr.width, rows), orig: new Rectangle(0, 0, o.width, o.height), trim: new Rectangle(tr.x, tr.y, tr.width, rows), label: `${name}@roof` });
    t.defaultAnchor = { ...tx.defaultAnchor };
  } else {
    const h = o.height - top, y0 = Math.max(tr.y, top), rows = tr.y + tr.height - y0;
    t = rows <= 0 ? none(new Rectangle(0, 0, o.width, h))
      : new Texture({ source: tx.source, frame: new Rectangle(fr.x, fr.y + y0 - tr.y, fr.width, rows), orig: new Rectangle(0, 0, o.width, h), trim: new Rectangle(tr.x, y0 - top, tr.width, rows), label: `${name}@${k}` });
    t.defaultAnchor = { x: tx.defaultAnchor.x, y: 1 }; // bottom-aligned: the footprint stays put while the rest rises
  }
  return stageTex[key] = t;
}
/** The Kingdom's raw site look (construct.js RAW), one filter for every unfinished body; a body coming into color has
 *  a filter of its own for the half second. */
const rawFilter = () => new ColorMatrixFilter({ resolution: 'inherit' }); // (at the screen's resolution: a filter's own default is 1)
const RAW_LOOK = rawFilter(); RAW_LOOK.matrix = rawMatrix(0);
/** The gray top of the new look's sites (construct.js REVEAL), one filter for them all. */
const GRAY_LOOK = rawFilter(); GRAY_LOOK.matrix = revealMatrix(0);
/** Set a sprite's visibility only when it changes (each change rebuilds its layer's draw list). */
const vis = (s, v) => { if (s && s.visible !== v) s.visible = v; };

class BldgObj {
  constructor(b) {
    const n = b.w;
    // (worn dirt under it, from its site to its ruin: trodden earth over the footprint and a little beyond, the grass
    // showing through, no paths)
    this.worn = new Sprite(); setTex(this.worn, tex(`worn_${n}`)); L.worn.addChild(this.worn);
    this.found = new Sprite(); setTex(this.found, tex(`foundation_${n}`)); L.found.addChild(this.found);
    [this.body, this.paint] = teamSprite(L.ents); this.seat = seatTint(b.team); this.name = `bldg_${b.type}`;
    // (the frame round a rising body: the Kingdom's timber scaffold, `scaffold_n`, its cloth and flags in the seat's
    // color; the Expedition's printer gantry, `gantry_n`, its pennants in the seat's color, and the gantry's head,
    // `gantrybar_n`, set on the solid's top between its masts; the foundation is the Kingdom's)
    this.ex = G.factions[b.team] === 'vael';
    [this.scaffold, this.scaffoldPaint] = teamSprite(L.ents); const sn = `${this.ex ? 'gantry' : 'scaffold'}_${n}`;
    setTex(this.scaffold, tex(sn)); setTex(this.scaffoldPaint, tex(sn + '_m')); paintAs(this.scaffold, this.scaffoldPaint, this.seat);
    this.full = tex(this.name); this.fullPaint = tex(this.name + '_m'); setTex(this.body, this.full); setTex(this.paint, this.fullPaint);
    // (the missing top, the Kingdom's roof slice or the Expedition's top tenth: fading in on the done moment)
    this.look = bldgLook(b.type);
    this.base = Array.isArray(this.look.base) ? this.look.base : null; // (the new look's outline on the ground: its site is construct.js REVEAL, with no scaffold or gantry)
    this.roof = new Sprite(); this.roof.visible = false; L.ents.addChild(this.roof);
    if (this.ex) { // the Expedition's ghost of the whole, under the solid (seen only above it), and the gantry's head
      this.ghost = new Sprite(); this.ghost.visible = false; this.ghost.tint = GHOST.tint; L.ents.addChild(this.ghost);
      this.bar = new Sprite(); setTex(this.bar, tex(`gantrybar_${n}`)); this.bar.visible = false; L.ents.addChild(this.bar);
    }
    if (this.look.head) [this.head, this.headPaint] = teamSprite(L.ents);
    const glow = this.look.glow;
    this.glow = glow ? light(glow[0], glow[1], glow[2]) : null;
    this.smokeT = 0; this.type = b.type; this.id = b.id; this.x = b.x; this.y = b.y; this.b = b; this.live = false;
    // The done moment (construct.js DONE): only for a site this side watched finish, live and on screen (`seenAt`: the
    // last frame it was drawn in, `frameNo`); a building already standing when first drawn never plays it.
    this.wasDone = b.done; this.seenAt = -Infinity; this.doneT = null;
    for (const s of [this.worn, this.found, this.body, this.paint, this.scaffold, this.scaffoldPaint, this.roof, this.ghost, this.bar]) s?.position.set(b.x, b.y);
    // (sorted with the units by its bottom row, half a px north of it, so a unit whose feet are on that line or south of
    // it stands in front; buildings in one row apart by id, each one's paint, scaffold and head just over its own body)
    // (the new look's, drawn corner-on, by the line through its side corners, `look.z` px south of its middle: a unit
    // beside its nearer half stands before the wall that recedes from it)
    const z = (this.look.z === undefined ? (b.ty + b.h) * TILE : b.y + this.look.z) - 0.5 + (b.id % 97) * 0.002; this.z = z;
    this.body.zIndex = z; this.paint.zIndex = z + 0.0002; this.scaffold.zIndex = z + 0.0004; this.scaffoldPaint.zIndex = z + 0.0005; this.roof.zIndex = z + 0.0001;
    if (this.ex) { this.ghost.zIndex = z - 0.0001; this.bar.zIndex = z + 0.0006; } // (the ghost under the body: the solid covers its share of it)
    if (this.head) { this.head.zIndex = z + 0.0006; this.headPaint.zIndex = z + 0.0008; }
  }
  /** `live`: the player can see it right now (otherwise it is a remembered silhouette: no smoke, no aiming, no done
   *  moment). `now`: the renderer's clock (s). */
  update(b, t, dt, live, now = performance.now() / 1000) {
    this.b = b; this.live = live; // (what a fall reads: look.js bldgDeath)
    if (b.done && !this.wasDone) this.doneT = live && this.seenAt === frameNo - 1 ? 0 : null; // (it stood while we watched: its done moment)
    this.wasDone = b.done; this.seenAt = frameNo;
    if (this.doneT !== null) { this.doneT += dt; if (this.doneT >= DONE.life) this.endFade(); }
    const fading = this.doneT !== null, d = fading ? doneAt(this.doneT, this.ex) : null;
    const name = this.name, site = !b.done;
    const flashA = b.flash > 0 ? 0.75 : 1; // (hit flash)
    vis(this.found, (site || fading) && !this.ex && !this.base);
    vis(this.scaffold, (site || fading) && !this.base); vis(this.scaffoldPaint, this.scaffold.visible);
    if (this.base && (site || fading)) this.reveal(b, site, d, flashA);
    else if (site || fading) { // the body rising from the ground: the bottom k/stages of the art, its bottom edge where the full sprite's would be
      // (the Kingdom's: at most 7 of 8 slices, raw and unpainted until done, construct.js RAW; the Expedition's: at
      // most 90% of 64, in full color, under its ghost, the gantry's head on its top, construct.js GANTRY)
      const stages = this.ex ? GANTRY.rows : RAW.stages, cap = this.ex ? Math.round(GANTRY.rows * GANTRY.cap) : RAW.cap;
      const k = !site ? cap : this.ex ? solidRows(b.progress) : rawStage(b.progress);
      setTex(this.body, stage(name, k, name, false, stages)); setTex(this.paint, this.fullPaint);
      this.body.y = b.y + (1 - this.full.defaultAnchor.y) * this.full.height; this.paint.y = b.y;
      this.body.tint = 0xffffff; this.body.alpha = flashA;
      if (site) { vis(this.paint, false); vis(this.roof, false); }
      else {
        vis(this.paint, true); this.paint.tint = this.seat; this.paint.alpha = d.color * flashA;
        if (!this.roofSet) { this.roofSet = true; setTex(this.roof, stage(name, cap, name, true, stages)); }
        vis(this.roof, this.body.visible); this.roof.alpha = d.roof * flashA;
      }
      if (this.ex) {
        if (this.body.filters) this.body.filters = null;
        vis(this.ghost, this.body.visible); setTex(this.ghost, this.full); this.ghost.alpha = ghostAlpha(live ? now : 0) * (fading ? d.strip : 1); // (a remembered ghost holds still)
        // (the head on the solid's top row, where its frame carries it: between the front masts, then on the rails;
        // to the art's own px, half a world px, so it stays as sharp as the masts it runs on)
        const at = headAt(b.w, this.body.y - this.body.height + GANTRY.barDrop - b.y);
        vis(this.bar, this.body.visible); this.bar.position.set(b.x + Math.round(at.x * 2) / 2, b.y + Math.round(at.y * 2) / 2); this.bar.alpha = fading ? d.strip : 1;
      } else if (site) { if (this.body.filters?.[0] !== RAW_LOOK) this.body.filters = [RAW_LOOK]; }
      else {
        if (!this.fadeLook) { this.fadeLook = rawFilter(); this.body.filters = [this.fadeLook]; this.roof.filters = [this.fadeLook]; }
        this.fadeLook.matrix = rawMatrix(d.color);
        if (!this.puffed && this.doneT >= DONE.puffAt) { this.puffed = true; for (const p of donePuffs(b, TILE)) addEffect(HIT_DUST.anim, p.x, p.y, { vy: DONE_PUFF.vy, life: DONE_PUFF.life, scale: DONE_PUFF.scale, fade: DONE_PUFF.fade, tint: HIT_DUST.tint }); }
      }
      this.scaffold.alpha = this.scaffoldPaint.alpha = fading ? d.strip : 1;
    } else { if (this.frames) this.endFade(); if (this.body.filters) this.body.filters = null; setTex(this.body, this.full); setTex(this.paint, this.fullPaint); this.body.y = this.paint.y = b.y; vis(this.paint, this.body.visible); paintAs(this.body, this.paint, this.seat, 0xffffff, flashA); }
    this.found.alpha = fading ? d.strip : 1;
    if (this.head) {
      // A turret's head only while seen live (it aims); a rotor or a dish stays on its remembered base, still. The
      // rotors turn on the renderer's clock (cosmetic), each from its own phase. The Portal's swirl turns slowly, settled
      // and faint, and brightens and speeds up each time a unit comes through (look.js portalOpen), then settles again.
      const turns = this.look.spin || this.look.pan;
      let open = 0, shown = 1;
      if (this.look.portal) {
        open = live ? portalOpen(this.portal ||= {}, b, now) : 0;
        this.spinT = (this.spinT || 0) + dt * (0.3 + 0.7 * open); // (the swirl winds up with it)
        shown = PORTAL_SETTLED + (1 - PORTAL_SETTLED) * open;
      }
      vis(this.head, b.done && (live || !!turns)); vis(this.headPaint, this.head.visible);
      const dir = turns && !live ? 0 : this.look.portal ? Math.floor(this.spinT * this.look.spin) % 16 : headFrame(this.look, b.aim, now, (b.id % 13) * 0.37), hn = `${this.look.head}_${dir}`;
      setTex(this.head, tex(hn)); setTex(this.headPaint, tex(hn + '_m')); this.head.position.set(b.x, b.y); this.headPaint.position.set(b.x, b.y);
      paintAs(this.head, this.headPaint, this.seat, 0xffffff, flashA * shown * (fading ? d.heads : 1));
      this.openNow = open;
    }
    if (this.glow) {
      const g = this.look.glow; vis(this.glow, b.done); this.glow.position.set(b.x + (g[5] || 0), b.y - g[3]);
      this.glow.alpha = g[4] ? 0.3 + 0.15 * Math.sin(t * 9) : 0.35 + 0.12 * Math.sin(t * 2.5); if (this.look.portal) this.glow.alpha = (this.openNow || 0) * g[2];
      if (fading) this.glow.alpha *= d.glow; // (it lights up with the done moment)
    }
    // Damage: smoke below half health, fire below a quarter.
    const f = b.hp / b.maxhp;
    if (live && b.done && f < 0.5) { this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = f < 0.25 ? 0.12 : 0.3; const x = b.tx * TILE + 8 + Math.random() * (b.w * TILE - 16), y = b.ty * TILE + 8 + Math.random() * (b.h * TILE - 16); addEffect('puff', x, y, { vy: -18, life: 1.2 }); if (f < 0.25 && Math.random() < BURN_FLASH.chance) addEffect('flash', x, y + 4, { life: 0.25, light: BURN_FLASH.light, lightScale: BURN_FLASH.lightScale }); } } // (look.js BURN_FLASH: now and then, not a strobe)
    const sm = this.look.smoke; // chimneys: only while the building works (look.js chimneyActive)
    if (live && sm && chimneyActive(b) && Math.random() < dt * 2.5) { const [sx, sy] = sm[Math.floor(Math.random() * sm.length)]; addEffect('puff', b.tx * TILE + sx, b.ty * TILE + sy, { vy: -22, life: 1.5 }); }
  }
  /** The new look's site, and its done moment (`d`: doneAt's shares): construct.js REVEAL. */
  reveal(b, site, d, flashA) {
    const name = this.name, k = site ? revealRows(b.progress) : Math.round(REVEAL.rows * REVEAL.cap), y = b.y + (1 - this.full.defaultAnchor.y) * this.full.height;
    setTex(this.body, stage(name, k, name, false, REVEAL.rows)); setTex(this.roof, stage(name, k, name, true, REVEAL.rows));
    setTex(this.paint, stage(name + '_m', k, name, false, REVEAL.rows));
    this.body.y = this.paint.y = y; vis(this.paint, this.body.visible); paintAs(this.body, this.paint, this.seat, 0xffffff, flashA);
    vis(this.roof, this.body.visible);
    if (site) { if (this.roof.filters?.[0] !== GRAY_LOOK) this.roof.filters = [GRAY_LOOK]; this.roof.alpha = REVEAL.alpha * flashA; }
    else { // (the gray top comes into color, its paint with it)
      if (!this.fadeLook) { this.fadeLook = rawFilter(); this.roof.filters = [this.fadeLook]; }
      this.fadeLook.matrix = revealMatrix(d.color); this.roof.alpha = (REVEAL.alpha + (1 - REVEAL.alpha) * d.roof) * flashA;
      setTex(this.scaffoldPaint, stage(name + '_m', k, name, true, REVEAL.rows)); vis(this.scaffoldPaint, this.body.visible); this.scaffoldPaint.tint = this.seat; this.scaffoldPaint.alpha = d.color * flashA;
      if (!this.puffed && !this.ex && this.doneT >= DONE.puffAt) { this.puffed = true; for (const p of donePuffs(b, TILE)) addEffect(HIT_DUST.anim, p.x, p.y, { vy: DONE_PUFF.vy, life: DONE_PUFF.life, scale: DONE_PUFF.scale, fade: DONE_PUFF.fade, tint: HIT_DUST.tint }); }
    }
    if (!this.frames) this.frames = this.ex ? [this.makeSlab(b)] : this.makeFrames(b);
    for (const g of this.frames) { vis(g, this.body.visible); g.alpha = site ? 1 : d.strip; }
  }
  /** The Expedition's slab under a new-look site (construct.js REVEAL): with the foundations, flat under everything. */
  makeSlab(b) {
    const { h, top, side, seam, edge, bar } = REVEAL.ex, pts = slabOf(this.base, b.w), { front } = frameOf(pts), g = new Graphics(), flat = (l) => l.flat();
    const path = (l, style) => { l.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.stroke({ cap: 'round', join: 'round', ...style }); };
    g.poly(flat(pts.map(([x, y]) => [x + 4, y + h + 2]))).fill({ color: 0x0c1a2a, alpha: 0.35 }); // (its shadow, to the lower right)
    g.poly(flat([...front, ...front.map(([x, y]) => [x, y + h]).reverse()])).fill(side).stroke({ width: 1, color: edge });
    g.poly(flat(pts)).fill(top).stroke({ width: 1.2, color: edge });
    if (pts.length <= 6) { const c = (i, t) => { const p = pts[i % pts.length], q = pts[(i + 1) % pts.length]; return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; }; for (const t of [1 / 3, 2 / 3]) { path([c(0, t), c(2, 1 - t)], { width: 1, color: seam }); path([c(1, t), c(3, 1 - t)], { width: 1, color: seam }); } }
    for (const [width, color] of [[bar + 1.4, 0x10161e], [bar, this.seat]]) for (const m of slabMarks(pts)) path(m, { width, color });
    g.position.set(b.x, b.y); L.found.addChild(g);
    return g;
  }
  /** The timber frame round a Kingdom new-look site's foot: its back half under the body, its front half over it. */
  makeFrames(b) {
    const { front, back, sides } = frameOf(this.base), { color, edge } = REVEAL.kg, H = REVEAL.post, up = (p, h) => [p[0], p[1] - h];
    const line = (g, pts, width, c) => { pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.stroke({ width, color: c, cap: 'round', join: 'round' }); };
    const half = (pts, posts, z, flags) => {
      const g = new Graphics(); g.position.set(b.x, b.y); g.zIndex = z; L.ents.addChild(g);
      for (const [w, c] of [[3.4, edge], [2, color]]) { line(g, pts, w, c); line(g, pts.map(p => up(p, REVEAL.rail)), w - 0.6, c); for (const p of posts) line(g, [p, up(p, H)], w + 0.4, c); }
      if (flags) for (const p of sides) g.poly([p[0], p[1] - H - 7, p[0] + 9, p[1] - H - 4, p[0], p[1] - H - 1]).fill(this.seat).stroke({ width: 0.6, color: 0x10161e }).moveTo(p[0], p[1] - H).lineTo(p[0], p[1] - H - 8).stroke({ width: 1.2, color: edge });
      return g;
    };
    const corners = (pts) => (pts.length > 4 ? pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1) : pts); // (a round outline: every third point)
    return [half(back, corners(back).slice(1, -1), this.z - 0.0002, false), half(front, corners(front), this.z + 0.0007, true)];
  }
  /** The done moment is over: full color, no filter, nothing of the site left (the next update draws it standing). */
  endFade() {
    this.doneT = null;
    if (this.fadeLook) { this.body.filters = null; this.roof.filters = null; this.fadeLook.destroy(); this.fadeLook = null; }
    for (const s of [this.roof, this.found, this.scaffold, this.scaffoldPaint, this.ghost, this.bar]) vis(s, false);
    this.dropFrames();
  }
  dropFrames() { for (const g of this.frames || []) g.destroy(); this.frames = null; }
  /** Shown or not (update, after this, decides the parts of a shown one). Visibility is only ever set to what it should
   *  be, never on and off again in one frame: each change rebuilds the layer's draw list. */
  show(v) { vis(this.body, v); vis(this.worn, v); if (!v) { for (const s of [this.paint, this.found, this.scaffold, this.scaffoldPaint, this.roof, this.ghost, this.bar, this.head, this.headPaint, this.glow, ...(this.frames || [])]) vis(s, false); } }
  destroy() { this.dropFrames(); this.fadeLook?.destroy(); for (const s of [this.worn, this.found, this.body, this.paint, this.scaffold, this.scaffoldPaint, this.roof, this.ghost, this.bar, this.head, this.headPaint, this.glow, this.fallFlash]) if (s) s.destroy(); }
  /** It fell (look.js bldgDeath, `plan`): from now on a ghost, out of the pool, until `plan.life` s have passed. */
  fall(plan) {
    this.found.visible = false; this.dropFrames();
    const parts = [this.body, this.paint, this.roof, this.scaffold, this.scaffoldPaint, this.head, this.headPaint].filter(s => s?.visible);
    this.dying = { t: 0, plan, parts, y0: parts.map(s => s.y), paints: new Set([this.paint, this.scaffoldPaint, this.headPaint]) }; // (the team paint dims with it, in its seat's color)
    if (plan.portal && this.body.visible) { // (the Portal's cyan flash layer, added over its body)
      const f = this.fallFlash = new Sprite(this.body.texture); f.anchor.copyFrom(this.body.anchor); f.position.copyFrom(this.body.position);
      f.blendMode = 'add'; f.tint = BLDG_DEATH.portal.flash.tint; f.alpha = 0; f.zIndex = this.z + 0.0003; L.ents.addChild(f); parts.push(f); this.dying.y0.push(f.y);
    }
  }
  /** One frame of its fall, `dt` s on: false once it is over. */
  falling(dt) {
    const d = this.dying; d.t += dt;
    if (d.t >= d.plan.life) return false;
    if (d.plan.portal) {
      const g = portalGhost(d.t);
      for (const s of d.parts) { s.scale.x = g.scaleX; s.alpha = g.alpha; }
      if (this.fallFlash) this.fallFlash.alpha = g.flash;
      if (this.glow && this.body.visible) { this.glow.visible = true; this.glow.scale.set(g.glow); this.glow.alpha = this.look.glow[2]; this.glow.tint = BLDG_DEATH.portal.glow.tint; }
    } else {
      const g = ghostAt(d.t);
      d.parts.forEach((s, i) => { s.y = d.y0[i] + g.dy; s.scale.y = g.scaleY; s.alpha = g.alpha; s.tint = d.paints.has(s) ? mulTint(this.seat, g.tint) : g.tint; });
      if (this.glow) this.glow.visible = false;
    }
    return true;
  }
}

// ---- gold mines: one per field (crates/endfall-sim/src/map.rs `lay_mines`), neutral, drawn by what is left ----
/** Below this share of what it held, a mine shows its `low` frame; with nothing left, `empty` (boarded up). */
const MINE_LOW_SHARE = 0.25;
export const mineStage = (n) => n.amount <= 0 ? 'empty' : n.amount < MINE_LOW_SHARE * n.max ? 'low' : 'full';
class NodeObj {
  constructor(n) {
    // (with the buildings and units, sorted by its bottom row as a building is: a worker north of it stands behind it)
    this.s = new Sprite(); this.s.position.set(n.x, n.y); this.s.zIndex = (n.ty + n.h) * TILE - 0.5 + (n.id % 97) * 0.002; L.ents.addChild(this.s);
    const big = land ? GROUND.mine : 1; if (big !== 1) this.s.scale.set(big); // (the new look's mine: drawn larger, to cover its tiles)
    // Its door lamp, lit while anyone is inside (the arc's UPDATE 6: a mine being worked, at a glance), only where we
    // see it now: the fog shows a mine as it was, so a lamp there would tell what we cannot see.
    this.lamp = new Graphics().circle(0, 0, 5).fill({ color: 0xffc35a, alpha: 0.35 }).circle(0, 0, 2.4).fill({ color: 0xffe7a8, alpha: 0.95 });
    const at = newArt.land?.mine?.lamp; // (the new look's mine: its door's lintel, measured by its builder)
    this.lamp.position.set(n.x + (at ? at[0] * big : 9), n.y + (at ? at[1] * big : n.h * TILE / 2 - 18)); this.lamp.zIndex = this.s.zIndex + 0.001; this.lamp.visible = false; L.ents.addChild(this.lamp);
  }
  update(n) { setTex(this.s, tex(`mine_${mineStage(n)}`)); this.lamp.visible = this.s.visible && n.miners > 0 && !!G.vis[idx(n.tx, n.ty)]; }
  show(v) { if (this.s.visible !== v) this.s.visible = v; if (!v) this.lamp.visible = false; }
  destroy() { this.s.destroy(); this.lamp.destroy(); }
}

function syncPool(pool, list, make, upd) {
  const seen = new Set();
  for (const e of list) { seen.add(e.id); let o = pool.get(e.id); if (!o) pool.set(e.id, o = make(e)); upd(o, e); }
  for (const [id, o] of pool) if (!seen.has(id)) { o.destroy(); pool.delete(id); }
}
/** Fallen buildings still shown as ghosts, out of the pool (BldgObj.fall), effects waiting their time in a fall (look.js
 *  bldgDeath: `t` counts up to 0) and a fall's lights alone (the Portal's blink). */
const dying = [], pending = [], blinks = [];

// ---- effects ----
const effects = [];
/** Spawn a one-shot animated effect; anim names come from atlas.json (boom_big, boom_small, puff, flash, spark).
 *  `fade`: its opacity at the start, falling to nothing over its life (a trail's puffs overlap into one soft streak). */
export function addEffect(anim, x, y, o = {}) {
  const frames = sheet.animations[anim]; if (!frames || !nearView(x, y)) return;
  const s = new Sprite(frames[0]); s.anchor.set(...(o.anchor ?? [0.5, 0.5])); // (`anchor`: a muzzle's cone from its base)
  s.position.set(x, y); if (o.rot) s.rotation = o.rot; if (o.scale) s.scale.set(o.scale); if (o.tint) s.tint = o.tint;
  if (o.fade) s.alpha = o.fade;
  L.fx.addChild(s);
  const e = { s, frames, anim, x, y, t: 0, life: o.life || frames.length * 0.07, vx: o.vx || 0, vy: o.vy || 0, fade: o.fade || 0 };
  if (o.light) { e.l = light(o.light, o.lightScale || 1, 0.8); e.l.position.set(x, y); }
  effects.push(e);
}
/** The effects alive now, each with its animation, where it was spawned (world px) and its sprite as drawn (where it
 *  is now, its scale and tint): read-only, for the tests. */
export const effectsShown = () => effects.map(e => ({ anim: e.anim, x: e.x, y: e.y, sx: e.s.x, sy: e.s.y, scale: e.s.scale.x, tint: e.s.tint }));
/** Where a death at ground point (x, y) plays, its y: a flyer that is no machine (the Balloon) up where it flew
 *  (look.js AIR_PUFF `lift` of its drawn height), anything else on the ground. */
export const deathY = (y, unit) => (unit && deathOf(unit, UNITS[unit]?.air) === 'air' ? y - unitTop(unit) * AIR_PUFF.lift : y);
/** A unit or building died (`unit`: the unit's kind, null for a building; look.js deathOf). A fighter falls into a puff
 *  of earth-colored dust, a flyer that is no machine (the Balloon) into a puff of canvas up where it flew, sinking (no
 *  fire, no light, no scorch for either); a machine explodes, sized to it, with sparks and a scorch mark; a building
 *  collapses (`collapse`: no fire), into rubble of its people's (`race`). */
export function boom(x, y, r, race, unit = null) {
  const how = deathOf(unit, unit && UNITS[unit]?.air);
  if (how === 'air') { const { anim, tint, scale, life, vy, fade } = AIR_PUFF; addEffect(anim, x, deathY(y, unit), { vy, life, scale, tint, fade }); return; }
  if (how === 'dust') { const { anim, tint, scale, life, vy, fade, dy } = DEATH_DUST; addEffect(anim, x, y + dy, { vy, life, scale, tint, fade }); return; }
  if (how === 'collapse') { collapse(x, y, r, race); return; }
  addEffect('boom_small', x, y, { light: 0xff9a3a, lightScale: 0.7, life: 0.4, scale: 1 }); // (a machine: the only death with fire, with the shells')
  for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28, v = 40 + Math.random() * 90; addEffect('spark', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.3 }); }
  const scorch = new Sprite(tex('light')); scorch.anchor.set(0.5); scorch.tint = 0x000000; scorch.alpha = 0.45; scorch.scale.set(r / 24); scorch.position.set(x, y + 2); L.decals.addChild(scorch);
  decals.push({ s: scorch, t: 0, life: 25 });
}
/** A building fell at (x, y) (radius r, its people `race`): it collapses (look.js bldgDeath), its sprite a ghost a moment
 *  longer if it was drawn live (the pool's object at that spot), its rubble on the ground. */
function collapse(x, y, r, race) {
  let o = null;
  for (const c of bldgObjs.values()) if (c.live && Math.abs(c.x - x) < 1 && Math.abs(c.y - y) < 1) { o = c; break; }
  const n = Math.round(2 * r / TILE), b = o?.b ?? { x, y, r, tx: Math.round(x / TILE - n / 2), ty: Math.round(y / TILE - n / 2), w: n, h: n, type: '' };
  const plan = bldgDeath(b, race, { hq: !!BUILDINGS[b.type]?.hq, roof: o?.body.visible ? rectOf(o.body)[1] + 8 : y - r, core: o?.glow ? { x: o.glow.x, y: o.glow.y } : { x, y } });
  if (plan.shake && nearView(x, y, 0)) quake = { ...plan.shake, t: 0 };
  const rubble = { rubble: `${race === 'vael' ? 'rubble_vael' : 'rubble'}_${Math.min(4, Math.max(2, Math.round(r / 16)))}`, x, y, look: plan.rubble };
  for (const s of [...plan.steps, { at: plan.rubbleAt, ...rubble }]) if (s.at > 0) pending.push({ t: -s.at, s }); else fallStep(s);
  if (o) { o.fall(plan); bldgObjs.delete(o.id); dying.push(o); } // (out of the pool at once, a ghost a moment longer)
}
/** One step of a fall (look.js bldgDeath): an effect, a light alone or its rubble. */
function fallStep(s) {
  if (s.rubble) {
    const rub = new Sprite(); setTex(rub, tex(s.rubble)); rub.position.set(s.x, s.y); if (s.look?.tint) rub.tint = s.look.tint; L.decals.addChild(rub); decals.push({ s: rub, t: 0, life: 40 });
    for (const [gx, gy] of s.look?.glow ?? []) { // (a cyan glow left on a chunk or two: the Portal's)
      const g = new Sprite(tex('light')); g.anchor.set(0.5); g.tint = 0x3fe0ff; g.alpha = 0.35; g.blendMode = 'add'; g.scale.set(0.18); g.position.set(gx, gy); L.decals.addChild(g); decals.push({ s: g, t: 0, life: 40 });
    }
  }
  else if (s.blink) { if (nearView(s.x, s.y)) { const l = light(s.blink.tint, s.blink.scale, 0.9); l.position.set(s.x, s.y); blinks.push({ l, t: 0, ...s.blink }); } }
  else addEffect(s.anim, s.x, s.y, s.o);
}
/** The ghosts of fallen buildings now (read-only, for the tests): each one's id, type, time since it fell, whether it
 *  falls as the Portal does, and its body as drawn (y, scale, opacity) with the y it fell from. */
export const dyingShown = () => dying.map(o => ({ id: o.id, type: o.type, t: o.dying.t, portal: o.dying.plan.portal, y: o.body.y, y0: o.dying.y0[0], scaleX: o.body.scale.x, scaleY: o.body.scale.y, alpha: o.body.alpha, paint: o.paint.visible ? o.paint.alpha : null, tint: o.body.tint, shown: o.body.visible, flash: o.fallFlash?.alpha ?? 0 }));
/** A fall's shake now: its reach (± px; look.js fallShake), dying away (read-only, for the tests). */
export const shakeNow = () => (quake ? quake.px * Math.max(0, 1 - quake.t / quake.life) : 0);
/** A Medic heals: a green sparkle on the patient and a faint light. */
const CAST_TINT = { deploy: 0xf5c542 };
/** An ability used: a flash on the caster in its color. */
export function castFx(x, y, ability) {
  const tint = CAST_TINT[ability] ?? 0xffffff;
  addEffect('flash', x, y - 6, { life: 0.35, tint, light: tint, lightScale: 0.4 });
}
/** A Medic's heal (green) or a Halo's mend (the pale aqua of the Halo's own light, not the violet of crystals and
 *  weapons) landing on its patient. */
export function healFx(x, y, tx, ty, mend = false) { addEffect('heal', tx, ty - 6, { life: 0.4, light: mend ? 0x7ce8d4 : 0x6dff9a, lightScale: 0.35, tint: mend ? 0xc0fff2 : 0xffffff }); void x; void y; }
/** A Cannon fires: a puff of smoke at its muzzle, out ahead of it (`face`, radians) and a little up, blown forward. */
export function muzzleFx(x, y, face, size = 1) {
  const mx = x + Math.cos(face) * 14, my = y + Math.sin(face) * 9 - 10;
  addEffect('puff', mx, my, { vx: Math.cos(face) * 30, vy: Math.sin(face) * 20 - 12, life: 0.9, scale: size, fade: 0.9 });
  addEffect('flash', mx, my, { life: 0.12, light: 0xffc070, lightScale: 0.5, scale: 0.6 });
}
/** A rifle's flash at its mouth, a pale cone turned along the aim (look.js MUZZLE_FLASH: `fwd` px ahead of the ground point (x, y) along `face`,
 *  radians, the ground's depth as the camera sees it, and `up` px above it), brief, with a warm light. */
export function muzzleFlash(x, y, face, { fwd, up, scale }) {
  addEffect('muzzle', x + Math.cos(face) * fwd, y + Math.sin(face) * fwd - up, { rot: face, anchor: [0.07, 0.5], life: 0.08, tint: 0xfff2cc, light: 0xffe8b0, lightScale: 0.25, scale });
}
/** A melee blow lands on `t`: a glint of steel on it, at the point of it nearest the striker `u` (a unit's body half way up
 *  its drawn height, a building's nearest wall), and with `puff` (look.js MELEE_PUFF) dust kicked up at its feet.
 *  Returns the glint's point and `feet`, the dust's. */
export function meleeHit(u, t, puff) {
  let x = t.x, y = t.y;
  if (t.kind === 'bldg') { x = Math.min(Math.max(u.x, t.tx * TILE + 4), (t.tx + t.w) * TILE - 4); y = Math.min(Math.max(u.y, t.ty * TILE + 4), (t.ty + t.h) * TILE - 4); }
  const lift = t.kind === 'bldg' ? 10 : unitTop(t.type) * WALKER_HIT_LIFT, dx = u.x - x, dy = u.y - y, d = Math.hypot(dx, dy) || 1, k = t.kind === 'bldg' ? 0 : Math.min(t.r * 0.6, d);
  addEffect('glint', x + dx / d * k, y + dy / d * k - lift, { life: 0.15, light: 0xfff6e0, lightScale: 0.12 }); // (steel's glint: small and pale; fire is the gunpowder's)
  if (puff) addEffect(HIT_DUST.anim, x + dx / d * k, y + 2, { vx: -dx / d * puff.drift, vy: -6, life: puff.life, scale: puff.scale, fade: puff.fade, tint: HIT_DUST.tint });
  return { x: x + dx / d * k, y: y + dy / d * k - lift, feet: { x: x + dx / d * k, y: y + 2 } };
}
/** Where a shot that lands at ground point (x, y) plays, its y: on a flyer (`air`, its kind: a `hit` event's) up on its
 *  body (look.js hitLift of its drawn height: by its kind), on a walker (`walker`, its kind) half way up its body
 *  (look.js WALKER_HIT_LIFT), anything else (a building, a spot) where it is. */
export const hitY = (y, air, walker = null) => (air ? y - unitTop(air) * hitLift(air) : walker ? y - unitTop(walker) * WALKER_HIT_LIFT : y);
/** A shot lands at (x, y), its look by `how` (look.js impactOf): steel's glint (an arrow, a bolt, a tracer: cool,
 *  HIT_STEEL, never a muzzle flash's warmth), the cannonball's and the rocket's burst, or a repairer's welding spark. */
export function impactFx(x, y, how) {
  if (how === 'glint') addEffect('glint', x, y, { life: 0.15, tint: HIT_STEEL, light: HIT_STEEL, lightScale: 0.12 });
  else if (how === 'shell' || how === 'rocket') addEffect('boom_small', x, y, { light: 0xffb545, lightScale: 0.5, life: 0.35, scale: how === 'shell' ? 0.7 : 0.6 });
  else addEffect('spark', x, y, { life: 0.18, light: 0xfff4c2, lightScale: 0.3 }); // (welding)
}
/** A hit of tier `tier` lands at (x, y) (look.js hitTier, HIT_LOOK), over or in place of its own look `how` (look.js
 *  impactOf; null: a melee blow, whose glint and dust meleeHit drew): 'light' as ever, 'medium' with a round flash,
 *  'heavy' a bright blow with chips of steel, 'siege' a blast with sparks of fire; every flash and chip but the siege
 *  blast's in steel's cool (HIT_LOOK `light`). `melee`: the heavy blow's scuff of dust round the target's feet (`feet`:
 *  its ground point). */
export function tierHit(x, y, tier, how, melee = false, feet = null) {
  const look = HIT_LOOK[tier];
  if (!look?.hit) { if (how) impactFx(x, y, how); if (look?.flash) addEffect('flash', x, y - 2, { life: 0.16, scale: look.flash, tint: look.light, light: look.light, lightScale: look.lightScale }); return; }
  if (!nearView(x, y)) return;
  const k = look.size;
  if (look.hit === 'blast') addEffect('boom_small', x, y, { light: look.light, lightScale: 1.3 * k, life: 0.45, scale: 1.1 * k });
  addEffect('flash', x, y - 4, { life: 0.16, light: look.light, lightScale: 0.6 * k * look.flashK, scale: 0.9 * k * look.flashK, tint: look.light });
  const c = look.chip, tint = c.anim === 'glint' ? look.light : 0xffffff;
  for (let i = 0; i < 3; i++) { const a = Math.random() * 6.28, v = 50 + Math.random() * 70; addEffect(c.anim, x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: (0.25 + Math.random() * 0.2) * c.life, scale: c.scale, tint }); }
  const sc = look.scuff;
  if (melee && sc && feet) for (let i = 0; i < sc.n; i++) { // (a ring of dust kicked out round its feet, flat as the ground)
    const a = (i + Math.random() * 0.5) / sc.n * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a) * 0.5;
    addEffect(HIT_DUST.anim, feet.x + cx * sc.r, feet.y + cy * sc.r, { vx: cx * sc.speed, vy: cy * sc.speed, life: sc.life, scale: sc.scale, fade: 0.8, tint: HIT_DUST.tint });
  }
}
/** A ranged weapon of tier `tier` fires from ground point (x, y) aiming along `face` (radians): for a heavy or siege
 *  one, a big round flash at its gun's mouth (`at`: look.js MUZZLE_FLASH's spot, else MUZZLE_AT), with a light. */
export function tierMuzzle(x, y, face, tier, at = MUZZLE_AT) {
  const look = HIT_LOOK[tier]; if (!look?.muzzle) return;
  addEffect('flash', x + Math.cos(face) * at.fwd, y + Math.sin(face) * at.fwd - at.up, { life: 0.14, light: look.muzzleLight, lightScale: 0.8 * look.muzzle, scale: look.muzzle });
}
const decals = [];

function updateEffects(dt) {
  for (let i = pending.length - 1; i >= 0; i--) { const p = pending[i]; p.t += dt; if (p.t >= 0) { pending.splice(i, 1); fallStep(p.s); } }
  for (let i = dying.length - 1; i >= 0; i--) if (!dying[i].falling(dt)) { dying[i].destroy(); dying.splice(i, 1); }
  for (let i = blinks.length - 1; i >= 0; i--) { const k = blinks[i]; k.t += dt; if (k.t >= k.life) { k.l.destroy(); blinks.splice(i, 1); } else k.l.scale.set(k.scale * (1 - k.t / k.life)); }
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.t += dt;
    if (e.t >= e.life) {
      if (e.drawn) { e.s.destroy(); if (e.l) e.l.destroy(); effects.splice(i, 1); continue; }
      e.t = 0; // (shorter than this frame, a weld's spark: drawn once, whole, then gone)
    }
    e.drawn = true;
    const k = Math.min(e.frames.length - 1, Math.floor(e.t / e.life * e.frames.length));
    e.s.texture = e.frames[k]; e.s.x += e.vx * dt; e.s.y += e.vy * dt; e.vx *= 0.92; e.vy *= 0.97;
    if (e.fade) e.s.alpha = e.fade * (1 - e.t / e.life);
    if (e.l) { e.l.alpha = 0.8 * (1 - e.t / e.life); e.l.position.copyFrom(e.s.position); }
  }
  for (let i = decals.length - 1; i >= 0; i--) {
    const d = decals[i]; d.t += dt;
    if (d.t > d.life) { d.s.destroy(); decals.splice(i, 1); continue; }
    if (d.t > d.life - 5) d.s.alpha = Math.min(d.s.alpha, (d.life - d.t) / 5);
    const v = nearView(d.s.x, d.s.y, 96); if (d.s.visible !== v) d.s.visible = v; // (off screen: not drawn)
  }
}

// ---- projectiles and client particles (pooled) ----
const projPool = [], partPool = [];
/** A ground point as a key (a tenth of a px), to tell what a shot flies at: the sim aims a shot at its target's exact
 *  ground point each tick, so a shot's aim point names its target among this frame's units. */
const aimKey = (x, y) => `${Math.round(x * 10)},${Math.round(y * 10)}`;
/** The ground points of the flyers alive this frame: a shot aimed at one flies at a flyer (its air damage applies). */
function flyersAt() { const at = new Set(); for (const u of G.units) if (!u.dead && UNITS[u.type]?.air) at.add(aimKey(u.x, u.y)); return at; }
/** The weapon that fired shot `p`: its shooter's kind's, or (a building's shot: no shooter kind) its people's tower's. */
const shotWeapon = (p) => (p.by ? UNITS[p.by]?.weapon : BUILDINGS[towerOf(G.factions[p.team], FACTIONS, BUILDINGS)]?.weapon);
function pooled(pool, i, make) { if (!pool[i]) pool[i] = make(); pool[i].visible = true; return pool[i]; }

let fogTick = -1;
/** The fog shown or not, on the map and the minimap (on, always, in a game; off only for the docs' staged screenshots,
 *  tools/docs/shots.mjs: the whole map's ground then shows, on the minimap too). */
/** The fog layer shown or hidden (the docs' and the trailer's staged shots); never hidden in an online game (a map hack
 *  from the console): false then, true when set. */
export const showFog = (on) => { if (!on && inLockstep()) return false; L.fog.visible = !!on; mmAt = -Infinity; return true; };
/** Tools only (the trailer's staged shots): the bars over the map (health, construction, training) shown or not. */
export const showBars = (on) => { bars.visible = !!on; };
/** The fog layer (and the minimap's) from this side's sight: only when a tick has changed it, not every frame. In sight
 *  clear; explored but out of sight a blue-gray veil (RGB 18, 22, 34 at 0.45), the ground and what stands on it still
 *  read; never explored near-black. */
function updateFogImage() {
  if (G.tick === fogTick) return;
  fogTick = G.tick;
  const d = fogImg.data, vis = G.vis, ex = G.explored;
  for (let i = 0; i < MW * MH; i++) d.set(vis[i] ? FOG_CLEAR : ex[i] ? FOG_SEEN : FOG_DARK, i * 4);
  fogCtx.putImageData(fogImg, APRON, APRON);
  // (the apron's fog: each edge's pixels stretched out, the sides first, then the top and the foot across them)
  const A = APRON, W = MW + 2 * A;
  fogCtx.drawImage(fogCv, A, A, 1, MH, 0, A, A, MH); fogCtx.drawImage(fogCv, A + MW - 1, A, 1, MH, A + MW, A, A, MH);
  fogCtx.drawImage(fogCv, 0, A, W, 1, 0, 0, W, A); fogCtx.drawImage(fogCv, 0, A + MH - 1, W, 1, 0, A + MH, W, A);
  fogTex.source.update();
}

/** A world coordinate on a whole screen pixel (the world's origin is on one: `render`). */
const snap = (v) => Math.round(v * cam.zoom) / cam.zoom;
const HP_COLOR = (f) => (f > 0.6 ? 0x5ad67d : f > 0.3 ? 0xffb545 : 0xff5a5a), HP_LIT = (f) => (f > 0.6 ? 0xa6f0b8 : f > 0.3 ? 0xffd690 : 0xff9a9a);
/** A slim bar `w` world px wide, its top-left at (x, y): 4 screen px tall at any zoom, a dark track, what is full in its
 *  color with a lighter line along its top, on whole screen pixels. */
function slimBar(x, y, w, f, color, lit) {
  const px = 1 / cam.zoom; x = snap(x); y = snap(y); w = Math.max(3 * px, snap(w)); f = clamp(f, 0, 1);
  bars.rect(x, y, w, 4 * px).fill({ color: 0x05080c, alpha: 0.82 });
  const fw = Math.round((w - 2 * px) * f * cam.zoom) / cam.zoom;
  if (fw > 0) { bars.rect(x + px, y + px, fw, 2 * px).fill(color); bars.rect(x + px, y + px, fw, px).fill(lit); }
}
/** A health bar (green to red), its foot where a 4 px bar's foot was at zoom 1; `sh/maxsh`: a pale shield bar just above
 *  it (none since the re-theme). */
function hpBar(x, y, w, hp, max, sh = 0, maxsh = 0) {
  const px = 1 / cam.zoom, top = y + 4 - 4 * px, f = Math.max(0, hp / max);
  if (maxsh > 0) slimBar(x, top - 5 * px, w, sh / maxsh, 0xcfe6ff, 0xffffff);
  slimBar(x, top, w, f, HP_COLOR(f), HP_LIT(f));
}
/** A unit's health bar over its art: as wide as the unit but never wider than 24 screen px (34 for a large one). */
function unitBar(u) {
  const w = Math.min(u.r * UNIT_SCALE * 2 + 4, (u.r > 12 ? 34 : 24) / cam.zoom);
  hpBar(u.x - w / 2, u.y - unitTop(u.type) - 7, w, u.hp, u.maxhp, u.sh, u.maxsh); // (just over the art's top)
}
// ---- the range (the Expedition's machines: crates/endfall-sim/src/world/radio.rs) ----
const RANGE_COLOR = 0xbfe9ff; // (a neutral light, pale on sand and stone alike)
const RIM_HALO = 0x0b1220; // (the signal rim: a dark halo under the light line, so it reads on pale ground too)
// (over the fog: the range reaches ground not yet seen; under the ghost, the bars and the selection box, over the
// selection rings) The tint is drawn opaque and faded as one layer (AlphaFilter), so where circles overlap it is no
// darker; the rim is the union's edge alone, a 3.5 px halo at 50% under a 1.5 px line at 70%, in screen px at every
// zoom (the widths are divided by the zoom, in steps: `rimZoom`). Inside the rim a feathered band gives the area its
// side (the 7% fill alone is lost on grass): `BAND_PX` screen px wide, the rim's light from `BAND_ALPHA` at the line to
// nothing, as `BAND_STEPS` rings of the union's arcs drawn inward.
const rangeTint = new Graphics(), rangeBand = new Graphics(), rangeLine = new Graphics(), rangeHi = new Graphics(), rangeG = new Container();
rangeTint.filters = [new AlphaFilter({ alpha: 0.07 })]; rangeG.addChild(rangeTint, rangeBand, rangeLine, rangeHi); L.overlay.addChildAt(rangeG, 0); rangeG.visible = false;
let rangeKey = '', rangeCircles = [], rangeArcs = [];
export const BAND_PX = 16, BAND_ALPHA = 0.18;
const BAND_STEPS = 8, RIM_HALO_ALPHA = 0.5; // (the halo 35% at first: on the pale boulders of a hill the line got lost)
/** The zoom the rim is drawn for: the camera's in steps of a tenth, so a pinch redraws it only now and then. */
const rimZoom = () => Math.round(cam.zoom * 10) / 10;
/** Stroke the arcs [x, y, r, from, to] onto `g` (no stroke call). */
const arcsOnto = (g, arcs) => { for (const [x, y, r, a0, a1] of arcs) g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r).arc(x, y, r, a0, a1); };
/** Draw the circles again: the sim's sources (G.radio, this side's and its allies'), plus a range building being
 *  placed (`extra`); only when they or the zoom's step changed, never per frame. */
function drawRange(extra) {
  const z = rimZoom(), key = `${G.radioVer}@${z}` + (extra ? `:${extra.x},${extra.y},${extra.r}` : '');
  if (key === rangeKey) return;
  rangeKey = key;
  rangeCircles = extra ? [...G.radio, extra] : G.radio.slice();
  rangeArcs = unionArcs(rangeCircles);
  rangeTint.clear(); rangeBand.clear(); rangeLine.clear();
  for (const c of rangeCircles) rangeTint.circle(c.x, c.y, c.r);
  if (rangeCircles.length) rangeTint.fill({ color: RANGE_COLOR, alpha: 1 });
  const step = BAND_PX / BAND_STEPS / z; // (world px a ring)
  for (let i = 0; i < BAND_STEPS; i++) {
    const inset = (i + 0.5) * step;
    arcsOnto(rangeBand, rangeArcs.map(([x, y, r, a0, a1]) => [x, y, Math.max(0, r - inset), a0, a1]));
    rangeBand.stroke({ width: step, color: RANGE_COLOR, alpha: BAND_ALPHA * (1 - (i + 0.5) / BAND_STEPS) });
  }
  arcsOnto(rangeLine, rangeArcs); rangeLine.stroke({ width: 3.5 / z, color: RIM_HALO, alpha: RIM_HALO_ALPHA });
  arcsOnto(rangeLine, rangeArcs); rangeLine.stroke({ width: 1.5 / z, color: RANGE_COLOR, alpha: 0.7 });
}
// The leash's cue: a machine sent past the edge (the sim's `signal` event, with the no-signal toast) brightens the stretch
// of the rim nearest where it was sent to full, fading back over 0.6 s. No pulse, dashes or icons (the designer's spec).
const LEASH_FADE = 0.6, LEASH_SPAN = 6 * TILE; // (s; world px of rim either side of the nearest point)
let leash = null;
/** The sim said a machine of ours was sent past coverage, towards (x, y): brighten the rim there. */
export function leashAt(x, y) { leash = { x, y, t: performance.now() / 1000 }; }
function drawLeash(now) {
  rangeHi.clear();
  const k = leash ? 1 - (now - leash.t) / LEASH_FADE : 0;
  if (k <= 0 || k > 1) { leash = null; return; }
  const seg = nearestRim(rangeArcs, leash.x, leash.y, LEASH_SPAN);
  if (!seg) return;
  arcsOnto(rangeHi, [seg]); rangeHi.stroke({ width: 1.5 / rimZoom(), color: RANGE_COLOR, alpha: k });
}
/** Range is shown while a Data center, an Uplink or a machine of this side is selected, or while any building that gives
 *  coverage or goes up only inside it is being placed (a source's own circle with the others). */
function showRange(selList, place, now) {
  const reach = place ? coverageOf(place.type) : 0, d = place && BUILDINGS[place.type];
  const extra = reach > 0 ? { x: (place.tx + d.w / 2) * TILE, y: (place.ty + d.h / 2) * TILE, r: reach * TILE } : null;
  const on = !!extra || (place && needsCoverage(place.type)) || selList.some(e => e.team === G.me && !e.dead && (e.kind === 'unit' ? RADIO.machines.has(e.type) : RADIO.sources[e.type] > 0));
  if (on) drawRange(extra);
  rangeG.visible = on && rangeCircles.length > 0;
  if (rangeG.visible) drawLeash(now); else leash = null;
}
/** A machine of ours out of coverage while its side has some (stranded: slowed, and only back towards it): a small
 *  "no signal" sign over it, an antenna's two arcs struck through, dark-edged and team-neutral so it reads on any
 *  ground at 1x on a phone (the arc, Nov 13: the one cue; the in-coverage chevron is gone). */
function noSignal(x, y) {
  for (const [w, c, a] of [[3.6, 0x0b1220, 0.75], [1.7, 0xf2f2f2, 1]]) {
    bars.moveTo(x, y + 4).lineTo(x, y - 1); // (the mast)
    bars.arc(x, y - 1, 3.2, -Math.PI * 0.85, -Math.PI * 0.15);
    bars.moveTo(x + 6.2 * Math.cos(-Math.PI * 0.85), y - 1 + 6.2 * Math.sin(-Math.PI * 0.85)).arc(x, y - 1, 6.2, -Math.PI * 0.85, -Math.PI * 0.15);
    bars.stroke({ width: w, color: c, alpha: a, cap: 'round', join: 'round' });
  }
  for (const [w, c, a] of [[3.6, 0x0b1220, 0.75], [1.7, 0xff5a4f, 1]]) {
    bars.moveTo(x - 6, y + 4).lineTo(x + 6, y - 7); // (struck through)
    bars.stroke({ width: w, color: c, alpha: a, cap: 'round' });
  }
}
/** Tests: whether the range is drawn, its circles, and which units show the no-signal mark. */
const markedIds = new Set();
export const rangeShown = () => ({ shown: rangeG.visible, circles: rangeCircles.map(c => ({ ...c })), arcs: rangeArcs.length, marked: [...markedIds], leash: !!leash, mmRim: mmRimArcs, mmRimWidth: mmRimCss, band: { px: BAND_PX, alpha: BAND_ALPHA, rings: rangeBand.visible && rangeArcs.length ? BAND_STEPS : 0 } });

/** A progress bar with an optional count of queued items (small pips) after it. */
function progressBar(x, y, w, f, color, pips = 0, h = 5) {
  bars.rect(x, y, w, h).fill({ color: 0x000000, alpha: 0.75 });
  bars.rect(x + 1, y + 1, (w - 2) * Math.max(0, Math.min(1, f)), h - 2).fill(color);
  for (let i = 0; i < pips; i++) bars.rect(x + w + 3 + i * 5, y, 3, h).fill(color);
}
/** Two bars: construction is paused because nobody is building. Opaque over anything (an Expedition's faint ghost
 *  too), the plate's dark breathing a little. */
function pauseMark(x, y, t) {
  bars.roundRect(x - 10, y - 10, 20, 20, 4).fill({ color: 0x0b0f16, alpha: 0.78 + 0.12 * Math.sin(t * 5) }).stroke({ width: 1, color: BUILD_BAR.color, alpha: 0.9 });
  bars.rect(x - 4.5, y - 5.5, 3, 11).fill({ color: BUILD_BAR.color, alpha: 1 }); bars.rect(x + 1.5, y - 5.5, 3, 11).fill({ color: BUILD_BAR.color, alpha: 1 });
}

/** A sprite's drawn rectangle in world px: [x0, y0, x1, y1]. */
const rectOf = (s) => { const t = s.texture, x0 = s.x - s.anchor.x * t.width * s.scale.x, y0 = s.y - s.anchor.y * t.height * s.scale.y; return [x0, y0, x0 + t.width * s.scale.x, y0 + t.height * s.scale.y]; };
/** The top of a shown building's drawn art in world px (the 40° art rises well above its footprint), or null. */
export const bldgArtTop = (id) => { const o = bldgObjs.get(id); return o?.body.visible ? rectOf(o.body)[1] : null; };
const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
// The occluders' image keeps only their solid pixels, white (red, the channel the mask reads): a baked shadow (black, about
// 0.6 opaque) and soft edges come out black, so a unit beside a building, in its shadow, gets no silhouette.
const solid = new ColorMatrixFilter();
solid.matrix = [0, 0, 0, 4, -3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
occl.filters = [solid];
/** Our own walkers that a building on screen stands in front of (it sorts after them and its art covers theirs) get their
 *  silhouette; those buildings are drawn into the mask's texture. Off (nothing drawn, no texture pass) when there are none. */
function xray(bldgs, selList = []) {
  const rects = bldgs.filter(o => o.body.visible).map(o => ({ o, r: rectOf(o.body), h: o.head?.visible ? rectOf(o.head) : null }));
  const hiding = new Set(), pieces = new Set(); // (the buildings and the land's live pieces that hide someone)
  let foes = 0;
  const teamOf = land ? new Map(G.units.map(u => [u.id, u.team])) : null; // (whose a unit is: an ally's gets no red shape)
  for (const u of unitObjs.values()) {
    if (!u.xr && (!land || u.air)) continue;
    let hid = false, behind = false;
    if (u.node.visible && (rects.length || land)) {
      const x = u.node.x, y = u.node.y, R = u.r, top = u.top, ur = [x - R, y - top, x + R, y];
      if (u.xr) for (const b of rects) if (b.o.z > u.node.zIndex && (overlap(ur, b.r) || (b.h && overlap(ur, b.h)))) { hid = true; hiding.add(b); }
      behind = !!land && land.hiding(ur, u.node.zIndex, pieces);
    }
    if (u.xr) { if (u.xr.visible !== (hid || behind)) u.xr.visible = hid || behind; }
    else if (behind && enemies(G.me, teamOf.get(u.id))) { // (an enemy's, behind the land's pieces: its shape in red)
      const s = foePool[foes] ||= L.xrayFoe.addChild(new Sprite()); foes++;
      s.visible = true; s.texture = u.body.texture; s.anchor.copyFrom(u.body.anchor); s.position.copyFrom(u.node.position); s.scale.copyFrom(u.node.scale);
    }
    if (behind) { // (its selection ring again, faint, over the crown that hides the one on the ground)
      const e = selList.find(e => e.kind === 'unit' && e.id === u.id);
      if (e) lines.ellipse(u.node.x, u.node.y + 3, u.size * 0.84, u.size * 0.52).stroke({ width: 1.5 / cam.zoom, color: enemies(G.me, e.team) ? SEL_FOE : SEL, alpha: 0.6 });
    }
  }
  for (let i = foes; i < foePool.length; i++) foePool[i].visible = false;
  L.xray.visible = hiding.size + pieces.size > 0; L.xrayFoe.visible = foes > 0;
  if (!L.xray.visible) return;
  let k = 0;
  const put = (src) => { const s = occPool[k] ||= occl.addChild(new Sprite()); k++; s.visible = true; s.texture = src.texture; s.anchor.copyFrom(src.anchor); s.position.copyFrom(src.position); s.scale.copyFrom(src.scale); };
  for (const b of hiding) { put(b.o.body); if (b.h) put(b.o.head); }
  for (const s of pieces) put(s);
  for (let i = k; i < occPool.length; i++) occPool[i].visible = false;
  occl.scale.set(cam.zoom); occl.position.copyFrom(world.position);
  occMask.width = view.w; occMask.height = view.h; if (occMaskFoe) { occMaskFoe.width = view.w; occMaskFoe.height = view.h; }
  app.renderer.render({ container: occl, target: occTex, clear: true });
}

/** The buildings' bars drawn this frame (read-only, for the tests): each one's building, kind ('build', 'hp'), top and
 *  height in world px. */
const barsDrawn = [];
/** How the buildings on screen are drawn now (read-only, for the tests): each one's look ('raw': the Kingdom's unpainted
 *  site, 'gantry': the Expedition's rising body in its gantry, 'reveal': the new look's, 'fade': its done moment, 'full'), the done moment's time,
 *  its body (tint, opacity, drawn height in world px, its color filter's saturation), its paint, roof slice, scaffold or
 *  gantry, the gantry's head (`bar`: its opacity, `barX`, `barY`: where it is set, world px; `top`: the solid's top row)
 *  and ghost, foundation, what a new-look site stands on (`under`: 'slab', 'frame'), and its bars; and
 *  our builders' strikes so far (`strikes`, by unit id). */
export const sitesShown = () => ({
  bldgs: [...bldgObjs.values()].filter(o => o.body.visible).map(o => {
    const f = o.body.filters?.[0], m = f?.matrix;
    return { id: o.id, type: o.type, done: o.b.done, look: o.doneT !== null ? 'fade' : o.b.done ? 'full' : o.base ? 'reveal' : o.ex ? 'gantry' : 'raw', fadeT: o.doneT,
      tint: o.body.tint, alpha: o.body.alpha, height: o.body.texture.height, fullHeight: o.full.height, sat: m ? (m[0] - 0.2126) / (1 - 0.2126) : 1,
      paint: o.paint.visible ? o.paint.alpha : 0, roof: o.roof.visible ? o.roof.alpha : 0, scaffold: o.scaffold.visible ? o.scaffold.alpha : 0, found: o.found.visible ? o.found.alpha : 0,
      bar: o.bar?.visible ? o.bar.alpha : 0, barX: o.bar?.visible ? o.bar.x : null, barY: o.bar?.visible ? o.bar.y : null, top: o.body.y - o.body.height, ghost: o.ghost?.visible ? o.ghost.alpha : 0, under: o.frames?.length ? (o.ex ? 'slab' : 'frame') : null,
      bars: barsDrawn.filter(r => r.id === o.id).map(r => ({ ...r })) };
  }),
  strikes: Object.fromEntries([...unitObjs.values()].filter(o => o.strikesSeen).map(o => [o.id, o.strikesSeen])),
});
let lastT = 0, frameNo = 0;
/** sel: the client's current selection; place: pending building placement or null. */
export function render(selList, place) {
  const t = G.time, now = performance.now() / 1000, dt = Math.min(0.1, lastT ? now - lastT : 0.016); lastT = now; frameNo++;
  if (!L.fog.visible && inLockstep()) { L.fog.visible = true; mmAt = -Infinity; } // (hidden before an online game began: back)
  const sel = new Set(selList), VW = vw(), VH = vh();
  let sx = 0, sy = 0; // (a fall's shake: only a headquarters', look.js fallShake)
  if (quake) { quake.t += dt; const a = quake.px * (1 - quake.t / quake.life); if (a <= 0) quake = null; else { sx = (Math.random() * 2 - 1) * a; sy = (Math.random() * 2 - 1) * a; } }
  world.scale.set(cam.zoom);
  world.position.set(Math.round((-cam.x + sx) * cam.zoom), Math.round((-cam.y + sy) * cam.zoom));
  const inView = (x, y, m) => x > cam.x - m && x < cam.x + VW + m && y > cam.y - m && y < cam.y + VH + m;
  const explored = G.explored;
  cullTerrain(cam.x, cam.y, cam.x + VW, cam.y + VH); land?.cull(cam.x, cam.y, cam.x + VW, cam.y + VH);
  noteBuildings(); // (what this side has seen of enemy buildings: in the fog, their last-seen state, never the live one)
  const shownB = shownBldgs();
  if (now - doodadCheck > 0.25 || now < doodadCheck || shownB.length !== doodadBldgs) { doodadCheck = now; doodadBldgs = shownB.length; hideCoveredDoodads(); }
  bars.clear(); lines.clear(); selG.clear(); flag.visible = false; barsDrawn.length = 0;
  drawTargets(selList, now);
  for (const b of selList) if (b.kind === 'bldg' && b.rally && !b.dead) { dashed(b.x, b.y, b.rally.x, b.rally.y); flagAt(b.rally.x, b.rally.y, t); }

  syncPool(nodeObjs, map.nodes, n => new NodeObj(n), (o, n) => { const v = inView(n.x, n.y, 90) && (explored[idx(n.tx, n.ty)] || allRevealed()); o.show(!!v); if (v) o.update(n, t); });
  const onScreen = [];
  syncPool(bldgObjs, shownB, b => new BldgObj(b), (o, b) => {
    const seen = !b.ghost && (b.team === G.me || visibleEnt(b)); // (a remembered one: drawn as last seen)
    const v = inView(b.x, b.y, b.r + 90);
    o.show(v);
    if (!v) return;
    o.update(b, t, dt, seen); onScreen.push(o);
    if (sel.has(b)) selOval(b, enemies(G.me, b.team) ? SEL_FOE : SEL);
    // An own site: its construction bar in the hp bar's place over it, taller (construct.js BUILD_BAR), the hp bar just
    // above only if it has taken damage; a pause mark while nobody builds it.
    const ownSite = b.team === G.me && !b.done, hx = b.tx * TILE + 4, hy = b.ty * TILE - 8, hw = b.w * TILE - 8;
    if (ownSite) {
      progressBar(hx, hy - (BUILD_BAR.h - 4), hw, b.progress, BUILD_BAR.color, 0, BUILD_BAR.h); barsDrawn.push({ id: b.id, bar: 'build', y: hy - (BUILD_BAR.h - 4), h: BUILD_BAR.h });
      if (seen && siteHurt(b)) { hpBar(hx, hy - BUILD_BAR.h, hw, b.hp, b.maxhp, b.sh, b.maxsh); barsDrawn.push({ id: b.id, bar: 'hp', y: hy - BUILD_BAR.h + 4 - 4 / cam.zoom, h: 4 / cam.zoom }); }
      if (!G.units.some(u => u.task.t === 'build' && u.task.b === b)) pauseMark(b.x, b.y, now);
    } else if (seen && (sel.has(b) || b.hp < b.maxhp || b.sh < b.maxsh)) { hpBar(hx, hy, hw, b.hp, b.maxhp, b.sh, b.maxsh); barsDrawn.push({ id: b.id, bar: 'hp', y: hy + 4 - 4 / cam.zoom, h: 4 / cam.zoom }); }
    // Progress shown on the building itself: training, research.
    if (b.team === G.me) {
      const bx = b.tx * TILE + 6, by = (b.ty + b.h) * TILE - 9, bw = b.w * TILE - 12;
      if (b.done && b.queue.length) progressBar(bx, by, bw - Math.min(4, b.queue.length - 1) * 5, b.prog, 0x5ab8ff, Math.min(4, b.queue.length - 1));
      if (b.done && b.research) { progressBar(bx, by - 9, bw, b.research.prog, 0xffa070, 0, 7); bars.rect(bx, by - 9, bw, 7).stroke({ width: 1, color: 0xffa070, alpha: 0.7 }); } // research: taller, outlined
    }
  });
  markedIds.clear();
  syncPool(unitObjs, G.units, u => new UnitObj(u), (o, u) => {
    const v = inView(u.x, u.y, 64) && !u.inside && (u.team === G.me || visibleEnt(u)); o.show(v); if (!v) return; // (one inside a mine is not drawn)
    o.update(u, now, sel, dt);
    const bar = sel.has(u) || u.hp < u.maxhp || u.sh < u.maxsh;
    if (bar) unitBar(u);
    if (u.team === G.me && RADIO.machines.has(u.type) && G.radio.length && !inRange(G.radio, u.x, u.y)) { // (the sim's rule: exact distance)
      noSignal(u.x, u.y - unitTop(u.type) - (bar ? 18 : 11)); markedIds.add(u.id);
    }
  });
  showRange(selList, place, now);
  xray(onScreen, selList);

  // The shots (look.js SHOT_STYLE): each a pooled sprite with, under it, a dark bar (a Kingdom shaft's silhouette), a
  // stretched copy of itself (a heavy shot's trail) and a light (an Expedition tracer's glow, the rocket's flame),
  // shown as its style says. A shot's tier in flight is its shooter's weapon against what it flies at: the unit at its
  // aim point (the sim aims a shot at its target's ground point each tick), a flyer or a walker.
  let pi = 0, aimed = null;
  for (const p of G.projs) {
    if (p.team !== G.me && !allRevealed() && !G.vis[idx(clamp((p.x / TILE) | 0, 0, MW - 1), clamp((p.y / TILE) | 0, 0, MH - 1))]) continue;
    const s = pooled(projPool, pi++, () => {
      const s = new Sprite(); s.anchor.set(0.5);
      s.bar = new Sprite(Texture.WHITE); s.bar.anchor.set(1, 0.5); s.bar.tint = SHOT_BAR.tint; s.bar.alpha = SHOT_BAR.alpha;
      s.trail = new Sprite(); s.trail.anchor.set(1, 0.5);
      L.projs.addChild(s.bar, s.trail, s); s.l = light(0xffd27a, 0.25, 0.7); return s;
    });
    const art = shotArt(p.by, p.type, G.factions[p.team]), style = SHOT_STYLE[art] ?? {}; // (by its shooter's kind, else its people's: look.js)
    setTex(s, tex(art)); // (the shot's anchor is its tip, a stone's its middle)
    const smoke = SHOT_TRAIL[art];
    if (smoke && Math.random() < dt * 40) addEffect(smoke, p.x, p.y, { life: 0.6, fade: 1 }); // (a rocket's smoke: puffs that overlap and fade)
    const rot = Math.atan2(p.ay - p.y, p.ax - p.x), sc = style.scale ?? 1, len = s.texture.width * sc;
    s.position.set(p.x, p.y); s.rotation = rot; s.scale.set(sc); s.tint = style.tint ?? 0xffffff;
    s.bar.visible = style.bar > 0;
    if (s.bar.visible) { s.bar.position.set(p.x + Math.cos(rot) * 1.5, p.y + Math.sin(rot) * 1.5); s.bar.rotation = rot; s.bar.width = len + 3; s.bar.height = style.bar; }
    const heavy = !smoke && art !== 'cannonball' && HIT_LOOK[hitTier(shotWeapon(p), (aimed ??= flyersAt()).has(aimKey(p.ax, p.ay)))].hit === 'blow';
    s.trail.visible = heavy;
    if (heavy) { setTex(s.trail, s.texture); s.trail.position.set(p.x, p.y); s.trail.rotation = rot; s.trail.scale.set(sc * (len + HEAVY_TRAIL.px) / len, sc); s.trail.alpha = HEAVY_TRAIL.alpha; s.trail.tint = s.tint; } // (the shot's own colors: a Kingdom shaft's trail is timber, never cool, and no light goes with it)
    s.l.visible = SHOT_LIT.has(art); s.l.tint = style.tint ? SHOT_GLOW : 0xffd27a; s.l.position.set(p.x, p.y); s.l.scale.set(0.25); // (only a shot with a light of its own glows: a tracer, a rocket's flame; never an arrow, a bolt or a stone)
  }
  for (let i = pi; i < projPool.length; i++) { const s = projPool[i]; s.visible = false; s.l.visible = false; s.bar.visible = false; s.trail.visible = false; }

  let ki = 0;
  for (const f of fx.list) {
    const k = 1 - f.t / f.life;
    if (f.ring) { lines.ellipse(f.x, f.y, 8 + 18 * (1 - k), (8 + 18 * (1 - k)) * 0.6).stroke({ width: 2, color: hexn(f.color), alpha: k }); continue; }
    const s = pooled(partPool, ki++, () => { const s = new Sprite(Texture.WHITE); s.anchor.set(0.5); L.fx.addChild(s); return s; });
    s.tint = hexn(f.color); s.alpha = k; s.position.set(Math.round(f.x), Math.round(f.y)); s.width = s.height = partSize(f, k);
  }
  for (let i = ki; i < partPool.length; i++) partPool[i].visible = false;

  updateEffects(dt);
  updateFogImage();

  ghost.visible = ghostPaint.visible = ghostRect.visible = !!place; ghostRect.clear();
  if (place) {
    const d = BUILDINGS[place.type], ok = canPlace(place.type, place.tx, place.ty, G.me);
    setTex(ghost, tex(`bldg_${place.type}`)); setTex(ghostPaint, tex(`bldg_${place.type}_m`)); ghost.position.set((place.tx + d.w / 2) * TILE, (place.ty + d.h / 2) * TILE); ghostPaint.position.copyFrom(ghost.position);
    paintAs(ghost, ghostPaint, seatTint(G.me), ok ? 0xb8ffc8 : 0xff7070, 0.6);
    ghostRect.rect(place.tx * TILE, place.ty * TILE, d.w * TILE, d.h * TILE).fill({ color: ok ? 0x5ad67d : 0xff5a5a, alpha: 0.18 }).stroke({ width: 2, color: ok ? 0x5ad67d : 0xff5a5a });
  }
  box.clear();
  if (drag.box) {
    const x = Math.min(drag.sx, drag.cx), y = Math.min(drag.sy, drag.cy), w = Math.abs(drag.cx - drag.sx), h = Math.abs(drag.cy - drag.sy);
    box.rect(x, y, w, h).fill({ color: SEL, alpha: 0.07 }).stroke({ width: 1, color: SEL, alpha: 0.9 });
  }
  app.render();
  renderMinimap();
}

const flag = new Sprite(); flag.anchor.set(0.2, 0.95); L.overlay.addChild(flag); flag.visible = false;
function flagAt(x, y, t) { flag.visible = true; flag.texture = sheet.animations.flag[Math.floor(t * 6) % 4]; flag.position.set(x, y); }
// ---- order targets: what the selected harvesters work on, and a blink when an order lands ----
const flashes = [];
const MINE_MARK = 0xe6e0d3;
/** Color of a target: a gold mine pale (style.css --gold), a building to work on amber. */
const targetColor = (e) => e.kind === 'node' ? MINE_MARK : 0xf5a524;
/** Blink the target of an order three times, so the player sees it was understood. */
export function flashTarget(e) { if (e) flashes.push({ e, t: performance.now() / 1000 }); }
function outline(e, width, color, alpha) {
  lines.rect(e.tx * TILE - 3, e.ty * TILE - 3, e.w * TILE + 6, e.h * TILE + 6).stroke({ width, color, alpha });
}
function drawTargets(selList, now) {
  for (const e of selList) if (e.kind === 'node' && !e.dead) outline(e, 2, SEL, 0.9); // a selected gold mine
  // Faint, steady: the mine or building each selected worker is working on.
  const done = new Set();
  for (const u of selList) {
    if (u.kind !== 'unit' || u.team !== G.me || u.dead) continue;
    const T = u.task, e = T.t === 'gather' ? T.node : (T.t === 'build' || T.t === 'repair') ? T.b : null;
    if (!e || e.dead || done.has(e)) continue;
    done.add(e); outline(e, 1.5, targetColor(e), 0.5);
  }
  // Bright, blinking for 0.9 s after an order.
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i], age = now - f.t;
    if (age > 0.9 || f.e.dead) { flashes.splice(i, 1); continue; }
    if (Math.floor(age / 0.15) % 2 === 0) outline(f.e, 3, targetColor(f.e), 1);
  }
}

function dashed(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(d / 12);
  for (let i = 0; i < n; i++) { const a = i / n, b = (i + 0.5) / n; lines.moveTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a).lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b); }
  lines.stroke({ width: 1.5, color: 0xf5a524, alpha: 0.6 });
}

/** Tests: every unit's and building's layers (art and team mask frame names, the mask's tint, the body's tint, how
 *  opaque) and its seat's tint. */
export const teamLayers = () => [...unitObjs, ...bldgObjs].map(([id, o]) => ({ id, base: o.body.texture.label, mask: o.paint.texture.label, tint: o.paint.tint, bodyTint: o.body.tint, seat: o.seat, maskOver: o.paint.parent === o.body.parent && o.body.parent.getChildIndex(o.paint) > o.body.parent.getChildIndex(o.body), shown: o.body.visible && (o.node || o.body).visible, alpha: o.body.alpha }));

/** Tests: the field's draw order (`ents`, sorted as drawn): each unit and building with its place in the layer (higher:
 *  drawn later, over), and whether a unit shows its silhouette through a building. */
export const drawOrder = () => [...[...unitObjs].filter(([, o]) => o.node.parent === L.ents).map(([id, o]) => ({ id, kind: 'unit', i: L.ents.getChildIndex(o.node), shown: o.node.visible, silhouette: !!o.xr?.visible && L.xray.visible })),
  ...[...bldgObjs].map(([id, o]) => ({ id, kind: 'bldg', i: L.ents.getChildIndex(o.body), shown: o.body.visible }))];

const pings = [];
/** Flash a spot on the minimap (attack alerts). */
export function ping(x, y) { pings.push({ x, y, t: performance.now() }); }
export function clearPings() { pings.length = 0; }

let seatCssList;
const seatCss = () => seatCssList ||= SEAT_COLORS.map(hex6);
// The minimap's map (ground, resources, buildings, units, fog) is drawn at most ten times a second, onto a canvas of
// its own; every frame puts that up with the pings and the view box over it, which follow the camera.
// Drawn in MM_UNITS across whatever its box (168, the canvas's old fixed size: every width and dot below is in these
// units, so it looks as it did at 1x), onto a backing of its CSS size times the screen's pixels per CSS px, enlarged
// under a finger (#minimap.big) times its scale too, at most MM_DPR_MAX backing px per CSS px of its box either way (a
// 3x phone's enlarged minimap would be 756 px across: four times the pixels to fill ten times a second, for a moment's
// drag). The ground, which changes only with the map, is scaled to the backing once (mmGround), not at each redraw.
const MM_UNITS = 168, MM_DPR_MAX = 3;
const mmBase = document.createElement('canvas'), mmGround = document.createElement('canvas'), MM_EVERY = 100;
let mmAt = -Infinity, mmGroundOk = false, mmCssW = 0, mmCssH = 0, mmBig = false, mmBigScale = 1;
/** The minimap's backing at its box's size times the pixels per CSS px (read each frame: a window moved to another
 *  screen or the browser's zoom changes it); a new size redraws the base at once. */
function sizeMinimap() {
  mmCssW = mm.clientWidth; mmCssH = mm.clientHeight; // (its layout box: an enlarging transform leaves it be)
  if (!(mmCssW > 0 && mmCssH > 0)) return;
  const big = mm.classList.contains('big');
  if (big !== mmBig) { mmBig = big; mmBigScale = big && mm.offsetWidth > 0 ? Math.max(1, mm.getBoundingClientRect().width / mm.offsetWidth) : 1; } // (#minimap.big has no transition: its box is final at once)
  const k = Math.min((window.devicePixelRatio || 1) * mmBigScale, MM_DPR_MAX);
  const w = Math.max(1, Math.round(mmCssW * k)), h = Math.max(1, Math.round(mmCssH * k));
  if (mm.width !== w || mm.height !== h) { mm.width = w; mm.height = h; }
  if (mmBase.width !== w || mmBase.height !== h) { mmBase.width = w; mmBase.height = h; mmAt = -Infinity; mmGroundOk = false; }
}
function renderMinimap() {
  sizeMinimap();
  const S = MM_UNITS / WW, T = MM_UNITS / WH, c = mctx; // (x and y scales in units: one, on a square map)
  const kx = mm.width / MM_UNITS, ky = mm.height / MM_UNITS; // (backing px per unit)
  const now = performance.now();
  if (now - mmAt >= MM_EVERY || now < mmAt) { mmAt = now; const b = mmBase.getContext('2d'); b.setTransform(kx, 0, 0, ky, 0, 0); minimapBase(b, S, T); }
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, mm.width, mm.height); c.drawImage(mmBase, 0, 0);
  c.setTransform(kx, 0, 0, ky, 0, 0);
  minimapRim(c, S, T); // (over the fog, unexplored black included: the whole union's outline, always)
  for (let i = pings.length - 1; i >= 0; i--) {
    const k = (now - pings[i].t) / 2500; if (k >= 1) { pings.splice(i, 1); continue; }
    c.strokeStyle = `rgba(255,90,90,${1 - k})`; c.lineWidth = 2;
    for (const r of [k, (k + 0.5) % 1]) { c.beginPath(); c.arc(pings[i].x * S, pings[i].y * T, 3 + r * 18, 0, 7); c.stroke(); }
  }
  // The view box: a dark halo under a bright line, readable over terrain and fog alike.
  const vx = cam.x * S, vy = cam.y * T, vW = vw() * S, vH = vh() * T;
  c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = 4; c.strokeRect(vx, vy, vW, vH);
  c.strokeStyle = '#ffe9b0'; c.lineWidth = 2; c.strokeRect(vx, vy, vW, vH);
}
function minimapBase(c, S, T) {
  c.imageSmoothingEnabled = false;
  if (!mmGroundOk) {
    mmGroundOk = true; mmGround.width = mmBase.width; mmGround.height = mmBase.height;
    const g = mmGround.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(thumb, 0, 0, mmGround.width, mmGround.height);
  }
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, mmBase.width, mmBase.height); c.drawImage(mmGround, 0, 0); c.restore();
  // Gold mines gold, their footprint: not any seat's color.
  const revealed = !L.fog.visible; // (showFog: the docs' staged shots)
  for (const n of map.nodes) if (revealed || G.explored[idx(n.tx, n.ty)]) {
    const x = n.tx * TILE * S, y = n.ty * TILE * T, w = Math.max(3, n.w * TILE * S), h = Math.max(3, n.h * TILE * T);
    if (land) { c.fillStyle = MINIMAP.mineEdge; c.fillRect(x - MINIMAP.mineRim, y - MINIMAP.mineRim, w + 2 * MINIMAP.mineRim, h + 2 * MINIMAP.mineRim); } // (the new land's brighter grass: a dark rim, a brighter gold)
    c.fillStyle = land ? MINIMAP.mine : MM_GOLD; c.fillRect(x, y, w, h);
  }
  // Every seat in its color, ours too, as on the field (with two seats as well: ours is no longer the amber of seat 0's
  // old gold); an ally's buildings framed in white (a team game: whose color is on our side, its base and army in our sight).
  const col = seatCss();
  c.beginPath(); // (the allies' frames: one path, stroked once)
  for (const b of shownBldgs()) { // (an enemy's in the fog: as last seen, memory.js)
    const x = b.tx * TILE * S, y = b.ty * TILE * T, w = Math.max(2, b.w * TILE * S), h = Math.max(2, b.h * TILE * T);
    c.fillStyle = col[colorOf(b.team)]; c.fillRect(x, y, w, h);
    if (b.team === G.me || enemies(G.me, b.team)) continue;
    c.rect(x - 0.5, y - 0.5, w + 1, h + 1);
  }
  c.strokeStyle = ALLY_FRAME; c.lineWidth = 1; c.stroke();
  for (const u of G.units) { if (u.inside || (u.team !== G.me && !visibleEnt(u))) continue; c.fillStyle = col[colorOf(u.team)]; c.fillRect(u.x * S - 1, u.y * T - 1, 2.2, 2.2); }
  if (!revealed) c.drawImage(fogCv, APRON, APRON, MW, MH, 0, 0, MM_UNITS, MM_UNITS); // (the map's part, not the apron's)
}
// The minimap's coverage: an Expedition seat's always (its people's headquarters gives coverage), the union's edge
// alone as one outline, over everything the fog draws (it went under the fog image first, and the black of unexplored
// ground hid most of it: with an Uplink's wide circle, all of it). In CSS px whatever the screen: drawn in the minimap's
// units (MM_UNITS across its box), so the widths are scaled back by the box's size.
const MM_RIM = { line: 1.25, halo: 2.5, color: 'rgba(191,233,255,0.8)', haloColor: 'rgba(11,18,32,0.5)' };
let mmRimArcs = 0, mmRimKey = '', mmArcs = [], mmRimCss = null;
function minimapRim(c, S, T) {
  const key = `${G.radioVer}:${G.me}`;
  if (key !== mmRimKey) { mmRimKey = key; mmArcs = coverageOf(FACTIONS[G.factions[G.me]]?.hq) > 0 ? unionArcs(G.radio) : []; }
  const arcs = mmArcs;
  mmRimArcs = arcs.length;
  if (!arcs.length) return;
  const u = mmCssW > 0 ? MM_UNITS / mmCssW : 1; // (units per CSS px)
  mmRimCss = { line: MM_RIM.line, halo: MM_RIM.halo, canvasPerCss: mmCssW > 0 ? mm.width / mmCssW : 1 }; // (backing px per CSS px, for the tests)
  c.save();
  c.beginPath();
  for (const [x, y, r, a0, a1] of arcs) { c.moveTo((x + Math.cos(a0) * r) * S, (y + Math.sin(a0) * r) * T); c.ellipse(x * S, y * T, r * S, r * T, 0, a0, a1); }
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = MM_RIM.haloColor; c.lineWidth = MM_RIM.halo * u; c.stroke();
  c.strokeStyle = MM_RIM.color; c.lineWidth = MM_RIM.line * u; c.stroke();
  c.restore();
}
