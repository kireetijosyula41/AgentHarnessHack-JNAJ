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
