// Launch a headless Chromium through playwright-core with software WebGL (works on CI and machines without a GPU).
// Order: CHROMIUM_PATH, then playwright-core's own revision (`npx playwright-core install chromium`), then any
// Playwright browser found in the cache.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';

export const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

function findCached() {
  const base = join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  if (!existsSync(base)) return undefined;
  for (const d of readdirSync(base).sort().reverse()) {
    for (const rel of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/chrome', 'chrome-headless-shell-mac-arm64/chrome-headless-shell',
      'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing']) {
      const p = join(base, d, rel); if (existsSync(p)) return p;
    }
  }
  return undefined;
}

export async function launchChromium(args = GL_ARGS) {
  try { return await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args }); }
  catch (e) {
    const p = findCached(); if (!p) throw e;
    try { return await chromium.launch({ executablePath: p, args }); }
    catch (e2) { throw new Error(`no usable Chromium: ${e.message}\nfallback ${p}: ${e2.message}`); }
  }
}
