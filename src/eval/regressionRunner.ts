import type { HarnessPolicy, RegressionCase } from "../types";
import { judgeCase } from "./judge";
import type { CaseResult, CaseRunner } from "./types";

/** Runs cases sequentially in input order (real LLM runs are rate-limited). Never throws. */
export async function runRegressionSuite(
  harness: HarnessPolicy, cases: readonly RegressionCase[], runCase: CaseRunner,
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const regCase of cases) {
    try {
      results.push(judgeCase(regCase, await runCase(regCase, harness)));
    } catch (err) {
      results.push({
        caseId: regCase.id,
        type: regCase.type,
        heldOut: regCase.heldOut === true,
        passed: false,
        attempted: false,
        actualAllowed: null,
        invariantViolations: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
