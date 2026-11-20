// The docs' feedback form (/docs/feedback/: tools/docs, docs.js; sent to the site's Worker, site/feedback.js, whose
// Email Sending binding the harness fakes: nothing is mailed, `site.mail` records what would be): reached from the
// game's first page and its help sheet with the details in its address; filled and sent on a portrait phone and a
// desktop (the counter, the details shown, the email built from them, the thank-you); the line to write to us instead,
// its mailto link carrying the kind and the text, when sending fails and when the Worker is blocked (error 1103); and
// with JavaScript off, the form whole but SEND, a line to write instead.
// Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, browserContext, baseUrl, site, DESKTOP } from './harness.mjs';

before(start);
after(stop);

const PORTRAIT = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const FROM_GAME = 'docs/feedback/?from=game&v=0123456789ab&c=abcdef1&touch=1';

/** Fill the form as a person does (taps on a phone) and wait out the three seconds on the page. */
async function fill(page, { kind = 'Bug', text, email = '' }, touch) {
  const press = (l) => (touch ? l.tap() : l.click());
  await press(page.locator(`.seg label:has(input[value="${kind}"])`));
  await page.locator('#fb-text').fill(text);
  if (email) await page.locator('#fb-email').fill(email);
  await page.waitForFunction(() => performance.now() > 3200);
}

