// Browser entry for the Rust simulation: starts instantiating the WASM (built by `npm run build:wasm` into ./pkg/) and
// exposes the sim surface from core.js at once. Nothing may call into the sim before `ready` has resolved (main.js
// awaits it: the menu, src/boot.js, comes up first and only reads the tables and pure helpers until then).
import init, { version } from './pkg/endfall_sim.js';

export const ready = init().then(() => console.info('Ebbfall: Rust sim ' + version() + ' (WASM)'));

export * from './core.js';
