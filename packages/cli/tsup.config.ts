import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  platform: 'node',
  target: 'node18',
  splitting: false,
  treeshake: true,
  shims: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
