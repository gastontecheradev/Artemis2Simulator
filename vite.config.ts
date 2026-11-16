import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// relative base: the build works the same on GitHub Pages (subfolder) and locally.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    testTimeout: 60000,
  },
});
