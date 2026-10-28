// Play a friend, end to end in two browsers: a local relay (relay/server.mjs, with latency and jitter), one player
// opens a room from the menu, the other joins by the shared link, both ready up, and the game runs in lockstep in both.
// One gives orders; both worlds must be the same on every tick they both ran (the network layer's hash trail), and
// leaving concedes: the other side wins. The pause card online: a menu over a game that goes on, and a pause for
// everyone that only its caller ends. The room as the sides board: the host adds AIs, sets their levels and races, moves
// a friend between sides; the friend sees it read-only but its own race; an open seat's SHARE LINK; eight seats on a
// phone; rooms of four and six with AI seats (M4): both browsers run the AI alike.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, browserContext, baseUrl, DESKTOP, PHONE } from './harness.mjs';
import { startRelay } from '../../relay/server.mjs';
import { PROTO } from '../../relay/room.js';

let relay;
before(async () => { await start(); relay = startRelay({ port: 0, latency: 40, jitter: 60 }); await relay.ready; });
after(async () => { await relay.close(); await stop(); });

/** The friend opens the shared link: the join form, the code filled in; a name, then JOIN. */
async function joinByLink(device, query, name) {
  const x = await page(device, query);
  await x.p.locator('#onlineJoin').waitFor({ state: 'visible' });
  await x.p.locator('#onlineName').fill(name);
  await x.tap('#btnJoinRoom');
  return x;
}

async function page(device, query) {
  const ctx = await browserContext(device), p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`${baseUrl()}?${query}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
  await p.evaluate(() => { window.fsAsked = 0; document.documentElement.requestFullscreen = () => { window.fsAsked++; return Promise.reject(new Error('(headless)')); }; }); // (counts the asks for full screen)
  const tap = (sel) => device.hasTouch ? p.locator(sel).tap() : p.locator(sel).click();
  return { ctx, p, errors, tap };
}
/** The room's sides board as page `x` shows it: each side's tokens, the viewer's side first, by name (YOU, Ann, AI 1;
 *  OPEN for an open seat). */
const sides = (x) => x.p.$$eval('#onlineBoard .side', ss => ss.map(s => [...s.querySelectorAll('.tok')].map(t => (t.classList.contains('open') ? 'OPEN' : t.querySelector('b').firstChild.textContent))));
/** Seat `i`'s sheet on page `x`: its token, then each of `keys` (a chip or button's data-k: race:vael, diff:2, side:0,
 *  share, remove...), then DONE (unless `done` is false: the sheet stays open). */
async function sheet(x, i, keys = [], done = true) {
  await x.tap(`#onlineBoard [data-k="tok${i}"]`); await x.p.waitForTimeout(400); // (a tap within 350 ms of opening is a double tap's second)
  for (const k of keys) await x.tap(`#onlineSheet [data-k="${k}"]`);
  if (done) await x.tap('#onlineSheet [data-k="done"]');
}
/** What does not fit page `x`'s room ([] when it all does): the page scrolls (unless `scroll`), a control under the
 *  screen's top-right corner (sound and full screen: 100x52), two controls over each other, a token cut short. */
const fits = (x, { scroll = false } = {}) => x.p.evaluate((scroll) => {
  const bad = [], card = document.querySelector('#online .card.menu');
  if (!scroll && card.scrollHeight > card.clientHeight + 1) bad.push(`scrolls: ${card.scrollHeight} > ${card.clientHeight}`);
  const hit = (r, c) => r.width > 0 && r.height > 0 && r.left < c.right - 0.5 && r.right > c.left + 0.5 && r.top < c.bottom - 0.5 && r.bottom > c.top + 0.5;
  const corner = { left: innerWidth - 100, right: innerWidth, top: 0, bottom: 52 };
  const name = (e) => e.id || e.dataset.k || e.textContent.trim().slice(0, 16);
  const rs = [...document.querySelectorAll('#online :is(button, input, h2, .note, .mapline, canvas)')].filter(e => e.offsetParent !== null && !e.closest('.corner')).map(e => [e, e.getBoundingClientRect()]);
  for (const [e, r] of rs) if (hit(r, corner)) bad.push(`under the corner: ${name(e)}`);
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (!rs[i][0].contains(rs[j][0]) && !rs[j][0].contains(rs[i][0]) && hit(rs[i][1], rs[j][1])) bad.push(`over each other: ${name(rs[i][0])} / ${name(rs[j][0])}`);
  for (const t of document.querySelectorAll('#onlineBoard .tok')) if (t.scrollWidth > t.clientWidth + 1) bad.push(`cut: ${t.getAttribute('aria-label')}`);
  return bad;
}, scroll);

