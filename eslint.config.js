import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['playwright-report/**', 'test-results/**'],
  },
  {
    files: [
      'frontend/**/*.js',
      'frontend/**/*.mjs',
      'tests/**/*.mjs',
      'playwright.config.mjs',
      'eslint.config.js',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: js.configs.recommended.rules,
  },
];
