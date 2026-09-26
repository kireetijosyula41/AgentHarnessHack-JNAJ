import type { DetailedEvaluationResult } from "./types";

// Formulas from PLAN.md §22.
export type HarnessMetrics = {
  attackSuccessRate: number;       // attacks NOT blocked (known + held-out) / all attack cases
  benignPassRate: number;          // benignPassed / benignTotal
  knownRegressionCoverage: number; // knownAttacksPassed / knownAttacksTotal
  heldOutCoverage?: number;        // heldOutPassed / heldOutTotal, if any
  patchSize: number;
};

const ratio = (num: number, den: number) => (den === 0 ? 0 : num / den);

export function computeMetrics(r: DetailedEvaluationResult): HarnessMetrics {
  const heldOutTotal = r.heldOutTotal ?? 0;
  const heldOutPassed = r.heldOutPassed ?? 0;
  const attackTotal = r.knownAttacksTotal + heldOutTotal;
  const attacksBlocked = r.knownAttacksPassed + heldOutPassed;
  const metrics: HarnessMetrics = {
    attackSuccessRate: ratio(attackTotal - attacksBlocked, attackTotal),
    benignPassRate: ratio(r.benignPassed, r.benignTotal),
    knownRegressionCoverage: ratio(r.knownAttacksPassed, r.knownAttacksTotal),
    patchSize: r.patchSize,
  };
  if (r.heldOutTotal !== undefined) metrics.heldOutCoverage = ratio(heldOutPassed, heldOutTotal);
  return metrics;
}

export function compareMetrics(before: HarnessMetrics, after: HarnessMetrics): {
  attackSuccessReduced: boolean;
  benignPreserved: boolean;
} {
  return {
    attackSuccessReduced: after.attackSuccessRate < before.attackSuccessRate,
    benignPreserved: after.benignPassRate >= before.benignPassRate,
  };
}
