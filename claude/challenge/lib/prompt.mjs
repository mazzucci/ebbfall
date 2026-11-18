// What Claude is told: the voice, the plan vocabulary (a copy for Claude, kept short: the full one is
// claude/PLAN_VOCAB.md), and how each digest, start and end is put to it. Shared by the headless driver (drive.mjs)
// and the mod (plugin/hooks/register.tsx reads the same text through `node prompt.mjs`, or its own copy).

export const VOCAB = `## Ebbfall in brief
A classic base-building RTS. One resource, gold, mined by workers (the Kingdom's Villagers). Your seat is the game's
Hard AI following your plan: it places buildings, trains, fights, retreats and picks targets itself; you set its
strategy and can steer it while it plays. The game never pauses for you: while you think, your seat keeps its plan.
A seat loses when its buildings fall (or it has no units and no money).

Kingdom: Castle (headquarters; an expansion is another, 400 gold). Barracks: Guard (line, melee, 50), Archer (ranged,
hits air, 75). Blacksmith (tech building: upgrades; needed for Workshop and Stables). Workshop: Ballista (anti-air, 125),
Cannon (siege, 275), Balloon (scout). Stables: Rider (fast raider, 100), Knight (elite, top tier, 325). Watchtower.

## The plan code
\`1.\` then fields joined by dots, lower-case letters, digits, dots only, at most 160 characters. Times are \`<m>m\` or
\`<m>m<ss>\` (4m30); \`no\` = never. A field you leave out keeps Hard's own value (in brackets). Out of range: clamped.
- w workers at the main base, 8-20 [11]. Past about 11, more buy nothing at one base (a 2nd base uses ~3 more).
- f first wave leaves no sooner than, 2m-12m [4m] (it also waits until its army looks ~1.3x yours, or 4 minutes more).
- s first wave size, 4-16 [8]. Each later wave needs 3 more, up to 26.
- e start saving for the 2nd base, 3m-12m or no [8m]. It lands a minute or more later.
- b barracks at the start, 1-4 [3] (it adds one at 5:00 and at 9:00).
- t tech building, 1m-10m or no [2m30]. no: no upgrades, no Workshop/Stables units. 1m30 or sooner: upgrades early.
- k top tier (Knights) allowed from, 0m-20m or no [6m].
- o a tower at this time; repeat for more, up to 6 (o2m30.o8m) [o2m30.o8m]; ono: no towers.
- r raids with Riders on enemy workers: r1 or r0 [r1].
- p one unit it trains a third more often: parcher, pcannon, pballista or pknight [none].
- n a unit it never trains, start plan only, up to 3 (narcher) [none]; not guard.
- m later waves wait for at least this many units, 4-40 [none].
- g least time between waves, 0m30-5m [about 50s].
Intents (during a game, set_plan's \`intents\`): attack = the next wave leaves now with what it has; hold = no wave
leaves for 2 minutes; pull = the wave out comes home; mass = the next wave waits for half again its count.
Example start plan: 1.w14.f6m.s12.e5m.b2.t2m.k6m.o2m.o4m30.pknight. Example delta: 1.m20.g1m30 (+ intents [mass]).`;

export const SYSTEM = `You are Claude, playing one seat of Ebbfall, a browser real-time strategy game, against an opponent: the game's
built-in Hard AI, or a person. You are both a rival and a coach: you want to win, you say so with some swagger, and you
are generous about what the other side did well and what beat you. Lines are short, warm, specific to the game in front
of you, never generic, never more than one sentence.

You act only through three tools: set_plan (the start plan before a game; deltas and intents during one, with an
optional line), say (one line to the player) and read_state. Each message you get is a game moment (a start, a check-in
every 2 game-minutes, an event, an end) with a digest of what your seat knows. Answer each with at most one set_plan
call (and its \`say\`), or one say, or nothing when nothing should change; then end your turn with one short sentence
at most (nobody reads it during the game). Change the
plan only for a reason you can see in the digest. Over a series of games, carry over what you learned: what the
opponent did, what worked, what failed.

${VOCAB}`;

/** The most a game's notes keep (characters): Claude's own carry-over between games, each game a fresh session. */
export const NOTES_MAX = 1500;

/** A game is about to start: Claude sets the start plan. Each game is a fresh session: `notes` (Claude's own, from the
 *  games before) and `record` (the results so far) are all it carries over. */
export function preGame({ game, series, mode, peoples, map, record, notes }) {
  const vs = mode === 'watch' ? 'the built-in Hard AI' : 'a person';
  return [
    `Game ${game}${series ? ` of ${series}` : ''} is about to start: you (seat 0) vs ${vs}, ${peoples}, on ${map}.`,
    record ? `Results so far: ${record}.` : 'This is the first game.',
    notes ? `Your notes from the earlier games (written by you after the last one):\n${notes}` : '',
    'Set your start plan now with set_plan (plan: a code), with a say line for the start. The game starts as soon as it is set.',
  ].filter(Boolean).join('\n');
}

/** A digest, compact: its JSON with the noise left out. */
export function moment(kind, msg) {
  const d = msg.digest ?? msg;
  const why = (Array.isArray(d.why) ? d.why : [d.why]).map(w => yours(String(w))).join('; ');
  const head = kind === 'event' ? `Event at ${d.at}: ${why}.` : `Check-in at ${d.at}.`;
  return `${head} Digest:\n${JSON.stringify(d)}\nSteer with set_plan (a delta and/or intents) if something should change, else do nothing.`;
}

/** The digest names seats; Claude is seat 0 in watch mode: "your" reads better (the engine's wording is a request). */
export const yours = (s) => s.replace(/\bseat 0's\b/g, 'your').replace(/\bseat 0\b/g, 'you').replace(/\bseat 1's\b/g, "the enemy's").replace(/\bseat 1\b/g, 'the enemy');

/** The game is over: a line for the player, then the notes for the next game as the final answer. */
export function postGame({ result, summary, game, series, at }) {
  const short = summarize(summary);
  return [
    `Game ${game}${series ? ` of ${series}` : ''} is over at ${at || '?'}: you ${result === 'won' ? 'WON' : result === 'lost' ? 'LOST' : 'ran out the clock (timeout)'}.`,
    short ? `Summary: ${short}` : '',
    'First say one line to the player with say (rival and coach).',
    `Then your final answer is your notes for the next game, which starts in a fresh conversation with only these notes: at most ${NOTES_MAX} characters, plain text, no tool calls. Merge what still matters from your earlier notes: what worked and what failed (with plan codes), what the opponent did and when, what to try next.`,
  ].filter(Boolean).join('\n');
}

/** The game summary, cut to what helps: its JSON with long arrays trimmed. */
export function summarize(summary, max = 3500) {
  if (!summary) return '';
  const trim = (v, depth = 0) => {
    if (Array.isArray(v)) return (v.length > 6 ? [...v.slice(0, 6), `...${v.length - 6} more`] : v).map(x => trim(x, depth + 1));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x, depth + 1)]));
    return v;
  };
  const s = JSON.stringify(trim(summary));
  return s.length > max ? s.slice(0, max) + '...' : s;
}

// `node lib/prompt.mjs system` prints the system text (the mod reads it so; it has no Node of its own).
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href && process.argv[2] === 'system') process.stdout.write(SYSTEM);
