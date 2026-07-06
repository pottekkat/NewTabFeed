import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '.wxt/**',
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  {
    // Node-side tooling: config files, build scripts and e2e specs.
    files: [
      '*.config.{js,ts,mjs}',
      'scripts/**/*.{js,mjs}',
      'e2e/**/*.ts',
      'playwright.config.ts',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Playwright fixtures use `async ({}, use) => ...` to opt out of
      // injected dependencies — the empty pattern is intentional.
      'no-empty-pattern': 'off',
    },
  },
  prettier,
);
