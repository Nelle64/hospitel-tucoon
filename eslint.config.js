import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/assets/**', 'test-results/**', 'playwright-report/**', 'reports/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
      'prefer-const': 'error',
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use the seeded RNG (src/core/rng.ts) inside the simulation.' }],
    },
  },
  {
    files: ['src/render/**', 'src/ui/**', 'src/audio/**', 'tools/**', 'tests/e2e/**'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    // Browser tests reach into the page through untyped evaluate() callbacks.
    files: ['tests/e2e/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
