import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/drizzle/**', '**/.turbo/**', '**/.next/**', '**/next-env.d.ts', '**/playwright-report/**', '**/test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  // The website runs in the browser as well as on Node.
  { files: ['apps/web/**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
);
