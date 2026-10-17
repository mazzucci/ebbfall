// WebGL renderer (PixiJS 8) over the generated sprite sheet in public/art/. Same exports as the old Canvas 2D
// renderer: the camera, view, resize/centerOn, renderTerrain() once per map, render(sel, place) every frame.
// Draws terrain on a dual grid, resources, buildings, units in 16 facings, projectiles, explosions, additive
// lights and a soft fog layer. Visual-only randomness (smoke, debris) uses Math.random: it never feeds the sim.
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js';
import { G, map, idx, TILE, MW, MH, WW, WH, PLAYER, ENEMY, BUILDINGS, clamp, mulberry, canPlace, visibleEnt } from '../../engine/index.js';
import { fx } from '../fx.js';
import { drag } from '../input.js';

export const cv = document.getElementById('game');
export const mm = document.getElementById('minimap'), mctx = mm.getContext('2d');
export const view = { w: 800, h: 500, dpr: 1 };
/** Camera: top-left corner in world px, and zoom (screen px per world px). */
export const cam = { x: 0, y: 0, zoom: matchMedia('(pointer: coarse)').matches ? 1.5 : innerWidth >= 1100 ? 2 : 1.5 };
export const ZOOM_MIN = 0.75, ZOOM_MAX = 2.5;
export const ALLY = '#f5a524', ALLY2 = '#ffd27a', FOE = '#e2457a', FOE2 = '#ff8bb0';
const hexn = (s) => parseInt(s.slice(1), 16);

TextureSource.defaultOptions.scaleMode = 'nearest';
const app = new Application();
await app.init({ canvas: cv, background: 0x0b0f16, antialias: false, roundPixels: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoStart: false, preference: 'webgl' });
const sheet = await Assets.load(new URL('art/atlas.json', document.baseURI).href);
const tex = (name) => sheet.textures[name] || Texture.EMPTY;
const FACINGS = sheet.data.meta.facings || 16;

// ---- scene ----
const world = new Container();
const L = {};
for (const k of ['terrain', 'decals', 'nodes', 'sel', 'shadows', 'bldgs', 'units', 'projs', 'fx', 'lights', 'fog', 'overlay']) world.addChild(L[k] = new Container());
L.units.sortableChildren = true; L.bldgs.sortableChildren = true;
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
  app.renderer.resize(view.w, view.h); clampCam();
}
const vw = () => view.w / cam.zoom, vh = () => view.h / cam.zoom; // visible world size
export function clampCam() { cam.x = clamp(cam.x, 0, Math.max(0, WW - vw())); cam.y = clamp(cam.y, 0, Math.max(0, WH - vh())); }
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
const thumb = document.createElement('canvas'); thumb.width = MW; thumb.height = MH;
const fogCv = document.createElement('canvas'); fogCv.width = MW; fogCv.height = MH;
const fogCtx = fogCv.getContext('2d'), fogImg = fogCtx.createImageData(MW, MH);
const fogTex = Texture.from(fogCv); fogTex.source.scaleMode = 'linear';
const fog = new Sprite(fogTex); fog.scale.set(TILE); L.fog.addChild(fog);
const shadeCv = document.createElement('canvas'); shadeCv.width = MW; shadeCv.height = MH;
const shadeCtx = shadeCv.getContext('2d'), shadeTex = Texture.from(shadeCv); shadeTex.source.scaleMode = 'linear';

