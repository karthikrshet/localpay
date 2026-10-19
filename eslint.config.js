// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const OTHER_PACKAGES = ['@localpay/*', '../../*/src/**'];

export default tseslint.config(
  // The Next.js example is a standalone npm app; next build typechecks it.
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'docs/site/**', 'examples/nextjs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  { files: ['**/*.js'], ...tseslint.configs.disableTypeChecked },
  // Browser tests run callbacks inside the page (page.evaluate).
  { files: ['examples/**/*.e2e.js'], languageOptions: { globals: { ...globals.browser, ...globals.node } } },

  // Architecture rules from AGENTS.md (dependency-cruiser will back these up later).
  {
    files: ['packages/*/src/**/*.ts'],
    ignores: ['packages/core/src/clock/**'],
    rules: {
      'no-restricted-properties': ['error', { object: 'Date', property: 'now', message: 'Use the clock from @localpay/core.' }],
    },
  },
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: OTHER_PACKAGES, message: 'packages/core must not import other LocalPay packages.' }] }],
    },
  },
  {
    files: ['packages/webhooks/src/**/*.ts', 'packages/scenarios/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: [...OTHER_PACKAGES, '!@localpay/core'], message: 'webhooks and scenarios may depend only on @localpay/core; providers are injected.' }] }],
    },
  },
  {
    files: ['packages/checkout/src/**/*.{ts,tsx}', 'packages/dashboard/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: OTHER_PACKAGES, message: 'Browser bundles talk to the server over HTTP; do not import server packages.' }] }],
    },
  },
  {
    files: ['packages/provider-razorpay/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: [...OTHER_PACKAGES, '!@localpay/core'], message: 'provider-razorpay may depend only on @localpay/core.' }] }],
    },
  },
);
