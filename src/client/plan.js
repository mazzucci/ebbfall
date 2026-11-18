// A plan for the AI (play against Claude: claude/PLAN_VOCAB.md, claude/PROTOCOL.md): a game link's `?plan=CODE` sets the
// fields Claude wrote for the AI seat of a single-player game (Hard's AI with them). `&watch=1`: the person watches
// that plan play the built-in Hard instead (both seats AI, every seat's sight, no orders).
//
// The code, version 1: `1.<field>.<field>...`, lower-case letters, digits and dots only (a chat's link detection keeps
// all of it); each field a letter and its value (crates/endfall-sim/src/data/plan.rs reads the same grammar, validates
// every value and clamps it: the sim is the authority, this is the link's gate). No free text: a unit is a word of
// letters the sim must know. Parsing is strict: anything that is not the grammar is no plan (the plain menu). The
// canonical code (`encode`) puts the fields in the vocabulary's order; decode(encode(p)) is p.
// Pure: no DOM, no WASM (test/plan.test.js).

/** The link's parameters. */
export const PARAM = 'plan';
export const WATCH = 'watch';
/** The longest code taken (the sim's PLAN_MAX_LEN). */
export const MAX_LEN = 160;
/** The fields, in the vocabulary's order: each letter and the shape of its value. */
const TIME = /^(\d{1,2})m(\d{2})?$/;
const FIELDS = [
  ['w', 'int'], ['f', 'time'], ['s', 'int'], ['e', 'timeNo'], ['b', 'int'], ['t', 'timeNo'], ['k', 'timeNo'],
  ['o', 'towers'], ['r', 'bit'], ['p', 'unit'], ['n', 'units'], ['m', 'int'], ['g', 'time'], ['x', 'intents'],
];
const INTENTS = ['attack', 'hold', 'pull', 'mass'];
const SHAPE = Object.fromEntries(FIELDS);

/** A time value: seconds, or null for one that is not `<m>m` / `<m>m<ss>` (ss below 60). */
function time(v) {
  const m = TIME.exec(v);
  if (!m || (m[2] !== undefined && +m[2] >= 60)) return null;
  return +m[1] * 60 + (m[2] === undefined ? 0 : +m[2]);
}
/** A time as a code writes it: 6m, 4m30. */
const writeTime = (s) => (s % 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}` : `${s / 60}m`);

/** The plan a code names (`{ w, f, s, e, b, t, k, o, r, p, n, m, g, x }`, each only when set: numbers, seconds (`'no'`
 *  where a step may be left out), towers and units as lists), or null for anything that is not the grammar. `delta`:
 *  intents (`x`) allowed. */
export function decode(code, { delta = false } = {}) {
  if (typeof code !== 'string' || code.length > MAX_LEN || !/^[a-z0-9.]+$/.test(code)) return null;
  const parts = code.split('.');
  if (parts.shift() !== '1') return null;
  const p = {};
  for (const part of parts) {
    const key = part[0], v = part.slice(1), shape = SHAPE[key];
    if (!shape || (key === 'x' && !delta)) return null;
    const many = ['towers', 'units', 'intents'].includes(shape);
    if (!many && key in p) return null;
    let val;
    if (shape === 'int') val = /^\d{1,3}$/.test(v) ? +v : null;
    else if (shape === 'bit') val = v === '0' || v === '1' ? +v : null;
    else if (shape === 'time') val = time(v);
    else if (shape === 'timeNo') val = v === 'no' ? 'no' : time(v);
    else if (shape === 'towers') val = v === 'no' ? 'no' : time(v);
    else if (shape === 'unit' || shape === 'units') val = /^[a-z]{3,12}$/.test(v) ? v : null;
    else val = INTENTS.includes(v) ? v : null;
    if (val === null) return null;
    if (!many) p[key] = val;
    else (p[key] ??= []).push(val);
  }
  if (p.o && p.o.includes('no') && p.o.length > 1) return null; // ('ono' and a tower time together)
  if (p.o && p.o[0] !== 'no') p.o.sort((a, b) => a - b);
  return p;
}

/** The canonical code of a plan `decode` gave (the fields in the vocabulary's order). */
export function encode(p) {
  const out = ['1'];
  for (const [key, shape] of FIELDS) {
    if (!(key in p)) continue;
    const vals = Array.isArray(p[key]) ? p[key] : [p[key]];
    for (const v of vals) out.push(key + (shape.startsWith('time') || shape === 'towers' ? (v === 'no' ? 'no' : writeTime(v)) : String(v)));
  }
  return out.join('.');
}

/** A code's canonical form, or null for one that is not a plan. */
export const canonical = (code, opts) => { const p = decode(code, opts); return p ? encode(p) : null; };

/** The single-player page's line while a plan is set. */
export const line = (watch) => (watch ? "WATCH · Claude's plan vs Hard" : "CLAUDE'S PLAN · the AI plays it");

/** The plan a page's address names: `{ code, watch }`, or null. */
export function fromSearch(search) {
  const q = new URLSearchParams(search);
  const code = q.has(PARAM) ? canonical(q.get(PARAM)) : null;
  return code ? { code, watch: q.get(WATCH) === '1' } : null;
}
