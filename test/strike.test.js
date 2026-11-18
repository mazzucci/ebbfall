// The melee units' strike poses (src/client/look.js STRIKE, strikePose; tools/render3d/retheme.js STRIKE_POSES): which
// pose a unit shows from its cooldown and target, and the frames in the atlas for every facing, each with its
// team mask lined up, kept out of the walk animation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRIKE, strikePose, inReach, MUZZLE_FLASH, MELEE_PUFF, IMPACT, impactOf, MACHINES, SHOT_LOOK, PEOPLE_SHOT, TOWER_SHOT, deathOf, AIR_PUFF, DUST, DEATH_DUST, HIT_DUST, AIR_HIT_LIFT, HIT_LIFT, hitLift } from '../src/client/look.js';
import { fx, burst, partSize, updateFx } from '../src/client/fx.js';
import { UNITS, BUILDINGS } from '../src/engine/constants.js';
import { decodePNG } from '../tools/art/png.js';

const art = new URL('../public/art/', import.meta.url), index = JSON.parse(readFileSync(new URL('atlas.json', art))), frames = {}, pageOf = {};
for (const p of index.pages) { const j = JSON.parse(readFileSync(new URL(p, art))); Object.assign(frames, j.frames); for (const n in j.frames) pageOf[n] = j.meta.image; }
/** Whether frame `name`'s pixel (x, y) (in the frame, atlas px) is opaque. */
function opaqueIn(name) {
  const { x: fx0, y: fy0, w } = frames[name].frame, img = decodePNG(readFileSync(new URL(pageOf[name], art)));
  return (x, y) => x >= 0 && y >= 0 && x < w && img.data[((fy0 + y) * img.w + fx0 + x) * 4 + 3] > 0;
}

/** A melee unit of `type` at (100, 100) with cooldown `cd` and a target (a unit `gap` px from its edge, or none). */
function fighter(type, cd, gap = 0) {
  const d = UNITS[type], target = gap === null ? null : { kind: 'unit', x: 100 + d.r + 10 + gap, y: 100, r: 10, dead: false };
  return { type, d, x: 100, y: 100, r: d.r, cd, task: { t: target ? 'attack' : 'idle', target } };
}

test('the five melee fighters, and only they, have strike poses', () => {
  assert.deepEqual([...STRIKE.kinds].sort(), ['bruiser', 'knight', 'prism', 'rider', 'trooper']);
  for (const k of STRIKE.kinds) assert.ok(UNITS[k].weapon?.melee, `${k} fights hand to hand`);
});

test('a fighter strikes for a moment after its blow, and stands in its wind-up between blows', () => {
  for (const k of STRIKE.kinds) {
    const cd = UNITS[k].weapon.cd;
    assert.equal(strikePose(fighter(k, cd)), 'strike', `${k}: the blow just landed`);
    assert.equal(strikePose(fighter(k, cd - STRIKE.HOLD + 0.01)), 'strike', `${k}: still striking`);
    assert.equal(strikePose(fighter(k, cd - STRIKE.HOLD - 0.01)), 'wind', `${k}: back on guard`);
    assert.equal(strikePose(fighter(k, 0.1)), 'wind', `${k}: the next blow coming`);
    assert.equal(strikePose(fighter(k, -3)), 'wind', `${k}: ready, the target in reach`);
    assert.equal(strikePose(fighter(k, -3, 60)), null, `${k}: the target out of reach`);
    assert.equal(strikePose(fighter(k, -3, null)), null, `${k}: nothing to fight`);
  }
  const archer = { ...fighter('trooper', 0), type: 'lancer', d: UNITS.lancer };
  assert.equal(strikePose(archer), null, 'a ranged unit has none');
});

test('reach is the sim\'s: the weapon\'s range plus half the striker\'s radius, from the target\'s edge or a building\'s wall', () => {
  const u = fighter('trooper', 0), reach = UNITS.trooper.weapon.range * 32 + u.r * 0.5;
  assert.ok(inReach(u, { kind: 'unit', x: 100 + reach + 10, y: 100, r: 10 }));
  assert.ok(!inReach(u, { kind: 'unit', x: 100 + reach + 10 + 5, y: 100, r: 10 }));
  const b = { kind: 'bldg', tx: 4, ty: 2, w: 2, h: 2 }; // (its west wall at x = 128)
  assert.ok(inReach({ ...u, x: 128 - reach + 1, y: 90 }, b));
  assert.ok(!inReach({ ...u, x: 128 - reach - 5, y: 90 }, b));
  assert.ok(!inReach(u, { kind: 'unit', x: 110, y: 100, r: 10, dead: true }), 'not a dead one');
});

