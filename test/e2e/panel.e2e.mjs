// The details panel of a command button (hover, src/client/card.js) keeps its size whether its price can be paid and its
// grid is there or not: with a mouse the longest of what it may say is short has its room kept, unseen, one said at a
// time (the grid, then the money). On a touch screen no room is kept.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, DESKTOP, PHONE, CDP_TOUCH } from './harness.mjs';

before(start);
after(stop);

/** In the page: raise every building of our people (a scene: placed beside the headquarters by a worker, the game
 *  stepped until each stands; another headquarters, and a kind one may not place now, are left out). */
const raiseAll = () => {
  const { G, engine: E } = endfall, f = E.FACTIONS[G.factions[0]], hq = G.bldgs.find(b => b.team === 0 && b.type === f.hq);
  const kinds = [...f.buildBasic, ...f.buildAdvanced].filter(k => k !== f.hq);
  const up = (k) => G.bldgs.some(b => b.team === 0 && b.type === k && b.done);
  for (let pass = 0; pass < 6; pass++) for (const k of kinds) {
    const req = E.BUILDINGS[k].req;
    if (up(k) || (req && !up(req))) continue;
    const worker = G.units.find(u => u.team === 0 && u.d.worker && !u.inside);
    endfall.setResources(0, 5000, 0);
    let placed = false;
    for (let r = 4; r < 18 && !placed; r++) for (let dx = -r; dx <= r && !placed; dx++) for (const dy of [-r, r]) {
      const tx = Math.floor(hq.x / 32) + dx, ty = Math.floor(hq.y / 32) + dy;
      if (!placed && E.canPlace(k, tx, ty, 0)) placed = E.placeBuilding(0, k, tx, ty, worker) === null;
    }
    for (let t = 0; t < 180 && placed && !up(k); t++) endfall.skip(1);
  }
  return kinds.filter(k => !up(k));
};
/** In the page: the panel as it is now: its box, and whether the words of what is short are seen. */
const PANEL = `() => {
  const el = document.getElementById('cmdInfo'), r = el.getBoundingClientRect(), s = el.querySelector('.short'), cs = s && getComputedStyle(s);
  return { box: [r.left, r.top, r.width, r.height].map(v => Math.round(v * 100) / 100), hidden: el.hidden, label: el.querySelector('b')?.textContent,
    short: !!s && cs.visibility === 'visible' && cs.display !== 'none', words: [...(s?.children || [])].filter(c => getComputedStyle(c).visibility === 'visible' && getComputedStyle(c).display !== 'none').map(c => c.textContent).join('|') };
}`;
/** The states a button is read in: the money, and for the Expedition the grid (free, full, one place left, full at its
 *  maximum). The first and the last are the same: nothing short. */
const STATES = { humans: [[5000], [0], [5000]], vael: [[5000, 'free'], [0, 'free'], [5000, 'full'], [0, 'full'], [5000, 'one'], [0, 'one'], [5000, 'max'], [5000, 'free']] };
/** What a button says is short in a state (of `takes` places, a unit): the grid first, then the money ('$'), one alone. */
const says = ([gold, grid], takes) => (takes && grid === 'max' ? 'Grid at maximum.' : takes && (grid === 'full' || (grid === 'one' && takes > 1)) ? 'Needs grid: build a Substation.' : gold ? '' : '$');
/** In the page: every priced button of every card (each building's, a worker's two Build pages) with its panel in each of
 *  `states`: the mouse's enter and leave sent to each button of a card built once for each, all in one call (the page
 *  draws nothing between). The HUD alone is redrawn (`endfall.hud`), never the map: a hundred frames queued here on
 *  software WebGL kept the page busy for half a minute after the call (the hover after it timed out on CI). { id: [a panel a state] }, each with the button's own label as `want`, its title and the
 *  places it takes (a unit). */
const everyPanel = (states) => `(() => {
  const panel = ${PANEL}, { G, ui, engine: E } = endfall, out = {}, states = ${JSON.stringify(states)};
  const enter = (b, type) => b.dispatchEvent(new PointerEvent(type, { pointerType: 'mouse' }));
  const cards = [...G.bldgs.filter(b => b.team === 0 && b.done).map(b => [b, null]), ...['build', 'build2'].map(m => [G.units.find(u => u.team === 0 && u.d.worker && !u.inside), m])];
  for (const [e, mode] of cards) for (const [gold, grid] of states) {
    ui.place = null; ui.mode = mode; ui.sel = [e]; endfall.setResources(0, gold, 0);
    const max = E.supMax(); // (the page's copy of the grid set, after the copy of the gold: read again at the next step)
    if (grid) G.sup[0] = { free: [0, 24], full: [24, 24], one: [23, 24], max: [max, max] }[grid];
    endfall.hud();
    for (const it of endfall.cardItems()) {
      if (!it.cost || it.hidden || out[it.id]?.length === states.length) continue;
      const b = document.querySelector('#cmd [data-id="' + it.id + '"]');
      const title = b.title; // (emptied while the panel shows)
      enter(b, 'pointerenter'); (out[it.id] ||= []).push({ ...panel(), want: it.label, title, takes: it.id.startsWith('t_') ? E.takes(it.id.slice(2)) : 0 }); enter(b, 'pointerleave');
    }
  }
  ui.sel = []; ui.mode = null;
  return out;
})()`;

