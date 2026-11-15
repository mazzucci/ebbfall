// A building's fall (src/client/look.js BLDG_DEATH, bldgDeath, ghostAt, portalGhost; render.js collapse): it collapses
// into dust or smoke, no fire; its ghost sinks and fades; only a headquarters shakes the camera; the Data center's
// reactor goes off; the Portal loses its power; a burning building's orange flash comes now and then, dimmer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLDG_DEATH, bldgDeath, ghostAt, portalGhost, BURN_FLASH, DUST, deathOf } from '../src/client/look.js';
import { BUILDINGS } from '../src/engine/constants.js';

const at = (type, tx = 10, ty = 10) => { const d = BUILDINGS[type]; return { type, tx, ty, w: d.w, h: d.h, x: (tx + d.w / 2) * 32, y: (ty + d.h / 2) * 32, r: Math.max(d.w, d.h) * 16 }; };
const fall = (type, people, o = {}) => bldgDeath(at(type), people, { hq: !!BUILDINGS[type].hq, rand: () => 0.5, ...o });
const FIRE = ['boom_big', 'spark'];
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('the table: Kingdom dust, Expedition smoke with glints and a flash, the Data center\'s reactor, the Portal\'s hook', () => {
  assert.deepEqual(BLDG_DEATH.ghost, { life: 0.45, sink: 14, squash: 0.8, fadeLast: 0.25 });
  assert.equal(BLDG_DEATH.shake, 3);
  assert.deepEqual(BLDG_DEATH.humans.dust, { anim: 'trail', tint: DUST, n: 4, stagger: 0.1, perR: 16, life: 1.2, vy: -8, fade: 0.85 });
  assert.equal(BLDG_DEATH.vael.dust.anim, 'puff', 'the Expedition: gray smoke, not dust');
  assert.equal(BLDG_DEATH.vael.dust.tint, undefined, 'the gray puff untinted (tinted it reads as a stone)');
  for (const p of ['humans', 'vael']) assert.deepEqual(BLDG_DEATH[p].smoke, { anim: 'puff', n: 2, scale: 1.5, life: 1.5, vy: -10 });
  assert.deepEqual(BLDG_DEATH.vael.glint, { n: 3, over: 0.4, tint: 0xa8f0ff, light: 0x7fd8ff, lightScale: 0.3, life: 0.2 });
  assert.deepEqual(BLDG_DEATH.vael.flash, { scale: 0.5, tint: 0xbfefff, life: 0.12 });
  assert.equal(BLDG_DEATH.humans.glint, undefined); assert.equal(BLDG_DEATH.humans.flash, undefined);
  assert.deepEqual(BLDG_DEATH.types.conflux.boom, { anim: 'boom_small', scale: 1.0, light: 0xff9a3a, lightScale: 0.7, life: 0.4 });
  assert.equal(BLDG_DEATH.types.eclipse.portal, true, 'the Portal: its own fall');
  for (const k of Object.keys(BLDG_DEATH.types)) assert.ok(BUILDINGS[k], `${k} is a building`);
  assert.equal(deathOf(null, false), 'collapse');
});

test('no fire for any building: no boom_big, no sparks, no scorch; the Data center\'s boom_small the only blast', () => {
  for (const [type, d] of Object.entries(BUILDINGS)) for (const people of ['humans', 'vael']) {
    const p = fall(type, people), anims = p.steps.map(s => s.anim).filter(Boolean);
    for (const a of FIRE) assert.ok(!anims.includes(a), `${type} (${people}): no ${a}`);
    const booms = p.steps.filter(s => s.anim === 'boom_small');
    assert.equal(booms.length, type === 'conflux' ? 1 : 0, `${type}: ${booms.length} boom_small`);
    for (const s of p.steps) if (s.o?.light) assert.ok(type === 'conflux' && s.anim === 'boom_small' || ![0xff9a3a, 0xff8a2a].includes(s.o.light), `${type}: no orange light`);
    void d;
  }
  const src = readFileSync(new URL('../src/client/gl/render.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function collapse('), src.indexOf('export const dyingShown'));
  for (const w of ['boom_big', 'scorch', "'spark'"]) assert.ok(!body.includes(w), `render.js collapse: no ${w}`);
});

test('a Kingdom building: four dust puffs staggered over its footprint, r/16, and two gray puffs off its roof', () => {
  const b = at('barracks'), p = bldgDeath(b, 'humans', { roof: 200 });
  const dust = p.steps.filter(s => s.anim === 'trail');
  assert.deepEqual(dust.map(s => Math.round(s.at * 1000) / 1000), [0, 0.1, 0.2, 0.3]);
  for (const s of dust) {
    assert.deepEqual(s.o, { scale: b.r / 16, life: 1.2, vy: -8, fade: 0.85, tint: DUST });
    assert.ok(s.x >= b.tx * 32 && s.x <= (b.tx + b.w) * 32 && s.y >= b.ty * 32 && s.y <= (b.ty + b.h) * 32, 'on its footprint');
  }
  const puffs = p.steps.filter(s => s.anim === 'puff');
  assert.equal(puffs.length, 2); for (const s of puffs) { assert.equal(s.y, 200, 'the roof line'); assert.equal(s.o.scale, 1.5); assert.equal(s.o.life, 1.5); assert.equal(s.o.tint, undefined); }
  assert.ok(!p.steps.some(s => s.anim === 'glint' || s.anim === 'flash'), 'no glint, no flash');
  assert.deepEqual([p.life, p.rubbleAt, p.portal], [0.45, 0, false]);
});

