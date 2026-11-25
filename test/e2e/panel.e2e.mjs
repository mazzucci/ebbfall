// The details panel of a command button (hover, src/client/card.js) keeps its size whether its price can be paid or not:
// "Not enough gold (needs …)." has its room kept, unseen, with a mouse. On a touch screen the panel is as it was.
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
    short: !!s && cs.visibility === 'visible' && cs.display !== 'none', words: s?.textContent };
}`;
/** In the page: every priced button of every card (each building's, a worker's two Build pages) with its panel rich, poor
 *  and rich again: the mouse's enter and leave sent to each button of a card drawn once for each, all in one call (the
 *  page draws nothing between). { id: [rich, poor, again] }, each with the button's own label as `want`. */
const everyPanel = `(() => {
  const panel = ${PANEL}, { G, ui } = endfall, out = {};
  const enter = (b, type) => b.dispatchEvent(new PointerEvent(type, { pointerType: 'mouse' }));
  const cards = [...G.bldgs.filter(b => b.team === 0 && b.done).map(b => [b, null]), ...['build', 'build2'].map(m => [G.units.find(u => u.team === 0 && u.d.worker && !u.inside), m])];
  for (const [e, mode] of cards) for (const gold of [5000, 0, 5000]) {
    ui.place = null; ui.mode = mode; ui.sel = [e]; endfall.setResources(0, gold, 0); endfall.draw();
    for (const it of endfall.cardItems()) {
      if (!it.cost || it.hidden || out[it.id]?.length === 3) continue;
      const b = document.querySelector('#cmd [data-id="' + it.id + '"]');
      enter(b, 'pointerenter'); (out[it.id] ||= []).push({ ...panel(), want: it.label }); enter(b, 'pointerleave');
    }
  }
  ui.sel = []; ui.mode = null;
  return out;
})()`;

for (const race of ['humans', 'vael']) {
  test(`${race}, with a mouse: the details panel of every unit, building and research has one size, whether it can be paid or not, in three windows`, { timeout: 240000 }, async () => {
    // (half the pixels each way: what is measured is the layout, and software WebGL draws a 1920 px window slowly)
    const d = await newGame({ ...DESKTOP, deviceScaleFactor: 0.5 }, 1, 4242, { ai: false, race });
    try {
      assert.deepEqual(await d.eval(raiseAll), [], 'every building stands');
      const want = await d.eval(() => { const { G, engine: E } = endfall, f = E.FACTIONS[G.factions[0]], b = [...new Set([...f.buildBasic, ...f.buildAdvanced])]; return [...b.map(k => 'b_' + k), ...new Set(b.flatMap(k => (E.BUILDINGS[k].trains || []).map(t => 't_' + t)))].sort(); });
      const moved = [], money = race === 'vael' ? 'energy' : 'gold', same = (p, q) => p.box.join() === q.box.join();
      const check = (id, [rich, poor, again]) => {
        assert.ok([rich, poor, again].every(p => !p.hidden && p.label === rich.want), `${id}: its panel shows in each state: ${JSON.stringify([rich, poor, again])}`);
        assert.deepEqual([rich.short, poor.short, again.short], [false, true, false], `${id}: what is short is seen only while it is`);
        assert.match(poor.words, new RegExp(`^Not enough ${money} \\(needs \\d+\\)\\.$`));
        assert.ok(rich.box[0] >= 0 && rich.box[1] >= 0, `${id}: on the screen: ${rich.box}`);
        return same(rich, poor) && same(rich, again);
      };
      for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1000, height: 640 }]) {
        await d.page.setViewportSize(viewport);
        const all = await d.eval(everyPanel);
        for (const [id, p] of Object.entries(all)) if (!check(id, p)) moved.push([viewport.width, id, p.map(x => x.box)]);
        assert.deepEqual(Object.keys(all).filter(id => /^[bt]_/.test(id)).sort(), want, `${viewport.width}: every unit and building was read`);
        assert.ok(Object.keys(all).some(id => id.startsWith('r_')), 'and the researches');
      }
      assert.deepEqual(moved, [], 'no panel changed its size or its place');
      // Under a real mouse: the money goes and comes back while it rests on the button (the card is rebuilt under it).
      await d.page.setViewportSize({ width: 1000, height: 640 });
      const hq = await d.eval(() => { endfall.setResources(0, 5000, 0); const b = endfall.G.bldgs.find(b => b.team === 0); endfall.ui.sel = [b]; endfall.draw(); return endfall.cardItems().find(i => i.cost).id; });
      await d.page.locator(`#cmd [data-id="${hq}"]`).hover();
      const held = await d.eval(`[5000, 0, 5000].map(gold => { endfall.setResources(0, gold, 0); endfall.draw(); return { ...(${PANEL})(), want: endfall.cardItems().find(i => i.cost).label }; })`);
      assert.ok(check(hq, held), `the panel held still under the mouse: ${JSON.stringify(held)}`);
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
