// The seats of a game against the AI (single player's sides board; the lobby's to come): the rows (you first, then the
// AIs, each `{ race, team, diff, n }`: `n` the number in its name, AI n, kept while others come and go), how they
// become the game's seats, and the board's pieces. The sim seats allies side by side only when their seat numbers
// follow each other (map.rs team_starts), so a game's seats are the rows in team order: your team first, you first in
// it; each token's band already shows the colour its seat will have, so the tokens stay where they are while the sides
// change. The rules are pure (test/seats.test.js); the DOM builders at the end (a token, a side, a row of chips, a
// seat's sheet and the dialog it opens in) take a seat's *view*, not a row, so the lobby's seats fit them too.
import { SEAT_COLORS } from './look.js';
import { DIFF_NAMES } from '../engine/constants.js';

/** The races a seat may pick (RANDOM too: drawn when the game starts), their names, and their short names on a token
 *  where room is short. */
export const RACES = ['humans', 'vael'];
export const RACE_KEYS = [...RACES, 'random'];
export const RACE_NAMES = { humans: 'HUMANS', vael: 'VAEL', random: 'RANDOM' };
export const RACE_SHORT = { humans: 'HUM', vael: 'VAEL', random: 'RND' };
/** A race's name in a sentence ('Humans'). */
export const raceTitle = (k) => RACE_NAMES[k][0] + RACE_NAMES[k].slice(1).toLowerCase();
export { DIFF_NAMES };
/** What each difficulty means, under the sheet's PLAYS (and a chip's title). */
export const DIFF_TITLES = ['A slow, gentle opponent: time to learn and build', 'A real fight: the first attack comes at about three minutes', 'Plays the whole game well: early attacks, research, raids, split waves', 'Hard, faster, and it gathers 30% more than you'];

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
/** The level a game is played at, as the record counts it: its hardest enemy AI's (an ally's level does not make a
 *  win harder); with nobody to fight, the hardest AI's. */
export function enemyLevel(rows) {
  const ais = rows.slice(1), foes = ais.filter(r => r.team !== rows[0].team);
  return Math.max(0, ...(foes.length ? foes : ais).map(r => r.diff ?? 0));
}
/** What START GAME plays for the rows (`draw(race)`: a RANDOM one drawn): the seats in `arrange`'s order, each one's
 *  race, whether the AI plays it (all but you, seat 0), the teams (empty: free for all), each seat's difficulty (empty
 *  when every AI's is the same: the sim's `diff` then, as before) and `diff`, the enemies' hardest (the record's
 *  level; with `diffs`, the sim reads each AI's own). */
export function startSetup(rows, draw = (r) => r) {
  const { order, teams } = arrange(rows), seats = order.map(i => rows[i]), diffs = seats.map(r => r.diff ?? 0);
  const alike = diffs.slice(1).every(d => d === diffs[1]);
  return { races: seats.map(r => draw(r.race)), ai: seats.map((_, s) => s > 0), teams, diffs: alike ? [] : diffs, diff: alike ? diffs[1] : enemyLevel(rows) };
}
/** The rows the menu before the board saved (`race`, `enemy`, `diff`, `players` and their `teams`: a team per seat,
 *  maps.js `teamList`); anything not a good one: you and one AI, on Easy. */
export function legacyRows({ race, enemy, diff, players, teams = [] }, max) {
  const r = (k) => (RACE_KEYS.includes(k) ? k : 'humans'), d = Number.isInteger(diff) && diff >= 0 && diff < DIFF_NAMES.length ? diff : 0;
  const n = Number.isInteger(players) && players >= 2 && players <= max ? players : 2;
  return Array.from({ length: n }, (_, i) => (i ? { race: r(enemy), team: teams.length === n ? teams[i] : i, diff: d, n: i } : { race: r(race), team: teams.length === n ? teams[0] : 0 }));
}
/** Every row on one team: nobody to fight. */
export const oneTeam = (rows) => rows.every(r => r.team === rows[0].team);
/** The lowest team number no row has (a new AI's: on its own). */
export const freeTeam = (rows) => { let t = 0; while (rows.some(r => r.team === t)) t++; return t; };
/** Team numbers in the order they first appear, from 0 (after a row moves or goes: no gap). */
export function compact(rows) {
  const seen = [...new Set(rows.map(r => r.team))];
  return rows.map(r => ({ ...r, team: seen.indexOf(r.team) }));
}
/** A seat's name: YOU, or AI and its number. */
export const seatName = (rows, i) => (i ? `AI ${rows[i].n ?? i}` : 'YOU');
/** A new AI for side `team`: as that side's last AI (race, level), else the last AI, else Humans on Easy; the lowest
 *  number no AI has. */
