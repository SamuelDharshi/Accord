/**
 * Accord — Phase 2: Live Walrus & Memory Integration Tests
 *
 * ════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ════════════════════════════════════════════════════════════════════════════
 * Zero-mock, real-network integration tests targeting LIVE Walrus endpoints:
 *   - Walrus Publisher (writes)  → https://publisher.walrus-testnet.walrus.space
 *   - Walrus Aggregator (reads)  → https://aggregator.walrus-testnet.walrus.space
 *
 * All tests talk to real Walrus network infrastructure. Real blob IDs are
 * captured and logged. No mock servers, no stub HTTP clients.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * PREREQUISITES
 * ════════════════════════════════════════════════════════════════════════════
 *   1. Copy agent/.env.example to agent/.env and fill in all values
 *   2. WALRUS_PUBLISHER_URL and WALRUS_AGGREGATOR_URL must be set
 *   3. Internet access must be available (no VPN blocking walrus.space)
 *   4. Run: cd agent && npx vitest run src/test/walrus-live.test.ts
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EXPECTED OUTPUT (sample)
 * ════════════════════════════════════════════════════════════════════════════
 *   ✓ [WALRUS LIVE] Upload real deliverable file and verify blob integrity
 *       → Blob ID: 4bVGMSMqyPyZsHoFDXqSxSLJJaYoqBpj2mXsXi9GHvDQ
 *       → Upload duration: 1.23s | Retrieval duration: 0.45s
 *       → Integrity: SHA-256 MATCH ✓
 *   ✓ [WALRUS MEMORY] Write relationship context → mutate → verify state
 *       → Write blob ID: 7kRHNTMrQwPzAiFGYpUvWeLKJbZcXmDsOnYt8Hx3VnEP
 *       → Read-back: SUCCESS ✓ | Mutation persisted: YES ✓
 */

import { describe, it, expect, beforeAll } from 'vitest';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Internal Walrus helpers (direct imports from agent source) ───────────────
import {
  storeBlob,
  retrieveBlob,
  getRelationshipContext,
  updateRelationshipContext,
  storeCovenantBrief,
  getCovenantBrief,
} from '../memory/walrus-memory.js';
import type { InteractionRecord, RelationshipContext } from '../prompts/verification.js';

// ─── Environment ───────────────────────────────────────────────────────────────
const WALRUS_PUBLISHER_URL =
  process.env.WALRUS_PUBLISHER_URL ?? 'https://publisher.walrus-testnet.walrus.space';
const WALRUS_AGGREGATOR_URL =
  process.env.WALRUS_AGGREGATOR_URL ?? 'https://aggregator.walrus-testnet.walrus.space';

// Test identity addresses (mirrors testnet wallet setup)
const TEST_CLIENT_ADDR    = '0xc1e0000000000000000000000000000000000000000000000000000000000001';
const TEST_CONTRACTOR_ADDR = '0xc044000000000000000000000000000000000000000000000000000000000001';
const TEST_COVENANT_ID    = '0xbeef0000000000000000000000000000000000000000000000000000deadbeef';

// ─── Test Timeouts ─────────────────────────────────────────────────────────────
// Walrus network operations can take 5–30 seconds for finality
const WALRUS_UPLOAD_TIMEOUT_MS   = 60_000; // 60s
const WALRUS_RETRIEVE_TIMEOUT_MS = 30_000; // 30s
const WALRUS_MEMORY_TIMEOUT_MS   = 90_000; // 90s (write + read cycle)

