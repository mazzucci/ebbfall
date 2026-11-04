import { defineConfig, loadEnv } from 'vite';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { offline } from './tools/offline/plugin.mjs';

// The game's build, as online play sees it: a hash of the .wasm (build:wasm runs first) and of the JS that sets a game
// up (the maps, an online room's setup, the client's view of the sim). Online, every seat must have the same
// (relay/room.js); a change to any of these is another game.
const SIM_INPUTS = ['src/engine/pkg/endfall_sim_bg.wasm', 'src/client/menu.js', 'src/client/online.js', 'src/engine/core.js', 'src/engine/constants.js', 'src/engine/util.js', 'src/client/maps.js']; // (util.js: a RANDOM seat's draw; maps.js: which map a room's setup plays)
const hash = createHash('sha256');
for (const f of SIM_INPUTS) { const p = new URL(`./${f}`, import.meta.url); hash.update(f); if (existsSync(p)) hash.update(readFileSync(p)); }
const SIM_BUILD = hash.digest('hex').slice(0, 12);

// What ships in dist/: a change under any of these is a game update. Docs, tests, CI, the relay and the site's Worker
// are not, so a commit touching only those leaves dist/ the same bytes and installed copies keep their offline cache
// (every file of dist/ is in it: a new commit hash in the page would make every device fetch everything again).
// test/build-inputs.test.js checks that every file the build reads lies under one of these.
export const SHIPPED = ['index.html', 'voice-lab.html', 'selftest.html', 'src', 'public', 'vite.config.js', 'tools/offline', 'scripts/build-wasm.mjs', 'crates/endfall-sim', 'Cargo.lock', 'rust-toolchain.toml', 'package.json', 'package-lock.json', '.nvmrc'];
// The last game update: the newest commit that changed anything under SHIPPED, and its date (the commit's, not the
// build's clock). The first page's stamp ("Updated Nov 4, 2026 · b8f7b2d"), About's beside the Version, and
// <meta name="build"> (the full hash: CI's deploy checks the live page carries the deployed build's). "dev" without
// git. It needs the history (CI's build job checks out with fetch-depth 0: a depth-1 clone names HEAD whatever it
// changed).
const git = (args) => { try { return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
const COMMIT = git(`log -1 --format=%H -- ${SHIPPED.join(' ')}`) || 'dev';
const COMMIT_DATE = COMMIT === 'dev' ? '' : git(`log -1 --format=%cI ${COMMIT}`);
const buildMeta = {
  name: 'endfall-build-meta',
  transformIndexHtml: (html) => html.replace('</head>', `  <meta name="build" content="${COMMIT}">\n  </head>`),
};

// MULTIPLAYER on the menu's first page: hidden in index.html, and shown by online.js where a relay is known. A build
// with the published relay (VITE_RELAY_URL) knows it from the start: the button is shown in the HTML itself, at first
// paint, not a moment later once the scripts have run.
const bakedRelay = (relay) => ({
  name: 'endfall-baked-relay',
  transformIndexHtml: (html) => (relay ? html.replace(/<button\b[^>]*\bid="btnOnline"[^>]*>/, (tag) => tag.replace(/\s+hidden(?=[\s>])/, '')) : html),
});

export default defineConfig(({ mode }) => ({
  define: { __SIM_BUILD__: JSON.stringify(SIM_BUILD), __COMMIT__: JSON.stringify(COMMIT), __COMMIT_DATE__: JSON.stringify(COMMIT_DATE) },
  // Relative asset paths so the built dist/ works from any static host or file path.
  base: './',
  server: { host: true, port: 5173 },
  // voice-lab.html: a page apart from the game, for judging the synthesized voice (not linked from the game);
  // selftest.html: the device check (the golden games: does this device compute the same game?).
  build: { target: 'es2022', sourcemap: true, rollupOptions: { input: { index: 'index.html', 'voice-lab': 'voice-lab.html', selftest: 'selftest.html' } } },
  plugins: [bakedRelay(loadEnv(mode, process.cwd(), 'VITE_').VITE_RELAY_URL), buildMeta, offline()], // dist/sw.js: the game keeps working offline once opened
}));
