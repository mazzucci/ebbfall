// voice-lab.html: every announcer option for each race, one tap a phrase. A, B, C: the synthesizer's styles (voice.js);
// D: the device's own voice (speech.js), the voice it picked named and the device's other English voices to try (not
// remembered: the lab is for listening). Phones first: big buttons, nothing to set up.
import { speak, PHRASES, STYLES } from './voice.js';
import { speakLine, voiceFor, englishVoices, onVoices, picked, stopSpeech } from './speech.js';

const RACES = [
  ['humans', 'Humans', [
    ['A', 'humansRadio', 'Clean radio', 'A field radio, wider and cleaner than the original: no clipping, a faint click at the end.'],
    ['B', 'humansClear', 'Clear', 'A warm, clear voice, no radio.'],
    ['C', 'humansOriginal', 'Original', 'The radio operator the game had until now, for comparison.'],
    ['D', 'humansDevice', 'This device\'s voice', ''],
  ]],
  ['vael', 'Vael', [
    ['A', 'vaelClear', 'Clear', 'One clear voice, a little higher, with a faint crystal shimmer and a short, light room.'],
    ['B', 'vaelWarm', 'Warm', 'Softer, rounder and calmer, almost dry.'],
    ['C', 'vaelAiry', 'Airy', 'Two copies of one voice a few cents apart: airy, short and dry.'],
    ['D', 'vaelDevice', 'This device\'s voice', ''],
  ]],
];

const el = (tag, { dataset, ...props } = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); Object.assign(e.dataset, dataset); e.append(...kids); return e; };
const lab = document.getElementById('lab'), notes = {}, pickers = {};
for (const [race, title, styles] of RACES) {
  lab.append(el('h2', { textContent: title }));
  for (const [letter, style, name, note] of styles) {
    const grid = el('div', { className: 'grid' });
    for (const [key, p] of Object.entries(PHRASES)) grid.append(el('button', { textContent: p.text, dataset: { s: style, p: key } }));
    const box = el('section', { className: 'style', id: style }, el('h3', {}, el('b', { textContent: letter }), name));
    if (STYLES[style].device) {
      notes[race] = el('p', { className: 'note' });
      pickers[race] = el('select', { ariaLabel: `${title}: the device voice` });
      pickers[race].addEventListener('change', () => { picked[race] = pickers[race].value || undefined; showVoices(); });
      box.append(notes[race], pickers[race]);
    } else box.append(el('p', { className: 'note', textContent: note }));
    box.append(grid); lab.append(box);
  }
}

/** D: the voice each race got, and the device's English voices to choose from. */
function showVoices() {
  const all = englishVoices();
  for (const [race] of RACES) {
    const v = voiceFor(race), fallback = race === 'humans' ? 'A, clean radio' : 'A, clear';
    notes[race].textContent = v ? `Speaking in ${v.name} (${v.lang}${v.localService === false ? ', online' : ''})${picked[race] ? ', picked here' : ', picked for this race'}.`
      : `This device has no English voice${globalThis.speechSynthesis ? ' (yet: they may still be loading)' : ''}: D plays the synth's ${fallback}.`;
    const sel = pickers[race], keep = picked[race] || '';
    sel.replaceChildren(el('option', { value: '', textContent: 'Automatic' }), ...all.map(x => el('option', { value: x.voiceURI, textContent: `${x.name} (${x.lang}${x.localService === false ? ', online' : ''})` })));
    sel.value = keep; sel.hidden = !all.length;
  }
}
showVoices(); onVoices(showVoices);

let ctx = null, lit = null, buses = [];
const audio = () => { ctx ??= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state !== 'running') ctx.resume().catch(() => {}); return ctx; };
for (const b of lab.querySelectorAll('[data-p]')) b.addEventListener('click', () => {
  const c = audio(), { s, p } = b.dataset;
  lit?.classList.remove('on'); b.classList.add('on'); lit = b;
  // (D: the device's voice, the line before it cut; where the device cannot, the synth fallback)
  const bus = c.createGain(); bus.connect(c.destination); buses.push(bus);
  const len = STYLES[s].device && speakLine(p, s, { urgent: true }) ? 1.5 : speak(c, bus, p, s);
  setTimeout(() => { if (lit === b) { b.classList.remove('on'); lit = null; } }, len * 1000 + 100);
});
document.getElementById('stop').addEventListener('click', () => { stopSpeech(); for (const b of buses) b.disconnect(); buses = []; });

window.voiceLab = { speak, PHRASES, STYLES, state: () => ctx?.state ?? 'none', voiceFor };
