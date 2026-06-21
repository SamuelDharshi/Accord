/**
 * Accord Frontend — Sponsored Transaction Integration
 *
 * All user transactions are gas-sponsored by the Accord protocol.
 * Users never know gas exists. All amounts shown in USD only.
 *
 * Implementation:
 *   - Transaction is built client-side and sent to Accord's sponsor endpoint.
 *   - Sponsor signs the gas payment, user signs the transaction.
 *   - For hackathon: the agent service acts as the sponsor (holds SUI for gas).
 *
 * References:
 *   https://docs.sui.io/concepts/transactions/sponsored-transactions
 */

'use client';

import type { Transaction } from '@mysten/sui/transactions';
import { suiClient } from './sui-client';
import type { ZkLoginSession } from './zklogin';
import { buildZkLoginSignature } from './zklogin';
import { AGENT_API_URL } from './sui-client';

export interface SponsoredTxResult {
  digest: string;
  effects: unknown;
}

/**
 * Executes a Sui transaction with gas fully sponsored by the Accord protocol.
 *
 * Steps:
 *   1. Serialize the transaction intent.
 *   2. Send to the Accord sponsor endpoint for gas payment signing.
 *   3. User signs with their zkLogin ephemeral keypair.
 *   4. Submit the fully-signed sponsored transaction.
 *
 * The user never pays gas. All USDSUI amounts are shown as USD.
 *
 * @param tx      - The unsigned Transaction to execute.
 * @param session - The user's active zkLogin session.
 */
export async function executeSponsored(
  tx: Transaction,
  session: ZkLoginSession,
): Promise<SponsoredTxResult> {
  // Step 1: Build the transaction bytes.
  tx.setSender(session.address);
  const txBytes = await tx.build({ client: suiClient });
  const txBytesBase64 = Buffer.from(txBytes).toString('base64');

  // Step 2: Request gas sponsorship from the Accord backend.
  // The sponsor adds its own gas coin and returns a signed sponsor sig.
  const sponsorResponse = await fetch(`${AGENT_API_URL}/sponsor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      txBytes: txBytesBase64,
      sender: session.address,
    }),
  });

  if (!sponsorResponse.ok) {
    const errorText = await sponsorResponse.text();
    throw new Error(`Sponsor service error: ${errorText}`);
  }

  const { sponsoredTxBytes, sponsorSignature } =
    (await sponsorResponse.json()) as {
      sponsoredTxBytes: string;
      sponsorSignature: string;
    };

  // Step 3: Decode the sponsored transaction bytes and sign with ephemeral key.
  const sponsoredBytes = Buffer.from(sponsoredTxBytes, 'base64');
  const { signature: ephemeralSig } = await session.ephemeralKeypair.signTransaction(
    sponsoredBytes,
  );

  // Build the zkLogin signature wrapping the ephemeral signature.
  const zkLoginSig = buildZkLoginSignature(session, ephemeralSig);

  // Step 4: Execute with all three signatures (user zkLogin + ephemeral + sponsor).
  // Pass raw bytes as the transaction block — executeTransactionBlock accepts base64 or bytes.
  const txBytesToExecute = Buffer.from(sponsoredTxBytes, 'base64');
  const result = await suiClient.executeTransactionBlock({
    transactionBlock: txBytesToExecute,
    signature: [zkLoginSig, sponsorSignature],
    options: {
      showEffects: true,
      showEvents: true,
      showObjectChanges: true,
    },
  });

  if (result.effects?.status?.status !== 'success') {
    const errMsg = result.effects?.status?.error ?? 'Transaction failed';
    throw new Error(errMsg);
  }

  return { digest: result.digest, effects: result.effects };
}

/**
 * Simple direct execute for Arca agent calls (non-sponsored, agent pays gas).
 * Used for reads and queries, not end-user transactions.
 */
export async function executeWithZkLogin(
  tx: Transaction,
  session: ZkLoginSession,
): Promise<SponsoredTxResult> {
  tx.setSender(session.address);
  const txBytes = await tx.build({ client: suiClient });

  const { signature: ephemeralSig } =
    await session.ephemeralKeypair.signTransaction(txBytes);
  const zkLoginSig = buildZkLoginSignature(session, ephemeralSig);

  const result = await suiClient.executeTransactionBlock({
    transactionBlock: Buffer.from(txBytes).toString('base64'),
    signature: [zkLoginSig],
    options: { showEffects: true, showEvents: true },
  });

  if (result.effects?.status?.status !== 'success') {
    throw new Error(result.effects?.status?.error ?? 'Transaction failed');
  }

  return { digest: result.digest, effects: result.effects };
}
