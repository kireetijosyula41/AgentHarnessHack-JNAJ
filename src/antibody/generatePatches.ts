/**
 * Generate typed PatchCandidate objects from a successful attack trace.
 *
 * Design principles:
 * - Fully deterministic — no network calls, no randomness.
 * - Repair is derived from structured trace metadata and the diagnosis,
 *   never from matching malicious prompt wording.
 * - Every generated candidate is validated through the same applyPatch
 *   pre-flight used at apply-time, so no invalid candidate is ever returned.
 * - The module is structured so that additional deterministic candidates or
 *   an optional explanation provider (e.g. OpenRouter) can be added later
 *   without changing the public interface.
 *
 * MVP scope: one valid least-privilege candidate per supported invariant.
 */

import type { AttackTrace, HarnessPolicy, PatchCandidate } from "../types.ts";
import { RepairEngineError } from "./errors.ts";
import {
  diagnoseFailure,
  NotAnExploitError,
  UnsupportedInvariantError,
} from "./diagnose.ts";
import type { Diagnosis } from "./diagnose.ts";
import { applyPatch } from "./applyPatch.ts";
import { parsePolicyPath } from "./policyPaths.ts";

// ---------------------------------------------------------------------------
// generatePatches-specific error
// ---------------------------------------------------------------------------

/**
 * Raised when the harness already enforces the required constraint for the
 * attacked tool — the exploit trace is inconsistent with the harness state.
 *
 * This is distinct from a blocked trace (which uses NotAnExploitError): the
 * trace outcome says "successful_exploit" but the policy already has the
 * fixing constraint in place, meaning the harness state and the trace are
 * contradictory.
 */
export class AlreadyRepairedError extends RepairEngineError {
  constructor(path: string, value: unknown) {
    super(
      "ALREADY_REPAIRED",
      `The harness already has the required constraint at "${path}" = ${JSON.stringify(value)}; ` +
        `the exploit trace is inconsistent with the current harness state`,
    );
    this.name = "AlreadyRepairedError";
  }
}

// ---------------------------------------------------------------------------
// Stable deterministic ID generation
//
// ID format: patch_<traceId>_<changeFingerprint>
//
// changeFingerprint is a compact, order-sensitive encoding of the change set
// so that semantically identical candidates (same paths+values) always get
// the same ID, while different change sets get different IDs.
// No crypto required — collision resistance within one trace is sufficient.
// ---------------------------------------------------------------------------

function changeFingerprint(
  changes: Array<{ path: string; oldValue: unknown; newValue: unknown }>,
): string {
  // Sort by path for order-independence, then encode.
  const sorted = [...changes].sort((a, b) => a.path.localeCompare(b.path));
  return sorted
    .map(
      (c) =>
        `${c.path}:${JSON.stringify(c.oldValue)}->${JSON.stringify(c.newValue)}`,
    )
    .join("|");
}

function makeCandidateId(traceId: string, changes: PatchCandidate["changes"]): string {
  return `patch_${traceId}_${changeFingerprint(changes)}`;
}

// ---------------------------------------------------------------------------
// Candidate builder — assembles and validates a single PatchCandidate.
//
// Throws if the candidate would not pass applyPatch validation (guards against
// generating invalid candidates).
// ---------------------------------------------------------------------------

function buildCandidate(
  traceId: string,
  reason: string,
  changes: PatchCandidate["changes"],
  harness: HarnessPolicy,
): PatchCandidate {
  const candidate: PatchCandidate = {
    id: makeCandidateId(traceId, changes),
    reason,
    changes,
  };

  // Validate by running through the full applyPatch pre-flight.
  // If this throws, the candidate is malformed and should not be returned.
  applyPatch(harness, candidate);

  return candidate;
}

// ---------------------------------------------------------------------------
// Invariant-specific candidate factories
//
// Each factory receives the diagnosis and the base harness, and returns one
// or more PatchCandidate objects representing the least-privilege repairs for
// that invariant.
//
// Extension point: add new invariant keys here; generatePatchCandidates picks
// them up automatically.  An optional explanation-enrichment hook can be added
// to each factory's signature without changing the public interface.
// ---------------------------------------------------------------------------

type CandidateFactory = (
  trace: AttackTrace,
  harness: HarnessPolicy,
  diagnosis: Diagnosis,
) => PatchCandidate[];

/**
 * Read the current value of a policy path from the harness.
 * Delegates to parsePolicyPath for safety; the path is already whitelist-
 * validated by the time this is called.
 */
function readHarnessValue(harness: HarnessPolicy, path: string): unknown {
  const parsed = parsePolicyPath(path, harness);
  if (parsed.kind === "topLevel") {
    return harness.untrustedContentCanAuthorizeTools;
  }
  const rule = harness.toolRules[parsed.toolName];
  if (rule === undefined) return undefined;
  switch (parsed.field) {
    case "requireScopeMatch":     return rule.requireScopeMatch;
    case "scopedArgument":        return rule.scopedArgument;
    case "requireExplicitIntent": return rule.requireExplicitIntent;
    case "maxAmount":             return rule.maxAmount;
    case "allowedRoles":          return rule.allowedRoles;
  }
}

