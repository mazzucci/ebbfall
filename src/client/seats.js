// The seats of a game against the AI (single player's sides board; the lobby's to come): the rows (you first, then the
// AIs, each `{ race, team, diff }`), how they become the game's seats, and the board's pieces. The sim seats allies
// side by side only when their seat numbers follow each other (map.rs team_starts), so a game's seats are the rows in
// team order: your team first, you first in it; each token's band already shows the colour its seat will have, so
// the tokens stay where they are while the sides change. The rules are pure (test/seats.test.js); the DOM builders at
// the end (a token, a side, a row of chips, a seat's sheet) only touch the document when called.
import { SEAT_COLORS } from './look.js';

/** The races a seat may pick, and the AI's difficulties (their names; `RACE_SHORT` on a token where room is short). */
export const RACES = ['humans', 'vael'];
export const RACE_NAMES = { humans: 'HUMANS', vael: 'VAEL', random: 'RANDOM' };
export const RACE_SHORT = { humans: 'HUM', vael: 'VAEL', random: 'RND' };
export const DIFF_NAMES = ['EASY', 'MEDIUM', 'HARD', 'BRUTAL'];

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

// The board's pieces (the lobby is to use them too): a seat is a token, a team is a side, a token opens one sheet.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
/** What each difficulty means, under the sheet's PLAYS (and a chip's title). */
export const DIFF_TITLES = ['A slow, gentle opponent: time to learn and build', 'A real fight: the first attack comes at about three minutes', 'Plays the whole game well: early attacks, research, raids, split waves', 'Hard, faster, and it gathers 30% more than you'];
const seatName = (i) => (i ? `AI ${i}` : 'YOU');
const title = (k) => k[0] + k.slice(1).toLowerCase(); // ('VAEL': 'Vael', for a screen reader)

/** A difficulty as four pips, `d + 1` of them lit (a level at a glance; its name is in the sheet). */
export function pips(d) {
  const p = el('span', 'lvl'); p.setAttribute('aria-hidden', 'true');
  for (let k = 0; k < 4; k++) p.appendChild(el('i', k <= d ? 'on' : ''));
  return p;
}
/** A seat's token: a button with the seat's colour as a band down its left edge, its name, its race (`short`: HUM,
 *  VAEL, RND), an AI's difficulty as pips and a faint pen; `side` names its side for a screen reader; `open(i)` when
 *  tapped (none, `ro`: shown, not changed, as another's seat in the lobby). */
export function seatToken(row, i, color, { short = false, side = '', open = null, on = false } = {}) {
  const b = el('button', 'ib tok' + (i ? '' : ' me') + (on ? ' on' : '') + (open ? '' : ' ro'));
  const band = el('i', 'band'); band.style.background = color;
  b.append(band, el('b', '', seatName(i)), el('span', 'race', (short ? RACE_SHORT : RACE_NAMES)[row.race]), i ? pips(row.diff) : el('span'), el('span', 'pen', '✎'));
  const what = [seatName(i), title(RACE_NAMES[row.race]), ...(i ? [title(DIFF_NAMES[row.diff])] : []), side].filter(Boolean).join(', ');
  b.setAttribute('aria-label', open ? `${what}: edit` : what); b.title = open ? (i ? 'Race, difficulty, side' : 'Race') : what;
  b.dataset.k = `tok${i}`;
  if (open) b.addEventListener('click', () => open(i)); else b.disabled = true;
  return b;
}
/** A side: its name (and how many, past one), its tokens, and a dashed `add` button at its foot (`{ label, title, on,
 *  k }`; none: full). `me`: your side, in gold. */
export function sideBox(name, tokens, { me = false, add = null, label = name } = {}) {
  const side = el('div', 'side' + (me ? ' me' : '')), hd = el('div', 'hd');
  side.setAttribute('role', 'group'); side.setAttribute('aria-label', label);
  hd.append(el('span', '', name)); if (tokens.length > 1) hd.append(el('small', '', `· ${tokens.length}`));
  const seats = el('div', 'seats'); seats.append(...tokens);
  side.append(hd, seats);
  if (add) { const a = el('button', 'ib ghost add', add.label); a.title = add.title; a.dataset.k = add.k; a.addEventListener('click', add.on); side.appendChild(a); }
  return side;
}
/** The dashed strip after the sides: a new side, an AI on its own. */
export function newSide(on) {
  const b = el('button', 'ib ghost newside'); b.setAttribute('aria-label', 'New side: an AI on its own'); b.title = 'An AI on a side of its own';
  b.dataset.k = 'newside'; b.append(el('span', 'plus', '+'), el('span', 't', 'SIDE')); b.addEventListener('click', on);
  return b;
}
/** A row of chips as a radio group (the arrow keys move along it): `items` [key, text or nodes, title?], `on` lit,
 *  `pick(key)` when another is chosen; each chip's `data-k` is `${name}:${key}`. */
