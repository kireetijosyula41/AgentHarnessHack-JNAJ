/**
 * Convert a successful exploit trace into a permanent executable regression
 * case.
 *
 * Rules (from PLAN.md § Person 2 Task 2):
 * - Only traces with outcome "successful_exploit" may become attack regressions.
 * - Preserve: userIntent, untrustedContent, sessionScope, sourceAttackId.
 * - Set: type = "attack", heldOut = false, expected.allowed = false,
 *        expected.tool, expected.violation.
 * - Regression ID is deterministically derived from the attack ID.
 * - The source AttackTrace is never mutated.
 * - Never mark a triggering exploit as held out.
 */

import type { AttackTrace, RegressionCase } from "../types.ts";
import { RepairEngineError } from "./errors.ts";

// ---------------------------------------------------------------------------
// Local error
// ---------------------------------------------------------------------------

/**
 * Raised when a caller attempts to convert a trace that was not a successful
 * exploit into an attack regression.
 */
export class NonExploitRegressionError extends RepairEngineError {
  constructor(traceId: string, outcome: string) {
    super(
      "NON_EXPLOIT_REGRESSION",
      `Trace "${traceId}" has outcome "${outcome}"; only "successful_exploit" traces can become attack regressions`,
    );
    this.name = "NonExploitRegressionError";
  }
}

// ---------------------------------------------------------------------------
// ID derivation
// ---------------------------------------------------------------------------

/**
 * Produce a stable, deterministic regression ID from a trace ID.
 *
 * Format: `reg_<attackId>`
 *
 * This makes it trivial to cross-reference a regression back to its origin
 * trace without storing extra metadata.
 */
function regressionIdFromAttackId(attackId: string): string {
  return `reg_${attackId}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a successful exploit trace into a permanent attack regression case.
 *
 * The returned RegressionCase can be handed directly to Person 3's evaluation
 * engine.
 *
 * @throws {NonExploitRegressionError} if the trace outcome is not "successful_exploit"
 */
export function attackToRegression(trace: AttackTrace): RegressionCase {
  if (trace.outcome !== "successful_exploit") {
    throw new NonExploitRegressionError(trace.id, trace.outcome);
  }

  // Build the regression case from trace metadata.
  // Object spread is intentional: we copy primitives by value and nested
  // objects are frozen-safe because RegressionCase consumers must not mutate
  // them.  We do NOT hold a reference to the original trace.
  return {
    id: regressionIdFromAttackId(trace.id),
    type: "attack",

    // Preserve intent context so the regression runner can reconstruct the
    // full agent input faithfully.
    userIntent: trace.userIntent,
    untrustedContent: trace.untrustedContent,

    // Spread to avoid sharing the original object reference.
    sessionScope: {
      subjectId: trace.sessionScope.subjectId,
      roles: [...trace.sessionScope.roles],
    },

    expected: {
      allowed: false,
      tool: trace.proposedToolCall.tool,
      violation: trace.violationType,
    },

    sourceAttackId: trace.id,

    // A triggering exploit is never held out: it must always be in the known
    // regression set so every candidate patch is evaluated against it.
    heldOut: false,
  };
}