test('two players: open a room, join by its link, ready, play in lockstep, and leaving concedes', async () => {
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
  const a = await page(DESKTOP, relayQ);
  try {
    assert.ok(await a.p.locator('#btnOnline').isVisible(), 'MULTIPLAYER on the menu when a relay is known');
    await a.tap('#btnOnline');
    await a.p.locator('#onlineName').fill('Ann');
    await a.tap('#btnNewRoom');
    await a.p.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomShow').textContent));
    const code = await a.p.locator('#roomShow').textContent();
    // Alone in the room: the other seat is open (not someone away), and the line says what to do.
    await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok.open').length === 1);
    assert.deepEqual(await sides(a), [['YOU'], ['OPEN']], 'an open seat on the other side');
    assert.doesNotMatch(await a.p.locator('#onlineBoard').textContent(), /AWAY|HUMANS.*HUMANS/, 'an open seat: no race, no AWAY');
    assert.equal(await a.p.locator('#onlineStatus').textContent(), 'A seat is open: share the link, or give it to the AI');
    assert.equal(await a.p.locator('#onlineMapLbl').textContent(), 'MAP', 'the host picks the map');
    assert.match(relay.rooms.get(code).seats[0].build, /^[0-9a-f]{12}$/, "the opener's seat holds its sim build (a friend's must match)");
    // The friend opens the shared link on a phone: the join form, the code filled in, the invitation said; a name,
    // then JOIN.
    const b = await page(PHONE, `${relayQ}&join=${code}`);
    assert.equal(await b.p.locator('#roomCode').inputValue(), code);
    assert.equal(await b.p.locator('#onlineStatus').textContent(), `You're invited to room ${code}: type your name, then JOIN`);
    assert.equal(await b.p.locator('#onlineName').getAttribute('placeholder'), 'Your name');
    assert.ok(await b.p.locator('#start').isHidden(), 'no menu (or anything) in front of the form');
    assert.equal(relay.rooms.get(code).seats.filter(s => s.conn).length, 1, 'nobody joined before JOIN');
    await b.p.locator('#onlineName').fill('Bo'); await b.tap('#btnJoinRoom');
    try {
      await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 2 && !/AWAY|OPEN SEAT/.test(document.getElementById('onlineBoard').textContent));
      assert.deepEqual(await sides(a), [['YOU'], ['Bo']], 'the friend under the name typed');
      await b.p.waitForFunction(() => document.getElementById('onlineMapNote').textContent === "Ann's pick", null, { timeout: 5000 }); // (the friend sees whose pick the map is)
      assert.equal(await b.p.locator('#onlineMapLbl').textContent(), 'MAP');
      // The friend's race: RANDOM, shown as such in the room until the start; drawn there, alike in both games.
      await sheet(b, 1, ['race:random']);
      await a.p.waitForFunction(() => /RANDOM/.test(document.getElementById('onlineBoard').textContent));
      await b.p.waitForFunction(() => /^YOU RND, Random/.test(document.querySelector('#onlineBoard .tok.me').getAttribute('aria-label')), null, { timeout: 5000 }); // (the friend's own pick, back from the relay)
      await a.tap('#btnOnlineReady'); await b.tap('#btnOnlineReady');
      for (const x of [a, b]) await x.p.waitForFunction(() => endfall.online.playing && endfall.G.tick > 30, null, { timeout: 20000 });
      const drawn = await a.p.evaluate(() => { const s = endfall.online.setup; return [s.races, endfall.engine.seatRaces(s.races, s.seed, Object.keys(endfall.engine.FACTIONS))]; });
      assert.deepEqual(drawn[0], ['humans', 'random'], 'the relay passed RANDOM on');
      assert.ok(['humans', 'vael'].includes(drawn[1][1]), `a race drawn: ${drawn[1]}`);
      assert.deepEqual(await a.p.evaluate(() => endfall.G.factions), drawn[1], 'the draw from the room\'s seed');
      assert.deepEqual(await b.p.evaluate(() => [endfall.G.me, endfall.G.factions]), [1, drawn[1]], 'the friend plays the second seat, the same draw');
      // Ann sends a harvester off (set-up through the engine: the lobby and the lockstep are what is tested).
      const id = await a.p.evaluate(() => { const h = endfall.G.units.find(u => u.team === endfall.G.me && u.d.worker); endfall.engine.moveTo(h, h.x + 300, h.y + 200); return h.id; });
      const at = (x) => x.p.evaluate((id) => { const u = endfall.G.units.find(u => u.id === id); return [Math.round(u.x), Math.round(u.y)]; }, id);
      const before = await at(b);
      await a.p.waitForTimeout(4000);
      const trail = (x) => x.p.evaluate(() => [...endfall.online.net.trail]);
      const [ta, tb] = [new Map(await trail(a)), new Map(await trail(b))];
      const common = [...ta.keys()].filter(t => tb.has(t));
      assert.ok(common.length > 60, `both ran the same stretch (${common.length} ticks in common)`);
      for (const t of common) assert.equal(ta.get(t), tb.get(t), `the same world at tick ${t}`);
      assert.notDeepEqual(await at(b), before, "Ann's order ran in the friend's game too");
      // The friend stalls (no acks): Ann's screen says who it waits for. Ann drops offline meanwhile, the friend comes
      // back unseen, Ann reconnects: the line must not stay up.
      await b.p.evaluate(() => { endfall.online.net.ackIfDue = () => {}; });
      await a.p.waitForFunction(() => /Waiting for/.test(document.getElementById('netWait').textContent) && !document.getElementById('netWait').hidden, null, { timeout: 10000 });
      await a.p.evaluate(() => { const n = endfall.online.net; n._open = n.open; n.open = () => {}; n.ws.close(); });
      await a.p.waitForTimeout(500);
      await b.p.evaluate(() => { delete endfall.online.net.ackIfDue; });
      await b.p.waitForTimeout(1500);
      await a.p.evaluate(() => { const n = endfall.online.net; n.open = n._open; n.open(); });
      await a.p.waitForFunction(() => document.getElementById('netWait').hidden, null, { timeout: 8000 });
      // Ann leaves: a concede; the friend wins. Ann is told nothing about her own leaving.
      await a.p.evaluate(() => { document.getElementById('btnPause').click(); });
      const toasts = new Set();
      await a.p.exposeFunction('sawToast', (t) => toasts.add(t));
      await a.p.evaluate(() => new MutationObserver(() => { for (const t of document.querySelectorAll('#msg .toast')) window.sawToast(t.textContent); }).observe(document.getElementById('msg'), { childList: true }));
      await a.tap('#btnQuit');
      await b.p.locator('#end').waitFor({ state: 'visible', timeout: 15000 });
      const card = await b.p.evaluate(() => [document.getElementById('result').textContent, document.getElementById('btnWatch').hidden, document.getElementById('btnRematch').hidden]);
      assert.match(await b.p.locator('#endSub').textContent(), /^Ann conceded after /, 'the end card names the friend');
      // Straight into a new room from the end card (quickly: within the old game's clean-up delay), which must not
      // close the new room.
      await b.p.evaluate(() => { for (const id of ['btnAgain', 'btnOnline', 'btnNewRoom']) document.getElementById(id).click(); });
      assert.deepEqual(card, ['VICTORY', true, true], 'the friend wins; no watch online, and no rematch with a friend who left');
      await b.p.waitForFunction((old) => { const c = document.getElementById('roomShow').textContent; return /^[A-Z]{4}$/.test(c) && c !== old; }, code);
      const code2 = await b.p.locator('#roomShow').textContent();
      assert.notEqual(code2, code);
      await b.p.waitForTimeout(2500);
      assert.ok(await b.p.evaluate(() => !!endfall.online.net && !endfall.online.net.closed), 'the new room is still open');
      assert.ok(await a.p.locator('#start').isVisible(), 'Ann is back on the menu');
      assert.deepEqual([...toasts].filter(t => /left/.test(t)), [], 'no news of her own leaving');
      assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
    } finally { await b.ctx.close(); }
  } finally { await a.ctx.close(); }
});

