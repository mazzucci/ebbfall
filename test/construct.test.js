// Construction you can read (src/client/construct.js; Notion: "PRD: construction you can read"): the unfinished looks,
// the done moment's curves and timings, a builder's strikes, and the words on the cards and the toast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILDINGS, FACTIONS } from '../src/engine/constants.js';
import { decodeWebP } from '../tools/art/webp.mjs';
import { RAW, GHOST, GANTRY, GANTRY_FRAME, BUILD_BAR, DONE, DONE_PUFF, WORK, rawStage, rawMatrix, solidRows, ghostAlpha, headPath, headAt, doneAt, donePuffs, easeOutCubic, easeInQuad, siteHp, siteHurt, strikeCount, strikeAt, atSite, STRIKE_FX, NO_BUILDER, pct, builderLine, siteLine, pausedToast, PAUSED_GAP, REVEAL, revealRows, revealMatrix, frameOf as siteFrame } from '../src/client/construct.js';

const near = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

test('the designer\'s numbers', () => {
  assert.equal(RAW.sat, 0.3, 'saturation down about 70%');
  assert.deepEqual([RAW.cap, RAW.stages], [7, 8], 'the reveal capped at 7/8: the roof missing until done');
  assert.equal(GHOST.tint, 0x86f0ff, 'the ghost a cold cyan (more cyan than the PRD\'s 0xa0ecff: it read gray-teal over grass)');
  assert.ok((GHOST.tint >> 16) < 0xa0 && (GHOST.tint & 255) === 0xff, 'less red, full blue');
  assert.deepEqual([GHOST.alpha, GHOST.hz, GHOST.shimmer], [0.2, 6, 0.03], 'faint: the outline of what is coming, not the thing (the 0.6 hologram went with the gantry)');
  assert.deepEqual([GANTRY.rows, GANTRY.cap, GANTRY.barDrop], [64, 0.9, 2], 'the Expedition\'s body in 64 rows, the top tenth waiting for the done moment');
  assert.equal(BUILD_BAR.h, 7, 'the construction bar, taller than the 4 px hp bar');
  assert.deepEqual([DONE.life, DONE.color, DONE.strip, DONE.roof, DONE.heads], [0.5, 0.5, 0.4, 0.3, 0.3], '0.5 s in all');
  assert.deepEqual([DONE.glowUp, DONE.glowPeak, DONE.puffAt], [[0.15, 0.3], 1.25, 0.05]);
  assert.deepEqual([DONE_PUFF.fade, DONE_PUFF.life, DONE_PUFF.vy], [0.35, 0.8, -14], 'the dust: faint, 0.8 s, up at 14 px/s');
  assert.deepEqual([WORK.every, WORK.nudge, WORK.nudgeFrames, WORK.life], [0.55, 1.5, 2, 0.2]);
  assert.equal(PAUSED_GAP, 60, 'once per site per minute');
});

test('a Kingdom site shows at most 7 of its 8 slices until done', () => {
  assert.equal(rawStage(0), 1, 'the first slice from the start');
  assert.equal(rawStage(0.3), 3);
  assert.equal(rawStage(0.6), 5);
  assert.equal(rawStage(0.9), 7);
  assert.equal(rawStage(0.999), 7, 'never the roof before it stands');
  assert.equal(rawStage(1), 7);
  for (let p = 0; p <= 1; p += 0.01) assert.ok(rawStage(p) <= RAW.cap && rawStage(p) >= 1);
});

