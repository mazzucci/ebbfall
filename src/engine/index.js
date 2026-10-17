// Browser entry for the Rust simulation: instantiate the WASM (built by `npm run build:wasm` into ./pkg/)
// before anything touches the game, then expose the sim surface from core.js.
import init, { version } from './pkg/endfall_sim.js';

await init();
console.info('Endfall: Rust sim ' + version() + ' (WASM)');

export * from './core.js';
