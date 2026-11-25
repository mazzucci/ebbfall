// How each shot is drawn so that it reads at a phone's zoom (src/client/look.js SHOT_STYLE, SHOT_LIT): the Kingdom's
// shafts as dark silhouettes that never glow, every Expedition tracer cool and lit, and the hits in steel's cool while
// the muzzle flashes stay warm. Guards the rule the PM set (2026-11-19): an arrow must never read as a tracer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHOT_LOOK, PEOPLE_SHOT, TOWER_SHOT, SHOT_STYLE, SHOT_BAR, SHOT_LIT, SHOT_GLOW, SHOT_TRAIL, HEAVY_TRAIL, HIT_LOOK, HIT_STEEL, WALKER_HIT_LIFT, shotArt } from '../src/client/look.js';
import { UNITS } from '../src/engine/constants.js';

// (every sprite each people fires: by its shooters' kinds, its projectile kinds and its tower)
const KINGDOM = new Set([...Object.values(PEOPLE_SHOT.humans), TOWER_SHOT.humans, SHOT_LOOK.lancer, SHOT_LOOK.bastion, SHOT_LOOK.siegeTank]);
const EXPEDITION = new Set([...Object.values(PEOPLE_SHOT.vael), TOWER_SHOT.vael, SHOT_LOOK.umbra, SHOT_LOOK.shrike, SHOT_LOOK.monolith]);

test('the Kingdom\'s shots are timber on a dark bar, drawn larger, and never glow or tint', () => {
  assert.deepEqual([...KINGDOM].sort(), ['arrow', 'ballista_bolt', 'cannonball']);
  for (const a of ['arrow', 'ballista_bolt']) {
    const s = SHOT_STYLE[a];
    assert.ok(s.scale > 1 && s.bar > 0 && !s.tint, `${a}: scaled ${s.scale}x over a bar ${s.bar} px thick, its own colors`);
  }
  assert.ok(SHOT_STYLE.ballista_bolt.scale > SHOT_STYLE.arrow.scale && SHOT_STYLE.ballista_bolt.bar > SHOT_STYLE.arrow.bar, 'the bolt heavier than the arrow');
  for (const a of KINGDOM) assert.ok(!SHOT_LIT.has(a) && !SHOT_STYLE[a]?.tint, `${a} carries no light and no tint`);
  assert.ok(SHOT_BAR.tint < 0x202830 && SHOT_BAR.alpha >= 0.5 && SHOT_BAR.alpha < 1, 'the bar dark and translucent');
  assert.ok(!SHOT_STYLE.cannonball, 'the cannonball as it is');
});

test('every Expedition shot but the rocket is a cool LED tracer with a glow; the Drone fires the Sentry mast\'s', () => {
  assert.deepEqual([...EXPEDITION].sort(), ['rocket', 'tower_shot', 'tracer']);
  for (const a of ['tracer', 'tower_shot']) {
    assert.ok(SHOT_LIT.has(a), `${a} glows`);
    assert.equal(SHOT_STYLE[a].tint, 0xdff6ff, `${a} tinted the cool LED white`);
    assert.ok(!SHOT_STYLE[a].bar && !SHOT_STYLE[a].scale, `${a}: no bar, its own size`);
  }
  assert.equal(SHOT_LOOK.shrike, 'tower_shot', 'the Drone\'s shot is the short LED tracer, not a charcoal dart');
  assert.equal(shotArt('shrike', 'bolt', 'vael'), 'tower_shot');
  assert.ok(SHOT_LIT.has('rocket') && !SHOT_STYLE.rocket && SHOT_TRAIL.rocket, 'the rocket keeps its flame and its smoke');
  const cool = (c) => (c & 0xff) >= (c >> 16 & 0xff); // (blue at least as strong as red)
  assert.ok(cool(SHOT_GLOW) && cool(0xdff6ff), 'the glow and the tint cool, not the rifles\' old amber');
});

test('a hit is steel\'s cool white-blue, light to heavy; the muzzle flashes stay warm; fire only in the siege blast', () => {
  const cool = (c) => (c & 0xff) > (c >> 16 & 0xff), warm = (c) => (c >> 16 & 0xff) > (c & 0xff);
  assert.ok(cool(HIT_STEEL));
  assert.equal(HIT_LOOK.medium.light, HIT_STEEL); assert.equal(HIT_LOOK.heavy.light, HIT_STEEL);
  assert.equal(HIT_LOOK.heavy.chip.anim, 'glint', 'the heavy blow flings chips of steel, not sparks of fire');
  assert.ok(warm(HIT_LOOK.siege.light) && HIT_LOOK.siege.chip.anim === 'spark', 'the siege blast is fire');
  for (const t of ['heavy', 'siege']) assert.ok(HIT_LOOK[t].muzzle > 0 && warm(HIT_LOOK[t].muzzleLight), `${t}: a warm muzzle flash`);
  assert.ok(WALKER_HIT_LIFT > 0 && WALKER_HIT_LIFT <= 0.6, 'a shot on a walker lands on its body');
  assert.ok(HEAVY_TRAIL.px > 0 && HEAVY_TRAIL.alpha > 0 && HEAVY_TRAIL.alpha < 1, 'a heavy shot drags a translucent trail');
});

