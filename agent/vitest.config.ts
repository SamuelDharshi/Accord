import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ── Global test config ────────────────────────────────────────────────────
    globals: true,
    environment: 'node',

    // ── Live network timeouts ─────────────────────────────────────────────────
    // Extended for real Walrus uploads, Sui Testnet finality, and Claude API.
    // Claude SDK timeout is set to 30s internally; this is an outer safety net.
    testTimeout: 120_000,  // 2 minutes per test (outer safety net)
    hookTimeout:  30_000,  // 30s for beforeAll/afterAll hooks

    // ── Environment variable loading ──────────────────────────────────────────
    // Automatically loads agent/.env for all tests
    setupFiles: ['./src/test/setup.ts'],

    // ── Test file patterns ────────────────────────────────────────────────────
    include: [
      'src/test/**/*.test.ts',
      'src/test/**/*.spec.ts',
    ],

    // ── Reporter config ────────────────────────────────────────────────────────
    reporter: ['verbose'],

    // ── Sequential execution ──────────────────────────────────────────────────
    // Disable parallelism for live network tests to avoid rate limiting.
    // Use maxForks:1 (valid Vitest 2.x option) instead of singleFork.
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 1,
        minForks: 1,
      },
    },

    // ── Do NOT retry on failure ───────────────────────────────────────────────
    // Live network tests should fail fast — retrying doubles wall-clock time
    // and makes Claude API test run for 75+ seconds with no benefit.
    retry: 0,
  },

  resolve: {
    // Allow importing from agent src without .js extension in test files
    extensions: ['.ts', '.js'],
  },
});
