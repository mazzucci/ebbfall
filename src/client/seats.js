// The seats of a game against the AI (single player's board; online.js's lobby builds the same board) and the board's
// pieces. The board is eight fixed SPOTS, the most seats a game has: YOU in spot 0, an AI (online, a person or an open
// seat too) in any other, the rest empty. A player keeps its spot (its place on the board and its colour, in the game
// too) whatever its side: the side is a tag on its token, chosen in its sheet; adding fills the lowest empty spot,
// removing empties one, so nothing on the board ever moves. Side numbers stay as chosen while editing; START GAME seats
// the players by side (the sim seats allies side by side only when their seat numbers follow each other: map.rs
// team_starts): your side first, you first in it, each side's players in spot order (`arrange`), and tells the game
// which spot each seat came from (its colour). The rules are pure (test/seats.test.js); the DOM builders at the end (a
// token, an empty spot, a row of chips, a seat's sheet and the dialog it opens in) take a seat's *view*, so the lobby's
// seats fit them too.
import { SEAT_COLORS } from './look.js';
import { DIFF_NAMES } from '../engine/constants.js';

/** The races a seat may pick (RANDOM too: drawn when the game starts), their names, and their short names on a token
 *  where room is short. */
export const RACES = ['humans', 'vael'];
export const RACE_KEYS = [...RACES, 'random'];
export const RACE_NAMES = { humans: 'HUMANS', vael: 'VAEL', random: 'RANDOM' };
export const RACE_SHORT = { humans: 'HUM', vael: 'VAEL', random: 'RND' };
/** A race's name in a sentence ('Humans'). */
export const raceTitle = (k) => { const n = RACE_NAMES[k] || ''; return n.slice(0, 1) + n.slice(1).toLowerCase(); }; // ('' for a key that is not a race)
export { DIFF_NAMES };
/** The spots on the board: the most seats a game has (maps.js MAX_PLAYERS, the relay's MAX_SEATS). */
export const SPOTS = 8;

/** The spots with a player in them (`spots`: one entry per spot, null when empty; online, a lobby's seats). */
export const filled = (spots) => spots.flatMap((r, i) => (r ? [i] : []));
/** The game's seats for the spots (`{ team }` each, spot 0 you): the spots in seat order (your side's first, you first;
 *  then the other sides in the order of their first spots, each side's spots in order: free for all keeps the spots'
 *  order), and the team id of each seat, 0 for yours and up in that order (empty when every seat is its own team: free
 *  for all, as the sim's default). */
export function arrange(spots) {
  const at = filled(spots), keys = [...new Set(at.map(i => spots[i].team))]; // (spot 0's first)
  const order = keys.flatMap(t => at.filter(i => spots[i].team === t));
  const teams = order.map(i => keys.indexOf(spots[i].team));
  return { order, teams: keys.length === at.length ? [] : teams };
}
/** The level a game is played at, as the record counts it: its hardest enemy AI's (an ally's level does not make a
 *  win harder); with nobody to fight, the hardest AI's. */
export function enemyLevel(spots) {
  const ais = filled(spots).slice(1).map(i => spots[i]), foes = ais.filter(r => r.team !== spots[0].team);
  return Math.max(0, ...(foes.length ? foes : ais).map(r => r.diff ?? 0));
}
/** What START GAME plays for the spots (`draw(race)`: a RANDOM one drawn): the seats in `arrange`'s order, each one's
 *  race, whether the AI plays it (all but you, seat 0), the teams (empty: free for all), each seat's difficulty (empty
 *  when every AI's is the same: the sim's `diff` then, as before), `diff`, the enemies' hardest (the record's level;
 *  with `diffs`, the sim reads each AI's own), and `spots`, the spot of each seat (its colour). */
export function startSetup(spots, draw = (r) => r) {
  const { order, teams } = arrange(spots), seats = order.map(i => spots[i]), diffs = seats.map(r => r.diff ?? 0);
  const alike = diffs.slice(1).every(d => d === diffs[1]);
  return { races: seats.map(r => draw(r.race)), ai: seats.map((_, s) => s > 0), teams, diffs: alike ? [] : diffs, diff: alike ? diffs[1] : enemyLevel(spots), spots: order };
}
/** The spots the menu before the board saved (`race`, `enemy`, `diff`, `players` and their `teams`: a team per seat,
 *  maps.js `teamList`); anything not a good one: you and one AI, on Easy. */
