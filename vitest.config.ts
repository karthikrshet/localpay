import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'scripts/**/*.test.ts', 'fixtures/**/*.test.ts'],
    // Cold imports of Fastify and Zod across ~30 parallel workers can pass 5s on slow machines.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
