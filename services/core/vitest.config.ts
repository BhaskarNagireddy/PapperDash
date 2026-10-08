import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const ci = !!process.env.CI;

// Two labelled groups, so every report says which kind of test ran:
//   unit        — src/**/*.test.ts: one function or adapter, no server or database.
//   integration — test/**/*.test.ts: the real HTTP API on a migrated database (PGlite locally, PostgreSQL 16 in CI).
// SWC emits the decorator metadata NestJS dependency injection needs; esbuild does not.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    testTimeout: 20000,
    hookTimeout: 30000,
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts'] } },
      { extends: true, test: { name: 'integration', include: ['test/**/*.test.ts'] } },
    ],
    reporters: ci ? ['default', 'github-actions', 'junit'] : ['default'],
    outputFile: { junit: 'reports/junit.xml' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Process entry points are exercised by the Docker smoke test in CI, not by Vitest.
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/migrate.ts', 'src/db/schema.ts'],
      reporter: ['text-summary', 'json-summary', 'json'],
      reportOnFailure: true,
      // The minimum for every merge into main. Raise these as coverage grows; never lower them.
      thresholds: { lines: 90, statements: 86, functions: 84, branches: 75 },
    },
  },
});
