// WebGL renderer (PixiJS 8) over the generated sprite sheets in public/art/ (pre-rendered 3D units and buildings
// with their shadows baked in, painted terrain and effects, all at 2x resolution). Exports the camera, view,
// resize/centerOn, renderTerrain() once per map and render(sel, place) every frame. Draws terrain on a dual grid,
// resources, buildings, units in 16 facings, projectiles, explosions, additive lights and a soft fog layer. Visual-only randomness (smoke, debris) uses Math.random: it never feeds the sim.
import { AlphaFilter, Application, Assets, ColorMatrixFilter, Container, Graphics, Rectangle, RenderTexture, Sprite, Texture, TextureSource } from 'pixi.js';
import { G, map, idx, TILE, MW, MH, WW, WH, BUILDINGS, UNITS, clamp, mulberry, canPlace, visibleEnt, enemies, ground, RADIO, coverageOf } from '../../engine/index.js';
import { noteBuildings, shownBldgs } from '../memory.js';
import { fx } from '../fx.js';
import { BLDG_LOOK, selOval as selOvalOf, headFrame, portalOpen, chimneyActive, UNIT_FPS, UNIT_POSE, SEAT_COLORS, UNIT_ART_SCALE, colorOf, shotArt, SHOT_TRAIL, SHOT_LIT } from '../look.js';
import { drag } from '../input.js';
import { inRange, unionArcs } from '../range.js';
import { scatterDoodads } from '../scenery.js';
import { groundTile, rockTile, rockKinds, shadeLayers } from './ground.js';

export const cv = document.getElementById('game');
export const mm = document.getElementById('minimap'), mctx = mm.getContext('2d');
export const view = { w: 800, h: 500, dpr: 1 };
/** Camera: top-left corner in world px, and zoom (screen px per world px). */
export const cam = { x: 0, y: 0, zoom: matchMedia('(pointer: coarse)').matches ? 1.75 : innerWidth >= 1100 ? 2 : 1.5 };
export const ZOOM_MIN = 0.75, ZOOM_MAX = 2.5;
/** The zoom a game starts at: a phone (a coarse pointer) at 1, its world px one CSS px, where the units read; with a
 *  mouse all the way out, over as much of the map as a desktop's window holds. */
export const startZoom = () => matchMedia('(pointer: coarse)').matches ? 1 : ZOOM_MIN;
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
const textures = {}, frames = {};
for (const sh of await Promise.all(index.pages.map(p => Assets.load(artBase + p)))) {
  Object.assign(textures, sh.textures);
  // HUD portraits are cut from a plain decoded copy of the page (the browser has it cached): reading back Pixi's
  // GPU-side texture costs about a second per page.
  const img = new Image(); img.src = new URL(sh.data.meta.image, artBase).href;
  for (const [n, f] of Object.entries(sh.data.frames)) frames[n] = { img, f: f.frame, a: f.anchor || { x: 0.5, y: 0.5 }, at: f.spriteSourceSize || { x: 0, y: 0 } }; // (at: a trimmed frame's place in the full one)
}
await Promise.all([...new Set(Object.values(frames).map(f => f.img))].map(i => i.decode().catch(() => {})));
/** A spot's paint: the tint the art pipeline fitted to turn the neutral team mask into paint of the seat's color
 *  (atlas.json `tints`, from look.js SEAT_COLORS; Notion: Ebbfall art). */
export const spotTint = (spot) => index.tints?.[spot % index.tints.length] ?? SEAT_COLORS[spot % SEAT_COLORS.length];
/** How far (world px) a unit of `type` is drawn above its ground point: its art's height (atlas.json `unitTops`, measured
 *  by tools/art/generate.mjs) at the renderer's UNIT_SCALE; a flyer's includes the height it flies at. The hit test, the
 *  health bars and the silhouettes behind buildings go by it. */
export const unitTop = (type) => (index.unitTops?.[type] ?? (UNITS[type]?.r ?? 10) * 2.4) * UNIT_SCALE;
/** A unit's drawn radius (world px): its sim radius at the renderer's scale and the art's (look.js UNIT_ART_SCALE). */
export const unitRadius = (u) => u.r * UNIT_SCALE * UNIT_ART_SCALE;
/** A seat's paint in this game: its spot's (look.js `colorOf`: a player keeps its board spot's color). */
export const seatTint = (team) => spotTint(colorOf(team));
/** Two tints at once (a seat's paint under an effect's tint): channel by channel product. */
const mulTint = (a, b) => b === 0xffffff ? a : ((a >> 16) * (b >> 16) / 255) << 16 | ((a >> 8 & 255) * (b >> 8 & 255) / 255) << 8 | (a & 255) * (b & 255) / 255;
const hex6 = (c) => '#' + c.toString(16).padStart(6, '0');
const iconCache = new Map(), artTops = new Map();
/** The first row of frame `name` (frame px from its top) with paint in it: a flyer's art starts far above its ground
 *  point (the height it flies at). Read once from the decoded page, cached. */
function artTop(name) {
  if (artTops.has(name)) return artTops.get(name);
  const { img, f } = frames[name], c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  const a = ctx.getImageData(0, 0, f.w, f.h).data;
  let top = 0;
  rows: for (; top < f.h; top++) for (let x = 0; x < f.w; x++) if (a[(top * f.w + x) * 4 + 3] > 24) break rows;
  artTops.set(name, top);
  return top;
}
/**
 * A small portrait of a sprite for the HTML HUD, as a data URL: the frame scaled so its larger side is `zoom` x
 * `size` css px, centered a little above its ground point, cut to a size x size square; with `fit`, lowered when its
 * art would start above the square's top (the Drone's rotors), so its top is never cut. With `tint`, its team mask
 * (`name_m`) in that color over it, as the renderer draws it. With `head`, that frame (a building's turret, dish or
 * rotor, BLDG_LOOK) over it on the same ground point and at the same scale, painted the same way. Cached.
 */
