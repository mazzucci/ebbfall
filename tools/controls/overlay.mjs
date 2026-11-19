// The controls video's drawn layers (tools/controls/record.mjs). In the phone page: the touch indicator (a finger
// dot; a ring that fills over the hold as the game's own does, outside it; a fading trail behind a drag; a ripple at
// each tap, two for a double-tap; two dots and a line for a pinch), set every frame from the fingers' state
// (touch.mjs `player`). Apart from the frames: the captions, in the game's font (Chakra Petch, from the game's own
// style sheet), rendered once each as PNGs with alpha for tools/controls/cut.mjs to lay over the video: the landscape
// one a pill over the map under the top bar, the tall (9:16) one under the phone; and the tall version's background,
// the phone's outline in a vertical canvas with the title and the address.

const DOT = 28, RING = 84, HOLD_DELAY = 0.1, HOLD_FILL = 0.25, RIPPLE = 0.45, TRAIL_S = 0.4;

const IND_CSS = `
#ct{position:fixed;inset:0;pointer-events:none;z-index:99999;overflow:visible}
#ct svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
#ct .dot{fill:rgba(255,255,255,.88);stroke:rgba(11,15,22,.75);stroke-width:2;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))}
#ct .trail{fill:rgba(255,255,255,.75)}
#ct .ripple{fill:none;stroke:#fff;stroke-width:3}
#ct .ring{fill:none;stroke:rgba(11,15,22,.55);stroke-width:4}
#ct .fill{fill:none;stroke:#fff;stroke-width:4;stroke-linecap:round;filter:drop-shadow(0 0 3px rgba(0,0,0,.7))}
#ct .pinch{stroke:rgba(255,255,255,.55);stroke-width:2;stroke-dasharray:6 6}
`;

/** Put the indicator layer into the phone page (once). */
export const installIndicator = (page) => page.evaluate((css) => {
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const d = document.createElement('div'); d.id = 'ct'; d.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'; document.body.appendChild(d);
}, IND_CSS);

/**
 * Draw the indicator for time t: `fingers` [{ x, y, id, kind, since }], `taps` [{ x, y, t }], `holds` [{ x, y, t,
 * until }], `trails` { id: [{ x, y, t }] } (the fingers' recent points).
 */
export const drawIndicator = (page, t, { fingers, taps, holds, trails }) => page.evaluate(([t, fingers, taps, holds, trails, K]) => {
  const out = [];
  const circle = (cls, x, y, r, extra = '') => out.push(`<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" ${extra}/>`);
  for (const h of holds) { // (the ring: it starts where the game's does, fills by its 0.35 s, then goes)
    const dt = t - h.t, p = Math.min(1, Math.max(0, (dt - K.HOLD_DELAY) / K.HOLD_FILL)), gone = dt - (K.HOLD_DELAY + K.HOLD_FILL);
    if (dt < 0 || gone > 0.35) continue;
    const r = K.RING / 2, c = 2 * Math.PI * r, alpha = gone > 0 ? 1 - gone / 0.35 : Math.min(1, dt / K.HOLD_DELAY), scale = gone > 0 ? 1 + gone * 0.6 : 1;
    circle('ring', h.x, h.y, r * scale, `style="opacity:${alpha.toFixed(3)}"`);
    circle('fill', h.x, h.y, r * scale, `style="opacity:${alpha.toFixed(3)}" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${h.x.toFixed(1)} ${h.y.toFixed(1)})"`);
  }
  for (const p of taps) { const k = (t - p.t) / K.RIPPLE; if (k >= 0 && k < 1) circle('ripple', p.x, p.y, 16 + 30 * k, `style="opacity:${(1 - k).toFixed(3)}"`); }
  for (const [id, pts] of Object.entries(trails)) {
    const f = fingers.find(f => String(f.id) === id); if (!f) continue;
    for (const q of pts) { const k = (t - q.t) / K.TRAIL_S; if (k > 0 && k < 1 && Math.hypot(q.x - f.x, q.y - f.y) > 4) circle('trail', q.x, q.y, K.DOT / 2 * (1 - k) * 0.8, `style="opacity:${(0.7 * (1 - k)).toFixed(3)}"`); }
  }
  if (fingers.length === 2) out.push(`<line class="pinch" x1="${fingers[0].x}" y1="${fingers[0].y}" x2="${fingers[1].x}" y2="${fingers[1].y}"/>`);
  for (const f of fingers) circle('dot', f.x, f.y, K.DOT / 2 * (f.since < 0.08 ? 0.8 + 2.5 * f.since : 1));
  document.querySelector('#ct svg').innerHTML = out.join('');
}, [t, fingers, taps, holds, trails, { DOT, RING, HOLD_DELAY, HOLD_FILL, RIPPLE, TRAIL_S }]);

