import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    // The detail-check calculation modules are pure TypeScript with no DOM and
    // no React, so the node environment is enough — no jsdom, no testing
    // library, no React plugin. Keep it that way: these tests exist to pin
    // down financial and legal rules, not to render components.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Optimizer tests run full beam/brute-force searches over modernization
    // measure subsets; CI runners are several times slower than local
    // machines, so give every test a generous shared ceiling instead of
    // per-test timeouts that were tuned to local speeds.
    testTimeout: 180_000,
  },
  resolve: {
    // Mirrors the `@/*` path mapping from tsconfig.json so tests can import the
    // same way application code does.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
