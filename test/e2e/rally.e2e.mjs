// The rally flag (src/client/gl/rallyflag.js): drawn for the selected building of ours alone, red whatever our seat's
// color, and the dotted line to it as it was.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, DESKTOP } from './harness.mjs';

before(start);
after(stop);

/** The flag's red on the screen: its pixels in a box round the world point (x, y), from a screenshot of the canvas. */
async function redAt(d, x, y) {
  const box = await d.page.locator('#game').boundingBox(), c = await d.eval(() => ({ x: endfall.cam.x, y: endfall.cam.y, z: endfall.cam.zoom }));
  const png = await d.page.screenshot({ clip: { x: box.x + (x - 14 - c.x) * c.z, y: box.y + (y - 32 - c.y) * c.z, width: 46 * c.z, height: 40 * c.z } });
  return d.eval((data) => new Promise((res) => {
    const im = new Image(); im.onload = () => {
      const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
      const p = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0;
      for (let i = 0; i < p.length; i += 4) if (p[i] > 110 && p[i + 1] < 40 && p[i + 2] < 60) n++;
      res(n);
    }; im.src = 'data:image/png;base64,' + data;
  }), png.toString('base64'));
}
const drawn = (d) => d.eval(() => { endfall.draw(); return endfall.rallyShown(); });

test('the rally flag: red, whatever our color, for the selected building of ours alone; gone when it is let go of; never for a foe\'s building', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const s = await d.state(), core = s.bldgs.find(b => b.team === 0), foe = s.bldgs.find(b => b.team === 1);
    const [gx, gy] = [[200, 160], [-160, -200], [300, 60], [0, -260], [260, -120]].map(([dx, dy]) => [core.x + dx, core.y + dy])
      .find(([x, y]) => s.nodes.every(n => Math.hypot(n.x - x, n.y - y) > 100) && s.units.every(u => Math.hypot(u.x - x, u.y - y) > 60));
    await d.clickEntity(core.id);
    // (its rally point from the start: on its nearest mine, Nov 27; its flag there)
    const start = await d.eval((id) => { const r = endfall.G.bldgs.find(b => b.id === id).rally; return r && { x: r.x, y: r.y, mine: !!r.node }; }, core.id);
    assert.ok(start && start.mine, `a rally point on a mine from the start: ${JSON.stringify(start)}`);
    const first = await drawn(d);
    assert.ok(first.length === 1 && first[0].id === core.id && Math.hypot(first[0].x - start.x, first[0].y - start.y) < 40, `its flag on the mine: ${JSON.stringify(first)}`);
    await d.rightClickWorld(gx, gy);
    await d.skip(0.5);
    const [flag, ...more] = await drawn(d);
    assert.ok(flag && !more.length, 'one flag');
    assert.ok(flag.id === core.id && Math.hypot(flag.x - gx, flag.y - gy) < 20, `the Castle's, at its rally point: ${JSON.stringify(flag)}`);
    const [r, g, b] = [flag.color >> 16, flag.color >> 8 & 255, flag.color & 255];
    assert.ok(r > 180 && g < 40 && b < 50, `red: ${[r, g, b]}`);
    await d.centerOn(gx, gy);
    const red = async () => { await d.page.waitForTimeout(1500); return redAt(d, flag.x, flag.y); }; // (the order's marker faded)
    const shown = await red();
    assert.ok(shown > 100, `red on the screen: ${shown} px`);
    // Our seat in the board's red (spot 7) and back: the same flag, not the seat's color.
    await d.eval(() => endfall.paint([7, 1]));
    const tint = await d.eval(() => endfall.seatTint(0));
    assert.deepEqual((await drawn(d)).map(f => f.color), [flag.color], 'the same red for a red seat');
    assert.notEqual(flag.color, tint, 'and not its color');
    await d.eval(() => endfall.paint([0, 1]));
    // Let go of it: no flag. Selected again: back.
    await d.key('Escape');
    assert.deepEqual(await d.selection(), []);
    assert.deepEqual(await drawn(d), [], 'nothing selected: no flag');
    await d.centerOn(gx, gy);
    const gone = await red();
    assert.ok(gone < shown / 10, `no red left on the screen: ${gone} of ${shown} px`);
    // A foe's building with a rally point (set on the client's copy: its side's orders are not ours to give).
    assert.deepEqual(await d.eval((id) => { const b = endfall.G.bldgs.find(x => x.id === id); endfall.ui.sel = [b]; b.rally = { x: b.x + 90, y: b.y }; endfall.draw(); const r = endfall.rallyShown(); endfall.ui.sel = []; return r; }, foe.id), [], 'a foe\'s building: none');
    await d.clickEntity(core.id);
    assert.deepEqual((await drawn(d)).map(f => f.id), [core.id], 'the Castle selected again: its flag back');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});
