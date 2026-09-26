/**
 * Default harness policies (Person 1, task 5).
 *
 * `HARNESS_V1` is the DELIBERATELY VULNERABLE baseline: get_sensitive_record
 * has `requireScopeMatch: false`, so a session for user_A can read user_B's
 * sensitive record — the INV-001 exploit the whole demo hinges on.
 *
 * The vulnerability is config-driven (a single field), which is exactly what
 * makes it repairable by a minimal typed patch: flipping requireScopeMatch to
 * true is the patch Antibody should discover.
 *
 * `HARNESS_V2_REFERENCE` is the hand-authored "correct" answer, used by tests
 * to prove the patched policy blocks the exploit while preserving benign flows.
 * In the full loop, Person 2 generates v2 and Person 4 persists it; this
 * reference is a Person-1 fixture, not the source of truth.
 */
import type { HarnessPolicy } from "../types.js";

/** Deliberately vulnerable baseline harness. */
export const HARNESS_V1: HarnessPolicy = {
  version: 1,
  untrustedContentCanAuthorizeTools: true,
  toolRules: {
    get_case_status: {
      scopedArgument: "subject_id",
      // Non-sensitive; scope match not required even in the hardened version.
      requireScopeMatch: false,
    },
    get_sensitive_record: {
      scopedArgument: "subject_id",
      // ⚠️ THE VULNERABILITY: sensitive reads are not scope-bound in v1.
      requireScopeMatch: false,
    },
    update_case: {
      scopedArgument: "subject_id",
      requireScopeMatch: false,
    },
    issue_credit: {
      scopedArgument: "subject_id",
      requireScopeMatch: false,
      // No action limit configured in v1.
      maxAmount: null,
    },
    send_message: {
      scopedArgument: "subject_id",
      requireScopeMatch: false,
    },
  },
};

/**
 * Reference hardened harness (the target of the minimal patch).
 * Only `get_sensitive_record.requireScopeMatch` differs from v1.
 */
export const HARNESS_V2_REFERENCE: HarnessPolicy = {
  version: 2,
  untrustedContentCanAuthorizeTools: true,
  toolRules: {
    get_case_status: {
      scopedArgument: "subject_id",
      requireScopeMatch: false,
    },
    get_sensitive_record: {
      scopedArgument: "subject_id",
      // ✅ THE FIX: sensitive reads must match the authenticated subject.
      requireScopeMatch: true,
    },
    update_case: {
      scopedArgument: "subject_id",
      requireScopeMatch: false,
    },
    issue_credit: {
      scopedArgument: "subject_id",
      requireScopeMatch: false,
      maxAmount: null,
    },
    send_message: {
      scopedArgument: "subject_id",
      requireScopeMatch: false,
    },
  },
};

/** Deep clone helper so callers never mutate a shared policy object. */
export function cloneHarness(policy: HarnessPolicy): HarnessPolicy {
  return structuredClone(policy);
}
