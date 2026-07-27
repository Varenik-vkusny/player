import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    // Спайки — одноразовая оснастка, они не участвуют в проверках.
    exclude: ['**/node_modules/**', 'spikes/**'],
  },
});
