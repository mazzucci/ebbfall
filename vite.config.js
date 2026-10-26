import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { offline } from './tools/offline/plugin.mjs';

// The game's build, as online play sees it: a hash of the .wasm (build:wasm runs first) and of the JS that sets a game
// up (the maps, an online room's setup, the client's view of the sim). Online, every seat must have the same
// (relay/room.js); a change to any of these is another game.
const SIM_INPUTS = ['src/engine/pkg/endfall_sim_bg.wasm', 'src/client/menu.js', 'src/client/online.js', 'src/engine/core.js', 'src/engine/constants.js'];
const hash = createHash('sha256');
for (const f of SIM_INPUTS) { const p = new URL(`./${f}`, import.meta.url); hash.update(f); if (existsSync(p)) hash.update(readFileSync(p)); }
const SIM_BUILD = hash.digest('hex').slice(0, 12);

export default defineConfig({
  define: { __SIM_BUILD__: JSON.stringify(SIM_BUILD) },
  // Relative asset paths so the built dist/ works from any static host or file path.
  base: './',
  server: { host: true, port: 5173 },
  // voice-lab.html: a page apart from the game, for judging the synthesized voice (not linked from the game);
  // selftest.html: the device check (the golden games: does this device compute the same game?).
  build: { target: 'es2022', sourcemap: true, rollupOptions: { input: { index: 'index.html', 'voice-lab': 'voice-lab.html', selftest: 'selftest.html' } } },
  plugins: [offline()], // dist/sw.js: the game keeps working offline once opened
});
