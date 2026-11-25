// The land, drawn (PixiJS 8, WebGL): what gl/newland.js plans. Three parts:
//   the ground  one quad over the map and past its edges (the apron) with a shader of its own that tiles the
//               grass (two samples of one picture at two turns and sizes over a broad calm green, so no repeat shows
//               across a screen) and lays the worn dirt, the forest floor and the scree over it by the map's mix
//               image (newland.js groundMix, 4 texels a tile, linear). Nothing baked: about 10 MB of textures on any
//               map size, where baking a 128x128 map at one texel a world px is 64 MB (256 MB at a retina's two) and
//               today's 16k tile sprites are none (the atlas has them) but a draw list of 16k.
//   laid        the pieces nothing can stand behind (a forest's inside, the low plants and stones), sprites in rows
//               of four tiles under everything that moves, in drawing order, shown by rows: no sorting, no CPU a frame.
//   live        the pieces a unit may stand behind (their art reaches over walkable ground): sprites among the units
//               and buildings, sorted with them by their base, only those on screen; each tinted by the land's shade
//               at its foot, as the laid ones are (the shade is the ground shader's own: as two blended layers over the whole
//               screen it was two fifths of a frame in software, for the same picture).
import { Container, Mesh, MeshGeometry, Shader, Sprite, Texture } from 'pixi.js';
import { TILE, MIX_K, groundMix, planLand, LAND } from './newland.js';
import { PIECES } from './newland-pieces.js';

/** How the ground is mixed (the still's own recipe, nano-test/scene-flat.mjs: one tile there is 35.84 px). World px a
 *  repeat of each picture; the grass's second sample turned and larger; `grass` how much of the blades over the calm
 *  green, `dark` the tone laid over both and how much; how strongly each ground covers the grass where the mix is full. */
export const GROUND = {
  period: { calm: 803, grass: 310, grass2: 437, dirt: 268, floor: 321, scree: 268 },
  grass: 0.5, dark: [24 / 255, 44 / 255, 16 / 255], darkAmount: 0.2, dirt: 0.8, floor: 0.9, scree: 0.88,
  /** The apron's ground and its pieces, darker than the map's own, so where the map ends still reads: down to `dark` of
   *  it, from nothing at the map's edge over `fade` world px (a step there read as a seam across the screen). In a
   *  phone's box only the border's own trees and rocks stand past the edge, `keep` px out, and the ground falls to
   *  `boxDark`: more of them, one over another, cost a phone in a corner a third more than the middle of the map. */
  apron: { dark: 0.7, fade: 160, keep: 40, boxDark: 0.28 },
  /** Today's shade layers over the new ground (gl/ground.js shadeLayers, the ground plan's tones): the meadows at
   *  this much of their strength (at full they read as cloud shadows on a photographed grass), the rock's warm or cool
   *  tone not at all (it turned the pale rock mauve; the pieces carry their own color). */
  meadow: { dry: 0.5, lush: 0.4 }, rockTone: 0,
  /** Under water (the mix's alpha): today's grass tiles' mean color, a little of the new grass's grain in it, so the
   *  water today's shade layers lay over it keeps today's colors (over the sunny grass the shallows were a mint lawn). */
  wet: [77 / 255, 101 / 255, 52 / 255], wetGrain: 0.5,
  /** The contact shadow round blocked ground (no line: the border is said by the rocks and the undergrowth on it):
   *  the ground darkens with the forest floor or the scree of the mix, from nothing half a tile out to `dark` at the
   *  smoothed border and on inside; at full on a border that faces south or east, where the sun's shadow falls, `lee`
   *  of it on one that faces north or west (`probe` px toward the sun the mix is read again; `gain` turns the
   *  difference into which way the border faces). */
  rim: { dark: 0.42, lee: 0.4, probe: 6, gain: 1.5 },
  /** The gold mine's sprite, drawn this much larger than its frame (a client scale: no repack), so its rock covers
   *  more of its 2x2 tiles; the lamp moves with it. Its ground: a soft patch of trodden earth (the mix). */
  mine: 1.18,
};
/** The minimap's ground with the new land (gl/render.js): the land's own colors, a step darker than on the field so
 *  the seats' dots stand out as today: the grass (at the map's full shade; `shade` of it at its darkest), a wood (its
 *  crowns, darker than the grass by more than today's are), rock (pale, as the crags), the worn dirt and how strongly
 *  a full track shows. Blocked ground reads at a glance: a wood is the darkest thing on the land, rock the palest.
 *  The gold mines: a brighter gold than today's inside a dark rim `mineRim` units wide (of the minimap's 168), since
 *  today's gold on this brighter grass lost its contrast. */
