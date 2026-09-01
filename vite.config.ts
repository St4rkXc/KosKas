/**
 * @module vite.config
 * @description Vite build configuration for KosKas.
 * Plugins: Vue 3 SFC support + Tailwind CSS v4.
 * Strips console/debugger from production builds. Resolves `@/` to `src/`.
 * HMR and file watching are disabled when `DISABLE_HMR=true` (AI Studio agent mode).
 */
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    esbuild: {
      drop: ['console', 'debugger'],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
