import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [react()],
  base: './',
  // strictPort: fail loudly if 5173 is taken (stale dev process) instead of
  // silently moving to 5174 while wait-on/Electron still target 5173.
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'renderer-dist',
    commonjsOptions: {
      include: [/node_modules/, /lib\/domain\.js/],
    },
  },
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Component tests (Vitest + jsdom). Kept to *.test.jsx so the stdlib
  // `node --test` suites under src/__tests__/*.test.js stay separate.
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.jsx'],
    setupFiles: ['./src/__tests__/setup.js'],
  },
});
