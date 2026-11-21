// PROTOTYPE ONLY (branch hud-options, an options round, no PR): the stills of the desktop HUD options.
//   npm run build && node tools/hud-capture.mjs [--out DIR] [--hud 0,1,2,3] [--only desk|retina|phone] [--states 1,2,3] [--checks]
// One staged instant of one game (seed 4242, the Kingdom against the Expedition, the AI off): a base at about four
// minutes, a raid met at its gate, the whole army (twelve units) selected through the UI (Q; ARMY on the phone). The
// page's clock is held before the game starts, so the main loop never steps: the world moves only by `endfall.skip`,
// each still is drawn with `endfall.draw`. Every page is staged the same way and its state hash must match.
// --hud: 0 is main as shipped (today/), 1..3 the options (?hud=N: src/client/hudopt.js), 2:1 the recommended pair
// (?hud=2&marks=1: recommended/). Per option:
//   1920x1080.png, 1440x900.png (DPR 1), 2560x1440-dpr2.png (a 1280x720 window), phone-844x390.png (DPR 2, touch),
//   closeup-1920.png and closeup-dpr2.png (the melee at the start zoom, cut from a still of its own)
// --states N,..: for these options also one unit selected and a building with a production queue, at 1440x900.
// --checks: the other states (the build menu and its ghost, a toast, the rally flag, a range ring) and two smaller
//   windows (1024x768, 800x600), into <out>/checks/: looked at, not delivered.
// Run one at a time, under the machine's render lock: flock /tmp/claude-1000/ebbfall-lab.lock node tools/hud-capture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, stop, browserContext, baseUrl, board } from '../test/e2e/harness.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const root = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(arg('--out', join(root, '../ebbfall-article/hud-options')));
const HUDS = arg('--hud', '0,1,2,3,2:1').split(','); // (N, or N:M: option N's layout with option M's marks: `recommended/`)
const ONLY = arg('--only', '');
const STATES = arg('--states', '').split(',').filter(Boolean);
const CHECKS = has('--checks');
const dirOf = (h) => join(out, h.includes(':') ? 'recommended' : +h ? `option-${h}` : 'today');
const query = (h) => { const [n, m] = h.split(':'); return +n ? `&hud=${n}${m ? `&marks=${m}` : ''}` : ''; };
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const desk = (w, h, dpr = 1) => ({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });

