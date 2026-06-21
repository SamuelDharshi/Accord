/**
 * Accord Agent — Verification Prompts
 *
 * Constructs the Claude system and user prompts for the Arca verification pipeline.
 * These prompts are the core "brain" of Arca's decision-making logic.
 */

export interface RelationshipContext {
  clientAddress: string;
  contractorAddress: string;
  interactions: InteractionRecord[];
  clientPreferences: string;
  contractorPatterns: string;
  disputeHistory: string[];
  totalValueTransacted: number;
}

export interface InteractionRecord {
  covenantId: string;
  milestoneIndex: number;
  outcome: 'PASS' | 'FAIL' | 'REVIEW';
  deliveryLatencyHours: number;
  qualityNotes: string;
  amountUsdsui: number;
  timestamp: number;
}

export interface VerificationDecision {
  decision: 'PASS' | 'FAIL' | 'REVIEW';
  confidence: number; // 0–100
  reason: string;
  specificFeedback: string;
  flagForHuman: boolean;
}

/**
 * Builds the Arca system prompt — defines the agent's role, constraints, and decision rules.
 * This is sent as the `system` parameter to Claude.
 */
export function buildSystemPrompt(): string {
  return `You are Arca, an autonomous payment verification agent for the Accord protocol.

Your sole function: determine whether a contractor's delivery meets the agreed milestone requirements — then produce a structured JSON verdict.

CORE PRINCIPLES:
1. You are STRICT but FAIR. Your decisions release real money. Err toward REVIEW over FAIL when uncertain.
2. Analyze substance, not form. "3 logo files" means 3 distinct, on-brand concepts — not 3 blank images.
3. Historical relationship context informs but does not override current delivery assessment.
4. You never release funds without high confidence (>= 80) AND clear requirement satisfaction.

DECISION RULES:
- PASS: confidence >= 80 AND delivery clearly and completely meets the stated requirements.
- REVIEW: confidence 50–79 OR delivery partially meets requirements OR evidence is ambiguous.
- FAIL: confidence < 50 OR delivery clearly does not meet the requirements.

OUTPUT FORMAT (strict JSON only, no prose before or after):
{
  "decision": "PASS" | "FAIL" | "REVIEW",
  "confidence": <integer 0-100>,
  "reason": "<one clear sentence explaining the primary decision driver>",
  "specific_feedback": "<detailed breakdown: what was required, what was delivered, what matched or didn't>",
  "flag_for_human": <boolean — true if REVIEW or if the situation is complex>
}

NEVER deviate from this JSON schema. NEVER add commentary outside the JSON object.`;
}

/**
 * Builds the user-turn prompt for a specific verification task.
 * Includes covenant brief, milestone requirement, delivered content analysis, and relationship history.
 */
export function buildVerificationPrompt(
  covenantBrief: string,
  milestoneDescription: string,
  deliveredContent: string | string[],
  relationshipContext: RelationshipContext | null,
): string {
  const contentBlock = Array.isArray(deliveredContent)
    ? deliveredContent.map((c, i) => `[File ${i + 1}]: ${c}`).join('\n')
    : deliveredContent;

  const historyBlock = relationshipContext
    ? buildRelationshipBlock(relationshipContext)
    : '(No prior interaction history for this client-contractor pair.)';

  return `COVENANT BRIEF:
${covenantBrief}

MILESTONE REQUIREMENT:
${milestoneDescription}

DELIVERED CONTENT ANALYSIS:
${contentBlock}

RELATIONSHIP HISTORY (from Walrus Memory):
${historyBlock}

Based on all of the above, produce your JSON verification verdict now.`;
}

function buildRelationshipBlock(ctx: RelationshipContext): string {
  const completedCount = ctx.interactions.filter((i) => i.outcome === 'PASS').length;
  const totalCount = ctx.interactions.length;
  const avgLatency =
    totalCount > 0
      ? Math.round(
          ctx.interactions.reduce((s, i) => s + i.deliveryLatencyHours, 0) / totalCount,
        )
      : null;

  return `Client Address: ${ctx.clientAddress}
Contractor Address: ${ctx.contractorAddress}
Prior Milestones: ${totalCount} (${completedCount} passed, ${ctx.disputeHistory.length} disputed)
Total Value Transacted: $${(ctx.totalValueTransacted / 1_000_000).toFixed(2)} USDSUI
${avgLatency !== null ? `Average Delivery Time: ${avgLatency} hours` : ''}
${ctx.contractorPatterns ? `\nContractor Patterns:\n${ctx.contractorPatterns}` : ''}
${ctx.clientPreferences ? `\nClient Preferences:\n${ctx.clientPreferences}` : ''}
${ctx.disputeHistory.length > 0 ? `\nDispute History:\n${ctx.disputeHistory.join('\n')}` : ''}
${
  ctx.interactions.length > 0
    ? `\nRecent Interactions:\n${ctx.interactions
        .slice(-3)
        .map(
          (i) =>
            `  • Milestone ${i.milestoneIndex}: ${i.outcome} (${i.deliveryLatencyHours}h latency) — "${i.qualityNotes}"`,
        )
        .join('\n')}`
    : ''
}`;
}

/**
 * Builds a brief-storage prompt for summarizing past interactions.
 * Used when interaction history exceeds the rolling window threshold.
 */
export function buildSummarizationPrompt(interactions: InteractionRecord[]): string {
  return `You are a data analyst for the Accord protocol. Summarize the following interaction history into:
1. "contractorPatterns": a 2–3 sentence summary of the contractor's delivery behavior, strengths, and weaknesses.
2. "clientPreferences": a 1–2 sentence summary of what this client values and how they tend to respond.

INTERACTIONS:
${interactions.map((i, n) => `${n + 1}. Outcome: ${i.outcome} | Latency: ${i.deliveryLatencyHours}h | Notes: "${i.qualityNotes}"`).join('\n')}

Return ONLY valid JSON:
{ "contractorPatterns": "...", "clientPreferences": "..." }`;
}