test('the random points are the client RNG\'s it is handed, never fixed', () => {
  const xs = (r) => fall('barracks', 'humans', { rand: () => r }).steps.filter(s => s.anim === 'trail').map(s => s.x);
  assert.notDeepEqual(xs(0), xs(0.99));
  let n = 0; fall('barracks', 'humans', { rand: () => (n++, 0.3) }); assert.equal(n, 8, 'two draws per dust puff');
});

test('an Expedition building: gray smoke, three cold glints over 0.4 s, one pale flash', () => {
  const p = fall('siphon', 'vael');
  const smoke = p.steps.filter(s => s.anim === 'puff');
  assert.equal(smoke.length, 6, 'four in place of the dust, two off the roof');
  for (const s of smoke) assert.equal(s.o.tint, undefined);
  const glints = p.steps.filter(s => s.anim === 'glint');
  assert.equal(glints.length, 3);
  assert.ok(glints.every(s => s.at < 0.4 && s.o.tint === 0xa8f0ff && s.o.light === 0x7fd8ff && s.o.lightScale === 0.3));
  const flash = p.steps.filter(s => s.anim === 'flash');
  assert.deepEqual(flash.map(s => s.o), [{ scale: 0.5, tint: 0xbfefff, life: 0.12 }]);
});

test('the Data center: the Expedition\'s fall, then its reactor\'s boom_small at its center as the ghost ends', () => {
  const b = at('conflux'), p = fall('conflux', 'vael');
  const boom = p.steps.filter(s => s.anim === 'boom_small');
  assert.equal(boom.length, 1);
  assert.deepEqual([boom[0].at, boom[0].x, boom[0].y, boom[0].o.scale, boom[0].o.lightScale], [0.45, b.x, b.y, 1.0, 0.7]);
  assert.equal(p.steps.filter(s => s.anim === 'glint').length, 3);
});

test('the ghost: sinks 14 px eased in, squashed to 0.8, fading over its last 0.25 s, gone at 0.45 s', () => {
  assert.deepEqual(ghostAt(0), { dy: 0, scaleY: 1, alpha: 1 });
  const mid = ghostAt(0.225);
  assert.ok(near(mid.dy, 3.5), `eased in: a quarter of the sink half way (${mid.dy})`);
  assert.ok(near(mid.scaleY, 0.95));
  assert.equal(ghostAt(0.2).alpha, 1, 'opaque till the last 0.25 s');
  assert.ok(near(ghostAt(0.325).alpha, 0.5));
  const end = ghostAt(0.45);
  assert.ok(near(end.dy, 14) && near(end.scaleY, 0.8) && end.alpha === 0);
  assert.deepEqual(ghostAt(1), ghostAt(0.45), 'held past its end');
});

test('the camera shakes for a headquarters only (the Castle, the Data center), 3', () => {
  const hqs = Object.entries(BUILDINGS).filter(([, d]) => d.hq).map(([k]) => k).sort();
  assert.deepEqual(hqs, ['conflux', 'core']);
  for (const type of Object.keys(BUILDINGS)) for (const people of ['humans', 'vael']) assert.equal(fall(type, people).shake, hqs.includes(type) ? 3 : 0, `${type} (${people})`);
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
  const ring = { x: 400, y: 300 }, p = bldgDeath(at('eclipse'), 'vael', { ring, rand: () => 0.5 });
  assert.deepEqual([p.portal, p.life, p.shake, p.rubbleAt], [true, 0.5, 0, 0.5], 'no shake; its rubble at 0.5 s');
  const glints = p.steps.filter(s => s.anim === 'glint');
  assert.equal(glints.length, 4);
  for (const s of glints) {
    assert.equal(s.at, 0.2);
    assert.ok(near(Math.hypot(s.x - ring.x, s.y - ring.y), 40), '40 px out');
    assert.ok(near(Math.hypot(s.o.vx, s.o.vy), 120), '120 px/s');
    assert.ok((s.o.vx * (ring.x - s.x) + s.o.vy * (ring.y - s.y)) > 0, 'inward');
    assert.deepEqual([s.o.life, s.o.tint, s.o.light, s.o.lightScale], [0.3, 0xa8f0ff, 0x7fd8ff, 0.2]);
  }
  const blink = p.steps.filter(s => s.blink);
  assert.deepEqual(blink.map(s => [s.at, s.x, s.y, s.blink]), [[0.5, 400, 300, { tint: 0x3fe0ff, scale: 2.4, life: 0.15 }]]);
  const puffs = p.steps.filter(s => s.anim === 'puff');
  assert.equal(puffs.length, 3);
  for (const s of puffs) { assert.equal(s.at, 0.5); assert.equal(s.o.scale, 1.6); assert.equal(s.o.life, 1.5); assert.equal(s.y, 300); assert.equal(s.o.tint, undefined); }
  assert.ok(!p.steps.some(s => ['boom_big', 'boom_small', 'spark', 'flash', 'trail'].includes(s.anim)), 'no boom, no fire, no dust');
});

test('a burning building flashes orange one puff in four, its light at 0.4 (it strobed at every other, full light)', () => {
  assert.deepEqual(BURN_FLASH, { chance: 0.25, light: 0xff8a2a, lightScale: 0.4 });
  const src = readFileSync(new URL('../src/client/gl/render.js', import.meta.url), 'utf8');
  assert.ok(/Math\.random\(\) < BURN_FLASH\.chance\) addEffect\('flash', x, y \+ 4, \{ life: 0\.25, light: BURN_FLASH\.light, lightScale: BURN_FLASH\.lightScale \}\)/.test(src), 'render.js reads BURN_FLASH');
});
