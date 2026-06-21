/**
 * Accord Agent — Atomic PTB Builder
 *
 * Constructs the single Programmable Transaction Block that atomically executes
 * all 5 milestone release operations on the Sui blockchain.
 *
 * Execution Order (all-or-nothing — any failure reverts the entire block):
 *   1. record_delivery      — Links Walrus blob ID to milestone, status → DELIVERED
 *   2. release_milestone_payment — Splits escrowed USDSUI, returns Coin object
 *   3. transferObjects      — Sends the Coin to the contractor's address
 *   4. mint_proof_certificate — Mints soulbound ProofCertificate to contractor
 *   5. record_completion    — Updates contractor's ReputationProfile
 *
 * The PTB is signed by the Arca agent wallet (which holds ArcaCap) and
 * can optionally use the Accord sponsor service for gas abstraction.
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { fromBase64 } from '@mysten/sui/utils';
import { logger } from '../utils/logger.js';

// ─── Config ───────────────────────────────────────────────────────────────────
const SUI_RPC_URL = process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443';

function getAccordPackageId(): string {
  const packageId = process.env.ACCORD_PACKAGE_ID ?? '';
  if (!packageId || packageId === '0x') {
    throw new Error('ACCORD_PACKAGE_ID not configured');
  }
  return packageId;
}

function getArcaCapId(): string {
  const capId = process.env.ARCA_CAP_OBJECT_ID ?? '';
  if (!capId || capId === '0x') {
    throw new Error('ARCA_CAP_OBJECT_ID not configured');
  }
  return capId;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MilestoneReleasePTBParams {
  covenantId: string;
  milestoneIndex: number;
  walrusBlobId: string;           // deliverable blob ID
  certificateBlobId: string;      // proof PDF blob ID
  contractorAddress: string;
  clientAddress: string;
  amountUsdsui: bigint;
  contractorReputationProfileId: string; // object ID of contractor's ReputationProfile
  qualityScoreBps: number;        // AI-assessed quality score in BPS (0–10000)
  isConfidential?: boolean;
}

export interface PTBResult {
  digest: string;
  effects: unknown;
}

// ─── Keypair Setup ────────────────────────────────────────────────────────────

/**
 * Loads the Arca agent keypair from the ARCA_PRIVATE_KEY environment variable.
 * In production this should use an HSM or KMS integration.
 */
export function loadArcaKeypair(): Ed25519Keypair {
  const privKey = process.env.ARCA_PRIVATE_KEY;
  if (!privKey) throw new Error('ARCA_PRIVATE_KEY is not set');

  if (privKey.startsWith('suiprivkey')) {
    const decoded = decodeSuiPrivateKey(privKey);
    return Ed25519Keypair.fromSecretKey(decoded.secretKey);
  }

  return Ed25519Keypair.fromSecretKey(fromBase64(privKey));
}

// ─── PTB Builder ─────────────────────────────────────────────────────────────

/**
 * Builds and returns the 5-step atomic milestone release Transaction.
 * This Transaction object can then be signed and submitted by the caller.
 */
