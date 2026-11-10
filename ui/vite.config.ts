/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tauri expects a fixed port and its own error output in the terminal.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // The emoji list (lazy) and the icon-name index make chunks over Vite's 500 kB hint;
  // they load from disk in the app, so the higher limit only silences that hint.
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 700 },
  test: {
    environment: 'happy-dom',
    setupFiles: ['src/test/setup.ts'],
  },
});
