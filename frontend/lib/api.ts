/**
 * Accord Frontend — Agent API Client
 * Typed wrapper for all calls to the Arca agent service.
 */

import axios from 'axios';
import { AGENT_API_URL } from './sui-client';

const api = axios.create({ baseURL: AGENT_API_URL });

export interface VerifyPayload {
  covenantId: string;
  milestoneIndex: number;
  milestoneDescription: string;
  clientAddress: string;
  contractorAddress: string;
  deliverableBlobId: string;
  covenantTitle: string;
  amountUsdsui: number;
  contractorReputationProfileId: string;
}

export interface VerifyResponse {
  decision: {
    decision: 'PASS' | 'FAIL' | 'REVIEW';
    confidence: number;
    reason: string;
    specificFeedback: string;
    flagForHuman: boolean;
  };
  released: boolean;
  transactionDigest?: string;
  certificateBlobId?: string;
  error?: string;
}

export async function triggerVerification(payload: VerifyPayload): Promise<VerifyResponse> {
  const { data } = await api.post<VerifyResponse>('/verify', payload);
  return data;
}

export async function getAgentHealth(): Promise<{ status: string; agent: string }> {
  const { data } = await api.get('/health');
  return data as { status: string; agent: string };
}

// ── Covenant creation via on-chain PTB (built client-side) ───────────────────

export interface ParseCovenantResponse {
  title: string;
  totalAmountUsd: number;
  milestones: { description: string; percentageBps: number }[];
  isConfidential: boolean;
}

/**
 * Parses a natural-language covenant description into structured terms via the Arca API.
 */
export async function parseCovenantDescription(
  description: string,
): Promise<ParseCovenantResponse> {
  const { data } = await api.post<ParseCovenantResponse>('/parse-covenant', { description });
  return data;
}
