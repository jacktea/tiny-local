import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  publicDir: 'pwa',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',
  },
});
