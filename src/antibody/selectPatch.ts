/**
 * Select the smallest valid patch from a set of PatchCandidate objects whose
 * EvaluationResults have been provided by Person 3's evaluation engine.
 *
 * Responsibilities of this module:
 *  - Match candidates to evaluations strictly by ID.
 *  - Deep-validate each evaluation (not just the `valid` flag).
 *  - Apply the deterministic tie-breaking order.
 *  - Return a typed SelectionResult with a human-readable rationale.
 *  - Never run evaluation itself — that belongs to Person 3.
 *  - Never mutate inputs.
 *
 * Tie-breaking order (lower index = higher priority):
 *  1. Smallest patchSize.
 *  2. Highest benign pass rate (benignPassed / benignTotal).
 *  3. Highest held-out pass rate (heldOutPassed / heldOutTotal), when present.
 *  4. Fewest distinct tool rules changed.
 *  5. Lexicographically smallest patch ID (final deterministic tie-breaker).
 */

import type { EvaluationResult, PatchCandidate } from "../types.ts";
import { RepairEngineError } from "./errors.ts";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

/**
 * The result of a successful patch selection.
 *
 * No equivalent type exists in src/types.ts, so it is defined here and
 * re-exported through src/antibody/index.ts.
 */
export type SelectionResult = {
  /** The winning PatchCandidate. */
  selectedPatch: PatchCandidate;
  /** The EvaluationResult that proved validity and drove tie-breaking. */
  selectedEvaluation: EvaluationResult;
  /**
   * Human-readable explanation of why this candidate was chosen, using the
   * real computed values from the evaluation.
   */
  rationale: string;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Raised when no valid, fully-evaluated candidate exists. */
export class NoValidPatchError extends RepairEngineError {
  constructor(detail: string) {
    super("NO_VALID_PATCH", `No valid patch could be selected: ${detail}`);
    this.name = "NoValidPatchError";
  }
}

/** Raised when a candidate has no matching evaluation. */
export class MissingEvaluationError extends RepairEngineError {
  constructor(patchId: string) {
    super(
      "MISSING_EVALUATION",
      `No evaluation result found for patch "${patchId}"`,
    );
    this.name = "MissingEvaluationError";
  }
}

/** Raised when multiple evaluations share the same patchId. */
export class DuplicateEvaluationError extends RepairEngineError {
  constructor(patchId: string) {
    super(
      "DUPLICATE_EVALUATION",
      `More than one evaluation result found for patch "${patchId}"`,
    );
    this.name = "DuplicateEvaluationError";
  }
}

/** Raised when the candidate list contains duplicate patch IDs. */
export class DuplicateCandidateError extends RepairEngineError {
  constructor(patchId: string) {
    super(
      "DUPLICATE_CANDIDATE",
      `More than one patch candidate found with id "${patchId}"`,
    );
    this.name = "DuplicateCandidateError";
  }
}

/** Raised when an evaluation result is internally contradictory. */
export class InconsistentEvaluationError extends RepairEngineError {
  constructor(patchId: string, reason: string) {
    super(
      "INCONSISTENT_EVALUATION",
      `Evaluation for patch "${patchId}" is internally inconsistent: ${reason}`,
    );
    this.name = "InconsistentEvaluationError";
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a single EvaluationResult deeply.
 *
 * `valid: true` is not trusted on its own — all numeric invariants are
 * checked independently.
 */
function validateEvaluation(
  ev: EvaluationResult,
  candidate: PatchCandidate,
): void {
  const id = ev.patchId;

  // Non-negative totals
  if (ev.knownAttacksTotal < 0) {
    throw new InconsistentEvaluationError(id, "knownAttacksTotal is negative");
  }
  if (ev.benignTotal < 0) {
    throw new InconsistentEvaluationError(id, "benignTotal is negative");
  }

  // Passed counts within [0, total]
  if (ev.knownAttacksPassed < 0 || ev.knownAttacksPassed > ev.knownAttacksTotal) {
    throw new InconsistentEvaluationError(
      id,
      `knownAttacksPassed (${ev.knownAttacksPassed}) out of range [0, ${ev.knownAttacksTotal}]`,
    );
  }
  if (ev.benignPassed < 0 || ev.benignPassed > ev.benignTotal) {
    throw new InconsistentEvaluationError(
      id,
      `benignPassed (${ev.benignPassed}) out of range [0, ${ev.benignTotal}]`,
    );
  }

  // Held-out counts (optional) — validate range when present
  if (ev.heldOutTotal !== undefined || ev.heldOutPassed !== undefined) {
    const total = ev.heldOutTotal ?? 0;
    const passed = ev.heldOutPassed ?? 0;
    if (total < 0) {
      throw new InconsistentEvaluationError(id, "heldOutTotal is negative");
    }
    if (passed < 0 || passed > total) {
      throw new InconsistentEvaluationError(
        id,
        `heldOutPassed (${passed}) out of range [0, ${total}]`,
      );
    }
  }

  // patchSize must equal the actual number of changes in the candidate
  if (ev.patchSize !== candidate.changes.length) {
    throw new InconsistentEvaluationError(
      id,
      `patchSize (${ev.patchSize}) does not match candidate.changes.length (${candidate.changes.length})`,
    );
  }
}

/**
 * A candidate's evaluation is considered valid for selection when:
 *  - evaluation.valid is true (Person 3's top-level verdict)
 *  - all known attacks were blocked (knownAttacksPassed === knownAttacksTotal)
 *  - the full benign suite passed (benignPassed === benignTotal)
 */
function isSelectable(ev: EvaluationResult): boolean {
  return (
    ev.valid &&
    ev.knownAttacksPassed === ev.knownAttacksTotal &&
    ev.benignPassed === ev.benignTotal
  );
}

// ---------------------------------------------------------------------------
// Tie-breaking comparator
// ---------------------------------------------------------------------------

/**
 * Count the number of distinct tool names affected by a candidate's changes.
 * Top-level paths (e.g. "untrustedContentCanAuthorizeTools") count as zero
 * tool rules changed.
 */
function distinctToolRulesChanged(candidate: PatchCandidate): number {
  const tools = new Set<string>();
  for (const change of candidate.changes) {
    const parts = change.path.split(".");
    // toolRules.<toolName>.<field> → parts[1] is the tool name
    if (parts[0] === "toolRules" && parts[1] !== undefined) {
      tools.add(parts[1]);
    }
  }
  return tools.size;
}

function heldOutRate(ev: EvaluationResult): number {
  if (ev.heldOutTotal === undefined || ev.heldOutTotal === 0) return 0;
  return (ev.heldOutPassed ?? 0) / ev.heldOutTotal;
}

/**
 * Compare two (candidate, evaluation) pairs.
 * Returns negative if a should be preferred, positive if b should be preferred.
 * Implements the 5-level deterministic tie-breaking order.
 */
function compareSelectable(
  a: { candidate: PatchCandidate; evaluation: EvaluationResult },
  b: { candidate: PatchCandidate; evaluation: EvaluationResult },
): number {
  // 1. Smaller patchSize wins.
  if (a.evaluation.patchSize !== b.evaluation.patchSize) {
    return a.evaluation.patchSize - b.evaluation.patchSize;
  }

  // 2. Higher benign pass rate wins.
  const benignRateA = a.evaluation.benignTotal > 0
    ? a.evaluation.benignPassed / a.evaluation.benignTotal
    : 0;
  const benignRateB = b.evaluation.benignTotal > 0
    ? b.evaluation.benignPassed / b.evaluation.benignTotal
    : 0;
  if (benignRateA !== benignRateB) {
    return benignRateB - benignRateA; // higher is better → invert
  }

  // 3. Higher held-out pass rate wins (when available).
  const hoRateA = heldOutRate(a.evaluation);
  const hoRateB = heldOutRate(b.evaluation);
  if (hoRateA !== hoRateB) {
    return hoRateB - hoRateA; // higher is better → invert
  }

  // 4. Fewer distinct tool rules changed wins.
  const toolsA = distinctToolRulesChanged(a.candidate);
  const toolsB = distinctToolRulesChanged(b.candidate);
  if (toolsA !== toolsB) {
    return toolsA - toolsB;
  }

  // 5. Lexicographically smaller patch ID wins (deterministic final tie-breaker).
  return a.candidate.id.localeCompare(b.candidate.id);
}

// ---------------------------------------------------------------------------
// Rationale builder
// ---------------------------------------------------------------------------

function buildRationale(
  winner: PatchCandidate,
  ev: EvaluationResult,
  totalCandidates: number,
  validCount: number,
): string {
  const benignRate =
    ev.benignTotal > 0
      ? `${ev.benignPassed}/${ev.benignTotal} (${Math.round((ev.benignPassed / ev.benignTotal) * 100)}%)`
      : "n/a";

  const attackRate = `${ev.knownAttacksPassed}/${ev.knownAttacksTotal}`;

  const hoLine =
    ev.heldOutTotal !== undefined && ev.heldOutTotal > 0
      ? `\n  held-out attacks:  ${ev.heldOutPassed ?? 0}/${ev.heldOutTotal}`
      : "";

  const toolsChanged = distinctToolRulesChanged(winner);
  const toolLine = toolsChanged > 0
    ? `${toolsChanged} tool rule(s) affected`
    : "no tool rules affected (top-level change)";

  return (
    `Selected patch "${winner.id}" from ${validCount} valid candidate(s) ` +
    `(${totalCandidates} evaluated total).\n` +
    `  patch size:        ${ev.patchSize} change(s)\n` +
    `  known attacks:     ${attackRate} blocked\n` +
    `  benign workflows:  ${benignRate} preserved${hoLine}\n` +
    `  scope:             ${toolLine}\n` +
    `  reason:            ${winner.reason}`
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Select the smallest valid patch candidate from evaluation results.
 *
 * @param candidates  PatchCandidate objects produced by generatePatchCandidates.
 * @param evaluations EvaluationResult objects produced by Person 3's engine.
 *
 * @throws {DuplicateCandidateError}     – two candidates share the same ID
 * @throws {DuplicateEvaluationError}    – two evaluations share the same patchId
 * @throws {MissingEvaluationError}      – a candidate has no matching evaluation
 * @throws {InconsistentEvaluationError} – an evaluation is internally contradictory
 * @throws {NoValidPatchError}           – no candidate passes all validity checks
 */
export function selectPatch(
  candidates: PatchCandidate[],
  evaluations: EvaluationResult[],
): SelectionResult {
  // ── 1. Deduplicate checks ────────────────────────────────────────────────

  const seenCandidateIds = new Set<string>();
  for (const c of candidates) {
    if (seenCandidateIds.has(c.id)) {
      throw new DuplicateCandidateError(c.id);
    }
    seenCandidateIds.add(c.id);
  }

  const evalById = new Map<string, EvaluationResult>();
  for (const ev of evaluations) {
    if (evalById.has(ev.patchId)) {
      throw new DuplicateEvaluationError(ev.patchId);
    }
    evalById.set(ev.patchId, ev);
  }

  // ── 2. Match + validate each candidate ──────────────────────────────────

  type Pair = { candidate: PatchCandidate; evaluation: EvaluationResult };
  const validPairs: Pair[] = [];

  for (const candidate of candidates) {
    const ev = evalById.get(candidate.id);
    if (ev === undefined) {
      throw new MissingEvaluationError(candidate.id);
    }

    // Deep-validate the evaluation (throws InconsistentEvaluationError).
    validateEvaluation(ev, candidate);

    // Only keep candidates that pass all validity criteria.
    if (isSelectable(ev)) {
      validPairs.push({ candidate, evaluation: ev });
    }
  }

  // ── 3. Require at least one valid candidate ──────────────────────────────

  if (validPairs.length === 0) {
    const reasons = candidates.map((c) => {
      const ev = evalById.get(c.id);
      if (ev === undefined) return `${c.id}: no evaluation`;
      if (!ev.valid) return `${c.id}: evaluation.valid=false`;
      if (ev.knownAttacksPassed < ev.knownAttacksTotal) {
        return `${c.id}: blocked ${ev.knownAttacksPassed}/${ev.knownAttacksTotal} known attacks`;
      }
      if (ev.benignPassed < ev.benignTotal) {
        return `${c.id}: preserved ${ev.benignPassed}/${ev.benignTotal} benign workflows`;
      }
      return `${c.id}: invalid`;
    });
    throw new NoValidPatchError(reasons.join("; "));
  }

  // ── 4. Sort by tie-breaking order, pick the winner ──────────────────────

  // Sort is stable in V8 (Node ≥ 11) — identical comparisons keep insertion order.
  const sorted = [...validPairs].sort(compareSelectable);

  // sorted[0] is guaranteed by the length check above.
  const winner = sorted[0] as Pair;

  // ── 5. Build rationale ───────────────────────────────────────────────────

  const rationale = buildRationale(
    winner.candidate,
    winner.evaluation,
    candidates.length,
    validPairs.length,
  );

  return {
    selectedPatch: winner.candidate,
    selectedEvaluation: winner.evaluation,
    rationale,
  };
}
