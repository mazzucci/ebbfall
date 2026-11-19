// How each shot is drawn so that it reads at a phone's zoom (src/client/look.js SHOT_STYLE, SHOT_LIT): the Kingdom's
// shafts as dark silhouettes that never glow, every Expedition tracer cool and lit, and the hits in steel's cool while
// the muzzle flashes stay warm. Guards the rule the PM set (2026-11-19): an arrow must never read as a tracer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  assert.ok(HEAVY_TRAIL > 0, 'a heavy shot drags a trail');
});

test('the Ballista and the Android are the heavy shooters whose shots trail: the Android always, the Ballista at a flyer', () => {
  assert.equal(UNITS.umbra.weapon.dmg > 30 && UNITS.umbra.weapon.dmgAir > 30, true);
  assert.equal(UNITS.bastion.weapon.dmg <= 30 && UNITS.bastion.weapon.dmgAir > 30, true);
});
