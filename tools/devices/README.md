# Device smoke

What the **Devices** workflow (`.github/workflows/devices.yml`) runs on an iPad and an iPhone (Safari) and a Pixel
(Chrome): open the site, screenshot the first page, tap SINGLE PLAYER then START GAME, wait for the game and screenshot
it, tap the sound button (off, on) and the full-screen button (out, in, where the browser has one: not iPhone Safari),
and read back `endfall.status()`: the audio context's state, full screen, the page's errors since it opened. A device
fails when no game is running at the end or the page had errors. A tap that changes nothing in 30 s is tried again as a
script's click and noted (a simulator drops a tap now and then; on a real device it is worth a look). A simulator is
slow: on a CI Mac the Easy AI can win before the last taps (`endCard` in the status). Screenshots and `summary.json` go to `--out`, with
each BrowserStack session's link; on GitHub Actions a table goes to the run's summary too.

```sh
node tools/devices/smoke.mjs --devices ipad,iphone,pixel --url https://ebbfall.com/ --backend local --out devices-out
```

Each option has an environment variable too: `DEVICES`, `DEVICES_URL`, `DEVICES_BACKEND`, `DEVICES_OUT`.

## Backends

- `browserstack`, the default when `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` are set: real devices on
  BrowserStack Automate, through Playwright as BrowserStack documents it (`webkit.connect` for iOS Safari,
  `_android.connect` for Chrome on Android, at `wss://cdp.browserstack.com/playwright`). The devices' names are in
  `devices.mjs`; one that retires can be swapped without an edit: `BROWSERSTACK_DEVICE_IPHONE="iPhone 17:26"`.
  ```sh
  BROWSERSTACK_USERNAME=... BROWSERSTACK_ACCESS_KEY=... node tools/devices/smoke.mjs
  ```
- `simulator` (a Mac with Xcode): Safari on the newest iOS runtime's iPad and iPhone simulators, booted with `xcrun
  simctl`, through Appium's XCUITest driver at `APPIUM_URL` (default http://127.0.0.1:4723). Taps are native taps on
  the button as Safari's web view shows it to XCUITest (found by its accessible name), so the browser takes them as
  the user's (sound and full screen need that). WebDriverAgent: `WDA_APP=<.../WebDriverAgentRunner-Runner.app>` uses
  Appium's prebuilt one (`appium driver run xcuitest download-wda -- --kind=sim --platform=ios --outdir=<dir>`);
  otherwise the first session builds it (minutes; `WDA_DERIVED_DATA=<dir>` keeps the build for the next).
  ```sh
  npm install -g appium@3 && appium driver install xcuitest && appium &
  node tools/devices/smoke.mjs --backend simulator --devices ipad,iphone
  ```
- `emulator`: Chrome on the Android device adb lists first (an emulator from a Play Store image, which has Chrome;
  Chrome is made the debug app so that it reads Playwright's command line), through Playwright.
  ```sh
  node tools/devices/smoke.mjs --backend emulator --devices pixel
  ```
- `local`, the default otherwise: Playwright's own WebKit (for the iPad and iPhone) or Chromium (the Pixel) with the
  device's profile; a dry run of the script, not of the devices.
- `webdriver`: any WebDriver endpoint, `WEBDRIVER_URL` with the session's capabilities as JSON in `WEBDRIVER_CAPS`
  (a chromedriver, say, to try the simulator's code path without a Mac).

A build from before `endfall.status()` (2026-10-28) is still checked; its audio state reads `unknown`.