// ─── Test File Setup ───────────────────────────────────────────────────────────
// Generate a synthetic "deliverable PDF" with unique content per test run
function createSyntheticDeliverable(): Buffer {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');

  // Minimal valid PDF structure with unique content
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length 200 >>
stream
BT
/F1 12 Tf
50 750 Td
(Accord Protocol — Live Integration Test Deliverable) Tj
0 -20 Td
(Covenant: Website Redesign Project) Tj
0 -20 Td
(Milestone: 1 of 3 — Wireframes & Low-Fidelity Prototype) Tj
0 -20 Td
(Timestamp: ${timestamp}) Tj
0 -20 Td
(Test Nonce: ${nonce}) Tj
ET
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000068 00000 n
0000000125 00000 n
0000000274 00000 n
0000000523 00000 n

trailer
<< /Size 6 /Root 1 0 R >>
startxref
610
%%EOF`;

  return Buffer.from(pdfContent, 'utf-8');
}

// ─── SHA-256 Integrity Helper ──────────────────────────────────────────────────
function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 2A: BLOB UPLOAD & RETRIEVAL INTEGRITY
// ═════════════════════════════════════════════════════════════════════════════

describe('[WALRUS LIVE] Blob Upload & Retrieval Integrity', () => {

  it(
    'should upload a real deliverable file and retrieve it with 100% integrity',
    async () => {
      console.log('\n════════════════════════════════════════════════════════');
      console.log('[WALRUS LIVE] Starting blob upload integrity test...');
      console.log(`Publisher endpoint: ${WALRUS_PUBLISHER_URL}`);
      console.log(`Aggregator endpoint: ${WALRUS_AGGREGATOR_URL}`);

      // ── Step 1: Generate unique deliverable ──────────────────────────────
      const originalData = createSyntheticDeliverable();
      const originalHash = sha256(originalData);
      console.log(`\n[Upload] Generating synthetic deliverable PDF...`);
      console.log(`  File size: ${originalData.length} bytes`);
      console.log(`  SHA-256 (original): ${originalHash}`);

      // ── Step 2: Upload to live Walrus publisher ───────────────────────────
      const uploadStart = Date.now();
      let blobId: string;

      try {
        blobId = await storeBlob(originalData, 5); // 5 epochs (~2 weeks for testing)
      } catch (err) {
        console.error(`[Upload FAILED] ${(err as Error).message}`);
        throw err;
      }

      const uploadDuration = Date.now() - uploadStart;
      console.log(`\n[Upload SUCCESS]`);
      console.log(`  Walrus Blob ID: ${blobId}`);
      console.log(`  Upload duration: ${(uploadDuration / 1000).toFixed(2)}s`);
      console.log(`  Public URL: ${WALRUS_AGGREGATOR_URL}/v1/blobs/${blobId}`);

      // Validate blob ID format (Walrus uses base58-like format, ~43 chars)
      expect(blobId).toBeTruthy();
      expect(blobId.length).toBeGreaterThan(30);
      expect(blobId.length).toBeLessThan(60);

      // ── Step 3: Wait for Walrus network finality ─────────────────────────
      console.log('\n[Finality] Waiting 3 seconds for blob propagation...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // ── Step 4: Retrieve from live Walrus aggregator ─────────────────────
      const retrieveStart = Date.now();
      let retrievedData: Buffer;

      try {
        retrievedData = await retrieveBlob(blobId);
      } catch (err) {
        console.error(`[Retrieve FAILED] blobId=${blobId}: ${(err as Error).message}`);
        throw err;
      }

      const retrieveDuration = Date.now() - retrieveStart;
      const retrievedHash = sha256(retrievedData);

      console.log(`\n[Retrieve SUCCESS]`);
      console.log(`  Retrieved size: ${retrievedData.length} bytes`);
      console.log(`  SHA-256 (retrieved): ${retrievedHash}`);
      console.log(`  Retrieval duration: ${(retrieveDuration / 1000).toFixed(2)}s`);

      // ── Step 5: Verify 100% data integrity ───────────────────────────────
      const integrityMatch = originalHash === retrievedHash;
      console.log(`\n[Integrity Check]`);
      console.log(`  Original SHA-256:  ${originalHash}`);
      console.log(`  Retrieved SHA-256: ${retrievedHash}`);
      console.log(`  Integrity Status:  ${integrityMatch ? '✓ MATCH' : '✗ MISMATCH'}`);

      expect(retrievedData.length).toBe(originalData.length);
      expect(retrievedHash).toBe(originalHash);

      console.log('\n[PASS] Blob upload & integrity verification: SUCCESS');
      console.log(`  Blob ID: ${blobId}`);
      console.log('════════════════════════════════════════════════════════\n');
    },
    WALRUS_UPLOAD_TIMEOUT_MS,
  );

  it(
    'should upload multiple blobs and retrieve each by unique ID',
    async () => {
      console.log('\n[WALRUS LIVE] Multi-blob uniqueness test...');

      const blobs = [
        Buffer.from(`Accord Deliverable A — ${Date.now()}`, 'utf-8'),
        Buffer.from(`Accord Deliverable B — ${Date.now() + 1}`, 'utf-8'),
        Buffer.from(`Accord Deliverable C — ${Date.now() + 2}`, 'utf-8'),
      ];

      const blobIds: string[] = [];

      for (let i = 0; i < blobs.length; i++) {
        const id = await storeBlob(blobs[i]!, 5);
        blobIds.push(id);
        console.log(`  Blob ${i + 1} uploaded: ${id}`);
      }

      // All blob IDs must be unique
      const uniqueIds = new Set(blobIds);
      expect(uniqueIds.size).toBe(blobs.length);

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Retrieve each and verify content
      for (let i = 0; i < blobIds.length; i++) {
        const retrieved = await retrieveBlob(blobIds[i]!);
        expect(sha256(retrieved)).toBe(sha256(blobs[i]!));
        console.log(`  Blob ${i + 1} retrieved & verified: ✓`);
      }

      console.log('[PASS] Multi-blob uniqueness and retrieval: SUCCESS');
    },
    WALRUS_UPLOAD_TIMEOUT_MS * 3,
  );

  it(
    'should confirm blob is publicly accessible via HTTP aggregator URL',
    async () => {
      console.log('\n[WALRUS LIVE] Public HTTP accessibility test...');

      const testContent = Buffer.from(
        `Accord public access test — ${Date.now()}`,
        'utf-8'
      );

      const blobId = await storeBlob(testContent, 5);
      console.log(`  Uploaded blob: ${blobId}`);

      await new Promise(resolve => setTimeout(resolve, 4000));

      // Direct HTTP GET to aggregator (not via SDK wrapper)
      const publicUrl = `${WALRUS_AGGREGATOR_URL}/v1/blobs/${blobId}`;
      console.log(`  Fetching public URL: ${publicUrl}`);

      const httpStart = Date.now();
      const response = await axios.get(publicUrl, {
        responseType: 'arraybuffer',
        timeout: 15_000,
      });
      const httpDuration = Date.now() - httpStart;

      expect(response.status).toBe(200);
      const retrieved = Buffer.from(response.data as ArrayBuffer);
      expect(sha256(retrieved)).toBe(sha256(testContent));

      console.log(`  HTTP status: ${response.status}`);
      console.log(`  Response duration: ${httpDuration}ms`);
      console.log(`  Content verified: ✓`);
      console.log('[PASS] Public HTTP blob access: SUCCESS');
    },
    WALRUS_RETRIEVE_TIMEOUT_MS,
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 2B: WALRUS MEMORY GRAPH — RELATIONSHIP CONTEXT
// ═════════════════════════════════════════════════════════════════════════════

describe('[WALRUS MEMORY] Relationship Context Graph — Live State Mutations', () => {

  it(
    'should write a multi-turn interaction profile and read it back from Walrus',
    async () => {
      console.log('\n════════════════════════════════════════════════════════');
      console.log('[WALRUS MEMORY] Starting relationship context write test...');
      console.log(`Client address:     ${TEST_CLIENT_ADDR}`);
      console.log(`Contractor address: ${TEST_CONTRACTOR_ADDR}`);

      // ── Step 1: Write initial interaction (Milestone 0 — PASS) ───────────
      const interaction0: InteractionRecord = {
        covenantId:           TEST_COVENANT_ID,
        milestoneIndex:       0,
        outcome:              'PASS',
        deliveryLatencyHours: 24,
        qualityNotes:         'Wireframes delivered on time. All 5 screens included. Client approved immediately.',
        amountUsdsui:         150_000_000, // $150.00
        timestamp:            Date.now() - 7 * 24 * 3600 * 1000, // 7 days ago
      };

      const writeStart0 = Date.now();
      await updateRelationshipContext(
        TEST_CLIENT_ADDR,
        TEST_CONTRACTOR_ADDR,
        interaction0,
      );
      const writeDuration0 = Date.now() - writeStart0;
      console.log(`\n[Write 1] Interaction 0 (PASS) written to Walrus`);
      console.log(`  Duration: ${(writeDuration0 / 1000).toFixed(2)}s`);

      // ── Step 2: Write second interaction (Milestone 1 — REVIEW) ─────────
      const interaction1: InteractionRecord = {
        covenantId:           TEST_COVENANT_ID,
        milestoneIndex:       1,
        outcome:              'REVIEW',
        deliveryLatencyHours: 72,
        qualityNotes:         'Visual designs submitted but brand colors deviate from brief. Flagged for client review.',
        amountUsdsui:         200_000_000, // $200.00
        timestamp:            Date.now() - 2 * 24 * 3600 * 1000, // 2 days ago
      };

      const writeStart1 = Date.now();
      await updateRelationshipContext(
        TEST_CLIENT_ADDR,
        TEST_CONTRACTOR_ADDR,
        interaction1,
      );
      const writeDuration1 = Date.now() - writeStart1;
      console.log(`\n[Write 2] Interaction 1 (REVIEW) written to Walrus`);
      console.log(`  Duration: ${(writeDuration1 / 1000).toFixed(2)}s`);

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 3000));

      // ── Step 3: Read back and verify both interactions exist ──────────────
      const readStart = Date.now();
      const context = await getRelationshipContext(TEST_CLIENT_ADDR, TEST_CONTRACTOR_ADDR);
      const readDuration = Date.now() - readStart;

      console.log(`\n[Read-back] Context retrieved from Walrus`);
      console.log(`  Duration: ${(readDuration / 1000).toFixed(2)}s`);

      expect(context).not.toBeNull();
      expect(context!.clientAddress).toBe(TEST_CLIENT_ADDR);
      expect(context!.contractorAddress).toBe(TEST_CONTRACTOR_ADDR);
      expect(context!.interactions).toHaveLength(2);
      expect(context!.interactions[0]!.outcome).toBe('PASS');
      expect(context!.interactions[1]!.outcome).toBe('REVIEW');
      expect(context!.totalValueTransacted).toBe(350_000_000); // $350.00
      expect(context!.disputeHistory).toHaveLength(1); // REVIEW goes to dispute history

      console.log(`  Client: ${context!.clientAddress} ✓`);
      console.log(`  Contractor: ${context!.contractorAddress} ✓`);
      console.log(`  Interaction count: ${context!.interactions.length} ✓`);
      console.log(`  Total value transacted: $${(context!.totalValueTransacted / 1_000_000).toFixed(2)} USDSUI ✓`);
      console.log(`  Dispute history entries: ${context!.disputeHistory.length} ✓`);
      console.log('[PASS] Relationship context write & read-back: SUCCESS');
      console.log('════════════════════════════════════════════════════════\n');
    },
    WALRUS_MEMORY_TIMEOUT_MS,
  );

  it(
    'should mutate relationship context with a successful milestone payout and verify real-time state change',
    async () => {
      console.log('\n[WALRUS MEMORY] State mutation test — simulating milestone 2 payout...');

      // Seed initial state (2 interactions)
      const seed0: InteractionRecord = {
        covenantId: TEST_COVENANT_ID, milestoneIndex: 0,
        outcome: 'PASS', deliveryLatencyHours: 18,
        qualityNotes: 'Perfect delivery.', amountUsdsui: 150_000_000,
        timestamp: Date.now() - 10 * 86400_000,
      };
      const seed1: InteractionRecord = {
        covenantId: TEST_COVENANT_ID, milestoneIndex: 1,
        outcome: 'PASS', deliveryLatencyHours: 36,
        qualityNotes: 'Good work, minor revisions accepted.', amountUsdsui: 200_000_000,
        timestamp: Date.now() - 3 * 86400_000,
      };

      await updateRelationshipContext(TEST_CLIENT_ADDR, TEST_CONTRACTOR_ADDR, seed0);
      await updateRelationshipContext(TEST_CLIENT_ADDR, TEST_CONTRACTOR_ADDR, seed1);

      const beforeContext = await getRelationshipContext(TEST_CLIENT_ADDR, TEST_CONTRACTOR_ADDR);
      expect(beforeContext).not.toBeNull();
      const beforeCount = beforeContext!.interactions.length;
      const beforeValue = beforeContext!.totalValueTransacted;

      console.log(`\n[Before Mutation]`);
      console.log(`  Interactions: ${beforeCount}`);
      console.log(`  Total value: $${(beforeValue / 1_000_000).toFixed(2)} USDSUI`);

      // ── MUTATE: Add successful final milestone payout ─────────────────────
      const newInteraction: InteractionRecord = {
        covenantId:           TEST_COVENANT_ID,
        milestoneIndex:       2,
        outcome:              'PASS',
        deliveryLatencyHours: 12,
        qualityNotes:         'Final code delivery. All tests passing. Deployed to staging successfully.',
        amountUsdsui:         150_000_000, // $150.00 — milestone 2 payout
        timestamp:            Date.now(),
      };

      console.log('\n[Mutating] Appending successful milestone 2 payout to relationship context...');
      const mutateStart = Date.now();
      await updateRelationshipContext(TEST_CLIENT_ADDR, TEST_CONTRACTOR_ADDR, newInteraction);
      const mutateDuration = Date.now() - mutateStart;
      console.log(`  Mutation written to Walrus: ${(mutateDuration / 1000).toFixed(2)}s`);

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 4000));

      // ── Verify mutation persisted ─────────────────────────────────────────
      const afterContext = await getRelationshipContext(TEST_CLIENT_ADDR, TEST_CONTRACTOR_ADDR);
      expect(afterContext).not.toBeNull();

      const afterCount = afterContext!.interactions.length;
      const afterValue = afterContext!.totalValueTransacted;
      const latestInteraction = afterContext!.interactions[afterContext!.interactions.length - 1]!;

      console.log(`\n[After Mutation]`);
      console.log(`  Interactions: ${afterCount} (was ${beforeCount})`);
      console.log(`  Total value: $${(afterValue / 1_000_000).toFixed(2)} USDSUI (was $${(beforeValue / 1_000_000).toFixed(2)})`);
      console.log(`  Latest milestone: ${latestInteraction.milestoneIndex} — ${latestInteraction.outcome}`);

      expect(afterCount).toBeGreaterThan(beforeCount);
      expect(afterValue).toBeGreaterThan(beforeValue);
      expect(latestInteraction.milestoneIndex).toBe(2);
      expect(latestInteraction.outcome).toBe('PASS');
      expect(latestInteraction.amountUsdsui).toBe(150_000_000);

      console.log('[PASS] Real-time distributed state mutation verified on Walrus: SUCCESS');
    },
    WALRUS_MEMORY_TIMEOUT_MS,
  );

  it(
    'should store and retrieve a covenant brief from Walrus Memory',
    async () => {
      console.log('\n[WALRUS MEMORY] Covenant brief storage test...');

      const brief = `
Project: Website Redesign for TechStartup Inc.
Total Budget: $500.00 USDSUI
Timeline: 6 weeks

Milestone 1 (30% — $150): Wireframes & low-fidelity prototypes for all 8 pages.
Requirements: 8 screens in Figma, mobile + desktop variants, reviewed by client.

Milestone 2 (40% — $200): Final visual designs, brand assets, and design system.
Requirements: Figma file with components, exported assets (SVG/PNG), brand guidelines.

Milestone 3 (30% — $150): Production-ready front-end code.
Requirements: Next.js 14 implementation, Lighthouse score > 90, deployed to Vercel.

Style: Modern, clean, dark mode default. Brand colors: #6C63FF (primary), #2D2D2D (bg).
Target audience: SaaS-savvy developers. No stock photos — all custom illustrations.
`.trim();

      const storeStart = Date.now();
      const blobId = await storeCovenantBrief(TEST_COVENANT_ID, 0, brief);
      const storeDuration = Date.now() - storeStart;

      console.log(`  Brief stored: blobId=${blobId} (${(storeDuration / 1000).toFixed(2)}s)`);

      expect(blobId).toBeTruthy();

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Retrieve and verify
      const retrieveStart = Date.now();
      const retrievedBrief = await getCovenantBrief(TEST_COVENANT_ID, 0);
      const retrieveDuration = Date.now() - retrieveStart;

      console.log(`  Brief retrieved: (${(retrieveDuration / 1000).toFixed(2)}s)`);
      console.log(`  Content match: ${retrievedBrief === brief ? '✓' : '✗'}`);

      expect(retrievedBrief).toBe(brief);
      expect(retrievedBrief).toContain('Website Redesign');
      expect(retrievedBrief).toContain('$500.00 USDSUI');

      console.log('[PASS] Covenant brief store & retrieval from Walrus: SUCCESS');
    },
    WALRUS_MEMORY_TIMEOUT_MS,
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 2C: WALRUS NETWORK HEALTH CHECK
// ═════════════════════════════════════════════════════════════════════════════

describe('[WALRUS LIVE] Network Health & Endpoint Reachability', () => {

  it('should confirm publisher node is reachable', async () => {
    console.log(`\n[Health Check] Publisher: ${WALRUS_PUBLISHER_URL}`);
    try {
      const resp = await axios.get(WALRUS_PUBLISHER_URL, { timeout: 10_000 });
      console.log(`  Status: ${resp.status} — Publisher ONLINE ✓`);
      // Publisher returns some response (could be 200 or 404 for root)
      expect([200, 404, 405]).toContain(resp.status);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        // Any HTTP response means the node is alive
        console.log(`  Status: ${err.response.status} — Publisher ONLINE ✓`);
        expect(err.response.status).toBeLessThan(600);
      } else {
        throw new Error(`Publisher unreachable: ${(err as Error).message}`);
      }
    }
  }, 15_000);

  it('should confirm aggregator node is reachable', async () => {
    console.log(`\n[Health Check] Aggregator: ${WALRUS_AGGREGATOR_URL}`);
    try {
      const resp = await axios.get(WALRUS_AGGREGATOR_URL, { timeout: 10_000 });
      console.log(`  Status: ${resp.status} — Aggregator ONLINE ✓`);
      expect([200, 404, 405]).toContain(resp.status);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        console.log(`  Status: ${err.response.status} — Aggregator ONLINE ✓`);
        expect(err.response.status).toBeLessThan(600);
      } else {
        throw new Error(`Aggregator unreachable: ${(err as Error).message}`);
      }
    }
  }, 15_000);
});
