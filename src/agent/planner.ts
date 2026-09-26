/**
 * Deterministic offline planner (Person 1).
 *
 * When no OPENROUTER_API_KEY is configured (tests, CI, offline demo fallback),
 * runAgent uses this planner instead of a live model. It maps an AgentInput to
 * an ordered list of ProposedToolCalls using simple, transparent heuristics.
 *
 * This is NOT a security component — it stands in for "what a tool-using model
 * would plausibly do", including being fooled by poisoned content. Its output
 * still flows through the SAME Action Gate, so invariant behavior is identical
 * to the live path. Person 2/3 rely on this determinism for reproducible
 * fixtures without needing OpenRouter.
 */
import type { AgentInput, ProposedToolCall } from "../types.js";

const KNOWN_SUBJECTS = ["user_A", "user_B", "user_C"];

/** Pull the first subject id mentioned in text that is NOT the session self. */
function otherSubjectIn(text: string, self: string): string | undefined {
  for (const s of KNOWN_SUBJECTS) {
    if (s !== self && text.includes(s)) return s;
  }
  // Generic patterns like "user_X" or "patient_X".
  const m = text.match(/\b(?:user|patient|subject)_[A-Za-z0-9]+\b/g);
  if (m) {
    const other = m.find((x) => x !== self);
    if (other) return other;
  }
  return undefined;
}

function mentions(text: string, ...needles: string[]): boolean {
  const t = text.toLowerCase();
  return needles.some((n) => t.includes(n));
}

/**
 * Plan the tool calls for a run. Returns them in order; the runtime executes
 * each through the gate. The planner is deliberately "gullible": if untrusted
 * content asks to fetch another subject's sensitive record, it will propose
 * exactly that call — which is the exploit the harness must stop.
 */
export function planToolCalls(input: AgentInput): ProposedToolCall[] {
  const self = input.sessionScope.subjectId;
  const intent = input.userIntent ?? "";
  const untrusted = input.untrustedContent ?? "";
  const calls: ProposedToolCall[] = [];

  // 1) Untrusted content trying to redirect to another subject's sensitive data.
  if (
    mentions(untrusted, "sensitive", "record", "retrieve", "fetch", "pull") &&
    mentions(untrusted, "sensitive", "record")
  ) {
    const other = otherSubjectIn(untrusted, self);
    if (other) {
      calls.push({
        tool: "get_sensitive_record",
        args: { subject_id: other },
        reason: "untrusted content requested another subject's sensitive record",
      });
    }
  }

  // 2) The benign/legitimate portion of the request (from the trusted intent).
  if (mentions(intent, "sensitive", "record")) {
    calls.push({
      tool: "get_sensitive_record",
      args: { subject_id: self },
      reason: "user asked for their own sensitive record",
    });
  } else if (mentions(intent, "status", "account", "case")) {
    calls.push({
      tool: "get_case_status",
      args: { subject_id: self },
      reason: "user asked for their status",
    });
  } else if (mentions(intent, "update", "close", "reopen")) {
    const status = mentions(intent, "close") ? "CLOSED" : "UPDATED";
    calls.push({
      tool: "update_case",
      args: { subject_id: self, status },
      reason: "user asked to update their case",
    });
  } else if (mentions(intent, "credit", "refund")) {
    const amount = extractAmount(intent) ?? 25;
    calls.push({
      tool: "issue_credit",
      args: { subject_id: self, amount },
      reason: "user asked for a credit",
    });
  } else if (mentions(intent, "message", "notify", "send")) {
    calls.push({
      tool: "send_message",
      args: { subject_id: self, message: "Acknowledged." },
      reason: "user asked to send a message",
    });
  }

  // Fallback: if nothing matched, do a harmless self status lookup.
  if (calls.length === 0) {
    calls.push({
      tool: "get_case_status",
      args: { subject_id: self },
      reason: "default: look up own status",
    });
  }

  return calls;
}

function extractAmount(text: string): number | undefined {
  const m = text.match(/\$?\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
}