test('the raw color matrix: 30% saturation, brightness kept, warm; full color at the end', () => {
  const lum = (m, r, g, b) => [0, 1, 2].map(i => m[i * 5] * r + m[i * 5 + 1] * g + m[i * 5 + 2] * b + m[i * 5 + 4]);
  const raw = rawMatrix(0), gray = lum(raw, 0.5, 0.5, 0.5);
  for (const [i, c] of gray.entries()) near(c, 0.5 + RAW.warm[i], 'a gray stays gray, but for the warm touch');
  assert.ok(RAW.warm[0] > 0 && RAW.warm[2] < 0 && Math.max(...RAW.warm.map(Math.abs)) <= 0.05, 'a touch warm, not tinted');
  const red = lum(raw, 1, 0, 0);
  near(red[0] - red[1] - (RAW.warm[0] - RAW.warm[1]), RAW.sat, 'red keeps 30% of its difference from gray', 1e-9);
  // (no darker: the luminance of any color kept, but for the warm offsets)
  const [r, g, b] = lum(raw, 0.2, 0.6, 0.9), Y = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  near(Y([r, g, b]) - Y(RAW.warm), Y([0.2, 0.6, 0.9]), 'brightness kept', 1e-9);
  for (const [i, v] of rawMatrix(1).entries()) near(v, [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0][i], `identity ${i}`, 1e-12);
});

test('the Expedition\'s body rises in 64 rows and stops at 90% of them until done; its ghost stays faint', () => {
  assert.equal(solidRows(0), 1, 'the first row from the start');
  assert.equal(solidRows(0.5), 29, 'half way: 0.5 x 0.9 x 64');
  assert.equal(solidRows(0.999), 58, 'the top tenth never before it stands');
  assert.equal(solidRows(1), 58);
  let last = 0; for (let p = 0; p <= 1; p += 0.001) { const k = solidRows(p); assert.ok(k >= last && k >= 1 && k <= 58, `rows ${k} at ${p}`); last = k; }
  for (let t = 0; t < 1; t += 0.013) { const a = ghostAlpha(t); assert.ok(a <= GHOST.alpha + GHOST.shimmer + 1e-12 && a >= GHOST.alpha - GHOST.shimmer - 1e-12, `ghost ${a}`); }
  near(ghostAlpha(1 / 24) - ghostAlpha(0), 0.03, 'the shimmer: ±0.03 at 6 Hz (a quarter period in 1/24 s)');
  near(ghostAlpha(1 / 6), ghostAlpha(0), 'a full period in 1/6 s');
});

// The gantry's frame as the art draws it (tools/render3d/country.js, from GANTRY_FRAME): the four masts' feet on the
// ground, world px about the footprint's middle (x east, y south), and how far a mast rises on screen.
function frameOf(n) {
  const F = GANTRY_FRAME, a = F.yaw * Math.PI / 180, h = (n * 16 - F.inset) * F.fit, lift = F.fit / Math.tan(F.elev * Math.PI / 180);
  const at = (x, z) => ({ x: x * Math.cos(a) - z * Math.sin(a), y: x * Math.sin(a) + z * Math.cos(a) }); // (turned 20 degrees: the south edge swings west)
  return { h, fl: at(-h, h), fr: at(h, h), bl: at(-h, -h), br: at(h, -h), mast: F.mast[n] * lift, rail: (F.mast[n] - F.rail) * lift, halfHead: (h / F.fit - F.post / 2) * F.fit * Math.cos(a) };
}

