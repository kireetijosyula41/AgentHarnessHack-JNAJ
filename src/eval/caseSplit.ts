import type { RegressionCase } from "../types.ts";

export function splitCases(cases: readonly RegressionCase[]): {
  known: RegressionCase[];    // type==="attack" && !heldOut
  benign: RegressionCase[];   // type==="benign"
  heldOut: RegressionCase[];  // type==="attack" && heldOut===true
} {
  return {
    known: cases.filter((c) => c.type === "attack" && c.heldOut !== true),
    benign: cases.filter((c) => c.type === "benign"),
    heldOut: cases.filter((c) => c.type === "attack" && c.heldOut === true),
  };
}

/** The ONLY cases Person 2 may put into patch-generation context. */
export function casesForPatchGeneration(cases: readonly RegressionCase[]): RegressionCase[] {
  return cases.filter((c) => c.heldOut !== true);
}

/** Throws if any case is held-out. Person 2 should call this on patch-generation input. */
export function assertNoHeldOut(cases: readonly RegressionCase[]): void {
  const leaked = cases.filter((c) => c.heldOut === true).map((c) => c.id);
  if (leaked.length > 0) {
    throw new Error(`held-out cases must not be used for patch generation: ${leaked.join(", ")}`);
  }
}