export function newAi(rows, team) {
  const ais = rows.slice(1), like = ais.filter(r => r.team === team).at(-1) || ais.at(-1) || { race: 'humans', diff: 0 };
  let n = 1; while (ais.some(r => r.n === n)) n++;
  return { race: like.race, team, diff: like.diff, n };
}
/** Whether row `i` may go: an AI, more than two seats, and not the last enemy (someone must be left to fight). */
export function canRemove(rows, i) {
  const enemy = (j) => j > 0 && rows[j].team !== rows[0].team;
  return i > 0 && rows.length > 2 && (!enemy(i) || rows.some((_, j) => j !== i && enemy(j)));
}
/** The sides in `arrange`'s order (yours first): each one's team number, heading (YOUR SIDE; ENEMIES, or SIDE k with
 *  several), the same in a sentence, its name on a sheet's chip (YOURS, SIDE k) and the colour of its first seat. */
export function sidesOf(rows) {
  const { order } = arrange(rows), keys = [...new Set(rows.map(r => r.team))];
  return keys.map((team, k) => {
    const name = k ? (keys.length === 2 ? 'ENEMIES' : `SIDE ${k + 1}`) : 'YOUR SIDE';
    return { team, name, label: name[0] + name.slice(1).toLowerCase(), chip: k ? `SIDE ${k + 1}` : 'YOURS', color: seatColor(order.indexOf(rows.findIndex(r => r.team === team))) };
  });
}
/** A saved setup if it is a good one (2 to `max` rows, you first, a race each, a team number below the rows' count, a
 *  difficulty each AI), else null; the AIs' numbers kept when they are distinct, else counted again. */
export function validRows(rows, max) {
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > max) return null;
  const ok = rows.every((r, i) => r && typeof r === 'object' && RACE_KEYS.includes(r.race)
    && Number.isInteger(r.team) && r.team >= 0 && r.team < rows.length && (i === 0 || (Number.isInteger(r.diff) && r.diff >= 0 && r.diff < DIFF_NAMES.length)));
  if (!ok) return null;
  const ns = rows.slice(1).map(r => r.n), keep = ns.every(n => Number.isInteger(n) && n >= 1 && n < max) && new Set(ns).size === ns.length;
  return rows.map((r, i) => (i === 0 ? { race: r.race, team: r.team } : { race: r.race, team: r.team, diff: r.diff, n: keep ? r.n : i }));
}

/** A seat's colour in the game, as CSS. */
export const seatColor = (seat) => '#' + SEAT_COLORS[seat % SEAT_COLORS.length].toString(16).padStart(6, '0');

// ---- The board's pieces: a seat is a token, a side a panel, a token opens one sheet. ----
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/** A level as four pips, `d + 1` of them lit (a level at a glance; its name is in the sheet). */
function levelPips(d) {
  const p = el('span', 'lvl'); p.setAttribute('aria-hidden', 'true');
  for (let k = 0; k < 4; k++) p.appendChild(el('i', k <= d ? 'on' : ''));
  return p;
}
/** A seat's token from its view `{ name, race, diff (an AI's level, else null), side (its panel's name), me, host,
 *  ready, away, open (an open seat), act (what tapping an open seat does), ro (shown, not changed) }`: a button with the
 *  seat's colour as a band down its left edge, its name, its race (`short`: HUM, VAEL, RND), the level as pips (or a
 *  READY check), and a faint pen; `onOpen` when tapped; `k` its `data-k`. Its name for a screen reader starts with what it shows. */