test('the gantry\'s head goes up the front masts, then back along the rails', () => {
  assert.deepEqual([GANTRY_FRAME.yaw, GANTRY_FRAME.fit, GANTRY_FRAME.elev, GANTRY_FRAME.inset], [20, 0.86, 40, 4], 'turned like the Expedition\'s buildings, at the atlas\'s camera');
  assert.deepEqual(GANTRY_FRAME.mast, { 2: 44, 3: 56, 4: 72 }, 'the masts over the tallest building of each footprint');
  for (const n of [2, 3, 4]) {
    const p = headPath(n), f = frameOf(n);
    near(p.foot.x, (f.fl.x + f.fr.x) / 2, `${n}: from the middle of the front masts' feet`); near(p.foot.y, (f.fl.y + f.fr.y) / 2, `${n}: on the ground`);
    assert.ok(p.foot.x < -0.3 * f.h && p.foot.y > 0.9 * f.h, `${n}: the front pair stands west of the footprint's middle (the frame is turned), south of it`);
    near(p.top.x, p.foot.x, `${n}: straight up the masts`); near(p.foot.y - p.top.y, f.rail, `${n}: to the rails`);
    near(p.back.x, (f.bl.x + f.br.x) / 2, `${n}: to the middle of the back masts`); near(p.back.y, (f.bl.y + f.br.y) / 2 - f.rail, `${n}: at the rails' height`);
    near(p.back.x, -p.foot.x, `${n}: as far east of the middle as it started west of it`);
    // on its way: on the solid's top row, never under the ground or past the rails' end
    assert.deepEqual(headAt(n, p.foot.y + 40), p.foot, `${n}: it waits at the masts' feet while the first rows come in south of them`);
    assert.deepEqual(headAt(n, p.back.y - 40), p.back, `${n}: it stops at the rails' end`);
    let last = null;
    for (let row = p.foot.y; row >= p.back.y; row -= 0.5) {
      const at = headAt(n, row), eps = 1e-9;
      near(at.y, row, `${n}: on the row`);
      if (row >= p.top.y) {
        near(at.x, p.foot.x, `${n}: between the front masts at ${row}`);
        // (its ends inside the two masts it runs on: narrower than their gap, the same clearance either side)
        assert.ok(at.x - f.halfHead > f.fl.x && at.x + f.halfHead < f.fr.x, `${n}: inside the front masts at ${row}`);
        near((at.x - f.halfHead) - f.fl.x, f.fr.x - (at.x + f.halfHead), `${n}: centered between them at ${row}`);
      } else {
        // (on the rails: each end on its rail, which runs from a front mast's top to the back one's)
        const t = (p.top.y - row) / (p.top.y - p.back.y), west = f.fl.x + (f.bl.x - f.fl.x) * t, east = f.fr.x + (f.br.x - f.fr.x) * t;
        near(at.x, (west + east) / 2, `${n}: midway between the rails at ${row}`, 1e-6);
        assert.ok(at.x - f.halfHead > west - eps && at.x + f.halfHead < east + eps, `${n}: inside the rails at ${row}`);
      }
      if (last) assert.ok(at.x >= last.x - eps && at.x - last.x <= 0.5 * Math.tan(GANTRY_FRAME.yaw * Math.PI / 180) + eps, `${n}: no jump at ${row}`);
      last = at;
    }
  }
});

// The art against that path, pixel by pixel (public/art, made from the same numbers).
const art = new URL('../public/art/', import.meta.url), atlas = JSON.parse(readFileSync(new URL('atlas.json', art))), frames = {}, pageOf = {}, pages = {};
for (const p of atlas.pages) { const j = JSON.parse(readFileSync(new URL(p, art))); Object.assign(frames, j.frames); for (const k in j.frames) pageOf[k] = j.meta.image; }
/** Frame `name`'s alpha at (x, y) of its full frame (atlas px: two a world px), and its anchor there. */
async function alphaOf(name) {
  const f = frames[name], img = pages[pageOf[name]] ??= await decodeWebP(readFileSync(new URL(pageOf[name], art))), s = f.spriteSourceSize;
  const a = (x, y) => (x < s.x || y < s.y || x >= s.x + s.w || y >= s.y + s.h ? 0 : img.data[((f.frame.y + y - s.y) * img.w + f.frame.x + x - s.x) * 4 + 3]);
  return { a, w: f.sourceSize.w, h: f.sourceSize.h, ax: Math.round(f.anchor.x * f.sourceSize.w), ay: Math.round(f.anchor.y * f.sourceSize.h) };
}

