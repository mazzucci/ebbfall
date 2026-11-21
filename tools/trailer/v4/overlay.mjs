// Cut 4's overlays (tools/trailer/v4/record.mjs), HTML over the game's stage in the recorded page, set every frame from
// the recorder's clock: the black card and the diary typed in Share Tech Mono (the game's own monospace) with a block
// cursor, the warp (a white core, a cyan ring opening, a streak; the game has no warp effect), the white-out, the
// landing's ring, the King's card in IM Fell English SC (OFL; target/trailer4/fonts/IMFeENsc28P.ttf, from Google Fonts'
// repository: `curl -L -o target/trailer4/fonts/IMFeENsc28P.ttf https://github.com/google/fonts/raw/main/ofl/imfellenglishsc/IMFeENsc28P.ttf`;
// never committed, never in the game), and the end card in Chakra Petch. Sizes are CSS px of the 960x540 page at DPR 2.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { KING, CARD } from './script.mjs';

const FELL = fileURLToPath(new URL('../../../target/trailer4/fonts/IMFeENsc28P.ttf', import.meta.url));
const CSS = `
#tr{position:fixed;inset:0;pointer-events:none;z-index:99999;font-family:'Chakra Petch',sans-serif;color:#fff;overflow:hidden}
#tr div{position:absolute}
#tr .fill{inset:0}
#tr .mono{font-family:'Share Tech Mono',monospace;color:#bff3f6;text-shadow:0 0 10px rgba(79,209,197,.55),0 1px 2px rgba(0,0,0,.9)}
#tr .dim{color:#6fc6cd}
#tr .cur{display:inline-block;width:.55em;height:1em;background:#bff3f6;vertical-align:-.12em;margin-left:.15em;box-shadow:0 0 10px rgba(79,209,197,.7)}
#tr .shadow{text-shadow:0 2px 3px rgba(0,0,0,.85),0 0 14px rgba(11,15,22,.9),0 0 3px rgba(11,15,22,.9)}
#trBlack{background:#000;display:flex;align-items:center;justify-content:center;font-size:58px;letter-spacing:.08em}
#trBlack span{position:static}
#trShade{background:linear-gradient(0deg,rgba(4,9,14,.93) 0,rgba(4,9,14,.82) 30%,rgba(4,9,14,0) 56%);-webkit-mask-image:linear-gradient(90deg,#000 0,#000 66%,rgba(0,0,0,.3) 100%);mask-image:linear-gradient(90deg,#000 0,#000 66%,rgba(0,0,0,.3) 100%)}
#trDiary{left:54px;bottom:36px;width:860px;font-size:33px;line-height:1.5}
#trDiary div{position:static;min-height:1.5em}
#trDiary .day{font-size:27px;letter-spacing:.16em;min-height:0;margin-bottom:10px}
#trCapShade{background:linear-gradient(0deg,rgba(4,9,14,.9) 0,rgba(4,9,14,.62) 17%,rgba(4,9,14,0) 36%)}
#trCap{left:44px;bottom:32px;font-size:34px;white-space:nowrap}
#trCap .day{font-size:27px;letter-spacing:.16em;margin-right:18px}
#trKingShade{background:linear-gradient(90deg,rgba(8,7,4,.86) 0,rgba(8,7,4,.66) 42%,rgba(8,7,4,0) 72%)}
#trKing{left:60px;top:148px;width:540px;font-family:'IM Fell English SC',serif;font-size:46px;line-height:1.22;letter-spacing:.02em;color:#f4ead2;text-shadow:0 2px 4px rgba(0,0,0,.9),0 0 18px rgba(0,0,0,.75)}
#trKing div{position:static}
#trKing .rule{width:86px;height:2px;background:#d9a441;margin:22px 0 12px;box-shadow:0 0 8px rgba(217,164,65,.5)}
#trKing .tag{font-size:21px;letter-spacing:.2em;color:#d9a441}
#trVeil{background:#0b0f16}
#trVig{background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(0,0,0,.55) 100%)}
#trLogo{left:0;right:0;top:108px;display:flex;justify-content:center;align-items:center;gap:18px}
#trLogo img{display:block;border-radius:50%;background:#0b0f16;box-shadow:0 0 18px rgba(0,0,0,.6)}
#trLogo b{font-size:110px;line-height:1;letter-spacing:.005em}
#trLine{left:0;right:0;top:266px;text-align:center;font-weight:600;font-size:32px;line-height:1.3}
#trUrl{left:0;right:0;top:400px;text-align:center;font-weight:700;font-size:62px;color:#4fd1c5}
#trWhite{background:#fff}
#trTint{background:rgba(235,252,255,1)}
#trRing,#trRing2{border-radius:50%}
#trRing{border:3px solid rgba(215,252,255,.9);box-shadow:0 0 34px 8px rgba(79,209,197,.75),inset 0 0 34px 8px rgba(79,209,197,.55)}
#trRing2{border:1.5px solid rgba(200,250,255,.5);box-shadow:0 0 22px 3px rgba(79,209,197,.4)}
#trStreakH{left:0;right:0;height:4px;box-shadow:0 0 22px 5px rgba(140,235,245,.8)}
#trStreakV{top:0;bottom:0;width:2px;box-shadow:0 0 16px 4px rgba(140,235,245,.6)}
`;

