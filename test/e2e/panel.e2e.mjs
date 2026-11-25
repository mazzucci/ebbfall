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
/** In the page: the panel as it is drawn now: its box, and whether the words of what is short are seen. */
const panel = () => {
  endfall.draw();
  const el = document.getElementById('cmdInfo'), r = el.getBoundingClientRect(), s = el.querySelector('.short');
  return { box: [r.left, r.top, r.width, r.height].map(v => Math.round(v * 100) / 100), hidden: el.hidden, label: el.querySelector('b')?.textContent, short: !!s && getComputedStyle(s).visibility === 'visible' && getComputedStyle(s).display !== 'none', words: s?.textContent };
};

for (const race of ['humans', 'vael']) {
  test(`${race}, with a mouse: the details panel of every unit, building and research has one size, whether it can be paid or not, in three windows`, { timeout: 240000 }, async () => {
    const d = await newGame(DESKTOP, 1, 4242, { ai: false, race });
    try {
      assert.deepEqual(await d.eval(raiseAll), [], 'every building stands');
      const want = await d.eval(() => { const { G, engine: E } = endfall, f = E.FACTIONS[G.factions[0]], b = [...new Set([...f.buildBasic, ...f.buildAdvanced])]; return [...b.map(k => 'b_' + k), ...new Set(b.flatMap(k => E.BUILDINGS[k].trains || [])).values()].map(k => k.startsWith('b_') ? k : 't_' + k).sort(); });
      const moved = [], money = race === 'vael' ? 'energy' : 'gold';
      for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1000, height: 640 }]) {
        await d.page.setViewportSize(viewport);
        const seen = new Set();
        /** Every priced button on the card now: hovered rich, poor, rich again. */
        const each = async () => {
          const ids = await d.eval(() => { endfall.setResources(0, 5000, 0); endfall.draw(); return endfall.cardItems().filter(i => i.cost && !i.hidden).map(i => i.id); });
          for (const id of ids) {
            if (seen.has(id)) continue;
            seen.add(id);
            await d.page.locator(`#cmd [data-id="${id}"]`).hover();
            const rich = await d.eval(panel);
            await d.grant(0, 0); const poor = await d.eval(panel);
            await d.grant(5000, 0); const again = await d.eval(panel);
            assert.ok(!rich.hidden && !poor.hidden && rich.label === poor.label, `${id}: its panel shows in both states: ${JSON.stringify([rich, poor])}`);
            assert.deepEqual([rich.short, poor.short, again.short], [false, true, false], `${id}: what is short is seen only while it is`);
            assert.match(poor.words, new RegExp(`^Not enough ${money} \\(needs \\d+\\)\\.$`));
            if (rich.box.join() !== poor.box.join() || rich.box.join() !== again.box.join()) moved.push([viewport.width, id, rich.box, poor.box, again.box]);
            assert.ok(rich.box[1] >= 0 && rich.box[0] >= 0, `${id}: on the screen: ${rich.box}`);
          }
        };
        for (const b of await d.eval(() => endfall.G.bldgs.filter(b => b.team === 0 && b.done).map(b => b.id))) {
          await d.eval((id) => { endfall.ui.mode = null; endfall.ui.sel = [endfall.G.bldgs.find(b => b.id === id)]; endfall.draw(); }, b);
          await each();
        }
        await d.eval(() => { endfall.ui.sel = [endfall.G.units.find(u => u.team === 0 && u.d.worker)]; endfall.ui.mode = null; endfall.draw(); });
        await d.pressCard('Build'); await each();
        await d.pressCard('Advanced'); await each();
        await d.key('Escape'); await d.key('Escape');
        assert.deepEqual([...seen].filter(id => /^[bt]_/.test(id)).sort(), want, `${viewport.width}: every unit and building was read`);
        assert.ok([...seen].some(id => id.startsWith('r_')), 'and the researches');
      }
      assert.deepEqual(moved, [], 'no panel changed its size or its place');
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