export function renderTerrain() {
  L.terrain.removeChildren().forEach(c => c.destroy());
  const rnd = mulberry(G.seed * 7 + 3);
  const rock = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH || map.rock[idx(x, y)] ? 1 : 0;
  // Dual grid: the cell between tiles (i,j)..(i+1,j+1) is drawn at its centre, offset half a tile.
  for (let j = -1; j < MH; j++) for (let i = -1; i < MW; i++) {
    const m = rock(i, j) | rock(i + 1, j) << 1 | rock(i, j + 1) << 2 | rock(i + 1, j + 1) << 3;
    const r = rnd();
    const name = m === 0 ? `ground_${r < 0.88 ? 0 : 1 + ((r * 100) | 0) % 5}` : `rock_${m}_${((r * 3) | 0)}`;
    const s = new Sprite(tex(name)); s.anchor.set(0); s.position.set(i * TILE + 16, j * TILE + 16); L.terrain.addChild(s);
  }
  // Large-scale variation so the tiles never read as a grid.
  const img = shadeCtx.createImageData(MW, MH);
  for (let i = 0; i < MW * MH; i++) { const s = map.shade[i]; const v = 200 + Math.round(55 * Math.min(1, Math.max(0, (s - 0.25) * 2))); img.data.set([v, v, Math.min(255, v + 8), 255], i * 4); }
  shadeCtx.putImageData(img, 0, 0); shadeTex.source.update();
  const vs = new Sprite(shadeTex); vs.scale.set(TILE); vs.blendMode = 'multiply'; L.terrain.addChild(vs);
  // Bake the ~4k tile sprites and the overlay into one texture at 1:1 (the camera scales it with nearest filtering).
  L.terrain.boundsArea = new Rectangle(0, 0, WW, WH); // exactly the map, so the cache is 2048², not rounded up to 4096²
  L.terrain.cacheAsTexture(false); L.terrain.cacheAsTexture({ resolution: 1, antialias: false, scaleMode: 'nearest' });
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

class UnitObj {
  constructor(u) {
    this.body = new Sprite(); this.body.anchor.set(0.5); L.units.addChild(this.body);
    this.flash = new Sprite(); this.flash.anchor.set(0.5); this.flash.blendMode = 'add'; L.units.addChild(this.flash);
    this.shadow = new Sprite(); this.shadow.anchor.set(0.5); this.shadow.tint = 0x000000; this.shadow.alpha = 0.35; L.shadows.addChild(this.shadow);
    this.ring = new Sprite(); this.ring.anchor.set(0.5); L.sel.addChild(this.ring);
    this.cargo = light(0x4fd1c5, 0.18, 0.9);
    this.px = u.x; this.py = u.y; this.walk = 0; this.size = u.r > 12 ? 26 : u.r > 9 ? 18 : 12;
  }
  update(u, t, sel, dt) {
    const moved = Math.hypot(u.x - this.px, u.y - this.py); this.px = u.x; this.py = u.y;
    if (moved > 0.05) this.walk += dt * 8;
    const frames = u.type === 'harvester' ? 2 : 4, f = Math.floor(this.walk) % frames;
    const dir = ((Math.round(u.face / (Math.PI * 2) * FACINGS) % FACINGS) + FACINGS) % FACINGS;
    const tx = tex(`${u.type}_${u.team}_${dir}_${f}`);
    this.body.texture = tx; this.shadow.texture = tx; this.flash.texture = tx;
    this.body.position.set(u.x, u.y); this.flash.position.set(u.x, u.y); this.shadow.position.set(u.x + 2, u.y + 3);
    this.body.zIndex = u.y; this.flash.zIndex = u.y + 0.1;
    this.flash.visible = u.flash > 0; this.flash.alpha = 0.9;
    const s = sel.has(u);
    this.ring.visible = s; if (s) { this.ring.texture = tex(`sel_${this.size}_${u.team === PLAYER ? 0 : 1}`); this.ring.position.set(u.x, u.y + 3); }
    this.cargo.visible = !!u.carry;
    if (u.carry) { this.cargo.tint = u.carryType === 'ether' ? 0xa78bfa : 0x4fd1c5; this.cargo.position.set(u.x - Math.cos(u.face) * 5, u.y - Math.sin(u.face) * 5); this.cargo.alpha = 0.7 + 0.3 * Math.sin(t * 6); }
  }
  show(v) { this.body.visible = this.shadow.visible = v; if (!v) { this.flash.visible = this.ring.visible = this.cargo.visible = false; } }
  destroy() { for (const s of [this.body, this.flash, this.shadow, this.ring, this.cargo]) s.destroy(); }
}

const STAGES = 8, stageTex = {};
/** The bottom `k/STAGES` of a building texture, for the rising-from-the-ground construction reveal. */
function stage(name, k) {
  const key = name + k; if (stageTex[key]) return stageTex[key];
  const base = tex(name), fr = base.frame, h = Math.max(1, Math.round(fr.height * k / STAGES));
  return stageTex[key] = new Texture({ source: base.source, frame: new Rectangle(fr.x, fr.y + fr.height - h, fr.width, h) });
}

class BldgObj {
  constructor(b) {
    const n = b.w;
    this.found = new Sprite(tex(`foundation_${n}`)); L.bldgs.addChild(this.found);
    this.body = new Sprite(tex(`bldg_${b.type}_${b.team}`)); L.bldgs.addChild(this.body);
    this.scaffold = new Sprite(tex(`scaffold_${n}`)); L.bldgs.addChild(this.scaffold);
    this.shadow = new Graphics().rect(0, 0, b.w * TILE - 6, b.h * TILE - 6).fill({ color: 0x000000, alpha: 0.3 }); L.shadows.addChild(this.shadow);
    this.head = b.type === 'turret' ? new Sprite() : null; if (this.head) { this.head.anchor.set(0.5); L.bldgs.addChild(this.head); }
    const glow = { core: [0xffd27a, 1.6, 0.35], extractor: [0xa78bfa, 1.1, 0.5], forge: [0xff8a2a, 1.2, 0.4] }[b.type];
    this.glow = glow ? light(glow[0], glow[1], glow[2]) : null;
    this.smokeT = 0; this.type = b.type;
    for (const s of [this.found, this.body, this.scaffold]) s.position.set(b.tx * TILE, b.ty * TILE);
    this.shadow.position.set(b.tx * TILE + 7, b.ty * TILE + 8);
    const z = (b.ty + b.h) * TILE; this.found.zIndex = z - 2; this.body.zIndex = z; this.scaffold.zIndex = z + 1; if (this.head) this.head.zIndex = z + 2;
  }
  /** `live`: the player can see it right now (otherwise it is a remembered silhouette: no smoke, no aiming). */
  update(b, t, dt, live) {
    const name = `bldg_${b.type}_${b.team}`;
    this.found.visible = !b.done;
    this.scaffold.visible = !b.done;
    if (b.done) { this.body.texture = tex(name); this.body.y = b.ty * TILE; }
    else { const k = Math.max(1, Math.min(STAGES, Math.ceil(b.progress * STAGES))); this.body.texture = stage(name, k); this.body.y = b.ty * TILE + b.h * TILE - this.body.texture.frame.height; }
    this.body.alpha = b.flash > 0 ? 0.75 : 1; // hit flash
    if (this.head) { this.head.visible = b.done; const dir = ((Math.round((b.aim || 0) / (Math.PI * 2) * FACINGS) % FACINGS) + FACINGS) % FACINGS; this.head.texture = tex(`turret_head_${b.team}_${dir}`); this.head.position.set(b.x, b.y - 2); }
    if (this.glow) { this.glow.visible = b.done; this.glow.position.set(b.x, b.y); this.glow.alpha = (this.type === 'forge' ? 0.3 + 0.15 * Math.sin(t * 9) : 0.35 + 0.12 * Math.sin(t * 2.5)); }
    // Damage: smoke below half health, fire below a quarter.
    const f = b.hp / b.maxhp;
    if (live && b.done && f < 0.5) { this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = f < 0.25 ? 0.12 : 0.3; const x = b.tx * TILE + 8 + Math.random() * (b.w * TILE - 16), y = b.ty * TILE + 8 + Math.random() * (b.h * TILE - 16); addEffect('puff', x, y, { vy: -18, life: 1.2 }); if (f < 0.25 && Math.random() < 0.5) addEffect('flash', x, y + 4, { life: 0.25, light: 0xff8a2a }); } }
    if (live && this.type === 'forge' && b.done && Math.random() < dt * 2.5) addEffect('puff', b.tx * TILE + (Math.random() < 0.5 ? 26 : 70), b.ty * TILE + 40, { vy: -22, life: 1.5 });
  }
  show(v) { for (const s of [this.found, this.body, this.scaffold, this.shadow]) s.visible = s.visible && v; if (!v) { if (this.head) this.head.visible = false; if (this.glow) this.glow.visible = false; } }
  destroy() { for (const s of [this.found, this.body, this.scaffold, this.shadow, this.head, this.glow]) if (s) s.destroy(); }
}