test('a Kingdom shot\'s heavy trail is a translucent streak in the shaft\'s own colors: never cool, never lit (render.js draws it so)', () => {
  // The trail is the shot's own sprite stretched, tinted as the shot is: a Kingdom shot has no tint (its timber as
  // drawn), so its trail has none; and the only light a shot carries is SHOT_LIT's, which no Kingdom shot is in.
  for (const a of ['arrow', 'ballista_bolt']) assert.ok(!SHOT_STYLE[a].tint && !SHOT_LIT.has(a), `${a}: no tint and no light, so no cool and no glow on its trail`);
  const src = readFileSync(new URL('../src/client/gl/render.js', import.meta.url), 'utf8');
  assert.ok(src.includes('setTex(s.trail, s.texture);'), 'the trail is the shot\'s own sprite, not a glow sprite');
  assert.ok(src.includes('s.trail.alpha = HEAVY_TRAIL.alpha; s.trail.tint = s.tint;'), 'at HEAVY_TRAIL\'s opacity, in the shot\'s own tint');
  assert.ok(src.includes('s.l.visible = SHOT_LIT.has(art);'), 'a light only for SHOT_LIT\'s shots');
  assert.ok(!/s\.trail\.(blendMode|light)/.test(src), 'no additive blend and no light on a trail');
});

test('the Ballista and the Android are the heavy shooters whose shots trail: the Android always, the Ballista at a flyer', () => {
  assert.equal(UNITS.umbra.weapon.dmg > 30 && UNITS.umbra.weapon.dmgAir > 30, true);
  assert.equal(UNITS.bastion.weapon.dmg <= 30 && UNITS.bastion.weapon.dmgAir > 30, true);
});

test('the Sentry mast\'s shot is drawn from between its barrels to its aim, whichever mast fired it', async () => {
  const { MUZZLE_FLASH, SHOT_FROM, firedBy, muzzlePoint, shotDrawn } = await import('../src/client/look.js');
  assert.deepEqual(Object.keys(SHOT_FROM), ['ward', 'turret']); assert.equal(SHOT_FROM.ward, MUZZLE_FLASH.ward);
  assert.ok(!MUZZLE_FLASH.turret, 'a bow has no flash');
  const M = MUZZLE_FLASH.ward, near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-9, `${why}: ${a}, ${b}`);
  for (let k = 0; k < 16; k++) { // (the mouth: on the picture's ellipse round the pivot, `up` over the mast's foot)
    const a = k * Math.PI / 8, m = muzzlePoint(100, 200, a, M);
    near(((m.x - 100) / M.fwd) ** 2 + ((m.y + M.up - 200) / (M.fwd * M.depth)) ** 2, 1, `facing ${k}`);
    near(Math.atan2(m.y + M.up - 200, m.x - 100), a > Math.PI + 1e-9 ? a - 2 * Math.PI : a, `facing ${k}, its way`);
  }
  const mast = { type: 'ward', x: 0, y: 0 }, other = { type: 'ward', x: 120, y: 90 };
  const shot = (k) => ({ x: 200 * k, y: 40 * k, ax: 200, ay: 40 });
  for (const k of [0.02, 0.3, 0.9]) assert.equal(firedBy(shot(k), [other, mast]), mast, `fired by the mast it flies away from, at ${k}`);
  assert.equal(firedBy(shot(0.5), [other]), null, 'no mast of it stands: drawn where the sim has it');
  const first = shotDrawn(shot(0), mast), m = muzzlePoint(0, 0, Math.atan2(40, 200), M), mid = shotDrawn(shot(0.5), mast), last = shotDrawn(shot(1), mast);
  near(first.x, m.x, 'leaves the mouth'); near(first.y, m.y, 'leaves the mouth');
  near(mid.x, (m.x + 200) / 2, 'halfway'); near(mid.y, (m.y + 40) / 2, 'halfway');
  // The Watchtower's, its archer's bow: at his left, `up` over the tower's foot; its arrow lands on the same aim.
  const B = SHOT_FROM.turret, bow = (a) => muzzlePoint(0, 0, a, B), tower = { type: 'turret', x: 0, y: 0 };
  near(bow(0).x, B.fwd, 'facing right: the bow before him'); near(bow(0).y, -B.up - B.side * B.depth, 'and behind, up the screen');
  near(bow(Math.PI / 2).x, B.side, 'facing the viewer: at the right'); near(bow(-Math.PI / 2).x, -B.side, 'facing away: at the left');
  const a0 = shotDrawn(shot(0), tower), a1 = shotDrawn(shot(1), tower), at = bow(Math.atan2(40, 200));
  near(a0.x, at.x, 'the arrow leaves the bow'); near(a0.y, at.y, 'the arrow leaves the bow'); near(a1.x, 200, 'and lands on its aim'); near(a1.y, 40, 'and lands on its aim');
  near(last.x, 200, 'lands on its aim'); near(last.y, 40, 'lands on its aim'); near(mid.rot, Math.atan2(40 - m.y, 200 - m.x), 'points along its line');
});
