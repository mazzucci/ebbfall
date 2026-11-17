// The trailer's overlays (tools/trailer/record.mjs): HTML over the game's stage in the recorded page, in the game's
// fonts (Chakra Petch, src/fonts, loaded by the game's own style sheet): the captions, the one-word beats, the white
// flash, the black card, the freeze's grading, the logo and the end card (its YouTube layout too). The recorder sets
// their state every frame (`state`), so they move with the recorded time, not the wall clock.

/** Sizes are CSS px of the recorded viewport (960x540 or 540x960 at DPR 2: half the video's pixels). */
const CSS = `
#tr{position:fixed;inset:0;pointer-events:none;z-index:99999;font-family:'Chakra Petch',sans-serif;color:#fff;overflow:hidden}
#tr div{position:absolute}
#tr .shadow{text-shadow:0 2px 3px rgba(0,0,0,.85),0 0 14px rgba(11,15,22,.9),0 0 3px rgba(11,15,22,.9)}
#trGrade{inset:0;background:#0b0f16;opacity:0}
#trVig{inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(0,0,0,.55) 100%);opacity:0}
#trFlash{inset:0;background:#fff;opacity:0}
#trBlack{inset:0;background:#000;opacity:0;display:flex;align-items:center;justify-content:center}
#trBlack span{font-weight:600;font-size:30px;letter-spacing:.01em;color:#e8edf3;text-align:center;padding:0 40px;line-height:1.25}
#trCap{font-weight:600;line-height:1.18}
#trWord{left:0;right:0;text-align:center;font-weight:700;letter-spacing:.06em}
#trLogo{display:flex;align-items:center;gap:16px;transform-origin:50% 50%}
#trLogo img{display:block;border-radius:50%;background:#0b0f16;box-shadow:0 0 18px rgba(0,0,0,.6)}
#trLogo b{font-weight:700;line-height:1;letter-spacing:.005em}
#trLines{text-align:center}
#trLines p{margin:0;font-weight:600;line-height:1.2}
#trTap{border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px rgba(0,0,0,.6);opacity:0}
`;
/** Per format: where things go and how big (CSS px). */
const LAYOUT = {
  '16x9': {
    word: 'bottom:44px;font-size:48px', logo: { top: 0.155, icon: 76, word: 92 },
    lines: 'top:40%;left:0;right:0', sizes: [40, 31, 31, 24], gaps: [12, 8, 12, 0], url: 'top:80%;left:0;right:0;font-size:60px',
    linesYt: 'top:39%;left:0;width:54%;transform-origin:0 0;zoom:.92', urlYt: 'top:80%;left:0;width:50%;font-size:52px', logoYt: 0.17,
  },
  '9x16': {
    word: 'top:72%;font-size:52px', logo: { top: 0.18, icon: 60, word: 72 },
    lines: 'top:33%;left:45px;width:410px', sizes: [32, 26, 26, 20], gaps: [16, 12, 16, 0], url: 'top:65%;left:45px;width:410px;font-size:48px',
  },
};
const LINES = ['Free · In your browser', 'No download, no account', 'Solo vs the AI, or friends from a link', 'Open source'];
const LINES_TALL = ['Free · In your browser', 'No download,<br>no account', 'Solo vs the AI,<br>or friends from a link', 'Open source'];
const COLORS = ['#f5a524', '#fff', '#fff', '#9fb0c4'];

/** Put the overlay into the page (once), its fonts loaded before the first frame. */
export async function install(page, fmt) {
  const L = LAYOUT[fmt];
  await page.evaluate(({ css, L, fmt, lines, colors }) => {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const tr = document.createElement('div'); tr.id = 'tr';
    tr.innerHTML = `<div id="trGrade"></div><div id="trVig"></div>
      <div id="trCap" class="shadow"></div><div id="trWord" class="shadow" style="${L.word}"></div>
      <div id="trLogo" class="shadow"><img src="/icon.svg" width="${L.logo.icon}" height="${L.logo.icon}"><b style="font-size:${L.logo.word}px">Ebbfall</b></div>
      <div id="trLines" class="shadow" style="${L.lines}">${lines.map((t, i) => `<p style="font-size:${L.sizes[i]}px;color:${colors[i]};margin-bottom:${L.gaps[i]}px">${t}</p>`).join('')}</div>
      <div id="trUrl" class="shadow" style="${L.url};text-align:center;font-weight:700;color:#4fd1c5">ebbfall.com</div>
      <div id="trTap"></div><div id="trFlash"></div><div id="trBlack"><span></span></div>`;
    document.body.appendChild(tr);
    tr.dataset.fmt = fmt;
  }, { css: CSS, L, fmt, lines: fmt === '9x16' ? LINES_TALL : LINES, colors: COLORS });
  await page.evaluate(async () => {
    await Promise.all(['500', '600', '700'].map(w => document.fonts.load(`${w} 40px "Chakra Petch"`)));
    await document.fonts.ready; await document.querySelector('#trLogo img').decode().catch(() => {});
  });
}