/** Put the overlay into the page (once), its fonts loaded before the first frame. */
export async function install(page) {
  const fell = readFileSync(FELL).toString('base64');
  await page.evaluate(({ css, fell, KING, CARD }) => {
    const st = document.createElement('style');
    st.textContent = `@font-face{font-family:'IM Fell English SC';src:url(data:font/ttf;base64,${fell}) format('truetype')}${css}`;
    document.head.appendChild(st);
    const tr = document.createElement('div'); tr.id = 'tr';
    tr.innerHTML = `<div id="trVeil" class="fill"></div><div id="trVig" class="fill"></div>
      <div id="trShade" class="fill"></div><div id="trDiary" class="mono"></div>
      <div id="trCapShade" class="fill"></div><div id="trCap" class="mono"></div>
      <div id="trKingShade" class="fill"></div>
      <div id="trKing">${KING.lines.map(l => `<div class="l">${l}</div>`).join('')}<div class="rule"></div><div class="tag">${KING.tag}</div></div>
      <div id="trLogo" class="shadow"><img src="/icon.svg" width="92" height="92"><b>Ebbfall</b></div>
      <div id="trLine" class="shadow">${CARD.lines.join('<br>')}</div><div id="trUrl" class="shadow">${CARD.url}</div>
      <div id="trBlack" class="fill mono"><span></span></div>
      <div id="trTint" class="fill"></div><div id="trCore" class="fill"></div><div id="trRing"></div><div id="trRing2"></div><div id="trStreakH"></div><div id="trStreakV"></div>
      <div id="trWhite" class="fill"></div>`;
    document.body.appendChild(tr);
  }, { css: CSS, fell, KING, CARD });
  await page.evaluate(async () => {
    await Promise.all([...['500', '600', '700'].map(w => document.fonts.load(`${w} 40px "Chakra Petch"`)), document.fonts.load('40px "Share Tech Mono"'), document.fonts.load('40px "IM Fell English SC"')]);
    await document.fonts.ready; await document.querySelector('#trLogo img').decode().catch(() => {});
    if (!document.fonts.check('40px "IM Fell English SC"') || !document.fonts.check('40px "Share Tech Mono"')) throw new Error('overlay: a face did not load');
  });
}

/**
 * The overlay's state for one frame (all optional; alphas 0..1):
 *   black { alpha, text, cursor }       the black card, its typed text
 *   warp { x, y, k, alpha }             the warp at x, y (CSS px), grown to k (0..1.6)
 *   ring { x, y, r, alpha }             the landing's ring, opening
 *   white                               the white-out
 *   diary { day, lines, cursor, alpha } the diary along the bottom: the day stamp ('' until it shows), the lines as typed so far
 *   cap { day, text, cursor, alpha }    a one-line diary caption, bottom left
 *   king { shade, lines: [a, a, a], tag } the King's card: its shade, each line, the rule and his name
 *   grade, veil                         the stage desaturated and darkened; a dark veil over it (the end card's)
 *   card { logo, line, url }            the end card's three
 */
