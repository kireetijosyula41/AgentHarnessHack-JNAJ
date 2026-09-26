/**
 * Diagnose a successful attack trace and identify the mutable policy paths
 * needed to repair the capability boundary.
 *
 * Rules:
 * - All logic is deterministic; no external API calls.
 * - Diagnosis is derived from structured trace metadata, never from malicious
 *   prompt wording.
 * - Only supported invariant IDs with known repair mappings are accepted.
 */

import type { AttackTrace, HarnessPolicy } from "../types.ts";
import { RepairEngineError } from "./errors.ts";

// ---------------------------------------------------------------------------
// Local types (no equivalent in src/types.ts)
// ---------------------------------------------------------------------------

/**
 * The output of a successful diagnosis.
 */
export type Diagnosis = {
  /** The invariant identifier from the trace, e.g. "INV-001". */
  failedInvariant: string;
  /** Human-readable explanation of the root cause, derived from trace metadata. */
  rootCause: string;
  /**
   * Dot-notation policy paths that can be patched to close the capability gap.
   * Each path is a valid input to parsePolicyPath / applyPatch.
   */
  mutablePolicyPaths: string[];
};

// ---------------------------------------------------------------------------
// Diagnosis-specific errors
// ---------------------------------------------------------------------------

/**
 * Raised when the trace's outcome is not "successful_exploit", i.e. there is
 * nothing to repair.
 */
export class NotAnExploitError extends RepairEngineError {
  constructor(outcome: string) {
    super(
      "NOT_AN_EXPLOIT",
      `Cannot diagnose a trace whose outcome is "${outcome}"; only "successful_exploit" traces require repair`,
    );
    this.name = "NotAnExploitError";
  }
}

/**
 * Raised when the trace is internally inconsistent (e.g. successful_exploit
 * but no violation type, or missing failedInvariant).
 */
export class InconsistentTraceError extends RepairEngineError {
  constructor(message: string) {
    super("INCONSISTENT_TRACE", message);
    this.name = "InconsistentTraceError";
  }
}

/**
 * Raised when the trace references a tool that is not present in
 * harness.toolRules.
 */
export class UnknownToolInTraceError extends RepairEngineError {
  constructor(tool: string) {
    super(
      "UNKNOWN_TOOL_IN_TRACE",
      `The harness does not define toolRules for tool "${tool}" referenced in the attack trace`,
    );
    this.name = "UnknownToolInTraceError";
  }
}

/**
 * Raised when the failed invariant has no deterministic repair mapping
 * implemented in this engine.
 */
export class UnsupportedInvariantError extends RepairEngineError {
  constructor(invariant: string) {
    super(
      "UNSUPPORTED_INVARIANT",
      `No deterministic repair mapping exists for invariant "${invariant}"`,
    );
    this.name = "UnsupportedInvariantError";
  }
}

// ---------------------------------------------------------------------------
// Invariant → repair mapping
// ---------------------------------------------------------------------------

/**
 * Maps each supported invariant ID to a function that, given the attack trace
 * and harness, returns the Diagnosis fields specific to that invariant.
 *
 * Adding a new invariant: add an entry here; the dispatch in diagnoseFailure
 * picks it up automatically.
 */
type InvariantHandler = (
  trace: AttackTrace,
  harness: HarnessPolicy,
) => Pick<Diagnosis, "rootCause" | "mutablePolicyPaths">;

const INVARIANT_HANDLERS: Record<string, InvariantHandler> = {
  /**
   * INV-001 CROSS_SCOPE_ACCESS
   *
   * A session scoped to subject A accessed a resource belonging to subject B.
   * The fix is to require that the tool's subject argument must match the
   * authenticated session scope.
   */
  "INV-001": (trace, harness) => {
    const tool = trace.proposedToolCall.tool;

    if (!(tool in harness.toolRules)) {
      throw new UnknownToolInTraceError(tool);
    }

    return {
      rootCause:
        `The requested subject identity ("${trace.proposedToolCall.args["subject_id"] !== undefined ? "subject_id" : "subject argument"}") ` +
        `for tool "${tool}" was supplied by the model rather than bound to the ` +
        `authenticated session scope (subject: "${trace.sessionScope.subjectId}"). ` +
        `The harness did not enforce scope isolation on this tool.`,
      mutablePolicyPaths: [`toolRules.${tool}.requireScopeMatch`],
    };
  },

  /**
   * INV-002 UNTRUSTED_AUTHORIZATION
   *
   * Untrusted content caused the agent to authorize a privileged action.
   * The top-level flag must be flipped to false.
   */
  "INV-002": (_trace, _harness) => ({
    rootCause:
      "Untrusted content was able to authorize a privileged tool call " +
      "because the harness allowed untrusted input to act as an authorization source.",
    mutablePolicyPaths: ["untrustedContentCanAuthorizeTools"],
  }),

  /**
   * INV-003 ACTION_LIMIT
   *
   * An autonomous action exceeded its configured impact threshold.
   * The tool's maxAmount ceiling must be set or tightened.
   */
  "INV-003": (trace, harness) => {
    const tool = trace.proposedToolCall.tool;

    if (!(tool in harness.toolRules)) {
      throw new UnknownToolInTraceError(tool);
    }

    return {
      rootCause:
        `Tool "${tool}" executed an action that exceeded its configured impact threshold. ` +
        `The harness did not impose a maxAmount constraint on this tool.`,
      mutablePolicyPaths: [`toolRules.${tool}.maxAmount`],
    };
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Diagnose a successful exploit and return a structured repair plan.
 *
 * @throws {NotAnExploitError}       if the trace outcome is not "successful_exploit"
 * @throws {InconsistentTraceError}  if the trace is internally inconsistent
 * @throws {UnknownToolInTraceError} if the attacked tool is absent from the harness
 * @throws {UnsupportedInvariantError} if no repair mapping exists for the invariant
 */
export function diagnoseFailure(
  trace: AttackTrace,
  harness: HarnessPolicy,
): Diagnosis {
  // 1. Only successful exploits need repair.
  if (trace.outcome !== "successful_exploit") {
    throw new NotAnExploitError(trace.outcome);
  }

  // 2. A successful exploit must have a meaningful violation.
  if (!trace.violationType || trace.violationType.trim() === "") {
    throw new InconsistentTraceError(
      `Trace "${trace.id}" has outcome "successful_exploit" but an empty violationType`,
    );
  }

  // 3. A successful exploit must identify which invariant failed.
  if (!trace.failedInvariant || trace.failedInvariant.trim() === "") {
    throw new InconsistentTraceError(
      `Trace "${trace.id}" has outcome "successful_exploit" but an empty failedInvariant`,
    );
  }

  // 4. Check that the tool referenced in the trace exists in the harness.
  //    (Invariant handlers also check this, but we give a clear error early.)
  const tool = trace.proposedToolCall.tool;
  if (!(tool in harness.toolRules)) {
    throw new UnknownToolInTraceError(tool);
  }

  // 5. Dispatch to the invariant-specific handler.
  const handler = INVARIANT_HANDLERS[trace.failedInvariant];
  if (handler === undefined) {
    throw new UnsupportedInvariantError(trace.failedInvariant);
  }

  const { rootCause, mutablePolicyPaths } = handler(trace, harness);

  return {
    failedInvariant: trace.failedInvariant,
    rootCause,
    mutablePolicyPaths,
  };
}
