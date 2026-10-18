import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'fixtures/**/*.test.ts', 'examples/*/*.test.{ts,js}'],
    // Cold imports of Fastify and Zod across ~30 parallel workers can pass 5s on slow machines.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
