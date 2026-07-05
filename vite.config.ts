import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['refs/**', 'node_modules/**', 'dist/**'],
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Keep the watcher out of cargo's build output (EBUSY on Windows) and vendored repos.
      ignored: ['**/src-tauri/**', '**/refs/**'],
    },
  },
});
