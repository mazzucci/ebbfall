// The seat list (single player's; the lobby's to come): a row per seat, its colour, its name and its choices, each a
// native select dressed as a button (`.isel`: the phone's own picker), and how the rows become the game's seats. The
// sim seats allies side by side only when their seat numbers follow each other (map.rs seat_starts), so a game's
// seats are the rows in team order: your team first, you first in it; each row's dot already shows the colour its
// seat will have, so the rows stay where they are while the teams change. Pure but for the two DOM helpers at the end
// (test/seats.test.js).
import { SEAT_COLORS } from './look.js';

/** The races a seat may pick, and the AI's difficulties (their names, for the selects; `short`: a phone's, whose
 *  selects are 16 px so that iOS does not zoom into them, and two rows' worth must sit side by side). */
export const RACES = ['humans', 'vael'];
export const RACE_NAMES = { humans: 'HUMANS', vael: 'VAEL', random: 'RANDOM' };
export const RACE_SHORT = { humans: 'HUM', vael: 'VAEL', random: 'RND' };
export const DIFF_NAMES = ['EASY', 'MEDIUM', 'HARD', 'BRUTAL'];
export const teamName = (t, short) => (short ? `T${t + 1}` : `TEAM ${t + 1}`);

/** The game's seats for the rows (`{ team }` each, row 0 you): the rows in seat order (your team's first, you first;
 *  then the other teams in the order of their first rows, each in row order: free for all keeps the rows' order), and
 *  the team id of each seat, 0 for yours and up in that order (empty when every seat is its own team: free for all,
 *  as the sim's default). */
export function arrange(rows) {
  const keys = [...new Set(rows.map(r => r.team))]; // (row 0's first)
  const order = keys.flatMap(t => rows.map((r, i) => i).filter(i => rows[i].team === t));
  const teams = order.map(i => keys.indexOf(rows[i].team));
  return { order, teams: keys.length === rows.length ? [] : teams };
}
/** What START GAME plays for the rows (`draw(race)`: a RANDOM one drawn): the seats in `arrange`'s order, each one's
 *  race, whether the AI plays it (all but you, seat 0), the teams (empty: free for all), each seat's difficulty (empty
 *  when every AI's is the same: the sim's `diff` then, as before) and `diff`, the hardest AI's (the record's level). */
export function startSetup(rows, draw = (r) => r) {
  const { order, teams } = arrange(rows), seats = order.map(i => rows[i]), diffs = seats.map(r => r.diff ?? 0);
  const diff = Math.max(...diffs.slice(1));
  return { races: seats.map(r => draw(r.race)), ai: seats.map((_, s) => s > 0), teams, diffs: diffs.slice(1).every(d => d === diff) ? [] : diffs, diff };
}
/** The rows the menu before the seat list saved (`race`, `enemy`, `diff`, `players` and their `teams`: a team per
 *  seat, maps.js `teamList`); anything not a good one: you and one AI, on Easy. */
export function legacyRows({ race, enemy, diff, players, teams = [] }, max) {
  const r = (k) => ([...RACES, 'random'].includes(k) ? k : 'humans'), d = Number.isInteger(diff) && diff >= 0 && diff < DIFF_NAMES.length ? diff : 0;
  const n = Number.isInteger(players) && players >= 2 && players <= max ? players : 2;
  return Array.from({ length: n }, (_, i) => (i ? { race: r(enemy), team: teams.length === n ? teams[i] : i, diff: d } : { race: r(race), team: teams.length === n ? teams[0] : 0 }));
}
/** Every row on one team: nobody to fight. */
export const oneTeam = (rows) => rows.every(r => r.team === rows[0].team);
/** The lowest team number no row has (a new AI's: on its own). */
export const freeTeam = (rows) => { let t = 0; while (rows.some(r => r.team === t)) t++; return t; };
/** Team numbers in the order they first appear, from 0 (after a row is removed: no gap). */
export function compact(rows) {
  const seen = [...new Set(rows.map(r => r.team))];
  return rows.map(r => ({ ...r, team: seen.indexOf(r.team) }));
}
/** A saved setup if it is a good one (2 to `max` rows, you first, a race each, a team number below the rows' count, a
 *  difficulty each AI), else null. */
export function validRows(rows, max) {
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > max) return null;
  const ok = rows.every((r, i) => r && typeof r === 'object' && (RACES.includes(r.race) || r.race === 'random')
    && Number.isInteger(r.team) && r.team >= 0 && r.team < rows.length && (i === 0 || (Number.isInteger(r.diff) && r.diff >= 0 && r.diff < DIFF_NAMES.length)));
  return ok ? rows.map((r, i) => (i === 0 ? { race: r.race, team: r.team } : { race: r.race, team: r.team, diff: r.diff })) : null;
}

/** A seat's colour in the game, as CSS. */
export const seatColor = (seat) => '#' + SEAT_COLORS[seat % SEAT_COLORS.length].toString(16).padStart(6, '0');

/** A native select dressed as a button: `options` [value, text, title?], `value` chosen, `on(value)` when another is
 *  chosen (none: shown, not chosen), `label` its name for screen readers. */
export function selectBox(options, value, on, label) {
  const s = document.createElement('select');
  s.className = 'isel'; s.setAttribute('aria-label', label);
  for (const [v, t, title] of options) { const o = new Option(t, v); if (title) o.title = title; s.appendChild(o); }
  s.value = String(value); s.disabled = !on;
  if (on) s.addEventListener('change', () => on(s.value));
  return s;
}
/** A seat's row: its colour, its name, then its controls (null: an empty cell, so the columns line up). */
export function seatRow(color, name, controls, cls = '') {
  const row = document.createElement('div');
  row.className = 'srow' + (cls ? ' ' + cls : '');
  const dot = document.createElement('i'); dot.className = 'dot'; dot.style.background = color;
  const b = document.createElement('b'); b.textContent = name;
  row.append(dot, b, ...controls.map(c => c || document.createElement('span')));
  return row;
}
