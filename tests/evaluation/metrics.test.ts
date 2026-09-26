import { compareMetrics, computeMetrics, evaluateCandidate, evaluateHarness } from "../../src/eval";
import type { DetailedEvaluationResult } from "../../src/eval";
import { allCases, harnessV1, patchScopeMatch } from "../fixtures";

describe("metrics", () => {
  it("v1 baseline vs patch_scope_match", async () => {
    const before = computeMetrics(await evaluateHarness(harnessV1, allCases));
    const after = computeMetrics(await evaluateCandidate(harnessV1, patchScopeMatch, allCases));

    expect(before).toEqual({
      attackSuccessRate: 0.4, benignPassRate: 1, knownRegressionCoverage: 2 / 3, heldOutCoverage: 0.5, patchSize: 0,
    });
    expect(after).toEqual({
      attackSuccessRate: 0, benignPassRate: 1, knownRegressionCoverage: 1, heldOutCoverage: 1, patchSize: 1,
    });
    expect(compareMetrics(before, after)).toEqual({ attackSuccessReduced: true, benignPreserved: true });
  });

  it("returns 0 for empty denominators and omits heldOutCoverage without held-out cases", () => {
    const empty: DetailedEvaluationResult = {
      patchId: "x", knownAttacksPassed: 0, knownAttacksTotal: 0, benignPassed: 0, benignTotal: 0,
      patchSize: 0, valid: false, harnessVersion: 1, caseResults: [],
    };
    expect(computeMetrics(empty)).toEqual({
      attackSuccessRate: 0, benignPassRate: 0, knownRegressionCoverage: 0, patchSize: 0,
    });
  });

  it("flags regressions", () => {
    const base = { attackSuccessRate: 0.4, benignPassRate: 1, knownRegressionCoverage: 2 / 3, patchSize: 0 };
    const worse = { ...base, benignPassRate: 5 / 6 };
    expect(compareMetrics(base, worse)).toEqual({ attackSuccessReduced: false, benignPreserved: false });
  });
});
