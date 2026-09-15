import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Node by default; component tests opt in with a
    // ` @vitest-environment jsdom` docblock at the top of the file.
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    // Playwright specs live in tests/e2e and are run by `npm run e2e`.
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**'],
    restoreMocks: true,
  },
});
