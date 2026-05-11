import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    // Integration specs share one Postgres + TRUNCATE in beforeEach.
    // Running spec files in parallel races them against each other,
    // so confine the suite to a single worker.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/lib/prisma.ts'],
    },
  },
  resolve: {
    alias: {
      '@psms/shared': new URL('../../packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