/** In the page: the base, the raid and the fight. Returns the world points the stills are framed on. */
function stage() {
  const e = window.endfall, { G, engine: eng } = e, me = G.me, T = eng.TILE;
  const foe = G.factions.findIndex((_, t) => t !== me);
  const hq = G.bldgs.find(b => b.team === me && eng.BUILDINGS[b.type].hq);
  const mid = { x: eng.MW * 16, y: eng.MH * 16 }, len = Math.hypot(mid.x - hq.x, mid.y - hq.y);
  const dir = { x: (mid.x - hq.x) / len, y: (mid.y - hq.y) / len }, side = { x: -dir.y, y: dir.x };
  const at = (f, s = 0) => ({ x: hq.x + dir.x * f + side.x * s, y: hq.y + dir.y * f + side.y * s });
  const spawn = (team, kind, p) => eng.debugSpawn(team, kind, p.x, p.y);
  const workers = () => G.units.filter(u => u.team === me && eng.UNITS[u.type].worker);
  const place = (type, near) => {
    const d = eng.BUILDINGS[type], tx0 = Math.round(near.x / T - d.w / 2), ty0 = Math.round(near.y / T - d.h / 2);
    for (let r = 0; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !eng.canPlace(type, tx0 + dx, ty0 + dy, me)) continue;
      const w = workers().find(u => u.task.t === 'idle') || workers()[0];
      try { eng.placeBuilding(me, type, tx0 + dx, ty0 + dy, w); return true; } catch { /* refused: the next spot */ }
    }
    return false;
  };
  const mine = () => { const m = e.map.nodes.filter(n => n.amount > 0).sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0]; for (const w of workers()) if (w.task.t === 'idle') eng.startGather(w, m); return m; };
  eng.disableAi();
  // the base: about four minutes of building, the workers back on the mine between rounds
  mine(); e.setResources(me, 5000, 0);
  for (let i = 0; i < 5; i++) spawn(me, 'harvester', at(-60, (i - 2) * 30));
  // (scouts: Villagers set down round the base walk home to the mine, so the minimap has seen ground on it)
  for (const [dx, dy] of [[-900, -200], [-800, -700], [-300, -950], [-1100, 150], [-600, -400], [-150, -600], [-1000, -500], [-500, 200]]) spawn(me, 'harvester', { x: hq.x + dx, y: hq.y + dy });
  place('depot', at(-150, -170)); place('depot', at(-170, 150)); place('barracks', at(190, -190));
  e.skip(70); place('forge', at(-70, 250)); place('depot', at(-230, -40)); place('airfield', at(170, 230));
  e.skip(75); place('turret', at(330, 40)); place('depot', at(-240, 70)); place('depot', at(-60, -260));
  e.skip(75); mine();
  // the raid and the army that meets it, a little out from the Watchtower
  const field = { x: hq.x - 400, y: hq.y - 350 }; // (open grass beyond the ridge, up and left of the Castle)
  const rows = (kinds, team, sign) => kinds.map((k, i) => {
    const col = Math.floor(i / 4), row = (i % 4) - 1.5, x = field.x + sign * (48 + col * 50), y = field.y + row * 62 + (col % 2) * 22;
    const id = spawn(team, k, { x, y }); return { id, y };
  });
  const ours = rows(['knight', 'knight', 'knight', 'knight', 'trooper', 'trooper', 'trooper', 'trooper', 'lancer', 'lancer', 'lancer', 'lancer'], me, 1);
  const theirs = rows(['umbra', 'umbra', 'umbra', 'prism', 'prism', 'prism', 'prism', 'bruiser', 'scythe', 'scythe', 'shrike', 'shrike'], foe, -1);
  const unit = (id) => G.units.find(u => u.id === id);
  for (const o of ours) eng.attackMove(unit(o.id), field.x - 260, o.y);
  for (const o of theirs) eng.attackMove(unit(o.id), field.x + 260, o.y);
  const a = ours.map(o => o.id), b = theirs.map(o => o.id), of = (ids) => G.units.filter(u => ids.includes(u.id));
  e.skip(3.4); // (the fronts have met: some hurt, none of ours dead)
  e.setResources(me, 385, 0);
  G.events.length = 0; // (no bursts or sounds queued for a frame that never runs)
  for (const el of document.querySelectorAll('#msg .toast')) el.remove();
  const alive = of(a).filter(u => !u.dead), cx = alive.reduce((s, u) => s + u.x, 0) / alive.length, cy = alive.reduce((s, u) => s + u.y, 0) / alive.length;
  return { hq: { x: hq.x, y: hq.y }, field, army: { x: cx, y: cy }, alive: [alive.length, of(b).filter(u => !u.dead).length], time: G.time, hash: eng.stateHash() >>> 0, map: [eng.WW, eng.WH],
    barracks: (() => { const k = G.bldgs.find(x => x.team === me && x.type === 'barracks'); return k && { x: k.x, y: k.y, done: k.done }; })(),
    tower: (() => { const k = G.bldgs.find(x => x.team === me && x.type === 'turret'); return k && { x: k.x, y: k.y, done: k.done }; })(),
    bldgs: G.bldgs.filter(x => x.team === me).map(x => `${x.type}${x.done ? '' : '*'}`).join(' '), sup: G.sup[me].join('/') };
}

