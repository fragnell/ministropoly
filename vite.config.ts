import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base: './'` permette la pubblicazione anche in una sottocartella (es. GitHub Pages)
// perché l'app usa un router basato sull'hash (#/...).
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  plugins: [
    react(),
    {
      // Inserisce public/config.js (configurazione facoltativa a runtime, vedi README) prima dell'app
      name: 'pp-runtime-config',
      transformIndexHtml: () => [{ tag: 'script', attrs: { src: './config.js' }, injectTo: 'head-prepend' as const }],
    },
  ],
  server: {
    port: 5173,
    proxy: {
      // Quando si sviluppa con `npm run dev` e il relay LAN è attivo (`npm run relay`)
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 900 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 60000,
  },
});
