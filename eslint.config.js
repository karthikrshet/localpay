// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const OTHER_PACKAGES = ['@localpay/*', '../../*/src/**'];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'docs/site/**'] },
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
    files: ['packages/provider-razorpay/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: [...OTHER_PACKAGES, '!@localpay/core'], message: 'provider-razorpay may depend only on @localpay/core.' }] }],
    },
  },
);