const CANDIDATE_FACTORIES: Record<string, CandidateFactory> = {
  /**
   * INV-001 CROSS_SCOPE_ACCESS
   *
   * Smallest repair: flip requireScopeMatch to true on the attacked tool.
   * This binds the tool's subject argument to the authenticated session scope,
   * closing the lateral-access capability without touching any other tool.
   */
  "INV-001": (trace, harness, diagnosis) => {
    const tool = trace.proposedToolCall.tool;
    const path = `toolRules.${tool}.requireScopeMatch`;

    // Confirm the path is in the diagnosis's mutable set (consistency check).
    // diagnosis.mutablePolicyPaths is already whitelist-validated by diagnoseFailure.
    if (!diagnosis.mutablePolicyPaths.includes(path)) {
      throw new RepairEngineError(
        "INTERNAL_CONSISTENCY",
        `Expected path "${path}" in diagnosis.mutablePolicyPaths`,
      );
    }

    const currentValue = readHarnessValue(harness, path);

    // Req 13: if the field is already true the harness is already repaired,
    // which contradicts the "successful_exploit" outcome.
    if (currentValue === true) {
      throw new AlreadyRepairedError(path, true);
    }

    return [
      buildCandidate(
        trace.id,
        `INV-001: Bind subject identity for tool "${tool}" to the authenticated session scope ` +
          `by enabling requireScopeMatch. This prevents the model from supplying an arbitrary ` +
          `subject_id and restricts access to resources owned by the authenticated session subject.`,
        [{ path, oldValue: currentValue, newValue: true }],
        harness,
      ),
    ];
  },

  /**
   * INV-002 UNTRUSTED_AUTHORIZATION
   *
   * Smallest repair: disable the top-level flag that lets untrusted content
   * authorize tool calls.
   */
  "INV-002": (trace, harness, _diagnosis) => {
    const path = "untrustedContentCanAuthorizeTools";
    const currentValue = readHarnessValue(harness, path);

    if (currentValue === false) {
      throw new AlreadyRepairedError(path, false);
    }

    return [
      buildCandidate(
        trace.id,
        `INV-002: Prevent untrusted content from authorizing tool calls by setting ` +
          `untrustedContentCanAuthorizeTools to false. ` +
          `Authorization must come from the authenticated session, not from model-generated content.`,
        [{ path, oldValue: currentValue, newValue: false }],
        harness,
      ),
    ];
  },

  /**
   * INV-003 ACTION_LIMIT
   *
   * Smallest repair: set maxAmount to null (unlimited → bounded) to signal
   * that a limit must be configured.  The actual value is a policy decision
   * for the persistence layer; we record the structural change here.
   *
   * If maxAmount is already null or a finite number the factory signals
   * "already repaired" because the trace outcome is inconsistent.
   */
  "INV-003": (trace, harness, _diagnosis) => {
    const tool = trace.proposedToolCall.tool;
    const path = `toolRules.${tool}.maxAmount`;
    const currentValue = readHarnessValue(harness, path);

    if (currentValue === null) {
      throw new AlreadyRepairedError(path, null);
    }

    // Propose setting maxAmount to null as the structural repair.
    // The exact numeric limit is a business-policy decision outside this engine.
    return [
      buildCandidate(
        trace.id,
        `INV-003: Remove the unconstrained action limit for tool "${tool}" by setting ` +
          `maxAmount to null. The deployment layer must configure an appropriate numeric ` +
          `ceiling before activating the patched harness.`,
        [{ path, oldValue: currentValue, newValue: null }],
        harness,
      ),
    ];
  },
};

// ---------------------------------------------------------------------------
// Deduplication
//
// Two candidates are semantically identical if they have the same change set
// (same paths, oldValues, newValues) regardless of ID or reason text.
// We deduplicate on the change fingerprint.
// ---------------------------------------------------------------------------

function deduplicate(candidates: PatchCandidate[]): PatchCandidate[] {
  const seen = new Set<string>();
  const result: PatchCandidate[] = [];
  for (const c of candidates) {
    const fp = changeFingerprint(c.changes);
    if (!seen.has(fp)) {
      seen.add(fp);
      result.push(c);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate typed PatchCandidate objects for a successful exploit trace.
 *
 * The candidates are:
 * - Derived from structured trace metadata only (never malicious wording).
 * - Validated through applyPatch before being returned.
 * - Deterministic: same inputs always produce the same output.
 * - Deduplicated: semantically identical candidates are collapsed.
 * - Ordered: least-privilege (fewest changes) first.
 *
 * @throws {NotAnExploitError}        – trace.outcome is not "successful_exploit"
 * @throws {InconsistentTraceError}   – trace metadata is internally contradictory
 * @throws {UnknownToolInTraceError}  – attacked tool not in harness.toolRules
 * @throws {UnsupportedInvariantError} – no repair mapping for the invariant
 * @throws {AlreadyRepairedError}     – harness already enforces the required constraint
 */
export function generatePatchCandidates(
  trace: AttackTrace,
  harness: HarnessPolicy,
): PatchCandidate[] {
  // Step 1: Diagnose the failure. This validates outcome, invariant, tool, and
  // violation type — and throws with clear errors if anything is wrong.
  // diagnoseFailure also confirms the invariant is supported.
  const diagnosis = diagnoseFailure(trace, harness);

  // Step 2: Dispatch to the invariant-specific factory.
  const factory = CANDIDATE_FACTORIES[diagnosis.failedInvariant];
  if (factory === undefined) {
    // Should not be reachable: diagnoseFailure already throws
    // UnsupportedInvariantError for unknown invariants. Guard kept for safety.
    throw new UnsupportedInvariantError(diagnosis.failedInvariant);
  }

  // Step 3: Generate raw candidates. Factory validates each via applyPatch.
  const raw = factory(trace, harness, diagnosis);

  // Step 4: Deduplicate.
  const unique = deduplicate(raw);

  // Step 5: Sort by patch size (fewest changes first) for deterministic order.
  unique.sort((a, b) => a.changes.length - b.changes.length);

  return unique;
}

// Re-export so callers can import from one location.
export { NotAnExploitError, UnsupportedInvariantError };
