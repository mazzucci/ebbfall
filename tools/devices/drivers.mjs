// One small driver per backend, all with the same face for the smoke script (smoke.mjs):
//   goto(url), tap(css), eval(expression) -> JSON value, screenshot() -> PNG Buffer, link() -> session URL or null,
//   finish(passed, reason), close().
// browserstack: Playwright to a real device (webkit.connect for iOS Safari, _android.connect for Chrome on Android),
// as BrowserStack documents it (https://www.browserstack.com/docs/automate/playwright). simulator: Appium's XCUITest
// driver to Safari on a booted iOS Simulator (WebDriver, webdriver.mjs; taps are native taps, so they count as the
// user's gestures for sound and full screen). emulator: Playwright over adb to Chrome on an Android emulator. local:
// Playwright's WebKit or Chromium with the device's profile. webdriver: any WebDriver endpoint (WEBDRIVER_URL,
// WEBDRIVER_CAPS), e.g. a chromedriver, to try the simulator's code path without a Mac.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { _android, devices as profiles } from 'playwright-core';
import { DEVICES, browserstackDevice } from './devices.mjs';
import { webdriverSession } from './webdriver.mjs';
import { launchEngine } from '../engines.mjs';

const require = createRequire(import.meta.url);
const PW_VERSION = JSON.parse(readFileSync(require.resolve('playwright-core/package.json'), 'utf8')).version;

/** Which backend to use when none is named: BrowserStack when its secrets are set, else a local dry run. */
export const defaultBackend = () => (process.env.BROWSERSTACK_USERNAME && process.env.BROWSERSTACK_ACCESS_KEY ? 'browserstack' : 'local');

export async function openDriver(backend, key) {
  const dev = DEVICES[key];
  if (!dev) throw new Error(`unknown device ${key}: one of ${Object.keys(DEVICES).join(', ')}`);
  if (backend === 'browserstack') return browserstack(key, dev);
  if (backend === 'simulator') return simulator(key, dev);
  if (backend === 'emulator') return emulator(dev);
  if (backend === 'local') return local(dev);
  if (backend === 'webdriver') return webdriver(key);
  throw new Error(`unknown backend ${backend}: browserstack, simulator, emulator, local or webdriver`);
}

/** The Playwright page as a driver; `extra` adds or replaces methods (BrowserStack's link and status). */
function pageDriver(page, close, extra = {}) {
  return {
    goto: (url) => page.goto(url, { timeout: 90000 }),
    async tap(css) { const l = page.locator(css).first(); try { await l.tap({ timeout: 15000 }); } catch (e) { if (!/hasTouch|touch/i.test(e.message)) throw e; await l.click({ timeout: 15000 }); } },
    eval: (expr) => page.evaluate(expr),
    screenshot: () => page.screenshot({ timeout: 120000 }),
    link: async () => null,
    finish: async () => {},
    close,
    ...extra,
  };
}

async function browserstack(key, dev) {
  const { deviceName, osVersion } = browserstackDevice(key);
  const caps = {
    browser: dev.platform === 'ios' ? 'safari' : 'chrome', deviceName, osVersion, realMobile: 'true',
    project: 'Ebbfall', build: `Devices ${process.env.GITHUB_RUN_NUMBER ? `#${process.env.GITHUB_RUN_NUMBER}` : 'local'}`, name: dev.label,
    'browserstack.username': process.env.BROWSERSTACK_USERNAME, 'browserstack.accessKey': process.env.BROWSERSTACK_ACCESS_KEY,
    'client.playwrightVersion': PW_VERSION,
  };
  const ws = `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(caps))}`;
  let page, close;
  if (dev.platform === 'ios') {
    const { webkit } = await import('playwright-core');
    const browser = await webkit.connect(ws, { timeout: 300000 });
    page = await (await browser.newContext()).newPage();
    close = () => browser.close();
  } else {
    const device = await _android.connect(ws, { timeout: 300000 });
    await device.shell('am force-stop com.android.chrome');
    page = await (await device.launchBrowser()).newPage();
    close = () => device.close();
  }
  // BrowserStack's executor: commands passed as the argument of an evaluate (its documented way from Playwright).
  const exec = (action, args) => page.evaluate(() => {}, `browserstack_executor: ${JSON.stringify(args ? { action, arguments: args } : { action })}`);
  return pageDriver(page, close, {
    device: `${deviceName}, ${dev.platform === 'ios' ? 'iOS' : 'Android'} ${osVersion} (BrowserStack)`,
    link: async () => { try { const d = JSON.parse(await exec('getSessionDetails')); return d.public_url || d.browser_url || null; } catch { return null; } },
    finish: (passed, reason) => exec('setSessionStatus', { status: passed ? 'passed' : 'failed', reason: String(reason).slice(0, 250) }).catch(() => {}),
  });
}