test('every melee fighter has its two strike frames in all facings, each with its team mask, outside the walk', () => {
  for (const k of STRIKE.kinds) for (let d = 0; d < index.facings; d++) {
    for (const pose of ['wind', 'strike']) {
      const name = `${k}_${d}_${pose}`, b = frames[name], m = frames[`${name}_m`];
      assert.ok(b && m, `${name} and its mask`);
      assert.deepEqual(m.sourceSize, b.sourceSize, `${name}_m has ${name}'s full size`);
      assert.deepEqual(m.anchor, b.anchor, `${name}_m has ${name}'s anchor`);
    }
    assert.ok(!index.animations[`${k}_${d}`].some(n => /_(wind|strike)$/.test(n)), `${k}_${d}: the walk has no strike frame`);
  }
});

test('the muzzle flashes and the melee dust name real shooters', () => {
  for (const k of Object.keys(MUZZLE_FLASH)) assert.ok((UNITS[k] ?? BUILDINGS[k])?.weapon && !(UNITS[k] ?? BUILDINGS[k]).weapon.melee, `${k} shoots`);
  for (const k of Object.keys(MELEE_PUFF)) assert.ok(UNITS[k].weapon.melee, `${k} fights hand to hand`);
});

test('impacts: steel glints for arrows, bolts and darts, sparks for tracers, fire only for the cannonball and the rocket', () => {
  const shots = new Set([...Object.values(SHOT_LOOK), ...Object.values(PEOPLE_SHOT).flatMap(Object.values), ...Object.values(TOWER_SHOT)]);
  for (const s of shots) assert.ok(IMPACT[s], `${s} has an impact`);
  assert.deepEqual(Object.keys(IMPACT).filter(s => ['shell', 'rocket'].includes(IMPACT[s])).sort(), ['cannonball', 'rocket']);
  assert.equal(impactOf({ proj: 'missile', by: 'lancer', people: 'humans' }), 'glint', 'an Archer\'s arrow');
  assert.equal(impactOf({ proj: 'bolt', by: 'umbra', people: 'vael' }), 'spark', 'an Android\'s tracer');
  assert.equal(impactOf({ proj: 'missile', by: 'monolith', people: 'vael' }), 'rocket', 'a Rover\'s rocket');
  assert.equal(impactOf({ proj: 'shell', by: 'siegeTank', people: 'humans' }), 'shell', 'a cannonball');
  assert.equal(impactOf({ proj: 'bolt', by: undefined, people: 'humans' }), 'glint', 'the Watchtower\'s arrow');
  assert.equal(impactOf({}), 'weld', 'a repairer\'s welding');
});

test('only machines explode when they fall; fighters turn to dust', () => {
  for (const k of MACHINES) assert.ok(UNITS[k], `${k} is a unit`);
  for (const k of [...STRIKE.kinds, 'lancer', 'harvester', 'halo']) assert.ok(!MACHINES.has(k), `${k} falls as a fighter`);
  for (const k of ['siegeTank', 'bastion', 'scythe', 'monolith', 'shrike', 'lumen', 'umbra']) assert.ok(MACHINES.has(k), `${k} explodes`);
});

test('a fallen Balloon puffs as canvas up where it flew; fighters turn to dust; machines and buildings explode', () => {
  assert.equal(deathOf('observer', true), 'air', 'the Balloon');
  assert.equal(deathOf('shrike', true), 'machine', 'the Drone, a flying machine');
  assert.equal(deathOf('trooper', false), 'dust');
  assert.equal(deathOf('siegeTank', false), 'machine');
  assert.equal(deathOf(null, false), 'collapse', 'a building (look.js BLDG_DEATH)');
  assert.ok(!MACHINES.has('observer'), 'the Balloon stays out of the machines');
  assert.equal(AIR_PUFF.tint, 0xe8dcc0, 'canvas, not dust');
  assert.notEqual(AIR_PUFF.tint, DUST);
  assert.ok(AIR_PUFF.vy > 0 && AIR_PUFF.lift > 0, 'up where it flew, sinking');
});

