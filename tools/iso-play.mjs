// The trial's hands-on check: select, box, move, attack, build, pan, zoom and the minimap through the real UI, the
// projection on, on a desktop and a touch phone; prints what each did. flock /tmp/claude-1000/ebbfall-lab.lock node tools/iso-play.mjs [34,0.512]
import { start, stop, browserContext, baseUrl, board } from '../test/e2e/harness.mjs';
const ISO = process.argv[2] || '34,0.512';
const ok = (n, c, d = '') => console.log(`${c ? 'ok  ' : 'FAIL'} ${n} ${d}`);
await start();
try {
  for (const dev of (process.argv[3] || 'desk,phone').split(',')) {
    const device = dev === 'desk' ? { viewport: { width: 1440, height: 900 } } : { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true };
    const ctx = await browserContext(device), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(120000);
    if (device.hasTouch) await ctx.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('no')); });
    await page.goto(`${baseUrl()}?seed=4242${ISO === '0' ? '' : '&iso=' + ISO}`, { waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.endfall);
    const touch = !!device.hasTouch, press = (s) => touch ? page.locator(s).tap() : page.locator(s).click();
    await press('#btnSolo'); await board(page).race(1, 'vael'); await press('#btnStart');
    await page.waitForFunction(() => endfall.G.units.length > 0);
    await page.evaluate(() => { endfall.engine.disableAi(); });
    const at = (p) => page.evaluate(([p]) => { const s = endfall.toScreen(p.x, p.y), r = document.getElementById('game').getBoundingClientRect(); return { x: s.x + r.left, y: s.y + r.top }; }, [p]);
    const click = async (p, button = 'left') => touch ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y, { button });
    const first = await page.evaluate(() => { const u = endfall.engine.debugSpawn(0, 'knight', endfall.G.units[0].x - 60, endfall.G.units[0].y + 160); const ids = [u]; for (let i = 1; i < 5; i++) ids.push(endfall.engine.debugSpawn(0, 'knight', endfall.G.units[0].x - 60 - i * 30, endfall.G.units[0].y + 160)); endfall.skip(0.2); const b = endfall.G.bldgs[0]; endfall.centerOn(b.x - 80, b.y + 60); return ids; });
    await page.waitForTimeout(600);
    const unit = (id) => page.evaluate(([id]) => { const u = endfall.G.units.find(u => u.id === id); return u && { x: u.x, y: u.y, task: u.task.t, type: u.type }; }, [id]);
    const sel = () => page.evaluate(() => endfall.ui.sel.map(e => e.id));
    const k = await unit(first[0]); let p = await at(k); await click({ x: p.x, y: p.y - 20 }); await page.waitForTimeout(300);
    ok(`${dev}: a click selects the unit under it`, (await sel())[0] === first[0], JSON.stringify(await sel()));
    // a move: right click (a tap) on the ground 4 tiles off, on the screen's diagonal
    const goal = { x: k.x + 90, y: k.y - 110 }; p = await at(goal); await click(p, 'right'); await page.waitForTimeout(400); await page.evaluate(() => endfall.skip(8)); await page.waitForTimeout(300);
    let u = await unit(first[0]); ok(`${dev}: it walked to the spot pressed`, Math.hypot(u.x - goal.x, u.y - goal.y) < 20, `${Math.round(Math.hypot(u.x - goal.x, u.y - goal.y))} px off`);
    if (!touch) { // the box round the other four
      const rest = []; for (const id of first.slice(1)) rest.push(await at(await unit(id)));
      const x0 = Math.min(...rest.map(r => r.x)) - 14, x1 = Math.max(...rest.map(r => r.x)) + 14, y0 = Math.min(...rest.map(r => r.y)) - 50, y1 = Math.max(...rest.map(r => r.y)) + 10;
      await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300);
      ok(`${dev}: a screen box takes the four in it`, (await sel()).filter(i => first.slice(1).includes(i)).length === 4, JSON.stringify(await sel()));
    } else {
      await page.evaluate(() => endfall.ui.sel.length); await page.locator('#btnArmy').tap(); await page.waitForTimeout(200); ok(`${dev}: ARMY takes the five`, (await sel()).length === 5);
    }
    // attack: an enemy spawned in sight, pressed on its body
    const foe = await page.evaluate(([k]) => { const id = endfall.engine.debugSpawn(1, 'bruiser', k.x + 10, k.y - 10 + 140); endfall.skip(0.1); return id; }, [k]);
    await page.waitForTimeout(300); const f = await unit(foe); p = await at(f); await click({ x: p.x, y: p.y - 18 }, 'right'); await page.waitForTimeout(300);
    const tasks = await page.evaluate(([foe]) => endfall.ui.sel.map(u => u.task.t + ':' + (u.task.target?.id === foe)), [foe]); ok(`${dev}: a press on an enemy's body orders the attack`, tasks.length > 0 && tasks.every(t => t.endsWith('true')), tasks.join(' '));
    await page.evaluate(() => endfall.skip(12)); await page.waitForTimeout(300); ok(`${dev}: they fought it`, !(await unit(foe)) , JSON.stringify(await unit(foe)));
    // a building selected by its wall, then a site placed
    await page.keyboard.press('Escape'); await page.evaluate(() => { endfall.ui.sel.length = 0; const b = endfall.G.bldgs[0]; endfall.centerOn(b.x, b.y); endfall.setResources(0, 2000, 0); }); await page.waitForTimeout(300);
    const hq = await page.evaluate(() => { const b = endfall.G.bldgs[0]; return { id: b.id, x: b.x, y: b.y }; }); p = await at(hq); await click({ x: p.x, y: p.y - 30 }); await page.waitForTimeout(300); ok(`${dev}: a press on the Castle's art selects it`, (await sel())[0] === hq.id);
    const site = await page.evaluate(() => { const e = endfall, find = () => e.G.units.find(u => u.team === 0 && u.d.worker && !u.inside); for (let i = 0; i < 40 && !find(); i++) e.skip(0.5); const w = find(); for (let r = 3; r < 12; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { const b = e.G.bldgs[0], tx = b.tx + dx, ty = b.ty + dy; if (e.engine.canPlace('depot', tx, ty, 0)) { const s = e.toScreen((tx + 1) * 32, (ty + 1) * 32); if (s.x > 350 && s.x < e.view.w - 350 && s.y > 80 && s.y < e.view.h - 180) { e.ui.sel.splice(0, 9, w); e.ui.place = { type: 'depot', tx, ty }; return { tx, ty, x: (tx + 1) * 32, y: (ty + 1) * 32 }; } } } });
    if (site) { p = await at(site); if (!touch) await page.mouse.move(p.x, p.y); await page.waitForTimeout(200); await click(p); await page.waitForTimeout(400); const b = await page.evaluate(([s]) => endfall.G.bldgs.some(b => b.type === 'depot' && b.tx === s.tx && b.ty === s.ty), [site]); ok(`${dev}: a site lands on the tile under the pointer`, b, JSON.stringify(site)); } else ok(`${dev}: site`, false, 'no spot on screen');
    // pan, wheel zoom, minimap
    const mid = () => page.evaluate(() => { const r = endfall.toWorld(endfall.view.w / 2, endfall.view.h / 2); return { x: Math.round(r.x), y: Math.round(r.y), z: endfall.cam.zoom }; });
    await page.evaluate(() => endfall.centerOn(1024, 1024)); const m0 = await mid();
    if (!touch) {
      await page.mouse.move(700, 400); await page.mouse.down({ button: 'middle' }); await page.mouse.move(800, 400, { steps: 4 }); await page.mouse.up({ button: 'middle' }); const m1 = await mid(); ok(`${dev}: the middle button drags the map`, Math.abs(m1.x - m0.x) > 10 && Math.abs(m1.y - m0.y) > 10, JSON.stringify([m0, m1]));
      const w0 = await page.evaluate(() => endfall.toWorld(500, 300)); await page.mouse.move(500, 300); await page.keyboard.down('Control'); await page.mouse.wheel(0, 20); await page.keyboard.up('Control'); await page.waitForTimeout(200); const w1 = await page.evaluate(() => endfall.toWorld(500, 300)), m2 = await mid(); ok(`${dev}: ctrl+wheel zooms round the pointer`, m2.z < m0.z && Math.hypot(w0.x - w1.x, w0.y - w1.y) < 1, `${m0.z.toFixed(2)} to ${m2.z.toFixed(2)}`);
      const bx = await page.locator('#minimap').boundingBox(); await page.mouse.click(bx.x + bx.width * 0.25, bx.y + bx.height * 0.7); await page.waitForTimeout(200); const m3 = await mid(); ok(`${dev}: a minimap click goes there`, Math.hypot(m3.x - 512, m3.y - 1434) < 40, JSON.stringify(m3));
      await page.mouse.move(2, 450); await page.waitForTimeout(700); const m4 = await mid(); ok(`${dev}: the window's edge scrolls`, m4.x < m3.x, JSON.stringify(m4));
    } else {
      const cdp = await ctx.newCDPSession(page), t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
      const st = () => page.evaluate(() => [!!endfall.ui.place, endfall.ui.mode, endfall.ui.box, endfall.ui.sel.length, endfall.cam.x | 0].join('/')); const s0 = await st(); await t('touchStart', [[400, 150]]); for (let i = 1; i < 8; i++) await t('touchMove', [[400 + i * 12, 150]]); const s1 = await st(); await page.waitForTimeout(300); await t('touchEnd', []); const m1 = await mid(); ok(`${dev}: a finger pans`, Math.abs(m1.x - m0.x) > 10 && Math.abs(m1.y - m0.y) > 10, JSON.stringify([m0, m1, s0, s1]));
      await t('touchStart', [[360, 180], [460, 180]]); for (let i = 1; i < 8; i++) await t('touchMove', [[360 - i * 8, 180], [460 + i * 8, 180]]); await t('touchEnd', []); const m2 = await mid(); ok(`${dev}: a pinch zooms`, m2.z > m1.z, `${m1.z.toFixed(2)} to ${m2.z.toFixed(2)}`);
      const bx = await page.locator('#minimap').boundingBox(); await page.touchscreen.tap(bx.x + bx.width * 0.25, bx.y + bx.height * 0.7); await page.waitForTimeout(300); const m3 = await mid(); ok(`${dev}: a minimap tap goes there`, Math.hypot(m3.x - 512, m3.y - 1434) < 40, JSON.stringify(m3));
    }
    ok(`${dev}: no page errors`, !errors.length, errors.join('; ')); await ctx.close();
  }
} finally { await stop(); }
