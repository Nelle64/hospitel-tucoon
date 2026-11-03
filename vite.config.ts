import { defineConfig } from 'vite';
import { pwaPlugin } from './tools/pwa/vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// GitHub Pages project URL: https://nelle64.github.io/hospitel-tucoon/
// BASE_PATH can override (e.g. '/' for local preview tests).
const base = process.env.BASE_PATH ?? '/hospitel-tucoon/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? process.env.BUILD_ID ?? 'local'),
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
  },
  plugins: [pwaPlugin({ base, version: pkg.version })],
  server: { host: true },
});
