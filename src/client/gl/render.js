// WebGL renderer (PixiJS 8) over the generated sprite sheets in public/art/ (pre-rendered 3D units and buildings
// with their shadows baked in, painted terrain and effects, all at 2x resolution). Exports the camera, view,
// resize/centerOn, renderTerrain() once per map and render(sel, place) every frame. Draws terrain on a dual grid,
// resources, buildings, units in 16 facings, projectiles, explosions, additive lights and a soft fog layer. Visual-only randomness (smoke, debris) uses Math.random: it never feeds the sim.
import { AlphaFilter, Application, Assets, ColorMatrixFilter, Container, Graphics, Rectangle, RenderTexture, Sprite, Texture, TextureSource } from 'pixi.js';
import { G, map, idx, TILE, MW, MH, WW, WH, BUILDINGS, UNITS, clamp, mulberry, canPlace, visibleEnt, enemies, ground, RADIO, coverageOf, needsCoverage, FACTIONS } from '../../engine/index.js';
import { noteBuildings, shownBldgs } from '../memory.js';
import { fx, partSize } from '../fx.js';
import { BLDG_DEATH, BLDG_LOOK, selOval as selOvalOf, headFrame, portalOpen, chimneyActive, UNIT_FPS, UNIT_POSE, strikePose, deathOf, bldgDeath, ghostAt, portalGhost, BURN_FLASH, AIR_PUFF, DEATH_DUST, HIT_DUST, hitLift, flashLayer, slowTint, SEAT_COLORS, UNIT_ART_SCALE, colorOf, shotArt, SHOT_TRAIL, SHOT_LIT } from '../look.js';
import { RAW, HOLO, DONE, DONE_PUFF, BUILD_BAR, WORK, rawStage, rawMatrix, holoAlpha, budAlpha, mixColor, doneAt, donePuffs, siteHurt, strikeCount, strikeAt, atSite, STRIKE_FX } from '../construct.js';
import { sfx } from '../audio.js';
import { drag } from '../input.js';
import { inRange, unionArcs, nearestRim } from '../range.js';
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
let quake = null; // (`quake`: a fall's shake, look.js fallShake: ± px dying away over its life)
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
  for (const o of dying) o.destroy(); dying.length = 0; quake = null; pending.length = 0; for (const k of blinks) k.l.destroy(); blinks.length = 0;
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
    this.size = (u.r > 12 ? 26 : 18) * UNIT_ART_SCALE; // (the selection ring round the feet: as large as the art)
    this.ring = selArcs(this.size * 0.95, this.size * 0.6, enemies(G.me, u.team) ? SEL_FOE : SEL); this.ring.visible = false; L.sel.addChild(this.ring);
    this.cargo = light(0xeee6d2, 0.14, 0.5); // (the gold a worker carries: pale, faint)
    this.id = u.id; this.px = u.x; this.py = u.y; this.walk = 0;
  }
  update(u, t, sel, dt) {
    const moved = Math.hypot(u.x - this.px, u.y - this.py); this.px = u.x; this.py = u.y;
    this.moveT = moved > 0.05 ? 0.25 : Math.max(0, (this.moveT || 0) - dt); this.moving = this.moveT > 0; // (on the move: held a moment, as frames between ticks see no step)
    if (moved > 0.05 || this.air) this.walk += dt * (UNIT_FPS[u.type] ?? (this.air ? 14 : 8)); // rotors always spin
    // (a unit with poses: its march cycle, else the pose of its toggle: settling in or packing up, then on)
    const pose = UNIT_POSE[u.type], frames = pose ? pose.walk : this.frames;
    const f = pose && u.swap > 0 ? pose.swap : pose && u.mode ? pose.on : Math.floor(this.walk) % frames;
    const dir = ((Math.round(u.face / (Math.PI * 2) * FACINGS) % FACINGS) + FACINGS) % FACINGS;
    // (a melee unit in a fight: its strike poses, look.js strikePose, over the walk)
    const sp = strikePose(u); this.pose = sp;
    const name = sp ? `${u.type}_${dir}_${sp}` : `${u.type}_${dir}_${f}`, tx = tex(name);
    const mx = tex(name + '_m'); setTex(this.body, tx); setTex(this.flash, tx); setTex(this.paint, mx); setTex(this.paintFlash, mx);
    const glide = UNIT_FPS[u.type] === 0, bob = this.air ? Math.sin(t * (glide ? 1.6 : 3) + u.id) * (glide ? 2 : 1.2) : 0; // (a glider rides a slower, deeper swell)
    // (sorted by its feet among the buildings, which sit half a px north of their bottom row: one standing on that line is
    // in front; units on one line apart by id)
    this.node.position.set(u.x, u.y + bob); this.node.zIndex = u.y + (u.id % 997) * 1e-5;
    this.work(u, t);
    if (this.xr) { setTex(this.xr, tx); this.xr.position.set(u.x, u.y); }
    // (slowed by an arrow, look.js SLOW: its body, not its team paint, an icy steel blue, and a pale ice added over it on
    // the hit flash's layer while no hit flash shows; both fading as it wears off)
    const fl = flashLayer(u.flash, u.slowed);
    this.flash.visible = fl.visible; this.flash.tint = fl.tint; this.flash.alpha = fl.alpha;
    this.paintFlash.visible = u.flash > 0; this.paintFlash.alpha = 0.6;
    // (a toggle shows in its pose, UNIT_POSE: a deployed Cannon, a braced Guard)
    paintAs(this.body, this.paint, this.seat, 0xffffff, 1); this.body.tint = slowTint(u.slowed);
    const s = sel.has(u);
    this.ring.visible = s; if (s) this.ring.position.set(u.x, u.y + 3);
    this.cargo.visible = !!u.carry;
    if (u.carry) { this.cargo.tint = 0xeee6d2; this.cargo.position.set(u.x - Math.cos(u.face) * 7, u.y - Math.sin(u.face) * 7 - 11); this.cargo.alpha = 0.7 + 0.3 * Math.sin(t * 6); }
  }
  /** A builder at work (construct.js WORK): standing in reach of its unfinished site, a strike every 0.55 s or so (its
   *  phase from its id): a pale glint and a little dust on a Kingdom wall, a welding spark on the Expedition's, a soft
   *  knock heard only on screen, and its body nudged towards the site for two frames. `now`: the renderer's clock (s). */
  work(u, now) {
    const b = u.task.t === 'build' ? u.task.b : null;
    if (!b || b.done || b.dead || this.moving || !atSite(u, b, TILE)) { this.strikes = undefined; this.nudge = 0; return; }
    const c = strikeCount(u.id, now);
    if (this.strikes !== undefined && c !== this.strikes) {
      const p = strikeAt(u, b); this.nudgeTo = p; this.nudge = WORK.nudgeFrames;
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
  show(v) { this.node.visible = v; if (!v) { this.ring.visible = this.cargo.visible = false; if (this.xr) this.xr.visible = false; } }
  destroy() { this.node.destroy({ children: true }); this.ring.destroy(); this.cargo.destroy(); this.xr?.destroy(); } // (a Graphics frees its context only when destroyed without options)
}

const stageTex = {};
/** Where a building's art begins and ends, in its full frame's rows (`base`: the building's name, its mask lined up by
 *  it): the reveal is measured on the art, not on the frame's empty room above the roof. */
function artSpan(base) { const r = artRows(base), at = frames[base]?.at.y || 0; return { top: r.top + at, bot: r.bot + at + 1 }; }
/** The bottom `k/RAW.stages` of a building texture `name` (the building's art or its mask, by the art of `base`), for the
 *  rising-from-the-ground construction reveal: the rows of it that fall in there, its bottom edge where the full
 *  sprite's is. With `roof`, the rest instead: the rows above (the full frame, its anchor kept). */
function stage(name, k, base = name, roof = false) {
  const key = name + k + (roof ? 'r' : ''); if (stageTex[key]) return stageTex[key];
  const tx = tex(name), fr = tx.frame, o = tx.orig, tr = tx.trim || new Rectangle(0, 0, o.width, o.height);
  const res = tx.source.resolution || 1, span = artSpan(base); // (the art's rows in the page's px, the texture's in world px)
  const top = Math.max(0, Math.min(o.height - 1, (span.bot - Math.round((span.bot - span.top) * k / RAW.stages)) / res));
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
    // (a Vael site grows in a bud, `bud_n`: the Expedition's scaffold with its hoist, in place of the kingdom's; the
    // foundation is the kingdom's; a scaffold's cloth and flags in the seat's color)
    this.bud = G.factions[b.team] === 'vael';
    [this.scaffold, this.scaffoldPaint] = teamSprite(L.ents); const sn = `${this.bud ? 'bud' : 'scaffold'}_${n}`;
    setTex(this.scaffold, tex(sn)); setTex(this.scaffoldPaint, tex(sn + '_m')); paintAs(this.scaffold, this.scaffoldPaint, this.seat);
    this.full = tex(this.name); this.fullPaint = tex(this.name + '_m'); setTex(this.body, this.full); setTex(this.paint, this.fullPaint);
    // (the Kingdom's roof slice: missing until done, then fading in on the done moment)
    if (!this.bud) { this.roof = new Sprite(); this.roof.visible = false; L.ents.addChild(this.roof); }
    this.look = BLDG_LOOK[b.type] || {};
    if (this.look.head) [this.head, this.headPaint] = teamSprite(L.ents);
    const glow = this.look.glow;
    this.glow = glow ? light(glow[0], glow[1], glow[2]) : null;
    this.smokeT = 0; this.type = b.type; this.id = b.id; this.x = b.x; this.y = b.y; this.b = b; this.live = false;
    // The done moment (construct.js DONE): only for a site this side watched finish, live and on screen (`seenAt`: the
    // last frame it was drawn in, `frameNo`); a building already standing when first drawn never plays it.
    this.wasDone = b.done; this.seenAt = -Infinity; this.doneT = null;
    for (const s of [this.worn, this.found, this.body, this.paint, this.scaffold, this.scaffoldPaint, this.roof]) s?.position.set(b.x, b.y);
    // (sorted with the units by its bottom row, half a px north of it, so a unit whose feet are on that line or south of
    // it stands in front; buildings in one row apart by id, each one's paint, scaffold and head just over its own body)
    const z = (b.ty + b.h) * TILE - 0.5 + (b.id % 97) * 0.002; this.z = z;
    this.body.zIndex = z; this.paint.zIndex = z + 0.0002; this.scaffold.zIndex = z + 0.0004; this.scaffoldPaint.zIndex = z + 0.0005;
    if (this.roof) this.roof.zIndex = z + 0.0001;
    if (this.head) { this.head.zIndex = z + 0.0006; this.headPaint.zIndex = z + 0.0008; }
  }
  /** `live`: the player can see it right now (otherwise it is a remembered silhouette: no smoke, no aiming, no done
   *  moment). `now`: the renderer's clock (s). */
  update(b, t, dt, live, now = performance.now() / 1000) {
    this.b = b; this.live = live; // (what a fall reads: look.js bldgDeath)
    if (b.done && !this.wasDone) this.doneT = live && this.seenAt === frameNo - 1 ? 0 : null; // (it stood while we watched: its done moment)
    this.wasDone = b.done; this.seenAt = frameNo;
    if (this.doneT !== null) { this.doneT += dt; if (this.doneT >= DONE.life) this.endFade(); }
    const fading = this.doneT !== null, d = fading ? doneAt(this.doneT, this.bud) : null;
    const name = this.name, site = !b.done;
    const flashA = b.flash > 0 ? 0.75 : 1; // (hit flash)
    vis(this.found, (site && !this.bud) || (fading && !this.bud));
    vis(this.scaffold, (site && (!this.bud || b.progress > 0)) || fading); vis(this.scaffoldPaint, this.scaffold.visible); // (an Expedition site: its bud once its Bot has begun, no foundation)
    if (this.bud) { // the Expedition: a cold cyan hologram until done (construct.js HOLO)
      setTex(this.body, this.full); setTex(this.paint, this.fullPaint); this.body.y = this.paint.y = b.y;
      if (site) {
        const a = holoAlpha(b.progress, live ? now : 0); // (a remembered ghost holds still)
        this.body.tint = b.flash > 0 ? 0xffffff : HOLO.tint; this.body.alpha = a + (b.flash > 0 ? 0.15 : 0); vis(this.paint, false);
        this.scaffold.alpha = this.scaffoldPaint.alpha = budAlpha(b.progress);
      } else if (fading) {
        this.body.tint = mixColor(HOLO.tint, 0xffffff, d.color); this.body.alpha = (HOLO.alphaMax + (1 - HOLO.alphaMax) * d.color) * flashA;
        vis(this.paint, true); this.paint.tint = this.seat; this.paint.alpha = d.color * flashA;
        this.scaffold.alpha = this.scaffoldPaint.alpha = HOLO.budMin * d.strip;
      } else { vis(this.paint, true); paintAs(this.body, this.paint, this.seat, 0xffffff, flashA); }
      if (site || fading) this.workRing(b, t, live, fading ? d.ring : 1);
    } else { // the Kingdom: raw, unpainted, its roof missing until done (construct.js RAW)
      if (site || fading) { // the bottom k/8 of the art, its bottom edge where the full sprite's would be (k at most 7)
        const k = site ? rawStage(b.progress) : RAW.cap; setTex(this.body, stage(name, k, name)); setTex(this.paint, this.fullPaint);
        this.body.y = b.y + (1 - this.full.defaultAnchor.y) * this.full.height; this.paint.y = b.y;
        this.body.tint = 0xffffff; this.body.alpha = flashA;
        if (site) { if (this.body.filters?.[0] !== RAW_LOOK) this.body.filters = [RAW_LOOK]; vis(this.paint, false); vis(this.roof, false); }
        else {
          if (!this.fadeLook) { this.fadeLook = rawFilter(); this.body.filters = [this.fadeLook]; setTex(this.roof, stage(name, RAW.cap, name, true)); this.roof.filters = [this.fadeLook]; }
          this.fadeLook.matrix = rawMatrix(d.color);
          vis(this.paint, true); this.paint.tint = this.seat; this.paint.alpha = d.color * flashA;
          vis(this.roof, this.body.visible); this.roof.alpha = d.roof * flashA;
          if (!this.puffed && this.doneT >= DONE.puffAt) { this.puffed = true; for (const p of donePuffs(b, TILE)) addEffect(HIT_DUST.anim, p.x, p.y, { vy: DONE_PUFF.vy, life: DONE_PUFF.life, scale: DONE_PUFF.scale, fade: DONE_PUFF.fade, tint: HIT_DUST.tint }); }
        }
        this.scaffold.alpha = this.scaffoldPaint.alpha = fading ? d.strip : 1;
      } else { if (this.body.filters) this.body.filters = null; setTex(this.body, this.full); setTex(this.paint, this.fullPaint); this.body.y = this.paint.y = b.y; vis(this.paint, this.body.visible); paintAs(this.body, this.paint, this.seat, 0xffffff, flashA); }
    }
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
  /** The done moment is over: full color, no filter, nothing of the site left (the next update draws it standing). */
  endFade() {
    this.doneT = null;
    if (this.fadeLook) { this.body.filters = null; this.roof.filters = null; this.fadeLook.destroy(); this.fadeLook = null; }
    vis(this.roof, false); vis(this.found, false); vis(this.scaffold, false); vis(this.scaffoldPaint, false);
  }
  /** An Expedition site's pulsing ring while a Bot works on it (`k`: its strength, fading out on the done moment). Seen
   *  through fog, only the remembered ghost. */
  workRing(b, t, live, k) {
    if (!b.done) this.ringOn = live && G.units.some(u => u.task.t === 'build' && u.task.b === b); // (the ring only while a Bot works; on the done moment, if one was)
    if (!this.ringOn || k <= 0) return;
    const cy = b.y + b.h * TILE * 0.3, rx = b.w * TILE * 0.62, ry = b.h * TILE * 0.36, pulse = (0.55 + 0.35 * Math.sin(t * 4)) * k;
    bars.ellipse(b.x, cy, rx, ry).fill({ color: 0xff9a5c, alpha: 0.1 * pulse }).stroke({ width: 2, color: 0xffa070, alpha: 0.8 * pulse });
    bars.ellipse(b.x, cy, rx * 0.7, ry * 0.7).stroke({ width: 1, color: 0xffe6d0, alpha: 0.5 * pulse });
  }
  /** Shown or not (update, after this, decides the parts of a shown one). Visibility is only ever set to what it should
   *  be, never on and off again in one frame: each change rebuilds the layer's draw list. */
  show(v) { vis(this.body, v); vis(this.worn, v); if (!v) { for (const s of [this.paint, this.found, this.scaffold, this.scaffoldPaint, this.roof, this.head, this.headPaint, this.glow]) vis(s, false); } }
  destroy() { this.fadeLook?.destroy(); for (const s of [this.worn, this.found, this.body, this.paint, this.scaffold, this.scaffoldPaint, this.roof, this.head, this.headPaint, this.glow, this.fallFlash]) if (s) s.destroy(); }
  /** It fell (look.js bldgDeath, `plan`): from now on a ghost, out of the pool, until `plan.life` s have passed. */
  fall(plan) {
    this.found.visible = false;
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
export const dyingShown = () => dying.map(o => ({ id: o.id, type: o.type, t: o.dying.t, portal: o.dying.plan.portal, y: o.body.y, y0: o.dying.y0[0], scaleX: o.body.scale.x, scaleY: o.body.scale.y, alpha: o.body.alpha, paint: o.paint.alpha, tint: o.body.tint, shown: o.body.visible, flash: o.fallFlash?.alpha ?? 0 }));
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
 *  its drawn height, a building's nearest wall), and with `puff` (look.js MELEE_PUFF) dust kicked up at its feet. */
export function meleeHit(u, t, puff) {
  let x = t.x, y = t.y;
  if (t.kind === 'bldg') { x = Math.min(Math.max(u.x, t.tx * TILE + 4), (t.tx + t.w) * TILE - 4); y = Math.min(Math.max(u.y, t.ty * TILE + 4), (t.ty + t.h) * TILE - 4); }
  const lift = t.kind === 'bldg' ? 10 : unitTop(t.type) * 0.5, dx = u.x - x, dy = u.y - y, d = Math.hypot(dx, dy) || 1, k = t.kind === 'bldg' ? 0 : Math.min(t.r * 0.6, d);
  addEffect('glint', x + dx / d * k, y + dy / d * k - lift, { life: 0.15, light: 0xfff6e0, lightScale: 0.12 }); // (steel's glint: small and pale; fire is the gunpowder's)
  if (puff) addEffect(HIT_DUST.anim, x + dx / d * k, y + 2, { vx: -dx / d * puff.drift, vy: -6, life: puff.life, scale: puff.scale, fade: puff.fade, tint: HIT_DUST.tint });
}
/** Where a shot that lands at ground point (x, y) plays, its y: on a flyer (`air`, its kind: a `hit` event's) up on its
 *  body (look.js hitLift of its drawn height: by its kind), anything else where it is. */
export const hitY = (y, air) => (air ? y - unitTop(air) * hitLift(air) : y);
/** A shot lands at (x, y), its look by `how` (look.js impactOf): steel's glint (an arrow, a bolt, a dart), a spark
 *  (a tracer, the tower's shot), the cannonball's and the rocket's burst, or a repairer's welding spark. */
export function impactFx(x, y, how) {
  if (how === 'glint') addEffect('glint', x, y, { life: 0.15, light: 0xfff6e0, lightScale: 0.12 });
  else if (how === 'shell' || how === 'rocket') addEffect('boom_small', x, y, { light: 0xffb545, lightScale: 0.5, life: 0.35, scale: how === 'shell' ? 0.7 : 0.6 });
  else if (how === 'spark') addEffect('spark', x, y, { life: 0.18, light: 0xfff4c2, lightScale: 0.2 });
  else addEffect('spark', x, y, { life: 0.18, light: 0xfff4c2, lightScale: 0.3 }); // (welding)
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
function pooled(pool, i, make) { if (!pool[i]) pool[i] = make(); pool[i].visible = true; return pool[i]; }

let fogTick = -1;
/** The fog shown or not, on the map and the minimap (on, always, in a game; off only for the docs' staged screenshots,
 *  tools/docs/shots.mjs: the whole map's ground then shows, on the minimap too). */
export const showFog = (on) => { L.fog.visible = !!on; mmAt = -Infinity; };
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
/** Two bars: construction is paused because nobody is building. Opaque over anything (an Expedition's faint hologram
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

/** The buildings' bars drawn this frame (read-only, for the tests): each one's building, kind ('build', 'hp'), top and
 *  height in world px. */
const barsDrawn = [];
/** How the buildings on screen are drawn now (read-only, for the tests): each one's look ('raw': the Kingdom's unpainted
 *  site, 'holo': the Expedition's hologram, 'fade': its done moment, 'full'), the done moment's time, its body (tint,
 *  opacity, drawn height in world px, its color filter's saturation), its paint, roof slice, scaffold or bud and
 *  foundation, and its bars; and our builders' strikes so far (`strikes`, by unit id). */
export const sitesShown = () => ({
  bldgs: [...bldgObjs.values()].filter(o => o.body.visible).map(o => {
    const f = o.body.filters?.[0], m = f?.matrix;
    return { id: o.id, type: o.type, done: o.b.done, look: o.doneT !== null ? 'fade' : o.b.done ? 'full' : o.bud ? 'holo' : 'raw', fadeT: o.doneT,
      tint: o.body.tint, alpha: o.body.alpha, height: o.body.texture.height, fullHeight: o.full.height, sat: m ? (m[0] - 0.2126) / (1 - 0.2126) : 1,
      paint: o.paint.visible ? o.paint.alpha : 0, roof: o.roof?.visible ? o.roof.alpha : 0, scaffold: o.scaffold.visible ? o.scaffold.alpha : 0, found: o.found.visible ? o.found.alpha : 0,
      bars: barsDrawn.filter(r => r.id === o.id).map(r => ({ ...r })) };
  }),
  strikes: Object.fromEntries([...unitObjs.values()].filter(o => o.strikesSeen).map(o => [o.id, o.strikesSeen])),
});
let lastT = 0, frameNo = 0;
/** sel: the client's current selection; place: pending building placement or null. */
export function render(selList, place) {
  const t = G.time, now = performance.now() / 1000, dt = Math.min(0.1, lastT ? now - lastT : 0.016); lastT = now; frameNo++;
  const sel = new Set(selList), VW = vw(), VH = vh();
  let sx = 0, sy = 0; // (a fall's shake: only a headquarters', look.js fallShake)
  if (quake) { quake.t += dt; const a = quake.px * (1 - quake.t / quake.life); if (a <= 0) quake = null; else { sx = (Math.random() * 2 - 1) * a; sy = (Math.random() * 2 - 1) * a; } }
  world.scale.set(cam.zoom);
  world.position.set(Math.round((-cam.x + sx) * cam.zoom), Math.round((-cam.y + sy) * cam.zoom));
  const inView = (x, y, m) => x > cam.x - m && x < cam.x + VW + m && y > cam.y - m && y < cam.y + VH + m;
  const explored = G.explored;
  cullTerrain(cam.x, cam.y, cam.x + VW, cam.y + VH);
  noteBuildings(); // (what this side has seen of enemy buildings: in the fog, their last-seen state, never the live one)
  const shownB = shownBldgs();
  if (now - doodadCheck > 0.25 || now < doodadCheck || shownB.length !== doodadBldgs) { doodadCheck = now; doodadBldgs = shownB.length; hideCoveredDoodads(); }
  bars.clear(); lines.clear(); selG.clear(); flag.visible = false; barsDrawn.length = 0;
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
    // An own site: its construction bar in the hp bar's place over it, taller (construct.js BUILD_BAR), the hp bar just
    // above only if it has taken damage; a pause mark while nobody builds it.
    const ownSite = b.team === G.me && !b.done, hx = b.tx * TILE + 4, hy = b.ty * TILE - 8, hw = b.w * TILE - 8;
    if (ownSite) {
      progressBar(hx, hy - (BUILD_BAR.h - 4), hw, b.progress, BUILD_BAR.color, 0, BUILD_BAR.h); barsDrawn.push({ id: b.id, bar: 'build', y: hy - (BUILD_BAR.h - 4), h: BUILD_BAR.h });
      if (seen && siteHurt(b)) { hpBar(hx, hy - BUILD_BAR.h, hw, b.hp, b.maxhp, b.sh, b.maxsh); barsDrawn.push({ id: b.id, bar: 'hp', y: hy - BUILD_BAR.h, h: 4 }); }
      if (!G.units.some(u => u.task.t === 'build' && u.task.b === b)) pauseMark(b.x, b.y, now);
    } else if (seen && (sel.has(b) || b.hp < b.maxhp || b.sh < b.maxsh)) { hpBar(hx, hy, hw, b.hp, b.maxhp, b.sh, b.maxsh); barsDrawn.push({ id: b.id, bar: 'hp', y: hy, h: 4 }); }
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
    if (bar) { const r = u.r * UNIT_SCALE; hpBar(u.x - r - 2, u.y - unitTop(u.type) - 7, r * 2 + 4, u.hp, u.maxhp, u.sh, u.maxsh); } // (just over the art's top)
    if (u.team === G.me && RADIO.machines.has(u.type) && G.radio.length && !inRange(G.radio, u.x, u.y)) { // (the sim's rule: exact distance)
      noSignal(u.x, u.y - unitTop(u.type) - (bar ? 18 : 11)); markedIds.add(u.id);
    }
  });
  showRange(selList, place, now);
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

/** Tests: every unit's and building's layers (art and team mask frame names, the mask's tint, the body's tint, how
 *  opaque, a unit's slow glow: the flash layer's tint and alpha while it shows without a hit flash) and its seat's tint. */
export const teamLayers = () => [...unitObjs, ...bldgObjs].map(([id, o]) => ({ id, base: o.body.texture.label, mask: o.paint.texture.label, tint: o.paint.tint, bodyTint: o.body.tint, glow: o.flash?.visible && !o.paintFlash.visible ? { tint: o.flash.tint, alpha: o.flash.alpha } : null, seat: o.seat, maskOver: o.paint.parent === o.body.parent && o.body.parent.getChildIndex(o.paint) > o.body.parent.getChildIndex(o.body), shown: o.body.visible && (o.node || o.body).visible, alpha: o.body.alpha }));

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
  c.imageSmoothingEnabled = false; c.clearRect(0, 0, mm.width, mm.height); c.drawImage(thumb, 0, 0, mm.width, mm.height);
  // Gold mines gold, their footprint: not any seat's color.
  const revealed = !L.fog.visible; // (showFog: the docs' staged shots)
  for (const n of map.nodes) if (revealed || G.explored[idx(n.tx, n.ty)]) { c.fillStyle = MM_GOLD; c.fillRect(n.tx * TILE * S, n.ty * TILE * T, Math.max(3, n.w * TILE * S), Math.max(3, n.h * TILE * T)); }
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
  if (!revealed) c.drawImage(fogCv, 0, 0, mm.width, mm.height);
}
// The minimap's coverage: an Expedition seat's always (its people's headquarters gives coverage), the union's edge
// alone as one outline, over everything the fog draws (it went under the fog image first, and the black of unexplored
// ground hid most of it: with an Uplink's wide circle, all of it). In CSS px whatever the screen: the canvas keeps its
// own pixel size (168) and is scaled to the minimap's box, so the widths are scaled back by the box's size.
const MM_RIM = { line: 1.25, halo: 2.5, color: 'rgba(191,233,255,0.8)', haloColor: 'rgba(11,18,32,0.5)' };
let mmRimArcs = 0, mmRimKey = '', mmArcs = [], mmRimCss = null;
function minimapRim(c, S, T) {
  const key = `${G.radioVer}:${G.me}`;
  if (key !== mmRimKey) { mmRimKey = key; mmArcs = coverageOf(FACTIONS[G.factions[G.me]]?.hq) > 0 ? unionArcs(G.radio) : []; }
  const arcs = mmArcs;
  mmRimArcs = arcs.length;
  if (!arcs.length) return;
  const k = mm.clientWidth > 0 ? mm.width / mm.clientWidth : 1; // (canvas px per CSS px)
  mmRimCss = { line: MM_RIM.line, halo: MM_RIM.halo, canvasPerCss: k };
  c.save();
  c.beginPath();
  for (const [x, y, r, a0, a1] of arcs) { c.moveTo((x + Math.cos(a0) * r) * S, (y + Math.sin(a0) * r) * T); c.ellipse(x * S, y * T, r * S, r * T, 0, a0, a1); }
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = MM_RIM.haloColor; c.lineWidth = MM_RIM.halo * k; c.stroke();
  c.strokeStyle = MM_RIM.color; c.lineWidth = MM_RIM.line * k; c.stroke();
  c.restore();
}