/** The frames' sizes (CSS px; everything is drawn at DPR 2): the phone's screen, and the tall canvas. */
export const PHONE = { width: 844, height: 390 }, TALL = { width: 540, height: 960 };
/** The phone's picture in the tall canvas (CSS px): 500 wide across the middle in a drawn phone outline (an 8 px
 *  bezel and a 2 px rim), 10 px from either edge of the 540: 10 + 2 + 8 + 500 + 8 + 2 + 10. */
export const TALL_PHONE = { left: 12, top: 318, width: 500, height: Math.round(500 * 390 / 844), border: 8 };
/** Where the landscape caption's top goes (CSS px: under the top bar), and the tall caption's. */
export const CAP_TOP = { land: 46, tall: TALL_PHONE.top + TALL_PHONE.height + 2 * TALL_PHONE.border + 40 };

const CAP_CSS = `
html,body{margin:0;background:transparent;overflow:hidden;font-family:'Chakra Petch',sans-serif;color:#fff}
#app,#start,#top,#hud,#stage{display:none!important} canvas#game{display:none}
.cap{position:absolute;left:0;top:0;font-weight:600;line-height:1.2;text-align:center}
.cap b{color:#f5a524;font-weight:700}
.land .cap{max-width:720px;font-size:25px;padding:7px 16px 8px;border-radius:9px;background:rgba(11,15,22,.8);border:1px solid rgba(255,255,255,.14);box-shadow:0 2px 10px rgba(0,0,0,.45);white-space:nowrap}
.tall .cap{width:480px;font-size:31px;line-height:1.25;text-wrap:balance}
.tall .cap b{display:block;font-size:24px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}
.bg{width:${TALL.width}px;height:${TALL.height}px;background:#0b0f16;position:relative}
.bg .hd{position:absolute;left:0;right:0;top:214px;text-align:center;font-weight:600;font-size:21px;letter-spacing:.14em;color:#9fb0c4;text-transform:uppercase}
.bg .hd b{display:block;font-size:40px;letter-spacing:.01em;color:#fff;text-transform:none;margin-top:8px}
.bg .ph{position:absolute;box-sizing:content-box;left:${TALL_PHONE.left}px;top:${TALL_PHONE.top}px;width:${TALL_PHONE.width}px;height:${TALL_PHONE.height}px;border:${TALL_PHONE.border}px solid #1b2230;border-radius:20px;background:#000;box-shadow:0 0 0 2px #3a4659,0 14px 34px rgba(0,0,0,.6)}
.bg .url{position:absolute;left:0;right:0;bottom:120px;text-align:center;font-weight:700;font-size:26px;color:#4fd1c5;letter-spacing:.02em}
`;

/**
 * Render each distinct caption of `beats` as a PNG with alpha, for both framings, into `dir`: <beat>-<i>.png (the
 * landscape pill) and <beat>-<i>-tall.png (480 CSS px wide, the label on its own line); plus tall-bg.png, the tall
 * canvas. Returns the captions' sizes (px at DPR 2) by file.
 */
export async function renderCaptions(stage, sheets, beats, dir) {
  const sizes = {};
  for (const kind of ['land', 'tall']) {
    const page = await stage.browser.newPage({ viewport: TALL, deviceScaleFactor: 2 });
    try {
      await page.goto(`${stage.origin}robots.txt`);
      await page.setContent(`<!doctype html><html class="${kind}"><head>${sheets.map(h => `<link rel="stylesheet" href="${h}">`).join('')}<style>${CAP_CSS}</style></head><body><canvas id="game"></canvas><div class="cap"></div></body></html>`);
      await page.evaluate(async () => { await Promise.all(['600', '700'].map(w => document.fonts.load(`${w} 30px "Chakra Petch"`))); await document.fonts.ready; });
      for (const b of beats) {
        for (const [i, c] of b.caps.entries()) {
          const box = await page.evaluate((html) => { const el = document.querySelector('.cap'); el.innerHTML = html; const r = el.getBoundingClientRect(); return { x: 0, y: 0, width: Math.ceil(r.width) + 2, height: Math.ceil(r.height) + 2 }; }, c.html);
          const file = `${dir}/${b.id}-${i}${kind === 'tall' ? '-tall' : ''}.png`;
          const png = await page.screenshot({ clip: box, omitBackground: true });
          (await import('node:fs')).writeFileSync(file, png);
          sizes[file] = { w: box.width * 2, h: box.height * 2 };
        }
      }
      if (kind === 'tall') {
        await page.setContent(`<!doctype html><html class="tall"><head>${sheets.map(h => `<link rel="stylesheet" href="${h}">`).join('')}<style>${CAP_CSS}</style></head><body><canvas id="game"></canvas><div class="bg"><div class="hd">Ebbfall<b>On a phone</b></div><div class="ph"></div><div class="url">ebbfall.com</div></div></body></html>`);
        await page.evaluate(async () => { await document.fonts.ready; });
        (await import('node:fs')).writeFileSync(`${dir}/tall-bg.png`, await page.screenshot({ clip: { x: 0, y: 0, ...TALL } }));
      }
    } finally { await page.close(); }
  }
  return sizes;
}
