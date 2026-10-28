// Launch the browser engine the e2e tests run in: ENDFALL_ENGINE=chromium (the default), webkit or firefox.
// Chromium is tools/chromium.mjs's (software WebGL through SwiftShader). WebKit is Playwright's (WPE, headless, WebGL
// through Mesa's llvmpipe). Firefox has no WebGL when headless on Linux, so there it runs headed whenever a display is
// set: run it under `xvfb-run` (CI does). WEBKIT_PATH and FIREFOX_PATH name another executable, as CHROMIUM_PATH does.
import { firefox, webkit } from 'playwright-core';
import { launchChromium } from './chromium.mjs';

export const ENGINES = { chromium: 'Chromium', webkit: 'WebKit', firefox: 'Firefox' };

export function engineName() {
  const e = process.env.ENDFALL_ENGINE || 'chromium';
  if (!ENGINES[e]) throw new Error(`ENDFALL_ENGINE=${e}: expected one of ${Object.keys(ENGINES).join(', ')}`);
  return e;
}

export async function launchEngine(engine = engineName()) {
  if (engine === 'chromium') return launchChromium();
  if (engine === 'webkit') return webkit.launch({ executablePath: process.env.WEBKIT_PATH || undefined, timeout: 60000 });
  const headed = process.platform === 'linux' && !!process.env.DISPLAY;
  return firefox.launch({ executablePath: process.env.FIREFOX_PATH || undefined, headless: !headed, timeout: 60000 });
}

/** A device profile as this engine takes it: Firefox has no `isMobile` (Playwright refuses it), the rest stays. */
export function deviceFor(engine, device = {}) {
  if (engine !== 'firefox' || !('isMobile' in device)) return device;
  const rest = { ...device }; delete rest.isMobile;
  return rest;
}
