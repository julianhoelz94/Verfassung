import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['app/**/*.{ts,tsx,jsx}', 'lib/**/*.{ts,tsx,jsx}', 'middleware.ts'],
      exclude: ['**/*.test.*', '**/*.d.ts'],
      reporter: ['text-summary', 'json', 'html'],
      reportsDirectory: 'coverage/vitest',
    },
  },
});
