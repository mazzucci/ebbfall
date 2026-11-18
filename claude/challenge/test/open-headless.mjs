#!/usr/bin/env node
// A stand-in for the person's browser in the mod check (modcheck.py sets BROWSER to this): opens the challenge page in
// headless Chromium, waits for Claude's start plan (or 90 s), presses START GAME, fast-forwards the game (`--speed`,
// default 6x) and stays until the game ends or 15 minutes pass. Logs to target/challenge/logs/modcheck/browser.log.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const LOG = join(REPO, 'target/challenge/logs/modcheck');
mkdirSync(LOG, { recursive: true });
const log = (s) => appendFileSync(join(LOG, 'browser.log'), `[${new Date().toISOString().slice(11, 19)}] ${s}\n`);
const url = process.argv.at(-1);
const speed = Number(process.env.EBBFALL_CHECK_SPEED || 6);
const token = new URL(url).hash.slice(3);
const api = (name) => fetch(new URL(`/claude/api/${name}`, url), { headers: { 'x-challenge-token': token } }).then(r => r.json());

const { chromium } = await import(join(REPO, 'node_modules/playwright-core/index.mjs'));
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
log(`open ${url.replace(/#.*/, '#t=...')}`);
await page.goto(url);
const deadline = Date.now() + 15 * 60_000;
let frame;
while (!frame && Date.now() < deadline) {
  frame = page.frames().find(f => f !== page.mainFrame() && /embed=1/.test(f.url()));
  await new Promise(r => setTimeout(r, 300));
}
for (let i = 0; i < 90; i++) {
  const s = (await api('state')).state;
  if (s.plan && s.plan !== '1') { log(`start plan ${s.plan}`); break; }
  await new Promise(r => setTimeout(r, 1000));
}
const start = frame.locator('#btnStart');
if (!(await start.isVisible().catch(() => false))) await frame.locator('#btnSolo').click().catch(() => {});
await start.click({ timeout: 30000 });
log('START GAME pressed');
while (Date.now() < deadline) {
  await frame.evaluate((s) => window.endfall?.skip?.(s), speed - 1).catch(() => {});
  const s = (await api('state')).state;
  if (s.status === 'over') { log(`over: ${s.end?.result}`); break; }
  await new Promise(r => setTimeout(r, 1000));
}
await page.screenshot({ path: join(LOG, 'page.png') }).catch(() => {});
await new Promise(r => setTimeout(r, 60_000)); // (Claude's end-of-game line reaches the panel)
await page.screenshot({ path: join(LOG, 'page-end.png') }).catch(() => {});
await browser.close();
