import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@solobank/sdk': fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/cli.test.ts'],
    testTimeout: 30_000,
  },
});