export function legacyRows({ race, enemy, diff, players, teams = [] }, max = SPOTS) {
  const r = (k) => (RACE_KEYS.includes(k) ? k : 'humans'), d = Number.isInteger(diff) && diff >= 0 && diff < DIFF_NAMES.length ? diff : 0;
  const n = Number.isInteger(players) && players >= 2 && players <= max ? players : 2;
  return Array.from({ length: SPOTS }, (_, i) => (i >= n ? null : i ? { race: r(enemy), team: teams.length === n ? teams[i] : i, diff: d } : { race: r(race), team: teams.length === n ? teams[0] : 0 }));
}
/** Every player on one side: nobody to fight. */
export const oneTeam = (spots) => filled(spots).every(i => spots[i].team === spots[0].team);
/** The lowest side number nobody is on (a new AI's: on its own). */
export const freeTeam = (spots) => { let t = 0; while (spots.some(r => r && r.team === t)) t++; return t; };
/** The lowest empty spot (-1: none; adding fills it). */
export const firstEmpty = (spots) => spots.findIndex(r => !r);
/** A seat's name: YOU, or AI and its spot's number (it keeps it while others come and go). */
export const seatName = (i) => (i ? `AI ${i}` : 'YOU');
/** A new AI: on a side of its own, as the last AI (race, level), else Humans on Easy. */
export function newAi(spots) {
  const like = filled(spots).slice(1).map(i => spots[i]).at(-1) || { race: 'humans', diff: 0 };
  return { race: like.race, team: freeTeam(spots), diff: like.diff };
}
/** Whether spot `i`'s player may go: an AI, more than two players, and not the last enemy (someone must be left to
 *  fight). */
export function canRemove(spots, i) {
  const at = filled(spots), enemy = (j) => j > 0 && spots[j].team !== spots[0].team;
  return i > 0 && !!spots[i] && at.length > 2 && (!enemy(i) || at.some(j => j !== i && enemy(j)));
}
/** The sides a seat's sheet offers: SIDE 1 up to SIDE n, n the players (as many sides as players: free for all), and
 *  any higher number still in use; each with its colour, its first player's (none yet: a neutral grey). */
export function sideChoices(spots) {
  const at = filled(spots), top = Math.max(at.length - 1, ...at.map(i => spots[i].team));
  return Array.from({ length: top + 1 }, (_, team) => ({ team, chip: `SIDE ${team + 1}`, color: sideColor(spots, team) }));
}
/** A side's colour: its first player's (by spot); a side nobody is on, grey. */
export function sideColor(spots, team) { const i = spots.findIndex(r => r && r.team === team); return i < 0 ? '#5b6b80' : seatColor(i); }
/** A saved board if it is a good one (a spot each, null when empty, at most `max`; you in spot 0 and another player;
 *  a race each, a side number below the spots', a difficulty each AI), else null. A list saved before the spots (one
 *  entry per player, AIs numbered) fills the first spots. */
export function validRows(rows, max = SPOTS) {
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > SPOTS) return null;
  const spots = Array.from({ length: SPOTS }, (_, i) => rows[i] ?? null);
  const at = filled(spots);
  if (!spots[0] || at.length < 2 || at.length > max) return null;
  const ok = at.every(i => typeof spots[i] === 'object' && RACE_KEYS.includes(spots[i].race) && Number.isInteger(spots[i].team) && spots[i].team >= 0 && spots[i].team < SPOTS
    && (i === 0 || (Number.isInteger(spots[i].diff) && spots[i].diff >= 0 && spots[i].diff < DIFF_NAMES.length)));
  if (!ok) return null;
  return spots.map((r, i) => (!r ? null : i === 0 ? { race: r.race, team: r.team } : { race: r.race, team: r.team, diff: r.diff }));
}

/** Where room is short (a phone): the race's short name on a token. */
export const narrow = typeof matchMedia === 'function' ? matchMedia('(max-width: 900px), (max-height: 500px)') : { matches: false, addEventListener() {} };
/** A seat's colour in the game, as CSS. */
export const seatColor = (seat) => '#' + SEAT_COLORS[seat % SEAT_COLORS.length].toString(16).padStart(6, '0');

