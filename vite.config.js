import { defineConfig } from 'vite';
import { offline } from './tools/offline/plugin.mjs';

export default defineConfig({
  // Relative asset paths so the built dist/ works from any static host or file path.
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2022', sourcemap: true },
  plugins: [offline()], // dist/sw.js: the game keeps working offline once opened
});
