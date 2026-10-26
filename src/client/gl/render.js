// WebGL renderer (PixiJS 8) over the generated sprite sheets in public/art/ (pre-rendered 3D units and buildings
// with their shadows baked in, painted terrain and effects, all at 2x resolution). Exports the camera, view,
// resize/centerOn, renderTerrain() once per map and render(sel, place) every frame. Draws terrain on a dual grid,
// resources, buildings, units in 16 facings, projectiles, explosions, additive lights and a soft fog layer. Visual-only randomness (smoke, debris) uses Math.random: it never feeds the sim.
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js';
import { G, FACTIONS, map, idx, TILE, MW, MH, WW, WH, BUILDINGS, UNITS, UNIT_WARP, clamp, mulberry, canPlace, visibleEnt } from '../../engine/index.js';
import { fx } from '../fx.js';
import { BLDG_LOOK, UNIT_FPS } from '../look.js';
import { drag } from '../input.js';
import { scatterDoodads } from '../scenery.js';

export const cv = document.getElementById('game');
export const mm = document.getElementById('minimap'), mctx = mm.getContext('2d');
export const view = { w: 800, h: 500, dpr: 1 };
/** Camera: top-left corner in world px, and zoom (screen px per world px). */
export const cam = { x: 0, y: 0, zoom: matchMedia('(pointer: coarse)').matches ? 1.75 : innerWidth >= 1100 ? 2 : 1.5 };
export const ZOOM_MIN = 0.75, ZOOM_MAX = 2.5;
export const ALLY = '#f5a524', ALLY2 = '#ffd27a', FOE = '#e2457a', FOE2 = '#ff8bb0';
/** Units are drawn larger than their collision radius so they are easy to see and to tap. */
export const UNIT_SCALE = 1.2;
/** Flyers are drawn this many world px above the ground point they occupy (their art hovers). */
export const AIR_LIFT = 12;
const hexn = (s) => parseInt(s.slice(1), 16);

TextureSource.defaultOptions.scaleMode = 'linear';
TextureSource.defaultOptions.autoGenerateMipmaps = true;
const app = new Application();
await app.init({ canvas: cv, background: 0x0b0f16, antialias: false, roundPixels: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoStart: false, preference: 'webgl' });
// atlas.json indexes the pages (each a PixiJS spritesheet at scale 2) and the animations, which may span pages.
const artBase = new URL('art/', document.baseURI).href;
const index = await (await fetch(artBase + 'atlas.json')).json();
const textures = {}, frames = {};
for (const sh of await Promise.all(index.pages.map(p => Assets.load(artBase + p)))) {
  Object.assign(textures, sh.textures);
  // HUD portraits are cut from a plain decoded copy of the page (the browser has it cached): reading back Pixi's
  // GPU-side texture costs about a second per page.
  const img = new Image(); img.src = new URL(sh.data.meta.image, artBase).href;
  for (const [n, f] of Object.entries(sh.data.frames)) frames[n] = { img, f: f.frame, a: f.anchor || { x: 0.5, y: 0.5 } };
}
await Promise.all([...new Set(Object.values(frames).map(f => f.img))].map(i => i.decode().catch(() => {})));
const iconCache = new Map();
/**
 * A small portrait of a sprite for the HTML HUD, as a data URL: the frame scaled so its larger side is `zoom` x
 * `size` css px, centred a little above its ground point, cut to a size x size square. Cached.
 */
