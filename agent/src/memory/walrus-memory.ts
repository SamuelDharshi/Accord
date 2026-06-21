/**
 * Accord Agent — Walrus Memory Integration
 *
 * Manages cross-project relationship intelligence for the Arca agent using the
 * Walrus HTTP API for blob storage. Since @walrus-labs/memory-sdk may not be
 * published on npm yet, we implement the memory pattern directly using the
 * Walrus publisher/aggregator REST endpoints.
 *
 * Architecture:
 *   - Relationship context keyed as "relationship:{clientAddr}:{contractorAddr}"
 *   - Covenant briefs keyed as "brief:{covenantId}:{milestoneIndex}"
 *   - All data serialized as JSON blobs on Walrus
 *   - Rolling summary compresses history when >10 interactions accumulate
 */

import axios from 'axios';
import { logger } from '../utils/logger.js';
import type { InteractionRecord, RelationshipContext } from '../prompts/verification.js';

const WALRUS_AGGREGATOR_URL =
  process.env.WALRUS_AGGREGATOR_URL ?? 'https://aggregator.walrus-testnet.walrus.space';
const WALRUS_PUBLISHER_URL =
  process.env.WALRUS_PUBLISHER_URL ?? 'https://publisher.walrus-testnet.walrus.space';
const MEMORY_EPOCHS = parseInt(
  process.env.WALRUS_MEMORY_EPOCHS ??
    process.env.WALRUS_DELIVERABLE_EPOCHS ??
    (process.env.WALRUS_NETWORK === 'mainnet' ? '104' : '5'),
  10,
);

// ─── Blob Registry ────────────────────────────────────────────────────────────
// In production this would use an on-chain registry or a persistent DB.
// For the hackathon: an in-process Map keyed by memory key → latest blobId.
// This survives agent restarts only if backed by a file. TODO: persist to disk.
const memoryRegistry = new Map<string, string>();

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Writes a JSON value to Walrus and records the blob ID in the registry.
 */
async function walrusSet(key: string, value: unknown): Promise<string> {
  const body = JSON.stringify({ _accord_key: key, data: value });
  const bytes = Buffer.from(body, 'utf-8');

  const response = await axios.put(
    `${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=${MEMORY_EPOCHS}`,
    bytes,
    {
      headers: { 'Content-Type': 'application/octet-stream' },
    },
  );

  // Walrus returns either { newlyCreated: { blobObject: { blobId } } }
  // or { alreadyCertified: { blobId } }
  const blobId: string =
    response.data?.newlyCreated?.blobObject?.blobId ??
    response.data?.alreadyCertified?.blobId;

  if (!blobId) {
    throw new Error(`Walrus store failed for key "${key}": ${JSON.stringify(response.data)}`);
  }

  memoryRegistry.set(key, blobId);
  logger.info(`Walrus memory written: key="${key}" blobId="${blobId}"`);
  return blobId;
}

/**
 * Reads a JSON value from Walrus by looking up the registry for the key's latest blobId.
 */
async function walrusGet<T>(key: string): Promise<T | null> {
  const blobId = memoryRegistry.get(key);
  if (!blobId) return null;

  try {
    const response = await axios.get(`${WALRUS_AGGREGATOR_URL}/v1/blobs/${blobId}`, {
      responseType: 'arraybuffer',
    });
    const text = Buffer.from(response.data).toString('utf-8');
    const parsed = JSON.parse(text) as { _accord_key: string; data: T };
    return parsed.data;
  } catch (err) {
    logger.warn(`Walrus memory read failed for key="${key}": ${(err as Error).message}`);
    return null;
  }
}

// ─── Relationship Context API ─────────────────────────────────────────────────

/**
 * Retrieves the relationship context for a client-contractor pair.
 * Returns null if no prior interactions exist.
 */
export async function getRelationshipContext(
  clientAddress: string,
  contractorAddress: string,
): Promise<RelationshipContext | null> {
  const key = `relationship:${clientAddress}:${contractorAddress}`;
  return walrusGet<RelationshipContext>(key);
}

