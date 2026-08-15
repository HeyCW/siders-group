import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['app/**/*.test.{ts,tsx}', 'components/**/*.test.{ts,tsx}', 'lib/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    env: {
      // lib/env.ts fails fast without this — tests exercise apiFetch's own logic, not env
      // validation, so a fixed test value stands in for the real deployment config.
      NEXT_PUBLIC_API_URL: 'http://localhost:4000',
    },
  },
});
