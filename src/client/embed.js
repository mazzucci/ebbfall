// The embed channel's checks (claude/PROTOCOL.md; claude.js uses them): which origins may talk to the game, and what a
// message from the page must be, field by field. The one free text taken is a line for the player: trimmed, capped,
// no control characters, and shown as text only. Pure: no DOM, no WASM (test/plan.test.js).
import { decode, MAX_LEN, gameSeed } from './plan.js';

/** The longest line for the player. */
export const SAY_MAX = 140;
/** The loopback origins a local page (the plugin's) is served from. */
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
/** An origin as `embedder=` may name one: https, a host, a port; no path. */
const ORIGIN = /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/;

/** Whether an origin may talk to the game: a loopback one, or exactly the `embedder` named in the address. */
export function allowedOrigin(origin, embedder = null) {
  if (typeof origin !== 'string') return false;
  return LOOPBACK.test(origin) || (embedder !== null && ORIGIN.test(embedder) && origin === embedder);
}

/** A line for the player as a message carries it: trimmed, 1 to `SAY_MAX` characters, no control characters; else null. */
export function sayLine(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  // eslint-disable-next-line no-control-regex
  return t.length >= 1 && t.length <= SAY_MAX && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(t) ? t : null;
}

/** A message from the page, checked strictly: `{ type, ...fields }` as claude/PROTOCOL.md names them; a plan or a delta
 *  well formed but whose code or line does not pass, `{ type, bad: why }` (answered `ok: false`); else null (ignored). */
export function readMessage(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || m.v !== 1 || typeof m.type !== 'string') return null;
  const keys = Object.keys(m).sort().join(',');
  const codeWhy = (c, delta) => (typeof c !== 'string' ? 'the code is not a string' : c.length > MAX_LEN ? `the code is longer than ${MAX_LEN}`
    : decode(c, { delta }) ? null : `'${c.slice(0, 40)}' is not a ${delta ? 'delta' : 'plan'} code (claude/PLAN_VOCAB.md)`);
  switch (m.type) {
    case 'ebbfall:hello': return keys === 'type,v' ? { type: 'hello' } : null;
    case 'ebbfall:plan': {
      if (keys !== 'code,type,v' && keys !== 'code,seed,type,v') return null;
      const seed = m.seed === undefined ? null : gameSeed(m.seed);
      const why = codeWhy(m.code, false) || (m.seed !== undefined && seed === null ? 'the seed is not a whole number 0 to 4294967295' : null);
      return why ? { type: 'plan', bad: why } : { type: 'plan', code: m.code, seed };
    }
    case 'ebbfall:delta': {
      if (keys !== 'code,type,v' && keys !== 'code,say,type,v') return null;
      const say = m.say === undefined ? undefined : sayLine(m.say);
      const why = codeWhy(m.code, true) || (say === null ? `the line for the player is not 1 to ${SAY_MAX} characters of text` : null);
      return why ? { type: 'delta', bad: why } : { type: 'delta', code: m.code, say };
    }
    case 'ebbfall:say': { const say = keys === 'text,type,v' ? sayLine(m.text) : null; return say ? { type: 'say', say } : null; }
    default: return null;
  }
}
