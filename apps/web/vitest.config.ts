import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    // Playwright-спеки лежат в e2e/ и запускаются отдельным раннером —
    // не должны попадать в vitest (иначе test.describe() падает).
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
