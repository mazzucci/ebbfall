// The 16:9 trailer, cut 4 ("Day 675"): its text and its clock, shared by the shot list (shots.mjs: what is on screen
// each frame), and the cut (cut.mjs: where each part lies, where a typed character ticks, where the music enters).
// Times are video frames at 30 fps unless said; the gameplay's cuts are on the music's beats (tools/trailer/music-grid.mjs:
// "Strength of the Titans", a beat every 0.7036 s; the edit enters on the source's 33.048 s and its last chord is at 53.917 s).
export const FPS = 30;
export const MUSIC = { in: 33.048, chord: 53.917, beat: 0.7036 };
/** The King's card: the music's in point (seconds). */
export const KING_AT = 14.7; // (cut 4: 14.4; cut 5's DAY 2 is 0.3 s longer for its second line, and everything from here on moved with it as one block)
const beatFrame = (b) => Math.round((KING_AT + b * MUSIC.beat) * FPS);
/** DAY 1: when the Bots head out, as the second line starts (seconds; cut 5 cut to a second shot here, cut 6 is one shot). */
export const ROLL_AT = 6.5;
/** The cut: [part, first frame on the timeline]; a part runs to the next one's start (the card to END). */
export const CUT = [
  ['open', 0],            // the black card, the warp at WARP_T, the landing, DAY 1's first line
  ['day2', 258],          // 8.6 s
  ['king', KING_AT * FPS], // 14.4 s: the music, on its downbeat
  ['muster', beatFrame(6)],
  ['raid', beatFrame(10)],  // (the track's biggest hit, 40.11 s of the source)
  ['fight', beatFrame(14) - 1],
  ['tower', beatFrame(18)],
  ['late1', beatFrame(22)],
  ['late2', beatFrame(24)],
  ['late3', beatFrame(26)],
  ['card', Math.round((KING_AT + MUSIC.chord - MUSIC.in) * FPS)], // the last chord
];
export const END = 1209; // 40.3 s (cut 4: 1200)
export const at = (part) => CUT.find(c => c[0] === part)[1];
export const lengthOf = (part) => { const i = CUT.findIndex(c => c[0] === part); return (i + 1 < CUT.length ? CUT[i + 1][1] : END) - CUT[i][1]; };

// ---- the typing ----
/** When each character of `text` lands, typed from `t0` at `cps` characters a second, a breath after a sentence. */
export function typeTimes(text, t0, cps = 22, breath = 0.3) {
  const out = []; let t = t0;
  for (const ch of text) { out.push(t); t += 1 / cps + (/[.,]/.test(ch) ? breath : 0); }
  return out;
}
/** What of `text` is typed by `t` (its `times` from typeTimes). */
export const typed = (text, times, t) => { let n = 0; while (n < times.length && times[n] <= t + 1e-6) n++; return text.slice(0, n); };

/** The warp (seconds of the part `open`): it grows from GROW_T and whites the frame out at WARP_T, where the base lands. */
export const GROW_T = 2.3, WARP_T = 3.2;
/** Each typed text: the part it is in, its day stamp and when it shows, its lines and each one's typing (seconds of the part). */
const line = (text, t0, cps) => ({ text, times: typeTimes(text, t0, cps) });
const after = (l, gap = 0.35) => l.times.at(-1) + gap;
const y2047 = line('2047.', 0.5, 5.5, 0);
const d1a = line('The time jump worked.', 4.75), d1b = line('Sending out scouts.', ROLL_AT + 0.05); // (the second line on the cut to the Bots heading out)
const d2a = line('This is 1447. No way home.', 0.75), d2b = line('We found thorium. The lights stay on.', after(d2a));
/** DAY 2's base comes on as "The lights stay on." types (seconds of the part `day2`): from its first character to its last. */
export const LIGHTS = { from: d2b.times[d2b.text.indexOf('The lights')], to: d2b.times.at(-1) };
const d675 = line('Still here.', 0.3, 24);
export const TEXT = {
  year: { part: 'open', lines: [y2047] },
  day1: { part: 'open', day: 'DAY 1', dayAt: 4.3, lines: [d1a, d1b] },
  day2: { part: 'day2', day: 'DAY 2', dayAt: 0.3, lines: [d2a, d2b] },
  day675: { part: 'late1', day: 'DAY 675', dayAt: 0.1, lines: [d675] },
};
export const KING = { lines: ['No lord gave them leave', 'to break my ground.', 'I will not abide it.'], tag: 'THE KING' };
export const CARD = { lines: ['Real-time strategy. Play either side.', 'Free in your browser, phone or desktop.'], url: 'ebbfall.com' };
/** Every typed character's time on the timeline (seconds): the key ticks (spaces make none). */
export function ticks() {
  const out = [];
  for (const t of Object.values(TEXT)) for (const l of t.lines) [...l.text].forEach((ch, i) => { if (ch !== ' ') out.push(+(at(t.part) / FPS + l.times[i]).toFixed(4)); });
  return out.sort((a, b) => a - b);
}
/** DAY 2 (seconds of the part): the Bots that break off for the mine go as "We found thorium." starts; the base
 *  stands a third into "The lights stay on." */
export const THORIUM_AT = d2b.times[0] + 0.05, DONE_AT = LIGHTS.from + (LIGHTS.to - LIGHTS.from) * 0.35;
