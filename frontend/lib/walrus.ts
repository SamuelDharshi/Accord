/**
 * Accord Frontend — Walrus Storage Integration
 *
 * Client-side wrapper for the Walrus HTTP API.
 * Contractors upload deliverable files directly from the browser to Walrus.
 * Returns the blob ID to be recorded on-chain via the agent.
 *
 * ── Walrus Memory SDK Note ──────────────────────────────────────────────────
 * We use a custom blob pattern (direct HTTP PUT to the Walrus publisher)
 * instead of the official @mysten/walrus SDK. This is intentional for the
 * hackathon for two reasons:
 *   1. The SDK requires a Walrus system object ID that differs per network,
 *      adding setup friction for judges running locally.
 *   2. The HTTP API is stable, well-documented, and sufficient for CRUD.
 *
 * Migration to the official SDK for production:
 *   import { WalrusClient } from '@mysten/walrus';
 *   const walrus = new WalrusClient({ network: 'testnet', suiClient });
 *   const { blobId } = await walrus.writeBlob({ blob: buffer, deletable: false, epochs: 104 });
 *
 * Walrus Memory (cross-session AI context) is implemented in the agent
 * service (agent/src/walrus-memory.ts) using the same HTTP pattern.
 * ────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';

const PUBLISHER_URL =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ??
  'https://publisher.walrus-testnet.walrus.space';
const AGGREGATOR_URL =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ??
  'https://aggregator.walrus-testnet.walrus.space';

// ~2 years in Sui epochs (reduced to 5 for testnet limits)
const DELIVERABLE_EPOCHS = 5;

export interface WalrusStoreResult {
  blobId: string;
  objectId?: string;
  viewUrl: string;
}

/**
 * Uploads a file to Walrus from the browser.
 * Used by contractors during the delivery upload flow.
 *
 * @param file           - Browser File object.
 * @param covenantId     - Associated covenant ID (for metadata).
 * @param milestoneIndex - Milestone being delivered.
 * @param onProgress     - Optional progress callback (0–100).
 */
export async function storeDeliverable(
  file: File,
  covenantId: string,
  milestoneIndex: number,
  onProgress?: (pct: number) => void,
): Promise<WalrusStoreResult> {
  const buffer = await file.arrayBuffer();

  const response = await axios.put(
    `${PUBLISHER_URL}/v1/blobs?epochs=${DELIVERABLE_EPOCHS}`,
    buffer,
    {
      headers: { 'Content-Type': 'application/octet-stream' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    },
  );

  const blobId: string =
    response.data?.newlyCreated?.blobObject?.blobId ??
    response.data?.alreadyCertified?.blobId;

  if (!blobId) {
    throw new Error(`Walrus upload failed: ${JSON.stringify(response.data)}`);
  }

  return {
    blobId,
    objectId: response.data?.newlyCreated?.blobObject?.id?.id,
    viewUrl: `${AGGREGATOR_URL}/v1/blobs/${blobId}`,
  };
}

/**
 * Returns the public view URL for a Walrus blob.
 */
export function getWalrusBlobUrl(blobId: string): string {
  return `${AGGREGATOR_URL}/v1/blobs/${blobId}`;
}

/**
 * Fetches a Walrus blob and returns it as a Blob object (for previewing in browser).
 */
export async function fetchBlob(blobId: string): Promise<Blob> {
  const response = await axios.get(`${AGGREGATOR_URL}/v1/blobs/${blobId}`, {
    responseType: 'blob',
  });
  return response.data as Blob;
}
