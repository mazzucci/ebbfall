// The desktop review's stills (view-capture.mjs --set review; branch desktop-review): one staged game shot at every
// start span (?span=) and HUD variant (?hud=) of a screen, with the numbers read from the running page.
//   node tools/view-capture.mjs --set review --screen 1920x1080 [--rec 1200,2] [--only menu,start,fight,tooltip,army]
//   node tools/view-capture.mjs --set review --exact before|after   (ENDFALL_DIST: the build; the phone and a desktop, no switches)
//   node tools/view-capture.mjs --set review --sheet [--screen NAME] (the sheets, numbers.json and numbers.md of what was shot)
// Screens (SCREENS): the priority ones are shot whole (start and fight at spans 900, 1200, 1500 x hud 0, 1, 2; the
// tooltip, the army and the menu at the recommended span x hud 0, 1, 2); the others at the three spans with today's
// HUD and the recommended pair (--rec span,hud); 1280x720 the HUD's variants only. Two variants of one zoom and HUD
// are shot once (`spans`: the spans the still stands for).
// The world: view-capture's hud set (seed 4242, hudStage: a base at about four minutes, a raid met beyond its ridge),
// the clock held, every frame drawn by hand. Three instants, each with one state hash on every screen:
//   start   the game's first instant, framed as main.js frames it;
//   fight   after hudStage: the Barracks clicked, four units queued through its buttons, 2 s more; the camera on FIGHT_AT;
//   (tooltip: the fight with the pointer over the card's first button; army: the same instant, the army selected with Q;
//   unit: the same instant, one Knight clicked: the console's stat figures; over: a toast and a hint put over the
//   minimap by hand, for their places.)
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { start, stop, browserContext, baseUrl, board } from '../test/e2e/harness.mjs';

export const SCREENS = {
  '1920x1080': { w: 1920, h: 1080, dpr: 1, full: true, label: '1920x1080 at DPR 1 (a full HD monitor, full screen)' },
  '1920x950': { w: 1920, h: 950, dpr: 1, full: true, label: '1920x950 at DPR 1 (a browser window on a full HD monitor)' },
  '1728x1000-dpr2': { w: 1728, h: 1000, dpr: 2, full: true, label: '1728x1000 at DPR 2 (a 16 inch MacBook Pro, a browser window)' },
  '1440x900': { w: 1440, h: 900, dpr: 1, label: '1440x900 at DPR 1' },
  '1280x720': { w: 1280, h: 720, dpr: 1, hudOnly: true, label: '1280x720 at DPR 1 (--u 0.9, the smallest HUD)' },
  '2560x1440': { w: 2560, h: 1440, dpr: 1, label: '2560x1440 at DPR 1' },
  '3440x1440': { w: 3440, h: 1440, dpr: 1, label: '3440x1440 at DPR 1 (ultrawide)' },
  '4k-dpr1': { w: 3840, h: 2160, dpr: 1, label: '3840x2160 at DPR 1 (a 4K screen at 100%)' },
  '4k-at-200pct': { w: 1920, h: 1080, dpr: 2, label: '3840x2160 at DPR 2 (a 4K screen at 200%: a 1920x1080 window)' },
};
const SPANS = [900, 1200, 1500], HUDS = [0, 1, 2];
const PHONE2 = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
/** The fight's camera point, from the Barracks (1456, 1680 on this map): 1440, 1475, the same for every screen, span
 *  and HUD. The melee (world y 1240 to 1490) and the Barracks (its foot at 1728) are 490 px apart with their art: a
 *  1920x1080 window at span 900 sees 506 px down, its foot under the console, so they cannot both stand clear there.
 *  The point keeps the melee whole and under the top bar's plates; at span 900 the Barracks stands half under the
 *  console (its name and queue are in the console) and the Castle under the card; from span 1200 all three are clear. */
const fightAt = (s) => ({ x: s.barracks.x - 16, y: s.barracks.y - 205 });
const AFTER_QUEUE = 2; // (seconds of game after the queue's clicks: its bar has moved, the melee still on)