/**
 * Appends a new interaction to the relationship context and writes it back to Walrus.
 * Applies rolling compression when history exceeds 10 records to control blob size.
 */
export async function updateRelationshipContext(
  clientAddress: string,
  contractorAddress: string,
  newInteraction: InteractionRecord,
  summarizationFn?: (interactions: InteractionRecord[]) => Promise<{
    contractorPatterns: string;
    clientPreferences: string;
  }>,
): Promise<void> {
  const key = `relationship:${clientAddress}:${contractorAddress}`;
  const existing: RelationshipContext = (await walrusGet<RelationshipContext>(key)) ?? {
    clientAddress,
    contractorAddress,
    interactions: [],
    clientPreferences: '',
    contractorPatterns: '',
    disputeHistory: [],
    totalValueTransacted: 0,
  };

  existing.interactions.push(newInteraction);
  existing.totalValueTransacted += newInteraction.amountUsdsui;

  if (newInteraction.outcome === 'REVIEW' || newInteraction.outcome === 'FAIL') {
    existing.disputeHistory.push(
      `[${new Date(newInteraction.timestamp).toISOString()}] Milestone ${newInteraction.milestoneIndex}: ${newInteraction.outcome} — "${newInteraction.qualityNotes}"`,
    );
  }

  // Rolling compression: summarize when history grows beyond 10 records.
  if (existing.interactions.length > 10 && summarizationFn) {
    try {
      const summary = await summarizationFn(existing.interactions);
      existing.contractorPatterns = summary.contractorPatterns;
      existing.clientPreferences = summary.clientPreferences;
      // Keep only the last 5 raw interactions for recent context.
      existing.interactions = existing.interactions.slice(-5);
      logger.info(`Relationship history compressed for key="${key}"`);
    } catch (err) {
      logger.warn(`Summarization failed, keeping full history: ${(err as Error).message}`);
    }
  }

  await walrusSet(key, existing);
}

// ─── Covenant Brief Storage ────────────────────────────────────────────────────

/**
 * Stores the covenant brief in Walrus Memory at covenant creation time.
 * Arca retrieves this when verifying each milestone.
 */
export async function storeCovenantBrief(
  covenantId: string,
  milestoneIndex: number,
  brief: string,
): Promise<string> {
  const key = `brief:${covenantId}:${milestoneIndex}`;
  return walrusSet(key, { brief });
}

/**
 * Retrieves the stored covenant brief for a specific milestone.
 */
export async function getCovenantBrief(
  covenantId: string,
  milestoneIndex: number,
): Promise<string | null> {
  const key = `brief:${covenantId}:${milestoneIndex}`;
  const result = await walrusGet<{ brief: string }>(key);
  return result?.brief ?? null;
}

// ─── Blob Store Helpers for Deliverables ─────────────────────────────────────

/**
 * Uploads raw binary data to Walrus and returns the blob ID.
 * Used for deliverable files uploaded by contractors.
 */
export async function storeBlob(
  data: Buffer,
  epochs: number = MEMORY_EPOCHS,
): Promise<string> {
  const response = await axios.put(
    `${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=${epochs}`,
    data,
    { headers: { 'Content-Type': 'application/octet-stream' } },
  );

  const blobId: string =
    response.data?.newlyCreated?.blobObject?.blobId ??
    response.data?.alreadyCertified?.blobId;

  if (!blobId) {
    throw new Error(`Walrus store failed: ${JSON.stringify(response.data)}`);
  }

  logger.info(`Walrus blob stored: blobId="${blobId}" size=${data.length}b epochs=${epochs}`);
  return blobId;
}

/**
 * Retrieves binary blob data from Walrus by blobId.
 */
export async function retrieveBlob(blobId: string): Promise<Buffer> {
  const response = await axios.get(`${WALRUS_AGGREGATOR_URL}/v1/blobs/${blobId}`, {
    responseType: 'arraybuffer',
  });
  return Buffer.from(response.data);
}

export function getWalrusBlobUrl(blobId: string): string {
  return `${WALRUS_AGGREGATOR_URL}/v1/blobs/${blobId}`;
}
