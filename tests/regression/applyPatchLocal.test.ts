import { applyPatchLocal } from "../../src/eval/mocks/applyPatchLocal";
import type { PatchCandidate } from "../../src/types";
import { harnessV1, patchMalformed, patchScopeMatch } from "../fixtures";

const single = (path: string, newValue: unknown = true): PatchCandidate => ({
  id: "t", reason: "t", changes: [{ path, oldValue: undefined, newValue }],
});

describe("applyPatchLocal", () => {
  it("applies patch_scope_match without mutating the base", () => {
    const before = JSON.stringify(harnessV1);
    expect(Object.isFrozen(harnessV1)).toBe(true);
    const next = applyPatchLocal(harnessV1, patchScopeMatch);
    expect(next.toolRules.get_sensitive_record!.requireScopeMatch).toBe(true);
    expect(next.version).toBe(harnessV1.version);
    expect(JSON.stringify(harnessV1)).toBe(before);
  });

  it("rejects __proto__ paths without polluting Object.prototype", () => {
    expect(() => applyPatchLocal(harnessV1, patchMalformed)).toThrow("invalid patch path: __proto__.polluted");
    expect((({}) as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each([
    "toolRules.nonexistent_tool.requireScopeMatch",
    "toolRules.get_case_status.bogusField",
    "version",
    "toolRules..x",
    "toolRules.get_case_status.constructor",
  ])("rejects %s", (path) => {
    expect(() => applyPatchLocal(harnessV1, single(path))).toThrow(`invalid patch path: ${path}`);
  });

  it("accepts the top-level untrustedContentCanAuthorizeTools flag", () => {
    expect(applyPatchLocal(harnessV1, single("untrustedContentCanAuthorizeTools", true))
      .untrustedContentCanAuthorizeTools).toBe(true);
  });

  it("is deterministic", () => {
    expect(applyPatchLocal(harnessV1, patchScopeMatch)).toEqual(applyPatchLocal(harnessV1, patchScopeMatch));
  });
});