export function artIcon(name, size = 28, zoom = 1, tint = null, fit = false, head = null) {
  const key = `${name}|${size}|${zoom}|${tint}|${fit}|${head}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const fr = frames[name]; let url = '';
  if (fr) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), n = Math.round(size * dpr), { x, y, w, h } = fr.f;
    const c = document.createElement('canvas'); c.width = c.height = n;
    const ctx = c.getContext('2d', { willReadFrequently: true }), k = n * zoom / Math.max(w, h); // a CPU canvas: no GPU upload of the page
    const ox = n / 2 - w * fr.a.x * k, oy = Math.max(n / 2 - (h * fr.a.y - h * 0.08) * k, fit ? n * 0.04 - artTop(name) * k : -Infinity);
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
    const hf = head && frames[head];
    if (hf) { const gx = ox + w * fr.a.x * k, gy = oy + h * fr.a.y * k; paint(head, hf, gx - hf.f.w * hf.a.x * k, gy - hf.f.h * hf.a.y * k); } // (head frames are untrimmed, as the base)
    url = c.toDataURL();
  }
  iconCache.set(key, url);
  return url;
}
/** An <img> portrait of a unit type, building type or gold mine ('node'), or ''. In `team`'s
 * colors: this client's own seat unless told otherwise. A building with a head (BLDG_LOOK) has it on, at rest. */
export function portrait(kind, type, size = 26, team = G.me) {
  const head = BLDG_LOOK[type]?.head;
  const url = kind === 'unit' ? artIcon(`${type}_2_0`, size, 2.1, seatTint(team), true) // unit frames carry room for the shadow
    : kind === 'node' ? artIcon('mine_full', size, 1.1) : artIcon(`bldg_${type}`, size, 1.1, seatTint(team), false, head ? head + '_0' : null);
  return url ? `<img class="por" src="${url}" alt="" width="${size}" height="${size}">` : '';
}
const tex = (name) => textures[name] || Texture.EMPTY;
const sheet = { animations: Object.fromEntries(Object.entries(index.animations).map(([k, names]) => [k, names.map(tex)])) };
const FACINGS = index.facings || 16;
/** Point a sprite at a texture and adopt the texture's anchor (where the ground point sits in the art). */
const setTex = (s, t) => { if (s.texture !== t) { s.texture = t; s.anchor.copyFrom(t.defaultAnchor || { x: 0.5, y: 0.5 }); } };
/** A team-coloured sprite is two: the neutral art and its team mask (`name_m`) over it in the seat's color. Effects
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
const GROUPS = new Set(['terrain', 'scenery', 'worn', 'decals', 'found', 'ents', 'air']);
for (const k of ['terrain', 'scenery', 'shade', 'worn', 'decals', 'found', 'sel', 'ents', 'xray', 'air', 'projs', 'fx', 'lights', 'fog', 'overlay']) world.addChild(L[k] = new Container({ isRenderGroup: GROUPS.has(k) }));
L.ents.sortableChildren = true; L.air.sortableChildren = true;
L.lights.blendMode = 'add';
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
const occPool = []; // (sprites in `occl`, reused frame to frame)
const bars = new Graphics(); L.overlay.addChild(bars);
const lines = new Graphics(); L.overlay.addChild(lines);
const box = new Graphics(); screen.addChild(box);
const [ghost, ghostPaint] = teamSprite(L.overlay);
const ghostRect = new Graphics(); L.overlay.addChild(ghostRect);

// ---- camera ----
let shake = 0;
export function resize() {
  const r = cv.parentElement.getBoundingClientRect(), mid = toWorld(view.w / 2, view.h / 2); // (the point in the middle stays there)
  view.w = Math.max(200, r.width | 0); view.h = Math.max(160, r.height | 0); view.dpr = app.renderer.resolution;
  const hud = document.getElementById('hud'); hudFloats = !hud || getComputedStyle(hud).position === 'fixed';
  app.renderer.resize(view.w, view.h); occTex.resize(view.w, view.h, app.renderer.resolution); centerOn(mid.x, mid.y);
}
const vw = () => view.w / cam.zoom, vh = () => view.h / cam.zoom; // visible world size
/** Where the HUD floats over the map the camera may scroll that far past the edges (the panels are taller with a
 *  mouse); a narrow window keeps them in a band below. Looked at on each resize. */
const coarse = matchMedia('(pointer: coarse)');
let hudFloats = true;
const overscroll = () => hudFloats ? (coarse.matches ? 120 : 170) / cam.zoom : 0;
export function clampCam() { const o = overscroll(); cam.x = clamp(cam.x, -o, Math.max(0, WW - vw()) + o); cam.y = clamp(cam.y, -o / 2, Math.max(0, WH - vh()) + o); }
export function centerOn(x, y) { cam.x = x - vw() / 2; cam.y = y - vh() / 2; clampCam(); }
/** Screen (canvas css px) → world px. */
export const toWorld = (sx, sy) => ({ x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y });
/** Whether world point (x, y) is on screen or within `m` world px of it. With eight armies most fights are elsewhere:
 *  their effects are not made at all (decals are, and show once the camera comes). */
export const nearView = (x, y, m = 160) => x > cam.x - m && x < cam.x + vw() + m && y > cam.y - m && y < cam.y + vh() + m;
/** Zoom by `factor`, keeping the world point under screen point (sx, sy) fixed. */
export function zoomAt(factor, sx, sy) {
  const before = toWorld(sx, sy);
  cam.zoom = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  cam.x = before.x - sx / cam.zoom; cam.y = before.y - sy / cam.zoom; clampCam();
}

// ---- terrain (once per map) ----
// A pixel per tile: the minimap's ground and the fog, at the map's size (sizeGrids); the shade layers are made per map.
const thumb = document.createElement('canvas');
const fog = new Sprite(); fog.scale.set(TILE); L.fog.addChild(fog);
const FOG_DARK = [5, 7, 11, 255], FOG_SEEN = [18, 22, 34, 115], FOG_CLEAR = [18, 22, 34, 0]; // (RGBA per tile: never explored, explored, in sight)
let fogCv, fogCtx, fogImg, fogTex, gridW = 0, gridH = 0;
/** Make the per-tile canvases and textures for a map of MW x MH (again only when a game's map has another size). */
function sizeGrids() {
  if (gridW === MW && gridH === MH) return;
  gridW = MW; gridH = MH;
  const canvas = () => { const c = document.createElement('canvas'); c.width = MW; c.height = MH; return c; };
  const texture = (c) => { const t = Texture.from(c); t.source.scaleMode = 'linear'; return t; };
  thumb.width = MW; thumb.height = MH;
  const old = [fogTex];
  fogCv = canvas(); fogCtx = fogCv.getContext('2d'); fogImg = fogCtx.createImageData(MW, MH); fogTex = texture(fogCv); fog.texture = fogTex;
  for (let i = 0; i < MW * MH; i++) fogImg.data.set(FOG_DARK, i * 4); // (updateFogImage sets each tile's)
  for (const t of old) t?.destroy(true);
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
function cullTerrain(x0, y0, x1, y1) { for (const c of chunks) if (c) c.visible = c.cx + 9 * TILE > x0 && c.cx - TILE < x1 && c.cy + 9 * TILE > y0 && c.cy - TILE < y1; }

export function renderTerrain() {
  L.terrain.removeChildren().forEach(c => c.destroy({ children: true }));
  L.shade.removeChildren().forEach(c => c.destroy({ texture: true, textureSource: true }));
  sizeGrids(); fogTick = -1; mmAt = -Infinity; // (a new map, or a replay from its first tick: fog and minimap at once)
  xrayColor(SEAT_COLORS[colorOf(G.me) % SEAT_COLORS.length]); // (this side's own color, for its silhouettes)
  const rnd = mulberry(G.seed * 7 + 3);
  const rock = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH || map.rock[idx(x, y)] ? 1 : 0;
  const wetCell = (i, j) => [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].some(([x, y]) => !rock(x, y) && ground(x, y) !== 'land');
  // Each rock region a forest or a rocky hill, picked once per region (gl/ground.js rockKinds): a cell takes the kind
  // of its first rock corner, all of one region.
  const kinds = rockKinds(MW, MH, (x, y) => map.rock[idx(x, y)] !== 0, G.seed);
  const cellKind = (i, j) => { for (const [x, y] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) if (rock(x, y)) return kinds.kindAt(x, y); return 'hill'; };
  // Dual grid: the cell between tiles (i,j)..(i+1,j+1) is drawn at its center, offset half a tile.
  // Tiles go into 8x8-cell chunks so only the chunks on screen are drawn (no baking: it would cost a 4096² texture).
  chunks.length = 0;
  for (let j = -1; j < MH; j++) for (let i = -1; i < MW; i++) {
    const m = rock(i, j) | rock(i + 1, j) << 1 | rock(i, j + 1) << 2 | rock(i + 1, j + 1) << 3;
    const r = rnd();
    const name = m === 0 ? `ground_${groundTile(r, i, j, G.seed, wetCell(i, j))}` : rockTile(m, r, cellKind(i, j));
    const ci = (j + 1) >> 3, cj = (i + 1) >> 3, key = ci * 64 + cj;
    let c = chunks[key]; if (!c) { c = chunks[key] = new Container(); c.cx = cj * 8 * TILE; c.cy = ci * 8 * TILE; L.terrain.addChild(c); }
    const s = new Sprite(tex(name)); s.anchor.set(0); s.position.set(i * TILE + 16, j * TILE + 16); c.addChild(s);
  }
  // Large-scale variation so the tiles never read as a grid, and the water (gl/ground.js): a multiply (the land's shade,
  // a wet line along the shore, the water's tints) and on a map with water an add (the water's light), over the scenery too.
  const sh = shadeLayers(MW, MH, { rock: (x, y) => map.rock[idx(x, y)] !== 0, ground, shade: (x, y) => map.shade[idx(x, y)] });
  for (const [data, blendMode] of [[sh.mul, 'multiply'], [sh.add, 'add']]) {
    if (!data) continue;
    const cv = document.createElement('canvas'); cv.width = sh.w; cv.height = sh.h;
    cv.getContext('2d').putImageData(new ImageData(data, sh.w, sh.h), 0, 0);
    const t = Texture.from(cv); t.source.scaleMode = 'linear';
    const vs = new Sprite(t); vs.scale.set(TILE / sh.k); vs.blendMode = blendMode; L.shade.addChild(vs);
  }
  // Scenery: props on the plateaus and the open ground (see scenery.js); ground props hide under buildings.
  L.scenery.removeChildren().forEach(c => c.destroy()); doodads.length = 0;
  const cores = G.bldgs.filter(b => b.d.hq).map(b => ({ tx: b.tx + b.w / 2, ty: b.ty + b.h / 2 }));
  for (const d of scatterDoodads(G.seed, map, cores, { MW, MH, TILE, mulberry })) {
    const s = new Sprite(); setTex(s, tex(`doodad_${d.name}`)); s.position.set(d.x, d.y); L.scenery.addChild(s);
    doodads.push({ s, tx: d.tx, ty: d.ty, ground: d.ground });
  }
  // Minimap background.
  const th = thumb.getContext('2d');
  const wetCss = { shallow: '#467c80', deep: '#1d3658' }, rockCss = { forest: '#2a3f22', hill: '#77756c' }; // (the grass green, a forest darker, a hill gray, the sea teal and blue: as the ground looks)
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const g = map.rock[idx(x, y)] ? 'land' : ground(x, y); th.fillStyle = map.rock[idx(x, y)] ? rockCss[kinds.kindAt(x, y)] : wetCss[g] || `hsl(92,24%,${17 + map.shade[idx(x, y)] * 8}%)`; th.fillRect(x, y, 1, 1); }
  for (const pool of [unitObjs, bldgObjs, nodeObjs]) { for (const o of pool.values()) o.destroy(); pool.clear(); }
  L.decals.removeChildren().forEach(c => c.destroy()); decals.length = 0;
  L.worn.removeChildren().forEach(c => c.destroy()); // (the buildings' own, gone with them above)
  for (const e of effects) { e.s.destroy(); if (e.l) e.l.destroy(); } effects.length = 0;
}

// ---- entity display objects, keyed by sim id ----
const unitObjs = new Map(), bldgObjs = new Map(), nodeObjs = new Map();
const light = (tint, scale, alpha) => { const s = new Sprite(tex('light')); s.anchor.set(0.5); s.tint = tint; s.scale.set(scale); s.alpha = alpha; L.lights.addChild(s); return s; };

// Selection marks: cool white brackets (red for the enemy), unlike anything else on the field: health bars are green to
// red, orders amber, resources teal and violet.
const SEL = 0xeaf6ff, SEL_FOE = 0xff5a5a;
/** Four arcs of an ellipse round a unit's feet: a broken ring, so it never reads as a health bar or a range. */
function selArcs(rx, ry, color) {
  const g = new Graphics();
  for (const [w, c, a] of [[4, 0x000000, 0.45], [2, color, 0.95]]) {
    for (let q = 0; q < 4; q++) {
      const a0 = q * Math.PI / 2 + Math.PI / 4 - 0.5, n = 8;
      for (let i = 0; i <= n; i++) { const t = a0 + i / n; const x = Math.cos(t) * rx, y = Math.sin(t) * ry; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    }
    g.stroke({ width: w, color: c, alpha: a, cap: 'round' });
  }
  return g;
}
/** The Portal's swirl at rest: this faint (look.js portalOpen brightens it to full as a unit comes through). */
const PORTAL_SETTLED = 0.35;
const selG = new Graphics(); L.sel.addChild(selG); // (a selected building's oval, under the buildings: cleared every frame)
/** A selected building: a flat oval on the ground under it, sized to its footprint (look.js `selOval`). */
function selOval(b, color) {
  const o = selOvalOf(b);
  for (const [w, c, a] of [[4, 0x000000, 0.45], [2, color, 0.95]]) selG.ellipse(o.x, o.y, o.rx, o.ry).stroke({ width: w, color: c, alpha: a });
}
class UnitObj {
  constructor(u) {
    const layer = u.d.air ? L.air : L.ents;
    this.air = !!u.d.air; this.type = u.type; this.r = unitRadius(u); this.top = unitTop(u.type); // (its drawn size: the silhouettes' test)
    this.frames = (sheet.animations[`${u.type}_0`] || [0]).length;
    this.node = new Container(); this.node.scale.set(UNIT_SCALE); layer.addChild(this.node); // (body, paint and flash sort as one)
    this.body = new Sprite(); this.flash = new Sprite(); this.paint = new Sprite(); this.paintFlash = new Sprite(); this.seat = seatTint(u.team);
    this.flash.blendMode = this.paintFlash.blendMode = 'add'; this.paintFlash.tint = this.seat;
    this.node.addChild(this.body, this.flash, this.paint, this.paintFlash); // (hit: each layer added onto itself, so paint brightens in its own color)
    // (an own walker: its silhouette, shown while a building hides it)
    if (u.team === G.me && !this.air) { this.xr = new Sprite(); this.xr.scale.set(UNIT_SCALE); this.xr.visible = false; L.xray.addChild(this.xr); }
    this.size = (u.r > 12 ? 26 : 18) * UNIT_ART_SCALE; // (the ring and the rope round the feet: as large as the art)
    this.ring = selArcs(this.size * 0.95, this.size * 0.6, enemies(G.me, u.team) ? SEL_FOE : SEL); this.ring.visible = false; L.sel.addChild(this.ring);
    this.cargo = light(0xeee6d2, 0.14, 0.5); // (the gold a worker carries: pale, faint)
    this.px = u.x; this.py = u.y; this.walk = 0;
  }
  update(u, t, sel, dt) {
    const moved = Math.hypot(u.x - this.px, u.y - this.py); this.px = u.x; this.py = u.y;
    this.moveT = moved > 0.05 ? 0.25 : Math.max(0, (this.moveT || 0) - dt); this.moving = this.moveT > 0; // (on the move: held a moment, as frames between ticks see no step)
    if (moved > 0.05 || this.air) this.walk += dt * (UNIT_FPS[u.type] ?? (this.air ? 14 : 8)); // rotors always spin
    // (a unit with poses: its march cycle, else the pose of its toggle: settling in or packing up, then on)
    const pose = UNIT_POSE[u.type], frames = pose ? pose.walk : this.frames;
    const f = pose && u.swap > 0 ? pose.swap : pose && u.mode ? pose.on : Math.floor(this.walk) % frames;
    const dir = ((Math.round(u.face / (Math.PI * 2) * FACINGS) % FACINGS) + FACINGS) % FACINGS;
    const name = `${u.type}_${dir}_${f}`, tx = tex(name);
    const mx = tex(name + '_m'); setTex(this.body, tx); setTex(this.flash, tx); setTex(this.paint, mx); setTex(this.paintFlash, mx);
    const glide = UNIT_FPS[u.type] === 0, bob = this.air ? Math.sin(t * (glide ? 1.6 : 3) + u.id) * (glide ? 2 : 1.2) : 0; // (a glider rides a slower, deeper swell)
    // (sorted by its feet among the buildings, which sit half a px north of their bottom row: one standing on that line is
    // in front; units on one line apart by id)
    this.node.position.set(u.x, u.y + bob); this.node.zIndex = u.y + (u.id % 997) * 1e-5;
    if (this.xr) { setTex(this.xr, tx); this.xr.position.set(u.x, u.y); }
    this.flash.visible = this.paintFlash.visible = u.flash > 0; this.flash.alpha = this.paintFlash.alpha = 0.6;
    // (a toggle shows in its pose, UNIT_POSE: a deployed Cannon, a braced Guard)
    paintAs(this.body, this.paint, this.seat, 0xffffff, 1);
    // Harpooned (slowed, no abilities): a rope's loop round its feet (round its shadow for a flyer), fading as it wears off.
    if (u.slowed > 0) {
      const a = Math.min(1, u.slowed / 1.5), rx = this.size * 0.85, ry = this.size * 0.45, y = u.y + (this.air ? 14 : 4) * UNIT_ART_SCALE;
      bars.ellipse(u.x, y, rx, ry).stroke({ width: 2.5, color: 0x3b2a1a, alpha: 0.55 * a }).ellipse(u.x, y, rx, ry).stroke({ width: 1.2, color: 0xe2c992, alpha: 0.9 * a });
    }
    const s = sel.has(u);
    this.ring.visible = s; if (s) this.ring.position.set(u.x, u.y + 3);
    this.cargo.visible = !!u.carry;
    if (u.carry) { this.cargo.tint = 0xeee6d2; this.cargo.position.set(u.x - Math.cos(u.face) * 7, u.y - Math.sin(u.face) * 7 - 11); this.cargo.alpha = 0.7 + 0.3 * Math.sin(t * 6); }
  }
  show(v) { this.node.visible = v; if (!v) { this.ring.visible = this.cargo.visible = false; if (this.xr) this.xr.visible = false; } }
  destroy() { this.node.destroy({ children: true }); this.ring.destroy(); this.cargo.destroy(); this.xr?.destroy(); } // (a Graphics frees its context only when destroyed without options)
}

const STAGES = 8, stageTex = {};
/** The bottom `k/STAGES` of a building texture, for the rising-from-the-ground construction reveal (of a trimmed
 *  texture, a mask, the rows of it that fall in there). */
function stage(name, k) {
  const key = name + k; if (stageTex[key]) return stageTex[key];
  const base = tex(name), fr = base.frame, o = base.orig, tr = base.trim || new Rectangle(0, 0, o.width, o.height);
  const h = Math.max(1, Math.round(o.height * k / STAGES)), top = o.height - h, y0 = Math.max(tr.y, top), rows = tr.y + tr.height - y0;
  const t = rows <= 0 ? new Texture({ source: base.source, frame: new Rectangle(fr.x, fr.y, 1, 1), orig: new Rectangle(0, 0, o.width, h), trim: new Rectangle(0, 0, 0, 0) }) // (no rows: nothing to draw)
    : new Texture({ source: base.source, frame: new Rectangle(fr.x, fr.y + y0 - tr.y, fr.width, rows), orig: new Rectangle(0, 0, o.width, h), trim: new Rectangle(tr.x, y0 - top, tr.width, rows), label: `${name}@${k}` });
  t.defaultAnchor = { x: base.defaultAnchor.x, y: 1 }; // bottom-aligned: the footprint stays put while the rest rises
  return stageTex[key] = t;
}

class BldgObj {
  constructor(b) {
    const n = b.w;
    // (worn dirt under it, from its site to its ruin: trodden earth over the footprint and a little beyond, the grass
    // showing through, no paths)
    this.worn = new Sprite(); setTex(this.worn, tex(`worn_${n}`)); L.worn.addChild(this.worn);
    this.found = new Sprite(); setTex(this.found, tex(`foundation_${n}`)); L.found.addChild(this.found);
    [this.body, this.paint] = teamSprite(L.ents); this.seat = seatTint(b.team); this.name = `bldg_${b.type}`;
    // (a Vael site grows in a bud, `bud_n`: the Expedition's scaffold with its hoist, in place of the kingdom's; the
    // foundation is the kingdom's; a scaffold's cloth and flags in the seat's color)
    this.bud = G.factions[b.team] === 'vael';
    [this.scaffold, this.scaffoldPaint] = teamSprite(L.ents); const sn = `${this.bud ? 'bud' : 'scaffold'}_${n}`;
    setTex(this.scaffold, tex(sn)); setTex(this.scaffoldPaint, tex(sn + '_m')); paintAs(this.scaffold, this.scaffoldPaint, this.seat);
    this.full = tex(this.name); this.fullPaint = tex(this.name + '_m'); setTex(this.body, this.full); setTex(this.paint, this.fullPaint);
    this.look = BLDG_LOOK[b.type] || {};
    if (this.look.head) [this.head, this.headPaint] = teamSprite(L.ents);
    const glow = this.look.glow;
    this.glow = glow ? light(glow[0], glow[1], glow[2]) : null;
    this.smokeT = 0; this.type = b.type;
    for (const s of [this.worn, this.found, this.body, this.paint, this.scaffold, this.scaffoldPaint]) s.position.set(b.x, b.y);
    // (sorted with the units by its bottom row, half a px north of it, so a unit whose feet are on that line or south of
    // it stands in front; buildings in one row apart by id, each one's paint, scaffold and head just over its own body)
    const z = (b.ty + b.h) * TILE - 0.5 + (b.id % 97) * 0.002; this.z = z;
    this.body.zIndex = z; this.paint.zIndex = z + 0.0002; this.scaffold.zIndex = z + 0.0004; this.scaffoldPaint.zIndex = z + 0.0005;
    if (this.head) { this.head.zIndex = z + 0.0006; this.headPaint.zIndex = z + 0.0008; }
  }
  /** `live`: the player can see it right now (otherwise it is a remembered silhouette: no smoke, no aiming). */
  update(b, t, dt, live) {
    const name = this.name, grow = !b.done && this.bud;
    this.found.visible = !b.done && !grow; this.scaffold.visible = this.scaffoldPaint.visible = !b.done && (!grow || b.progress > 0); // (an Expedition site: its bud once its Bot has begun, no foundation)
    if (b.done) { setTex(this.body, this.full); setTex(this.paint, this.fullPaint); this.body.y = this.paint.y = b.y; }
    else { // the bottom k/8 of the art, its bottom edge where the full sprite's would be
      const k = Math.max(1, Math.min(STAGES, Math.ceil(b.progress * STAGES))); setTex(this.body, stage(name, k)); setTex(this.paint, stage(name + '_m', k));
      this.body.y = this.paint.y = b.y + (1 - this.full.defaultAnchor.y) * this.full.height;
    }
    // hit flash
    paintAs(this.body, this.paint, this.seat, 0xffffff, b.flash > 0 ? 0.75 : 1);
    if (grow) this.growIn(b, t, live);
    if (this.head) {
      // A turret's head only while seen live (it aims); a rotor or a dish stays on its remembered base, still. The
      // rotors turn on the renderer's clock (cosmetic), each from its own phase. The Portal's swirl turns slowly, settled
      // and faint, and brightens and speeds up each time a unit comes through (look.js portalOpen), then settles again.
      const turns = this.look.spin || this.look.pan, now = performance.now() / 1000;
      let open = 0, shown = 1;
      if (this.look.portal) {
        open = live ? portalOpen(this.portal ||= {}, b, now) : 0;
        this.spinT = (this.spinT || 0) + dt * (0.3 + 0.7 * open); // (the swirl winds up with it)
        shown = PORTAL_SETTLED + (1 - PORTAL_SETTLED) * open;
      }
      this.head.visible = this.headPaint.visible = b.done && (live || !!turns);
      const dir = turns && !live ? 0 : this.look.portal ? Math.floor(this.spinT * this.look.spin) % 16 : headFrame(this.look, b.aim, now, (b.id % 13) * 0.37), hn = `${this.look.head}_${dir}`;
      setTex(this.head, tex(hn)); setTex(this.headPaint, tex(hn + '_m')); this.head.position.set(b.x, b.y); this.headPaint.position.set(b.x, b.y);
      paintAs(this.head, this.headPaint, this.seat, 0xffffff, this.body.alpha * shown);
      this.openNow = open;
    }
    if (this.glow) { const g = this.look.glow; this.glow.visible = b.done; this.glow.position.set(b.x + (g[5] || 0), b.y - g[3]); this.glow.alpha = g[4] ? 0.3 + 0.15 * Math.sin(t * 9) : 0.35 + 0.12 * Math.sin(t * 2.5); if (this.look.portal) this.glow.alpha = (this.openNow || 0) * g[2]; }
    // Damage: smoke below half health, fire below a quarter.
    const f = b.hp / b.maxhp;
    if (live && b.done && f < 0.5) { this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = f < 0.25 ? 0.12 : 0.3; const x = b.tx * TILE + 8 + Math.random() * (b.w * TILE - 16), y = b.ty * TILE + 8 + Math.random() * (b.h * TILE - 16); addEffect('puff', x, y, { vy: -18, life: 1.2 }); if (f < 0.25 && Math.random() < 0.5) addEffect('flash', x, y + 4, { life: 0.25, light: 0xff8a2a }); } }
    const sm = this.look.smoke; // chimneys: only while the building works (look.js chimneyActive)
    if (live && sm && chimneyActive(b) && Math.random() < dt * 2.5) { const [sx, sy] = sm[Math.floor(Math.random() * sm.length)]; addEffect('puff', b.tx * TILE + sx, b.ty * TILE + sy, { vy: -22, life: 1.5 }); }
  }
  /** An Expedition site: no foundation, its bud (in the scaffold's sprite) once its Bot has begun; the whole building fades in as a lantern-lit ghost, more solid as
   *  it grows, inside a pulsing ring while a Bot works on it (a site not yet begun is a fainter ghost, no
   *  ring). Seen through fog, only the remembered ghost. */
  growIn(b, t, live) {
    const begun = b.progress > 0;
    setTex(this.body, this.full); setTex(this.paint, this.fullPaint); this.body.y = this.paint.y = b.y;
    paintAs(this.body, this.paint, this.seat, b.flash > 0 ? 0xffffff : 0xffd6b8, (begun ? 0.22 + 0.6 * b.progress : 0.15) + (b.flash > 0 ? 0.15 : 0)); // (brighter when hit)
    if (begun) this.scaffold.alpha = this.scaffoldPaint.alpha = 1 - 0.75 * b.progress; // (the bud opens as the shell inside it grows)
    if (!live || !G.units.some(u => u.task.t === 'build' && u.task.b === b)) return; // (the ring only while a Bot works)
    const cy = b.y + b.h * TILE * 0.3, rx = b.w * TILE * 0.62, ry = b.h * TILE * 0.36, pulse = 0.55 + 0.35 * Math.sin(t * 4);
    bars.ellipse(b.x, cy, rx, ry).fill({ color: 0xff9a5c, alpha: 0.1 * pulse }).stroke({ width: 2, color: 0xffa070, alpha: 0.8 * pulse });
    bars.ellipse(b.x, cy, rx * 0.7, ry * 0.7).stroke({ width: 1, color: 0xffe6d0, alpha: 0.5 * pulse });
  }
  /** Shown or not (update, after this, decides the parts of a shown one). Visibility is only ever set to what it should
   *  be, never on and off again in one frame: each change rebuilds the layer's draw list. */
  show(v) { this.body.visible = this.paint.visible = v; if (this.worn.visible !== v) this.worn.visible = v; if (!v) { this.found.visible = this.scaffold.visible = this.scaffoldPaint.visible = false; if (this.head) this.head.visible = this.headPaint.visible = false; if (this.glow) this.glow.visible = false; } }
  destroy() { for (const s of [this.worn, this.found, this.body, this.paint, this.scaffold, this.scaffoldPaint, this.head, this.headPaint, this.glow]) if (s) s.destroy(); }
}

// ---- gold mines: one per field (crates/endfall-sim/src/map.rs `lay_mines`), neutral, drawn by what is left ----
/** Below this share of what it held, a mine shows its `low` frame; with nothing left, `empty` (boarded up). */
const MINE_LOW_SHARE = 0.25;
export const mineStage = (n) => n.amount <= 0 ? 'empty' : n.amount < MINE_LOW_SHARE * n.max ? 'low' : 'full';
class NodeObj {
  constructor(n) {
    // (with the buildings and units, sorted by its bottom row as a building is: a worker north of it stands behind it)
    this.s = new Sprite(); this.s.position.set(n.x, n.y); this.s.zIndex = (n.ty + n.h) * TILE - 0.5 + (n.id % 97) * 0.002; L.ents.addChild(this.s);
    // Its door lamp, lit while anyone is inside (the arc's UPDATE 6: a mine being worked, at a glance), only where we
    // see it now: the fog shows a mine as it was, so a lamp there would tell what we cannot see.
    this.lamp = new Graphics().circle(0, 0, 5).fill({ color: 0xffc35a, alpha: 0.35 }).circle(0, 0, 2.4).fill({ color: 0xffe7a8, alpha: 0.95 });
    this.lamp.position.set(n.x + 9, n.y + n.h * TILE / 2 - 18); this.lamp.zIndex = this.s.zIndex + 0.001; this.lamp.visible = false; L.ents.addChild(this.lamp);
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

// ---- effects ----
const effects = [];
/** Spawn a one-shot animated effect; anim names come from atlas.json (boom_big, boom_small, puff, flash, spark).
 *  `fade`: its opacity at the start, falling to nothing over its life (a trail's puffs overlap into one soft streak). */
export function addEffect(anim, x, y, o = {}) {
  const frames = sheet.animations[anim]; if (!frames || !nearView(x, y)) return;
  const s = new Sprite(frames[0]); s.anchor.set(0.5); s.position.set(x, y); if (o.rot) s.rotation = o.rot; if (o.scale) s.scale.set(o.scale); if (o.tint) s.tint = o.tint;
  if (o.fade) s.alpha = o.fade;
  L.fx.addChild(s);
  const e = { s, frames, anim, x, y, t: 0, life: o.life || frames.length * 0.07, vx: o.vx || 0, vy: o.vy || 0, fade: o.fade || 0 };
  if (o.light) { e.l = light(o.light, o.lightScale || 1, 0.8); e.l.position.set(x, y); }
  effects.push(e);
}
/** The effects alive now, each with its animation and where it was spawned (world px): read-only, for the tests. */
export const effectsShown = () => effects.map(e => ({ anim: e.anim, x: e.x, y: e.y }));
/** A unit or building died: explosion sized to it, debris, a scorch mark, and a shake and rubble (its people's: `race`) for big ones. */
export function boom(x, y, r, race) {
  const big = r >= 20;
  addEffect(big ? 'boom_big' : 'boom_small', x, y, { light: 0xff9a3a, lightScale: big ? 2.4 : 1.1, life: big ? 0.7 : 0.45, scale: big ? Math.min(2, r / 28) : 1 });
  for (let i = 0; i < (big ? 10 : 4); i++) { const a = Math.random() * 6.28, v = 40 + Math.random() * 90; addEffect('spark', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.3 }); }
  const scorch = new Sprite(tex('light')); scorch.anchor.set(0.5); scorch.tint = 0x000000; scorch.alpha = 0.45; scorch.scale.set(r / 24); scorch.position.set(x, y + 2); L.decals.addChild(scorch);
  decals.push({ s: scorch, t: 0, life: 25 });
  if (big) { if (nearView(x, y, 0)) shake = Math.min(10, shake + r / 6); const rub = new Sprite(); setTex(rub, tex(`${race === 'vael' ? 'rubble_vael' : 'rubble'}_${Math.min(4, Math.max(2, Math.round(r / 16)))}`)); rub.position.set(x, y); L.decals.addChild(rub); decals.push({ s: rub, t: 0, life: 40 }); }
}
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
export function sparkAt(x, y, big) { if (big) addEffect('boom_small', x, y, { light: 0xffb545, lightScale: 0.7, life: 0.35, scale: 0.7 }); else addEffect('spark', x, y, { life: 0.18, light: 0xfff4c2, lightScale: 0.3 }); }
const decals = [];

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.t += dt;
    if (e.t >= e.life) { e.s.destroy(); if (e.l) e.l.destroy(); effects.splice(i, 1); continue; }
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
function pooled(pool, i, make) { if (!pool[i]) pool[i] = make(); pool[i].visible = true; return pool[i]; }

let fogTick = -1;
/** The fog layer (and the minimap's) from this side's sight: only when a tick has changed it, not every frame. In sight
 *  clear; explored but out of sight a blue-gray veil (RGB 18, 22, 34 at 0.45), the ground and what stands on it still
 *  read; never explored near-black. */
function updateFogImage() {
  if (G.tick === fogTick) return;
  fogTick = G.tick;
  const d = fogImg.data, vis = G.vis, ex = G.explored;
  for (let i = 0; i < MW * MH; i++) d.set(vis[i] ? FOG_CLEAR : ex[i] ? FOG_SEEN : FOG_DARK, i * 4);
  fogCtx.putImageData(fogImg, 0, 0); fogTex.source.update();
}

/** A health bar (green to red); `sh/maxsh`: a pale shield bar just above it (the Vael). */
function hpBar(x, y, w, hp, max, sh = 0, maxsh = 0) {
  if (maxsh > 0) { bars.rect(x, y - 4, w, 4).fill({ color: 0x000000, alpha: 0.65 }); bars.rect(x + 1, y - 3, (w - 2) * Math.max(0, sh / maxsh), 2).fill(0xcfe6ff); } // (2 px: readable on a phone)
  const f = Math.max(0, hp / max);
  bars.rect(x, y, w, 4).fill({ color: 0x000000, alpha: 0.65 });
  bars.rect(x + 1, y + 1, (w - 2) * f, 2).fill(f > 0.6 ? 0x5ad67d : f > 0.3 ? 0xffb545 : 0xff5a5a);
}
// ---- the range (the Expedition's machines: crates/endfall-sim/src/world/radio.rs) ----
const RANGE_COLOR = 0xbfe9ff; // (a neutral light, pale on sand and stone alike)
// (over the fog: the range reaches ground not yet seen) The tint is drawn opaque and faded as one layer (AlphaFilter),
// so where circles overlap it is no darker; the outline is the union's edge alone.
const rangeTint = new Graphics(), rangeLine = new Graphics(), rangeG = new Container();
rangeTint.filters = [new AlphaFilter({ alpha: 0.08 })]; rangeG.addChild(rangeTint, rangeLine); L.overlay.addChildAt(rangeG, 0); rangeG.visible = false;
let rangeKey = '', rangeCircles = [];
/** Draw the circles again: the sim's sources (G.radio, this side's and its allies'), plus a range building being
 *  placed (`extra`); only when they changed, never per frame. */
function drawRange(extra) {
  const key = G.radioVer + (extra ? `:${extra.x},${extra.y},${extra.r}` : '');
  if (key === rangeKey) return;
  rangeKey = key;
  rangeCircles = extra ? [...G.radio, extra] : G.radio.slice();
  rangeTint.clear(); rangeLine.clear();
  for (const c of rangeCircles) rangeTint.circle(c.x, c.y, c.r);
  if (rangeCircles.length) rangeTint.fill({ color: RANGE_COLOR, alpha: 1 });
  for (const [x, y, r, a0, a1] of unionArcs(rangeCircles)) rangeLine.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r).arc(x, y, r, a0, a1);
  rangeLine.stroke({ width: 1.5, color: RANGE_COLOR, alpha: 0.6 });
}
/** Range is shown while a Data center, an Uplink or a machine of this side is selected, or while a building that gives
 *  range is being placed (its own circle with the others). */
function showRange(selList, place) {
  const reach = place ? coverageOf(place.type) : 0, d = place && BUILDINGS[place.type];
  const extra = reach > 0 ? { x: (place.tx + d.w / 2) * TILE, y: (place.ty + d.h / 2) * TILE, r: reach * TILE } : null;
  const on = !!extra || selList.some(e => e.team === G.me && !e.dead && (e.kind === 'unit' ? RADIO.machines.has(e.type) : RADIO.sources[e.type] > 0));
  if (on) drawRange(extra);
  rangeG.visible = on && rangeCircles.length > 0;
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
export const rangeShown = () => ({ shown: rangeG.visible, circles: rangeCircles.map(c => ({ ...c })), arcs: unionArcs(rangeCircles).length, marked: [...markedIds] });

/** A progress bar with an optional count of queued items (small pips) after it. */
function progressBar(x, y, w, f, color, pips = 0, h = 5) {
  bars.rect(x, y, w, h).fill({ color: 0x000000, alpha: 0.75 });
  bars.rect(x + 1, y + 1, (w - 2) * Math.max(0, Math.min(1, f)), h - 2).fill(color);
  for (let i = 0; i < pips; i++) bars.rect(x + w + 3 + i * 5, y, 3, h).fill(color);
}
/** Two bars: construction is paused because nobody is building. */
function pauseMark(x, y, t) {
  const a = 0.55 + 0.45 * Math.sin(t * 5);
  bars.roundRect(x - 9, y - 9, 18, 18, 4).fill({ color: 0x000000, alpha: 0.6 * a });
  bars.rect(x - 4, y - 5, 3, 10).fill({ color: 0xffb545, alpha: a }); bars.rect(x + 1, y - 5, 3, 10).fill({ color: 0xffb545, alpha: a });
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
function xray(bldgs) {
  const rects = bldgs.filter(o => o.body.visible).map(o => ({ o, r: rectOf(o.body), h: o.head?.visible ? rectOf(o.head) : null }));
  const hiding = new Set();
  for (const u of unitObjs.values()) {
    if (!u.xr) continue;
    let hid = false;
    if (u.node.visible && rects.length) {
      const x = u.node.x, y = u.node.y, R = u.r, top = u.top, ur = [x - R, y - top, x + R, y];
      for (const b of rects) if (b.o.z > u.node.zIndex && (overlap(ur, b.r) || (b.h && overlap(ur, b.h)))) { hid = true; hiding.add(b); }
    }
    if (u.xr.visible !== hid) u.xr.visible = hid;
  }
  L.xray.visible = hiding.size > 0;
  if (!hiding.size) return;
  let k = 0;
  const put = (src) => { const s = occPool[k] ||= occl.addChild(new Sprite()); k++; s.visible = true; s.texture = src.texture; s.anchor.copyFrom(src.anchor); s.position.copyFrom(src.position); };
  for (const b of hiding) { put(b.o.body); if (b.h) put(b.o.head); }
  for (let i = k; i < occPool.length; i++) occPool[i].visible = false;
  occl.scale.set(cam.zoom); occl.position.copyFrom(world.position);
  occMask.width = view.w; occMask.height = view.h;
  app.renderer.render({ container: occl, target: occTex, clear: true });
}

let lastT = 0;
/** sel: the client's current selection; place: pending building placement or null. */
export function render(selList, place) {
  const t = G.time, now = performance.now() / 1000, dt = Math.min(0.1, lastT ? now - lastT : 0.016); lastT = now;
  const sel = new Set(selList), VW = vw(), VH = vh();
  shake *= Math.pow(0.02, dt);
  const sx = shake > 0.3 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0.3 ? (Math.random() - 0.5) * shake : 0;
  world.scale.set(cam.zoom);
  world.position.set(Math.round((-cam.x + sx) * cam.zoom), Math.round((-cam.y + sy) * cam.zoom));
  const inView = (x, y, m) => x > cam.x - m && x < cam.x + VW + m && y > cam.y - m && y < cam.y + VH + m;
  const explored = G.explored;
  cullTerrain(cam.x, cam.y, cam.x + VW, cam.y + VH);
  noteBuildings(); // (what this side has seen of enemy buildings: in the fog, their last-seen state, never the live one)
  const shownB = shownBldgs();
  if (now - doodadCheck > 0.25 || now < doodadCheck || shownB.length !== doodadBldgs) { doodadCheck = now; doodadBldgs = shownB.length; hideCoveredDoodads(); }
  bars.clear(); lines.clear(); selG.clear(); flag.visible = false;
  drawTargets(selList, now);
  for (const b of selList) if (b.kind === 'bldg' && b.rally && !b.dead) { dashed(b.x, b.y, b.rally.x, b.rally.y); flagAt(b.rally.x, b.rally.y, t); }

  syncPool(nodeObjs, map.nodes, n => new NodeObj(n), (o, n) => { const v = inView(n.x, n.y, 90) && explored[idx(n.tx, n.ty)]; o.show(!!v); if (v) o.update(n, t); });
  const onScreen = [];
  syncPool(bldgObjs, shownB, b => new BldgObj(b), (o, b) => {
    const seen = !b.ghost && (b.team === G.me || visibleEnt(b)); // (a remembered one: drawn as last seen)
    const v = inView(b.x, b.y, b.r + 90);
    o.show(v);
    if (!v) return;
    o.update(b, t, dt, seen); onScreen.push(o);
    if (sel.has(b)) selOval(b, enemies(G.me, b.team) ? SEL_FOE : SEL);
    if (seen && (sel.has(b) || b.hp < b.maxhp || b.sh < b.maxsh)) hpBar(b.tx * TILE + 4, b.ty * TILE - 8, b.w * TILE - 8, b.hp, b.maxhp, b.sh, b.maxsh);
    // Progress shown on the building itself: construction (with a pause mark when nobody builds), then training.
    if (b.team === G.me) {
      const bx = b.tx * TILE + 6, by = (b.ty + b.h) * TILE - 9, bw = b.w * TILE - 12;
      if (!b.done) { progressBar(bx, by, bw, b.progress, 0xf5a524); if (!G.units.some(u => u.task.t === 'build' && u.task.b === b)) pauseMark(b.x, b.y, now); }
      else if (b.queue.length) progressBar(bx, by, bw - Math.min(4, b.queue.length - 1) * 5, b.prog, 0x5ab8ff, Math.min(4, b.queue.length - 1));
      if (b.done && b.research) { progressBar(bx, by - 9, bw, b.research.prog, 0xffa070, 0, 7); bars.rect(bx, by - 9, bw, 7).stroke({ width: 1, color: 0xffa070, alpha: 0.7 }); } // research: taller, outlined
    }
  });
  markedIds.clear();
  syncPool(unitObjs, G.units, u => new UnitObj(u), (o, u) => {
    const v = inView(u.x, u.y, 64) && !u.inside && (u.team === G.me || visibleEnt(u)); o.show(v); if (!v) return; // (one inside a mine is not drawn)
    o.update(u, now, sel, dt);
    const bar = sel.has(u) || u.hp < u.maxhp || u.sh < u.maxsh;
    if (bar) { const r = u.r * UNIT_SCALE; hpBar(u.x - r - 2, u.y - unitTop(u.type) - 7, r * 2 + 4, u.hp, u.maxhp, u.sh, u.maxsh); } // (just over the art's top)
    if (u.team === G.me && RADIO.machines.has(u.type) && G.radio.length && !inRange(G.radio, u.x, u.y)) { // (the sim's rule: exact distance)
      noSignal(u.x, u.y - unitTop(u.type) - (bar ? 18 : 11)); markedIds.add(u.id);
    }
  });
  showRange(selList, place);
  xray(onScreen);

  let pi = 0;
  for (const p of G.projs) {
    if (p.team !== G.me && !G.vis[idx(clamp((p.x / TILE) | 0, 0, MW - 1), clamp((p.y / TILE) | 0, 0, MH - 1))]) continue;
    const s = pooled(projPool, pi++, () => { const s = new Sprite(); s.anchor.set(0.5); L.projs.addChild(s); s.l = light(0xffd27a, 0.25, 0.7); return s; });
    const art = shotArt(p.by, p.type, G.factions[p.team]); // (by its shooter's kind, else its people's: look.js)
    setTex(s, tex(art)); // (the shot's anchor is its tip, a stone's its middle)
    const trail = SHOT_TRAIL[art];
    if (trail && Math.random() < dt * 40) addEffect(trail, p.x, p.y, { life: 0.6, fade: 1 }); // (a rocket's smoke: puffs that overlap and fade)
    s.position.set(p.x, p.y); s.rotation = Math.atan2(p.ay - p.y, p.ax - p.x);
    s.l.visible = SHOT_LIT.has(art); s.l.position.set(p.x, p.y); s.l.scale.set(0.25); // (only a shot with a light of its own glows: a tracer, a rocket's flame; not an arrow or a stone)
  }
  for (let i = pi; i < projPool.length; i++) { projPool[i].visible = false; projPool[i].l.visible = false; }

  let ki = 0;
  for (const f of fx.list) {
    const k = 1 - f.t / f.life;
    if (f.ring) { lines.ellipse(f.x, f.y, 8 + 18 * (1 - k), (8 + 18 * (1 - k)) * 0.6).stroke({ width: 2, color: hexn(f.color), alpha: k }); continue; }
    const s = pooled(partPool, ki++, () => { const s = new Sprite(Texture.WHITE); s.anchor.set(0.5); L.fx.addChild(s); return s; });
    s.tint = hexn(f.color); s.alpha = k; s.position.set(Math.round(f.x), Math.round(f.y)); s.width = s.height = Math.max(1, Math.round(f.r * (0.5 + k)));
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
/** Color of a target: a gold mine pale (style.css --shard), a building to work on amber. */
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

/** Tests: every unit's and building's layers (art and team mask frame names, the mask's tint, how opaque) and its
 *  seat's tint. */
export const teamLayers = () => [...unitObjs, ...bldgObjs].map(([id, o]) => ({ id, base: o.body.texture.label, mask: o.paint.texture.label, tint: o.paint.tint, seat: o.seat, maskOver: o.paint.parent === o.body.parent && o.body.parent.getChildIndex(o.paint) > o.body.parent.getChildIndex(o.body), shown: o.body.visible && (o.node || o.body).visible, alpha: o.body.alpha }));

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
const mmBase = document.createElement('canvas'), MM_EVERY = 100;
let mmAt = -Infinity;
function renderMinimap() {
  const S = mm.width / WW, T = mm.height / WH, c = mctx; // (x and y scales: one, on a square map)
  const now = performance.now();
  if (mmBase.width !== mm.width || mmBase.height !== mm.height) { mmBase.width = mm.width; mmBase.height = mm.height; mmAt = -Infinity; }
  if (now - mmAt >= MM_EVERY || now < mmAt) { mmAt = now; minimapBase(mmBase.getContext('2d'), S, T); }
  c.clearRect(0, 0, mm.width, mm.height); c.drawImage(mmBase, 0, 0);
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
  c.imageSmoothingEnabled = false; c.clearRect(0, 0, mm.width, mm.height); c.drawImage(thumb, 0, 0, mm.width, mm.height);
  // Gold mines gold, their footprint: not any seat's color.
  for (const n of map.nodes) if (G.explored[idx(n.tx, n.ty)]) { c.fillStyle = MM_GOLD; c.fillRect(n.tx * TILE * S, n.ty * TILE * T, Math.max(3, n.w * TILE * S), Math.max(3, n.h * TILE * T)); }
  // Every seat in its color, ours too, as on the field (with two seats as well: ours is no longer the amber of seat 0's
  // old gold); an ally's buildings framed in white (a team game: whose color is on our side, its base and army in our sight).
  const col = seatCss();
  c.beginPath(); // (the allies' frames: one path, stroked once)
  for (const b of shownBldgs()) { // (an enemy's in the fog: as last seen, memory.js)
    const x = b.tx * TILE * S, y = b.ty * TILE * T, w = Math.max(2, b.w * TILE * S), h = Math.max(2, b.h * TILE * T);
    c.fillStyle = col[colorOf(b.team)]; c.fillRect(x, y, w, h);
    if (b.team === G.me || enemies(G.me, b.team)) continue;
    const x0 = Math.floor(x), y0 = Math.floor(y); // (the frame on whole pixels: crisp)
    c.rect(x0 - 0.5, y0 - 0.5, Math.ceil(x + w) - x0 + 1, Math.ceil(y + h) - y0 + 1);
  }
  c.strokeStyle = ALLY_FRAME; c.lineWidth = 1; c.stroke();
  for (const u of G.units) { if (u.inside || (u.team !== G.me && !visibleEnt(u))) continue; c.fillStyle = col[colorOf(u.team)]; c.fillRect(u.x * S - 1, u.y * T - 1, 2.2, 2.2); }
  c.drawImage(fogCv, 0, 0, mm.width, mm.height);
}
