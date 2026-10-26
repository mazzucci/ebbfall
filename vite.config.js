import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { offline } from './tools/offline/plugin.mjs';

// The sim's build: a hash of the .wasm (build:wasm runs first). Online, every seat must have the same (relay/room.js).
const wasm = new URL('./src/engine/pkg/endfall_sim_bg.wasm', import.meta.url);
const SIM_BUILD = existsSync(wasm) ? createHash('sha256').update(readFileSync(wasm)).digest('hex').slice(0, 12) : 'none';

export default defineConfig({
  define: { __SIM_BUILD__: JSON.stringify(SIM_BUILD) },
  // Relative asset paths so the built dist/ works from any static host or file path.
  base: './',
  server: { host: true, port: 5173 },
  // voice-lab.html: a page apart from the game, for judging the synthesized voice (not linked from the game).
  build: { target: 'es2022', sourcemap: true, rollupOptions: { input: { index: 'index.html', 'voice-lab': 'voice-lab.html' } } },
  plugins: [offline()], // dist/sw.js: the game keeps working offline once opened
});