for (const [name, device] of [['a portrait phone', PORTRAIT], ['a desktop', DESKTOP]]) {
  test(`the feedback form on ${name}: the details from the game's link, the counter, SEND, the email as it would go, the thank-you`, async () => {
    const ctx = await browserContext(device), page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    site.mail.length = 0;
    try {
      await page.goto(baseUrl() + FROM_GAME, { waitUntil: 'load' });
      assert.equal(await page.locator('h1').textContent(), 'Send feedback');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
      assert.equal(await page.locator('#fb-count').textContent(), '0 / 2,000');
      assert.ok(await page.locator('.send').isVisible(), 'SEND, with scripts');
      assert.ok(await page.locator('.nojs').isHidden(), 'no line to write instead');
      assert.ok(await page.locator('#fb-website').evaluate(e => { const r = e.getBoundingClientRect(); return r.right < 0 || r.bottom < 0; }), 'the honeypot off screen');
      // The details the page fills in, shown under "What else is sent".
      await (device.hasTouch ? page.locator('.sent-with summary').tap() : page.locator('.sent-with summary').click());
      assert.equal(await page.locator('#fb-d-version').textContent(), 'Version 0123456789ab (last game update abcdef1)');
      assert.equal(await page.locator('#fb-d-input').textContent(), 'touch', "the game's word");
      assert.equal(await page.locator('#fb-d-from').textContent(), 'game');
      assert.match(await page.locator('#fb-d-browser').textContent(), /^(Chrome|Firefox|Safari) \d+(\.\d+)? on \w+/);
      assert.match(await page.locator('#fb-d-screen').textContent(), new RegExp(`window ${device.viewport.width}x${device.viewport.height}`));
      // Nothing sent before the message is there.
      await (device.hasTouch ? page.locator('.send').tap() : page.locator('.send').click());
      assert.equal(site.mail.length, 0, 'the form refuses an empty message');
      assert.ok(await page.locator('#fb-done').isHidden());
      const text = 'The Ballista would not fire at the Drones over the water.\nThen the game froze.';
      await fill(page, { kind: 'Bug', text, email: 'player@example.org' }, device.hasTouch);
      assert.equal(await page.locator('#fb-count').textContent(), `${text.length} / 2,000`);
      await (device.hasTouch ? page.locator('.send').tap() : page.locator('.send').click());
      await page.locator('#fb-done').waitFor();
      assert.ok(await page.locator('#feedback').isHidden(), 'the form gone');
      assert.equal(await page.locator('#fb-done h2').textContent(), 'Thank you');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'fb-done', 'the thank-you focused (a screen reader reads it)');
      assert.equal(site.mail.length, 1, 'one email');
      const m = site.mail[0];
      assert.equal(m.to, 'contact@ebbfall.com');
      assert.equal(m.from.email, 'feedback@ebbfall.com');
      assert.equal(m.replyTo, 'player@example.org');
      assert.equal(m.subject, '[Ebbfall feedback] Bug: The Ballista would not fire at the Drones…');
      assert.ok(m.text.startsWith(`${text}\n\n-- \nKind: Bug\n`), m.text);
      assert.match(m.text, /^Version: Version 0123456789ab \(last game update abcdef1\)$/m);
      assert.match(m.text, /^Input: touch$/m);
      assert.match(m.text, /^From: game$/m);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('sending fails, or the Worker is blocked (1103): "Couldn\'t send", a mailto link with the kind and the text; SEND again works', async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  site.mail.length = 0;
  try {
    for (const why of ['mailFails', 'blocked']) {
      await page.goto(baseUrl() + 'docs/feedback/', { waitUntil: 'load' });
      site[why] = true;
      try {
        await fill(page, { kind: 'Idea', text: 'More maps & a 2v2 mode? Yes please.' }, false);
        await page.locator('.send').click();
        await page.locator('#fb-fail').waitFor();
        assert.equal(await page.locator('#fb-fail').textContent(), "Couldn't send. Write to contact@ebbfall.com", why);
        const href = await page.locator('#fb-mailto').getAttribute('href');
        const u = new URL(href);
        assert.equal(u.protocol + u.pathname, 'mailto:contact@ebbfall.com', why);
        assert.equal(u.searchParams.get('subject'), '[Ebbfall feedback] Idea', why);
        assert.ok(u.searchParams.get('body').startsWith('More maps & a 2v2 mode? Yes please.\n\nVersion '), `${why}: the text, then the version: ${href}`);
        assert.ok(await page.locator('#feedback').isVisible() && await page.locator('#fb-done').isHidden(), `${why}: the form stays, with the text`);
        assert.equal(await page.locator('.send').isEnabled(), true);
      } finally { site[why] = false; }
      await page.locator('.send').click();
      await page.locator('#fb-done').waitFor();
    }
    assert.equal(site.mail.length, 2, 'sent once it could be');
    // A long message: the mailto address kept short, the text cut.
    await page.goto(baseUrl() + 'docs/feedback/', { waitUntil: 'load' });
    site.mailFails = true;
    try {
      await fill(page, { kind: 'Other', text: 'é'.repeat(1990) }, false);
      await page.locator('.send').click();
      await page.locator('#fb-fail').waitFor();
      const href = await page.locator('#fb-mailto').getAttribute('href');
      assert.ok(href.length <= 1900, `short enough for a mail app: ${href.length}`);
      assert.match(decodeURIComponent(href), /é\.\.\.\n\nVersion /, 'cut, and says so');
    } finally { site.mailFails = false; }
  } finally { await ctx.close(); site.blocked = false; site.mailFails = false; }
});

test('the feedback form with JavaScript off: every field there, SEND hidden, a line to write to us instead', async () => {
  const ctx = await browserContext({ ...PORTRAIT, javaScriptEnabled: false }), page = await ctx.newPage();
  try {
    await page.goto(baseUrl() + 'docs/feedback/', { waitUntil: 'load' });
    for (const sel of ['#fb-text', '#fb-email', '.seg']) assert.ok(await page.locator(sel).isVisible(), sel);
    assert.ok(await page.locator('.send').isHidden(), 'no SEND that would do nothing');
    assert.ok(await page.locator('.nojs').isVisible());
    assert.equal(await page.locator('.nojs a').getAttribute('href'), 'mailto:contact@ebbfall.com');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
  } finally { await ctx.close(); }
});

test("the game's ways to the form: Send feedback beside Learn more on the first page, and on the help sheet, each with the details in its address", async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    const build = await page.locator('#buildStamp').getAttribute('data-build');
    const a = page.locator('#linkFeedback');
    assert.ok(await a.isVisible());
    assert.equal(await a.textContent(), 'Send feedback');
    assert.equal(await a.getAttribute('target'), '_blank');
    const href = new URL(await a.getAttribute('href'), baseUrl());
    assert.equal(href.pathname, '/docs/feedback/');
    assert.deepEqual([href.searchParams.get('from'), href.searchParams.get('v'), href.searchParams.get('touch')], ['menu', build, '0']);
    assert.match(href.searchParams.get('c'), /^([0-9a-f]{7}|dev)$/);
    const [popup] = await Promise.all([ctx.waitForEvent('page'), a.click()]);
    await popup.waitForLoadState();
    assert.equal(await popup.locator('h1').textContent(), 'Send feedback');
    assert.equal(await popup.locator('#fb-d-from').textContent(), 'menu');
    assert.match(await popup.locator('#fb-d-version').textContent(), new RegExp(`^Version ${build} \\(last game update `));
    await popup.close();
  } finally { await ctx.close(); }
  const d = await newGame(DESKTOP);
  try {
    await d.page.locator('#btnHelp').click();
    const h = d.page.locator('#helpFeedback');
    assert.ok(await h.isVisible(), 'on the help sheet');
    assert.equal(await h.getAttribute('target'), '_blank');
    const href = new URL(await h.getAttribute('href'), baseUrl());
    assert.equal(href.pathname, '/docs/feedback/');
    assert.equal(href.searchParams.get('from'), 'game');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});
