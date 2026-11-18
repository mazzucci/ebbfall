// Claude's notes on a rival, kept between games: one file per player name, outside the repo, in the person's home
// (~/.ebbfall-challenge/notes/<player>.md; EBBFALL_CHALLENGE_HOME names another folder). Claude writes them through the
// save_notes tool after each game (at most NOTES_MAX characters, the next try first), and the next game's first message
// carries them, so a rematch after /clear, or in a new session, keeps the rival's memory. Deleting the file resets it.
// Shared by the server (server.mjs), the headless driver (drive.mjs) and the prompts. Node's standard library only.
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';

/** The most a player's notes hold (characters). Longer ones are refused, never cut: Claude rewrites them. */
export const NOTES_MAX = 1200;

/** A player name: lower-case letters, digits, `-` and `_`, 1 to 32, starting with a letter or digit. */
const PLAYER = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function playerError(name) {
  if (typeof name !== 'string' || !PLAYER.test(name)) return 'a player name is 1 to 32 lower-case letters, digits, - or _ (e.g. "sam" or "hard")';
  return null;
}

/** The name when the person gives none: in watch mode the rival is the built-in Hard AI; in play mode, the person's
 *  login name (made into a player name), else "player". */
export function defaultPlayer(mode, env = process.env) {
  if (mode === 'watch') return 'hard';
  let login = env.USER || env.USERNAME || '';
  if (!login) try { login = userInfo().username; } catch { /* none */ }
  const name = String(login).toLowerCase().replace(/[^a-z0-9_-]/g, '').replace(/^[_-]+/, '').slice(0, 32);
  return name || 'player';
}

/** The folder that holds the challenge's data (the notes under notes/). */
export function challengeHome(env = process.env) {
  return env.EBBFALL_CHALLENGE_HOME || join(homedir(), '.ebbfall-challenge');
}

export function notesPath(player, env = process.env) {
  const bad = playerError(player);
  if (bad) throw new Error(bad);
  return join(challengeHome(env), 'notes', `${player}.md`);
}

/** Notes as Claude wrote them, trimmed; Err: why they are not taken (over the cap: how long they are). */
export function notesCheck(text) {
  if (typeof text !== 'string') return { error: 'notes are a string' };
  const t = text.replace(/\r\n?/g, '\n').trim();
  if (!t) return { error: 'notes are not empty' };
  if (t.length > NOTES_MAX) {
    return { error: `Your notes are ${t.length} characters; the most is ${NOTES_MAX}. Nothing was saved: rewrite them shorter (the next try first) and call save_notes again.` };
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(t)) return { error: 'notes are plain text (no control characters but new lines and tabs)' };
  return { text: t };
}

/** The player's saved notes, or '' when there are none. */
export function readNotes(player, env = process.env) {
  try {
    return readFileSync(notesPath(player, env), 'utf8').trim();
  } catch {
    return '';
  }
}

/** Saves the player's notes (checked by notesCheck first); answers the file's path. Written whole or not at all. */
export function writeNotes(player, text, env = process.env) {
  const path = notesPath(player, env);
  mkdirSync(join(challengeHome(env), 'notes'), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text + '\n', { mode: 0o600 });
  renameSync(tmp, path);
  return path;
}
