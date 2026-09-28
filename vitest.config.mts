import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
    include: [
      'src/**/*.spec.ts',
      'tests/**/*.spec.ts',
    ],
    exclude: ['node_modules/**', 'dist/**'],
    setupFiles: ['./test/vitest.setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    restoreMocks: false,
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: [
        'src/**/*.ts',
        'tests/enrolment-behavior/invariants/**/*.ts',
      ],
      exclude: [
        'src/main.ts',
        '**/*.module.ts',
        '**/*.entity.ts',
        '**/*.dto.ts',
      ],
    },
  },
  resolve: {
    alias: {
      src: new URL('./src', import.meta.url).pathname,
    },
  },
});
