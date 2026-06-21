/**
 * Accord Agent — Test Setup File
 *
 * Loaded before every test suite by Vitest.
 * Initialises environment variables from .env for live network tests.
 */

import 'dotenv/config';

// ── Validate critical env vars are present for live tests ──────────────────────
// We warn but don't throw — individual tests handle their own skip logic
const warnings: string[] = [];

if (!process.env.WALRUS_PUBLISHER_URL) {
  console.warn('[TEST SETUP] WALRUS_PUBLISHER_URL not set — using default testnet endpoint');
}
if (!process.env.WALRUS_AGGREGATOR_URL) {
  console.warn('[TEST SETUP] WALRUS_AGGREGATOR_URL not set — using default testnet endpoint');
}
if (!process.env.GROQ_API_KEY) {
  warnings.push('GROQ_API_KEY');
}
if (!process.env.ARCA_PRIVATE_KEY) {
  warnings.push('ARCA_PRIVATE_KEY');
}
if (!process.env.ACCORD_PACKAGE_ID) {
  warnings.push('ACCORD_PACKAGE_ID');
}
if (!process.env.ARCA_CAP_OBJECT_ID) {
  warnings.push('ARCA_CAP_OBJECT_ID');
}

if (warnings.length > 0) {
  console.warn(
    `\n[TEST SETUP] The following env vars are not set — some tests will be skipped:\n  ${warnings.join(', ')}\n` +
    `  Copy agent/.env.example to agent/.env and fill in values to run all tests.\n`
  );
}

console.log('[TEST SETUP] Accord live integration test suite loaded');
console.log(`[TEST SETUP] Network: ${process.env.SUI_NETWORK ?? 'testnet'}`);
console.log(`[TEST SETUP] RPC:     ${process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443'}`);
console.log(`[TEST SETUP] Walrus publisher: ${process.env.WALRUS_PUBLISHER_URL ?? 'https://publisher.walrus-testnet.walrus.space'}`);
