// A building's fall (src/client/look.js BLDG_DEATH, bldgDeath, ghostAt, portalGhost, fallShake; render.js collapse): it
// collapses into dust or gray smoke, no fire; its ghost sinks, dims and fades, its team paint with it; only a headquarters
// shakes the camera; the Data center's reactor goes off on its roof, then smokes; the Portal loses its power; a
// burning building's orange flash comes now and then, dimmer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { BLDG_DEATH, GRAY_SMOKE, bldgDeath, ghostAt, portalGhost, fallShake, BURN_FLASH, DUST, deathOf } from '../src/client/look.js';
import { BUILDINGS } from '../src/engine/constants.js';

const at = (type, tx = 10, ty = 10) => { const d = BUILDINGS[type]; return { type, tx, ty, w: d.w, h: d.h, x: (tx + d.w / 2) * 32, y: (ty + d.h / 2) * 32, r: Math.max(d.w, d.h) * 16 }; };
const fall = (type, people, o = {}) => bldgDeath(at(type), people, { hq: !!BUILDINGS[type].hq, rand: () => 0.5, ...o });
const FIRE = ['boom_big', 'spark'];
const near = (a, b) => Math.abs(a - b) < 1e-9;
const gray = (s) => s.anim === 'trail' && s.o.tint === GRAY_SMOKE.tint;
const dust = (s) => s.anim === 'trail' && s.o.tint === DUST;
// (an effect frame's size in world px: the atlas is drawn at 2x)
const art = new URL('../public/art/', import.meta.url), frames = {};
for (const f of readdirSync(art).filter(f => /^atlas-\d+\.json$/.test(f))) Object.assign(frames, JSON.parse(readFileSync(new URL(f, art))).frames);
const px = (name) => frames[name].sourceSize.w / 2;

test('the table: Kingdom dust, gray smoke on the soft trail, Expedition glints and a flash, the Data center\'s reactor, the Portal', () => {
  assert.deepEqual(BLDG_DEATH.ghost, { life: 0.45, sink: 14, squash: 0.8, fadeLast: 0.25, dim: 0.5 });
  assert.deepEqual(BLDG_DEATH.shake, { base: 0.5, perTile: 0.5, life: 0.3 });
  assert.deepEqual(GRAY_SMOKE, { tint: 0x8c8c8c, fade: 0.8 });
  assert.deepEqual(BLDG_DEATH.humans.dust, { anim: 'trail', tint: DUST, n: 4, stagger: 0.1, perR: 16, life: 1.2, vy: -8, fade: 0.85 }, 'the Kingdom\'s dust as it was');
  for (const s of [BLDG_DEATH.humans.smoke, BLDG_DEATH.vael.smoke, BLDG_DEATH.vael.dust, BLDG_DEATH.portal.puffs]) {
    assert.equal(s.anim, 'trail', 'gray smoke on the soft trail, never the chunky puff');
    assert.deepEqual([s.tint, s.fade], [0x8c8c8c, 0.8]);
    assert.ok(s.vy < BLDG_DEATH.humans.dust.vy, 'rising faster than the Kingdom\'s settling dust');
  }
  assert.deepEqual(BLDG_DEATH.vael.glint, { n: 3, over: 0.4, tint: 0xa8f0ff, light: 0x7fd8ff, lightScale: 0.3, life: 0.3, scale: 1.5 });
  assert.deepEqual(BLDG_DEATH.vael.flash, { scale: 0.5, tint: 0xbfefff, life: 0.12 });
  assert.equal(BLDG_DEATH.humans.glint, undefined); assert.equal(BLDG_DEATH.humans.flash, undefined);
  assert.equal(BLDG_DEATH.types.eclipse.portal, true, 'the Portal: its own fall');
  for (const k of Object.keys(BLDG_DEATH.types)) assert.ok(BUILDINGS[k], `${k} is a building`);
  assert.equal(deathOf(null, false), 'collapse');
  assert.ok(frames.boom_big_0, 'boom_big stays in the atlas');
});