export const MINIMAP = { grass: [98, 118, 56], shade: 0.8, forest: [34, 54, 28], hill: [168, 160, 140], dirt: [176, 148, 98], dirtAmount: 0.55, mine: '#ffd84a', mineEdge: 'rgba(20,16,6,0.85)', mineRim: 0.9 };
const NAMES = ['grass', 'calm', 'dirt', 'floor', 'scree'];

const VERT = `
in vec2 aPosition;
out vec2 vWorld;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWorld = aPosition;
}`;
const f = (v) => v.toFixed(4);
const FRAG = `
precision highp float;
in vec2 vWorld;
uniform sampler2D uGrass;
uniform sampler2D uCalm;
uniform sampler2D uDirt;
uniform sampler2D uFloor;
uniform sampler2D uScree;
uniform sampler2D uMix;
uniform sampler2D uMul;
uniform sampler2D uAdd;
uniform vec4 uMixRect;
uniform vec2 uMap;
uniform float uDark;
void main() {
  vec2 p = vWorld;
  vec4 m = texture(uMix, (p - uMixRect.xy) * uMixRect.zw);
  vec3 calm = texture(uCalm, p / ${f(GROUND.period.calm)}).rgb;
  vec3 g1 = texture(uGrass, p / ${f(GROUND.period.grass)}).rgb;
  vec3 g2 = texture(uGrass, vec2(p.x * 0.8 - p.y * 0.6, p.x * 0.6 + p.y * 0.8) / ${f(GROUND.period.grass2)} + vec2(0.37, 0.61)).rgb;
  vec3 c = mix(calm, (g1 + g2) * 0.5, ${f(GROUND.grass)});
  c = mix(c, vec3(${GROUND.dark.map(f).join(', ')}), ${f(GROUND.darkAmount)});
  c = mix(c, texture(uDirt, p / ${f(GROUND.period.dirt)}).rgb, m.r * ${f(GROUND.dirt)});
  c = mix(c, texture(uFloor, p / ${f(GROUND.period.floor)}).rgb, m.g * ${f(GROUND.floor)});
  c = mix(c, texture(uScree, p / ${f(GROUND.period.scree)}).rgb, m.b * ${f(GROUND.scree)});
  c = mix(vec3(${GROUND.wet.map(f).join(', ')}) * (${f(1 - GROUND.wetGrain / 2)} + ${f(GROUND.wetGrain)} * dot(g1, vec3(0.3333))), c, m.a);
  // (the contact shadow round blocked ground: by how much floor or scree the mix has here; darker where the same,
  // read a few px toward the sun, has more: a border that faces south or east)
  float rim = min(1.0, m.g + m.b);
  vec4 m2 = texture(uMix, (p - ${f(GROUND.rim.probe)} - uMixRect.xy) * uMixRect.zw);
  float lee = mix(${f(GROUND.rim.lee)}, 1.0, clamp(0.5 + (min(1.0, m2.g + m2.b) - rim) * ${f(GROUND.rim.gain)}, 0.0, 1.0));
  c *= 1.0 - ${f(GROUND.rim.dark)} * rim * lee;
  // (the land's shade, the meadows and the water: gl/ground.js shadeLayers, its edge carried out over the apron)
  c = min(c * texture(uMul, p / uMap).rgb + texture(uAdd, p / uMap).rgb, vec3(1.0));
  vec2 past = max(max(-p, p - uMap), 0.0);
  finalColor = vec4(c * mix(1.0, uDark, smoothstep(0.0, ${f(GROUND.apron.fade)}, length(past))), 1.0);
}`;

const quad = (x0, y0, x1, y1) => new MeshGeometry({ positions: new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]), uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) });
const ROWS = 4; // (tiles a row of laid pieces)