// ---- The board's pieces: a spot is a token (or an empty cell), a token opens one sheet. ----
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/** A level as four pips, `d + 1` of them lit (a level at a glance; its name is in the sheet). */
function levelPips(d) {
  const p = el('span', 'lvl'); p.setAttribute('aria-hidden', 'true');
  for (let k = 0; k < 4; k++) p.appendChild(el('i', k <= d ? 'on' : ''));
  return p;
}
/** A seat's token from its view `{ name, race, diff (an AI's level, else null), side (its side's number from 0, null:
 *  none shown), sideColor, me, host, ready, away, open (an open seat), act (what tapping an open seat does), ro (shown,
 *  not changed), tip }`: a button the size of every spot, the seat's colour as a band down its left edge; its name (a
 *  crown on the host's) and a faint pen (an open seat's `act`, SIT HERE, instead) on top; its race (`short`: HUM, VAEL,
 *  RND; AWAY, OPEN SEAT), the level as pips (or a READY check) and its side's tag (SIDE 2, or S2 where the token is
 *  narrow) below; `onOpen` when tapped; `k` its `data-k`. Its name for a screen reader starts with what it shows. */
export function tokenEl(view, color, { short = false, on = false, onOpen = null, k = '' } = {}) {
  const ro = view.ro || !onOpen, b = el('button', 'ib tok' + (view.me ? ' me' : '') + (on ? ' on' : '') + (ro ? ' ro' : '') + (view.open ? ' open' : ''));
  const band = el('i', 'band'); band.style.background = color;
  const name = el('b', '', view.name); if (view.host) name.append(el('span', 'crown', '♛'));
  const shown = view.open ? 'OPEN SEAT' : view.away ? 'AWAY' : (short ? RACE_SHORT : RACE_NAMES)[view.race];
  const mark = view.diff != null ? levelPips(view.diff) : view.ready ? el('span', 'st ok', '✓') : el('span', 'st');
  const tag = el('span', 'stag');
  if (view.side != null) { tag.append('S', el('span', 'w', 'IDE '), String(view.side + 1)); tag.style.setProperty('--c', view.sideColor || '#5b6b80'); }
  b.append(band, name, view.open && view.act ? el('span', 'act', view.act) : el('span', 'pen', '✎'), el('span', 'race' + (view.away ? ' away' : ''), shown), mark, tag);
  const what = [[view.name, shown].filter(Boolean).join(' '), ...(view.host ? ['host'] : []), ...(view.open || view.away || shown === RACE_NAMES[view.race] ? [] : [raceTitle(view.race)]),
    ...(view.diff != null ? [DIFF_NAMES[view.diff]] : []), ...(view.ready ? ['ready'] : []), ...(view.side != null ? [`Side ${view.side + 1}`] : [])].filter(Boolean).join(', ');
  b.setAttribute('aria-label', ro ? what : `${what}: ${view.open && view.act ? view.act.toLowerCase() : 'edit'}`);
  b.title = ro ? what : view.tip || (view.diff != null ? 'Race, level, side' : 'Race, side');
  if (k) b.dataset.k = k;
  if (ro) b.disabled = true; else b.addEventListener('click', onOpen);
  return b;
}
/** An empty spot: with `adds` (`{ label, title, k, on }`: + AI, + SEAT) a dashed cell to fill it (two: halves of
 *  one); without, a faint outline (the board's eight places, nothing to tap). */
