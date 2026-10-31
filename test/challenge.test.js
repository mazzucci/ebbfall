// A challenge link's code (src/client/challenge.js; SHARE after a victory, its card in site/preview.js): a setup the
// menu plays into a short code and back exactly, the sides numbered as they first appear and the side modulo what moves
// the starts; nothing but a code the game makes is read (hostile, overlong, non-canonical and other versions are not
// challenges); a game's setup as START GAME seated it (a RANDOM race as drawn); and the words, made from the values only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARAM, MAX_SECS, encode, decode, fromSetup, mapOf, clock, card, shareText, line, link } from '../src/client/challenge.js';
import { MAPS, MAP_KINDS, seatsOf, mapName } from '../src/client/maps.js';
import { RACES, raceTitle, startSetup, validRows, SPOTS } from '../src/client/seats.js';
import { DIFF, DIFF_NAMES } from '../src/engine/constants.js';
import { DIFF_NAMES as UTIL_DIFF_NAMES, mulberry } from '../src/engine/util.js';

const at = (name) => MAPS.findIndex(m => m.name === name);
const RANDOM_64 = MAPS.findIndex(m => m.random && m.size === 64), RANDOM_128 = MAPS.findIndex(m => m.random && m.size === 128);
const you = (race = 'humans', team = 0) => ({ race, team });
const ai = (race, team, diff) => ({ race, team, diff });
/** Eight spots from a list (the rest empty). */
const spots = (...rs) => Array.from({ length: SPOTS }, (_, i) => rs[i] ?? null);
const SAFE = /^[^<>&"'\u0000-\u001f]*$/;

test('a setup round-trips through its code: a duel, three Brutal AIs, teams, gaps on the board, a random map', () => {
  const cases = [
    [{ map: at('Ashen Basin'), side: 1, secs: 754, spots: spots(you(), ai('vael', 1, 3)) }, '1.0.1.ky.h00v13'],
    [{ map: at('Iron Compass'), side: 5, secs: 754, spots: spots(you(), ai('vael', 1, 3), ai('vael', 2, 3), ai('vael', 3, 3)) }, '1.8.5.ky.h00v13v23v33'],
    [{ map: at('Dust Quarter'), side: 2, secs: 61, spots: spots(you('vael'), null, ai('humans', 0, 1), ai('vael', 1, 2)) }, '1.4.2.1p.v00xh01v12'],
    [{ map: RANDOM_64, side: 0, secs: 3600, spots: spots(you(), ai('humans', 1, 0)), kind: 4, seed: 123456789 }, '1.3.0.2s0.h00h10.4.21i3v9'],
    [{ map: RANDOM_128, side: 63, secs: MAX_SECS, spots: spots(...[you(), ...Array.from({ length: 7 }, (_, i) => ai(i % 2 ? 'vael' : 'humans', i < 3 ? 0 : 1, i % 4))]), kind: 5, seed: 0xffffffff }, null],
  ];
  for (const [c, want] of cases) {
    const code = encode(c);
    if (want) assert.equal(code, want);
    assert.match(code, /^[0-9a-z.]+$/, 'letters, digits and dots');
    assert.match(code, /[0-9a-z]$/, 'never a dot at the end (a chat would leave it out of the link)');
    assert.ok(code.length <= 52, `short: ${code} (eight players on a random map: the longest)`);
    assert.deepEqual(decode(code), c, code);
  }
});

test('the code is canonical: sides numbered as they first appear, the side modulo starts x players, trailing spots dropped', () => {
  const c = { map: at('Iron Compass'), side: 8 * 3 + 5, secs: 100, spots: spots(you('humans', 4), ai('vael', 7, 2), ai('vael', 4, 1)) };
  const code = encode(c);
  assert.equal(code, '1.8.5.2s.h00v12v01');
  assert.deepEqual(decode(code).spots.slice(0, 3), [you(), ai('vael', 1, 2), ai('vael', 0, 1)]);
  // (the same game: seats.js seats it the same whatever the sides' numbers)
  const a = startSetup(c.spots), b = startSetup(decode(code).spots);
  assert.deepEqual([a.teams, a.spots, a.diffs], [b.teams, b.spots, b.diffs]);
  assert.equal(encode({ ...c, side: 5 }), code, 'the side modulo 8 starts x 3 players');
  assert.equal(encode({ ...c, spots: [...c.spots.slice(0, 3)] }), code, 'a short list is the same board');
  // A decoded board is a good board for the menu.
  assert.deepEqual(validRows(decode(code).spots), decode(code).spots);
});

test('only a code the game makes is a challenge: hostile, malformed, non-canonical and unknown versions are not', () => {
  const good = '1.8.5.ky.h00v13v23v33';
  assert.ok(decode(good));
  const bad = [
    undefined, null, 7, {}, [], '', ' ', good + ' ', ' ' + good, good.toUpperCase(), good + '.', good + 'x', good + '.0.1',
    '2.8.5.ky.h00v13v23v33', '0.8.5.ky.h00v13v23v33', '1.8.11.ky.h00v13v23v33', '1', '1.8', '1.8.11.ky', '1.8.11.ky.', '1..11.ky.h00v13',
    '1.08.5.ky.h00v13v23v33', '1.8.05.ky.h00v13v23v33', '1.8.5.0ky.h00v13v23v33', // (leading zeros; a side past starts x players)
    '1.c.0.ky.h00v13', '1.z.0.ky.h00v13', // (no such map)
    '1.0.0.ky.h00v13v23', // (three players on a two-start map)
    '1.0.0.ky.h00', '1.0.0.ky.h00x', '1.0.0.ky.xh00v13', // (alone; you not in spot 0)
    '1.0.0.ky.h01v13', // (your level: none)
    '1.0.0.ky.h00v03', // (everyone on one side)
    '1.0.0.ky.h00v23', '1.8.0.ky.h00v13v33', // (sides not numbered as they first appear)
    '1.0.0.ky.h00v14', '1.0.0.ky.h00r13', '1.0.0.ky.h00v83', '1.0.0.ky.h00V13', // (no such level, race, side)
    '1.0.4.ky.h00v13', // (side past starts x players)
    '1.0.0.0.h00v13', '1.0.0.7ps0.h00v13', // (no time; 100 hours)
    '1.0.0.ky.h00v13x', '1.0.0.ky.h00v13xxxxxx', // (trailing empty spots)
    '1.0.0.ky.h00v13.4.2', // (a fixed map with a seed)
    '1.3.0.ky.h00v13', '1.3.0.ky.h00v13.6.2', '1.3.0.ky.h00v13.4', '1.3.0.ky.h00v13.4.1z141z4', '1.3.0.ky.h00v13.4.02', // (a random map: kind and seed)
    '1.0.0.ky.h00v13&x=1', '1.0.0.ky.h00v13<script>', '<script>alert(1)</script>', '1.0.0.ky.h00v13%00', '1.0.0.ky.h00v13\n',
    '1.0.0.ky.h00v1３', '1.0.0.ky.h00v13'.padEnd(65, 'x'), 'x'.repeat(5000), '1.0.0.ky.' + 'h00'.repeat(9),
  ];
  for (const b of bad) assert.equal(decode(b), null, JSON.stringify(b));
  // A fuzz of codes from the code's own alphabet: whatever decodes encodes back to itself, and makes plain words.
  const r = mulberry(7), rnd = (n) => Math.floor(r() * n);
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz.hvx';
  let found = 0;
  for (let k = 0; k < 20000; k++) {
    const s = rnd(2) ? Array.from({ length: 6 + rnd(30) }, () => chars[rnd(chars.length)]).join('') : good.replace(/./g, (ch) => (rnd(8) ? ch : chars[rnd(chars.length)]));
    const c = decode(s);
    if (!c) continue;
    found++;
    assert.equal(encode(c), s);
    for (const v of [...Object.values(card(c)), shareText(c), line(c)]) assert.match(v, SAFE);
  }
  assert.ok(found > 10, `some mutated codes are still good ones (${found})`);
});

test("encode refuses what the menu never plays (and fromSetup with it)", () => {
  const ok = { map: 0, side: 0, secs: 10, spots: spots(you(), ai('vael', 1, 0)) };
  assert.ok(encode(ok));
  for (const c of [null, {}, { ...ok, map: 99 }, { ...ok, map: -1 }, { ...ok, map: 0.5 }, { ...ok, side: -1 }, { ...ok, side: 1.5 }, { ...ok, secs: 0 }, { ...ok, secs: MAX_SECS + 1 },
    { ...ok, secs: NaN }, { ...ok, spots: 'h00v13' }, { ...ok, spots: [...ok.spots, null] }, { ...ok, spots: spots(you('random'), ai('vael', 1, 0)) },
    { ...ok, spots: spots(you(), ai('random', 1, 0)) }, { ...ok, spots: spots(you(), ai('vael', 1, 4)) }, { ...ok, spots: spots(you(), ai('vael', 1)) },
    { ...ok, spots: spots(you(), ai('vael', '1', 0)) }, { ...ok, spots: spots(you(), ai('vael', 0, 0)) }, { ...ok, spots: spots(null, ai('vael', 1, 0)) },
    { ...ok, map: RANDOM_64 }, { ...ok, map: RANDOM_64, kind: MAP_KINDS.length, seed: 1 }, { ...ok, map: RANDOM_64, kind: 0, seed: 2 ** 32 }, { ...ok, map: RANDOM_64, kind: 0, seed: -1 }]) {
    assert.equal(encode(c), null, JSON.stringify(c));
  }
});

test("a game's challenge: the menu's setup as START GAME seated it, a RANDOM race as drawn, the time in whole seconds", () => {
  const board = spots(you('random'), ai('vael', 1, 3), null, ai('random', 0, 1));
  const races = ['vael', 'humans', 'vael']; // (seat order: you, your ally from spot 3, the AI in spot 1)
  const s = startSetup(board, (r) => (r === 'random' ? races.shift() : r)); // (drawn in seat order)
  assert.deepEqual(s.spots, [0, 3, 1]);
  const c = fromSetup({ map: at('Dust Quarter'), kind: 0, seed: 1291, side: 9, board, ...s }, 754.4);
  assert.deepEqual(c, { map: at('Dust Quarter'), side: 9, secs: 754, spots: spots(you('vael'), ai('vael', 1, 3), null, ai('humans', 0, 1)) });
  assert.equal(fromSetup({ map: at('Dust Quarter'), side: 9, board, ...s }, 0.2).secs, 1, 'a second at least');
  const r = fromSetup({ map: RANDOM_64, kind: 2, seed: 99, side: 1, board: spots(you(), ai('vael', 1, 0)), races: ['humans', 'vael'], spots: [0, 1] }, 30);
  assert.deepEqual([r.kind, r.seed], [2, 99], "a random map's character and seed");
  assert.deepEqual(mapOf(r), { seed: 99, kind: 2, name: mapName(99), size: 64 });
  assert.deepEqual(mapOf(c), { seed: 1291, kind: 0, name: 'Dust Quarter', size: 96 });
  assert.equal(fromSetup({ map: 0, side: 0, board: spots(you(), ai('vael', 0, 0)), races: [], spots: [] }, 30), null, 'nobody to beat');
  assert.equal(fromSetup({ map: 0, side: 0 }, 30), null);
});

test('the words: a card and a share line from the values, plain text', () => {
  const three = decode('1.8.5.ky.h00v13v23v33');
  assert.deepEqual(card(three), { title: 'Can you beat this? 1 vs 3 Brutal computers on Iron Compass', description: 'Humans vs Vael · won in 12:34 · free, in your browser' });
  assert.equal(shareText(three), 'I beat 3 Brutal computers on Iron Compass in 12:34 in Ebbfall. Can you?');
  assert.equal(line(three), 'CHALLENGE · won in 12:34 · beat it');
  assert.equal(link(three, 'https://ebbfall.com'), `https://ebbfall.com/?${PARAM}=1.8.5.ky.h00v13v23v33`);
  const duel = decode('1.0.1.4z.v00h12');
  assert.deepEqual(card(duel), { title: 'Can you beat this? 1 vs 1 Hard computer on Ashen Basin', description: 'Vael vs Humans · won in 2:59 · free, in your browser' });
  assert.equal(shareText(duel), 'I beat a Hard computer on Ashen Basin in 2:59 in Ebbfall. Can you?');
  const team = decode('1.4.2.1p.v00xh01v12h11');
  assert.equal(card(team).title, 'Can you beat this? 2 vs 2 computers up to Hard on Dust Quarter');
  assert.equal(card(team).description, 'Vael and Humans vs Vael and Humans · won in 1:01 · free, in your browser');
  assert.equal(shareText(team), 'I beat 2 computers up to Hard with a computer ally on Dust Quarter in 1:01 in Ebbfall. Can you?');
  const allies = decode('1.4.2.1p.h00v01v01v13');
  assert.equal(card(allies).title, 'Can you beat this? 3 vs 1 Brutal computer on Dust Quarter');
  assert.equal(shareText(allies), 'I beat a Brutal computer with 2 computer allies on Dust Quarter in 1:01 in Ebbfall. Can you?');
  const random = decode('1.3.0.2s0.h00h10.4.21i3v9');
  assert.equal(card(random).title, `Can you beat this? 1 vs 1 Easy computer on ${mapName(123456789)}`);
  assert.deepEqual([clock(5), clock(65), clock(754), clock(4512), clock(MAX_SECS)], ['0:05', '1:05', '12:34', '75:12', '5999:59']);
});

test("the code's races and levels are the game's", () => {
  assert.deepEqual(RACES, ['humans', 'vael'], 'a race the code has a letter for (h, v), each');
  for (const r of RACES) assert.match(card(decode(`1.0.0.a.${r[0]}00${r[0]}10`)).description, new RegExp(`^${raceTitle(r)} vs ${raceTitle(r)} `));
  assert.equal(DIFF_NAMES, UTIL_DIFF_NAMES, 'one list (constants.js passes util.js\'s on)');
  assert.equal(DIFF_NAMES.length, DIFF.length, "a name for each of the sim's levels");
  for (let d = 0; d < DIFF.length; d++) assert.ok(decode(`1.0.0.a.h00v1${d}`), `level ${d}`);
  assert.equal(decode(`1.0.0.a.h00v1${DIFF.length}`), null);
  for (let i = 0; i < MAPS.length; i++) {
    const code = encode({ map: i, side: 0, secs: 1, spots: spots(you(), ai('vael', 1, 0)), ...(MAPS[i].random ? { kind: 0, seed: 1 } : {}) });
    assert.ok(decode(code), `map ${i}: ${MAPS[i].name}`);
    assert.equal(mapOf(decode(code)).size, MAPS[i].size);
    assert.ok(seatsOf(i) >= 2);
  }
});