/**
 * The overlay's state for one frame (all optional): flash (0..1, white), black ({ alpha, text }), cap ({ text, alpha,
 * style }), word ({ text, alpha }), grade (0..1: the freeze's desaturation and darkening, to 50% saturation and 60%
 * brightness), veil (0..1: on to the end card's 78% dark veil), logo ({ alpha, scale, yt: 0..1 toward the YouTube
 * layout's left half }), lines (five alphas: the four lines and the URL), yt (the end card's YouTube layout), tap
 * ({ x, y, r, alpha }: CSS px).
 */
export function apply(page, s, fmt) {
  return page.evaluate(([s, L]) => {
    const $ = (id) => document.getElementById(id);
    $('trFlash').style.opacity = s.flash || 0;
    $('trBlack').style.opacity = s.black ? s.black.alpha : 0;
    if (s.black) $('trBlack').firstChild.innerHTML = s.black.text;
    const cap = $('trCap'); cap.style.opacity = s.cap ? s.cap.alpha : 0;
    if (s.cap && cap.dataset.text !== s.cap.text + s.cap.style) { cap.dataset.text = s.cap.text + s.cap.style; cap.innerHTML = s.cap.text; cap.setAttribute('style', s.cap.style); cap.style.opacity = s.cap.alpha; }
    const w = $('trWord'); w.style.opacity = s.word ? s.word.alpha : 0;
    if (s.word) { w.textContent = s.word.text; if (w.dataset.extra !== (s.word.style || '')) { w.dataset.extra = s.word.style || ''; w.setAttribute('style', `${L.word};${s.word.style || ''};opacity:${s.word.alpha}`); } }
    const g = s.grade || 0, v = s.veil || 0;
    const stage = document.getElementById('game');
    stage.style.filter = g > 0 ? `saturate(${1 - 0.5 * g}) brightness(${1 - 0.4 * g})` : '';
    $('trGrade').style.opacity = v * 0.63; // (over the frame at 60% brightness: 78% dark in all)
    $('trVig').style.opacity = Math.max(g, v);
    const logo = $('trLogo'), lg = s.logo || { alpha: 0 };
    logo.style.opacity = lg.alpha;
    const W = innerWidth, H = innerHeight, lw = logo.offsetWidth, lh = logo.offsetHeight, yt = lg.yt || 0;
    const cx = W / 2 * (1 - yt) + (W / 4) * yt, cy = H * (L.logo.top * (1 - yt) + (L.logoYt ?? L.logo.top) * yt);
    logo.style.left = `${cx - lw / 2}px`; logo.style.top = `${cy - lh / 2}px`; logo.style.transform = `scale(${lg.scale ?? 1})`;
    const lines = $('trLines'), url = $('trUrl');
    lines.setAttribute('style', s.yt ? L.linesYt : L.lines); url.setAttribute('style', `${s.yt ? L.urlYt : L.url};text-align:center;font-weight:700;color:#4fd1c5`);
    const a = s.lines || [0, 0, 0, 0, 0];
    [...lines.children].forEach((p, i) => { p.style.opacity = a[i]; p.style.transform = `translateY(${(1 - a[i]) * 8}px)`; });
    url.style.opacity = a[4]; url.style.transform = `translateY(${(1 - a[4]) * 8}px)`;
    const tap = $('trTap'), t = s.tap;
    tap.style.opacity = t ? t.alpha : 0;
    if (t) Object.assign(tap.style, { left: `${t.x - t.r}px`, top: `${t.y - t.r}px`, width: `${t.r * 2}px`, height: `${t.r * 2}px` });
  }, [s, LAYOUT[fmt]]);
}
