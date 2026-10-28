// The device smoke: on each device, the first page, SINGLE PLAYER, START GAME, the game, the sound and full-screen
// buttons, and what the page says of itself (window.endfall: the audio context, full screen, its errors). Screenshots and
// summary.json go to --out. Exits 1 when a device failed (it could not start a game, or the page had errors).
//   node tools/devices/smoke.mjs --devices ipad,iphone,pixel --url https://ebbfall.com/ --backend local --out devices-out
// Backends (drivers.mjs): browserstack (the default when BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY are set),
// simulator (iOS, through Appium), emulator (Android, through adb), local (Playwright's WebKit or Chromium; the default
// otherwise). See README.md.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DEVICES } from './devices.mjs';
import { openDriver, defaultBackend } from './drivers.mjs';

const { values: o } = parseArgs({ options: {
  devices: { type: 'string', default: process.env.DEVICES || Object.keys(DEVICES).join(',') },
  url: { type: 'string', default: process.env.DEVICES_URL || 'https://ebbfall.com/' },
  backend: { type: 'string', default: process.env.DEVICES_BACKEND || defaultBackend() },
  out: { type: 'string', default: process.env.DEVICES_OUT || 'devices-out' },
} });
mkdirSync(o.out, { recursive: true });

// What the page says of itself. Builds before endfall.status() (2026-10-28) answer from the DOM, without the audio.
const STATUS = `(function () {
  var e = window.endfall, b = document.getElementById('btnFull'), s = document.getElementById('btnSound');
  var st = e && typeof e.status === 'function' ? e.status() : { audio: 'unknown', muted: null, fullscreen: !!(document.fullscreenElement || document.webkitFullscreenElement), errors: (window.endfallErrors || []).slice() };
  st.started = !!(e && e.G && e.G.units.length > 0);
  st.fullscreenElement = document.fullscreenElement ? document.fullscreenElement.tagName : (document.webkitFullscreenElement ? document.webkitFullscreenElement.tagName : null);
  st.fullscreenButton = !!b && !b.hidden; st.soundButton = s ? s.getAttribute('aria-pressed') : null;
  var start = document.getElementById('start');
  st.menuShown = !!start && !start.hidden; st.toasts = Array.prototype.map.call(document.querySelectorAll('#msg .toast'), function (t) { return t.textContent; });
  st.viewport = [innerWidth, innerHeight, devicePixelRatio]; st.userAgent = navigator.userAgent;
  return st;
})()`;
// A build without its own error capture (before endfall.status()): catch what goes wrong from the menu on.
const CATCH = `(function () {
  if (window.endfallErrors) return false;
  window.endfallErrors = [];
  var keep = function (m) { if (endfallErrors.length < 20) endfallErrors.push(String(m)); };
  addEventListener('error', function (e) { keep(e.message || String(e.error)); });
  addEventListener('unhandledrejection', function (e) { keep('unhandled rejection: ' + ((e.reason && e.reason.message) || e.reason)); });
  return true;
})()`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitFor(d, expr, ms, what) {
  const until = Date.now() + ms;
  for (;;) {
    try { if (await d.eval(expr)) return; } catch (e) { if (process.env.DEVICES_DEBUG) console.log(`  (${what}: ${e.message.split("\n")[0]})`); } // (the page is loading)
    if (Date.now() > until) throw new Error(`timed out after ${ms / 1000} s waiting for ${what}`);
    await sleep(500);
  }
}

/** Tap `css` and wait for `expr`; a tap that changes nothing in 30 s is retried as a script's click (and said so: the
 *  device took the touch but the page did not act on it, worth a look on the real thing). */
async function press(d, css, expr, ms, what) {
  await d.tap(css);
  try { await waitFor(d, expr, Math.min(ms, 30000), what); return {}; } catch (e) { if (ms <= 30000 || !d.scriptClick) throw e; }
  console.log(`  ${css}: the tap changed nothing in 30 s; a script's click`);
  await d.scriptClick(css);
  await waitFor(d, expr, ms - 30000, what);
  return { nativeTapIgnored: true };
}