test('no fire for any building: no boom_big, no sparks, no scorch; the Data center\'s boom_small the only blast', () => {
  for (const type of Object.keys(BUILDINGS)) for (const people of ['humans', 'vael']) {
    const p = fall(type, people), anims = p.steps.map(s => s.anim).filter(Boolean);
    for (const a of FIRE) assert.ok(!anims.includes(a), `${type} (${people}): no ${a}`);
    const booms = p.steps.filter(s => s.anim === 'boom_small');
    assert.equal(booms.length, type === 'conflux' ? 1 : 0, `${type}: ${booms.length} boom_small`);
    for (const s of p.steps) if (s.o?.light) assert.ok(type === 'conflux' && s.anim === 'boom_small' || ![0xff9a3a, 0xff8a2a].includes(s.o.light), `${type}: no orange light`);
    assert.ok(!p.steps.some(s => s.anim === 'puff'), `${type} (${people}): no chunky puff`);
  }
  const src = readFileSync(new URL('../src/client/gl/render.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function collapse('), src.indexOf('export const dyingShown'));
  for (const w of ['boom_big', 'scorch', "'spark'"]) assert.ok(!body.includes(w), `render.js collapse: no ${w}`);
});

test('gray smoke stays under about 1.2 tiles on any footprint; a bigger one gets more puffs, not bigger ones', () => {
  for (const type of Object.keys(BUILDINGS)) for (const people of ['humans', 'vael']) {
    for (const s of fall(type, people).steps.filter(gray)) assert.ok(s.o.scale * px('trail_0') <= 40, `${type} (${people}): ${s.o.scale * px('trail_0')} px`);
  }
  const small = fall('siphon', 'vael').steps.filter(gray).length, big = fall('conflux', 'vael').steps.filter(gray).length;
  assert.equal(small, 6, 'a 2x2: four over its footprint, two off its roof');
  assert.equal(big - 2, 7, 'the Data center (4x4): seven over its footprint');
});

test('a Kingdom building: four dust puffs staggered over its footprint, r/16, and two gray puffs rising off its roof', () => {
  const b = at('barracks'), p = bldgDeath(b, 'humans', { roof: 200 });
  const d = p.steps.filter(dust);
  assert.deepEqual(d.map(s => Math.round(s.at * 1000) / 1000), [0, 0.1, 0.2, 0.3]);
  for (const s of d) {
    assert.deepEqual(s.o, { scale: b.r / 16, life: 1.2, vy: -8, fade: 0.85, tint: DUST });
    assert.ok(s.x >= b.tx * 32 && s.x <= (b.tx + b.w) * 32 && s.y >= b.ty * 32 && s.y <= (b.ty + b.h) * 32, 'on its footprint');
  }
  const smoke = p.steps.filter(gray);
  assert.equal(smoke.length, 2); for (const s of smoke) { assert.equal(s.y, 200, 'the roof line'); assert.equal(s.at, 0); assert.equal(s.o.life, 1.5); }
  assert.ok(!p.steps.some(s => s.anim === 'glint' || s.anim === 'flash'), 'no glint, no flash');
  assert.deepEqual([p.life, p.rubbleAt, p.portal, p.rubble], [0.45, 0, false, null]);
});

test('the random points are the client RNG\'s it is handed, never fixed', () => {
  const xs = (r) => fall('barracks', 'humans', { rand: () => r }).steps.filter(dust).map(s => s.x);
  assert.notDeepEqual(xs(0), xs(0.99));
  let n = 0; fall('barracks', 'humans', { rand: () => (n++, 0.3) }); assert.equal(n, 8, 'two draws per dust puff');
});

test('an Expedition building: gray smoke, three cold glints (0.3 s, 1.5x) over 0.4 s, one pale flash', () => {
  const b = at('siphon'), p = fall('siphon', 'vael');
  for (const s of p.steps.filter(s => gray(s) && s.o.life === 1.2)) assert.ok(near(s.o.scale, Math.min(3.2, b.r / 12)), 'over its footprint: r/12, at most 3.2');
  const glints = p.steps.filter(s => s.anim === 'glint');
  assert.equal(glints.length, 3);
  assert.ok(glints.every(s => s.at < 0.4 && s.o.life === 0.3 && s.o.scale === 1.5 && s.o.tint === 0xa8f0ff && s.o.light === 0x7fd8ff && s.o.lightScale === 0.3));
  assert.deepEqual(p.steps.filter(s => s.anim === 'flash').map(s => s.o), [{ scale: 0.5, tint: 0xbfefff, life: 0.12 }]);
});

