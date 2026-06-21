/**
 * Accord Agent — Arca Verification Engine
 *
 * Runs the AI reasoning pipeline for milestone delivery verification.
 * Uses Claude (claude-sonnet-4-5) to produce a structured decision.
 *
 * Pipeline:
 *   1. Retrieve covenant brief from Walrus Memory.
 *   2. Fetch and analyze blob content (text/image metadata).
 *   3. Retrieve relationship context for the client-contractor pair.
 *   4. Call Claude with system + user prompts.
 *   5. Parse and validate the JSON decision.
 *   6. Return decision — caller decides whether to trigger PTB.
 */

import Groq from 'groq-sdk';
import {
  buildSystemPrompt,
  buildVerificationPrompt,
  buildSummarizationPrompt,
  type VerificationDecision,
  type RelationshipContext,
  type InteractionRecord,
} from '../prompts/verification.js';
import {
  getRelationshipContext,
  updateRelationshipContext,
  getCovenantBrief,
  retrieveBlob,
} from '../memory/walrus-memory.js';
import { logger } from '../utils/logger.js';
import { z } from 'zod';

const AUTO_RELEASE_THRESHOLD = parseInt(
  process.env.AUTO_RELEASE_CONFIDENCE_THRESHOLD ?? '80',
  10,
);

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const LEGACY_DEPRECATED_MODELS = new Set(['llama-3.1-70b-versatile']);

function resolveGroqModel(): string {
  const configured = process.env.GROQ_MODEL ?? '';
  if (!configured || LEGACY_DEPRECATED_MODELS.has(configured)) {
    return DEFAULT_MODEL;
  }
  return configured;
}

const MODEL = resolveGroqModel();

// ─── Decision Schema ──────────────────────────────────────────────────────────

const DecisionSchema = z.object({
  decision: z.enum(['PASS', 'FAIL', 'REVIEW']),
  confidence: z.number().int().min(0).max(100),
  reason: z.string().min(1),
  specific_feedback: z.string().min(1),
  flag_for_human: z.boolean(),
});

// ─── Main Verification Function ───────────────────────────────────────────────

export interface VerificationRequest {
  covenantId: string;
  milestoneIndex: number;
  milestoneDescription: string;
  clientAddress: string;
  contractorAddress: string;
  deliverableBlobId: string;
  covenantTitle: string;
  amountUsdsui: number;
}

export interface VerificationResult {
  decision: VerificationDecision;
  shouldAutoRelease: boolean;
  relationshipContext: RelationshipContext | null;
}

/**
 * Runs the full Arca verification pipeline for a delivered milestone.
 *
 * Returns a `VerificationResult` with the Claude decision and whether
 * the payment should be auto-released via PTB.
 */
export async function runVerification(
  req: VerificationRequest,
): Promise<VerificationResult> {
  logger.info(
    `Arca verification started: covenant=${req.covenantId} milestone=${req.milestoneIndex} blob=${req.deliverableBlobId}`,
  );

  // Step 1: Retrieve covenant brief from Walrus Memory.
  const covenantBrief = await getCovenantBrief(req.covenantId, req.milestoneIndex)
    ?? `Covenant: ${req.covenantTitle}\nMilestone ${req.milestoneIndex + 1}: ${req.milestoneDescription}`;

  // Step 2: Fetch and analyze the deliverable blob content.
  const deliveredContent = await analyzeDeliverable(req.deliverableBlobId);

  // Step 3: Retrieve historical relationship context.
  const relationshipContext = await getRelationshipContext(
    req.clientAddress,
    req.contractorAddress,
  );

  // Step 4: Build prompts and call Claude.
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildVerificationPrompt(
    covenantBrief,
    req.milestoneDescription,
    deliveredContent,
    relationshipContext,
  );

  logger.info(`Calling Groq (${MODEL}) for verification...`);
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
  });

  // Step 5: Parse and validate the JSON decision.
  const rawText = response.choices[0]?.message?.content ?? '';

  const decision = parseDecision(rawText);

  logger.info(
    `Arca decision: ${decision.decision} (confidence=${decision.confidence}) — "${decision.reason}"`,
  );

  // Step 6: Determine auto-release eligibility.
  const shouldAutoRelease =
    decision.decision === 'PASS' && decision.confidence >= AUTO_RELEASE_THRESHOLD;

  return { decision, shouldAutoRelease, relationshipContext };
}

