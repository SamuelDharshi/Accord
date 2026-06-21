/**
 * Accord Frontend — zkLogin Integration
 *
 * Implements Google OAuth → non-custodial Sui wallet creation.
 * Users never see a wallet address, seed phrase, or private key.
 *
 * Flow:
 *   1. Generate ephemeral keypair + nonce.
 *   2. Redirect to Google OAuth.
 *   3. On callback, receive JWT.
 *   4. Fetch ZK proof from prover service.
 *   5. Derive Sui address from JWT sub + salt.
 *   6. Sign transactions with ephemeral keypair + ZK proof.
 *
 * References:
 *   https://docs.sui.io/concepts/cryptography/zklogin
 */

'use client';

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { generateNonce, generateRandomness, getZkLoginSignature, jwtToAddress } from '@mysten/zklogin';
import { suiClient } from './sui-client';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
// The redirect URI must be registered in Google Cloud Console.
const REDIRECT_URI =
  typeof window !== 'undefined'
    ? `${window.location.origin}/auth/callback`
    : 'http://localhost:3000/auth/callback';

// Mysten Labs' ZK prover service (testnet).
const ZK_PROVER_URL = 'https://prover-dev.mystenlabs.com/v1';

// ─── Storage Keys ─────────────────────────────────────────────────────────────
// Use sessionStorage (not localStorage) for security — expires with the tab.
const STORAGE_KEYS = {
  ephemeralKeypair: 'accord_eph_kp',
  randomness: 'accord_randomness',
  maxEpoch: 'accord_max_epoch',
  userSalt: 'accord_user_salt',
  zkLoginAddress: 'accord_zk_address',
  zkProof: 'accord_zk_proof',
  jwt: 'accord_jwt',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZkLoginSession {
  address: string;
  ephemeralKeypair: Ed25519Keypair;
  zkProof: unknown;
  jwt: string;
  maxEpoch: number;
  userSalt: string;
}

// ─── Step 1: Initiate Google OAuth ───────────────────────────────────────────

/**
 * Generates an ephemeral keypair and nonce, then redirects to Google OAuth.
 * The nonce binds the OAuth session to the Sui epoch and ephemeral key.
 */
export async function initiateGoogleLogin(): Promise<void> {
  const { epoch } = await suiClient.getLatestSuiSystemState();
  const maxEpoch = Number(epoch) + 10; // ~10 days

  const randomness = generateRandomness();
  const keypair = new Ed25519Keypair();

  const nonce = generateNonce(
    keypair.getPublicKey() as unknown as Parameters<typeof generateNonce>[0],
    maxEpoch,
    randomness,
  );

  // Persist to sessionStorage — survives the OAuth redirect.
  sessionStorage.setItem(STORAGE_KEYS.ephemeralKeypair, keypair.getSecretKey());
  sessionStorage.setItem(STORAGE_KEYS.randomness, randomness);
  sessionStorage.setItem(STORAGE_KEYS.maxEpoch, String(maxEpoch));

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ─── Step 2: Handle OAuth Callback ───────────────────────────────────────────

/**
 * Called on the /auth/callback page after Google redirects back.
 * Extracts the JWT, derives the Sui address, fetches the ZK proof, and
 * stores the complete session in sessionStorage.
 *
 * @param urlFragment - The hash fragment from the OAuth redirect URL.
 * @returns The derived Sui address (never shown to user).
 */
export async function handleOAuthCallback(urlFragment: string): Promise<string> {
  const params = new URLSearchParams(urlFragment.replace('#', ''));
  const jwt = params.get('id_token');
  if (!jwt) throw new Error('No id_token in OAuth callback');

  const randomness = sessionStorage.getItem(STORAGE_KEYS.randomness);
  const maxEpoch = parseInt(sessionStorage.getItem(STORAGE_KEYS.maxEpoch) ?? '0', 10);
  const secretKey = sessionStorage.getItem(STORAGE_KEYS.ephemeralKeypair);

  if (!randomness || !maxEpoch || !secretKey) {
    throw new Error('zkLogin session data missing — please retry login');
  }

  const keypair = Ed25519Keypair.fromSecretKey(secretKey);

  // User salt: deterministically derived from the Google sub claim.
  // In production: fetch from Mysten's salt service or a Accord-managed salt server.
  const userSalt = await fetchUserSalt(jwt);

  // Derive the Sui address from the JWT sub claim + salt.
  const address = jwtToAddress(jwt, userSalt);

  // Fetch the ZK proof from the prover service.
  const zkProof = await fetchZkProof({
    jwt,
    maxEpoch,
    randomness,
    userSalt,
    ephemeralPublicKey: keypair.getPublicKey(),
  });

  // Persist session.
  sessionStorage.setItem(STORAGE_KEYS.jwt, jwt);
  sessionStorage.setItem(STORAGE_KEYS.userSalt, userSalt);
  sessionStorage.setItem(STORAGE_KEYS.zkLoginAddress, address);
  sessionStorage.setItem(STORAGE_KEYS.zkProof, JSON.stringify(zkProof));

  return address;
}

// ─── Session Retrieval ────────────────────────────────────────────────────────

/**
 * Retrieves the current zkLogin session from sessionStorage.
 * Returns null if no active session exists.
 */
export function getZkLoginSession(): ZkLoginSession | null {
  if (typeof window === 'undefined') return null;
  const address = sessionStorage.getItem(STORAGE_KEYS.zkLoginAddress);
  const secretKey = sessionStorage.getItem(STORAGE_KEYS.ephemeralKeypair);
  const zkProofRaw = sessionStorage.getItem(STORAGE_KEYS.zkProof);
  const jwt = sessionStorage.getItem(STORAGE_KEYS.jwt);
  const maxEpoch = sessionStorage.getItem(STORAGE_KEYS.maxEpoch);
  const userSalt = sessionStorage.getItem(STORAGE_KEYS.userSalt);

  if (!address || !secretKey || !zkProofRaw || !jwt || !maxEpoch || !userSalt) return null;

  return {
    address,
    ephemeralKeypair: Ed25519Keypair.fromSecretKey(secretKey),
    zkProof: JSON.parse(zkProofRaw),
    jwt,
    maxEpoch: parseInt(maxEpoch, 10),
    userSalt,
  };
}

/**
 * Clears the current zkLogin session (logout).
 */
export function clearZkLoginSession(): void {
  Object.values(STORAGE_KEYS).forEach((key) => sessionStorage.removeItem(key));
}

// ─── ZK Signature Builder ─────────────────────────────────────────────────────

/**
 * Builds the zkLogin signature for a transaction.
 * Used by sponsored-tx.ts to sign transactions with the ephemeral key.
 */
export function buildZkLoginSignature(
  session: ZkLoginSession,
  ephemeralSignature: string,
): string {
  return getZkLoginSignature({
    inputs: session.zkProof as Parameters<typeof getZkLoginSignature>[0]['inputs'],
    maxEpoch: session.maxEpoch,
    userSignature: ephemeralSignature,
  });
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

async function fetchUserSalt(jwt: string): Promise<string> {
  // In production: POST to Mysten's salt service or Accord's own salt endpoint.
  // For hackathon: derive deterministically from JWT sub (not cryptographically ideal
  // but sufficient for demo — use proper salt service in production).
  try {
    const response = await fetch('https://salt.api.mystenlabs.com/get_salt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: jwt }),
    });
    const data = await response.json() as { salt: string };
    return data.salt;
  } catch {
    // Fallback: use a fixed salt for local dev (never in production).
    console.warn('Salt service unavailable — using dev fallback salt.');
    return '0';
  }
}

async function fetchZkProof(params: {
  jwt: string;
  maxEpoch: number;
  randomness: string;
  userSalt: string;
  ephemeralPublicKey: { toBase64: () => string };
}): Promise<unknown> {
  const response = await fetch(`${ZK_PROVER_URL}/zkp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jwt: params.jwt,
      extendedEphemeralPublicKey: params.ephemeralPublicKey.toBase64(),
      maxEpoch: params.maxEpoch,
      jwtRandomness: params.randomness,
      salt: params.userSalt,
      keyClaimName: 'sub',
    }),
  });

  if (!response.ok) {
    throw new Error(`ZK prover error: ${response.status} ${await response.text()}`);
  }

  return response.json();
}