test('the head\'s art sits inside the front masts, a little narrower than their gap, at every footprint', async () => {
  for (const n of [2, 3, 4]) {
    const g = await alphaOf(`gantry_${n}`), bar = await alphaOf(`gantrybar_${n}`), p = headPath(n), f = frameOf(n);
    // The two front masts where a row 8 px over the west one's foot cuts them: the only art of the frame on that row.
    const row = g.ay + Math.round((f.fl.y - 8) * 2), runs = [];
    for (let x = 0; x < g.w; x++) if (g.a(x, row) > 110) { if (runs.length && runs.at(-1)[1] === x - 1) runs.at(-1)[1] = x; else runs.push([x, x]); }
    assert.equal(runs.length, 2, `${n}: the two front masts on that row: ${JSON.stringify(runs)}`);
    const [west, east] = runs.map(([l, r]) => [(l - g.ax) / 2, (r + 1 - g.ax) / 2]); // (world px about the anchor)
    // The head's solid art, set at the foot of its path (to the art's px, as the renderer sets it).
    let l = Infinity, r = -Infinity;
    for (let y = 0; y < bar.h; y++) for (let x = 0; x < bar.w; x++) if (bar.a(x, y) > 110) { l = Math.min(l, x); r = Math.max(r, x + 1); }
    const x0 = Math.round(p.foot.x * 2) / 2, left = x0 + (l - bar.ax) / 2, right = x0 + (r - bar.ax) / 2;
    assert.ok(left >= west[0] && right <= east[1], `${n}: the head (${left}..${right}) within the masts (${west[0]}..${east[1]})`);
    assert.ok(left <= west[1] + 2 && right >= east[0] - 2, `${n}: and up to them: ${left}..${right} between ${west[1]} and ${east[0]}`);
    assert.ok(Math.abs((left - west[0]) - (east[1] - right)) <= 1, `${n}: centered: ${left - west[0]} px in from the west mast's face, ${east[1] - right} from the east one's`);
    assert.ok(right - left < east[1] - west[0], `${n}: narrower than the frame`);
  }
});

test('on every Expedition site the head stays on the solid\'s top row all the way up: the rails outlast the capped art', async () => {
  for (const type of [...FACTIONS.vael.buildBasic, ...FACTIONS.vael.buildAdvanced]) {
    const n = BUILDINGS[type].w, b = await alphaOf(`bldg_${type}`), p = headPath(n);
    assert.equal(BUILDINGS[type].h, n, `${type}: a square footprint, as the frames are drawn`); assert.ok(GANTRY_FRAME.mast[n], `${type}: a frame for ${n} tiles`);
    const painted = (y) => { for (let x = 0; x < b.w; x++) if (b.a(x, y) > 24) return true; return false; }; // (gl/render.js artRows)
    let top = 0, bot = b.h - 1; while (top < b.h && !painted(top)) top++; while (bot > top && !painted(bot)) bot--; bot++;
    const rowAt = (k) => (bot - Math.round((bot - top) * k / GANTRY.rows) - b.ay) / 2 + GANTRY.barDrop; // (gl/render.js stage)
    const cap = rowAt(solidRows(1)), first = rowAt(solidRows(0));
    assert.ok(cap >= p.back.y, `${type}: its capped top row (${cap}) is not past the rails' end (${p.back.y})`);
    assert.ok(cap < p.foot.y, `${type}: and the head has left the ground by then`);
    assert.ok(first - p.foot.y < n * 8, `${type}: its first rows come in no more than a quarter of the footprint south of the head's start (${first} vs ${p.foot.y})`);
  }
});