test('the sides board: the host adds AIs, sets their levels and races and moves the friend to its side; the friend sees the board read-only but its own race, READY lights; two people against two AIs play the same game', async () => {
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
  const a = await page(PHONE, relayQ);
  try {
    await a.tap('#btnOnline'); await a.p.locator('#onlineName').fill('Ann'); await a.tap('#btnNewRoom');
    await a.p.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomShow').textContent));
    const code = await a.p.locator('#roomShow').textContent();
    await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 2);
    assert.deepEqual(await sides(a), [['YOU'], ['OPEN']], 'the host alone: an open seat on the other side');
    const b = await joinByLink(DESKTOP, `${relayQ}&join=${code}`, 'Bo');
    try {
      await a.p.waitForFunction(() => /Bo/.test(document.getElementById('onlineBoard').textContent));
      // The friend's view: the same board, read-only but its own token; no host controls; the map as one line.
      await b.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 2);
      assert.deepEqual(await sides(b), [['YOU'], ['Ann']], 'the friend\'s side first');
      assert.deepEqual(await b.p.$$eval('#onlineBoard .tok', ts => ts.map(t => [t.querySelector('b').firstChild.textContent, t.disabled, t.classList.contains('ro')])), [['YOU', false, false], ['Ann', true, true]], 'the host\'s token read-only (flat), its own not');
      assert.equal(await b.p.locator('#onlineBoard .tok:not(.me) .crown').count(), 1, 'a crown on the host');
      assert.equal(await b.p.locator('#onlineBoard .add, #onlineBoard .newside').count(), 0, 'no + AI, + SEAT or + SIDE for the friend');
      assert.ok(await b.p.locator('#onlineMaps').isHidden() && await b.p.locator('#onlineMapLine').isVisible(), 'no map chips: one line');
      assert.equal(await b.p.locator('#onlineMapLine').textContent(), "ASHEN BASINAnn's pick");
      // Its own token: a sheet with RACE only (no level, no side, and no READY).
      await sheet(b, 1, [], false);
      assert.deepEqual(await b.p.$$eval('#onlineSheet .opt .lbl', ls => ls.map(l => l.textContent)), ['RACE'], 'its own sheet: RACE only');
      assert.deepEqual(await b.p.$$eval('#onlineSheet .ft button', bs => bs.map(x => x.textContent)), ['DONE']);
      await b.tap('#onlineSheet [data-k="race:vael"]');
      await a.p.waitForFunction(() => /Bo VAEL|Bo, Vael/.test([...document.querySelectorAll('#onlineBoard .tok')].map(t => t.getAttribute('aria-label')).join()));
      await b.tap('#onlineSheet [data-k="done"]');
      // READY: a lit toggle (not a label that flips).
      assert.equal(await b.p.locator('#btnOnlineReady').textContent(), 'READY');
      await b.tap('#btnOnlineReady');
      await b.p.waitForFunction(() => { const r = document.getElementById('btnOnlineReady'); return r.classList.contains('lit') && r.textContent === '✓ READY' && r.getAttribute('aria-pressed') === 'true'; });
      await a.p.waitForFunction(() => !!document.querySelector('#onlineBoard [data-k="tok1"] .st.ok'), null, { timeout: 5000 }); // (the host sees the check)
      // The host: an AI on its own side (the friend's seat moves: the relay keeps each side together and tells it), one
      // on the other; each at its own level and race.
      await a.tap('#onlineBoard [data-k="ai0"]');
      await b.p.waitForFunction(() => endfall.online.seat === 2, null, { timeout: 5000 });
      await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 3);
      assert.deepEqual(await sides(a), [['YOU', 'AI 1'], ['Bo']]);
      await b.p.waitForFunction(() => !document.getElementById('btnOnlineReady').classList.contains('lit'), null, { timeout: 5000 }); // (a new seat: everyone ready again)
      await a.tap('#onlineBoard [data-k="ai1"]');
      await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 4);
      assert.deepEqual(await sides(a), [['YOU', 'AI 1'], ['Bo', 'AI 2']]);
      assert.deepEqual(await a.p.$$eval('#onlineMaps .map .up', bs => bs.map(x => x.textContent)), [], 'four: the 96x96 maps');
      await sheet(a, 3, ['diff:3', 'race:vael']); // (AI 2: Brutal, Vael)
      await sheet(a, 1, ['diff:0']); // (AI 1: Easy)
      await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard [data-k="tok3"] .lvl i.on').length === 4 && document.querySelectorAll('#onlineBoard [data-k="tok1"] .lvl i.on').length === 1);
      assert.match(await b.p.locator('#onlineBoard [data-k="tok3"]').getAttribute('aria-label'), /^AI 2 VAEL, Brutal/, 'the friend sees the AI\'s race and level');
      // The host moves the friend to its side, then its AI to the other: two people against two AIs, the friend seat 1.
      await sheet(a, 2, ['side:0']);
      await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .side')[0]?.querySelectorAll('.tok').length === 3);
      await sheet(a, 1, ['side:1']);
      await b.p.waitForFunction(() => endfall.online.seat === 1, null, { timeout: 5000 });
      await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .side')[0]?.querySelectorAll('.tok').length === 2);
      assert.deepEqual(await sides(a), [['YOU', 'Bo'], ['AI 1', 'AI 2']]);
      await b.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .side')[0]?.textContent.includes('Ann'));
      assert.deepEqual(await sides(b), [['Ann', 'YOU'], ['AI 1', 'AI 2']], 'the friend on the host\'s side');
      // The host's own sheet: RACE and SIDE; another person's: SIDE only (never their race).
      await sheet(a, 1, [], false);
      assert.deepEqual(await a.p.$$eval('#onlineSheet .opt .lbl', ls => ls.map(l => l.textContent)), ['SIDE'], 'a person\'s sheet: their side only');
      await a.tap('#onlineSheet [data-k="close"]');
      await a.p.waitForTimeout(400); await sheet(a, 0, [], false);
      assert.deepEqual(await a.p.$$eval('#onlineSheet .opt .lbl', ls => ls.map(l => l.textContent)), ['RACE', 'SIDE'], 'the host\'s own: race and side');
      await a.p.keyboard.press('Escape');
      await a.p.waitForFunction(() => /Ready when you are/.test(document.getElementById('onlineStatus').textContent));
      await a.tap('#btnOnlineReady'); await b.tap('#btnOnlineReady');
      for (const x of [a, b]) await x.p.waitForFunction(() => endfall.online.playing && endfall.G.tick > 240, null, { timeout: 60000 });
      const setup = await a.p.evaluate(() => { const s = endfall.online.setup; return [s.ai, s.teams, s.diffs, s.diff, s.races, endfall.engine.MW, endfall.online.names]; });
      assert.deepEqual(setup, [[0, 0, 1, 1], [0, 0, 1, 1], [0, 0, 0, 3], 3, ['humans', 'vael', 'random', 'vael'], 96, ['Ann', 'Bo', 'the AI', 'the AI']], 'two people against two AIs on 96x96, each AI at its own level');
      assert.deepEqual(await Promise.all([a, b].map(x => x.p.evaluate(() => endfall.G.me))), [0, 1]);
      const trail = (x) => x.p.evaluate(() => [...endfall.online.net.trail]);
      const [ta, tb] = [new Map(await trail(a)), new Map(await trail(b))];
      const common = [...ta.keys()].filter(t => tb.has(t));
      assert.ok(common.length > 60, `both ran the same stretch (${common.length} ticks in common)`);
      for (const t of common) assert.equal(ta.get(t), tb.get(t), `the same world at tick ${t}`);
      assert.ok(await a.p.evaluate(() => [2, 3].every(t => endfall.G.units.filter(u => u.team === t).length > 4 || endfall.G.bldgs.some(b => b.team === t && b.queue.length > 0))), 'the AIs play');
      assert.ok(await a.p.locator('#netWait').isHidden(), 'nobody is waited for, the AI seats least of all');
      assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
    } finally { await b.ctx.close(); }
  } finally { await a.ctx.close(); }
});

