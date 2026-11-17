// The trailer's sound (tools/trailer/cut.mjs): the game's own effects, as the recorder logged them (record.mjs: every
// effect the game asked for, placed and thinned by the camera as it would have played: <part>.sfx.json), laid on a
// version's timeline and rendered offline through audio.js's own recipes (`endfall.renderSfx`, an OfflineAudioContext
// in the built game's page), with the game's wind bed under the action. No music: the cut's beats are where a track
// will go (the storyboard's sound brief). Written as a 16-bit stereo WAV at 48 kHz.
import { readFileSync, writeFileSync } from 'node:fs';

const RATE = 48000;

/**
 * The effects of a version: `clips` as cut.mjs lays them ({ part, dir, from, to, at }: the part's file, its in and out
 * points, where it starts on the timeline), plus each part's own extra sounds (`extra[part]`: [{ t, name, ... }], the
 * flash's boom), each at its time on the timeline.
 */
export function timeline(clips, extra = {}) {
  const out = [];
  for (const c of clips) {
    const logged = JSON.parse(readFileSync(`${c.dir}/${c.part}.sfx.json`, 'utf8'));
    for (const e of [...logged, ...(extra[c.part] || [])]) {
      if (e.t < c.from - 1e-6 || e.t >= c.to - 1e-6) continue;
      out.push({ ...e, t: +(c.at + e.t - c.from).toFixed(4) });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Render `events` over `seconds` (the wind from `wind.from` to `wind.to`, or none) into a WAV at `file`. */
export async function render(stage, events, seconds, wind, file) {
  const page = await stage.browser.newPage();
  try {
    await page.goto(stage.origin, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall?.renderSfx, null, { timeout: 90000 });
    const b64 = await page.evaluate(async ({ events, seconds, wind, rate }) => {
      const ctx = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate);
      window.endfall.renderSfx(ctx, events, wind);
      const buf = await ctx.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1);
      const pcm = new Int16Array(L.length * 2);
      for (let i = 0; i < L.length; i++) { pcm[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
      const bytes = new Uint8Array(pcm.buffer); let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    }, { events, seconds, wind, rate: RATE });
    writeFileSync(file, wav(Buffer.from(b64, 'base64')));
  } finally { await page.close(); }
}

/** A WAV file around interleaved 16-bit stereo PCM. */
function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
