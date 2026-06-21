/**
 * Accord Agent — Entry Point
 *
 * Starts the Arca agent service:
 *   1. Express HTTP API server (for frontend → agent communication).
 *   2. Sui event subscription (for autonomous milestone delivery detection).
 *
 * API Endpoints:
 *   POST /verify          — Trigger verification for a specific milestone delivery.
 *   GET  /covenant/:id    — Get current covenant status from the agent's perspective.
 *   GET  /health          — Health check.
 */

import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import { Transaction } from '@mysten/sui/transactions';
import { z } from 'zod';
import { logger } from './utils/logger.js';
import { runVerification, recordVerificationOutcome } from './verifier/engine.js';
import { executeMilestoneRelease, loadArcaKeypair } from './executor/ptb-builder.js';
import { generateProofCertificate } from './certificate/generator.js';
import { archiveProofCertificate } from './certificate/walrus-store.js';
import type { VerificationRequest } from './verifier/engine.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const ACCORD_PACKAGE = process.env.ACCORD_PACKAGE_ID ?? '';
const SUI_RPC_URL = process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443';

// ─── Rate Limiting (simple in-memory counter) ─────────────────────────────────
const PTB_RATE_LIMIT = parseInt(process.env.PTB_RATE_LIMIT ?? '100', 10);
let ptbCountThisMinute = 0;
setInterval(() => { ptbCountThisMinute = 0; }, 60_000);

// ─── Request Schemas ──────────────────────────────────────────────────────────

const VerifyRequestSchema = z.object({
  covenantId: z.string().min(1),
  milestoneIndex: z.number().int().min(0),
  milestoneDescription: z.string().min(1),
  clientAddress: z.string().min(1),
  contractorAddress: z.string().min(1),
  deliverableBlobId: z.string().min(1),
  covenantTitle: z.string().min(1),
  amountUsdsui: z.number().int().min(0),
  isConfidential: z.boolean().optional(),
});

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'Arca', version: '1.0.0', timestamp: Date.now() });
});

// ── Covenant status query ──────────────────────────────────────────────────────
app.get('/covenant/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Covenant id is required' });
      return;
    }
    const suiClient = new SuiClient({ url: SUI_RPC_URL });

    const resp = await suiClient.getObject({
      id,
      options: { showContent: true, showType: true },
    });

    if (!resp.data) {
      res.status(404).json({ error: 'Covenant not found' });
      return;
    }

    // Return the raw object content for frontend parsing
    res.json({ data: resp.data, status: 'found' });
  } catch (err) {
    next(err);
  }
});

// ── Sponsor transaction ─────────────────────────────────────────────────────
app.post('/sponsor', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { txBytes, sender } = req.body as { txBytes: string; sender: string };

    // In production: the Arca service holds SUI for gas sponsorship
    // For now: return the tx bytes unchanged with a placeholder signature
    // The actual sponsor would sign the gas portion of the transaction
    const keypair = loadArcaKeypair();

    // Sign the transaction bytes with Arca's keypair to provide sponsor signature
    const txBytesBuffer = Buffer.from(txBytes, 'base64');
    const signedTransaction = await keypair.signTransaction(txBytesBuffer);
    const sponsorSig = signedTransaction.signature;

    res.json({
      sponsoredTxBytes: txBytes, // tx bytes unchanged for two-signature sponsored tx
      sponsorSignature: sponsorSig,
    });
  } catch (err) {
    next(err);
  }
});

