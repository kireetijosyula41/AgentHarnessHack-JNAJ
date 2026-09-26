import type { HarnessPolicy, PatchCandidate, RegressionCase } from "../types.ts";
import { splitCases } from "./caseSplit.ts";
import { defaultEvalDeps } from "./defaults.ts";
import { runRegressionSuite } from "./regressionRunner.ts";
import type { CaseResult, DetailedEvaluationResult, EvalDeps } from "./types.ts";

type Counts = Pick<DetailedEvaluationResult,
  "knownAttacksPassed" | "knownAttacksTotal" | "benignPassed" | "benignTotal" | "heldOutPassed" | "heldOutTotal">;

function countResults(cases: readonly RegressionCase[], results: readonly CaseResult[]): Counts {
  const passedIds = new Set(results.filter((r) => r.passed).map((r) => r.caseId));
  const { known, benign, heldOut } = splitCases(cases);
  const passed = (xs: RegressionCase[]) => xs.filter((c) => passedIds.has(c.id)).length;
  const counts: Counts = {
    knownAttacksPassed: passed(known),
    knownAttacksTotal: known.length,
    benignPassed: passed(benign),
    benignTotal: benign.length,
  };
  if (heldOut.length > 0) {
    counts.heldOutPassed = passed(heldOut);
    counts.heldOutTotal = heldOut.length;
  }
  return counts;
}

/** Runs the suite against a harness. Held-out results are reported but never affect `valid`. */
export async function evaluateHarness(
  harness: HarnessPolicy, cases: readonly RegressionCase[],
  deps: EvalDeps = defaultEvalDeps, patchId = "baseline", patchSize = 0,
): Promise<DetailedEvaluationResult> {
  const caseResults = await runRegressionSuite(harness, cases, deps.runCase);
  const counts = countResults(cases, caseResults);
  const valid = patchId !== "baseline"
    && patchSize > 0
    && counts.knownAttacksPassed === counts.knownAttacksTotal
    && counts.benignPassed === counts.benignTotal;
  return { patchId, ...counts, patchSize, valid, harnessVersion: harness.version, caseResults };
}

export async function evaluateCandidate(
  baseHarness: HarnessPolicy, patchCandidate: PatchCandidate,
  regressionCases: readonly RegressionCase[], deps: EvalDeps = defaultEvalDeps,
): Promise<DetailedEvaluationResult> {
  const patchSize = patchCandidate.changes.length;
  let patched: HarnessPolicy;
  try {
    patched = deps.applyPatch(baseHarness, patchCandidate);
  } catch (err) {
    return {
      patchId: patchCandidate.id,
      ...countResults(regressionCases, []),
      patchSize,
      valid: false,
      harnessVersion: baseHarness.version,
      caseResults: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return evaluateHarness(patched, regressionCases, deps, patchCandidate.id, patchSize);
}

/** Evaluates candidates sequentially; results are in the same order as `candidates`. */
export async function evaluateCandidates(
  baseHarness: HarnessPolicy, candidates: readonly PatchCandidate[],
  regressionCases: readonly RegressionCase[], deps: EvalDeps = defaultEvalDeps,
): Promise<DetailedEvaluationResult[]> {
  const results: DetailedEvaluationResult[] = [];
  for (const candidate of candidates) {
    results.push(await evaluateCandidate(baseHarness, candidate, regressionCases, deps));
  }
  return results;
}

export type BaselineReport = DetailedEvaluationResult & {
  /** Known attacks that already get through on the base harness, other than the ones being repaired. */
  preExistingHoles: string[];
  /** Benign workflows the base harness already breaks. */
  brokenBenign: string[];
  /** Attacks whose outcome is not_attempted, which prove nothing either way. */
  inconclusive: string[];
};

/**
 * Preflight before evaluating candidates. If `preExistingHoles` or `brokenBenign` is
 * non-empty, no single patch for the new exploit can be `valid`: fix the suite or harness first.
 * `repairing` defaults to every case with a sourceAttackId (fresh regressions from attackToRegression).
 */
export async function evaluateBaseline(
  baseHarness: HarnessPolicy, cases: readonly RegressionCase[],
  deps: EvalDeps = defaultEvalDeps,
  repairing: readonly string[] = cases.filter((c) => c.sourceAttackId !== undefined).map((c) => c.id),
): Promise<BaselineReport> {
  const result = await evaluateHarness(baseHarness, cases, deps);
  const failed = (pred: (r: CaseResult) => boolean) => result.caseResults.filter(pred).map((r) => r.caseId);
  return {
    ...result,
    preExistingHoles: failed((r) => r.type === "attack" && !r.heldOut && r.attackOutcome === "exploited"
      && !repairing.includes(r.caseId)),
    brokenBenign: failed((r) => r.type === "benign" && !r.passed),
    inconclusive: failed((r) => r.attackOutcome === "not_attempted"),
  };
}