class NodeObj {
  constructor(n) {
    this.ether = n.type === 'ether';
    this.s = new Sprite(); this.s.anchor.set(0.5); this.s.position.set(n.x, n.y); L.nodes.addChild(this.s);
    this.glow = light(this.ether ? 0xa78bfa : 0x4fd1c5, this.ether ? 1.1 : 0.55, this.ether ? 0.45 : 0.25); this.glow.position.set(n.x, n.y);
  }
  update(n, t) {
    if (this.ether) { this.s.texture = tex(`vent_${Math.floor(t * 6) % 4}`); this.glow.alpha = n.extractor ? 0 : 0.35 + 0.15 * Math.sin(t * 2 + n.x); }
    else { const k = n.amount > 1100 ? 0 : n.amount > 700 ? 1 : n.amount > 300 ? 2 : 3; this.s.texture = tex(`shard_${k}`); this.glow.alpha = 0.18 + 0.06 * Math.sin(t * 1.7 + n.y); }
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
  const s = new Sprite(frames[0]); s.anchor.set(0.5); s.position.set(x, y); if (o.rot) s.rotation = o.rot; if (o.scale) s.scale.set(o.scale);
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
  if (big) { shake = Math.min(10, shake + r / 6); const rub = new Sprite(tex(`rubble_${Math.min(4, Math.max(2, Math.round(r / 32)))}`)); rub.anchor.set(0.5); rub.position.set(x, y); L.decals.addChild(rub); decals.push({ s: rub, t: 0, life: 40 }); }
}
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

function hpBar(x, y, w, hp, max) {
  const f = Math.max(0, hp / max);
  bars.rect(x, y, w, 4).fill({ color: 0x000000, alpha: 0.65 });
  bars.rect(x + 1, y + 1, (w - 2) * f, 2).fill(f > 0.6 ? 0x5ad67d : f > 0.3 ? 0xffb545 : 0xff5a5a);
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
  bars.clear(); lines.clear(); flag.visible = false;
  for (const b of selList) if (b.kind === 'bldg' && b.rally && !b.dead) { dashed(b.x, b.y, b.rally.x, b.rally.y); flagAt(b.rally.x, b.rally.y, t); }

  syncPool(nodeObjs, map.nodes, n => new NodeObj(n), (o, n) => { const v = inView(n.x, n.y, 48) && explored[idx(n.tx, n.ty)]; o.show(!!v); if (v) o.update(n, t); });
  syncPool(bldgObjs, G.bldgs, b => new BldgObj(b), (o, b) => {
    const seen = b.team === PLAYER || visibleEnt(b);
    let v = inView(b.x, b.y, b.r + 40);
    if (v && !seen) { v = false; for (let y = 0; y < b.h && !v; y++) for (let x = 0; x < b.w; x++) if (explored[idx(b.tx + x, b.ty + y)]) { v = true; break; } }
    o.found.visible = o.body.visible = o.scaffold.visible = o.shadow.visible = true;
    if (v) o.update(b, t, dt, seen);
    o.show(v);
    if (!v) return;
    if (sel.has(b)) { lines.rect(b.tx * TILE - 1, b.ty * TILE - 1, b.w * TILE + 2, b.h * TILE + 2).stroke({ width: 2, color: b.team === PLAYER ? 0x5ad67d : 0xff5a5a, alpha: 0.9 }); }
    if (seen && (sel.has(b) || b.hp < b.maxhp)) hpBar(b.tx * TILE + 4, b.ty * TILE - 8, b.w * TILE - 8, b.hp, b.maxhp);
  });
  syncPool(unitObjs, G.units, u => new UnitObj(u), (o, u) => {
    const v = inView(u.x, u.y, 32) && (u.team === PLAYER || visibleEnt(u)); o.show(v); if (!v) return;
    o.update(u, now, sel, dt);
    if (sel.has(u) || u.hp < u.maxhp) hpBar(u.x - u.r - 2, u.y - u.r - 10, u.r * 2 + 4, u.hp, u.maxhp);
  });

  let pi = 0;
  for (const p of G.projs) {
    if (p.team === ENEMY && !G.vis[idx(clamp((p.x / TILE) | 0, 0, MW - 1), clamp((p.y / TILE) | 0, 0, MH - 1))]) continue;
    const s = pooled(projPool, pi++, () => { const s = new Sprite(); s.anchor.set(0.5); L.projs.addChild(s); s.l = light(0xffd27a, 0.25, 0.7); return s; });
    s.texture = tex(p.type === 'shell' ? 'shell' : 'bolt'); s.anchor.set(p.type === 'shell' ? 0.5 : 1, 0.5);
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

  ghost.visible = ghostRect.visible = !!place; ghostRect.clear();
  if (place) {
    const d = BUILDINGS[place.type], ok = canPlace(place.type, place.tx, place.ty, PLAYER);
    ghost.texture = tex(`bldg_${place.type}_${PLAYER}`); ghost.position.set(place.tx * TILE, place.ty * TILE); ghost.tint = ok ? 0xb8ffc8 : 0xff7070;
    ghostRect.rect(place.tx * TILE, place.ty * TILE, d.w * TILE, d.h * TILE).fill({ color: ok ? 0x5ad67d : 0xff5a5a, alpha: 0.18 }).stroke({ width: 2, color: ok ? 0x5ad67d : 0xff5a5a });
  }
  box.clear();
  if (drag.box) {
    const x = Math.min(drag.sx, drag.cx), y = Math.min(drag.sy, drag.cy), w = Math.abs(drag.cx - drag.sx), h = Math.abs(drag.cy - drag.sy);
    box.rect(x, y, w, h).fill({ color: 0x5ad67d, alpha: 0.08 }).stroke({ width: 1, color: 0x5ad67d, alpha: 0.9 });
  }
  app.render();
  renderMinimap();
}

const flag = new Sprite(); flag.anchor.set(0.2, 0.95); L.overlay.addChild(flag); flag.visible = false;
function flagAt(x, y, t) { flag.visible = true; flag.texture = sheet.animations.flag[Math.floor(t * 6) % 4]; flag.position.set(x, y); }
function dashed(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(d / 12);
  for (let i = 0; i < n; i++) { const a = i / n, b = (i + 0.5) / n; lines.moveTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a).lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b); }
  lines.stroke({ width: 1.5, color: 0xf5a524, alpha: 0.6 });
}