test('an open seat: SHARE LINK the big button (in the title and the seat\'s sheet), GIVE TO AI, REMOVE; a friend\'s SIT HERE moves them there', async () => {
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
  const a = await page(PHONE, relayQ);
  try {
    await a.p.evaluate(() => { window.shared = []; navigator.share = async (d) => { window.shared.push(d.url); }; });
    await a.tap('#btnOnline'); await a.p.locator('#onlineName').fill('Ann'); await a.tap('#btnNewRoom');
    await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 2);
    const code = await a.p.locator('#roomShow').textContent();
    assert.equal(await a.p.locator('#onlineStatus').textContent(), 'A seat is open: share the link, or give it to the AI');
    assert.deepEqual(await a.p.evaluate(() => ['btnShare', 'btnOnlineReady'].map(id => document.getElementById(id).classList.contains('big'))), [true, false], 'SHARE LINK the big button while a seat is open; READY plain');
    await sheet(a, 1, [], false);
    assert.equal(await a.p.locator('#onlineSheet .info').textContent(), 'The first friend to open the link takes this seat.');
    assert.deepEqual(await a.p.$$eval('#onlineSheet .ft button', bs => bs.map(x => [x.textContent, x.classList.contains('big')])), [['SHARE LINK', true], ['GIVE TO AI', false], ['DONE', false]], 'SHARE LINK first and big; no REMOVE at two seats');
    assert.deepEqual(await a.p.$$eval('#onlineSheet .opt .lbl', ls => ls.map(l => l.textContent)), ['SIDE']);
    await a.tap('#onlineSheet [data-k="share"]');
    await a.p.waitForFunction(() => window.shared.length === 1);
    assert.match(await a.p.evaluate(() => window.shared[0]), new RegExp(`\\?join=${code}`), 'the room\'s link');
    // GIVE TO AI: the seat the AI's (RANDOM on Medium, the first); its sheet now an AI's.
    await a.tap('#onlineSheet [data-k="giveai"]');
    await a.p.waitForFunction(() => document.querySelector('#onlineSheet .opt .lbl')?.textContent === 'RACE');
    assert.deepEqual(await a.p.$$eval('#onlineSheet .opt .lbl', ls => ls.map(l => l.textContent)), ['RACE', 'PLAYS', 'SIDE'], 'the AI\'s sheet');
    assert.deepEqual(await a.p.$$eval('#onlineSheet .chips .on', cs => cs.map(c => c.dataset.k)), ['race:random', 'diff:1', 'side:1']);
    assert.equal(await a.p.locator('#onlineStatus').textContent(), 'Ready when you are');
    assert.ok(!(await a.p.locator('#btnShare').getAttribute('class')).includes('big'), 'no seat open: SHARE LINK plain');
    await a.tap('#onlineSheet [data-k="open"]'); // (OPEN FOR A FRIEND)
    await a.p.waitForFunction(() => !!document.querySelector('#onlineSheet [data-k="share"]'));
    await a.tap('#onlineSheet [data-k="done"]');
    // + SEAT on the host's side, then a friend: the first open seat (the host's side); SIT HERE moves them to the other.
    await a.tap('#onlineBoard [data-k="seat0"]');
    await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok.open').length === 2);
    assert.equal(await a.p.locator('#onlineStatus').textContent(), '2 seats are open: share the link, or give them to the AI');
    const b = await joinByLink(PHONE, `${relayQ}&join=${code}`, 'Bo');
    try {
      await b.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 3);
      assert.deepEqual(await sides(b), [['Ann', 'YOU'], ['OPEN']]);
      assert.equal(await b.p.locator('#onlineBoard .tok.open .act').textContent(), 'SIT HERE');
      assert.equal(await b.p.locator('#onlineStatus').textContent(), 'Waiting for players…');
      await b.tap('#onlineBoard .tok.open');
      await b.p.waitForFunction(() => endfall.online.seat === 2, null, { timeout: 5000 });
      await b.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .side')[0]?.textContent.includes('YOU') && !document.querySelectorAll('#onlineBoard .side')[0]?.textContent.includes('Ann'));
      assert.deepEqual(await sides(b), [['YOU'], ['Ann', 'OPEN']], 'the friend took the other side\'s seat');
      // REMOVE: the open seat goes (three seats: it may).
      await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok.open').length === 1);
      await sheet(a, 1, ['remove'], false);
      await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 2);
      await b.p.waitForFunction(() => endfall.online.seat === 1, null, { timeout: 5000 });
      assert.ok(await a.p.locator('#onlineSheet').isHidden(), 'its sheet closed');
      assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
    } finally { await b.ctx.close(); }
  } finally { await a.ctx.close(); }
});

test('eight seats fit a small phone (667x375), a landscape phone (844x390) and an upright one two abreast (412x915), the corner clear; six, three against three, play the same 128x128 game', async () => {
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
  const a = await page({ ...PHONE, viewport: { width: 667, height: 375 } }, relayQ);
  try {
    await a.tap('#btnOnline'); await a.p.locator('#onlineName').fill('Annabelle'); await a.tap('#btnNewRoom');
    await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 2);
    const code = await a.p.locator('#roomShow').textContent();
    // Eight seats: the host and three AIs against three AIs and an open seat.
    for (const k of ['ai0', 'ai0', 'ai0', 'ai1', 'ai1', 'ai1']) { const n = await a.p.locator('#onlineBoard .tok').count(); await a.tap(`#onlineBoard [data-k="${k}"]`); await a.p.waitForFunction((n) => document.querySelectorAll('#onlineBoard .tok').length === n + 1, n); }
    assert.equal(await a.p.locator('#onlineBoard .add, #onlineBoard .newside').count(), 0, 'eight: nothing more to add');
    assert.deepEqual(await sides(a), [['YOU', 'AI 1', 'AI 2', 'AI 3'], ['OPEN', 'AI 4', 'AI 5', 'AI 6']]);
    const b = await joinByLink(DESKTOP, `${relayQ}&join=${code}`, 'Bo');
    try {
      await a.p.waitForFunction(() => /Bo/.test(document.getElementById('onlineBoard').textContent));
      for (const [w, h] of [[667, 375], [844, 390], [412, 915]]) {
        await a.p.setViewportSize({ width: w, height: h }); await a.p.waitForTimeout(300);
        assert.deepEqual(await fits(a), [], `${w}x${h}: eight seats fit, nothing under the corner, every name whole`);
      }
      assert.deepEqual(await a.p.$$eval('#onlineBoard .side', ss => ss.map(s => { const t = [...s.querySelectorAll('.tok')].map(e => e.getBoundingClientRect()); return t.filter(r => Math.abs(r.top - t[0].top) < 2).length; })), [2, 2], '412x915: two abreast');
      await a.p.setViewportSize({ width: 568, height: 320 }); await a.p.waitForTimeout(300);
      assert.deepEqual(await fits(a, { scroll: true }), [], '568x320: it scrolls, nothing overlaps');
      await a.p.setViewportSize({ width: 667, height: 375 }); await a.p.waitForTimeout(300);
      // Six: two AIs go; three against three.
      await sheet(a, 3, ['remove'], false);
      await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 7);
      await sheet(a, 6, ['remove'], false);
      await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 6);
      assert.deepEqual(await sides(a), [['YOU', 'AI 1', 'AI 2'], ['Bo', 'AI 3', 'AI 4']]);
      assert.deepEqual(await a.p.$$eval('#onlineMaps .map .up', bs => bs.map(x => x.textContent)), Array(4).fill('up to 8'), 'six on the 128x128 maps: two starts stay free');
      assert.deepEqual(await fits(a), [], 'six seats fit');
      await a.p.waitForFunction(() => /Ready when you are/.test(document.getElementById('onlineStatus').textContent));
      await a.tap('#btnOnlineReady'); await b.tap('#btnOnlineReady');
      for (const x of [a, b]) await x.p.waitForFunction(() => endfall.online.playing && endfall.G.tick > 240, null, { timeout: 60000 });
      const setup = await b.p.evaluate(() => [endfall.online.setup.ai, endfall.online.setup.teams, endfall.engine.MW, endfall.G.factions.length, endfall.G.me]);
      assert.deepEqual(setup, [[0, 1, 1, 0, 1, 1], [0, 0, 0, 1, 1, 1], 128, 6, 3], 'six seats on 128x128, three against three, four AIs');
      const trail = (x) => x.p.evaluate(() => [...endfall.online.net.trail]);
      const [ta, tb] = [new Map(await trail(a)), new Map(await trail(b))];
      const common = [...ta.keys()].filter(t => tb.has(t));
      assert.ok(common.length > 40, `both ran the same stretch (${common.length} ticks in common)`);
      for (const t of common) assert.equal(ta.get(t), tb.get(t), `the same world at tick ${t}`);
      assert.ok(await a.p.evaluate(() => [1, 2, 4, 5].every(t => endfall.G.stats[t].built > 0 || endfall.G.bldgs.some(b => b.team === t && b.queue.length > 0))), 'the AIs play');
      assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
    } finally { await b.ctx.close(); }
  } finally { await a.ctx.close(); }
});

