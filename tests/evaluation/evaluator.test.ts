import { vi } from "vitest";
import { evaluateCandidates, evaluateHarness } from "../../src/eval/index.ts";
import type { ApplyPatchFn, DetailedEvaluationResult, EvalDeps } from "../../src/eval/index.ts";
import { applyPatchLocal } from "../../src/eval/mocks/applyPatchLocal.ts";
import { realGate } from "../../src/eval/runners/realGate.ts";
import { oracle } from "../../src/eval/oracle.ts";
import { createScriptedRunner } from "../../src/eval/runners/scriptedRunner.ts";
import type { EvaluationResult } from "../../src/types.ts";
import { allCases, allPatches, harnessV1, heldOutAttacks } from "../fixtures/index.ts";

const mockDeps: EvalDeps = {
  runCase: createScriptedRunner({ gate: realGate, checkInvariants: oracle }),
  applyPatch: applyPatchLocal,
};

type Row = [known: string, benign: string, heldOut: string, size: number, valid: boolean];
const row = (r: DetailedEvaluationResult): Row => [
  `${r.knownAttacksPassed}/${r.knownAttacksTotal}`,
  `${r.benignPassed}/${r.benignTotal}`,
  `${r.heldOutPassed}/${r.heldOutTotal}`,
  r.patchSize,
  r.valid,
];

describe("evaluator oracle table (harness v1, real gate)", () => {
  const snapshot = structuredClone(harnessV1);
  let baseline: DetailedEvaluationResult;
  let results: DetailedEvaluationResult[];
  let byId: Map<string, DetailedEvaluationResult>;

  beforeAll(async () => {
    baseline = await evaluateHarness(harnessV1, allCases, mockDeps);
    results = await evaluateCandidates(harnessV1, allPatches, allCases, mockDeps);
    byId = new Map(results.map((r) => [r.patchId, r]));
  });

  it("baseline", () => {
    expect(baseline.patchId).toBe("baseline");
    expect(row(baseline)).toEqual(["2/3", "6/6", "1/2", 0, false]);
  });

  it.each<[string, Row]>([
    ["patch_scope_match",      ["3/3", "6/6", "2/2", 1, true]],
    ["patch_overbroad_roles",  ["3/3", "5/6", "2/2", 1, false]],
    ["patch_unrelated",        ["2/3", "6/6", "1/2", 1, false]],
    ["patch_scope_plus_roles", ["3/3", "6/6", "2/2", 2, true]],
    ["patch_malformed",        ["0/3", "0/6", "0/2", 1, false]],
    ["patch_empty",            ["2/3", "6/6", "1/2", 0, false]],
  ])("%s", (id, expected) => {
    expect(row(byId.get(id)!)).toEqual(expected);
  });

  it("patch_overbroad_roles breaks benign_sensitive_own with ROLE_NOT_PERMITTED", () => {
    const failed = byId.get("patch_overbroad_roles")!.caseResults.filter((c) => c.type === "benign" && !c.passed);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ caseId: "benign_sensitive_own", actualViolation: "ROLE_NOT_PERMITTED" });
  });

  it("patch_malformed reports an error, runs no cases and does not pollute prototypes", () => {
    const r = byId.get("patch_malformed")!;
    expect(r.error).toMatch(/invalid patch path/);
    expect(r.caseResults).toEqual([]);
    expect(r.harnessVersion).toBe(harnessV1.version);
    expect((({}) as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("returns results in input order", () => {
    expect(results.map((r) => r.patchId)).toEqual(allPatches.map((p) => p.id));
  });

  it("never mutates the base harness", () => {
    expect(harnessV1).toEqual(snapshot);
  });

  it("results are assignable to the shared EvaluationResult", () => {
    const r: EvaluationResult = results[0]!;
    expect(r.patchId).toBe("patch_scope_match");
  });

  it("leaves held-out fields undefined when the suite has no held-out cases", async () => {
    const r = await evaluateHarness(harnessV1, allCases.filter((c) => !c.heldOut), mockDeps);
    expect(r.heldOutPassed).toBeUndefined();
    expect(r.heldOutTotal).toBeUndefined();
  });

  it("only ever passes (harness, patch) to applyPatch — never held-out cases", async () => {
    const spy = vi.fn<ApplyPatchFn>(applyPatchLocal);
    await evaluateCandidates(harnessV1, allPatches, allCases, { ...mockDeps, applyPatch: spy });
    expect(spy).toHaveBeenCalledTimes(allPatches.length);
    spy.mock.calls.forEach((args, i) => {
      expect(args).toHaveLength(2);
      expect(args[0]).toBe(harnessV1);
      expect(args[1]).toBe(allPatches[i]);
      const serialized = JSON.stringify(args);
      for (const c of heldOutAttacks) expect(serialized).not.toContain(c.id);
    });
  });
});
