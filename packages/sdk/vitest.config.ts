import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@solobank/mpp-solana': fileURLToPath(new URL('../mpp-solana/src/index.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/sdk.test.ts'],
    testTimeout: 30_000,
  },
});