/** A page with the game at the staged instant (its clock held), on `device`, showing option `hud` (0: today). */
async function staged(device, hud) {
  const ctx = await browserContext(device), page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(300000); // (a busy machine: software GL is slow to draw a large window)
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install();
  await page.goto(`${baseUrl()}?seed=4242${query(hud)}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 120000 });
  const press = (sel) => device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click();
  await press('#btnSolo');
  await board(page).race(1, 'vael');
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000); // (from here no frame runs unless drawn)
  await press('#btnStart');
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { polling: 100 });
  await page.evaluate(() => document.fonts.ready);
  // The zoom of every still: main's start zoom for this window (render.js startZoom on main's canvas, the window less
  // its 8 px gutters), the same number today and in every option, whatever width an option leaves the canvas.
  await page.evaluate(() => { endfall.todayZoom = () => (matchMedia('(pointer: coarse)').matches ? 1 : Math.min(2, Math.max(1, (innerWidth - 16) / 1200))); });
  const setup = await page.evaluate(stage);
  const selectArmy = async () => {
    await page.evaluate(() => endfall.draw());
    if (device.hasTouch) await page.locator('#btnArmy').tap(); else await page.keyboard.press('q');
    await page.mouse.move(2, 300); // (the pointer off the panels)
    return page.evaluate(() => endfall.ui.sel.map(x => x.type).join(' '));
  };
  setup.selected = await selectArmy();
  return { ctx, page, errors, setup, selectArmy };
}

/** Resize the page's window and wait until the stage (and so render.js `view`) has its new size. */
async function sizeTo(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForFunction(([w, h]) => {
    const r = document.getElementById('stage').getBoundingClientRect(), v = endfall.view;
    return innerWidth === w && innerHeight === h && v.w === Math.max(200, r.width | 0) && v.h === Math.max(160, r.height | 0);
  }, [w, h], { polling: 100 });
}

/** The point the camera centers on: the fight, pulled a little toward the base so both show; the same world point in
 *  every option and today (each layout then covers what it covers). */
const aim = (s) => ({ x: s.field.x * 0.66 + s.hq.x * 0.34, y: s.field.y * 0.76 + s.hq.y * 0.24 });

/** Draw the held instant at the page's start zoom, centered on `at`, and shoot the whole window. */
async function shoot(page, file, at) {
  const s = await page.evaluate(([at]) => {
    const { cam, view } = endfall; cam.zoom = endfall.todayZoom(); endfall.centerOn(at.x, at.y); endfall.draw(); endfall.draw();
    for (const t of document.querySelectorAll('.toast')) t.style.animation = 'none'; // (a toast fades by the wall clock, which is not held: every still shows it whole)
    return { view: { w: view.w, h: view.h }, zoom: cam.zoom, cam: { x: cam.x, y: cam.y }, hash: endfall.engine.stateHash() >>> 0, selected: endfall.ui.sel.length };
  }, [at]);
  await page.screenshot({ path: file, timeout: 300000 });
  console.log(`${file.replace(out + '/', '')}: view ${s.view.w}x${s.view.h}, zoom ${s.zoom.toFixed(2)}, ${s.selected} selected`);
  return s;
}

/** The melee alone: the camera on the army, and a cut of the window round it (w x h CSS px). */
async function closeup(page, file, s, w, h) {
  const r = await page.evaluate(([p]) => {
    const { cam } = endfall; cam.zoom = endfall.todayZoom(); endfall.centerOn(p.x, p.y - 20); endfall.draw(); endfall.draw();
    const b = document.getElementById('game').getBoundingClientRect();
    return { x: b.left + (p.x - cam.x) * cam.zoom, y: b.top + (p.y - 20 - cam.y) * cam.zoom };
  }, [s.army]);
  await page.screenshot({ path: file, clip: { x: Math.round(r.x - w / 2), y: Math.round(r.y - h / 2), width: w, height: h }, timeout: 300000 });
  console.log(file.replace(out + '/', ''));
}

/** A click (a tap) on a world point, as a player would. */
async function clickWorld(page, p, device) {
  const q = await page.evaluate(([p]) => { const { cam } = endfall, b = document.getElementById('game').getBoundingClientRect(); return { x: b.left + (p.x - cam.x) * cam.zoom, y: b.top + (p.y - cam.y) * cam.zoom }; }, [p]);
  if (device?.hasTouch) await page.touchscreen.tap(q.x, q.y); else await page.mouse.click(q.x, q.y);
  return q;
}

await start();
const log = { setups: {}, shots: [], errors: [] };
try {
  for (const hud of HUDS) {
    const dir = dirOf(hud); mkdirSync(dir, { recursive: true });
    if (!ONLY || ONLY === 'desk') {
      const { ctx, page, errors, setup, selectArmy } = await staged(desk(1920, 1080), hud);
      log.setups[`${hud}-desk`] = setup; const at = aim(setup);
      for (const [w, h] of [[1920, 1080], [1440, 900]]) { await sizeTo(page, w, h); log.shots.push({ hud, size: `${w}x${h}`, ...await shoot(page, join(dir, `${w}x${h}.png`), at) }); }
      await sizeTo(page, 1920, 1080); await closeup(page, join(dir, 'closeup-1920.png'), setup, 960, 600);
      if (STATES.includes(hud) || CHECKS) {
        const sdir = CHECKS && !STATES.includes(hud) ? join(out, 'checks') : dir, tag = CHECKS && !STATES.includes(hud) ? `hud${hud.replace(':', 'm')}--` : '';
        mkdirSync(sdir, { recursive: true });
        await sizeTo(page, 1440, 900);
        // one unit: a click on the Knight nearest the base (the least crowded)
        const knight = await page.evaluate(([hq]) => { const { G } = endfall, k = G.units.filter(u => u.team === G.me && u.type === 'knight' && !u.dead).sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0]; return { x: k.x, y: k.y - endfall.unitTop('knight') / 3 }; }, [setup.hq]);
        await page.evaluate(([at]) => { endfall.cam.zoom = endfall.todayZoom(); endfall.centerOn(at.x, at.y); endfall.draw(); }, [at]);
        await clickWorld(page, knight); await page.mouse.move(2, 300);
        await shoot(page, join(sdir, `${tag}1440x900--one-unit.png`), at);
        // a building with a production queue: the Barracks, K three times and the second button twice
        const base = { x: setup.hq.x * 0.5 + setup.barracks.x * 0.5, y: setup.hq.y * 0.5 + setup.barracks.y * 0.5 + 40 };
        await page.evaluate(([at]) => { endfall.setResources(endfall.G.me, 2000, 0); endfall.centerOn(at.x, at.y); endfall.draw(); }, [base]);
        await clickWorld(page, setup.barracks); await page.evaluate(() => endfall.draw());
        const train = page.locator('#cmd .cb:not(.gap):not(.cancel)');
        await train.nth(0).click(); await train.nth(0).click(); await page.evaluate(() => endfall.draw()); await train.nth(1).click(); await train.nth(0).click();
        await page.evaluate(() => { endfall.skip(6); endfall.G.events.length = 0; for (const el of document.querySelectorAll('#msg .toast')) el.remove(); });
        await page.mouse.move(2, 300);
        await shoot(page, join(sdir, `${tag}1440x900--queue.png`), base);
        if (CHECKS) {
          const cdir = join(out, 'checks'); mkdirSync(cdir, { recursive: true });
          // the rally flag: a right-click out from the Barracks; a toast with it
          await page.evaluate(([at]) => { endfall.centerOn(at.x, at.y); endfall.draw(); }, [base]);
          const q = await page.evaluate(([p]) => { const { cam } = endfall, b = document.getElementById('game').getBoundingClientRect(); return { x: b.left + (p.x - cam.x) * cam.zoom, y: b.top + (p.y - cam.y) * cam.zoom }; }, [{ x: setup.barracks.x - 30, y: setup.barracks.y + 170 }]);
          await page.mouse.click(q.x, q.y, { button: 'right' }); await page.mouse.move(2, 300);
          await page.evaluate(() => { endfall.ui.toast?.('x'); });
          await shoot(page, join(cdir, `hud${hud.replace(':', 'm')}--1440x900--rally.png`), base);
          // the Watchtower: its range ring
          await clickWorld(page, setup.tower); await page.mouse.move(2, 300);
          await shoot(page, join(cdir, `hud${hud.replace(':', 'm')}--1440x900--range.png`), at);
          // the build menu and a ghost: a Villager, B, the first building, the pointer on the map
          const vil = await page.evaluate(() => { const { G } = endfall, v = G.units.filter(u => u.team === G.me && u.type === 'harvester' && !u.inside && !u.dead)[0]; return v && { x: v.x, y: v.y - 10 }; });
          if (vil) {
            await page.evaluate(([p]) => { endfall.centerOn(p.x, p.y); endfall.draw(); }, [vil]);
            await clickWorld(page, vil); await page.evaluate(() => endfall.draw()); await page.keyboard.press('b'); await page.evaluate(() => endfall.draw());
            await page.mouse.move(2, 300); await shoot(page, join(cdir, `hud${hud.replace(':', 'm')}--1440x900--build-menu.png`), vil);
            await page.locator('#cmd .cb:not(.gap)').nth(0).hover(); await page.evaluate(() => endfall.draw());
            await page.screenshot({ path: join(cdir, `hud${hud.replace(':', 'm')}--1440x900--tooltip.png`) });
            await page.locator('#cmd .cb:not(.gap)').nth(0).click(); await page.mouse.move(700, 380); await page.evaluate(() => endfall.draw());
            await page.screenshot({ path: join(cdir, `hud${hud.replace(':', 'm')}--1440x900--ghost.png`) });
            await page.keyboard.press('Escape');
          }
          // smaller windows: the breakpoints below the desktop layouts
          await selectArmy();
          for (const [w, h] of [[1024, 768], [800, 600], [600, 800]]) { await sizeTo(page, w, h); await shoot(page, join(cdir, `hud${hud.replace(':', 'm')}--${w}x${h}.png`), at); }
        }
      }
      log.errors.push(...errors.map(e => `hud ${hud} desk: ${e}`)); await ctx.close();
    }
    if (!ONLY || ONLY === 'retina') {
      const { ctx, page, errors, setup } = await staged(desk(1280, 720, 2), hud);
      log.setups[`${hud}-retina`] = setup; const at = aim(setup);
      log.shots.push({ hud, size: '2560x1440-dpr2', ...await shoot(page, join(dir, '2560x1440-dpr2.png'), at) });
      await closeup(page, join(dir, 'closeup-dpr2.png'), setup, 640, 400);
      log.errors.push(...errors.map(e => `hud ${hud} retina: ${e}`)); await ctx.close();
    }
    if (!ONLY || ONLY === 'phone') {
      const { ctx, page, errors, setup } = await staged(PHONE, hud);
      log.setups[`${hud}-phone`] = setup; const at = aim(setup);
      log.shots.push({ hud, size: 'phone-844x390', ...await shoot(page, join(dir, 'phone-844x390.png'), { x: setup.army.x, y: setup.army.y + 10 }) });
      log.errors.push(...errors.map(e => `hud ${hud} phone: ${e}`)); await ctx.close();
    }
  }
  const hashes = Object.values(log.setups).map(s => `${s.time}:${s.hash}`);
  log.sameWorld = hashes.every(h => h === hashes[0]);
} finally { await stop(); }
mkdirSync(join(root, 'target/hud'), { recursive: true });
writeFileSync(join(root, 'target/hud', `shots-${HUDS.join('').replace(/:/g, 'm')}${ONLY}.json`), JSON.stringify(log, null, 1));
console.log(JSON.stringify({ setup: Object.values(log.setups)[0], sameWorld: log.sameWorld, errors: log.errors }));