export function emptySpot(adds = []) {
  const button = (a) => { const b = el('button', 'ib ghost add', a.label); b.title = a.title; b.setAttribute('aria-label', `${a.label}: ${a.title}`); b.dataset.k = a.k; b.addEventListener('click', a.on); return b; };
  if (adds.length === 1) return button(adds[0]);
  const c = el('div', 'spot ' + (adds.length ? 'split' : 'empty'));
  if (adds.length) c.append(...adds.map(button)); else c.setAttribute('aria-hidden', 'true');
  return c;
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
/** A seat's sheet (its view, as a token's, and `sub`, a line beside its name; `info`, a line under it): RACE chips
 *  when `onRace`, LEVEL chips when `onDiff`, SIDE chips (`sides` [{ team, chip, color }]: seats.js `sideChoices`, the
 *  seat's `team` lit) when `onSide`; the footer's `buttons` ({ label, title, k, on, ghost, big }) and DONE (big unless
 *  one of them is); `onDone` for DONE and ×. It goes into a `sheetDialog`. */
export function seatSheet(view, color, { sub = '', info = '', team = null, sides = [], onRace = null, onDiff = null, onSide = null, buttons = [], onDone }) {
  const s = el('div', 'sheet'), hd = el('div', 'hd'), band = el('i', 'band'); band.style.background = color;
  const title = el('b', '', view.name); title.id = 'sheetTitle';
  const x = el('button', 'ib x', '×'); x.setAttribute('aria-label', 'Close'); x.dataset.k = 'close'; x.addEventListener('click', onDone);
  hd.append(band, title, el('span', 'sub', sub), x);
  s.appendChild(hd);
  if (info) s.appendChild(el('div', 'info', info));
  const opt = (name, ...parts) => { const o = el('div', 'opt'); o.append(el('span', 'lbl', name), ...parts); s.appendChild(o); };
  if (onRace) opt('RACE', chipRow(RACE_KEYS.map(k => [k, RACE_NAMES[k], k === 'random' ? 'Either race, drawn when the game starts' : '']), view.race, 'Race', onRace, { name: 'race' }));
  if (onDiff) opt('LEVEL', chipRow(DIFF_NAMES.map((n, d) => [d, n.toUpperCase()]), view.diff, 'Level', onDiff, { name: 'diff' }));
  if (onSide) {
    const items = sides.map(({ team: t, chip, color: c }) => { const sw = el('i', 'sw'); sw.style.background = c; return [t, [sw, document.createTextNode(chip)]]; });
    opt('SIDE', chipRow(items, team, 'Side', onSide, { name: 'side', cls: 'team' }));
  }
  const ft = el('div', 'ft');
  for (const k of buttons) { const b = el('button', 'ib' + (k.big ? ' big' : k.ghost ? ' ghost' : ''), k.label); if (k.title) b.setAttribute('aria-label', k.title); b.dataset.k = k.k; b.addEventListener('click', k.on); ft.appendChild(b); }
  const done = el('button', 'ib' + (buttons.some(k => k.big) ? '' : ' big'), 'DONE'); done.dataset.k = 'done'; done.addEventListener('click', onDone);
  ft.append(el('span', 'spacer'), done);
  s.appendChild(ft);
  return s;
}
/** A `<dialog>` as the sheets' scrim: a bottom sheet on a phone, a small dialog on a wide screen, modal (the page
 *  behind it inert). `show(sheet, onClose)` puts a sheet in (opening it if it was not), `close()` closes it. Escape,
 *  and a tap on the scrim that also began there, call `onClose`. The second click of the double click or tap on a token
 *  that opened it does nothing: a click within 350 ms of the opening one, or the first click after it when the browser
 *  counts it as a double's (`detail` 2) within 600 ms. Times are the events' own (when the finger or button acted), not
 *  when a busy page got to them. Any later tap is a tap, however quick (a chip, then DONE: the browser may count that as
 *  a double tap too). */
export function sheetDialog(dialog) {
  let onClose = () => {}, since = 0, first = false, downOnScrim = false; // (since: the opening click's time; first: no click in it yet)
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); onClose(); });
  dialog.addEventListener('close', () => onClose()); // (a second Escape, which the browser does not let a page cancel)
  dialog.addEventListener('pointerdown', (e) => { downOnScrim = e.target === dialog; });
  const early = (e) => { const t = e.timeStamp - since; return t < 350 || (first && e.detail > 1 && t < 600); }; // (a double click's second, or a double tap's)
  dialog.addEventListener('mousedown', (e) => { if (early(e)) e.preventDefault(); }, true); // (nor does it move the focus)
  dialog.addEventListener('click', (e) => {
    const drop = e.detail > 0 && early(e);
    if (e.detail > 0) first = false;
    if (drop) { e.stopPropagation(); e.preventDefault(); return; }
    if (e.target === dialog && downOnScrim) onClose();
  }, true);
  return {
    show(sheet, close) {
      onClose = close; dialog.replaceChildren(sheet);
      if (!dialog.open) { since = globalThis.event?.timeStamp ?? performance.now(); first = true; downOnScrim = false; dialog.showModal(); } // (opened from a click: that click's time)
    },
    close() { onClose = () => {}; if (dialog.open) dialog.close(); dialog.replaceChildren(); },
  };
}