test('the Data center: its reactor on its roof at 0.25 s, a white core two frames then about a tile of fire; its smoke after', () => {
  const core = { x: 333, y: 222 }, p = fall('conflux', 'vael', { core });
  const white = p.steps.filter(s => s.anim === 'flash' && s.o.tint === 0xffffff), fire = p.steps.filter(s => s.anim === 'boom_small');
  assert.equal(white.length, 1); assert.equal(fire.length, 1);
  assert.deepEqual([white[0].at, white[0].x, white[0].y, white[0].o.life], [0.25, 333, 222, 0.067], 'two frames of white on its roof');
  assert.ok(near(fire[0].at, 0.317) && fire[0].x === 333 && fire[0].y === 222, 'then the fire');
  for (const [s, name] of [[white[0], 'flash_0'], [fire[0], 'boom_small_0']]) { const w = s.o.scale * px(name); assert.ok(w >= 32 && w <= 40, `${name}: ${w} px, about a tile`); }
  assert.equal(fire[0].o.lightScale, 0.7);
  const smoke = p.steps.filter(gray);
  assert.ok(smoke.every(s => s.at > fire[0].at), 'cause, then effect');
  const last = Math.max(...smoke.map(s => s.at)) - Math.min(...smoke.map(s => s.at));
  assert.ok(near(last, 0.6), `staggered over 0.6 s (${last})`);
});

test('the ghost: sinks 14 px eased in, squashed to 0.8, dimmed to half, fading over its last 0.25 s', () => {
  assert.deepEqual(ghostAt(0), { dy: 0, scaleY: 1, alpha: 1, tint: 0xffffff });
  const mid = ghostAt(0.225);
  assert.ok(near(mid.dy, 3.5), `eased in: a quarter of the sink half way (${mid.dy})`);
  assert.ok(near(mid.scaleY, 0.95));
  assert.equal(mid.tint, 0xdfdfdf, 'dimmed a quarter of the way');
  assert.equal(ghostAt(0.2).alpha, 1, 'opaque till the last 0.25 s');
  assert.ok(near(ghostAt(0.325).alpha, 0.5));
  const end = ghostAt(0.45);
  assert.ok(near(end.dy, 14) && near(end.scaleY, 0.8) && end.alpha === 0 && end.tint === 0x808080);
  assert.deepEqual(ghostAt(1), ghostAt(0.45), 'held past its end');
  // (the team paint: the ghost's opacity and dimming, so its flag goes down with its walls; render.js ties them)
  const src = readFileSync(new URL('../src/client/gl/render.js', import.meta.url), 'utf8');
  assert.ok(src.includes('s.alpha = g.alpha; s.tint = d.paints.has(s) ? mulTint(this.seat, g.tint) : g.tint;'), 'render.js: paint and body as one');
});

test('only a headquarters shakes the camera (the Castle, the Data center): ±2.5 px for 0.3 s; with the footprint', () => {
  const hqs = Object.entries(BUILDINGS).filter(([, d]) => d.hq).map(([k]) => k).sort();
  assert.deepEqual(hqs, ['conflux', 'core']);
  for (const type of Object.keys(BUILDINGS)) for (const people of ['humans', 'vael']) assert.deepEqual(fall(type, people).shake, hqs.includes(type) ? { px: 2.5, life: 0.3 } : null, `${type} (${people})`);
  assert.deepEqual(fallShake(2, true), { px: 1.5, life: 0.3 }, 'a 2x2\'s would be ±1.5');
  assert.equal(fallShake(4, false), null);
  const src = readFileSync(new URL('../src/client/gl/render.js', import.meta.url), 'utf8');
  assert.ok(/const a = quake\.px \* \(1 - quake\.t \/ quake\.life\)/.test(src), 'render.js: dying away over its life');
});