export function buildMilestoneReleasePTB(params: MilestoneReleasePTBParams): Transaction {
  const accordPackageId = getAccordPackageId();
  const arcaCapId = getArcaCapId();

  const tx = new Transaction();

  // ── Step 1: Record delivery ──────────────────────────────────────────────
  // Links the Walrus blob ID to the milestone on-chain.
  // Changes milestone status: PENDING (0) → DELIVERED (1).
  tx.moveCall({
    target: `${accordPackageId}::covenant::record_delivery`,
    arguments: [
      tx.object(arcaCapId),
      tx.object(params.covenantId),
      tx.pure.u64(params.milestoneIndex),
      tx.pure.vector('u8', Array.from(Buffer.from(params.walrusBlobId, 'utf-8'))),
    ],
  });

  // ── Step 2: Release milestone payment ────────────────────────────────────
  // Splits the proportional USDSUI balance from escrow.
  // Returns two Coin<USDSUI> objects: [contractor_coin, fee_coin]
  const [paymentCoin, feeCoin] = tx.moveCall({
    target: `${accordPackageId}::covenant::release_milestone_payment`,
    arguments: [
      tx.object(arcaCapId),
      tx.object(params.covenantId),
      tx.pure.u64(params.milestoneIndex),
    ],
  });

  // ── Step 3: Transfer payment to contractor & fee to treasury ──────────────
  // Sends the contractor's net payout directly to their address.
  tx.transferObjects([paymentCoin], params.contractorAddress);

  // Retrieve the protocol treasury address from the covenant on-chain
  const [treasuryAddress] = tx.moveCall({
    target: `${accordPackageId}::covenant::covenant_protocol_treasury`,
    arguments: [tx.object(params.covenantId)],
  });

  // Send the 0.5% protocol fee to the treasury address
  tx.transferObjects([feeCoin], treasuryAddress);

  // If the covenant is confidential, we zero out the on-chain amounts recorded
  // in the Soulbound Certificate and the Reputation Profile to prevent public leakage.
  const amountToRecord = params.isConfidential ? 0n : params.amountUsdsui;

  // ── Step 4: Mint Proof Certificate ───────────────────────────────────────
  // Mints a non-transferable ProofCertificate to the contractor.
  // Embeds both the deliverable blob ID and the PDF certificate blob ID.
  tx.moveCall({
    target: `${accordPackageId}::proof::mint_proof_certificate`,
    arguments: [
      tx.object(arcaCapId),
      tx.pure.id(params.covenantId),
      tx.pure.u64(params.milestoneIndex),
      tx.pure.address(params.clientAddress),
      tx.pure.address(params.contractorAddress),
      tx.pure.u64(amountToRecord),
      tx.pure.vector('u8', Array.from(Buffer.from(params.walrusBlobId, 'utf-8'))),
      tx.pure.vector('u8', Array.from(Buffer.from(params.certificateBlobId, 'utf-8'))),
    ],
  });

  // ── Step 5: Record completion on reputation profile ──────────────────────
  // Updates the contractor's ReputationProfile with AI quality score.
  // If the contractor doesn't have a profile yet, Arca creates one atomically.
  let profileObject: unknown;

  if (params.contractorReputationProfileId === '0x0') {
    const [newProfile] = tx.moveCall({
      target: `${accordPackageId}::reputation::create_profile`,
      arguments: [
        tx.object(arcaCapId),
        tx.pure.address(params.contractorAddress),
      ],
    });
    profileObject = newProfile;
  } else {
    profileObject = tx.object(params.contractorReputationProfileId);
  }

  tx.moveCall({
    target: `${accordPackageId}::reputation::record_completion`,
    arguments: [
      tx.object(arcaCapId),
      profileObject as ReturnType<typeof tx.object>,
      tx.pure.u64(amountToRecord),
      tx.pure.u64(params.qualityScoreBps),
    ],
  });

  if (params.contractorReputationProfileId === '0x0') {
    tx.moveCall({
      target: `${accordPackageId}::reputation::transfer_profile`,
      arguments: [
        tx.object(arcaCapId),
        profileObject as ReturnType<typeof tx.object>,
      ],
    });
  }

  logger.info(
    `PTB built: covenant=${params.covenantId} milestone=${params.milestoneIndex} contractor=${params.contractorAddress}`,
  );

  return tx;
}

// ─── Executor ────────────────────────────────────────────────────────────────

/**
 * Signs and executes the milestone release PTB using the Arca agent keypair.
 *
 * All operations execute atomically:
 *   - If any step fails → the entire block reverts → no partial state changes.
 *   - On success → all 5 operations are committed in a single transaction.
 *
 * Error handling: throws on failure with the full Sui error message for logging.
 */
export async function executeMilestoneRelease(
  params: MilestoneReleasePTBParams,
): Promise<PTBResult> {
  const suiClient = new SuiClient({ url: SUI_RPC_URL });
  const keypair = loadArcaKeypair();

  logger.info(
    `Executing milestone release PTB: covenant=${params.covenantId} milestone=${params.milestoneIndex}`,
  );

  const tx = buildMilestoneReleasePTB(params);

  try {
    const result = await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });

    // Check that the transaction was successful.
    if (result.effects?.status?.status !== 'success') {
      const errMsg = result.effects?.status?.error ?? 'Unknown transaction error';
      throw new Error(`PTB execution failed: ${errMsg}`);
    }

    logger.info(
      `PTB successful: digest=${result.digest} covenant=${params.covenantId} milestone=${params.milestoneIndex}`,
    );

    return { digest: result.digest, effects: result.effects };
  } catch (err) {
    logger.error(
      `PTB failed for covenant=${params.covenantId} milestone=${params.milestoneIndex}: ${(err as Error).message}`,
    );
    // Re-throw so the caller can handle (e.g., move to REVIEW state, notify parties).
    throw err;
  }
}
