// The desktop HUD's sizes (src/style.css, its last block: one table of sizes in units of --u): --u stops at 1.1 however
// large the window, no text of the HUD is under 12 px (the smallest window's 0.9 included), three text sizes in all,
// the portraits and the camera's room past the foot follow; and a phone's HUD has the sizes it had before the table.
// Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, PHONE } from './harness.mjs';

before(start);
after(stop);

/** In the page: every text the HUD shows now (an element with words of its own, laid out and visible), with its size. */
const hudTexts = () => {
  const shown = (el) => { const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
  const out = [];
  for (const root of ['#top', '#hud', '#cmdInfo', '#msg', '#hint', '#tools', '#tut']) for (const el of document.querySelectorAll(`${root}, ${root} *`)) {
    if (!shown(el) || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    out.push([el.id ? `#${el.id}` : `${root} ${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`, Math.round(parseFloat(getComputedStyle(el).fontSize) * 100) / 100]);
  }
  return out;
};
/** In the page: --u in px (a probe 1000 units wide; 0 where the desktop HUD's query does not hold). */
const unit = () => { const p = document.createElement('i'); p.style.position = 'absolute'; p.style.width = 'calc(var(--u, 0px) * 1000)'; document.body.appendChild(p); const u = p.getBoundingClientRect().width / 1000; p.remove(); return u; };
const coreOf = (s) => s.bldgs.find(b => b.team === 0);

for (const [w, h, u] of [[1280, 720, 0.9], [1920, 1080, 1.1], [2560, 1440, 1.1]]) {
  test(`desktop ${w}x${h}: --u is ${u} (never over 1.1), no HUD text under 12 px and three sizes in all: a building with a queue and a button's tooltip, an army, a building being placed; the minimap 190 units, the portraits and the camera's room past the foot with them`, async () => {
    const d = await newGame({ viewport: { width: w, height: h } }, 1, 4242, { ai: false });
    try {
      const got = await d.eval(unit);
      assert.ok(Math.abs(got - u) < 1e-3 && got <= 1.1 + 1e-9, `--u is ${u}: ${got}`);
      const seen = new Map(), look = async (what) => { for (const [el, px] of await d.eval(hudTexts)) seen.set(`${what}: ${el}`, px); };
      const s = await d.state(), core = coreOf(s);
      await d.grant(4000, 0);
      // the Castle: its name, its lines, its card (labels, keys, prices), a queue, and a button's tooltip under the pointer
      await d.clickEntity(core.id);
      const train = d.page.locator('#cmd .cb:not(.gap):not(.cancel)').first();
      await train.click(); await train.click();
      await d.page.waitForFunction(() => document.querySelectorAll('#mod .qi').length === 2);
      await train.hover();
      await d.page.waitForFunction(() => !document.getElementById('cmdInfo').hidden);
      await look('the Castle');
      const sizes = await d.eval(() => { const b = (q) => { const r = document.querySelector(q).getBoundingClientRect(); return [r.width, r.height]; }; return { minimap: b('#minimap'), portrait: b('#selPor .por'), slot: b('#cmd .cb'), button: b('#btnPause'), plate: b('#resShard') }; });
      assert.ok(Math.abs(sizes.minimap[0] - 190 * u) < 0.5 && Math.abs(sizes.minimap[1] - 190 * u) < 0.5, `the minimap 190 units: ${JSON.stringify(sizes)}`);
      assert.deepEqual(sizes.portrait, [Math.round(76 * u), Math.round(76 * u)], `the selection's portrait 76 units (hud.js reads the same --u): ${JSON.stringify(sizes)}`);
      assert.ok(Math.abs(sizes.slot[0] - 88 * u) < 0.5 && Math.abs(sizes.slot[1] - 68 * u) < 0.5 && Math.abs(sizes.button[0] - 40 * u) < 0.5 && Math.abs(sizes.plate[1] - 40 * u) < 0.5, `a card slot 88 x 68 units; the top bar's buttons and plates 40 tall: ${JSON.stringify(sizes)}`);
      await d.page.mouse.move(w / 2, h / 3);
      // an army: the group's tiles and their letters, the orders' card
      await d.eval(([x, y]) => { for (let i = 0; i < 4; i++) endfall.engine.debugSpawn(0, 'trooper', x + i * 28, y); }, [core.x + 150, core.y + 90]);
      await d.key('q');
      await d.page.waitForFunction(() => endfall.ui.sel.length === 4 && document.querySelectorAll('#group .gi').length === 4);
      await look('an army');
      // a Villager placing a building: the hint over the minimap
      const worker = s.units.find(x => x.team === 0 && x.type === 'harvester');
      for (let i = 0; i < 10 && !(await d.selection()).some(e => e.id === worker.id); i++) { await d.clickEntity(worker.id); await d.skip(0.5); }
      await d.pressCard('Build'); await d.page.locator('#cmd .cb:not(.gap):not(.cancel)').first().click();
      await d.page.mouse.move(w / 2, h / 3);
      await d.page.waitForFunction(() => document.getElementById('hint').classList.contains('placing') && document.getElementById('hint').textContent.trim());
      await look('placing');
      const hint = await d.eval(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(), m = r('minimap'), t = r('hint'); return { over: m.top - t.bottom, left: t.left - m.left }; });
      assert.ok(hint.over > 8 * u && hint.over < 24 * u && Math.abs(hint.left) < 1, `the hint just over the minimap, at its left edge: ${JSON.stringify(hint)}`);
      const all = [...seen], small = all.filter(([, px]) => px < 12 - 1e-6), kinds = [...new Set(all.map(([, px]) => px))].sort((a, b) => a - b);
      assert.ok(all.length > 20, `the HUD's texts were read: ${all.length}`);
      assert.deepEqual(small, [], `no HUD text under 12 px: ${JSON.stringify(small)}`);
      assert.deepEqual(kinds, [...new Set([Math.max(12, 12 * u), 14 * u, 17 * u].map(v => Math.round(v * 100) / 100))], `three sizes, the table's key, body and figure or title: ${JSON.stringify(all)}`);
      // the camera all the way down: the map's last row comes out from under a three-row card, taller than the minimap
      const foot = await d.eval(() => {
        const { cam, view, engine } = endfall, cmd = document.getElementById('cmd'), cs = getComputedStyle(cmd), px = (v) => parseFloat(v) || 0;
        endfall.centerOn(engine.WW / 2, 1e7);
        const card = cmd.getBoundingClientRect().bottom - (3 * px(cs.gridAutoRows) + 2 * px(cs.rowGap) + px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth));
        return { map: (engine.WH - cam.y) * cam.zoom, card, minimap: document.getElementById('minimap').getBoundingClientRect().top, h: view.h };
      });
      assert.ok(foot.card < foot.minimap && Math.abs(foot.map - (foot.card - 4)) < 1, `the map's foot 4 px over a three-row card's top, which is over the minimap's: ${JSON.stringify(foot)}`);
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  });
}

/** A phone's HUD as it is before and after the desktop's table (a landscape phone, 844x390, DPR 2), an army selected
 *  with ARMY, then the Castle: each text's size (px) and each fixed piece's box (CSS px), as measured on main. */
const PHONE_HUD = {
  army: {
    text: { '#rShard': 14, '#lSupply': 11, '#rSupply': 14, '#rClock': 14, '#btnPause': 10, '#btnBox span': 8, '#info h2': 14, '#group .gi b': 13, '#cmd .cb .l': 9 },
    box: { '#top': [828, 30], '#resShard .dot': [12, 10], '#btnPause': [32, 24], '#btnPause .ico': [16, 16], '#minimap': [128, 128], '#btnBox': [40, 44], '#btnArmy .ico': [18, 18], '#info': [460, 64], '#group .gi': [50, 38], '#cmd': [210, 122], '#cmd .cb': [64, 54], '#cmd .cb .ico': [18, 18] },
  },
  castle: {
    text: { '#info h2': 14, '#hpNum': 14, '#cmd .cb .l': 9, '#cmd .cb .c': 8 },
    box: { '#info': [460, 64], '#selPor': [48, 48], '#cmd': [210, 122], '#cmd .cb': [64, 54], '#cmd .cb .ico.gl': [26, 26], '#cmd .cb .c .dot': [6, 5] },
  },
};
test('a landscape phone\'s HUD keeps its sizes: the desktop HUD\'s table and its --u do not reach it', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    assert.equal(await d.eval(unit), 0, 'no --u on a phone');
    /** What the page has for a state's pieces: the first laid-out match's text size, or its box. */
    const read = (want) => d.eval((want) => {
      const el = (q) => [...document.querySelectorAll(q)].find(x => x.getBoundingClientRect().width > 0), k = (v) => Math.round(v * 100) / 100;
      return {
        text: Object.fromEntries(Object.keys(want.text).map(q => [q, el(q) ? k(parseFloat(getComputedStyle(el(q)).fontSize)) : null])),
        box: Object.fromEntries(Object.keys(want.box).map(q => { const r = el(q)?.getBoundingClientRect(); return [q, r ? [k(r.width), k(r.height)] : null]; })),
      };
    }, want);
    const core = coreOf(await d.state());
    await d.eval(([x, y]) => { for (let i = 0; i < 4; i++) endfall.engine.debugSpawn(0, 'trooper', x + i * 28, y); }, [core.x + 150, core.y + 90]);
    await d.page.locator('#btnArmy').tap();
    await d.page.waitForFunction(() => endfall.ui.sel.length === 4 && document.querySelectorAll('#group .gi').length > 0);
    assert.deepEqual(await read(PHONE_HUD.army), PHONE_HUD.army, 'an army selected: a phone\'s HUD, piece by piece, as on main');
    await d.clickEntity(core.id);
    await d.page.waitForFunction(() => endfall.ui.sel.length === 1 && endfall.ui.sel[0].kind === 'bldg');
    assert.deepEqual(await read(PHONE_HUD.castle), PHONE_HUD.castle, 'the Castle selected: as on main');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});