test('the done moment: 0.5 s, ease-out color, the scaffold a step ahead, then over', () => {
  assert.equal(easeOutCubic(0), 0); assert.equal(easeOutCubic(1), 1); near(easeOutCubic(0.5), 0.875, 'ease-out cubic');
  assert.equal(easeInQuad(0.5), 0.25);
  const s = doneAt(0);
  assert.deepEqual([s.color, s.strip, s.roof, s.heads, s.over], [0, 1, 0, 0, false], 't = 0: still the site\'s look');
  const q = doneAt(0.25);
  near(q.color, 0.875, 'a quarter second: mostly in color'); near(q.strip, (1 - 0.25 / 0.4) ** 3, 'the scaffold nearly gone');
  near(q.roof, 1 - (1 - 0.25 / 0.3) ** 2, 'the roof nearly in'); assert.equal(q.over, false);
  const e = doneAt(0.5);
  assert.deepEqual([e.color, e.strip, e.roof, e.heads, e.over], [1, 0, 1, 1, true], 't = 0.5: done with');
  assert.equal(doneAt(0.4).strip, 0, 'the scaffold gone by 0.4 s');
  for (let t = 0; t <= 0.5; t += 0.01) assert.ok(doneAt(t).strip <= 1 - doneAt(t).color + 1e-12, `the scaffold ahead of the paint at ${t}`);
  assert.ok(doneAt(0.26).strip < 0.06, 'next to nothing left of it at 0.26 s (no half-faded plank over the banner)');
  for (let t = 0; t < 0.5; t += 0.01) assert.ok(doneAt(t).color <= doneAt(t + 0.01).color + 1e-12, 'never back');
  // The Expedition's lights: dark until 0.15 s, up to 1.25x by 0.30 s, settling to 1x by 0.50 s.
  assert.equal(doneAt(0.1, true).glow, 0); near(doneAt(0.3, true).glow, 1.25, 'the peak'); near(doneAt(0.5, true).glow, 1, 'settled');
  near(doneAt(0.225, true).glow, 0.625, 'linear on the way up');
  near(doneAt(0.25).glow, doneAt(0.25).color, 'the Kingdom\'s glow follows the color');
});

test('the Kingdom\'s done dust: one puff per two tiles along the front edge', () => {
  assert.equal(donePuffs({ tx: 10, ty: 10, w: 2, h: 2 }).length, 1);
  assert.equal(donePuffs({ tx: 10, ty: 10, w: 3, h: 3 }).length, 2);
  assert.equal(donePuffs({ tx: 10, ty: 10, w: 4, h: 4 }).length, 2);
  const p = donePuffs({ tx: 10, ty: 10, w: 4, h: 3 });
  assert.ok(p.every(q => q.y > 12 * 32 && q.y <= 13 * 32 && q.x > 320 && q.x < 448), 'along the south edge, inside the width');
});

test('a site has taken damage only below the hp its progress gives it', () => {
  const site = (progress, hp, maxhp = 1000) => ({ progress, hp, maxhp, sh: 0, maxsh: 0 });
  near(siteHp(site(0, 0)), 100, 'a tenth at the start'); near(siteHp(site(0.5, 0)), 550, 'plus 0.9 of it over the build');
  near(siteHp(site(0, 0, 50)), 10, 'at least 10');
  assert.equal(siteHurt(site(0.5, 550)), false, 'a growing site is not hurt');
  assert.equal(siteHurt(site(0.5, 500)), true, 'hit');
  assert.equal(siteHurt({ ...site(0.5, 550), sh: 10, maxsh: 50 }), true, 'shields down');
});

test('a builder strikes about twice a second, each from its own phase', () => {
  const strikes = (id) => { let n = 0, last = strikeCount(id, 0); for (let t = 0; t <= 11; t += 1 / 60) { const c = strikeCount(id, t); if (c !== last) n++; last = c; } return n; };
  for (const id of [1, 2, 17, 300]) assert.equal(strikes(id), 20, `builder ${id}: 20 strikes in 11 s`);
  const first = (id) => { for (let t = 0; ; t += 0.001) if (strikeCount(id, t) !== strikeCount(id, 0)) return t; };
  assert.notEqual(Math.round(first(1) * 100), Math.round(first(2) * 100), 'two builders do not strike in step');
  // Where: the contact point on the nearest edge (the footprint 4 px in).
  const b = { x: 208, y: 208, r: 48, tx: 5, ty: 5, w: 3, h: 3 }, u = { x: 200, y: 280, r: 8 };
  const p = strikeAt(u, b);
  near(p.x, 200, 'in line with the builder'); near(p.y, 252, 'on the south wall'); near(p.dy, -1, 'towards the site');
  assert.equal(atSite({ x: 200, y: 256 + 10, r: 8 }, b), true, 'at the south edge');
  assert.equal(atSite({ x: 200, y: 256 + 40, r: 8 }, b), false, 'too far to work');
});