async function smoke(key) {
  const r = { device: key, label: DEVICES[key].label, backend: o.backend, url: o.url, ok: false, steps: [], screenshots: [], session: null, status: {} };
  let d;
  const shot = async (name) => { const f = `${key}-${name}.png`; writeFileSync(join(o.out, f), await d.screenshot()); r.screenshots.push(f); };
  const step = async (name, fn) => {
    const t = Date.now(), s = { name, ok: false, ms: 0 };
    r.steps.push(s);
    try { s.result = await fn(); s.ok = true; } catch (e) { s.error = e.message.split('\n')[0]; throw e; } finally { s.ms = Date.now() - t; }
  };
  try {
    await step('open the device', async () => { d = await openDriver(o.backend, key, { url: o.url }); r.on = d.device || DEVICES[key].label; });
    await step('the first page', async () => {
      await d.goto(o.url);
      await waitFor(d, `!!window.endfall && !!document.getElementById('btnSolo') && !document.getElementById('menuHome').hidden`, 180000, 'the menu');
      await d.eval(CATCH);
      await shot('1-menu');
    });
    await step('SINGLE PLAYER', () => press(d, '#btnSolo', `!document.getElementById('menuSolo').hidden`, 60000, 'the single-player page'));
    await step('START GAME', async () => {
      const how = await press(d, '#btnStart', `!!(window.endfall && endfall.G && endfall.G.units.length > 0)`, 180000, 'the game');
      await sleep(3000); // (a few frames drawn)
      await shot('2-game');
      return { ...how, ...(await d.eval(STATUS)) };
    });
    await step('the sound button', async () => {
      await d.tap('#btnSound'); await sleep(500); const off = await d.eval(STATUS);
      await d.tap('#btnSound'); await sleep(500); const on = await d.eval(STATUS);
      if (off.soundButton !== 'false' || on.soundButton !== 'true') throw new Error(`the sound button read ${off.soundButton}, then ${on.soundButton}`);
      return { off: { muted: off.muted, audio: off.audio }, on: { muted: on.muted, audio: on.audio } };
    });
    await step('the full-screen button', async () => {
      const before = await d.eval(STATUS);
      if (!before.fullscreenButton) return { shown: false, fullscreen: before.fullscreen }; // (iPhone Safari: no full-screen API)
      await d.tap('#btnFull'); await sleep(1500); const a = await d.eval(STATUS); await shot('3-full-screen-toggled');
      await d.tap('#btnFull'); await sleep(1500); const b = await d.eval(STATUS);
      return { shown: true, before: before.fullscreen, afterTap: a.fullscreen, afterSecondTap: b.fullscreen };
    });
    r.status = await d.eval(STATUS);
    r.ok = r.status.started && r.status.errors.length === 0;
    const ignored = r.steps.filter(x => x.result && x.result.nativeTapIgnored).map(x => x.name);
    if (ignored.length) r.note = `the device's tap did nothing on ${ignored.join(', ')}: a script's click went on`;
    if (!r.ok) r.reason = r.status.errors.length ? `page errors: ${r.status.errors.join(' | ')}` : 'no game running at the end';
  } catch (e) {
    r.reason = e.message.split('\n')[0];
    try { if (d) { await shot('failed'); r.status = await d.eval(STATUS); } } catch { /* the device is gone */ }
  } finally {
    if (d) {
      r.session = await d.link().catch(() => null);
      await d.finish(r.ok, r.ok ? 'smoke passed' : r.reason);
      await d.close().catch(() => {});
    }
  }
  return r;
}

const results = [];
for (const key of o.devices.split(',').map(s => s.trim()).filter(Boolean)) {
  if (!DEVICES[key]) { console.error(`unknown device ${key}: one of ${Object.keys(DEVICES).join(', ')}`); process.exitCode = 2; continue; }
  console.log(`${key}: ${o.backend}, ${o.url}`);
  const r = await smoke(key);
  results.push(r);
  console.log(`${key}: ${r.ok ? 'PASS' : 'FAIL'}${r.on ? ` on ${r.on}` : ''}${r.reason ? `: ${r.reason}` : ''}${r.note ? ` (${r.note})` : ''}`);
  console.log(`  audio ${r.status.audio}, full screen ${r.status.fullscreen}, errors ${JSON.stringify(r.status.errors || [])}${r.session ? `\n  session ${r.session}` : ''}`);
}
writeFileSync(join(o.out, 'summary.json'), JSON.stringify({ date: new Date().toISOString(), url: o.url, backend: o.backend, results }, null, 2) + '\n');
// On GitHub Actions, a table on the run's page too, with each session's link.
if (process.env.GITHUB_STEP_SUMMARY) {
  const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const rows = results.map(r => `| ${cell(r.on || r.label)} | ${r.ok ? 'pass' : `**fail**: ${cell(r.reason)}`}${r.note ? ` (${cell(r.note)})` : ''} | ${cell(r.status.audio)} | ${cell(r.status.fullscreen)} | ${cell((r.status.errors || []).join('; ') || 'none')} | ${r.session ? `[session](${r.session})` : ''} |`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`### Devices: ${o.backend}, ${o.url}`, '', '| Device | Result | Audio | Full screen | Page errors | Link |', '|---|---|---|---|---|---|', ...rows, ''].join('\n') + '\n');
}
if (results.some(r => !r.ok)) process.exitCode = 1;
