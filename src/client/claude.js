// Play against Claude in the game (claude/PROTOCOL.md): the plan a link or an embedding page set, applied to the AI seat
// as a single-player game starts; and, when the game is framed by an allowed page (`?embed=1`), the message channel:
// check-ins out every 2 game-minutes and on key events, deltas, intents and one short line for the player in, the
// summary out at the end. Single player only: the sim refuses plans in an online game, and nothing here goes to the
// relay. The game never waits for the page.
import { setPlan, planDelta, planNotes, planCode, watch, recordCheckIns, takeCheckIn, summary, G } from '../engine/index.js';
import { toast } from './ui.js';
import { canonical } from './plan.js';
import { allowedOrigin, readMessage } from './embed.js';

/** The least time between two lines for the player (ms). */
const SAY_EVERY = 5000;

/** The channel's state: the page's origin once it said hello, the plan seat of the game running (null: none), the
 *  plan set from the address or the page, and when the last line was shown. */
const ch = { origin: null, seat: null, plan: null, said: 0, live: false, build: 'dev' };

/** Post to the page that said hello (never to `*`). */
function post(type, fields) {
  if (ch.origin) window.parent.postMessage({ type: `ebbfall:${type}`, v: 1, ...fields }, ch.origin);
}

/** Show a line for the player from Claude (text only), at most one every `SAY_EVERY`. */
function say(text) {
  const now = Date.now();
  if (now - ch.said < SAY_EVERY) return;
  ch.said = now; toast(`Claude: ${text}`, false, true, 'claude');
}

/** Listen for an embedding page, when the address asks for it (`embed=1`) and the game is framed. `plan`: the
 *  address's (plan.js `fromSearch`), or null. */
export function initClaude({ plan, build }) {
  ch.plan = plan; ch.build = build;
  const q = new URLSearchParams(location.search);
  if (window.parent === window || q.get('embed') !== '1') return;
  const embedder = q.get('embedder');
  addEventListener('message', (e) => {
    if (e.source !== window.parent || !allowedOrigin(e.origin, embedder)) return;
    const m = readMessage(e.data);
    if (!m) return;
    if (m.type === 'hello') {
      ch.origin = e.origin;
      post('ready', { build: ch.build, mode: ch.plan?.watch ? 'watch' : 'play', plan: ch.plan?.code ?? null });
    } else if (!ch.origin || e.origin !== ch.origin) {
      return; // (hello first, and then only from that origin)
    } else if (m.type === 'plan') {
      if (ch.live) { post('applied', { tick: G.tick ?? 0, ok: false, error: 'A game is running: send a delta', adjusted: [], plan: planCode(ch.seat) }); return; }
      ch.plan = { code: canonical(m.code), watch: !!ch.plan?.watch };
      post('applied', { tick: 0, ok: true, adjusted: [], plan: ch.plan.code });
    } else if (m.type === 'delta') {
      if (!ch.live || ch.seat === null || G.over) return;
      const error = planDelta(ch.seat, m.code);
      post('applied', { tick: G.tick ?? 0, ok: !error, ...(error ? { error } : {}), adjusted: error ? [] : planNotes(), plan: planCode(ch.seat) });
      if (!error && m.say) say(m.say);
    } else if (m.type === 'say' && ch.live) say(m.say);
  });
}

/** The plan the next game starts with (`{ code, watch }`), or null. */
export const currentPlan = () => ch.plan;

/** A single-player game has just been set up, before its first step: its plan on `seat` (a refusal told), watching if
 *  so, and check-ins for that seat when a page listens. `info`: the start message's map and peoples. */
export function startPlan(seat, info, use = true) {
  ch.live = false; ch.seat = null;
  if (!ch.plan || !use || seat === null || seat < 0) return;
  const error = setPlan(seat, ch.plan.code);
  if (error) { toast(`The plan could not be used: ${error}`, true, true); return; }
  const adjusted = planNotes();
  if (ch.plan.watch) watch();
  ch.seat = seat; ch.live = true;
  if (ch.origin) {
    recordCheckIns(seat);
    post('start', { seat, me: ch.plan.watch ? null : 0, peoples: info.peoples, map: info.map, plan: planCode(seat), adjusted });
  }
}

/** Each frame: the check-ins made since, to the page. */
export function pumpClaude() {
  if (!ch.live || !ch.origin) return;
  for (let c = takeCheckIn(); c; c = takeCheckIn()) post(c.kind, { tick: c.tick, digest: c.digest });
}

/** The game is over (or left): the summary to the page, from the plan seat's side. */
export function endClaude() {
  if (!ch.live) return;
  pumpClaude();
  ch.live = false;
  if (!ch.origin) return;
  const team = G.teams[ch.seat];
  const result = !G.over ? 'timeout' : G.winner === team ? 'won' : 'lost';
  post('end', { result, summary: summary() });
}

/** Whether the game running is watched (an AI-only game: no record, no share). */
export const watching = () => ch.live && !!ch.plan?.watch;