export function artIcon(name, size = 28, zoom = 1) {
  const key = `${name}|${size}|${zoom}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const fr = frames[name]; let url = '';
  if (fr) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), n = Math.round(size * dpr), { x, y, w, h } = fr.f;
    const c = document.createElement('canvas'); c.width = c.height = n;
    const ctx = c.getContext('2d', { willReadFrequently: true }), k = n * zoom / Math.max(w, h); // a CPU canvas: no GPU upload of the page
    const cx = w * fr.a.x, cy = h * fr.a.y - h * 0.08;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fr.img, x, y, w, h, n / 2 - cx * k, n / 2 - cy * k, w * k, h * k);
    url = c.toDataURL();
  }
  iconCache.set(key, url);
  return url;
}
const tex = (name) => textures[name] || Texture.EMPTY;
const sheet = { animations: Object.fromEntries(Object.entries(index.animations).map(([k, names]) => [k, names.map(tex)])) };
const FACINGS = index.facings || 16;
/** Point a sprite at a texture and adopt the texture's anchor (where the ground point sits in the art). */
const setTex = (s, t) => { if (s.texture !== t) { s.texture = t; s.anchor.copyFrom(t.defaultAnchor || { x: 0.5, y: 0.5 }); } };

// ---- scene ----
const world = new Container();
const L = {};
for (const k of ['terrain', 'scenery', 'shade', 'decals', 'nodes', 'sel', 'shadows', 'bldgs', 'units', 'air', 'projs', 'fx', 'lights', 'fog', 'overlay']) world.addChild(L[k] = new Container());
L.units.sortableChildren = true; L.bldgs.sortableChildren = true; L.air.sortableChildren = true;
L.lights.blendMode = 'add';
const screen = new Container();
app.stage.addChild(world, screen);
const bars = new Graphics(); L.overlay.addChild(bars);
const lines = new Graphics(); L.overlay.addChild(lines);
const box = new Graphics(); screen.addChild(box);
const ghost = new Sprite(); ghost.alpha = 0.6; L.overlay.addChild(ghost);
const ghostRect = new Graphics(); L.overlay.addChild(ghostRect);

// ---- camera ----
let shake = 0;
export function resize() {
  const r = cv.parentElement.getBoundingClientRect();
  view.w = Math.max(200, r.width | 0); view.h = Math.max(160, r.height | 0); view.dpr = app.renderer.resolution;
  const hud = document.getElementById('hud'); hudFloats = !hud || getComputedStyle(hud).position === 'fixed';
  app.renderer.resize(view.w, view.h); clampCam();
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
/** Zoom by `factor`, keeping the world point under screen point (sx, sy) fixed. */
export function zoomAt(factor, sx, sy) {
  const before = toWorld(sx, sy);
  cam.zoom = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  cam.x = before.x - sx / cam.zoom; cam.y = before.y - sy / cam.zoom; clampCam();
}

// ---- terrain (once per map) ----
// A pixel per tile: the minimap's ground, the fog and the large-scale shading, at the map's size (sizeGrids).
const thumb = document.createElement('canvas');
const fog = new Sprite(); fog.scale.set(TILE); L.fog.addChild(fog);
let fogCv, fogCtx, fogImg, fogTex, shadeCv, shadeCtx, shadeTex, gridW = 0, gridH = 0;
/** Make the per-tile canvases and textures for a map of MW x MH (again only when a game's map has another size). */
function sizeGrids() {
  if (gridW === MW && gridH === MH) return;
  gridW = MW; gridH = MH;
  const canvas = () => { const c = document.createElement('canvas'); c.width = MW; c.height = MH; return c; };
  const texture = (c) => { const t = Texture.from(c); t.source.scaleMode = 'linear'; return t; };
  thumb.width = MW; thumb.height = MH;
  const old = [fogTex, shadeTex];
  fogCv = canvas(); fogCtx = fogCv.getContext('2d'); fogImg = fogCtx.createImageData(MW, MH); fogTex = texture(fogCv); fog.texture = fogTex;
  shadeCv = canvas(); shadeCtx = shadeCv.getContext('2d'); shadeTex = texture(shadeCv);
  for (const t of old) t?.destroy(true); // (the shade sprite that used it goes in renderTerrain, before this)
}
sizeGrids();

const chunks = [];
const doodads = [];
let doodadCheck = 0, doodadBldgs = -1; // wall-clock time of the last check, building count then
/** Ground props under a building (its footprint or the tiles around their centre) are hidden. */
function hideCoveredDoodads() {
  for (const d of doodads) if (d.ground) {
    let covered = false;
    for (let dy = -1; dy <= 1 && !covered; dy++) for (let dx = -1; dx <= 1; dx++) if (map.occ[idx(d.tx + dx, d.ty + dy)] > 0) { covered = true; break; }
    d.s.visible = !covered;
  }
}
function cullTerrain(x0, y0, x1, y1) { for (const c of chunks) if (c) c.visible = c.cx + 9 * TILE > x0 && c.cx - TILE < x1 && c.cy + 9 * TILE > y0 && c.cy - TILE < y1; }

export function renderTerrain() {
  L.terrain.removeChildren().forEach(c => c.destroy({ children: true }));
  L.shade.removeChildren().forEach(c => c.destroy());
  sizeGrids();
  const rnd = mulberry(G.seed * 7 + 3);
  const rock = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH || map.rock[idx(x, y)] ? 1 : 0;
  // Dual grid: the cell between tiles (i,j)..(i+1,j+1) is drawn at its centre, offset half a tile.
  // Tiles go into 8x8-cell chunks so only the chunks on screen are drawn (no baking: it would cost a 4096² texture).
  chunks.length = 0;
  for (let j = -1; j < MH; j++) for (let i = -1; i < MW; i++) {
    const m = rock(i, j) | rock(i + 1, j) << 1 | rock(i, j + 1) << 2 | rock(i + 1, j + 1) << 3;
    const r = rnd();
    const name = m === 0 ? `ground_${r < 0.82 ? 0 : 1 + ((r * 100) | 0) % 5}` : `rock_${m}_${((r * 3) | 0)}`;
    const ci = (j + 1) >> 3, cj = (i + 1) >> 3, key = ci * 64 + cj;
    let c = chunks[key]; if (!c) { c = chunks[key] = new Container(); c.cx = cj * 8 * TILE; c.cy = ci * 8 * TILE; L.terrain.addChild(c); }
    const s = new Sprite(tex(name)); s.anchor.set(0); s.position.set(i * TILE + 16, j * TILE + 16); c.addChild(s);
  }
  // Large-scale variation so the tiles never read as a grid.
  const img = shadeCtx.createImageData(MW, MH);
  for (let i = 0; i < MW * MH; i++) { const s = Math.min(1, Math.max(0, (map.shade[i] - 0.2) * 1.8)); img.data.set([Math.min(255, Math.round(130 + 125 * s + 12 * s)), Math.round(130 + 120 * s), Math.round(135 + 110 * s), 255], i * 4); }
  shadeCtx.putImageData(img, 0, 0); shadeTex.source.update();
  const vs = new Sprite(shadeTex); vs.scale.set(TILE); vs.blendMode = 'multiply'; L.shade.addChild(vs); // over the scenery too
  // Scenery: props on the plateaus and the open ground (see scenery.js); ground props hide under buildings.
  L.scenery.removeChildren().forEach(c => c.destroy()); doodads.length = 0;
  const cores = G.bldgs.filter(b => b.d.hq).map(b => ({ tx: b.tx + b.w / 2, ty: b.ty + b.h / 2 }));
  for (const d of scatterDoodads(G.seed, map, cores, { MW, MH, TILE, mulberry })) {
    const s = new Sprite(); setTex(s, tex(`doodad_${d.name}`)); s.position.set(d.x, d.y); L.scenery.addChild(s);
    doodads.push({ s, tx: d.tx, ty: d.ty, ground: d.ground });
  }
  // Minimap background.
  const th = thumb.getContext('2d');
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { th.fillStyle = map.rock[idx(x, y)] ? '#3b4556' : `hsl(214,18%,${18 + map.shade[idx(x, y)] * 9}%)`; th.fillRect(x, y, 1, 1); }
  for (const pool of [unitObjs, bldgObjs, nodeObjs]) { for (const o of pool.values()) o.destroy(); pool.clear(); }
  L.decals.removeChildren().forEach(c => c.destroy()); decals.length = 0;
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
/** Corner brackets round a building's footprint (or any rectangle). */
function selCorners(x, y, w, h, color) {
  const k = Math.min(w, h) * 0.24;
  for (const [lw, c, a] of [[4, 0x000000, 0.45], [2, color, 0.95]]) {
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) lines.moveTo(cx + dx * k, cy).lineTo(cx, cy).lineTo(cx, cy + dy * k);
    lines.stroke({ width: lw, color: c, alpha: a, cap: 'round' });
  }
}

class UnitObj {
  constructor(u) {
    const layer = u.d.air ? L.air : L.units;
    this.air = !!u.d.air;
    this.frames = (sheet.animations[`${u.type}_${u.team}_0`] || [0]).length;
    this.body = new Sprite(); this.body.scale.set(UNIT_SCALE); layer.addChild(this.body);
    this.flash = new Sprite(); this.flash.scale.set(UNIT_SCALE); this.flash.blendMode = 'add'; layer.addChild(this.flash);
    this.size = u.r > 12 ? 26 : 18;
    this.ring = selArcs(this.size * 0.95, this.size * 0.6, u.team === G.me ? SEL : SEL_FOE); this.ring.visible = false; L.sel.addChild(this.ring);
    this.cargo = light(0x4fd1c5, 0.18, 0.9);
    this.px = u.x; this.py = u.y; this.walk = 0;
  }
  update(u, t, sel, dt) {
    const moved = Math.hypot(u.x - this.px, u.y - this.py); this.px = u.x; this.py = u.y;
    if (moved > 0.05 || this.air) this.walk += dt * (UNIT_FPS[u.type] ?? (this.air ? 14 : 8)); // rotors always spin
    const frames = this.frames, f = Math.floor(this.walk) % frames;
    const dir = ((Math.round(u.face / (Math.PI * 2) * FACINGS) % FACINGS) + FACINGS) % FACINGS;
    const tx = tex(`${u.type}_${u.team}_${dir}_${f}`);
    setTex(this.body, tx); setTex(this.flash, tx);
    const glide = UNIT_FPS[u.type] === 0, bob = this.air ? Math.sin(t * (glide ? 1.6 : 3) + u.id) * (glide ? 2 : 1.2) : 0; // (a glider rides a slower, deeper swell)
    this.body.position.set(u.x, u.y + bob); this.flash.position.set(u.x, u.y + bob);
    this.body.zIndex = u.y; this.flash.zIndex = u.y + 0.1;
    this.flash.visible = u.flash > 0; this.flash.alpha = 0.6;
    // Abilities: a boost glows (Stim warm, Overcharge violet); an entrenched unit shows four stakes around it, pulsing
    // while it digs in or packs up.
    this.body.tint = u.boost ? (Math.sin(t * 10) > 0 ? BOOST_TINT[u.boost] ?? 0xffffff : 0xffffff) : 0xffffff;
    // Warping in at a power field (the Vael): a violet ghost, more solid as it lands, inside a pulsing ring, like a site.
    const warp = u.warp > 0 ? u.warp / UNIT_WARP : 0;
    // Cloaked (ours, or theirs where we detect it): a faint shimmer of itself.
    const cloak = u.cloaked ? 0.38 + 0.08 * Math.sin(t * 5 + u.id) : 1;
    this.body.alpha = warp ? 0.2 + 0.65 * (1 - warp) : cloak;
    if (warp) {
      this.body.tint = u.flash > 0 ? 0xffffff : 0xcbb6ff;
      const rx = this.size * 1.1, ry = this.size * 0.6, pulse = 0.55 + 0.35 * Math.sin(t * 6);
      bars.ellipse(u.x, u.y + 4, rx, ry).fill({ color: 0x9b7bff, alpha: 0.12 * pulse }).stroke({ width: 2, color: 0xb48cff, alpha: 0.85 * pulse });
    }
    if (u.mode || u.swap > 0) {
      const r = u.r * UNIT_SCALE + 6, a = u.swap > 0 ? 0.35 + 0.35 * Math.sin(t * 8) : 0.85;
      for (let k = 0; k < 4; k++) { const an = Math.PI / 4 + k * Math.PI / 2, c = Math.cos(an), d = Math.sin(an); lines.moveTo(u.x + c * r, u.y + d * r * 0.7).lineTo(u.x + c * (r + 5), u.y + d * (r + 5) * 0.7).stroke({ width: 2, color: 0xf5c542, alpha: a }); }
    }
    const s = sel.has(u);
    this.ring.visible = s; if (s) this.ring.position.set(u.x, u.y + 3);
    this.cargo.visible = !!u.carry;
    if (u.carry) { this.cargo.tint = u.carryType === 'ether' ? 0xa78bfa : 0x4fd1c5; this.cargo.position.set(u.x - Math.cos(u.face) * 5, u.y - Math.sin(u.face) * 5 - 8); this.cargo.alpha = 0.7 + 0.3 * Math.sin(t * 6); }
  }
  show(v) { this.body.visible = v; if (!v) { this.flash.visible = this.ring.visible = this.cargo.visible = false; } }
  destroy() { for (const s of [this.body, this.flash, this.ring, this.cargo]) s.destroy(); }
}

const STAGES = 8, stageTex = {};
/** The bottom `k/STAGES` of a building texture, for the rising-from-the-ground construction reveal. */
function stage(name, k) {
  const key = name + k; if (stageTex[key]) return stageTex[key];
  const base = tex(name), fr = base.frame, h = Math.max(1, Math.round(fr.height * k / STAGES));
  const t = new Texture({ source: base.source, frame: new Rectangle(fr.x, fr.y + fr.height - h, fr.width, h) });
  t.defaultAnchor = { x: base.defaultAnchor.x, y: 1 }; // bottom-aligned: the footprint stays put while the rest rises
  return stageTex[key] = t;
}

class BldgObj {
  constructor(b) {
    const n = b.w;
    this.found = new Sprite(); setTex(this.found, tex(`foundation_${n}`)); L.bldgs.addChild(this.found);
    this.body = new Sprite(); setTex(this.body, tex(`bldg_${b.type}_${b.team}`)); L.bldgs.addChild(this.body);
    this.scaffold = new Sprite(); setTex(this.scaffold, tex(`scaffold_${n}`)); L.bldgs.addChild(this.scaffold);
    this.full = tex(`bldg_${b.type}_${b.team}`);
    this.look = BLDG_LOOK[b.type] || {};
    this.head = this.look.head ? new Sprite() : null; if (this.head) L.bldgs.addChild(this.head);
    const glow = this.look.glow;
    this.glow = glow ? light(glow[0], glow[1], glow[2]) : null;
    this.smokeT = 0; this.type = b.type;
    for (const s of [this.found, this.body, this.scaffold]) s.position.set(b.x, b.y);
    const z = (b.ty + b.h) * TILE; this.found.zIndex = z - 2; this.body.zIndex = z; this.scaffold.zIndex = z + 1; if (this.head) this.head.zIndex = z + 2;
  }
  /** `live`: the player can see it right now (otherwise it is a remembered silhouette: no smoke, no aiming). */
  update(b, t, dt, live) {
    const name = `bldg_${b.type}_${b.team}`;
    this.found.visible = !b.done;
    this.scaffold.visible = !b.done;
    if (b.done) { setTex(this.body, this.full); this.body.y = b.y; }
    else { // the bottom k/8 of the art, its bottom edge where the full sprite's would be
      const k = Math.max(1, Math.min(STAGES, Math.ceil(b.progress * STAGES))); setTex(this.body, stage(name, k));
      this.body.y = b.y + (1 - this.full.defaultAnchor.y) * this.full.height;
    }
    this.body.alpha = b.flash > 0 ? 0.75 : 1; // hit flash
    this.body.tint = b.done && !b.powered ? 0x6f6a88 : 0xffffff; // dark: no power field covers it
    if (!b.done && FACTIONS[G.factions[b.team]]?.warp) this.warpIn(b, t, live);
    if (this.head) { this.head.visible = b.done && live; const dir = ((Math.round((b.aim || 0) / (Math.PI * 2) * FACINGS) % FACINGS) + FACINGS) % FACINGS; setTex(this.head, tex(`${this.look.head}_${b.team}_${dir}`)); this.head.position.set(b.x, b.y); }
    if (this.glow) { const g = this.look.glow; this.glow.visible = b.done; this.glow.position.set(b.x, b.y - g[3]); this.glow.alpha = g[4] ? 0.3 + 0.15 * Math.sin(t * 9) : 0.35 + 0.12 * Math.sin(t * 2.5); }
    // Damage: smoke below half health, fire below a quarter.
    const f = b.hp / b.maxhp;
    if (live && b.done && f < 0.5) { this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = f < 0.25 ? 0.12 : 0.3; const x = b.tx * TILE + 8 + Math.random() * (b.w * TILE - 16), y = b.ty * TILE + 8 + Math.random() * (b.h * TILE - 16); addEffect('puff', x, y, { vy: -18, life: 1.2 }); if (f < 0.25 && Math.random() < 0.5) addEffect('flash', x, y + 4, { life: 0.25, light: 0xff8a2a }); } }
    const sm = this.look.smoke; // chimneys
    if (live && sm && b.done && Math.random() < dt * 2.5) { const [sx, sy] = sm[Math.floor(Math.random() * sm.length)]; addEffect('puff', b.tx * TILE + sx, b.ty * TILE + sy, { vy: -22, life: 1.5 }); }
  }
  /** A warp-in site (the Vael): no scaffold or foundation; the whole building fades in as a violet ghost, more solid as
   *  it grows, inside a pulsing warp ring once planted (a site still waiting for its Lumen is a fainter ghost, no
   *  ring). Seen through fog, only the remembered ghost. */
  warpIn(b, t, live) {
    this.found.visible = this.scaffold.visible = false;
    setTex(this.body, this.full); this.body.y = b.y;
    this.body.alpha = (b.planted ? 0.22 + 0.6 * b.progress : 0.15) + (b.flash > 0 ? 0.15 : 0); // (brighter when hit)
    this.body.tint = b.flash > 0 ? 0xffffff : 0xcbb6ff;
    if (!live || !b.planted) return;
    const cy = b.y + b.h * TILE * 0.3, rx = b.w * TILE * 0.62, ry = b.h * TILE * 0.36, pulse = 0.55 + 0.35 * Math.sin(t * 4);
    bars.ellipse(b.x, cy, rx, ry).fill({ color: 0x9b7bff, alpha: 0.1 * pulse }).stroke({ width: 2, color: 0xb48cff, alpha: 0.8 * pulse });
    bars.ellipse(b.x, cy, rx * 0.7, ry * 0.7).stroke({ width: 1, color: 0xe2d6ff, alpha: 0.5 * pulse });
  }
  show(v) { for (const s of [this.found, this.body, this.scaffold]) s.visible = s.visible && v; if (!v) { if (this.head) this.head.visible = false; if (this.glow) this.glow.visible = false; } }
  destroy() { for (const s of [this.found, this.body, this.scaffold, this.head, this.glow]) if (s) s.destroy(); }
}

class NodeObj {
  constructor(n) {
    this.ether = n.type === 'ether';
    this.s = new Sprite(); this.s.position.set(n.x, n.y); L.nodes.addChild(this.s);
    this.glow = light(this.ether ? 0xa78bfa : 0x4fd1c5, this.ether ? 1.1 : 0.55, this.ether ? 0.45 : 0.25); this.glow.position.set(n.x, n.y);
  }
  update(n, t) {
    if (this.ether) { const dry = n.amount <= 0; setTex(this.s, tex(`vent_${Math.floor(t * (dry ? 2 : 6)) % 4}`)); this.s.alpha = dry ? 0.6 : 1; this.glow.alpha = n.extractor || dry ? 0 : 0.35 + 0.15 * Math.sin(t * 2 + n.x); }
    else { const k = n.amount > 1100 ? 0 : n.amount > 700 ? 1 : n.amount > 300 ? 2 : 3; setTex(this.s, tex(`shard_${k}`)); this.glow.alpha = 0.18 + 0.06 * Math.sin(t * 1.7 + n.y); }
  }
  show(v) { this.s.visible = this.glow.visible = v; }
  destroy() { this.s.destroy(); this.glow.destroy(); }
}

function syncPool(pool, list, make, upd) {
  const seen = new Set();
  for (const e of list) { seen.add(e.id); let o = pool.get(e.id); if (!o) pool.set(e.id, o = make(e)); upd(o, e); }
  for (const [id, o] of pool) if (!seen.has(id)) { o.destroy(); pool.delete(id); }
}

// ---- effects ----
const effects = [];
/** Spawn a one-shot animated effect; anim names come from atlas.json (boom_big, boom_small, puff, flash, spark). */
export function addEffect(anim, x, y, o = {}) {
  const frames = sheet.animations[anim]; if (!frames) return;
  const s = new Sprite(frames[0]); s.anchor.set(0.5); s.position.set(x, y); if (o.rot) s.rotation = o.rot; if (o.scale) s.scale.set(o.scale); if (o.tint) s.tint = o.tint;
  L.fx.addChild(s);
  const e = { s, frames, t: 0, life: o.life || frames.length * 0.07, vx: o.vx || 0, vy: o.vy || 0 };
  if (o.light) { e.l = light(o.light, o.lightScale || 1, 0.8); e.l.position.set(x, y); }
  effects.push(e);
}
/** A unit or building died: explosion sized to it, debris, a scorch mark, and a shake for big ones. */
export function boom(x, y, r) {
  const big = r >= 20;
  addEffect(big ? 'boom_big' : 'boom_small', x, y, { light: 0xff9a3a, lightScale: big ? 2.4 : 1.1, life: big ? 0.7 : 0.45, scale: big ? Math.min(2, r / 28) : 1 });
  for (let i = 0; i < (big ? 10 : 4); i++) { const a = Math.random() * 6.28, v = 40 + Math.random() * 90; addEffect('spark', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.3 }); }
  const scorch = new Sprite(tex('light')); scorch.anchor.set(0.5); scorch.tint = 0x000000; scorch.alpha = 0.45; scorch.scale.set(r / 24); scorch.position.set(x, y + 2); L.decals.addChild(scorch);
  decals.push({ s: scorch, t: 0, life: 25 });
  if (big) { shake = Math.min(10, shake + r / 6); const rub = new Sprite(); setTex(rub, tex(`rubble_${Math.min(4, Math.max(2, Math.round(r / 16)))}`)); rub.position.set(x, y); L.decals.addChild(rub); decals.push({ s: rub, t: 0, life: 40 }); }
}
/** A Medic heals: a green sparkle on the patient and a faint light. */
const BOOST_TINT = { stim: 0xffc4b4, overcharge: 0xdcc8ff };
const CAST_TINT = { stim: 0xff8070, entrench: 0xf5c542, blink: 0xb48cff, overcharge: 0xc8a0ff };
/** An ability used: a flash on the caster in its colour (a Blink also leaves a puff where it lands). */
export function castFx(x, y, ability) {
  const tint = CAST_TINT[ability] ?? 0xffffff;
  addEffect('flash', x, y - 6, { life: 0.35, tint, light: tint, lightScale: 0.4 });
  if (ability === 'blink') addEffect('puff', x, y, { tint });
}
/** A Medic's heal (green) or a Halo's mend (violet, the Vael crystal light) landing on its patient. */
export function healFx(x, y, tx, ty, mend = false) { addEffect('heal', tx, ty - 6, { life: 0.4, light: mend ? 0xb48cff : 0x6dff9a, lightScale: 0.35, tint: mend ? 0xc8b0ff : 0xffffff }); void x; void y; }
export function sparkAt(x, y, big) { if (big) addEffect('boom_small', x, y, { light: 0xffb545, lightScale: 0.7, life: 0.35, scale: 0.7 }); else addEffect('spark', x, y, { life: 0.18, light: 0xfff4c2, lightScale: 0.3 }); }
const decals = [];

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.t += dt;
    if (e.t >= e.life) { e.s.destroy(); if (e.l) e.l.destroy(); effects.splice(i, 1); continue; }
    const k = Math.min(e.frames.length - 1, Math.floor(e.t / e.life * e.frames.length));
    e.s.texture = e.frames[k]; e.s.x += e.vx * dt; e.s.y += e.vy * dt; e.vx *= 0.92; e.vy *= 0.97;
    if (e.l) { e.l.alpha = 0.8 * (1 - e.t / e.life); e.l.position.copyFrom(e.s.position); }
  }
  for (let i = decals.length - 1; i >= 0; i--) { const d = decals[i]; d.t += dt; if (d.t > d.life) { d.s.destroy(); decals.splice(i, 1); } else if (d.t > d.life - 5) d.s.alpha = Math.min(d.s.alpha, (d.life - d.t) / 5); }
}

// ---- projectiles and client particles (pooled) ----
const projPool = [], partPool = [];
function pooled(pool, i, make) { if (!pool[i]) pool[i] = make(); pool[i].visible = true; return pool[i]; }

function updateFogImage() {
  const d = fogImg.data, vis = G.vis, ex = G.explored;
  for (let i = 0; i < MW * MH; i++) { d[i * 4] = 5; d[i * 4 + 1] = 7; d[i * 4 + 2] = 11; d[i * 4 + 3] = vis[i] ? 0 : ex[i] ? 140 : 255; }
  fogCtx.putImageData(fogImg, 0, 0); fogTex.source.update();
}

/** A health bar (green to red); `sh/maxsh`: a pale shield bar just above it (the Vael). */
function hpBar(x, y, w, hp, max, sh = 0, maxsh = 0) {
  if (maxsh > 0) { bars.rect(x, y - 4, w, 4).fill({ color: 0x000000, alpha: 0.65 }); bars.rect(x + 1, y - 3, (w - 2) * Math.max(0, sh / maxsh), 2).fill(0xcfe6ff); } // (2 px: readable on a phone)
  const f = Math.max(0, hp / max);
  bars.rect(x, y, w, 4).fill({ color: 0x000000, alpha: 0.65 });
  bars.rect(x + 1, y + 1, (w - 2) * f, 2).fill(f > 0.6 ? 0x5ad67d : f > 0.3 ? 0xffb545 : 0xff5a5a);
}
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

let lastT = 0;
/** sel: the client's current selection; place: pending building placement or null. */
/** `power`: show our power fields (a power building or one that needs power is selected, or the Build list is open). */
export function render(selList, place, power = false) {
  const t = G.time, now = performance.now() / 1000, dt = Math.min(0.1, lastT ? now - lastT : 0.016); lastT = now;
  const sel = new Set(selList), VW = vw(), VH = vh();
  shake *= Math.pow(0.02, dt);
  const sx = shake > 0.3 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0.3 ? (Math.random() - 0.5) * shake : 0;
  world.scale.set(cam.zoom);
  world.position.set(Math.round((-cam.x + sx) * cam.zoom), Math.round((-cam.y + sy) * cam.zoom));
  const inView = (x, y, m) => x > cam.x - m && x < cam.x + VW + m && y > cam.y - m && y < cam.y + VH + m;
  const explored = G.explored;
  cullTerrain(cam.x, cam.y, cam.x + VW, cam.y + VH);
  if (now - doodadCheck > 0.25 || now < doodadCheck || G.bldgs.length !== doodadBldgs) { doodadCheck = now; doodadBldgs = G.bldgs.length; hideCoveredDoodads(); }
  bars.clear(); lines.clear(); flag.visible = false;
  drawTargets(selList, now);
  for (const b of selList) if (b.kind === 'bldg' && b.rally && !b.dead) { dashed(b.x, b.y, b.rally.x, b.rally.y); flagAt(b.rally.x, b.rally.y, t); }

  syncPool(nodeObjs, map.nodes, n => new NodeObj(n), (o, n) => { const v = inView(n.x, n.y, 48) && explored[idx(n.tx, n.ty)]; o.show(!!v); if (v) o.update(n, t); });
  syncPool(bldgObjs, G.bldgs, b => new BldgObj(b), (o, b) => {
    const seen = b.team === G.me || visibleEnt(b);
    let v = inView(b.x, b.y, b.r + 90);
    if (v && !seen) { v = false; for (let y = 0; y < b.h && !v; y++) for (let x = 0; x < b.w; x++) if (explored[idx(b.tx + x, b.ty + y)]) { v = true; break; } }
    o.found.visible = o.body.visible = o.scaffold.visible = true;
    if (v) o.update(b, t, dt, seen);
    o.show(v);
    if (!v) return;
    if (sel.has(b)) selCorners(b.tx * TILE - 2, b.ty * TILE - 2, b.w * TILE + 4, b.h * TILE + 4, b.team === G.me ? SEL : SEL_FOE);
    if (seen && (sel.has(b) || b.hp < b.maxhp || b.sh < b.maxsh)) hpBar(b.tx * TILE + 4, b.ty * TILE - 8, b.w * TILE - 8, b.hp, b.maxhp, b.sh, b.maxsh);
    // Progress shown on the building itself: construction (with a pause mark when nobody builds), then training.
    if (b.team === G.me) {
      const bx = b.tx * TILE + 6, by = (b.ty + b.h) * TILE - 9, bw = b.w * TILE - 12;
      if (!b.done) { progressBar(bx, by, bw, b.progress, 0xf5a524); if (!b.planted && !G.units.some(u => u.task.t === 'build' && u.task.b === b)) pauseMark(b.x, b.y, now); } // (a planted seed grows by itself)
      else if (b.queue.length) progressBar(bx, by, bw - Math.min(4, b.queue.length - 1) * 5, b.prog, 0x5ab8ff, Math.min(4, b.queue.length - 1));
      if (b.done && b.research) { progressBar(bx, by - 9, bw, b.research.prog, 0xb48cff, 0, 7); bars.rect(bx, by - 9, bw, 7).stroke({ width: 1, color: 0xb48cff, alpha: 0.7 }); } // research: taller, outlined
    }
  });
  syncPool(unitObjs, G.units, u => new UnitObj(u), (o, u) => {
    const v = inView(u.x, u.y, 64) && (u.team === G.me || visibleEnt(u)); o.show(v); if (!v) return;
    o.update(u, now, sel, dt);
    if (sel.has(u) || u.hp < u.maxhp || u.sh < u.maxsh) { const r = u.r * UNIT_SCALE; hpBar(u.x - r - 2, u.y - r - 12 - (u.d.air ? AIR_LIFT : 0), r * 2 + 4, u.hp, u.maxhp, u.sh, u.maxsh); }
  });

  let pi = 0;
  for (const p of G.projs) {
    if (p.team !== G.me && !G.vis[idx(clamp((p.x / TILE) | 0, 0, MW - 1), clamp((p.y / TILE) | 0, 0, MH - 1))]) continue;
    const s = pooled(projPool, pi++, () => { const s = new Sprite(); s.anchor.set(0.5); L.projs.addChild(s); s.l = light(0xffd27a, 0.25, 0.7); return s; });
    s.texture = tex(p.type); s.anchor.set(p.type === 'shell' ? 0.5 : p.type === 'missile' ? 0.9 : 1, 0.5);
    if (p.type === 'missile' && Math.random() < dt * 25) addEffect('puff', p.x, p.y, { life: 0.5, scale: 0.45 });
    s.position.set(p.x, p.y); s.rotation = Math.atan2(p.ay - p.y, p.ax - p.x); s.l.visible = true; s.l.position.set(p.x, p.y); s.l.scale.set(p.type === 'shell' ? 0.4 : 0.25);
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

  ghost.visible = !!place; ghostRect.visible = !!place || power; ghostRect.clear();
  const placingPowered = place && BUILDINGS[place.type].needsPower;
  if (power && !placingPowered) for (const s of G.bldgs) if (s.team === G.me && s.done && s.d.power > 0) ghostRect.circle(s.x, s.y, s.d.power * TILE).fill({ color: 0xb48cff, alpha: 0.04 }).stroke({ width: 1, color: 0xb48cff, alpha: 0.35 });
  if (place) {
    const d = BUILDINGS[place.type], ok = canPlace(place.type, place.tx, place.ty, G.me);
    setTex(ghost, tex(`bldg_${place.type}_${G.me}`)); ghost.position.set((place.tx + d.w / 2) * TILE, (place.ty + d.h / 2) * TILE); ghost.tint = ok ? 0xb8ffc8 : 0xff7070;
    ghostRect.rect(place.tx * TILE, place.ty * TILE, d.w * TILE, d.h * TILE).fill({ color: ok ? 0x5ad67d : 0xff5a5a, alpha: 0.18 }).stroke({ width: 2, color: ok ? 0x5ad67d : 0xff5a5a });
    if (d.needsPower) for (const s of G.bldgs) if (s.team === G.me && s.done && s.d.power > 0) ghostRect.circle(s.x, s.y, s.d.power * TILE).fill({ color: 0xb48cff, alpha: 0.07 }).stroke({ width: 1.5, color: 0xb48cff, alpha: 0.6 }); // the power fields it must stand in
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
const SHARD = 0x4fd1c5, ETHER = 0xa78bfa;
/** Colour of a target: shard field teal, ether (vent or extractor being mined) violet, a building to work on amber. */
const targetColor = (e, mining) => e.kind === 'node' ? (e.type === 'ether' ? ETHER : SHARD) : mining ? ETHER : 0xf5a524;
/** Blink the target of an order three times, so the player sees it was understood. */
export function flashTarget(e, mining = false) { if (e) flashes.push({ e, mining, t: performance.now() / 1000 }); }
function outline(e, width, color, alpha) {
  if (e.kind === 'node') { const r = e.r + 7; lines.ellipse(e.x, e.y, r, r * 0.72).stroke({ width, color, alpha }); return; }
  lines.rect(e.tx * TILE - 3, e.ty * TILE - 3, e.w * TILE + 6, e.h * TILE + 6).stroke({ width, color, alpha });
}
function drawTargets(selList, now) {
  for (const e of selList) if (e.kind === 'node' && !e.dead) outline(e, 2, SEL, 0.9); // a selected resource field
  // Faint, steady: the shard field, extractor or building each selected harvester is working on.
  const done = new Set();
  for (const u of selList) {
    if (u.kind !== 'unit' || u.team !== G.me || u.dead) continue;
    const T = u.task, e = T.t === 'gather' ? (T.node?.extractor || T.node) : (T.t === 'build' || T.t === 'repair') ? T.b : null;
    if (!e || e.dead || done.has(e)) continue;
    done.add(e); outline(e, 1.5, targetColor(e, T.t === 'gather'), 0.5);
  }
  // Bright, blinking for 0.9 s after an order.
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i], age = now - f.t;
    if (age > 0.9 || f.e.dead) { flashes.splice(i, 1); continue; }
    if (Math.floor(age / 0.15) % 2 === 0) outline(f.e, 3, targetColor(f.e, f.mining), 1);
  }
}

function dashed(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(d / 12);
  for (let i = 0; i < n; i++) { const a = i / n, b = (i + 0.5) / n; lines.moveTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a).lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b); }
  lines.stroke({ width: 1.5, color: 0xf5a524, alpha: 0.6 });
}

const pings = [];
/** Flash a spot on the minimap (attack alerts). */
export function ping(x, y) { pings.push({ x, y, t: performance.now() }); }
export function clearPings() { pings.length = 0; }

function renderMinimap() {
  const S = mm.width / WW, T = mm.height / WH, c = mctx; // (x and y scales: one, on a square map) c.imageSmoothingEnabled = false; c.clearRect(0, 0, mm.width, mm.height); c.drawImage(thumb, 0, 0, mm.width, mm.height);
  for (const n of map.nodes) if (G.explored[idx(n.tx, n.ty)]) { c.fillStyle = n.type === 'shard' ? '#4fd1c5' : '#a78bfa'; c.fillRect(n.x * S - 1.5, n.y * T - 1.5, 3, 3); }
  for (const b of G.bldgs) { if (b.team !== G.me && !G.explored[idx(b.tx, b.ty)]) continue; c.fillStyle = b.team === G.me ? ALLY : FOE; c.fillRect(b.tx * TILE * S, b.ty * TILE * T, Math.max(2, b.w * TILE * S), Math.max(2, b.h * TILE * T)); }
  for (const u of G.units) { if (u.team !== G.me && !visibleEnt(u)) continue; c.fillStyle = u.team === G.me ? (u.d.worker ? ALLY2 : ALLY) : FOE; c.fillRect(u.x * S - 1, u.y * T - 1, 2.2, 2.2); }
  c.drawImage(fogCv, 0, 0, mm.width, mm.height);
  const now = performance.now();
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