export class Land {
  /** `grounds` the tiling pictures' textures by name, `tex(name)` a frame of the packs, `L` the renderer's layers
   *  (terrain, scenery, ents). */
  constructor(grounds, tex, L) {
    for (const n of NAMES) { const s = grounds[n].source; s.addressMode = 'repeat'; s.scaleMode = 'linear'; }
    this.grounds = grounds; this.tex = tex; this.L = L;
    this.meshes = []; this.rows = []; this.live = []; this.shown = new Map(); this.low = []; this.mix = null; this.shade = [];
    this.rect = null; this.stats = null; this.box = false; this.dark = GROUND.apron.dark;
  }
  /** The map in a phone's box (`box`) or edge to edge: what stands past its edge, and how dark it gets there. */
  inBox(box) {
    this.box = box; this.dark = box ? GROUND.apron.boxDark : GROUND.apron.dark;
    for (const m of this.meshes) m.shader.resources.land.uniforms.uDark = this.dark;
  }
  /** The ground plan's tones as the shade layers take them, at the new ground's strengths (GROUND.meadow, rockTone). */
  tone(plan, kindAt) {
    const k = (g, by) => (by === 1 ? g : by === 0 ? null : g.map(v => v * by));
    return { dry: k(plan.dry, GROUND.meadow.dry), lush: k(plan.lush, GROUND.meadow.lush), rockTone: k(plan.rockTone, GROUND.rockTone), kindAt };
  }
  /** Whether every piece's frame is in the packs (a page built from other pictures: today's land instead). */
  ready() { return PIECES.every(p => this.tex(p.name) !== Texture.EMPTY); }
  clear() {
    for (const m of this.meshes) { const sh = m.shader; m.destroy(); sh?.destroy(); } // (the program itself is PixiJS's, cached by its source)
    for (const r of this.rows) r.c.destroy({ children: true });
    for (const s of this.shown.values()) s.destroy();
    this.mix?.destroy(true); for (const t of this.shade) t.destroy(true);
    this.meshes = []; this.rows = []; this.live = []; this.low = []; this.shown.clear(); this.mix = null; this.shade = []; this.rect = null;
  }
  /**
   * Lay the land of a map: `w`, `h` tiles, `rock`, `kindAt` (ground.js rockKinds), `dirt` (the ground plan's), `seed`,
   * `apron` tiles past each edge, `cap` (newland.js LAND.cap), `wet(x, y)` (a tile under water), `mines` (the gold
   * mines' tiles, `{ tx, ty, w, h }`: a soft patch of trodden earth under each; no piece minds them), `shade` the shade layers as textures ([multiply, add or none]: gl/ground.js shadeLayers), `shadeAt(x, y)` the multiply at a world point as a tint (each piece takes its foot's). Returns what it laid and its cost (ms).
   */
  lay({ w, h, rock, kindAt, dirt, seed, apron, cap = LAND.cap, shade, shadeAt, wet = null, mines = [] }) {
    this.clear();
    const t0 = performance.now(), A = apron * TILE, W = w * TILE, H = h * TILE;
    const plan = planLand({ w, h, rock, kindAt, seed, apron, cap, wet }), t1 = performance.now();
    const mix = groundMix({ w, h, rock, kindAt, dirt, seed, apron, wet, mines }), t2 = performance.now();
    const image = (m) => { // (a plain texture of an RGBA image, linear, no mipmaps)
      const cv = document.createElement('canvas'); cv.width = m.w; cv.height = m.h;
      cv.getContext('2d').putImageData(new ImageData(m.data, m.w, m.h), 0, 0);
      const t = Texture.from(cv); t.source.scaleMode = 'linear'; t.source.autoGenerateMipmaps = false; return t;
    };
    this.mix = image(mix);
    this.shade = [shade[0], shade[1] || image({ w: 1, h: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) })];
    for (const t of this.shade) t.source.addressMode = 'clamp-to-edge';
    const g = this.grounds;
    const shader = () => Shader.from({ gl: { vertex: VERT, fragment: FRAG }, resources: {
      uGrass: g.grass.source, uCalm: g.calm.source, uDirt: g.dirt.source, uFloor: g.floor.source, uScree: g.scree.source, uMix: this.mix.source, uMul: this.shade[0].source, uAdd: this.shade[1].source,
      land: { uMixRect: { value: new Float32Array([-A, -A, 1 / (mix.w / MIX_K * TILE), 1 / (mix.h / MIX_K * TILE)]), type: 'vec4<f32>' }, uMap: { value: new Float32Array([W, H]), type: 'vec2<f32>' }, uDark: { value: this.dark, type: 'f32' } },
    } });
    const ground = new Mesh({ geometry: quad(-A, -A, W + A, H + A), shader: shader() }); this.L.terrain.addChild(ground); this.meshes.push(ground);
    // (a piece past the map's edge darkens with the ground it stands on)
    const dim = (x, y) => { const d = Math.min(1, Math.hypot(Math.max(-x, x - W, 0), Math.max(-y, y - H, 0)) / GROUND.apron.fade), v = Math.round(255 * (1 - (1 - GROUND.apron.dark) * d * d * (3 - 2 * d))); return v << 16 | v << 8 | v; };
    // The pieces: the live ones kept as a list (shown as the camera comes), the rest laid in rows.
    const rowOf = new Map();
    let laid = 0, low = 0;
    for (const o of plan.pieces) {
      const far = o.apron && Math.max(-o.x, o.x - W, -o.z, o.z - H) > GROUND.apron.keep;
      if (o.live) { this.live.push({ ...o, tint: mul(shadeAt(o.x, o.y), o.apron ? dim(o.x, o.z) : 0xffffff) }); continue; }
      const key = Math.floor(o.z / (ROWS * TILE)) * 3 + (far ? (o.z < 0 ? 0 : 2) : 1); // (the apron's with the map's own: a crown over the edge stands whole)
      let row = rowOf.get(key);
      if (!row) { rowOf.set(key, row = { c: new Container(), y0: Infinity, y1: -Infinity, z: key, far }); this.rows.push(row); }
      const s = this.sprite(o); s.tint = mul(shadeAt(o.x, o.y), o.apron ? dim(o.x, o.z) : 0xffffff); row.c.addChild(s); laid++;
      row.y0 = Math.min(row.y0, o.y - PIECES[o.i].h * o.s); row.y1 = Math.max(row.y1, o.y + PIECES[o.i].h * o.s * 0.3);
      if (o.low && !o.apron) { low++; this.low.push({ s, tx: Math.floor(o.x / TILE), ty: Math.floor((o.z) / TILE), ground: true }); }
    }
    this.rows.sort((a, b) => a.z - b.z); // (north to south: a row's crowns over the row behind)
    for (const r of this.rows) this.L.scenery.addChild(r.c);
    this.stats = { pieces: plan.pieces.length, live: this.live.length, laid, low, rows: this.rows.length, mix: [mix.w, mix.h], cap, ms: { plan: t1 - t0, mix: t2 - t1, total: performance.now() - t0 } };
    return this.stats;
  }
  sprite(o) {
    const t = this.tex(PIECES[o.i].name), s = new Sprite(t);
    s.anchor.copyFrom(t.defaultAnchor || { x: 0.5, y: 1 }); s.position.set(o.x, o.y); s.scale.set(o.s);
    return s;
  }
  /** Show what the view (world px) holds: the laid rows it crosses, and the live pieces in it, among the units. */
  cull(x0, y0, x1, y1) {
    for (const r of this.rows) { const v = r.y1 > y0 && r.y0 < y1 && !(r.far && this.box); if (r.c.visible !== v) r.c.visible = v; }
    const k = this.rect, M = 96;
    if (k && x0 >= k[0] && y0 >= k[1] && x1 <= k[2] && y1 <= k[3]) return; // (still inside what was shown last)
    const X0 = x0 - M - 48, Y0 = y0 - M - 48, X1 = x1 + M + 48, Y1 = y1 + M + 48;
    this.rect = [x0 - 48, y0 - 48, x1 + 48, y1 + 48];
    const live = this.live, keep = new Set();
    let lo = 0, hi = live.length; while (lo < hi) { const m = (lo + hi) >> 1; if (live[m].z < Y0) lo = m + 1; else hi = m; } // (sorted by z)
    for (let n = lo; n < live.length && live[n].z < Y1 + M; n++) {
      const o = live[n]; if (o.x < X0 || o.x > X1) continue;
      keep.add(n);
      if (this.shown.has(n)) continue;
      const s = this.sprite(o); s.zIndex = o.z; s.tint = o.tint; s.land = o; this.L.ents.addChild(s); this.shown.set(n, s);
    }
    for (const [n, s] of this.shown) if (!keep.has(n)) { s.destroy(); this.shown.delete(n); }
  }
  /** The live pieces on screen that stand in front of a body over `rect` ([x0, y0, x1, y1], world px) whose feet are
   *  at depth `z`: their sprites (what hides it), added to `into`. True if any. */
  hiding(rect, z, into) {
    let any = false;
    for (const s of this.shown.values()) {
      const o = s.land, p = PIECES[o.i];
      if (o.z <= z || o.x - p.l * o.s >= rect[2] || o.x + p.r * o.s <= rect[0] || o.y - p.h * o.s >= rect[3] || o.y <= rect[1]) continue;
      into.add(s); any = true;
    }
    return any;
  }
}
/** Two tints, channel by channel. */
const mul = (a, b) => b === 0xffffff ? a : ((a >> 16) * (b >> 16) / 255) << 16 | ((a >> 8 & 255) * (b >> 8 & 255) / 255) << 8 | (a & 255) * (b & 255) / 255;