/** In the page: the numbers of the frame on screen (sizes in CSS px unless said). */
function measure() {
  const e = window.endfall, { cam, view, G, engine } = e, W = innerWidth, H = innerHeight;
  const vis = (el) => { if (!el || el.hidden) return false; const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
  const first = (sel) => [...document.querySelectorAll(sel)].find(vis);
  const round = (x) => Math.round(x * 100) / 100;
  // --u: a probe 1000 units wide (0 where the desktop HUD's query does not hold)
  const probe = document.createElement('i'); probe.style.position = 'absolute'; probe.style.width = 'calc(var(--u, 0px) * 1000)'; document.body.appendChild(probe);
  const u = probe.getBoundingClientRect().width / 1000; probe.remove();
  const font = (sel) => { const el = first(sel); if (!el) return null; const cs = getComputedStyle(el); return { px: round(parseFloat(cs.fontSize)), face: cs.fontFamily.split(',')[0].replace(/"/g, ''), weight: cs.fontWeight }; };
  const box = (sel) => { const el = first(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [round(r.width), round(r.height)]; };
  const TEXT = {
    'number: gold': '#rShard', 'number: population': '#rSupply', 'key: POP label': '#lSupply', 'number: clock': '#rClock',
    'title: selection': '#info h2', 'body: selection words': '#info .sub', 'body: what it is for': '#info .what', 'number: health': '#hpNum', 'number: stats': '#mod .st', 'title: research': '.rt',
    'key: queue time left': '.qi .left', 'key: group tile letter': '.gi b', 'key: card label': '#cmd .cb .l', 'key: card hotkey': '#cmd .cb .k', 'key: card price': '#cmd .cb .c',
    'tooltip: words': '#cmdInfo .d', 'tooltip: name': '#cmdInfo b', 'tooltip: price': '#cmdInfo .c', 'tooltip: places': '#cmdInfo .pl', 'tooltip: stat chips': '#cmdInfo .stats:not(.small) .sc', 'tooltip: small chips': '#cmdInfo .stats.small .sc', 'tooltip: tag': '#cmdInfo .tg',
    'body: toast': '#msg .toast', 'body: hint': '#hint', 'key: tools button': '#tools .tb', 'top: help mark': '#top .ib.help',
  };
  const BOX = {
    'icon: top bar glyph': '#top .ib .ico', 'icon: gold': '#resShard .dot', 'icon: stats': '#mod .st .ico', 'icon: card symbol': '#cmd .cb .ico.gl', 'icon: card order': '#cmd .cb > .ico:not(.gl)', 'icon: queue symbol': '.qi .ico.gl',
    'icon: tooltip chip': '#cmdInfo .sc .ico', 'icon: tooltip sprite': '#cmdInfo .pic img', 'portrait: selection': '#selPor .por', 'portrait: group tile': '.gi .por',
    'box: top button': '#top .ib', 'box: gold plate': '#resShard', 'box: clock': '#resClock', 'box: card slot': '#cmd .cb', 'box: queue slot': '.qi', 'box: group tile': '.gi', 'box: console': '#info', 'box: card': '#cmd', 'box: minimap': '#minimap', 'box: tooltip': '#cmdInfo',
  };
  const text = {}, boxes = {};
  for (const [k, sel] of Object.entries(TEXT)) { const f = font(sel); if (f) text[k] = f; }
  for (const [k, sel] of Object.entries(BOX)) { const b = box(sel); if (b) boxes[k] = b; }
  // every text size on the HUD right now: each visible element with words of its own
  const sizes = {};
  for (const rootSel of ['#top', '#hud', '#cmdInfo', '#msg', '#hint', '#tools', '#tut']) for (const el of document.querySelectorAll(`${rootSel}, ${rootSel} *`)) {
    if (!vis(el) || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const px = round(parseFloat(getComputedStyle(el).fontSize)); (sizes[px] ||= []).push(el.id ? '#' + el.id : `${el.closest('[id]')?.id ? '#' + el.closest('[id]').id + ' ' : ''}${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`);
  }
  for (const k of Object.keys(sizes)) sizes[k] = [...new Set(sizes[k])];
  // the HUD's cover: every panel and plate on screen (they do not overlap but the tooltip over the card's edge)
  const cover = ['#resShard', '#resSup', '#resClock', '#top .ib', '#minimap', '#info', '#cmd', '#tools > *', '#tools .tb', '#cmdInfo', '#msg .toast', '#hint', '#tut']
    .flatMap(sel => [...document.querySelectorAll(sel)]).filter((el, i, a) => a.indexOf(el) === i && vis(el) && !(el.id === 'tools')).filter(el => !(el.matches('#tools > *') && el.querySelector('.tb')))
    .reduce((s, el) => { const r = el.getBoundingClientRect(); return s + r.width * r.height; }, 0);
  // the camera's room past the foot: the map's last row as far up the screen as the camera brings it
  const keep = { x: cam.x, y: cam.y };
  e.centerOn(cam.x + view.w / cam.zoom / 2, 1e7);
  const cv = document.getElementById('game').getBoundingClientRect(), mapFoot = cv.top + (engine.WH - cam.y) * cam.zoom;
  cam.x = keep.x; cam.y = keep.y;
  const mm = document.getElementById('minimap').getBoundingClientRect(), cmd = document.getElementById('cmd'), cr = cmd.getBoundingClientRect(), cs = getComputedStyle(cmd), info = document.getElementById('info');
  const row = parseFloat(cs.gridAutoRows), gap = parseFloat(cs.rowGap) || 0, pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  const reach = { mapFoot: round(mapFoot), minimapTop: round(mm.top), card3Top: round(cr.bottom - (3 * row + 2 * gap + pad)), cardTop: round(cr.top), consoleTop: vis(info) ? round(info.getBoundingClientRect().top) : null, consoleMaxTop: round(cr.bottom - parseFloat(getComputedStyle(info).maxHeight)) };
  const knight = e.unitTop('knight') * cam.zoom, res = view.dpr;
  // every label a card's button can carry (a unit's name, a building's short one, a research's with its numeral, an
  // order's word) against the room a slot gives it, in the label's own font: the ones that would be cut (an ellipsis)
  let labels = null; const lab = first('#cmd .cb .l');
  if (lab) {
    const cs = getComputedStyle(lab), slot = lab.parentElement, ss = getComputedStyle(slot);
    const ruler = document.createElement('span'); for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing']) ruler.style[k] = cs[k];
    ruler.style.position = 'absolute'; ruler.style.visibility = 'hidden'; ruler.style.whiteSpace = 'nowrap'; document.body.appendChild(ruler);
    const width = (n) => { ruler.textContent = n; return ruler.getBoundingClientRect().width; };
    const room = slot.clientWidth - parseFloat(ss.paddingLeft) - parseFloat(ss.paddingRight);
    const ups = Object.values(engine.UPGRADES || {}).flatMap(u => [1, 2, 3].slice(0, u.levels || 1).map(lv => (u.level_names || [])[lv - 1]?.[1] ?? ((u.short || u.name) + ((u.levels || 1) > 1 ? ' ' + ['', 'I', 'II', 'III'][lv] : ''))));
    const names = [...Object.values(engine.UNITS).map(d => d.name), ...Object.values(engine.BUILDINGS).map(d => d.short || d.name.split(' ').pop()), ...ups, ...Object.values(engine.ABILITIES || {}).map(a => a.name), 'Advanced', 'Deselect', 'Cancel', 'Resume', 'Repair', 'Attack', 'Rally'].filter(Boolean);
    const wide = [...new Set(names)].map(n => [n, round(width(n))]).sort((a, b) => b[1] - a[1]); ruler.remove();
    labels = { room: round(room), px: round(parseFloat(cs.fontSize)), count: wide.length, widest: wide.slice(0, 4), cut: wide.filter(([, w]) => w > room).map(([n]) => n) };
  }
  // how much of the window is ground the player has seen (the rest: the dark of ground never explored), by tile
  let tiles = 0, known = 0;
  for (let ty = Math.max(0, Math.floor(cam.y / 32)); ty < Math.min(engine.MH, Math.ceil((cam.y + view.h / cam.zoom) / 32)); ty++) for (let tx = Math.max(0, Math.floor(cam.x / 32)); tx < Math.min(engine.MW, Math.ceil((cam.x + view.w / cam.zoom) / 32)); tx++) { tiles++; if (G.explored[ty * engine.MW + tx]) known++; }
  return {
    window: [W, H], dpr: devicePixelRatio, res, span: e.review?.span ?? 900, hud: e.review?.hud ?? 0, u: Math.round(u * 1000) / 1000,
    zoom: cam.zoom, zoomLimit: e.zoomMin, startZoom: e.startZoom, seen: [round(view.w / cam.zoom), round(view.h / cam.zoom)],
    stretch: { units: res * cam.zoom / (2 / 1.2), buildings: res * cam.zoom / 2 }, // (texture px per world px: 2 / UNIT_SCALE for a unit, 2 for a building)
    knight: { px: round(knight), share: knight / H },
    minimap: { px: round(mm.width), width: mm.width / W, area: mm.width * mm.height / (W * H) },
    cover: cover / (W * H), lit: tiles ? known / tiles : 0, text, boxes, sizes, reach, labels,
    hash: engine.stateHash() >>> 0, time: G.time, selected: e.ui.sel.length,
  };
}

/** A page with the game loaded, the menu up, the clock installed (running until `begin` holds it). */
async function open(device, query = '') {
  const ctx = await browserContext(device), page = await ctx.newPage(), errors = [];
  if (device.hasTouch) await ctx.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('(no full screen)')); });
  page.setDefaultTimeout(300000);
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install();
  await page.goto(`${baseUrl()}?seed=4242${query}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page, errors, press: (sel) => device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click() };
}
/** Start the game (the Kingdom against the Expedition), the clock held from before its first frame. */
async function begin({ page, press }) {
  await press('#btnSolo');
  await board(page).race(1, 'vael');
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000); // (from here no frame runs unless drawn)
  await press('#btnStart');
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { polling: 100 });
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => { endfall.engine.disableAi(); for (const t of document.querySelectorAll('#msg .toast')) t.remove(); return { time: endfall.G.time, hash: endfall.engine.stateHash() >>> 0 }; });
}

export async function reviewSet({ arg, out, hudStage, tallShot }) {
  if (process.argv.includes('--sheet')) return sheets({ arg, out, tallShot });
  if (arg('--exact', '')) return exact({ arg, out, hudStage });
  const name = arg('--screen', '1920x1080'), S = SCREENS[name];
  if (!S) throw new Error(`--screen: one of ${Object.keys(SCREENS).join(', ')}`);
  const [recSpan, recHud] = arg('--rec', '1200,2').split(',').map(Number);
  const only = arg('--only', '').split(',').filter(Boolean), want = (k) => !only.length || only.includes(k);
  const dir = join(out, 'shots', name); mkdirSync(dir, { recursive: true }); mkdirSync(join(out, 'data'), { recursive: true });
  const file = join(out, 'data', `${name}.json`);
  const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const log = { screen: name, ...S, rec: [recSpan, recHud], dist: process.env.ENDFALL_DIST || 'dist', setup: {}, shots: [], errors: [] };
  // the variants of a scene: [span, hud] pairs
  const grid = S.hudOnly ? HUDS.map(h => [recSpan, h]) : S.full ? SPANS.flatMap(s => HUDS.map(h => [s, h])) : [...SPANS.map(s => [s, 0]), [recSpan, recHud]];
  const huds = HUDS.map(h => [recSpan, h]);
  await start();
  try {
    const p = await open({ viewport: { width: S.w, height: S.h }, deviceScaleFactor: S.dpr }), { page } = p;
    const set = (span, hud) => page.evaluate(([span, hud]) => { endfall.review.span = span; endfall.setHud(hud); }, [span, hud]);
    /** Shoot the frame as it stands (after `frame`, in the page: the camera), with its numbers. */
    const shot = async (scene, span, hud, frame, at, extra = {}) => {
      const tag = scene === 'menu' ? `hud${hud}` : `span${span}-hud${hud}`, f = `${name}-${tag}-${scene}.png`;
      const m = scene === 'menu' ? null : await page.evaluate(measure);
      await page.screenshot({ path: join(dir, f), timeout: 300000 });
      const s = { scene, span, hud, spans: [span], file: f, ...extra, ...(m || {}) };
      log.shots.push(s);
      console.log(`${f}${m ? `: zoom ${m.zoom.toFixed(3)}, u ${m.u}, minimap ${m.minimap.px} px, cover ${(m.cover * 100).toFixed(1)}%, hash ${m.hash}` : ''}`);
      return s;
    };
    /** A scene's variants, each distinct zoom and HUD once. */
    const each = async (scene, pairs, frame, after) => {
      for (const [span, hud] of pairs) {
        await set(span, hud);
        const z = await page.evaluate(frame.fn, frame.arg);
        const same = log.shots.find(s => s.scene === scene && s.hud === hud && Math.abs(s.zoom - z) < 1e-9);
        if (same) { same.spans.push(span); console.log(`${name} ${scene}: span ${span} hud ${hud} is span ${same.span}'s still (zoom ${z.toFixed(3)})`); continue; }
        if (after) await after(span, hud);
        await shot(scene, span, hud);
      }
    };
    if (want('menu') && S.full) {
      await page.waitForFunction(() => [...document.querySelectorAll('#start img')].every(i => i.complete));
      for (const hud of HUDS) {
        await set(recSpan, hud);
        const text = await page.evaluate(() => {
          const px = (sel) => { const el = [...document.querySelectorAll(sel)].find(x => x.getBoundingClientRect().width > 0); return el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * 100) / 100 : null; };
          return { 'menu: name': px('#menuHome h1'), 'menu: line (#menuTag)': px('#menuTag'), 'menu: mode buttons': px('#menuHome .ib.mode'), 'menu: small buttons': px('#menuHome .row .ib'), 'menu: trailer pill': px('#menuTrailer .play'), 'menu: links': px('#menuLinks a'), 'menu: build stamp': px('#menuHome .rec') };
        });
        Object.assign(await shot('menu', recSpan, hud), { text });
      }
    }
    log.setup.start = await begin(p);
    await page.mouse.move(2, 300);
    // the start: as main.js frames it (startOn over the Castle) at the start zoom of the variant
    const startFrame = { fn: () => {
      const { cam, view, G, engine } = endfall; cam.zoom = endfall.startZoom;
      const core = G.bldgs.find(b => b.team === G.me); endfall.centerOn(core.x + 40, core.y);
      cam.x = Math.min(Math.max(cam.x, 0), Math.max(0, engine.WW - view.w / cam.zoom)); cam.y = Math.max(0, cam.y);
      endfall.draw(); endfall.draw(); return cam.zoom;
    } };
    if (want('start') && !S.hudOnly) await each('start', grid, startFrame);
    if (want('fight') || want('tooltip') || want('army') || want('unit') || want('over')) {
      await set(900, 0);
      const setup = await page.evaluate(hudStage);
      await page.evaluate(() => endfall.draw());
      // the Barracks with a queue, as the hud set does it: clicked on the map, its first button three times and its second once
      const base = { x: setup.hq.x * 0.5 + setup.barracks.x * 0.5, y: setup.hq.y * 0.5 + setup.barracks.y * 0.5 + 40 };
      const b = await page.evaluate(([at, bk]) => { const { cam } = endfall; endfall.setResources(endfall.G.me, 2000, 0); cam.zoom = endfall.startZoom; endfall.centerOn(at.x, at.y); endfall.draw(); return { x: (bk.x - cam.x) * cam.zoom, y: (bk.y - cam.y) * cam.zoom }; }, [base, setup.barracks]);
      await page.mouse.click(b.x, b.y); await page.evaluate(() => endfall.draw());
      const train = page.locator('#cmd .cb:not(.gap):not(.cancel)');
      await train.nth(0).click(); await train.nth(0).click(); await page.evaluate(() => endfall.draw()); await train.nth(1).click(); await train.nth(0).click();
      const now = await page.evaluate(([sec]) => {
        const { G, engine } = endfall; endfall.skip(sec); endfall.setResources(G.me, 385, 0); G.events.length = 0; for (const el of document.querySelectorAll('#msg .toast')) el.remove();
        const mine = G.units.filter(u => u.team === G.me && !u.dead && !engine.UNITS[u.type].worker), foes = G.units.filter(u => u.team !== G.me && !u.dead);
        const mid = (a) => ({ x: a.reduce((s, u) => s + u.x, 0) / a.length, y: a.reduce((s, u) => s + u.y, 0) / a.length });
        const bk = G.bldgs.find(x => x.team === G.me && x.type === 'barracks'), hq = G.bldgs.find(x => x.team === G.me && engine.BUILDINGS[x.type].hq);
        const rect = (k) => ({ x: k.x, y: k.y, w: k.w * 32, h: k.h * 32 });
        return { time: G.time, hash: engine.stateHash() >>> 0, alive: [mine.length, foes.length], army: mid(mine), foes: mid(foes), barracks: rect(bk), hq: rect(hq), queue: bk.queue.length, selected: endfall.ui.sel.map(x => x.type) };
      }, [AFTER_QUEUE]);
      await page.mouse.move(2, 300);
      log.setup.fight = { staged: setup, ...now, at: fightAt(now) };
      console.log(`${name}: the fight at ${now.time.toFixed(2)} s, hash ${now.hash}, ${now.alive[0]} against ${now.alive[1]}, the camera on ${Math.round(log.setup.fight.at.x)}, ${Math.round(log.setup.fight.at.y)}, selected ${now.selected}`);
      const fightFrame = { fn: ([at]) => {
        const { cam } = endfall; cam.zoom = endfall.startZoom; endfall.centerOn(at.x, at.y); endfall.draw(); endfall.draw();
        for (const t of document.querySelectorAll('.toast')) t.style.animation = 'none';
        return cam.zoom;
      }, arg: [log.setup.fight.at] };
      if (want('fight') && !S.hudOnly) await each('fight', grid, fightFrame);
      if (want('tooltip') && (S.full || S.hudOnly)) for (const [span, hud] of huds) {
        await set(span, hud); await page.evaluate(fightFrame.fn, fightFrame.arg);
        await train.nth(0).hover(); // (the pointer over the card's first button: its details, as a player sees them)
        await shot('tooltip', span, hud);
        await page.mouse.move(2, 300);
      }
      if (want('army') && (S.full || S.hudOnly)) {
        await page.keyboard.press('q'); await page.mouse.move(2, 300);
        for (const [span, hud] of huds) { await set(span, hud); await page.evaluate(fightFrame.fn, fightFrame.arg); await shot('army', span, hud); }
      }
      if (want('over') && (S.full || S.hudOnly)) { // (a toast and a hint over the minimap, set by hand: where the style sheet puts them)
        await page.evaluate(() => {
          const t = document.createElement('div'); t.className = 'toast'; t.textContent = 'Not enough gold'; t.style.animation = 'none'; document.getElementById('msg').appendChild(t);
          const h = document.getElementById('hint'); h.dataset.was = h.textContent; h.textContent = 'Right-click: move · A then click: attack-move';
        });
        for (const [span, hud] of huds) {
          await set(span, hud); await page.evaluate(fightFrame.fn, fightFrame.arg);
          const over = await page.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(), m = r('minimap'), h = r('hint'), t = document.querySelector('#msg .toast').getBoundingClientRect(); return { minimapTop: m.top, hintTop: h.top, hintBottom: h.bottom, toastTop: t.top, toastBottom: t.bottom, hintGap: m.top - h.bottom, toastGap: h.top - t.bottom, left: [m.left, h.left, t.left] }; });
          Object.assign(await shot('over', span, hud), { over });
        }
        await page.evaluate(() => { document.querySelector('#msg .toast')?.remove(); const h = document.getElementById('hint'); h.textContent = h.dataset.was || ''; });
      }
      if (want('unit') && (S.full || S.hudOnly)) { // (one Knight, clicked: the one nearest the base, as the hud set does)
        await set(recSpan, 0); await page.evaluate(fightFrame.fn, fightFrame.arg);
        const k = await page.evaluate(([hq]) => { const { G, cam } = endfall, k = G.units.filter(u => u.team === G.me && u.type === 'knight' && !u.dead).sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0]; return { x: (k.x - cam.x) * cam.zoom, y: (k.y - endfall.unitTop('knight') / 3 - cam.y) * cam.zoom }; }, [setup.hq]);
        await page.mouse.click(k.x, k.y); await page.mouse.move(2, 300);
        for (const [span, hud] of huds) { await set(span, hud); await page.evaluate(fightFrame.fn, fightFrame.arg); await shot('unit', span, hud); }
      }
    }
    log.errors.push(...p.errors);
    await p.ctx.close();
  } finally { await stop(); }
  if (prev && only.length) { log.shots = [...prev.shots.filter(s => !log.shots.some(t => t.file === s.file)), ...log.shots]; log.setup = { ...prev.setup, ...log.setup }; }
  const hashes = (scene) => [...new Set(log.shots.filter(s => s.scene === scene).map(s => s.hash))];
  log.sameWorld = Object.fromEntries(['start', 'fight', 'tooltip', 'army', 'over', 'unit'].map(k => [k, hashes(k)]));
  writeFileSync(file, JSON.stringify(log, null, 1));
  console.log(JSON.stringify({ screen: name, setup: { start: log.setup.start, fight: log.setup.fight && { time: log.setup.fight.time, hash: log.setup.fight.hash } }, sameWorld: log.sameWorld, errors: log.errors }));
}