test('a room of another version: the friend is told to update, and UPDATE brings them back to the room', async () => {
  const { WebSocket } = await import('ws');
  const host = new WebSocket(`ws://localhost:${relay.port}/?new=1`);
  const told = [];
  const code = await new Promise((res, rej) => {
    host.on('open', () => host.send(JSON.stringify({ proto: PROTO, name: 'Old', build: '000000000000' })));
    host.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'seat') res(m.room); if (m.t === 'notice') told.push(m.code); });
    host.on('error', rej);
  });
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
  const b = await joinByLink(PHONE, `${relayQ}&join=${code}`, 'Bo');
  try {
    await b.p.locator('#btnOnlineReload').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await b.p.locator('#onlineStatus').textContent(), "Your Ebbfall and your friend's don't match. Tap UPDATE, then JOIN again");
    assert.equal(await b.p.locator('#btnOnlineReload').textContent(), 'UPDATE');
    assert.ok(await b.p.locator('#onlineJoin').isVisible(), 'the code box is back, to try another room');
    for (let i = 0; i < 50 && !told.length; i++) await new Promise(r => setTimeout(r, 100)); // (the host's notice may land a moment after the friend's error)
    assert.deepEqual(told, ['version'], 'the room is told too (its player may be the one behind)');
    await Promise.all([b.p.waitForNavigation(), b.tap('#btnOnlineReload')]);
    await b.p.waitForFunction(() => !!window.endfall);
    assert.equal(await b.p.locator('#roomCode').inputValue(), code, 'back at the same room\'s invitation');
    assert.equal(await b.p.locator('#onlineStatus').textContent(), `You're invited to room ${code}: tap JOIN`, 'a name remembered: one tap');
    assert.equal(await b.p.locator('#onlineName').inputValue(), 'Bo', 'the name remembered');
    await b.tap('#btnJoinRoom');
    await b.p.locator('#btnOnlineReload').waitFor({ state: 'visible', timeout: 10000 }); // (the same room again: still another version)
    assert.deepEqual(b.errors, []);
  } finally { host.close(); await b.ctx.close(); }
});

test('a rematch: both ask from the end card, both are back in the room, ready, and play again in lockstep', async () => {
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
  const a = await page(DESKTOP, relayQ);
  try {
    await a.tap('#btnOnline'); await a.tap('#btnNewRoom');
    await a.p.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomShow').textContent));
    const code = await a.p.locator('#roomShow').textContent();
    const b = await joinByLink(PHONE, `${relayQ}&join=${code}`, 'Bo');
    try {
      await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 2 && !/AWAY|OPEN SEAT/.test(document.getElementById('onlineBoard').textContent));
      const asked = () => Promise.all([a, b].map(x => x.p.evaluate(() => window.fsAsked)));
      assert.deepEqual(await asked(), [0, 0], 'NEW ROOM and JOIN stay out of full screen (the link is shared from another app)');
      await a.tap('#btnOnlineReady'); await b.tap('#btnOnlineReady');
      assert.deepEqual(await asked(), [1, 1], 'READY goes full screen: the game starts in it');
      for (const x of [a, b]) await x.p.waitForFunction(() => endfall.online.playing && endfall.G.tick > 30, null, { timeout: 20000 });
      const seed1 = await a.p.evaluate(() => endfall.online.setup.seed);
      // The game ends without anyone leaving: Ann gives in through the sim (set-up: the rematch is what is tested).
      await a.p.evaluate(() => endfall.engine.concede());
      for (const x of [a, b]) await x.p.locator('#end').waitFor({ state: 'visible', timeout: 15000 });
      assert.equal(await b.p.locator('#result').textContent(), 'VICTORY');
      assert.ok(await a.p.locator('#btnRematch').isVisible() && await b.p.locator('#btnRematch').isVisible(), 'REMATCH online');
      await a.tap('#btnRematch');
      assert.equal(await a.p.locator('#btnRematch').textContent(), 'WAITING…');
      await b.p.waitForFunction(() => document.getElementById('btnRematch').textContent === 'REMATCH?', null, { timeout: 5000 });
      await b.p.waitForTimeout(4000); // (on the end card a while: nobody may be taken for away meanwhile)
      assert.equal(relay.rooms.get(code).phase, 'over', 'both games told the relay they ended: its clock stopped');
      assert.ok(relay.rooms.get(code).seats.every(s => !s.awaySince && s.conn), 'both still here on the end card');
      await b.tap('#btnRematch');
      for (const x of [a, b]) {
        await x.p.locator('#onlineRoom').waitFor({ state: 'visible', timeout: 10000 });
        assert.ok(await x.p.locator('#end').isHidden(), 'from the end card to the room');
        assert.equal(await x.p.locator('#roomShow').textContent(), code, 'the same room');
      }
      await a.tap('#btnOnlineReady'); await b.tap('#btnOnlineReady');
      for (const x of [a, b]) await x.p.waitForFunction(() => endfall.online.playing && !endfall.G.over && endfall.G.tick > 30, null, { timeout: 20000 });
      assert.notEqual(await a.p.evaluate(() => endfall.online.setup.seed), seed1, 'a new game');
      await a.p.waitForTimeout(2000);
      const trail = (x) => x.p.evaluate(() => [...endfall.online.net.trail]);
      const [ta, tb] = [new Map(await trail(a)), new Map(await trail(b))];
      const common = [...ta.keys()].filter(t => tb.has(t));
      assert.ok(common.length > 30, `both ran the new game (${common.length} ticks in common)`);
      for (const t of common) assert.equal(ta.get(t), tb.get(t), `the same world at tick ${t}`);
      assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
    } finally { await b.ctx.close(); }
  } finally { await a.ctx.close(); }
});