function renderMinimap() {
  const S = mm.width / WW, c = mctx; c.imageSmoothingEnabled = false; c.clearRect(0, 0, mm.width, mm.height); c.drawImage(thumb, 0, 0, mm.width, mm.height);
  for (const n of map.nodes) if (G.explored[idx(n.tx, n.ty)]) { c.fillStyle = n.type === 'shard' ? '#4fd1c5' : '#a78bfa'; c.fillRect(n.x * S - 1.5, n.y * S - 1.5, 3, 3); }
  for (const b of G.bldgs) { if (b.team === ENEMY && !G.explored[idx(b.tx, b.ty)]) continue; c.fillStyle = b.team === PLAYER ? ALLY : FOE; c.fillRect(b.tx * TILE * S, b.ty * TILE * S, Math.max(2, b.w * TILE * S), Math.max(2, b.h * TILE * S)); }
  for (const u of G.units) { if (u.team === ENEMY && !visibleEnt(u)) continue; c.fillStyle = u.team === PLAYER ? (u.type === 'harvester' ? ALLY2 : ALLY) : FOE; c.fillRect(u.x * S - 1, u.y * S - 1, 2.2, 2.2); }
  c.drawImage(fogCv, 0, 0, mm.width, mm.height);
  c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1; c.strokeRect(cam.x * S + 0.5, cam.y * S + 0.5, vw() * S, vh() * S);
}