/** The exactness check: the build at hand (ENDFALL_DIST) with no switch, on the phone (DPR 2, touch) and on a desktop
 *  (1920x1080 and 1280x720), tagged before (main) or after (the branch): the files of the two tags are compared byte for
 *  byte by the caller (cmp): the start, and the base with the army selected (the whole HUD up). */
async function exact({ arg, out, hudStage }) {
  const tag = arg('--exact'), dir = join(out, 'exact'); mkdirSync(dir, { recursive: true });
  const log = { tag, dist: process.env.ENDFALL_DIST || 'dist', shots: [], errors: [] };
  await start();
  try {
    for (const [name, device, touch] of [['phone-844x390', PHONE2, true], ['1920x1080', { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, false], ['1280x720', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, false]]) {
      const p = await open(device), { page } = p;
      const first = await begin(p);
      await page.mouse.move(2, 300);
      const still = async (scene, at) => {
        const s = await page.evaluate(([at]) => {
          const { cam, view, G, engine } = endfall; cam.zoom = endfall.startZoom;
          if (at) endfall.centerOn(at.x, at.y);
          else { const core = G.bldgs.find(b => b.team === G.me); endfall.centerOn(core.x + 40, core.y); cam.x = Math.min(Math.max(cam.x, 0), Math.max(0, engine.WW - view.w / cam.zoom)); cam.y = Math.max(0, cam.y); }
          endfall.draw(); endfall.draw();
          for (const t of document.querySelectorAll('.toast')) t.style.animation = 'none';
          return { zoom: cam.zoom, hash: engine.stateHash() >>> 0, time: G.time, selected: endfall.ui.sel.length };
        }, [at]);
        const f = `${name}-${tag}-${scene}.png`;
        await page.screenshot({ path: join(dir, f), timeout: 300000 });
        log.shots.push({ file: f, screen: name, scene, ...s }); console.log(`${f}: zoom ${s.zoom.toFixed(3)}, hash ${s.hash}, ${s.selected} selected`);
      };
      await still('start', null);
      const setup = await page.evaluate(hudStage);
      await page.evaluate(() => endfall.draw());
      if (touch) await page.locator('#btnArmy').tap(); else await page.keyboard.press('q');
      await page.mouse.move(2, 300);
      await still('fight', touch ? { x: setup.army.x, y: setup.army.y + 10 } : { x: setup.field.x * 0.66 + setup.hq.x * 0.34, y: setup.field.y * 0.76 + setup.hq.y * 0.24 });
      // (the fight's stills differ from run to run of one build: a drone's rotors turn by the wall clock. The base, the
      // same HUD over it, has nothing that does: this one is compared byte for byte)
      await still('base', { x: setup.hq.x - 60, y: setup.hq.y - 20 });
      log.errors.push(...p.errors.map(e => `${name}: ${e}`)); log.first = first;
      await p.ctx.close();
    }
  } finally { await stop(); }
  writeFileSync(join(dir, `shots-${tag}.json`), JSON.stringify(log, null, 1));
  console.log(JSON.stringify({ tag, errors: log.errors }));
}

const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const CSS = `body { margin: 0; padding: 24px; background: #0b0f16; color: #e8e2d4; font: 15px/1.4 system-ui, sans-serif; }
  h1 { font-size: 26px; margin: 0 0 4px; } p { margin: 0 0 14px; color: #b9b2a3; max-width: 1900px; } h2 { font-size: 20px; margin: 30px 0 8px; } h3 { font-size: 16px; margin: 18px 0 6px; color: #ffd27a; }
  .row { display: grid; gap: 12px; align-items: start; margin-bottom: 12px; } figure { margin: 0; } figure > img { width: 100%; display: block; outline: 1px solid #444; }
  figcaption { margin-top: 4px; color: #cfc7b6; font-size: 13px; } figcaption b { color: #fff; }
  .crop { overflow: hidden; position: relative; outline: 1px solid #444; background: #000; } .crop img { position: absolute; max-width: none; }
  table { border-collapse: collapse; font-size: 13px; margin: 6px 0 14px; } td, th { border: 1px solid #3a4658; padding: 3px 8px; text-align: right; } th { color: #ffd27a; } td:first-child, th:first-child { text-align: left; }`;

/** The sheets of every screen shot so far (or --screen's): <screen>-sheet.png (every still, a row a HUD variant, a
 *  column a span) and <screen>-hud-crops.png (the HUD's pieces at the screen's own pixels, today beside hud 1 and 2),
 *  then numbers.json and numbers.md (every screen's numbers). */
async function sheets({ arg, out, tallShot }) {
  const one = arg('--screen', ''), names = Object.keys(SCREENS).filter(n => existsSync(join(out, 'data', `${n}.json`)));
  const data = Object.fromEntries(names.map(n => [n, JSON.parse(readFileSync(join(out, 'data', `${n}.json`), 'utf8'))]));
  const cap = (s) => `<b>span ${s.spans.join(' = ')} · hud ${s.hud}</b> · zoom ${s.zoom.toFixed(2)} · sees ${Math.round(s.seen[0])} × ${Math.round(s.seen[1])} world px · stretch: units ${s.stretch.units.toFixed(2)}×, buildings ${s.stretch.buildings.toFixed(2)}× · a Knight ${s.knight.px.toFixed(0)} px, ${pct(s.knight.share)} of the height · --u ${s.u} · minimap ${s.minimap.px.toFixed(0)} px, ${pct(s.minimap.width)} of the width, ${pct(s.minimap.area)} of the screen · HUD covers ${pct(s.cover)}${s.scene === 'start' ? ` · ${pct(s.lit, 0)} of the window is ground seen (the rest: the dark)` : ''}`;
  await start();
  try {
    for (const n of names) {
      if (one && one !== n) continue;
      const d = data[n], S = SCREENS[n], dir = join(out, 'shots', n), img = (s) => `shots/${n}/${s.file}`;
      const of = (scene) => d.shots.filter(s => s.scene === scene);
      // every still: a row a HUD variant, a column a span
      let html = `<!doctype html><meta charset="utf-8"><style>${CSS} body { width: 2900px; }</style><h1>${S.label}</h1>
        <p>One staged game (seed 4242), the clock held: every still of a scene is the same instant (state hash ${Object.entries(d.sameWorld).filter(([, v]) => v.length).map(([k, v]) => `${k} ${v.join('/')}`).join(', ')}). span: the world px a window shows across when a game starts (900 is today's). hud 0: today's HUD (--u up to 1.4); hud 1: --u at most 1.0 with the size table; hud 2: at most 1.1. Stills are scaled to fit; open the PNGs in shots/${n}/ for the screen's own pixels, and ${n}-hud-crops.png for the HUD's pieces at 100%.</p>`;
      for (const [scene, head] of [['start', 'The start: the first instant, framed as a game starts'], ['fight', 'The fight: the Barracks selected (its queue), the raid met beyond the ridge'], ['tooltip', 'The tooltip: the pointer over the card\'s first button'], ['army', 'The army selected (Q): the group panel'], ['unit', 'One Knight selected (a click): the console\'s stat figures'], ['over', 'A toast and a hint over the minimap (set by hand: their places)'], ['menu', 'The menu\'s first page']]) {
        const shots = of(scene); if (!shots.length) continue;
        html += `<h2>${head}</h2>`;
        const hudsHere = [...new Set(shots.map(s => s.hud))].sort(), cols = scene === 'start' || scene === 'fight' ? [...new Set(shots.map(s => s.span))].sort((a, b) => a - b) : null;
        if (cols && !S.hudOnly && S.full) for (const h of hudsHere) html += `<div class="row" style="grid-template-columns:repeat(${cols.length},1fr)">${cols.map(c => { const s = shots.find(x => x.hud === h && x.span === c); return s ? `<figure><img src="${img(s)}"><figcaption>${cap(s)}</figcaption></figure>` : '<figure></figure>'; }).join('')}</div>`;
        else html += `<div class="row" style="grid-template-columns:repeat(${Math.min(3, shots.length)},1fr)">${shots.map(s => `<figure><img src="${img(s)}"><figcaption>${scene === 'menu' ? `<b>hud ${s.hud}</b> · ${Object.entries(s.text || {}).map(([k, v]) => `${k.replace('menu: ', '')} ${v} px`).join(' · ')}` : cap(s)}</figcaption></figure>`).join('')}</div>`;
      }
      writeFileSync(join(out, `${n}-sheet.html`), html);
      const ctx = await browserContext({ viewport: { width: 2948, height: 1000 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
      await page.goto(pathToFileURL(join(out, `${n}-sheet.html`)).href);
      await page.waitForFunction(() => [...document.images].every(i => i.complete));
      await tallShot(page, join(out, `${n}-sheet.png`));
      console.log(`${n}-sheet.png`);
      // the HUD's pieces at the screen's own pixels: today, hud 1, hud 2 (the recommended span)
      const k = S.dpr, [W, H] = [S.w * k, S.h * k];
      const piece = (s, x, y, w, h) => `<div class="crop" style="width:${w}px;height:${h}px"><img src="${img(s)}" style="left:${-x}px;top:${-y}px;width:${W}px;height:${H}px"></div>`;
      const PIECES = [ // (in CSS px of the window, as fractions where the HUD's size changes: generous boxes round each corner)
        ['fight', 'Top left: gold and population', () => [0, 0, 420, 110]], ['fight', 'Top right: the clock and the buttons', () => [S.w - 560, 0, 560, 110]],
        ['fight', 'Bottom left: the minimap', () => [0, S.h - 370, 370, 370]], ['over', 'Bottom left: a hint and a toast over the minimap', () => [0, S.h - 440, 560, 440]], ['fight', 'Bottom middle: the console (the Barracks, its queue)', () => [Math.round(S.w / 2 - 540), S.h - 260, 1080, 260]],
        ['tooltip', 'Bottom right: the card and a button\'s tooltip', () => [S.w - 640, S.h - 560, 640, 560]], ['army', 'Bottom middle: the group panel (the army selected)', () => [Math.round(S.w / 2 - 540), S.h - 300, 1080, 300]],
        ['army', 'Bottom right: an army\'s card', () => [S.w - 440, S.h - 300, 440, 300]], ['unit', 'Bottom middle: one unit (a Knight): its stat figures', () => [Math.round(S.w / 2 - 540), S.h - 260, 1080, 260]],
      ];
      let crops = `<!doctype html><meta charset="utf-8"><style>${CSS} body { width: ${Math.max(1900, 3 * 1080 * k + 80)}px; } .row { justify-content: start; }</style><h1>${S.label}: the HUD's pieces at the screen's own pixels</h1>
        <p>Cut from the stills at span ${d.rec[0]}, not scaled${k > 1 ? ` (DPR ${k}: each piece is ${k}× its CSS size here; on the real panel it is as small as the CSS px say)` : ''}: today's HUD (hud 0), hud 1 (--u at most 1.0) and hud 2 (--u at most 1.1), both with the size table.</p>`;
      for (const [scene, head, rect] of PIECES) {
        const shots = of(scene).filter(s => s.span === d.rec[0] || s.spans.includes(d.rec[0])).sort((a, b) => a.hud - b.hud); if (shots.length < 2) continue;
        const [x, y, w, h] = rect().map(v => v * k);
        crops += `<h3>${head}</h3><div class="row" style="grid-template-columns:repeat(${shots.length},${w}px)">${shots.map(s => `<figure>${piece(s, x, y, w, h)}<figcaption><b>hud ${s.hud}</b> · --u ${s.u}</figcaption></figure>`).join('')}</div>`;
      }
      if (of('tooltip').length || of('army').length || of('unit').length) {
        writeFileSync(join(out, `${n}-hud-crops.html`), crops);
        await page.setViewportSize({ width: Math.max(1948, 3 * 1080 * k + 128), height: 1000 });
        await page.goto(pathToFileURL(join(out, `${n}-hud-crops.html`)).href);
        await page.waitForFunction(() => [...document.images].every(i => i.complete));
        await tallShot(page, join(out, `${n}-hud-crops.png`));
        console.log(`${n}-hud-crops.png`);
      }
      await ctx.close();
    }
  } finally { await stop(); }
  // the numbers: one file, and the tables in Markdown
  const all = names.flatMap(n => data[n].shots.filter(s => s.scene !== 'menu').map(s => ({ screen: n, ...s })));
  writeFileSync(join(out, 'numbers.json'), JSON.stringify({ screens: Object.fromEntries(names.map(n => [n, { ...SCREENS[n], rec: data[n].rec, setup: data[n].setup, sameWorld: data[n].sameWorld, errors: data[n].errors }])), shots: all }, null, 1));
  let md = '# The numbers (read from the running page)\n\nGenerated by `node tools/view-capture.mjs --set review --sheet`. Stretch: device px per texture px (zoom x RES over 1.667 for units, 2.0 for buildings). A Knight: its drawn height over the window\'s height. The HUD\'s cover: the panels\' and plates\' area over the window\'s, in the fight (the Barracks selected).\n';
  md += '\n## The zoom, per screen and span (today\'s HUD)\n\n| screen | span | zoom | sees (world px) | units | buildings | a Knight (px) | of the height | ground seen at the start |\n|---|---|---|---|---|---|---|---|---|\n';
  for (const n of names) for (const s of data[n].shots.filter(s => s.scene === 'start' && s.hud === 0)) md += `| ${n} | ${s.spans.join(' = ')} | ${s.zoom.toFixed(3)} | ${Math.round(s.seen[0])} x ${Math.round(s.seen[1])} | ${s.stretch.units.toFixed(2)}x | ${s.stretch.buildings.toFixed(2)}x | ${s.knight.px.toFixed(1)} | ${pct(s.knight.share)} | ${pct(s.lit, 0)} |\n`;
  md += '\n## The HUD, per screen and variant (the fight; the tooltip where there is no fight still)\n\n| screen | hud | --u | minimap (px) | of the width | of the screen | HUD covers | gold number | title | body | key | card slot | top button |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const n of names) for (const h of HUDS) {
    const s = data[n].shots.find(s => s.scene === 'fight' && s.hud === h && (s.span === data[n].rec[0] || s.spans.includes(data[n].rec[0]))) || data[n].shots.find(s => s.scene === 'fight' && s.hud === h) || data[n].shots.find(s => s.scene === 'tooltip' && s.hud === h);
    if (!s) continue;
    const t = (k) => s.text[k]?.px ?? '-', b = (k) => s.boxes[k] ? s.boxes[k].map(v => Math.round(v)).join(' x ') : '-';
    md += `| ${n} | ${h} | ${s.u} | ${s.minimap.px.toFixed(0)} | ${pct(s.minimap.width)} | ${pct(s.minimap.area)} | ${pct(s.cover)} | ${t('number: gold')} | ${t('title: selection')} | ${t('body: selection words')} | ${t('key: card hotkey')} | ${b('box: card slot')} | ${b('box: top button')} |\n`;
  }
  md += '\n## Every text role and icon (px), per screen and HUD variant\n';
  for (const n of names) {
    const d = data[n], pick = (h) => ['fight', 'tooltip', 'army', 'unit'].map(sc => d.shots.find(s => s.scene === sc && s.hud === h && (s.span === d.rec[0] || s.spans.includes(d.rec[0]))) || d.shots.find(s => s.scene === sc && s.hud === h)).filter(Boolean);
    const hs = HUDS.filter(h => pick(h).length); if (!hs.length) continue;
    const merged = Object.fromEntries(hs.map(h => [h, pick(h).reduce((m, s) => ({ text: { ...s.text, ...m.text }, boxes: { ...s.boxes, ...m.boxes }, sizes: Object.keys(s.sizes).reduce((z, k) => ({ ...z, [k]: [...new Set([...(z[k] || []), ...s.sizes[k]])] }), m.sizes) }), { text: {}, boxes: {}, sizes: {} })]));
    md += `\n### ${n}\n\n| role | ${hs.map(h => `hud ${h}`).join(' | ')} |\n|---|${hs.map(() => '---').join('|')}|\n`;
    const keys = [...new Set(hs.flatMap(h => Object.keys(merged[h].text)))];
    for (const k of keys) md += `| ${k} | ${hs.map(h => merged[h].text[k]?.px ?? '-').join(' | ')} |\n`;
    for (const k of [...new Set(hs.flatMap(h => Object.keys(merged[h].boxes)))]) md += `| ${k} | ${hs.map(h => merged[h].boxes[k] ? merged[h].boxes[k].map(v => Math.round(v * 10) / 10).join(' x ') : '-').join(' | ')} |\n`;
    md += `| distinct text sizes on the HUD (fight, tooltip, army, unit) | ${hs.map(h => { const z = Object.keys(merged[h].sizes).map(Number).sort((a, b) => a - b); return `${z.length}: ${z.join(', ')}`; }).join(' | ')} |\n`;
    md += `| smallest text | ${hs.map(h => Math.min(...Object.keys(merged[h].sizes).map(Number))).join(' | ')} |\n`;
    const r = (h) => pick(h)[0].reach;
    md += `| card labels that would be cut, of ${pick(hs[0])[0].labels?.count ?? '?'} (room, px) | ${hs.map(h => { const l = pick(h)[0].labels; return l ? `${l.cut.length ? l.cut.join(', ') : 'none'} (${l.room} px; the widest: ${l.widest[0][0]} ${l.widest[0][1]} px)` : '-'; }).join(' | ')} |\n`;
    md += `| the map's last row at its highest (px from the top) | ${hs.map(h => r(h).mapFoot).join(' | ')} |\n| the minimap's top | ${hs.map(h => r(h).minimapTop).join(' | ')} |\n| a three-row card's top | ${hs.map(h => r(h).card3Top).join(' | ')} |\n`;
    data[n].merged = merged;
  }
  writeFileSync(join(out, 'numbers.md'), md);
  writeFileSync(join(out, 'sizes.json'), JSON.stringify(Object.fromEntries(names.filter(n => data[n].merged).map(n => [n, data[n].merged])), null, 1));
  console.log('numbers.json, numbers.md, sizes.json');
}
