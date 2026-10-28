// A minimal W3C WebDriver client (fetch only, no dependencies): enough for the device smoke through Appium (Safari on
// the iOS Simulator, XCUITest driver) or any WebDriver hub. Selectors are CSS; scripts are function bodies.

export async function webdriverSession(base, capabilities) {
  base = base.replace(/\/$/, '');
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({ value: { error: `HTTP ${r.status}`, message: 'not JSON' } }));
    if (!r.ok || j.value?.error) throw new Error(`WebDriver ${method} ${path}: ${j.value?.error || r.status}: ${String(j.value?.message || '').split('\n')[0]}`);
    return j.value;
  };
  const { sessionId, capabilities: got } = await call('POST', '/session', { capabilities: { alwaysMatch: capabilities, firstMatch: [{}] } });
  const s = (path) => `/session/${sessionId}${path}`;
  const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
  return {
    sessionId, capabilities: got,
    goto: (url) => call('POST', s('/url'), { url }),
    /** Run a function body in the page (`return ...`), with arguments. */
    script: (body, ...args) => call('POST', s('/execute/sync'), { script: body, args }),
    async click(css) {
      const el = await call('POST', s('/element'), { using: 'css selector', value: css });
      await call('POST', s(`/element/${el[ELEMENT]}/click`), {});
    },
    /** A PNG of the screen (Appium: the whole simulator screen, Safari's bars too), as a Buffer. */
    screenshot: async () => Buffer.from(await call('GET', s('/screenshot')), 'base64'),
    close: () => call('DELETE', s('')).catch(() => {}),
  };
}
