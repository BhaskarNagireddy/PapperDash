import { defineConfig } from 'vitest/config';

const ci = !!process.env.CI;

export default defineConfig({
  test: {
    name: 'contracts',
    include: ['src/**/*.test.ts'],
    reporters: ci ? ['default', 'github-actions', 'junit'] : ['default'],
    outputFile: { junit: 'reports/junit.xml' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text-summary', 'json-summary', 'json'],
      reportOnFailure: true,
      thresholds: { lines: 85, statements: 85, functions: 80, branches: 75 },
    },
  },
});