test('the cards and the toast say how far along, rounded down', () => {
  const rax = { d: { name: 'Barracks' }, progress: 0.614 };
  assert.equal(builderLine(rax), 'Constructing Barracks, 61%');
  assert.equal(siteLine(rax, true), 'Constructing, 61%');
  assert.equal(siteLine(rax, false), 'Paused at 61%', 'short: the kind\'s line under it says why');
  assert.equal(NO_BUILDER, 'No builder');
  assert.equal(pausedToast({ ...rax, progress: 0.9 }), 'Barracks paused at 90%');
  assert.equal(pct(0.999), 99, 'never 100% before it stands'); assert.equal(pct(0), 0);
  assert.equal(builderLine(null), 'Constructing');
});

test('the strike effects read: the weld a small bright core gone in a frame or two, the dust bigger and fuller', () => {
  assert.ok(STRIKE_FX.weld.life <= 0.06, 'one frame or two');
  // (the glint's star is 6 world px across: 4-5 css px at the phone's zoom of 1.75; white-blue, not the Kingdom's warm)
  const core = 6 * STRIKE_FX.weld.scale * 1.75;
  assert.equal(STRIKE_FX.weld.anim, 'glint'); assert.ok((STRIKE_FX.weld.tint & 255) === 0xff && (STRIKE_FX.weld.tint >> 16) < 0xe0, 'white-blue');
  assert.ok(core >= 4 && core <= 5.5, `core ${core} css px`);
  assert.ok(STRIKE_FX.dust.scale >= 1.4 && STRIKE_FX.dust.fade >= 0.85, 'the dust reads at 1x');
});

test('the knock is a sound of its own, next to the hit, with a gap', () => {
  const src = readFileSync(new URL('../src/client/audio.js', import.meta.url), 'utf8');
  assert.match(src, /\n {2}knock: \(b, t\) =>/, 'a knock recipe');
  assert.match(src, /GAP = \{ knock: \d+/, 'never more than one at a time');
});

test('the new look\'s site: in color to 90% of its height until done, the rest gray; its frame goes from side corner to side corner', () => {
  assert.equal(revealRows(0), 1); assert.equal(revealRows(1), Math.round(REVEAL.rows * REVEAL.cap)); assert.ok(revealRows(0.99) < REVEAL.rows);
  let last = 0; for (let p = 0; p <= 1; p += 0.01) { const k = revealRows(p); assert.ok(k >= last); last = k; }
  const gray = revealMatrix(0); assert.deepEqual(gray.slice(0, 5), gray.slice(5, 10)); assert.deepEqual(revealMatrix(1).slice(0, 5).map(v => Math.round(v * 1e9) / 1e9), [1, 0, 0, 0, 0]);
  for (const base of [[[-60, 8], [20, 40], [60, 8], [-20, -24]], [[60, 8], [-20, -24], [-60, 8], [20, 40]], Array.from({ length: 24 }, (_, i) => [30 * Math.cos(i * Math.PI / 12), 15 * Math.sin(i * Math.PI / 12)])]) {
    const f = siteFrame(base), mean = (h) => h.reduce((t, p) => t + p[1], 0) / h.length;
    for (const h of [f.front, f.back]) assert.deepEqual([h[0], h.at(-1)], f.sides, 'each half joins the side corners');
    assert.ok(f.sides[0][0] < f.sides[1][0] && mean(f.front) > mean(f.back), 'left and right; the front half the nearer one');
    assert.equal(new Set([...f.front, ...f.back]).size, base.length, 'every point in one half');
  }
});
