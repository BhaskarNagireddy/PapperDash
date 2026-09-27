import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC emits the decorator metadata NestJS dependency injection needs; esbuild does not.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { include: ['src/**/*.test.ts', 'test/**/*.test.ts'], testTimeout: 20000, hookTimeout: 30000 },
});