/**
 * Records the outcome of a verification into Walrus Memory after execution.
 * Called after PTB completes (on PASS) or after FAIL/REVIEW notification.
 */
export async function recordVerificationOutcome(
  req: VerificationRequest,
  decision: VerificationDecision,
): Promise<void> {
  const interaction: InteractionRecord = {
    covenantId: req.covenantId,
    milestoneIndex: req.milestoneIndex,
    outcome: decision.decision,
    deliveryLatencyHours: 0, // TODO: track delivery time from covenant creation
    qualityNotes: decision.specificFeedback,
    amountUsdsui: decision.decision === 'PASS' ? req.amountUsdsui : 0,
    timestamp: Date.now(),
  };

  await updateRelationshipContext(
    req.clientAddress,
    req.contractorAddress,
    interaction,
    summarizeInteractions,
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetches a Walrus blob and attempts to extract text content for Claude analysis.
 * For binary content (images, etc.), returns a descriptive placeholder.
 * In a full implementation, this would use Claude Vision for image analysis.
 */
async function analyzeDeliverable(blobId: string): Promise<string | string[]> {
  try {
    const data = await retrieveBlob(blobId);
    const text = data.toString('utf-8');

    // Detect if it's valid UTF-8 text.
    if (isLikelyText(text)) {
      // Truncate to avoid hitting Claude's context window.
      return text.slice(0, 4000);
    }

    // Binary file: describe what we can infer.
    return `[Binary blob] Size: ${data.length} bytes | Blob ID: ${blobId}
Analysis: Content is binary (image, PDF, or archive). Visual/structural analysis required.
Inferred from size and encoding: likely a design file or document artifact.`;
  } catch (err) {
    logger.warn(`Could not fetch deliverable blob ${blobId}: ${(err as Error).message}`);
    return `[Blob fetch failed] Blob ID: ${blobId} — Arca could not retrieve content for analysis.`;
  }
}

function isLikelyText(str: string): boolean {
  // Heuristic: if > 80% of chars are printable ASCII or common Unicode, treat as text.
  const sample = str.slice(0, 1000);
  const printable = sample.split('').filter((c) => {
    const code = c.charCodeAt(0);
    return (code >= 32 && code <= 126) || code > 127;
  }).length;
  return printable / sample.length > 0.8;
}

function parseDecision(rawText: string): VerificationDecision {
  // Extract JSON from the response (Model may include surrounding text despite instructions).
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Groq returned non-JSON response: ${rawText.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Normalize confidence to a number if it is a string
  if (typeof parsed.confidence === 'string') {
    parsed.confidence = parseInt(parsed.confidence, 10);
  }

  // Handle camelCase / snake_case fallback for Zod schema validation
  const specificFeedback = parsed.specific_feedback ?? parsed.specificFeedback;
  const flagForHumanRaw = parsed.flag_for_human ?? parsed.flagForHuman;
  const flagForHuman = typeof flagForHumanRaw === 'string'
    ? flagForHumanRaw.toLowerCase() === 'true'
    : Boolean(flagForHumanRaw);

  const validated = DecisionSchema.parse({
    decision: parsed.decision,
    confidence: parsed.confidence,
    reason: parsed.reason,
    specific_feedback: specificFeedback,
    flag_for_human: flagForHuman,
  });

  return {
    decision: validated.decision,
    confidence: validated.confidence,
    reason: validated.reason,
    specificFeedback: validated.specific_feedback,
    flagForHuman: validated.flag_for_human,
  };
}

/**
 * Calls Claude to summarize a long list of interactions into patterns.
 * Used by `updateRelationshipContext` when history exceeds 10 records.
 */
async function summarizeInteractions(
  interactions: InteractionRecord[],
): Promise<{ contractorPatterns: string; clientPreferences: string }> {
  const prompt = buildSummarizationPrompt(interactions);
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = response.choices[0]?.message?.content ?? '{}';
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { contractorPatterns: '', clientPreferences: '' };

  const parsed = JSON.parse(jsonMatch[0]) as {
    contractorPatterns: string;
    clientPreferences: string;
  };
  return {
    contractorPatterns: parsed.contractorPatterns ?? '',
    clientPreferences: parsed.clientPreferences ?? '',
  };
}
