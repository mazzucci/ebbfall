// A minimal W3C WebDriver client (node:http, no dependencies): enough for the device smoke through Appium (Safari on
// the iOS Simulator, XCUITest driver) or any WebDriver hub. Selectors are CSS; scripts are function bodies. (Not fetch:
// its 300 s wait for an answer is shorter than Appium's first session, which may build WebDriverAgent.)
import http from 'node:http';
import https from 'node:https';

function request(method, url, body) {
  const u = new URL(url), data = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = (u.protocol === 'https:' ? https : http).request(u, { method, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

export async function webdriverSession(base, capabilities) {
  base = base.replace(/\/$/, '');
  const call = async (method, path, body) => {
    const r = await request(method, base + path, body);
    let j; try { j = JSON.parse(r.text); } catch { j = { value: { error: `HTTP ${r.status}`, message: r.text.slice(0, 200) } }; }
    if (r.status >= 400 || j.value?.error) throw new Error(`WebDriver ${method} ${path}: ${j.value?.error || r.status}: ${String(j.value?.message || '').split('\n')[0]}`);
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
