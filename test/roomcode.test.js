// Room codes (src/net/roomcode.js): what the relay makes, what the lobby reads from a link or the code field and how it
// shows them (BCD-FGH), the share line, and the first format (four letters) told apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALPHABET, LETTERS, newCode, parseCode, showCode, oldCode } from '../src/net/roomcode.js';

test('a room code: six letters of the alphabet, shown BCD-FGH, read in any case, with or without the hyphen or spaces', () => {
  assert.equal(LETTERS, 6); assert.equal(ALPHABET.length ** LETTERS, 64000000);
  let i = 0; const seq = [0, 1, 19, 20, 39, 2 ** 32 - 1];
  assert.equal(newCode(() => seq[i++]), 'BCZBZT', 'each letter a draw modulo 20');
  for (let n = 0; n < 200; n++) assert.match(newCode(() => crypto.getRandomValues(new Uint32Array(1))[0]), /^[BCDFGHJKLMNPQRSTVWXZ]{6}$/);
  assert.equal(showCode('BCDFGH'), 'BCD-FGH');
  for (const t of ['BCDFGH', 'bcdfgh', 'BCD-FGH', 'bcd-fgh', ' BCD FGH ', 'bcd - fgh', 'B-C-D-F-G-H']) assert.equal(parseCode(t), 'BCDFGH', t);
  for (const t of ['', 'BCDF', 'BCDFG', 'BCDFGHJ', 'ABCDFG', 'BCD_FGH', 'BCD.FGH', 'BCD+FGH', 'BCDFG1', '-'.repeat(30) + 'BCDFGH', null, undefined, 42, ['BCDFGH']]) assert.equal(parseCode(t), '', String(t));
  assert.ok(oldCode('BCDF') && oldCode('wgnj')); assert.ok(!oldCode('BCDFGH') && !oldCode('ABCD') && !oldCode('BCD') && !oldCode(null));
});

test('the lobby reads and shows codes through roomcode.js only', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/client/online.js', import.meta.url), 'utf8'), html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(src, /parseCode\(\$\('roomCode'\)\.value\)/, 'JOIN reads the field with parseCode');
  assert.match(src, /link = parseCode\(linked\)/, 'a link\'s ?room= with parseCode');
  assert.match(src, /\$\('roomShow'\)\.textContent = showCode\(m\.room\)/, 'the room\'s title shown BCD-FGH');
  assert.match(src, /room \$\{showCode\(code\)\}/, 'the share line too');
  assert.doesNotMatch(src, /\[A-Z\]\{4\}|slice\(0, 4\)/, 'no four-letter code left');
  assert.ok(Number(html.match(/id="roomCode" maxlength="(\d+)"/)[1]) >= ' bcd - fgh '.length, 'the field takes a code typed with a hyphen and spaces');
});