// ── Parse natural language covenant description ─────────────────────────────
app.post('/parse-covenant', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { description } = req.body as { description: string };
    if (!description) {
      res.status(400).json({ error: 'Description required' });
      return;
    }

    // Simple regex-based parsing for MVP
    // Extract dollar amounts: $500, $1,000, 500 USD, 10$, etc.
    const amountMatch = description.match(/(?:\$\s*|USD\s*)?(\d[\d,]*(?:\.\d+)?)(?:\s*\$|\s*USD)?/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;

    // Extract milestone percentages: "30% on draft", "30/40/30 split"
    const percentMatches = description.matchAll(/(\d+)\s*%(?:\s+on|\s+milestone|\s+for)/gi);
    const percentages: number[] = [];
    for (const m of percentMatches) {
      percentages.push(parseInt(m[1], 10) * 100); // Convert to basis points
    }

    // Extract milestone descriptions using common patterns
    const milestoneDescriptions: string[] = [];
    const milestonePatterns = [
      /milestone\s*\d+[:\s]+([^$]+?)(?=\d+\s*%|$)/gi,
      /when\s+([^$,]+?)(?:\.|,|$)/gi,
    ];
    for (const pattern of milestonePatterns) {
      const matches = description.matchAll(pattern);
      for (const m of matches) {
        const desc = m[1].trim();
        if (desc && desc.length > 3 && desc.length < 200) {
          milestoneDescriptions.push(desc);
        }
      }
    }

    // Fallback: create a single milestone if none detected
    if (milestoneDescriptions.length === 0) {
      milestoneDescriptions.push('Deliverable');
    }

    // If no percentages, distribute evenly
    let milestonePercentages: number[];
    if (percentages.length === 0) {
      const equalBps = Math.floor(10000 / milestoneDescriptions.length);
      milestonePercentages = milestoneDescriptions.map((_, i) =>
        i === milestoneDescriptions.length - 1 ? 10000 - (i * equalBps) : equalBps
      );
    } else {
      milestonePercentages = percentages;
      // Pad to match milestones if needed
      while (milestonePercentages.length < milestoneDescriptions.length) {
        milestonePercentages.push(1000); // Default 10%
      }
    }

    // Limit to 5 milestones max
    const maxMilestones = 5;
    const titleMatch = description.match(/^(.+?)(?:\n|$)/);
    const title = titleMatch ? titleMatch[1].slice(0, 100) : 'New Covenant';

    res.json({
      title,
      totalAmountUsd: amount,
      milestones: milestoneDescriptions.slice(0, maxMilestones).map((desc, i) => ({
        description: desc,
        percentageBps: milestonePercentages[i] ?? Math.floor(10000 / milestoneDescriptions.length),
      })),
      isConfidential: description.toLowerCase().includes('confidential'),
    });
  } catch (err) {
    next(err);
  }
});

// ── Trigger verification ──────────────────────────────────────────────────────
app.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = VerifyRequestSchema.parse(req.body);

    logger.info(`/verify called: covenant=${body.covenantId} milestone=${body.milestoneIndex}`);

    // Run Arca's AI verification pipeline.
    const { decision, shouldAutoRelease } = await runVerification(body as VerificationRequest);

    if (!shouldAutoRelease) {
      // FAIL or REVIEW — record outcome and return without releasing funds.
      await recordVerificationOutcome(body as VerificationRequest, decision);
      res.json({ decision, released: false });
      return;
    }

    // PASS with confidence >= threshold — execute the atomic PTB.
    if (ptbCountThisMinute >= PTB_RATE_LIMIT) {
      logger.warn(`PTB rate limit reached (${PTB_RATE_LIMIT}/min). Queuing for next window.`);
      res.json({ decision, released: false, error: 'rate_limited' });
      return;
    }

    ptbCountThisMinute++;

    // Generate and archive the PDF proof certificate BEFORE building the PTB
    // so the cert blob ID is available as a PTB argument.
    const certBuffer = await generateProofCertificate(
      {
        covenantId: body.covenantId,
        milestoneIndex: body.milestoneIndex,
        clientAddress: body.clientAddress,
        contractorAddress: body.contractorAddress,
        amountUsdsui: body.amountUsdsui,
        deliverableBlobId: body.deliverableBlobId,
        issuedAt: Date.now(),
      },
      body.covenantTitle,
      body.milestoneDescription,
      '', // txDigest not yet known — will be updated after PTB
    );

    const { blobId: certificateBlobId } = await archiveProofCertificate(certBuffer, {
      covenantId: body.covenantId,
      milestoneIndex: body.milestoneIndex,
      clientAddress: body.clientAddress,
      contractorAddress: body.contractorAddress,
      amountUsdsui: body.amountUsdsui,
      deliverableBlobId: body.deliverableBlobId,
      issuedAt: Date.now(),
    });

    // Query for the contractor's existing ReputationProfile.
    const suiClient = new SuiClient({ url: SUI_RPC_URL });
    const profileObjects = await suiClient.getOwnedObjects({
      owner: body.contractorAddress,
      filter: { StructType: `${ACCORD_PACKAGE}::reputation::ReputationProfile` },
    });
    
    const contractorReputationProfileId = profileObjects.data.length > 0 
      ? profileObjects.data[0].data?.objectId || '0x0'
      : '0x0';

    // Build and execute the atomic PTB.
    const ptbResult = await executeMilestoneRelease({
      covenantId: body.covenantId,
      milestoneIndex: body.milestoneIndex,
      walrusBlobId: body.deliverableBlobId,
      certificateBlobId,
      contractorAddress: body.contractorAddress,
      clientAddress: body.clientAddress,
      amountUsdsui: BigInt(body.amountUsdsui),
      contractorReputationProfileId,
      qualityScoreBps: Math.round(decision.confidence * 100), // confidence → BPS
      isConfidential: body.isConfidential,
    });

    // Record the positive outcome in Walrus Memory.
    await recordVerificationOutcome(body as VerificationRequest, decision);

    res.json({
      decision,
      released: true,
      transactionDigest: ptbResult.digest,
      certificateBlobId,
    });
  } catch (err) {
    next(err);
  }
});

