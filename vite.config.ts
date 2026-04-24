import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Vite 6 config — plain SPA, no SSR.
// Tailwind v4 loaded via its first-party Vite plugin (no PostCSS step).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    // Target evergreen browsers; Safari 16+ covers iOS PWA requirements from synthesis §2.
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