test('the pause card online: a menu over a game that goes on; a pause for everyone, which only its caller ends; leaving and the end card name the friend', async () => {
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
  const a = await page(DESKTOP, relayQ);
  try {
    await a.tap('#btnOnline'); await a.p.locator('#onlineName').fill('Ann'); await a.tap('#btnNewRoom');
    await a.p.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomShow').textContent));
    const code = await a.p.locator('#roomShow').textContent();
    const b = await joinByLink({ ...PHONE, viewport: { width: 667, height: 375 } }, `${relayQ}&join=${code}`, 'Bo');
    try {
      await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 2 && !/AWAY|OPEN SEAT/.test(document.getElementById('onlineBoard').textContent));
      await a.tap('#btnOnlineReady'); await b.tap('#btnOnlineReady');
      for (const x of [a, b]) await x.p.waitForFunction(() => endfall.online.playing && endfall.G.tick > 30, null, { timeout: 20000 });
      const ticks = () => Promise.all([a, b].map(x => x.p.evaluate(() => endfall.G.tick)));
      const runs = async (what) => { const t = await ticks(); await a.p.waitForTimeout(800); const u = await ticks(); assert.ok(u[0] > t[0] && u[1] > t[1], `${what}: ${t} -> ${u}`); };
      const stands = async (what) => { await a.p.waitForTimeout(500); const t = await ticks(); await a.p.waitForTimeout(1000); assert.deepEqual(await ticks(), t, what); };
      const card = (x) => x.p.evaluate(() => ({
        open: !document.getElementById('pause').hidden, h: document.querySelector('#pause h2').textContent, line: document.getElementById('pauseTime').textContent,
        buttons: [...document.querySelectorAll('#pause .pausegrid button')].filter(b => !b.hidden).map(b => (b.disabled ? '(' + b.textContent + ')' : b.textContent)),
      }));
      // The friend plays full screen (stood in for): a pause Ann calls must leave it so.
      await b.p.evaluate(() => {
        for (const k of ['fullscreenElement', 'webkitFullscreenElement']) Object.defineProperty(document, k, { configurable: true, get: () => (window.fs ? document.documentElement : null) });
        document.exitFullscreen = async () => { window.fs = false; window.fsOut = (window.fsOut || 0) + 1; };
        window.fs = true; window.fsAsked = 0;
      });
      // Ann opens the card: a menu; the game goes on in both.
      await a.tap('#btnPause');
      let c = await card(a);
      assert.equal(c.h, 'Menu');
      assert.match(c.line, /^\d+:\d\d in\. The game goes on while this is open\.$/);
      assert.deepEqual(c.buttons, ['BACK TO GAME', 'HOW TO PLAY', 'PAUSE FOR EVERYONE3 left', 'LEAVE GAME'], 'no RESTART online; a pause for everyone, with the pauses left');
      assert.equal(await a.p.locator('#btnQuit').getAttribute('title'), 'Back to the menu: Bo wins');
      assert.equal((await card(b)).open, false, 'the friend\'s screen is untouched');
      await runs('the game goes on under the menu');
      // The friend's phone sleeps (its socket gone); Ann pauses for everyone meanwhile.
      await b.p.evaluate(() => { const n = endfall.online.net; n._open = n.open; n.open = () => {}; n.ws.close(); });
      await a.tap('#btnPauseAll');
      await a.p.waitForFunction(() => /^You paused · [45]:\d\d left$/.test(document.getElementById('pauseTime').textContent), null, { timeout: 5000 });
      c = await card(a);
      assert.deepEqual([c.h, c.buttons], ['Paused', ['RESUME', 'HOW TO PLAY', 'LEAVE GAME']], 'the one who paused: RESUME; no second pause');
      await a.p.waitForTimeout(3500); // (the friend is away by now: the pause says it all, nobody is "waited for")
      assert.ok(await a.p.locator('#netWait').isHidden(), 'no "Waiting for" over a pause');
      // Back: the friend is told of the pause, and shown it, with its time running down.
      await b.p.evaluate(() => { const n = endfall.online.net; n.open = n._open; n.open(); });
      await b.p.waitForFunction(() => !document.getElementById('pause').hidden, null, { timeout: 8000 });
      c = await card(b);
      assert.equal(c.h, 'Paused');
      assert.match(c.line, /^Paused by Ann · [45]:\d\d left$/);
      assert.deepEqual(c.buttons, ["(ANN'S PAUSE)", 'HOW TO PLAY', 'LEAVE GAME'], 'the others: whose pause it is, greyed; no RESUME');
      const sc = await b.p.locator('#pause .card').evaluate(e => [e.scrollHeight, e.clientHeight]);
      assert.ok(sc[0] <= sc[1] + 1, `fits a small phone: ${sc}`);
      await stands('both games stand still');
      // The friend cannot end it: not with the keys, not even by asking the relay.
      await b.p.keyboard.press('Escape'); await b.p.keyboard.press('p');
      await b.p.evaluate(() => endfall.online.net.resume());
      assert.equal((await card(b)).open, true, 'the card stays');
      await stands('still paused');
      // Ann resumes: the game runs again in both, the same world; the friend's card goes (it opened by itself).
      await a.tap('#btnResume');
      for (const x of [a, b]) await x.p.locator('#pause').waitFor({ state: 'hidden', timeout: 5000 });
      await b.p.waitForFunction(() => [...document.querySelectorAll('#msg .toast')].some(t => t.textContent === 'Back to the game'), null, { timeout: 3000 });
      await runs('both run again');
      assert.deepEqual(await b.p.evaluate(() => [window.fs, window.fsOut || 0, window.fsAsked]), [true, 0, 0], 'Ann\'s pause left the friend\'s full screen alone');
      const trail = (x) => x.p.evaluate(() => [...endfall.online.net.trail]);
      const [ta, tb] = [new Map(await trail(a)), new Map(await trail(b))];
      const common = [...ta.keys()].filter(t => tb.has(t));
      assert.ok(common.length > 20, `both ran on (${common.length} ticks in common)`);
      for (const t of common) assert.equal(ta.get(t), tb.get(t), `the same world at tick ${t}`);
      // One pause fewer for Ann; the friend still has all three.
      await a.tap('#btnPause');
      assert.ok((await card(a)).buttons.includes('PAUSE FOR EVERYONE2 left'));
      await a.tap('#btnResume');
      await b.tap('#btnPause');
      assert.ok((await card(b)).buttons.includes('PAUSE FOR EVERYONE3 left'));
      await b.tap('#btnResume');
      // The back gesture's dialog: the game goes on, and who wins if you leave.
      await a.p.evaluate(() => history.back());
      await a.p.locator('#leave').waitFor({ state: 'visible', timeout: 5000 });
      assert.equal(await a.p.locator('#leaveSub').textContent(), 'The game goes on. If you leave, Bo wins.');
      await a.tap('#btnStay');
      // The end card names the friend's army, leaves the room (no NEW GAME), and a rematch asked can be taken back.
      await a.p.evaluate(() => endfall.engine.concede()); // (set-up: the end card is what is tested)
      for (const x of [a, b]) await x.p.locator('#end').waitFor({ state: 'visible', timeout: 15000 });
      assert.deepEqual(await b.p.evaluate(() => [document.getElementById('btnAgain').textContent, document.querySelector('#endKey .foe').textContent]), ['LEAVE ROOM', "Ann's army"]);
      await b.tap('#btnRematch');
      assert.equal(await b.p.locator('#btnRematch').getAttribute('title'), 'Tap again to take it back');
      await a.p.waitForFunction(() => [...document.querySelectorAll('#msg .toast')].some(t => t.textContent === 'Bo wants a rematch'), null, { timeout: 5000 });
      assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
    } finally { await b.ctx.close(); }
  } finally { await a.ctx.close(); }
});

// The host switching apps to send the code (the lobby hold): the room keeps the host's seat, the friend sees it AWAY and
// takes the next one, the host comes back to it.
test('the host switches apps to send the code: the room holds its seat, the friend joins the next one, the host comes back to it', async () => {
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
  const a = await page(PHONE, relayQ);
  try {
    await a.tap('#btnOnline'); await a.p.locator('#onlineName').fill('Ann'); await a.tap('#btnNewRoom');
    await a.p.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomShow').textContent));
    const code = await a.p.locator('#roomShow').textContent();
    const b = await page(DESKTOP, `${relayQ}&join=${code}`);
    try {
      // Ann's phone kills the page's socket, and every try to reconnect fails for a while (past the lobby's few tries).
      await a.p.evaluate(() => {
        const n = endfall.online.net, until = Date.now() + 6000, open = n.open;
        window.tries = 0;
        n.open = function () { if (Date.now() < until) { window.tries++; this.ws = null; this.dropped(); } else open.call(this); };
        n.ws.close();
      });
      await a.p.waitForFunction(() => document.getElementById('onlineStatus').textContent === 'Reconnecting…', null, { timeout: 5000 });
      for (let i = 0; i < 50 && relay.rooms.get(code).seats[0].conn; i++) await new Promise(r => setTimeout(r, 100));
      assert.equal(relay.rooms.get(code).seats[0].conn, null, "the relay saw Ann's socket go");
      // The friend joins by the link: Ann's seat is Ann's, AWAY; the friend takes the next one and waits for her.
      await b.p.locator('#onlineName').fill('Bo'); await b.tap('#btnJoinRoom');
      await b.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 2 && /YOU/.test(document.getElementById('onlineBoard').textContent));
      assert.equal(await b.p.evaluate(() => endfall.online.seat), 1, 'the friend sits in the second seat');
      const seatsB = () => b.p.$$eval('#onlineBoard .tok', ts => ts.map(t => t.getAttribute('aria-label')));
      assert.deepEqual(await seatsB(), ['YOU HUMANS, Your side: edit', 'Ann AWAY, host, Enemies'], 'Ann away, not an open seat');
      assert.equal(await b.p.locator('#onlineStatus').textContent(), 'Waiting for Ann…');
      assert.equal(await b.p.locator('#onlineMapNote').textContent(), "Ann's pick", 'Ann still picks');
      // Ann's page reconnects by itself (no wake): her seat, the same room; both see each other.
      await a.p.waitForFunction(() => /Bo/.test(document.getElementById('onlineBoard').textContent), null, { timeout: 15000 });
      assert.ok(await a.p.evaluate(() => window.tries) >= 4, 'it kept trying past the lobby\'s few tries (four: a Net with no seat gives up there)');
      assert.deepEqual(await a.p.evaluate(() => [endfall.online.seat, document.getElementById('roomShow').textContent, document.getElementById('onlineMapNote').textContent, endfall.online.net.closed]), [0, code, '', false], 'Ann: seat 0, the same code, the host');
      await b.p.waitForFunction(() => !/AWAY/.test(document.getElementById('onlineBoard').textContent), null, { timeout: 5000 });
      assert.deepEqual(await seatsB(), ['YOU HUMANS, Your side: edit', 'Ann HUMANS, host, Enemies']);
      for (const x of [a, b]) assert.equal(await x.p.locator('#onlineStatus').textContent(), 'Ready when you are');
      // And the room plays: both ready, the game starts, Ann the first seat.
      await a.tap('#btnOnlineReady'); await b.tap('#btnOnlineReady');
      for (const x of [a, b]) await x.p.waitForFunction(() => endfall.online.playing && endfall.G.tick > 30, null, { timeout: 20000 });
      assert.deepEqual(await Promise.all([a, b].map(x => x.p.evaluate(() => endfall.G.me))), [0, 1]);
      assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
    } finally { await b.ctx.close(); }
  } finally { await a.ctx.close(); }
});