// ── Faucet route ──────────────────────────────────────────────────────────────
const FaucetRequestSchema = z.object({
  recipient: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid Sui address'),
  amount: z.number().int().optional(),
});

app.post('/faucet', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { recipient, amount } = FaucetRequestSchema.parse(req.body);
    const usdAmount = amount ?? 10000; // default 10,000 USDsui
    const baseUnits = BigInt(usdAmount * 1_000_000);

    logger.info(`/faucet called: recipient=${recipient} amount=${usdAmount} USD`);

    const client = new SuiClient({ url: SUI_RPC_URL });
    const keypair = loadArcaKeypair();
    const activeAddress = keypair.getPublicKey().toSuiAddress();

    // Query TreasuryCap
    const caps = await client.getOwnedObjects({
      owner: activeAddress,
      filter: { StructType: `0x2::coin::TreasuryCap<${ACCORD_PACKAGE}::usdsui::USDSUI>` },
    });

    if (caps.data.length === 0) {
      throw new Error(`TreasuryCap for USDSUI not found for Arca address ${activeAddress}`);
    }

    const treasuryCapId = caps.data[0].data?.objectId;
    if (!treasuryCapId) {
      throw new Error('TreasuryCap Object ID is unresolved.');
    }

    const tx = new Transaction();
    tx.moveCall({
      target: '0x2::coin::mint_and_transfer',
      typeArguments: [`${ACCORD_PACKAGE}::usdsui::USDSUI`],
      arguments: [
        tx.object(treasuryCapId),
        tx.pure.u64(baseUnits),
        tx.pure.address(recipient),
      ],
    });

    tx.setSender(activeAddress);
    
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      options: {
        showEffects: true,
      },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error(result.effects?.status?.error ?? 'Mint transaction failed on-chain');
    }

    res.json({
      status: 'success',
      digest: result.digest,
      amount: usdAmount,
      recipient,
    });
  } catch (err) {
    next(err);
  }
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Unhandled error: ${message}`);
  res.status(500).json({ error: message });
});

// ─── Sui Event Listener ───────────────────────────────────────────────────────

/**
 * Subscribes to Accord covenant delivery events on Sui.
 * When a `DeliveryRecorded` event fires, Arca automatically verifies the delivery.
 *
 * NOTE: In the current implementation, delivery is triggered via the /verify HTTP
 * endpoint called by the frontend after the contractor uploads to Walrus.
 * Autonomous event-driven triggering is stubbed here for future enhancement.
 */
async function startEventListener(): Promise<void> {
  if (!ACCORD_PACKAGE) {
    logger.warn('ACCORD_PACKAGE_ID not set — event listener skipped.');
    return;
  }

  const suiClient = new SuiClient({ url: SUI_RPC_URL });

  logger.info(`Starting Sui event listener for package: ${ACCORD_PACKAGE}`);

  // Subscribe to all events from the Accord package.
  // The `DeliveryRecorded` event type would be emitted by the Move contract
  // after we add `event::emit` calls (planned for v1.1).
  try {
    await suiClient.subscribeEvent({
      filter: { MoveModule: { package: ACCORD_PACKAGE, module: 'covenant' } },
      onMessage: (event) => {
        logger.info(`Sui event received: ${JSON.stringify(event.type)}`);
        // TODO: parse event fields and call runVerification + executeMilestoneRelease
        // for fully autonomous operation without frontend trigger.
      },
    });
    logger.info('Sui event subscription active.');
  } catch (err) {
    logger.warn(`Event subscription failed (non-fatal): ${(err as Error).message}`);
    logger.warn('Falling back to HTTP-trigger mode only.');
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`Arca agent service started on port ${PORT}`);
  logger.info(`Groq model: ${process.env.GROQ_MODEL ?? 'llama-3.1-70b-versatile'}`);
  logger.info(`Auto-release threshold: ${process.env.AUTO_RELEASE_CONFIDENCE_THRESHOLD ?? 80}%`);
});

startEventListener().catch((err) =>
  logger.error(`Event listener startup error: ${err.message}`),
);
