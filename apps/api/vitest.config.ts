import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
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