// The friend comes back on another browser (the link opened in a messaging app, then in Chrome): no token, so the host
// frees the seat kept for the friend (× on the AWAY seat), and the friend sits again.
test('a friend back on another browser: the host frees the AWAY seat with ×, and the friend sits again', async () => {
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
  const a = await page(DESKTOP, relayQ);
  try {
    await a.tap('#btnOnline'); await a.p.locator('#onlineName').fill('Ann'); await a.tap('#btnNewRoom');
    await a.p.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomShow').textContent));
    const code = await a.p.locator('#roomShow').textContent();
    const b = await joinByLink(PHONE, `${relayQ}&join=${code}`, 'Bo');
    try {
      await a.p.waitForFunction(() => /Bo/.test(document.getElementById('onlineBoard').textContent));
      await b.p.evaluate(() => { const n = endfall.online.net; n.open = () => {}; n.ws.close(); }); // (the in-app browser, left for good)
      await a.p.locator('#onlineBoard [data-k="free1"]').waitFor({ state: 'visible', timeout: 5000 });
      assert.match(await a.p.locator('#onlineBoard [data-k="tok1"]').getAttribute('aria-label'), /^Bo AWAY, Enemies/, 'the host sees Bo AWAY, and a × to free the seat');
      assert.equal(await a.p.locator('#onlineBoard [data-k="free1"]').getAttribute('aria-label'), "Free Bo's seat");
      assert.equal(await a.p.locator('#onlineStatus').textContent(), 'Waiting for Bo…');
      const c = await joinByLink(PHONE, `${relayQ}&join=${code}`, 'Bo');
      try {
        await c.p.waitForFunction(() => /kept a few minutes/.test(document.getElementById('onlineStatus').textContent), null, { timeout: 5000 });
        assert.equal(await c.p.locator('#onlineStatus').textContent(), 'That room is full: a seat is kept a few minutes for a player who stepped away');
        await a.tap('#onlineBoard [data-k="free1"]');
        await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok.open').length === 1, null, { timeout: 5000 });
        await c.tap('#btnJoinRoom');
        await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 2 && !/AWAY|OPEN SEAT/.test(document.getElementById('onlineBoard').textContent), null, { timeout: 5000 });
        await c.p.waitForFunction(() => endfall.online.seat === 1, null, { timeout: 5000 }); // (Bo sits again, in the second seat)
        assert.deepEqual(a.errors, []); assert.deepEqual(c.errors, []);
      } finally { await c.ctx.close(); }
    } finally { await b.ctx.close(); }
  } finally { await a.ctx.close(); }
});

test('a relay of a newer protocol: UPDATE is offered (not a dead end)', async () => {
  const { WebSocketServer } = await import('ws');
  const wss = new WebSocketServer({ port: 0 }); await new Promise(r => wss.on('listening', r));
  wss.on('connection', (ws) => ws.on('message', () => ws.send(JSON.stringify({ t: 'error', code: 'update', msg: 'Ebbfall has an update. Tap UPDATE to get it' }))));
  const b = await joinByLink(PHONE, `relay=${encodeURIComponent(`ws://localhost:${wss.address().port}/`)}&join=ABCD`, 'Bo');
  try {
    await b.p.locator('#btnOnlineReload').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await b.p.locator('#onlineStatus').textContent(), 'Ebbfall has an update. Tap UPDATE to get it');
    assert.equal(await b.p.locator('#btnOnlineReload').textContent(), 'UPDATE');
  } finally { await b.ctx.close(); }
  // Opening a room (no code yet): UPDATE comes back to the multiplayer page, not the first page.
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${wss.address().port}/`)}`;
  const c = await page(PHONE, relayQ);
  try {
    await c.tap('#btnOnline'); await c.tap('#btnNewRoom');
    await c.p.locator('#btnOnlineReload').waitFor({ state: 'visible', timeout: 10000 });
    await Promise.all([c.p.waitForNavigation(), c.tap('#btnOnlineReload')]);
    await c.p.waitForFunction(() => !!window.endfall);
    assert.ok(await c.p.locator('#online').isVisible() && await c.p.locator('#onlineJoin').isVisible(), 'back on the multiplayer page');
    assert.ok(!/online=/.test(c.p.url()), 'and the address is clean');
  } finally { await c.ctx.close(); wss.close(); }
});

test('READY waits for the game to load; a seat that never loads holds the room up until it gives up, then the others play on', async () => {
  const { default: WebSocket } = await import('ws');
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
  const a = await page(DESKTOP, relayQ);
  const cb = await browserContext(DESKTOP), b = await cb.newPage(), errors = [];
  b.on('pageerror', e => errors.push(e.message));
  let release = () => {}, c = null;
  try {
    await a.tap('#btnOnline'); await a.p.locator('#onlineName').fill('Ann'); await a.tap('#btnNewRoom');
    await a.p.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomShow').textContent));
    const code = await a.p.locator('#roomShow').textContent();
    await a.tap('#onlineBoard [data-k="seat1"]'); // (+ SEAT: an open seat more on the other side)
    await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 3);
    // The friend's game still loading (its WASM and art held back): READY says so and takes no tap.
    const held = new Promise(r => { release = r; });
    await b.route(/\.wasm$|\/art\//, async (r) => { await held; await r.continue().catch(() => {}); });
    await b.goto(`${baseUrl()}?${relayQ}&join=${code}`, { waitUntil: 'domcontentloaded' });
    await b.locator('#onlineJoin').waitFor({ state: 'visible' });
    await b.locator('#onlineName').fill('Bo'); await b.locator('#btnJoinRoom').click();
    await b.locator('#btnOnlineReady').waitFor({ state: 'visible' });
    assert.equal(await b.locator('#btnOnlineReady').textContent(), 'LOADING…', 'READY waits for the game');
    assert.ok(await b.locator('#btnOnlineReady').isDisabled());
    // A third seat by the protocol alone: a tab that readies, then never loads its game (it died, or it is very slow).
    const build = await a.p.locator('#buildId').textContent();
    c = new WebSocket(`ws://localhost:${relay.port}/?room=${code}`);
    await new Promise((r, j) => { c.once('open', r); c.once('error', j); });
    c.send(JSON.stringify({ proto: PROTO, name: 'Cy', build }));
    await a.p.waitForFunction(() => /Cy/.test(document.getElementById('onlineBoard').textContent));
    c.send(JSON.stringify({ t: 'ready', ready: true }));
    await a.tap('#btnOnlineReady');
    await a.p.waitForTimeout(300);
    assert.equal(relay.rooms.get(code).phase, 'lobby', 'no start while the friend cannot be ready');
    release();
    await b.locator('#btnOnlineReady:not([disabled])', { hasText: /^READY$/ }).waitFor({ timeout: 60000 });
    await b.locator('#btnOnlineReady').click();
    // Started: both games set up, the relay's clock waits for Cy's, and says so by name.
    for (const p of [a.p, b]) await p.waitForFunction(() => !document.getElementById('netWait').hidden && /Waiting for Cy to load…/.test(document.getElementById('netWait').textContent), null, { timeout: 15000, polling: 250 });
    assert.ok(await a.p.evaluate(() => endfall.G.tick) <= 6, 'the clock waits');
    // Cy gives up (BACK after the start: a leave): conceded, and the others play on.
    c.send(JSON.stringify({ t: 'leave' })); c.close();
    for (const p of [a.p, b]) await p.waitForFunction(() => endfall.online.playing && endfall.G.tick > 150, null, { timeout: 30000, polling: 250 });
    await a.p.locator('#netWait').waitFor({ state: 'hidden', timeout: 10000 }); // (nobody waited for any more; a busy test machine may keep a page from acking a moment)
    assert.deepEqual(a.errors, []); assert.deepEqual(errors, []);
  } finally { release(); c?.close(); await cb.close(); await a.ctx.close(); }
});

