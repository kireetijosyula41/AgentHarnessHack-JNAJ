import { mockGate } from "../../src/eval/mocks/mockGate.ts";
import { mockInvariants } from "../../src/eval/mocks/mockInvariants.ts";
import { runRegressionSuite } from "../../src/eval/regressionRunner.ts";
import { createScriptedRunner } from "../../src/eval/runners/scriptedRunner.ts";
import type { CaseResult } from "../../src/eval/types.ts";
import type { RegressionCase } from "../../src/types.ts";
import { SESSION_A, allCases, benignCases, harnessV1 } from "../fixtures/index.ts";

const runCase = createScriptedRunner({ gate: mockGate, checkInvariants: mockInvariants });

describe("runRegressionSuite on harness v1 (oracle)", () => {
  let byId: Map<string, CaseResult>;
  beforeAll(async () => {
    const results = await runRegressionSuite(harnessV1, allCases, runCase);
    expect(results.map((r) => r.caseId)).toEqual(allCases.map((c) => c.id));
    byId = new Map(results.map((r) => [r.caseId, r]));
  });
  const get = (id: string) => byId.get(id)!;

  it("passes all benign workflows", () => {
    for (const c of benignCases) expect(get(c.id).passed, c.id).toBe(true);
  });

  it("lets atk_cross_scope_read through (the v1 exploit)", () => {
    expect(get("atk_cross_scope_read")).toMatchObject({
      passed: false, attempted: true, actualAllowed: true,
    });
    expect(get("atk_cross_scope_read").invariantViolations).toContain("INV-001:CROSS_SCOPE_ACCESS");
  });

  it("blocks atk_untrusted_credit on intent", () => {
    expect(get("atk_untrusted_credit")).toMatchObject({
      passed: true, actualAllowed: false, actualViolation: "UNTRUSTED_AUTHORIZATION",
    });
  });

  it("blocks atk_cross_scope_write on scope", () => {
    expect(get("atk_cross_scope_write")).toMatchObject({
      passed: true, actualAllowed: false, actualViolation: "CROSS_SCOPE_ACCESS",
    });
  });

  it("fails ho_cross_scope_read_variant and blocks ho_untrusted_update", () => {
    expect(get("ho_cross_scope_read_variant").passed).toBe(false);
    expect(get("ho_untrusted_update").passed).toBe(true);
  });

  it("records an error instead of throwing for a case with no scripted calls", async () => {
    const bare: RegressionCase = {
      id: "no_script", type: "benign", userIntent: "hi", untrustedContent: "",
      sessionScope: SESSION_A, expected: { allowed: true },
    };
    const [r] = await runRegressionSuite(harnessV1, [bare], runCase);
    expect(r).toMatchObject({ caseId: "no_script", passed: false, attempted: false, actualAllowed: null });
    expect(r!.error).toMatch(/no scriptedToolCalls/);
  });
});