export function tokenEl(view, color, { short = false, on = false, onOpen = null, k = '' } = {}) {
  const ro = view.ro || !onOpen, b = el('button', 'ib tok' + (view.me ? ' me' : '') + (on ? ' on' : '') + (ro ? ' ro' : '') + (view.open ? ' open' : ''));
  const band = el('i', 'band'); band.style.background = color;
  const name = el('b', '', view.name); if (view.host) name.append(el('span', 'crown', '♛'));
  const shown = view.open ? 'OPEN SEAT' : view.away ? 'AWAY' : (short ? RACE_SHORT : RACE_NAMES)[view.race];
  const mark = view.diff != null ? levelPips(view.diff) : view.ready ? el('span', 'st ok', '✓') : el('span');
  b.append(band, name, el('span', 'race' + (view.away ? ' away' : ''), shown), mark, el('span', view.open ? 'act' : 'pen', view.open ? view.act || '' : '✎'));
  const what = [`${view.name} ${shown}`, ...(view.open || view.away || shown === RACE_NAMES[view.race] ? [] : [raceTitle(view.race)]),
    ...(view.diff != null ? [DIFF_NAMES[view.diff]] : []), ...(view.ready ? ['ready'] : []), view.side].filter(Boolean).join(', ');
  b.setAttribute('aria-label', ro ? what : `${what}: ${view.open && view.act ? view.act.toLowerCase() : 'edit'}`);
  b.title = ro ? what : view.diff != null ? 'Race, difficulty, side' : 'Race';
  if (k) b.dataset.k = k;
  if (ro) b.disabled = true; else b.addEventListener('click', onOpen);
  return b;
}
/** A side: its name (and how many, past one), its tokens, and its `adds` (`{ label, title, k, on }`: + AI, + ALLY) as
 *  dashed cells among them; `me`: your side, in gold; `label`: its name in a sentence. Its width follows its seats. */
export function sideBox(name, tokens, { me = false, adds = [], label = name } = {}) {
  const side = el('div', 'side' + (me ? ' me' : '')), hd = el('div', 'hd');
  side.setAttribute('role', 'group'); side.setAttribute('aria-label', label);
  side.style.setProperty('--n', tokens.length); side.style.setProperty('--a', adds.length);
  hd.append(el('span', '', name)); if (tokens.length > 1) hd.append(el('small', '', `· ${tokens.length}`));
  const seats = el('div', 'seats');
  seats.append(...tokens, ...adds.map(a => { const b = el('button', 'ib ghost add', a.label); b.title = a.title; b.setAttribute('aria-label', `${a.label}: ${a.title}`); b.dataset.k = a.k; b.addEventListener('click', a.on); return b; }));
  side.append(hd, seats);
  return side;
}
/** The dashed strip after the sides: a new side, an AI on its own. */
export function newSide(on) {
  const b = el('button', 'ib ghost newside'); b.setAttribute('aria-label', '+ SIDE: an AI on a side of its own'); b.title = 'An AI on a side of its own';
  b.dataset.k = 'newside'; b.append(el('span', 'plus', '+'), el('span', 't', 'SIDE')); b.addEventListener('click', on);
  return b;
}
/** A row of chips as a radio group (the arrow keys move along it): `items` [key, text or nodes, title?], `on` lit,
 *  `pick(key)` when another is chosen; each chip's `data-k` is `${name}:${key}`; `describedBy` an id. */