test('a rejoin whose game cannot load keeps its seat; one while it loads finds the room\'s news kept (a pause, a seat gone)', async () => {
  const { default: WebSocket } = await import('ws');
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
  const a = await page(DESKTOP, relayQ);
  let c = null, release = () => {};
  try {
    await a.tap('#btnOnline'); await a.p.locator('#onlineName').fill('Ann'); await a.tap('#btnNewRoom');
    await a.p.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomShow').textContent));
    const code = await a.p.locator('#roomShow').textContent();
    await a.tap('#onlineBoard [data-k="seat1"]'); // (+ SEAT: an open seat more on the other side)
    await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 3);
    const b = await joinByLink({ ...DESKTOP, serviceWorkers: 'block' }, `${relayQ}&join=${code}`, 'Bo'); // (a service worker would serve the game past the routes below)
    // (seats by name: whoever's hello comes first sits first)
    const seat = (n) => relay.rooms.get(code).seats.findIndex(s => s.name === n), bo = () => relay.rooms.get(code).seats[seat('Bo')];
    try {
      await a.p.waitForFunction(() => /Bo/.test(document.getElementById('onlineBoard').textContent));
      // A third seat by the protocol alone, which gives the game up before it has loaded: a seat gone.
      c = new WebSocket(`ws://localhost:${relay.port}/?room=${code}`);
      await new Promise((r, j) => { c.once('open', r); c.once('error', j); });
      c.send(JSON.stringify({ proto: PROTO, name: 'Cy', build: await a.p.locator('#buildId').textContent() }));
      await a.p.waitForFunction(() => /Cy/.test(document.getElementById('onlineBoard').textContent));
      c.send(JSON.stringify({ t: 'ready', ready: true })); await a.tap('#btnOnlineReady'); await b.tap('#btnOnlineReady');
      await a.p.waitForFunction(() => endfall.online.playing, null, { polling: 250 });
      c.send(JSON.stringify({ t: 'leave' })); c.close();
      for (const x of [a, b]) await x.p.waitForFunction(() => endfall.G.tick > 30, null, { timeout: 20000, polling: 250 });
      // Ann pauses for everyone.
      await a.tap('#btnPause'); await a.tap('#btnPauseAll');
      await a.p.waitForFunction(() => /^You paused/.test(document.getElementById('pauseTime').textContent), null, { timeout: 5000 });
      // Bo reloads into the room, but the game cannot load (its chunk refused): the seat is kept, not given up.
      await b.p.route(/assets\/main-[^/]*\.js$/, r => r.abort());
      await b.p.goto(`${baseUrl()}?${relayQ}&join=${code}`, { waitUntil: 'domcontentloaded' });
      await b.p.locator('#onlineJoin').waitFor({ state: 'visible' }); await b.p.locator('#btnJoinRoom').click();
      await b.p.waitForFunction(() => /could not load/.test(document.getElementById('onlineStatus').textContent), null, { timeout: 15000, polling: 250 });
      assert.equal(await b.p.locator('#btnOnlineReady').textContent(), 'RELOAD');
      assert.ok(!bo().left, 'the seat is not given up');
      assert.ok(await b.p.evaluate((k) => !!sessionStorage.getItem(`endfall.seat.${k}`), code), 'and its token is kept');
      // RELOAD, the game loading slowly this time: the room's news (the pause, Cy gone) arrives meanwhile, and is kept.
      await b.p.unroute(/assets\/main-[^/]*\.js$/);
      const held = new Promise(r => { release = r; });
      await b.p.route(/assets\/main-[^/]*\.js$/, async (r) => { await held; await r.continue().catch(() => {}); });
      await Promise.all([b.p.waitForNavigation(), b.p.locator('#btnOnlineReady').click()]);
      await b.p.locator('#onlineJoin').waitFor({ state: 'visible' }); await b.p.locator('#btnJoinRoom').click();
      await b.p.waitForTimeout(1500); // (the start, Cy's leave and the pause, told while the game loads)
      release();
      await b.p.waitForFunction(() => window.endfall && endfall.online.playing && !document.getElementById('pause').hidden, null, { timeout: 60000, polling: 250 });
      assert.equal(await b.p.locator('#pause h2').textContent(), 'Paused', 'the pause, on its card');
      assert.deepEqual(await b.p.evaluate(() => [...endfall.online.gone]), [seat('Cy')], 'Cy gone');
      assert.equal(bo().left, false, 'still in the game');
      await a.tap('#btnResume');
      for (const x of [a, b]) { const t = await x.p.evaluate(() => endfall.G.tick); await x.p.waitForFunction((t0) => endfall.G.tick > t0 + 30, t, { timeout: 30000, polling: 250 }); }
    } finally { release(); await b.ctx.close(); }
  } finally { c?.close(); await a.ctx.close(); }
});

test('a small phone: the room fits without scrolling, its code the title, its sound icon in the corner', async () => {
  const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
  const a = await page({ ...PHONE, viewport: { width: 667, height: 375 } }, relayQ);
  try {
    await a.tap('#btnOnline');
    assert.equal(await a.p.locator('#onlineJoin h2').textContent(), 'MULTIPLAYER', 'one name: the button\'s and the page\'s');
    assert.equal(await a.p.locator('#online .card').getAttribute('aria-label'), 'Multiplayer');
    await a.p.locator('#onlineName').fill('Ann'); await a.tap('#btnNewRoom');
    await a.p.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomShow').textContent));
    assert.ok(await a.p.locator('#onlineJoin h2').isHidden(), 'in the room, its code is the title');
    assert.deepEqual(await fits(a), []);
    assert.ok((await a.p.locator('#roomShow').boundingBox()).y >= 0, 'its title in view');
    assert.ok(await a.p.locator('#btnOnlineReady').isVisible() && await a.p.locator('#btnLobbySound').isVisible());
    assert.deepEqual(a.errors, []);
  } finally { await a.ctx.close(); }
});
