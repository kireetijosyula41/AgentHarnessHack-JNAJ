/**
 * Reasoning-agent repair explainer.
 *
 * SAFETY CONTRACT (PLAN §2, steering S4):
 *   The LLM may PROPOSE an explanation. It has NO authority over the patch.
 *   The patch itself is produced and validated entirely by the deterministic
 *   repair engine (diagnoseFailure → generatePatchCandidates → applyPatch →
 *   selectPatch). This module only turns the already-decided repair into a
 *   human-readable root-cause narrative for the UI.
 *
 * If OPENROUTER_API_KEY is unset or the model call fails, we fall back to the
 * deterministic rootCause string from the diagnosis, so the demo never breaks.
 */

import type { AttackTrace, PatchCandidate } from "../types.ts";
import type { Diagnosis } from "./diagnose.ts";

export type RepairExplanation = {
  /** Human-readable root-cause narrative. */
  narrative: string;
  /** True when a live model produced the narrative; false for the fallback. */
  reasoned: boolean;
};

/** Build the deterministic fallback narrative from structured data only. */
function deterministicNarrative(
  trace: AttackTrace,
  diagnosis: Diagnosis,
  patch: PatchCandidate,
): string {
  const paths = patch.changes.map((c) => c.path).join(", ");
  return (
    `${diagnosis.rootCause} The minimal capability repair sets ${paths}, ` +
    `binding tool authority to the authenticated session rather than to ` +
    `model-controlled input.`
  );
}

/**
 * Produce a root-cause explanation for a repair.
 *
 * @param trace     The successful exploit trace (structured metadata only).
 * @param diagnosis The deterministic diagnosis.
 * @param patch     The deterministically selected patch candidate.
 */
export async function explainRepair(
  trace: AttackTrace,
  diagnosis: Diagnosis,
  patch: PatchCandidate,
): Promise<RepairExplanation> {
  const fallback = deterministicNarrative(trace, diagnosis, patch);

  if (!process.env.OPENROUTER_API_KEY) {
    return { narrative: fallback, reasoned: false };
  }

  try {
    // Lazy import so the offline path never needs the model deps. Use the same
    // Agent + OpenAIModel pattern Person 1's runtime uses (proven to work here),
    // with NO tools — this agent can only produce text, never take actions.
    const { Agent } = await import("@strands-agents/sdk");
    const { OpenAIModel } = await import("@strands-agents/sdk/models/openai");

    const model = new OpenAIModel({
      api: "chat",
      modelId: process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.1-8b-instruct",
      apiKey: process.env.OPENROUTER_API_KEY,
      temperature: 0,
      clientConfig: {
        baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      },
    });

    // We pass ONLY structured facts the deterministic engine already decided.
    // The model explains; it does not choose the patch.
    const facts = {
      failedInvariant: diagnosis.failedInvariant,
      violationType: trace.violationType,
      tool: trace.proposedToolCall.tool,
      sessionSubject: trace.sessionScope.subjectId,
      requestedSubject: trace.proposedToolCall.args["subject_id"] ?? null,
      selectedPatchPaths: patch.changes.map((c) => c.path),
      deterministicRootCause: diagnosis.rootCause,
    };

    const systemPrompt =
      "You are a security engineer explaining why an AI agent harness patch " +
      "was applied. Using ONLY the structured facts the user provides, write " +
      "2-3 sentences explaining the root cause of the capability failure and " +
      "why this specific least-privilege patch closes it. Do not invent fields " +
      "or values. Do not propose alternative patches. Return prose only.";

    const agent = new Agent({ model, systemPrompt, tools: [], printer: false });
    const result = await agent.invoke(`Facts:\n${JSON.stringify(facts, null, 2)}`);
    const narrative = result.toString().trim();

    if (narrative.length === 0) {
      return { narrative: fallback, reasoned: false };
    }
    return { narrative, reasoned: true };
  } catch {
    // Any model/parse/network error → deterministic fallback. Never break repair.
    return { narrative: fallback, reasoned: false };
  }
}
