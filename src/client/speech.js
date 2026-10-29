// The device's own voice for the announcer: the Web Speech API (speechSynthesis), built into Android (Google's voices),
// iPhone and iPad (Siri's) and desktop browsers; no asset files. Each race gets a voice of its own where the device has
// two, chosen the same way every time from the English voices on the device itself (they work offline): the Humans a
// natural, male-sounding voice at its own pitch, the Vael another, higher and a little slower (voice.js STYLES:
// `humansDevice`, `vaelDevice`). Where there is no speechSynthesis or no English voice on the device, `speakLine`
// says so (false) and the caller speaks in the synth style instead. audio.js `say` drives it when the announcer is on;
// voice-lab.html lets the owner hear it and try the device's other voices.
import { PHRASES, STYLES } from './voice.js';

/** Names known to sound good, by race, best first (matched at the start of a voice's name, so "Daniel (Enhanced)" and
 *  "Microsoft Guy Online (Natural) - English (United States)" count): Apple's, Google's, Microsoft's. */
const NAMES = {
  humans: ['Daniel', 'Alex', 'Aaron', 'Arthur', 'Google UK English Male', 'Microsoft Guy', 'Microsoft Ryan', 'Microsoft David', 'Microsoft Mark', 'Fred'],
  vael: ['Samantha', 'Karen', 'Moira', 'Tessa', 'Serena', 'Google US English', 'Google UK English Female', 'Microsoft Aria', 'Microsoft Jenny', 'Microsoft Sonia', 'Microsoft Zira'],
};
/** Then by accent (Android names its voices by language only: one race gets a US voice, the other a British one). */
const LANGS = { humans: ['en-US', 'en-GB'], vael: ['en-GB', 'en-AU', 'en-IE', 'en-US'] };

const synth = () => globalThis.speechSynthesis;
const lang = (v) => String(v.lang || '').replace('_', '-');
/** The device's English voices, ordered by name (getVoices() is empty until they have loaded: `onVoices`). */
export function englishVoices() {
  let all = [];
  try { all = synth()?.getVoices?.() || []; } catch { /* no speech */ }
  return [...all].filter(v => /^en(-|$)/i.test(lang(v))).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** A voice's rank for a race: a known good name, then the accent, then its name (lower is better). */
function rank(v, race) {
  const n = NAMES[race].findIndex(p => v.name === p || v.name.startsWith(p + ' '));
  const l = LANGS[race].findIndex(p => lang(v).toLowerCase() === p.toLowerCase());
  return [n < 0 ? 99 : n, l < 0 ? 9 : l];
}
const better = (race) => (a, b) => { const [x, y] = [rank(a, race), rank(b, race)]; return x[0] - y[0] || x[1] - y[1] || (a.name < b.name ? -1 : 1); };

/** Voices picked by hand (the lab's picker), by race: a voiceURI. Not remembered: the lab is for listening. */
export const picked = {};

/** The voice a race speaks in: the pick by hand if the device still has it, else the best of the device's own English
 *  voices, the Vael another than the Humans' where there are two; null if the device has none. */
export function voiceFor(race) {
  const all = englishVoices();
  const mine = picked[race] && all.find(v => v.voiceURI === picked[race]);
  if (mine) return mine;
  const local = all.filter(v => v.localService !== false).sort(better(race));
  if (race !== 'vael') return local[0] || null;
  const humans = voiceFor('humans');
  return local.find(v => v !== humans) || local[0] || null; // (one voice only: the races differ by pitch and rate)
}

/** Call `fn` whenever the device's voices change (they load after the page, Chrome's at least). */
export function onVoices(fn) {
  const s = synth();
  if (!s) return;
  if (s.addEventListener) s.addEventListener('voiceschanged', fn); else s.onvoiceschanged = fn;
}

let used = false, unlocked = false;
/** iPhone and iPad speak only once a gesture has: speak nothing, inside one (audio.js `wake`). */
export function unlockSpeech() {
  const s = synth();
  if (unlocked || !s || typeof SpeechSynthesisUtterance === 'undefined') return;
  try { const u = new SpeechSynthesisUtterance(''); u.volume = 0; s.speak(u); unlocked = true; s.getVoices(); } catch { /* no speech */ }
}

/** Whether this device can speak in a device style (`humansDevice`, `vaelDevice`): speechSynthesis and a voice for it. */
export function canSpeak(styleName) {
  const style = STYLES[styleName]?.device;
  return !!style && !!synth() && typeof SpeechSynthesisUtterance !== 'undefined' && !!voiceFor(style.race);
}

/**
 * Say a phrase (a key of PHRASES) in a device style (STYLES: `humansDevice`, `vaelDevice`). One line at a time: a line
 * still speaking is cut for an `urgent` one, otherwise the new one is dropped. Returns false where the device cannot
 * (no speechSynthesis, no English voice): the caller speaks in the synth style instead.
 */
export function speakLine(key, styleName, { urgent = false } = {}) {
  const s = synth(), style = STYLES[styleName]?.device, text = PHRASES[key]?.text;
  if (!text || !canSpeak(styleName)) return false;
  const voice = voiceFor(style.race);
  try {
    if (s.speaking || s.pending) { if (!urgent) return true; s.cancel(); }
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice; u.lang = voice.lang; u.pitch = style.pitch; u.rate = style.rate; u.volume = 1;
    s.speak(u); used = true;
    return true;
  } catch { return false; }
}

/** Stop the line being spoken (sound off, the pause card). Only if this page has spoken: otherwise it leaves the API be. */
export function stopSpeech() {
  if (!used) return;
  try { synth()?.cancel(); } catch { /* no speech */ }
}
