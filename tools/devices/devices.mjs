// The devices the Devices workflow checks (.github/workflows/devices.yml), each as every backend names it:
// - browserstack: a real device on BrowserStack Automate (Playwright: webkit.connect for iOS Safari, _android.connect
//   for Chrome on Android), when BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY are set;
// - simulator / emulator: Apple's iOS Simulator (Safari through Appium's XCUITest driver) on a macOS runner, or an
//   Android emulator (Chrome through Playwright over adb) on Linux;
// - local: Playwright's own WebKit or Chromium with the device's profile (a dry run anywhere).
// BrowserStack's names come from https://www.browserstack.com/list-of-browsers-and-platforms/playwright; when one
// retires, change it here (or override it: BROWSERSTACK_DEVICE_<KEY>="name:version", e.g. "iPhone 17:26").

export const DEVICES = {
  ipad: {
    label: 'iPad, Safari',
    platform: 'ios',
    browserstack: { deviceName: 'iPad Pro 13 2024', osVersion: '27' },
    simulator: /^iPad (Pro|Air)\b/, // (the newest runtime's; any iPad if none of those)
    local: 'iPad Pro 11 landscape',
  },
  iphone: {
    label: 'iPhone, Safari',
    platform: 'ios',
    browserstack: { deviceName: 'iPhone 18 Pro', osVersion: '27' },
    simulator: /^iPhone \d+( Pro)?$/,
    local: 'iPhone 15 Pro landscape',
  },
  pixel: {
    label: 'Pixel, Chrome',
    platform: 'android',
    browserstack: { deviceName: 'Google Pixel 11 Pro', osVersion: '17.0' },
    local: 'Pixel 7 landscape',
  },
};

/** The BrowserStack device for a key, with the environment's override if any. */
export function browserstackDevice(key) {
  const o = process.env[`BROWSERSTACK_DEVICE_${key.toUpperCase()}`];
  if (!o) return DEVICES[key].browserstack;
  const i = o.lastIndexOf(':');
  return i < 0 ? { deviceName: o, osVersion: DEVICES[key].browserstack.osVersion } : { deviceName: o.slice(0, i), osVersion: o.slice(i + 1) };
}
