import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'fixtures/**/*.test.ts', 'examples/*/*.test.{ts,js}'],
    // Cold imports of Fastify and Zod across ~30 parallel workers can pass 5s on slow machines.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Quality gate from the plan: 90%+ line coverage for the engine and the provider.
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**', 'packages/provider-razorpay/src/**'],
      exclude: ['**/*.test.ts', '**/test-helpers.ts'],
      reporter: ['text-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