/** The newest iOS runtime's simulator whose name matches, booted. */
function bootSimulator(dev) {
  const list = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], { encoding: 'utf8' })).devices;
  const ios = Object.keys(list).filter(r => /SimRuntime\.iOS-/.test(r))
    .sort((a, b) => { const v = (r) => r.split('iOS-')[1].split('-').map(Number); const [x, y] = [v(a), v(b)]; return (x[0] - y[0]) || ((x[1] || 0) - (y[1] || 0)); });
  const kind = dev.simulator.source.startsWith('^iPad') ? /^iPad/ : /^iPhone/;
  for (const runtime of ios.reverse()) {
    const all = list[runtime].filter(d => kind.test(d.name));
    const sim = all.filter(d => dev.simulator.test(d.name)).pop() || all.pop();
    if (!sim) continue;
    if (sim.state !== 'Booted') execFileSync('xcrun', ['simctl', 'bootstatus', sim.udid, '-b'], { stdio: 'inherit', timeout: 600000 });
    return { ...sim, version: runtime.split('iOS-')[1].replace(/-/g, '.') };
  }
  throw new Error(`no ${kind.source.slice(1)} simulator installed (xcrun simctl list devices available)`);
}

async function simulator(key, dev) {
  if (dev.platform !== 'ios') throw new Error(`${key} is not an iOS device: the simulator backend runs Safari on iOS (use emulator for Android)`);
  const sim = bootSimulator(dev);
  console.log(`${key}: ${sim.name}, iOS ${sim.version} (${sim.udid})`);
  const wd = await webdriverSession(process.env.APPIUM_URL || 'http://127.0.0.1:4723', {
    platformName: 'iOS', browserName: 'Safari',
    'appium:automationName': 'XCUITest', 'appium:udid': sim.udid, 'appium:platformVersion': sim.version,
    'appium:nativeWebTap': true, // (real taps: sound and full screen need the user's gesture)
    'appium:isHeadless': true, 'appium:simulatorStartupTimeout': 600000, // (booted here, without its window)
    'appium:noReset': true, // (a fresh simulator: no Safari data to scrub, which takes minutes on a CI machine)
    'appium:safariIgnoreFraudWarning': true, 'appium:newCommandTimeout': 300,
    'appium:wdaLaunchTimeout': 600000, 'appium:wdaConnectionTimeout': 600000,
    // WebDriverAgent: Appium's prebuilt one for simulators (WDA_APP: `appium driver run xcuitest download-wda -- --kind=sim
    // --platform=ios --outdir=...`), else built here by xcodebuild (minutes; WDA_DERIVED_DATA keeps it for the next).
    ...(process.env.WDA_APP ? { 'appium:usePreinstalledWDA': true, 'appium:prebuiltWDAPath': process.env.WDA_APP }
      : { 'appium:showXcodeLog': true, ...(process.env.WDA_DERIVED_DATA ? { 'appium:derivedDataPath': process.env.WDA_DERIVED_DATA } : {}) }),
  });
  return webdriverDriver(wd, `${sim.name}, iOS ${sim.version} (Simulator)`);
}

/** A WebDriver session as a driver. */
function webdriverDriver(wd, device) {
  return {
    device,
    goto: (url) => wd.goto(url),
    tap: (css) => wd.click(css),
    eval: (expr) => wd.script(`return (${expr});`),
    screenshot: () => wd.screenshot(),
    link: async () => null, finish: async () => {},
    close: () => wd.close(),
  };
}

/** Any WebDriver endpoint: WEBDRIVER_URL, and the session's capabilities as JSON in WEBDRIVER_CAPS. */
async function webdriver(key) {
  const url = process.env.WEBDRIVER_URL;
  if (!url) throw new Error('the webdriver backend needs WEBDRIVER_URL (and WEBDRIVER_CAPS, JSON)');
  const wd = await webdriverSession(url, JSON.parse(process.env.WEBDRIVER_CAPS || '{}'));
  return webdriverDriver(wd, `${key} through ${url} (${wd.capabilities.browserName || ''} ${wd.capabilities.browserVersion || ''})`.replace(/ +\)/, ')'));
}

async function emulator(dev) {
  if (dev.platform !== 'android') throw new Error('the emulator backend runs Chrome on Android');
  const [device] = await _android.devices();
  if (!device) throw new Error('no Android device on adb (adb devices)');
  if (!String(await device.shell('pm list packages com.android.chrome')).includes('com.android.chrome')) throw new Error('no Chrome on this emulator (use a google_apis_playstore image)');
  // Chrome reads Playwright's command line (/data/local/tmp/chrome-command-line) only on a debuggable build or as the
  // debug app: a Play Store image is neither until this.
  await device.shell('am set-debug-app --persistent com.android.chrome');
  await device.shell('am force-stop com.android.chrome');
  const page = await (await device.launchBrowser()).newPage();
  return pageDriver(page, () => device.close(), { device: `${device.model()} (emulator, Android ${String(await device.shell('getprop ro.build.version.release')).trim()})` });
}

async function local(dev) {
  const profile = profiles[dev.local];
  const browser = await launchEngine(profile.defaultBrowserType);
  const page = await (await browser.newContext(profile)).newPage();
  return pageDriver(page, () => browser.close(), { device: `${dev.local} (Playwright's ${profile.defaultBrowserType})` });
}