for (const race of ['humans', 'vael']) {
  test(`${race}, with a mouse: the details panel of every unit, building and research has one size, whether it can be paid or not and its grid is there or not, in three windows; one thing said at a time`, { timeout: 240000 }, async () => {
    // (half the pixels each way: what is measured is the layout, and software WebGL draws a 1920 px window slowly)
    const d = await newGame({ ...DESKTOP, deviceScaleFactor: 0.5 }, 1, 4242, { ai: false, race });
    try {
      assert.deepEqual(await d.eval(raiseAll), [], 'every building stands');
      const want = await d.eval(() => { const { G, engine: E } = endfall, f = E.FACTIONS[G.factions[0]], b = [...new Set([...f.buildBasic, ...f.buildAdvanced])]; return [...b.map(k => 'b_' + k), ...new Set(b.flatMap(k => (E.BUILDINGS[k].trains || []).map(t => 't_' + t)))].sort(); });
      const moved = [], money = race === 'vael' ? 'energy' : 'gold', same = (p, q) => p.box.join() === q.box.join();
      const check = (id, panels, states = STATES[race]) => {
        assert.equal(panels.length, states.length, `${id}: read in every state`);
        assert.ok(panels.every(p => !p.hidden && p.label === p.want), `${id}: its panel shows in each state: ${JSON.stringify(panels)}`);
        for (const [i, p] of panels.entries()) {
          const want = says(states[i], race === 'vael' ? p.takes : 0);
          assert.match(p.words, want === '$' ? new RegExp(`^Not enough ${money} \\(needs \\d+\\)\\.$`) : new RegExp(`^${want.replaceAll('.', '\\.')}$`), `${id}, ${states[i]}: what is short, one thing`);
          assert.equal(p.short, want !== '', `${id}, ${states[i]}: seen only while it is short`);
          if (p.title != null) assert.equal(/(Not enough|Needs grid|Grid at).*$/.exec(p.title)?.[0] ?? '', p.words, `${id}, ${states[i]}: the title says the same one: ${p.title}`);
        }
        assert.ok(panels[0].box[0] >= 0 && panels[0].box[1] >= 0, `${id}: on the screen: ${panels[0].box}`);
        return panels.every(p => same(panels[0], p));
      };
      for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1000, height: 640 }]) {
        await d.page.setViewportSize(viewport);
        const all = await d.eval(everyPanel(STATES[race]));
        for (const [id, p] of Object.entries(all)) if (!check(id, p)) moved.push([viewport.width, id, p.map(x => x.box)]);
        assert.deepEqual(Object.keys(all).filter(id => /^[bt]_/.test(id)).sort(), want, `${viewport.width}: every unit and building was read`);
        assert.ok(Object.keys(all).some(id => id.startsWith('r_')), 'and the researches');
      }
      assert.deepEqual(moved, [], 'no panel changed its size or its place');
      // Under a real mouse: the money goes and comes back while it rests on the button (the card is rebuilt under it).
      await d.page.setViewportSize({ width: 1000, height: 640 });
      const hq = await d.eval(() => { endfall.setResources(0, 5000, 0); const b = endfall.G.bldgs.find(b => b.team === 0); endfall.ui.sel = [b]; endfall.hud(); return endfall.cardItems().find(i => i.cost).id; });
      await d.page.locator(`#cmd [data-id="${hq}"]`).hover();
      const held = await d.eval(`[5000, 0, 5000].map(gold => { endfall.setResources(0, gold, 0); endfall.hud(); return { ...(${PANEL})(), want: endfall.cardItems().find(i => i.cost).label, takes: 0 }; })`);
      assert.ok(check(hq, held, [[5000], [0], [5000]].map(g => [...g, 'free'])), `the panel held still under the mouse: ${JSON.stringify(held)}`);
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  });
}

test('phone: a long press\'s panel keeps no room for what is short: its words are there only while it is', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.grant(5000, 0);
    await d.clickEntity((await d.state()).bldgs.find(b => b.team === 0).id);
    await d.readyCard('Villager');
    const at = await d.page.locator('#cmd button', { hasText: 'Villager' }).boundingBox(), cdp = await d.page.context().newCDPSession(d.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x + at.width / 2, y: at.y + at.height / 2 }] });
    await d.page.locator('#cmdInfo').waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await d.eval(() => getComputedStyle(document.querySelector('#cmdInfo .short')).display), 'none', 'no room kept on a touch screen');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});
