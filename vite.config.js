import { defineConfig, loadEnv } from 'vite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { offline } from './tools/offline/plugin.mjs';
import { docs } from './tools/docs/build.mjs';

// The game's build, as online play sees it: a hash of the .wasm (build:wasm runs first) and of the JS that sets a game
// up (the maps, an online room's setup, the client's view of the sim). Online, every seat must have the same
// (relay/room.js); a change to any of these is another game.
const SIM_INPUTS = ['src/engine/pkg/endfall_sim_bg.wasm', 'src/client/menu.js', 'src/client/online.js', 'src/engine/core.js', 'src/engine/constants.js', 'src/engine/util.js', 'src/client/maps.js']; // (util.js: a RANDOM seat's draw; maps.js: which map a room's setup plays)
const hash = createHash('sha256');
for (const f of SIM_INPUTS) { const p = new URL(`./${f}`, import.meta.url); hash.update(f); if (existsSync(p)) hash.update(readFileSync(p)); }
const SIM_BUILD = hash.digest('hex').slice(0, 12);

// MULTIPLAYER on the menu's first page: hidden in index.html, and shown by online.js where a relay is known. A build
// with the published relay (VITE_RELAY_URL) knows it from the start: the button is shown in the HTML itself, at first
// paint, not a moment later once the scripts have run.
const bakedRelay = (relay) => ({
  name: 'endfall-baked-relay',
  transformIndexHtml: (html) => (relay ? html.replace(/<button\b[^>]*\bid="btnOnline"[^>]*>/, (tag) => tag.replace(/\s+hidden(?=[\s>])/, '')) : html),
});

export default defineConfig(({ mode }) => ({
  define: { __SIM_BUILD__: JSON.stringify(SIM_BUILD) },
  // Relative asset paths so the built dist/ works from any static host or file path.
  base: './',
  server: { host: true, port: 5173 },
  // voice-lab.html: a page apart from the game, for judging the synthesized voice (not linked from the game);
  // selftest.html: the device check (the golden games: does this device compute the same game?).
  build: { target: 'es2022', sourcemap: true, rollupOptions: { input: { index: 'index.html', 'voice-lab': 'voice-lab.html', selftest: 'selftest.html' } } },
  plugins: [bakedRelay(loadEnv(mode, process.cwd(), 'VITE_').VITE_RELAY_URL), docs(), offline()], // the docs at /docs/ (tools/docs, not stored offline); dist/sw.js: the game keeps working offline once opened
}));
