// voice-lab.html: the page loads, every option has its buttons, and a tap plays (the audio context running after it).
// Then every phrase rendered offline (OfflineAudioContext, in the page) in every synth style and measured, since no
// one listens here: no clipping, about as loud as the original radio operator (within 3 dB), about as long, and no
// rumble under 150 Hz. ENDFALL_VOICE_OUT=dir also writes some of them there as WAV files, to listen to.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, start, stop, browserContext, baseUrl, PHONE, ENGINE } from './harness.mjs';

before(start);
after(stop);

test('the voice lab loads, has every option for both races and plays on a tap', { timeout: 60000, engines: true }, async () => {
  const ctx = await browserContext(PHONE);
  try {
    const p = await ctx.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${baseUrl()}voice-lab.html`, { timeout: 30000 });
    await p.waitForFunction(() => window.voiceLab, null, { timeout: 10000 }).catch(e => { throw new Error(`${e.message} ${errors}`); });
    const styles = await p.evaluate(() => [...document.querySelectorAll('.style')].map(s => [s.id, s.querySelector('h3').textContent, s.querySelectorAll('button[data-p]').length]));
    assert.deepEqual(styles.map(s => s[0]), ['humansRadio', 'humansClear', 'humansOriginal', 'humansDevice', 'vaelClear', 'vaelWarm', 'vaelAiry', 'vaelDevice']);
    assert.deepEqual(styles.map(s => s[1][0]), ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D'], 'labelled A to D in each race');
    assert.ok(styles.every(s => s[2] === 4), 'four phrases in each');
    const small = await p.evaluate(() => [...document.querySelectorAll('button[data-p]')].filter(b => b.getBoundingClientRect().height < 48).length);
    assert.equal(small, 0, 'big enough to tap');
    assert.equal(await p.evaluate(() => window.voiceLab.state()), 'none', 'no sound before a tap');
    await p.locator('#vaelClear [data-p="attack"]').tap();
    // (headless Chromium has a stand-in audio device; WebKit and Firefox on a server may have none, their context never
    // runs: there the tap must open it, not necessarily run it)
    if (ENGINE === 'chromium') await p.waitForFunction(() => window.voiceLab.state() === 'running', null, { timeout: 5000 });
    else await p.waitForFunction(() => window.voiceLab.state() !== 'none', null, { timeout: 5000 });
    await p.locator('#vaelDevice [data-p="ether"]').tap(); // (the device's voice, or the synth where it has none)
    await p.locator('#humansRadio [data-p="research"]').tap();
    await p.locator('#stop').tap();
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

const SYNTH = ['humansRadio', 'humansClear', 'humansOriginal', 'vaelClear', 'vaelWarm', 'vaelAiry'];
const OUT = process.env.ENDFALL_VOICE_OUT, SAVE = ['attack', 'research', 'ether'];

test('every phrase in every synth style: no clipping, as loud and as long as the original, no rumble', { timeout: 120000, chromium: 'offline renders measured in one engine' }, async () => {
  const ctx = await browserContext({ viewport: { width: 800, height: 600 } });
  try {
    const p = await ctx.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${baseUrl()}voice-lab.html`, { timeout: 30000 });
    await p.waitForFunction(() => window.voiceLab, null, { timeout: 10000 }).catch(e => { throw new Error(`${e.message} ${errors}`); });
    const renders = await p.evaluate(async ({ styles, save }) => {
      const { speak, PHRASES } = window.voiceLab, SR = 44100, out = [];
      for (const style of styles) for (const key of Object.keys(PHRASES)) {
        // Channel 0: the voice; channel 1: the voice under 150 Hz.
        const c = new OfflineAudioContext(2, SR * 3, SR), merge = c.createChannelMerger(2), bus = c.createGain();
        bus.connect(merge, 0, 0);
        let under = bus; // (four low-passes: a steep cut, so the voice's first formant at 250-300 Hz does not leak in)
        for (let i = 0; i < 4; i++) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 150; f.Q.value = 0.707; under = under.connect(f); }
        under.connect(merge, 0, 1);
        merge.connect(c.destination);
        const len = speak(c, bus, key, style, 0.1);
        const buf = await c.startRendering(), x = buf.getChannelData(0), lo = buf.getChannelData(1);
        // 20 ms frames; the active ones within 30 dB of the loudest: loudness and length are measured over those.
        const N = SR / 50, frames = [];
        for (let i = 0; i + N <= x.length; i += N) { let e = 0; for (let j = i; j < i + N; j++) e += x[j] * x[j]; frames.push(e / N); }
        const top = Math.max(...frames), active = frames.map((e, i) => [e, i]).filter(([e]) => e > top * 1e-3);
        let peak = 0, all = 0, low = 0;
        for (let i = 0; i < x.length; i++) { peak = Math.max(peak, Math.abs(x[i])); all += x[i] * x[i]; low += lo[i] * lo[i]; }
        const rms = Math.sqrt(active.reduce((s, [e]) => s + e, 0) / active.length);
        const r = { style, key, len, peak, rmsDb: 20 * Math.log10(rms), span: (active.at(-1)[1] - active[0][1] + 1) / 50, lowDb: 10 * Math.log10(low / all), tail: Math.abs(x[x.length - 1]) };
        if (save.includes(key)) { const b = new Uint8Array(x.buffer); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); r.wav = btoa(s); }
        out.push(r);
      }
      return out;
    }, { styles: SYNTH, save: OUT ? SAVE : [] });
    assert.deepEqual(errors, []);
    const ref = Object.fromEntries(renders.filter(r => r.style === 'humansOriginal').map(r => [r.key, r]));
    const rows = renders.map(r => `${r.style.padEnd(15)} ${r.key.padEnd(9)} peak ${r.peak.toFixed(2)}  rms ${r.rmsDb.toFixed(1)} dB (${(r.rmsDb - ref[r.key].rmsDb).toFixed(1)})  length ${r.span.toFixed(2)} s (x${(r.span / ref[r.key].span).toFixed(2)})  under 150 Hz ${r.lowDb.toFixed(1)} dB`);
    console.log(rows.join('\n'));
    for (const r of renders) {
      const what = `${r.style} ${r.key}`;
      assert.ok(r.peak > 0.05 && r.peak < 0.98, `${what}: peak ${r.peak}`);
      assert.ok(Math.abs(r.rmsDb - ref[r.key].rmsDb) <= 3, `${what}: ${r.rmsDb.toFixed(1)} dB against the original's ${ref[r.key].rmsDb.toFixed(1)}`);
      const stretch = r.span / ref[r.key].span;
      assert.ok(stretch > 0.85 && stretch < 1.2, `${what}: ${r.span} s against ${ref[r.key].span} s`);
      assert.ok(r.lowDb < -15, `${what}: ${r.lowDb.toFixed(1)} dB of it under 150 Hz`);
      assert.ok(r.tail < 1e-4, `${what}: quiet at the end of the render (no long tail)`);
    }
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      for (const r of renders.filter(r => r.wav)) writeFileSync(join(OUT, `${r.style}-${r.key}.wav`), wav(new Float32Array(new Uint8Array(Buffer.from(r.wav, 'base64')).buffer), 44100));
    }
  } finally { await ctx.close(); }
});

/** 16-bit mono WAV. */
function wav(x, sr) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  return b;
}
