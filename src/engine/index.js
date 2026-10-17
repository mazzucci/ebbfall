// Loads the Rust simulation (crates/endfall-sim) compiled to WASM. The generated bindings live in ./pkg/,
// produced by `npm run build:wasm`. The client will move onto this surface as the Rust port reaches parity
// with src/sim/; until then the game still runs on the JS sim and this only proves the WASM build loads.
import init, * as sim from './pkg/endfall_sim.js';

let ready = null;

/** Fetch and instantiate the WASM module once; resolves to the bindings (Game, version, ...). */
export function loadEngine() {
  ready ??= init().then(() => sim);
  return ready;
}
