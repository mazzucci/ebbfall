// The golden games (crates/endfall-sim/tests/golden.rs): whole games the AI plays, pinned to state hashes at 10 s,
// 1.5 min and 5 min. Lockstep needs every engine on every device to compute exactly these, so they run natively
// (cargo test), in Node (test/engine.test.js), in Chromium, Firefox and WebKit in CI, and on a real phone at
// selftest.html. A rule change updates golden.rs and this table together (test/engine.test.js checks they agree).

export const CHECKS = [300, 2700, 9000];

/** Each: golden.rs's label, the setup (map: index into MapKind::ALL; factions: index into FACTIONS; ai: the seats
 *  the scripted opponent plays; teams and size, when not a duel's) and the hashes at CHECKS. */
export const GOLDEN = [
  { name: 'ashen-easy', seed: 4242, diff: 0, map: 0, side: 0, factions: [0, 0], ai: [0, 1], want: [3811939529, 3649555534, 3250615304] },
  { name: 'glass-medium-swapped', seed: 1998, diff: 1, map: 1, side: 1, factions: [0, 0], ai: [0, 1], want: [2280891790, 3126294705, 3206587686] },
  { name: 'cinder-hard', seed: 2077, diff: 2, map: 4, side: 0, factions: [0, 0], ai: [0, 1], want: [2753967350, 2151600048, 3475131976] },
  { name: 'storm-medium', seed: 77, diff: 1, map: 2, side: 0, factions: [0, 0], ai: [0, 1], want: [632608993, 786997745, 1304334223] },
  { name: 'vael-player', seed: 4242, diff: 1, map: 0, side: 0, factions: [1, 0], ai: [0, 1], want: [1903309529, 3819836074, 3489339856] },
  { name: 'vael-ai-vs-human-ai', seed: 77, diff: 1, map: 0, side: 0, factions: [1, 0], ai: [1, 1], want: [3840268254, 1842640683, 2657523178] },
  { name: 'vael-ai-vs-human-ai-shore', seed: 1, diff: 1, map: 6, side: 0, factions: [1, 0], ai: [1, 1], want: [4223195674, 807372488, 400189945] },
  { name: 'teams-2v2-ai', seed: 31, diff: 1, map: 0, side: 0, factions: [0, 1, 0, 1], teams: [0, 0, 1, 1], ai: [1, 1, 1, 1], size: 96, want: [2736847024, 2798491419, 2794017094] },
];

/** Play golden game `g` on `sim` (the WASM module's exports) and return its hashes at CHECKS. `slice(ticks)` is
 *  awaited every 300 ticks (a page uses it to show progress and stay responsive); without it the game runs at once. */
export async function playGolden(sim, g, slice) {
  const game = sim.Game.withSeats(g.seed, g.diff, g.map, g.side, Uint32Array.from(g.factions), Uint8Array.from(g.teams || []), Uint8Array.from(g.ai), 0, g.size);
  const got = [];
  try {
    for (let t = 1; t <= CHECKS.at(-1); t++) {
      game.step();
      if (CHECKS.includes(t)) got.push(game.stateHash() >>> 0);
      if (slice && t % 300 === 0) await slice(t);
    }
  } finally { game.free(); }
  return got;
}
