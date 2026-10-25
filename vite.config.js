import { defineConfig } from 'vite';
import { offline } from './tools/offline/plugin.mjs';

export default defineConfig({
  // Relative asset paths so the built dist/ works from any static host or file path.
  base: './',
  server: { host: true, port: 5173 },
  // voice-lab.html: a page apart from the game, for judging the synthesized voice (not linked from the game).
  build: { target: 'es2022', sourcemap: true, rollupOptions: { input: { index: 'index.html', 'voice-lab': 'voice-lab.html' } } },
  plugins: [offline()], // dist/sw.js: the game keeps working offline once opened
});
