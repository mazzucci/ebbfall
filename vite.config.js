import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the built dist/ works from any static host or file path.
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2022', sourcemap: true },
});
