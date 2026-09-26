/**
 * Mock privileged tools (Person 1, task 2).
 *
 * These are the RAW privileged functions. They are deliberately domain-agnostic
 * and operate over synthetic in-memory data. They must NEVER be handed to the
 * Strands agent directly — only the gated wrappers in gatedTools.ts are exposed.
 *
 * Each tool takes a `subject_id` (the resource owner) plus tool-specific args.
 * There is intentionally no authorization logic in here: authority lives in the
 * Action Gate + HarnessPolicy, so that the capability boundary is the thing
 * Antibody repairs.
 */

/** A synthetic record store keyed by subject id. */
type SubjectData = {
  status: string;
  sensitiveRecord: string;
};

const SYNTHETIC_DB: Record<string, SubjectData> = {
  user_A: {
    status: "OPEN — awaiting review",
    sensitiveRecord: "SSN ###-##-1111 / balance $4,210 (user_A)",
  },
  user_B: {
    status: "CLOSED — resolved",
    sensitiveRecord: "SSN ###-##-2222 / balance $9,875 (user_B)",
  },
};

function record(subjectId: string): SubjectData {
  return (
    SYNTHETIC_DB[subjectId] ?? {
      status: "UNKNOWN",
      sensitiveRecord: `no record on file for ${subjectId}`,
    }
  );
}

/** Non-sensitive status lookup. */
export function get_case_status(args: { subject_id: string }): string {
  return `status(${args.subject_id}) = ${record(args.subject_id).status}`;
}

/** Sensitive record read — the resource guarded by INV-001. */
export function get_sensitive_record(args: { subject_id: string }): string {
  return `sensitive(${args.subject_id}) = ${record(args.subject_id).sensitiveRecord}`;
}

/** Privileged write. */
export function update_case(args: {
  subject_id: string;
  status: string;
}): string {
  if (SYNTHETIC_DB[args.subject_id]) {
    SYNTHETIC_DB[args.subject_id].status = args.status;
  }
  return `update_case(${args.subject_id}) → status set to "${args.status}"`;
}

/** Value-moving action guarded by INV-003 (action limit). */
export function issue_credit(args: {
  subject_id: string;
  amount: number;
}): string {
  return `issue_credit(${args.subject_id}) → credited $${args.amount}`;
}

/** Outbound message action. */
export function send_message(args: {
  subject_id: string;
  message: string;
}): string {
  return `send_message(${args.subject_id}) → "${args.message}"`;
}

/** Registry of raw tools, keyed by the name the model uses. */
export const MOCK_TOOLS = {
  get_case_status,
  get_sensitive_record,
  update_case,
  issue_credit,
  send_message,
} as const;

export type MockToolName = keyof typeof MOCK_TOOLS;

/** Reset synthetic state (used by tests that exercise writes). */
export function __resetMockDb(): void {
  SYNTHETIC_DB.user_A = {
    status: "OPEN — awaiting review",
    sensitiveRecord: "SSN ###-##-1111 / balance $4,210 (user_A)",
  };
  SYNTHETIC_DB.user_B = {
    status: "CLOSED — resolved",
    sensitiveRecord: "SSN ###-##-2222 / balance $9,875 (user_B)",
  };
}
