import { defineConfig } from 'vitest/config';

// Per-package test configs live in each package's own vitest.config.ts and are
// wired together by vitest.workspace.ts. This root config only sets shared
// coverage thresholds when running `vitest run --coverage` from the root.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        // 80% minimum per testing.md. Per-package configs can override.
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