test('dust is the pale round trail tinted earth, never the gray puff (its dark tone tinted reads as a stone)', () => {
  for (const d of [DEATH_DUST, HIT_DUST]) { assert.equal(d.anim, 'trail'); assert.equal(d.tint, DUST); }
  assert.deepEqual([DEATH_DUST.scale, DEATH_DUST.life, DEATH_DUST.vy, DEATH_DUST.fade, DEATH_DUST.dy], [2.0, 0.7, -10, 0.8, -4], 'a fighter\'s fall');
  assert.deepEqual(MELEE_PUFF.knight, { scale: 1.5, fade: 0.85, life: 0.6, drift: 28 }, 'the Knight\'s lance: more, flung farther');
  assert.deepEqual(MELEE_PUFF.bruiser, { scale: 1.0, fade: 0.7, life: 0.5, drift: 12 }, 'the Bruiser\'s hammer');
  // (the gray puff stays for chimneys, burning and muzzle smoke, untinted)
  const src = readFileSync(new URL('../src/client/gl/render.js', import.meta.url), 'utf8');
  for (const line of src.split('\n').filter(l => /addEffect\('puff'/.test(l))) assert.ok(!/tint/.test(line.slice(line.indexOf("addEffect('puff'"))), `an untinted puff: ${line.trim()}`);
});

test('the glint\'s first frame: a heart 2 game px across (4 atlas px), its arms tapering from 4 px at the root to 2', () => {
  const f = frames.glint_0.frame, o = opaqueIn('glint_0'), c = f.w / 2; // (center between pixels c - 1 and c)
  for (let d = -2; d < 2; d++) assert.ok(o(c + d, c - 1) && o(c + d, c) && o(c - 1, c + d) && o(c, c + d), 'a heart 4 px across');
  const width = (r) => [-3, -2, -1, 0, 1, 2].filter(d => o(c + d, c - 1 - r)).length; // (across the north arm, r px above the heart's edge)
  assert.equal(width(2), 4, 'the arm\'s root 4 px wide');
  assert.equal(width(4), 2, 'its tip 2 px wide');
  assert.ok(width(5) <= 2);
});

test('a shot on a flyer plays up on its body: on a Balloon\'s basket, on anything else as high as its hp bar\'s lift', () => {
  assert.equal(AIR_HIT_LIFT, 0.6);
  assert.deepEqual(HIT_LIFT, { observer: 0.3 });
  assert.equal(hitLift('observer'), 0.3, 'the Balloon: its basket and the envelope\'s dark lower band');
  assert.equal(hitLift('shrike'), 0.6, 'the Drone');
  for (const k of Object.keys(HIT_LIFT)) assert.ok(UNITS[k]?.air, `${k} flies`);
});

test('a death\'s team debris is thin: a third of the pieces, 1 to 2 px, gone in 0.3 to 0.5 s', () => {
  fx.list = [];
  burst(100, 100, '#ff0000', 24);
  assert.equal(fx.list.length, 8);
  burst(100, 100, '#ff0000', 10);
  assert.equal(fx.list.length, 8 + 4);
  for (const f of fx.list) {
    assert.ok(f.r >= 1 && f.r <= 2, `size ${f.r}`);
    assert.ok(f.life >= 0.3 && f.life <= 0.5, `life ${f.life}`);
    for (const k of [1, 0.5, 0]) assert.ok([1, 2].includes(partSize(f, k)), `drawn 1 or 2 px (${partSize(f, k)})`);
  }
  for (let i = 0; i < 20; i++) updateFx(0.03);
  assert.equal(fx.list.length, 0, 'all gone within 0.6 s');
});

test('a strike seen from behind swings out to the side: left at facing 11, right at 12 and 13, nowhere else (render3d awayYaw)', async () => {
  const { awayYaw } = await import('../tools/render3d/models.js');
  assert.ok(awayYaw(11) > 0, 'facing 11 (turned left): to the unit\'s left');
  assert.ok(awayYaw(12) < 0 && awayYaw(13) < 0, 'facings 12 and 13: to its right');
  assert.equal(awayYaw(11), -awayYaw(13), '11 the mirror of 13');
  assert.ok(Math.abs(awayYaw(12)) > Math.abs(awayYaw(13)), 'straight away: the larger swing');
  for (const d of [undefined, 0, 4, 8, 10, 14, 15]) assert.equal(awayYaw(d), 0, `no swing at facing ${d}`);
});