export function chipRow(items, on, label, pick, { name = label, cls = '', describedBy = '' } = {}) {
  const g = el('div', 'diff chips'); g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', label);
  if (describedBy) g.setAttribute('aria-describedby', describedBy);
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
/** A seat's sheet (its view, as a token's, and `sub`, a line beside its name): RACE chips when `onRace`, PLAYS chips
 *  with what the level means when `onDiff`, SIDE chips (`sides` [{ team, chip, color }], the seat's `team`) when
 *  `onSide`, and `newSide` (+ NEW SIDE, a button of its own) when given; the footer's `buttons` ({ label, title, k, on,
 *  ghost }) and DONE; `onDone` for DONE and ×. It goes into a `sheetDialog`. */
export function seatSheet(view, color, { sub = '', team = null, sides = [], onRace = null, onDiff = null, onSide = null, newSide = null, buttons = [], onDone }) {
  const s = el('div', 'sheet'), hd = el('div', 'hd'), band = el('i', 'band'); band.style.background = color;
  const title = el('b', '', view.name); title.id = 'sheetTitle';
  const x = el('button', 'ib x', '×'); x.setAttribute('aria-label', 'Close'); x.dataset.k = 'close'; x.addEventListener('click', onDone);
  hd.append(band, title, el('span', 'sub', sub), x);
  s.appendChild(hd);
  const opt = (name, ...parts) => { const o = el('div', 'opt'); o.append(el('span', 'lbl', name), ...parts); s.appendChild(o); };
  if (onRace) opt('RACE', chipRow(RACE_KEYS.map(k => [k, RACE_NAMES[k], k === 'random' ? 'Either race, drawn when the game starts' : '']), view.race, 'Race', onRace, { name: 'race' }));
  if (onDiff) {
    opt('PLAYS', chipRow(DIFF_NAMES.map((n, d) => [d, n.toUpperCase(), DIFF_TITLES[d]]), view.diff, 'Difficulty', onDiff, { name: 'diff', describedBy: 'sheetHint' }));
    const hint = el('div', 'hint', DIFF_TITLES[view.diff]); hint.id = 'sheetHint'; s.appendChild(hint);
  }
  if (onSide) {
    const items = sides.map(({ team: t, chip, color: c }) => { const sw = el('i', 'sw'); sw.style.background = c; return [t, [sw, document.createTextNode(chip)]]; });
    const parts = [chipRow(items, team, 'Side', onSide, { name: 'side', cls: 'team' })];
    if (newSide) { const b = el('button', 'ib team new', '+ NEW SIDE'); b.title = 'On a side of its own'; b.dataset.k = 'side:new'; b.addEventListener('click', newSide); parts.push(b); }
    opt('SIDE', ...parts);
  }
  const ft = el('div', 'ft');
  for (const k of buttons) { const b = el('button', 'ib' + (k.ghost ? ' ghost' : ''), k.label); if (k.title) b.setAttribute('aria-label', k.title); b.dataset.k = k.k; b.addEventListener('click', k.on); ft.appendChild(b); }
  const done = el('button', 'ib big', 'DONE'); done.dataset.k = 'done'; done.addEventListener('click', onDone);
  ft.append(el('span', 'spacer'), done);
  s.appendChild(ft);
  return s;
}
/** A `<dialog>` as the sheets' scrim: a bottom sheet on a phone, a small dialog on a wide screen, modal (the page
 *  behind it inert). `show(sheet, onClose)` puts a sheet in (opening it if it was not), `close()` closes it. Escape,
 *  and a tap on the scrim that also began there, call `onClose`. A click that is part of a double click, or comes
 *  within 350 ms of opening (the second tap of a double tap on a token), does nothing. */
export function sheetDialog(dialog) {
  let onClose = () => {}, since = 0, downOnScrim = false;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); onClose(); });
  dialog.addEventListener('close', () => onClose()); // (a second Escape, which the browser does not let a page cancel)
  dialog.addEventListener('pointerdown', (e) => { downOnScrim = e.target === dialog; });
  const early = (e) => e.detail > 1 || performance.now() - since < 350; // (a double click's second, or a double tap's)
  dialog.addEventListener('mousedown', (e) => { if (early(e)) e.preventDefault(); }, true); // (nor does it move the focus)
  dialog.addEventListener('click', (e) => {
    if (e.detail > 0 && early(e)) { e.stopPropagation(); e.preventDefault(); return; }
    if (e.target === dialog && downOnScrim) onClose();
  }, true);
  return {
    show(sheet, close) {
      onClose = close; dialog.replaceChildren(sheet);
      if (!dialog.open) { since = performance.now(); downOnScrim = false; dialog.showModal(); }
    },
    close() { onClose = () => {}; if (dialog.open) dialog.close(); dialog.replaceChildren(); },
  };
}