test('the Portal: power lost, not a blast (its timeline)', () => {
  const P = BLDG_DEATH.portal;
  assert.deepEqual([P.hold, P.end, P.squeezeX], [0.2, 0.5, 0.85]);
  // 0 to 0.2 s: holds, no sink; the cyan flash layer in to 0.6, the glow 1.1 to 2.2
  assert.deepEqual(portalGhost(0), { scaleX: 1, alpha: 1, flash: 0, glow: 1.1 });
  const a = portalGhost(0.1); assert.ok(a.scaleX === 1 && a.alpha === 1 && near(a.flash, 0.3) && near(a.glow, 1.65));
  const b = portalGhost(0.2); assert.ok(near(b.flash, 0.6) && near(b.glow, 2.2) && b.scaleX === 1 && b.alpha === 1);
  // 0.2 to 0.5 s: the glow to 0, narrowed to 0.85, faded out
  const c = portalGhost(0.35); assert.ok(near(c.glow, 1.1) && near(c.scaleX, 0.925) && near(c.alpha, 0.5));
  const d = portalGhost(0.5); assert.ok(near(d.glow, 0) && near(d.scaleX, 0.85) && near(d.alpha, 0));
  assert.deepEqual([P.flash.tint, P.glow.tint], [0x3fe0ff, 0x3fe0ff]);
  const B = at('eclipse'), core = { x: B.x, y: B.y - 31 }, p = bldgDeath(B, 'vael', { core, rand: () => 0.5 });
  assert.deepEqual([p.portal, p.life, p.shake, p.rubbleAt], [true, 0.5, null, 0.5], 'no shake; its rubble at 0.5 s');
  const glints = p.steps.filter(s => s.anim === 'glint');
  assert.equal(glints.length, 4);
  for (const s of glints) {
    assert.equal(s.at, 0.2);
    assert.ok(near(Math.hypot(s.x - core.x, s.y - core.y), 40), '40 px out from the ring');
    assert.ok(near(Math.hypot(s.o.vx, s.o.vy), 120), '120 px/s');
    assert.ok((s.o.vx * (core.x - s.x) + s.o.vy * (core.y - s.y)) > 0, 'inward');
    assert.deepEqual([s.o.life, s.o.tint, s.o.light, s.o.lightScale], [0.3, 0xa8f0ff, 0x7fd8ff, 0.2]);
  }
  const blink = p.steps.filter(s => s.blink);
  assert.deepEqual(blink.map(s => [s.at, s.x, s.y, s.blink]), [[0.5, core.x, core.y, { tint: 0x3fe0ff, scale: 2.4, life: 0.15 }]], 'the blink on the ring');
  const smoke = p.steps.filter(gray);
  assert.equal(smoke.length, 3);
  for (const s of smoke) { assert.equal(s.at, 0.5); assert.equal(s.y, B.y, 'off its base, not the ring'); assert.ok(Math.abs(s.x - B.x) <= 12); assert.ok(s.o.vy < 0, 'rising'); assert.ok(s.o.scale * px('trail_0') <= 40); }
  assert.deepEqual(smoke.map(s => s.x - B.x), [-12, 0, 12]);
  assert.ok(!p.steps.some(s => ['boom_big', 'boom_small', 'spark', 'flash', 'puff'].includes(s.anim) || s.anim === 'trail' && !gray(s)), 'no boom, no fire, no dust');
  assert.equal(p.rubble.tint, 0x8a96a4, 'cold steel rubble');
  assert.equal(p.rubble.glow.length, 2, 'a cyan glow on two chunks');
});

test('a burning building flashes orange one puff in four, its light at 0.4 (it strobed at every other, full light)', () => {
  assert.deepEqual(BURN_FLASH, { chance: 0.25, light: 0xff8a2a, lightScale: 0.4 });
  const src = readFileSync(new URL('../src/client/gl/render.js', import.meta.url), 'utf8');
  assert.ok(/Math\.random\(\) < BURN_FLASH\.chance\) addEffect\('flash', x, y \+ 4, \{ life: 0\.25, light: BURN_FLASH\.light, lightScale: BURN_FLASH\.lightScale \}\)/.test(src), 'render.js reads BURN_FLASH');
});
