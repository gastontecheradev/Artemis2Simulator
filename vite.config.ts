import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base relativa: el build funciona igual en GitHub Pages (subcarpeta) y en local.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
});
