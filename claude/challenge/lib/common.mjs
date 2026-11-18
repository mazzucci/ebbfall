// What the challenge's pieces share: where the local server says it is listening (the state file), and the checks a
// plan code and a line for the player pass before they go to the game (the game checks them again: claude/PROTOCOL.md).
// Node's standard library only.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

/** Where the server writes `{ port, token, pid, mode, url }` and the MCP server reads it: EBBFALL_CHALLENGE_STATE, or one
 *  file per user in the runtime (or temp) folder: one challenge server at a time on this machine. */
export function statePath(env = process.env) {
  if (env.EBBFALL_CHALLENGE_STATE) return env.EBBFALL_CHALLENGE_STATE;
  const base = env.XDG_RUNTIME_DIR || tmpdir();
  const uid = typeof process.getuid === 'function' ? process.getuid() : 'user';
  return join(base, `ebbfall-challenge-${uid}`, 'server.json');
}

/** The running server's state, or null when none has written one. */
export function readState(env = process.env) {
  try {
    const s = JSON.parse(readFileSync(statePath(env), 'utf8'));
    return Number.isInteger(s.port) && typeof s.token === 'string' ? s : null;
  } catch {
    return null;
  }
}

/** The protocol's limits. */
export const CODE_MAX = 160;
export const LINE_MAX = 140;
export const INTENTS = ['attack', 'hold', 'pull', 'mass'];
/** What the tools call the intents (and what the vocabulary's code words are). */
export const INTENT_WORDS = { attack: 'attack', 'attack now': 'attack', hold: 'hold', 'hold home': 'hold', pull: 'pull', 'pull back': 'pull', pullback: 'pull', mass: 'mass', 'mass next wave': 'mass' };

/** A code's shape (the sim parses it for real): `1.` and fields, lower-case letters, digits and dots. */
export function codeError(code) {
  if (typeof code !== 'string' || !code) return 'a plan code is a non-empty string';
  if (code.length > CODE_MAX) return `a plan code is at most ${CODE_MAX} characters`;
  if (!/^[a-z0-9.]+$/.test(code)) return 'a plan code has only lower-case letters, digits and dots';
  if (code !== '1' && !code.startsWith('1.')) return 'a plan code starts with its version, "1."';
  if (code.split('.').some(p => !p)) return 'a plan code has an empty field (two dots together, or a dot at the end)';
  return null;
}

/** A delta's code: `delta`'s fields (a code, or none) and the intents as `x` fields, each once. Err: a string. */
export function deltaCode(delta, intents = []) {
  let code = delta ? String(delta).trim() : '1';
  const bad = codeError(code);
  if (bad) return { error: bad };
  const have = new Set(code.split('.').filter(p => p.startsWith('x')).map(p => p.slice(1)));
  for (const raw of intents) {
    const word = INTENT_WORDS[String(raw).trim().toLowerCase()];
    if (!word) return { error: `"${raw}" is not an intent (attack, hold, pull, mass)` };
    if (!have.has(word)) { code += `.x${word}`; have.add(word); }
  }
  if (code.length > CODE_MAX) return { error: `the delta with its intents is over ${CODE_MAX} characters` };
  return { code };
}

/** A line for the player, trimmed; Err: why it is not one. */
export function lineCheck(text) {
  if (typeof text !== 'string') return { error: 'a line is a string' };
  const t = text.trim();
  if (!t) return { error: 'a line is not empty' };
  if (t.length > LINE_MAX) return { error: `a line is at most ${LINE_MAX} characters (this one is ${t.length})` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(t)) return { error: 'a line has no control characters (one line, no tabs)' };
  return { text: t };
}