export function chipRow(items, on, label, pick, { name = label, cls = '' } = {}) {
  const g = el('div', 'diff chips'); g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', label);
  const chips = items.map(([k, t, tip]) => {
    const lit = k === on, b = el('button', 'ib' + (cls ? ' ' + cls : '') + (lit ? ' on' : ''));
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(lit)); b.tabIndex = lit || (on == null && k === items[0][0]) ? 0 : -1;
    if (tip) b.title = tip;
    if (typeof t === 'string') b.textContent = t; else b.append(...t);
    b.dataset.k = `${name}:${k}`; b.addEventListener('click', () => { if (k !== on) pick(k); });
    return b;
  });
  g.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault(); const at = chips.indexOf(document.activeElement), next = chips[(at + step + chips.length) % chips.length];
    next.focus(); next.click();
  });
  g.append(...chips);
  return g;
}
/** A seat's sheet over the page (a bottom sheet on a phone, a small dialog on a wide screen): RACE chips, an AI's
 *  PLAYS chips with what the level means, its SIDE (`sides` [{ team, chip, color }], + NEW SIDE unless it is alone),
 *  REMOVE (`onRemove`; none: it may not go) and DONE. Focus stays inside it; Escape, ×, DONE or a tap beside it close
 *  it (`onDone`, which gives the focus back to the token). */
export function seatSheet(row, i, color, sides, { onRace, onDiff, onTeam, onRemove = null, onDone, alone = false }) {
  const scrim = el('div', 'scrim'), s = el('div', 'sheet');
  s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true'); s.setAttribute('aria-label', `${seatName(i)}: race${i ? ', difficulty, side' : ''}`);
  const hd = el('div', 'hd'), band = el('i', 'band'); band.style.background = color;
  const x = el('button', 'ib x', '×'); x.setAttribute('aria-label', 'Done'); x.dataset.k = 'close'; x.addEventListener('click', onDone);
  hd.append(band, el('b', '', seatName(i)), el('span', 'sub', i ? 'computer player' : 'your seat'), x);
  s.appendChild(hd);
  const opt = (name, group) => { const o = el('div', 'opt'); o.append(el('span', 'lbl', name), group); s.appendChild(o); };
  opt('RACE', chipRow([['humans', 'HUMANS'], ['vael', 'VAEL'], ['random', 'RANDOM', 'Either race, drawn when the game starts']], row.race, 'Race', onRace, { name: 'race' }));
  if (i) {
    opt('PLAYS', chipRow(DIFF_NAMES.map((n, d) => [d, n, DIFF_TITLES[d]]), row.diff, 'Difficulty', onDiff, { name: 'diff' }));
    s.appendChild(el('div', 'hint', DIFF_TITLES[row.diff]));
    const items = sides.map(({ team, chip, color: c }) => { const sw = el('i', 'sw'); sw.style.background = c; return [team, [sw, document.createTextNode(chip)]]; });
    if (!alone) items.push(['new', '+ NEW SIDE', 'On a side of its own']);
    opt('SIDE', chipRow(items, row.team, 'Side', onTeam, { name: 'side', cls: 'team' }));
  }
  const ft = el('div', 'ft');
  if (onRemove) { const rm = el('button', 'ib ghost', 'REMOVE'); rm.setAttribute('aria-label', `Remove ${seatName(i)}`); rm.dataset.k = 'remove'; rm.addEventListener('click', onRemove); ft.appendChild(rm); }
  const done = el('button', 'ib big', 'DONE'); done.dataset.k = 'done'; done.addEventListener('click', onDone);
  ft.append(el('span', 'spacer'), done);
  s.appendChild(ft); scrim.appendChild(s);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) onDone(); });
  scrim.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onDone(); return; }
    if (e.key !== 'Tab') return;
    const f = [...s.querySelectorAll('button')].filter(b => b.tabIndex >= 0 && !b.disabled), at = f.indexOf(document.activeElement);
    if (e.shiftKey ? at <= 0 : at === f.length - 1) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
  });
  return scrim;
}