export function apply(page, s) {
  return page.evaluate((s) => {
    const $ = (id) => document.getElementById(id), op = (id, v) => { $(id).style.opacity = v || 0; };
    const cur = (on) => (on ? '<span class="cur"></span>' : '<span class="cur" style="opacity:0"></span>');
    op('trBlack', s.black?.alpha); if (s.black) $('trBlack').firstChild.innerHTML = `<span style="opacity:${s.black.textAlpha ?? 1}">${s.black.text}${cur(s.black.cursor)}</span>`;
    op('trWhite', s.white);
    const w = s.warp, k = w?.k || 0;
    for (const id of ['trTint', 'trCore', 'trRing', 'trRing2', 'trStreakH', 'trStreakV']) op(id, w ? w.alpha : 0);
    if (w) {
      const { x, y } = w, box = (id, r) => Object.assign($(id).style, { left: `${x - r}px`, top: `${y - r}px`, width: `${2 * r}px`, height: `${2 * r}px` });
      $('trTint').style.opacity = 0.34 * Math.min(1, k) * w.alpha;
      $('trCore').style.background = `radial-gradient(circle at ${x}px ${y}px,rgba(255,255,255,1) 0,rgba(255,255,255,.96) ${50 * k}px,rgba(160,240,250,.75) ${105 * k}px,rgba(79,209,197,0) ${250 * k}px)`;
      box('trRing', 185 * k); box('trRing2', 290 * k);
      const px = x / 9.6, py = y / 5.4, half = 22 * Math.min(1, k) + 1;
      Object.assign($('trStreakH').style, { top: `${y - 2}px`, background: `linear-gradient(90deg,rgba(255,255,255,0) ${px - half * 2.2}%,rgba(255,255,255,.95) ${px - half}%,#fff ${px}%,rgba(255,255,255,.95) ${px + half}%,rgba(255,255,255,0) ${px + half * 2.2}%)` });
      Object.assign($('trStreakV').style, { left: `${x - 1}px`, background: `linear-gradient(180deg,rgba(255,255,255,0) ${py - half * 2.6}%,rgba(255,255,255,.8) ${py - half * 1.2}%,#fff ${py}%,rgba(255,255,255,.8) ${py + half * 1.2}%,rgba(255,255,255,0) ${py + half * 2.6}%)` });
    }
    const g = s.ring;
    if (g) { for (const [id, f] of [['trRing', 1], ['trRing2', 1.45]]) { const r = g.r * f; Object.assign($(id).style, { left: `${g.x - r}px`, top: `${g.y - r}px`, width: `${2 * r}px`, height: `${2 * r}px`, opacity: g.alpha }); } }
    const d = s.diary; op('trShade', d?.alpha); op('trDiary', d?.alpha);
    if (d) { const html = `<div class="day dim" style="opacity:${d.day ? 1 : 0}">${d.day || '&nbsp;'}</div>${d.lines.map((l, i) => `<div>${l}${i === d.at ? cur(d.cursor) : ''}</div>`).join('')}`; if ($('trDiary').dataset.h !== html) { $('trDiary').dataset.h = html; $('trDiary').innerHTML = html; } }
    const c = s.cap; op('trCapShade', c?.alpha); op('trCap', c?.alpha);
    if (c) { const html = `<span class="day dim" style="opacity:${c.day ? 1 : 0}">${c.day || '&nbsp;'}</span>${c.text}${cur(c.cursor)}`; if ($('trCap').dataset.h !== html) { $('trCap').dataset.h = html; $('trCap').innerHTML = html; } }
    const kg = s.king; op('trKingShade', kg?.shade); op('trKing', kg ? 1 : 0);
    if (kg) { [...$('trKing').querySelectorAll('.l')].forEach((el, i) => { el.style.opacity = kg.lines[i]; }); $('trKing').querySelector('.rule').style.opacity = kg.tag; $('trKing').querySelector('.tag').style.opacity = kg.tag; }
    const gr = s.grade || 0;
    document.getElementById('game').style.filter = gr > 0 ? `saturate(${1 - 0.5 * gr}) brightness(${1 - 0.4 * gr})` : '';
    op('trVeil', (s.veil || 0) * 0.63); op('trVig', Math.max(gr, s.veil || 0));
    op('trLogo', s.card?.logo); op('trLine', s.card?.line); op('trUrl', s.card?.url);
  }, s);
}
