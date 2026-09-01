/**
 * @module vitest.config
 * @description Vitest test runner configuration.
 * Uses happy-dom for DOM simulation, resolves `@/` alias to `src/`,
 * and loads `src/test-setup.ts` for global mocks before each test suite.
 */
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
