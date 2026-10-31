// The words players read call a seat the game plays "computer", as the 1998 games did, never "AI" (a word that means
// something else now): index.html's text, attributes and structured data, the README's prose, the string literals of
// the client, the site's Worker and the link preview's image (comments and code names such as `ai` are not words a
// player reads, and are left alone), and the words the game makes: a seat's name, a challenge's card and SHARE line,
// a link's card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { encode, decode, card, shareText, line } from '../src/client/challenge.js';
import { MAPS } from '../src/client/maps.js';
import { seatName, SPOTS } from '../src/client/seats.js';
import { ORIGIN, preview } from '../site/preview.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** The word players should not read: AI, AIs, AI's (upper case: `ai`, `aiName`, `addai` are code). */
const AI = /\bAIs?\b/;
/** Each of `texts` that says AI, with where it is from. */
const sayingAi = (where, texts) => texts.filter(t => AI.test(t)).map(t => `${where}: ${JSON.stringify(t.trim().slice(0, 120))}`);

/** The string literals of a JS source: quoted strings and the text of template literals (their `${}` code scanned in
 *  turn); comments and regular expression literals skipped. A small scanner, enough for this repo's code. */
export function literals(src) {
  const out = [];
  let i = 0;
  const KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'void', 'yield', 'await', 'delete', 'new', 'throw']);
  /** Whether a `/` at `i` starts a regular expression (else it divides): what comes before it decides. */
  const regexAt = () => {
    let j = i - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    if (j < 0) return true;
    const c = src[j];
    if (/[\w$]/.test(c)) { let k = j; while (k >= 0 && /[\w$]/.test(src[k])) k--; return KEYWORDS.has(src.slice(k + 1, j + 1)); }
    return !/[)\]'"`]/.test(c);
  };
  const quoted = (q) => {
    let s = '';
    for (i++; i < src.length && src[i] !== q; i++) s += src[i] === '\\' ? src[++i] : src[i];
    i++; out.push(s);
  };
  const regex = () => {
    let cls = false;
    for (i++; i < src.length; i++) {
      const c = src[i];
      if (c === '\\') i++;
      else if (c === '[') cls = true;
      else if (c === ']') cls = false;
      else if (c === '/' && !cls) break;
    }
    for (i++; /[a-z]/i.test(src[i] ?? ''); i++);
  };
  const template = () => {
    let s = '';
    for (i++; i < src.length; ) {
      const c = src[i];
      if (c === '\\') { s += src[i + 1]; i += 2; } else if (c === '`') { i++; break; } else if (c === '$' && src[i + 1] === '{') { i += 2; code(true); s += ' '; } else { s += c; i++; }
    }
    out.push(s);
  };
  /** Code up to the end (or, `inner`, to the `}` that closes a template's `${`). */
  function code(inner = false) {
    let depth = 0;
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (c === '/' && n === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; } else if (c === '/' && n === '*') i = src.indexOf('*/', i + 2) + 2;
      else if (c === '"' || c === "'") quoted(c);
      else if (c === '`') template();
      else if (c === '/' && regexAt()) regex();
      else {
        if (c === '{') depth++;
        else if (c === '}') { if (inner && depth === 0) { i++; return; } depth--; }
        i++;
      }
    }
  }
  code();
  return out;
}

test('the scanner reads string literals, not comments, code names or regular expressions', () => {
  const src = "// AI in a comment\n/* AI */ const ai = 'a'; const b = \"it's \\\"q\\\"\"; const re = /AI's/g; const t = `x ${ai + `in ${'AI'}`} y`; const d = n / 2 / 3; f('last') /* AI */";
  assert.deepEqual(literals(src), ['a', 'it\'s "q"', 'AI', 'in  ', 'x   y', 'last']);
});

test('index.html: no AI in what it shows, its attributes, its head (description, Open Graph, X) or its JSON-LD', () => {
  const html = read('index.html')
    .replace(/<!--[\s\S]*?-->/g, '') // (notes for developers)
    .replace(/<script\b(?![^>]*ld\+json)[^>]*>[\s\S]*?<\/script>/g, '') // (code; the JSON-LD stays: crawlers read it)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '');
  const attrs = [...html.matchAll(/\s(?:title|aria-label|alt|placeholder|content|value)="([^"]*)"/g)].map(m => m[1]);
  const text = html.replace(/<[^>]*>/g, '\n').split('\n').filter(t => t.trim());
  assert.ok(text.some(t => /against the computer/.test(t)) && attrs.some(t => /against the computer/.test(t)), 'the scan sees the JSON-LD and the head');
  assert.deepEqual([...sayingAi('text', text), ...sayingAi('attribute', attrs)], []);
});

test("the README's prose: no AI", () => {
  const prose = read('README.md').replace(/```[\s\S]*?```/g, '').split('\n');
  assert.deepEqual(sayingAi('README.md', prose), []);
});

test("the client's, the site's and the preview image's string literals: no AI", () => {
  const files = [
    ...readdirSync(new URL('../src/client/', import.meta.url)).filter(f => f.endsWith('.js')).map(f => `src/client/${f}`),
    'src/main.js', 'src/boot.js', 'site/preview.js', 'site/worker.js', 'tools/og.mjs',
  ];
  assert.ok(files.includes('src/client/online.js') && files.includes('src/client/menu.js') && files.includes('src/client/seats.js'));
  const found = files.flatMap(f => sayingAi(f, literals(read(f))));
  assert.deepEqual(found, []);
  assert.ok(literals(read('src/client/menu.js')).includes('+ COMPUTER'), 'the scan reads the board');
});

test('the words the game makes: seat names, every challenge card and SHARE line, a link\'s card', () => {
  const said = [];
  for (let i = 0; i < SPOTS; i++) said.push(seatName(i));
  const map = MAPS.findIndex(m => m.name === 'Iron Compass'); // (eight starts: any count of allies and enemies)
  for (let allies = 0; allies < 4; allies++) {
    for (let foes = 1; allies + foes < 8; foes++) {
      for (const levels of [[0], [3], [1, 2], [0, 3]]) {
        const spots = Array.from({ length: SPOTS }, (_, i) => (i === 0 ? { race: 'humans', team: 0 } : i <= allies ? { race: 'vael', team: 0, diff: 1 }
          : i <= allies + foes ? { race: 'vael', team: 1, diff: levels[i % levels.length] } : null));
        const c = decode(encode({ map, side: 0, secs: 754, spots }));
        assert.ok(c, `${allies} allies, ${foes} foes: a code`);
        const shown = preview(new URL(`${ORIGIN}/?vs=${encode(c)}`));
        said.push(...Object.values(card(c)), shareText(c), line(c), ...Object.values(shown));
      }
    }
  }
  said.push(...Object.values(preview(new URL(`${ORIGIN}/?room=WGNJ`))));
  assert.ok(said.includes('I beat 3 Brutal computers on Iron Compass in 12:34 in Ebbfall. Can you?'), 'the cases include the plain one');
  assert.ok(said.includes('I beat a Brutal computer with 3 computer allies on Iron Compass in 12:34 in Ebbfall. Can you?'));
  assert.deepEqual(sayingAi('said', said), []);
});
