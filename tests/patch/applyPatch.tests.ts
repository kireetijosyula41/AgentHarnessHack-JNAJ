import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPatch,
  DuplicatePathError,
  InvalidPatchValueError,
  InvalidPolicyPathError,
  NoOpChangeError,
  OldValueMismatchError,
  UnknownToolError,
} from "../../src/antibody/index.ts";
import type { HarnessPolicy, PatchCandidate } from "../../src/types.ts";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** Baseline v1 harness — mirrors the INV-001 demo scenario from PLAN.md. */
function makeBaseHarness(): HarnessPolicy {
  return {
    version: 1,
    untrustedContentCanAuthorizeTools: true,
    toolRules: {
      get_sensitive_record: {
        requireScopeMatch: false,
        allowedRoles: ["support", "admin"],
      },
      get_case_status: {
        requireScopeMatch: true,
      },
      issue_credit: {
        maxAmount: 500,
      },
    },
  };
}

/** Minimal patch that flips requireScopeMatch on get_sensitive_record. */
function makeInv001Patch(): PatchCandidate {
  return {
    id: "patch_001",
    reason: "INV-001: bind subject identity to authenticated session scope",
    changes: [
      {
        path: "toolRules.get_sensitive_record.requireScopeMatch",
        oldValue: false,
        newValue: true,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. Applying requireScopeMatch false → true  (the INV-001 repair)
// ---------------------------------------------------------------------------

test("applies requireScopeMatch false → true on get_sensitive_record", () => {
  const result = applyPatch(makeBaseHarness(), makeInv001Patch());

  assert.equal(
    result.toolRules["get_sensitive_record"]?.requireScopeMatch,
    true,
  );
});

test("INV-001 repair: all other tool rules are preserved", () => {
  const result = applyPatch(makeBaseHarness(), makeInv001Patch());

  assert.equal(result.toolRules["get_case_status"]?.requireScopeMatch, true);
  assert.equal(result.toolRules["issue_credit"]?.maxAmount, 500);
});

test("INV-001 repair: harness version is preserved as-is", () => {
  const result = applyPatch(makeBaseHarness(), makeInv001Patch());
  assert.equal(result.version, 1);
});

// ---------------------------------------------------------------------------
// 2. Applying a valid top-level authorization change
// ---------------------------------------------------------------------------

test("applies untrustedContentCanAuthorizeTools true → false", () => {
  const patch: PatchCandidate = {
    id: "patch_002",
    reason: "INV-002: untrusted content must not authorize tools",
    changes: [
      {
        path: "untrustedContentCanAuthorizeTools",
        oldValue: true,
        newValue: false,
      },
    ],
  };

  const result = applyPatch(makeBaseHarness(), patch);
  assert.equal(result.untrustedContentCanAuthorizeTools, false);
});

// ---------------------------------------------------------------------------
// 3. Multiple valid changes applied in one patch
// ---------------------------------------------------------------------------

test("applies multiple valid changes atomically", () => {
  const patch: PatchCandidate = {
    id: "patch_003",
    reason: "harden scope and authorization together",
    changes: [
      {
        path: "toolRules.get_sensitive_record.requireScopeMatch",
        oldValue: false,
        newValue: true,
      },
      {
        path: "untrustedContentCanAuthorizeTools",
        oldValue: true,
        newValue: false,
      },
    ],
  };

  const result = applyPatch(makeBaseHarness(), patch);
  assert.equal(result.toolRules["get_sensitive_record"]?.requireScopeMatch, true);
  assert.equal(result.untrustedContentCanAuthorizeTools, false);
});

// ---------------------------------------------------------------------------
// 4. Original harness immutability
// ---------------------------------------------------------------------------

test("does not mutate the original harness object", () => {
  const harness = makeBaseHarness();
  const snapshot = JSON.stringify(harness);

  applyPatch(harness, makeInv001Patch());

  assert.equal(
    JSON.stringify(harness),
    snapshot,
    "original harness must not be mutated",
  );
});

test("result is a distinct object from the original harness", () => {
  const harness = makeBaseHarness();
  const result = applyPatch(harness, makeInv001Patch());

  assert.notEqual(result, harness);
  assert.notEqual(result.toolRules, harness.toolRules);
});

// ---------------------------------------------------------------------------
// 5. Nested array immutability (allowedRoles)
// ---------------------------------------------------------------------------

test("result allowedRoles is a distinct array copy, not the original reference", () => {
  const harness = makeBaseHarness();
  const result = applyPatch(harness, makeInv001Patch());

  const originalRoles = harness.toolRules["get_sensitive_record"]?.allowedRoles;
  const resultRoles = result.toolRules["get_sensitive_record"]?.allowedRoles;

  assert.ok(originalRoles !== undefined);
  assert.ok(resultRoles !== undefined);
  assert.notEqual(resultRoles, originalRoles, "allowedRoles must be a new array");
  assert.deepEqual(resultRoles, originalRoles, "allowedRoles values must be preserved");
});

test("mutating result allowedRoles does not affect the original harness", () => {
  const harness = makeBaseHarness();
  const result = applyPatch(harness, makeInv001Patch());

  result.toolRules["get_sensitive_record"]?.allowedRoles?.push("hacker");

  assert.deepEqual(
    harness.toolRules["get_sensitive_record"]?.allowedRoles,
    ["support", "admin"],
  );
});

test("applying a new allowedRoles value does not share array with the patch", () => {
  const harness = makeBaseHarness();
  const newRoles = ["manager"];
  const patch: PatchCandidate = {
    id: "patch_roles",
    reason: "restrict to manager only",
    changes: [
      {
        path: "toolRules.get_sensitive_record.allowedRoles",
        oldValue: ["support", "admin"],
        newValue: newRoles,
      },
    ],
  };

  const result = applyPatch(harness, patch);
  const resultRoles = result.toolRules["get_sensitive_record"]?.allowedRoles;

  assert.deepEqual(resultRoles, ["manager"]);

  // Mutate the patch's array — result must be unaffected.
  newRoles.push("attacker");
  assert.deepEqual(resultRoles, ["manager"]);
});

// ---------------------------------------------------------------------------
// 6. Patch immutability
// ---------------------------------------------------------------------------

test("does not mutate the PatchCandidate", () => {
  const patch = makeInv001Patch();
  const snapshot = JSON.stringify(patch);

  applyPatch(makeBaseHarness(), patch);

  assert.equal(JSON.stringify(patch), snapshot, "patch must not be mutated");
});

// ---------------------------------------------------------------------------
// 7. oldValue mismatch
// ---------------------------------------------------------------------------

test("throws OldValueMismatchError when oldValue does not match current harness", () => {
  const patch: PatchCandidate = {
    id: "patch_mismatch",
    reason: "wrong old value",
    changes: [
      {
        path: "toolRules.get_sensitive_record.requireScopeMatch",
        oldValue: true,   // current is false
        newValue: false,
      },
    ],
  };

  assert.throws(() => applyPatch(makeBaseHarness(), patch), OldValueMismatchError);
});

test("OldValueMismatchError message names the path", () => {
  const patch: PatchCandidate = {
    id: "patch_mismatch",
    reason: "wrong old value",
    changes: [
      {
        path: "toolRules.get_sensitive_record.requireScopeMatch",
        oldValue: true,
        newValue: false,
      },
    ],
  };

  let caught: unknown;
  try { applyPatch(makeBaseHarness(), patch); } catch (e) { caught = e; }

  assert.ok(caught instanceof OldValueMismatchError);
  assert.ok(
    (caught as OldValueMismatchError).message.includes(
      "toolRules.get_sensitive_record.requireScopeMatch",
    ),
  );
});

// ---------------------------------------------------------------------------
// 8. No-op change
// ---------------------------------------------------------------------------

test("throws NoOpChangeError when oldValue and newValue are identical", () => {
  const patch: PatchCandidate = {
    id: "patch_noop",
    reason: "no change",
    changes: [
      {
        path: "toolRules.get_sensitive_record.requireScopeMatch",
        oldValue: false,
        newValue: false,
      },
    ],
  };

  assert.throws(() => applyPatch(makeBaseHarness(), patch), NoOpChangeError);
});

test("throws NoOpChangeError for identical allowedRoles arrays", () => {
  const patch: PatchCandidate = {
    id: "patch_noop_roles",
    reason: "no change to roles",
    changes: [
      {
        path: "toolRules.get_sensitive_record.allowedRoles",
        oldValue: ["support", "admin"],
        newValue: ["support", "admin"],
      },
    ],
  };

  assert.throws(() => applyPatch(makeBaseHarness(), patch), NoOpChangeError);
});

// ---------------------------------------------------------------------------
// 9. Duplicate path
// ---------------------------------------------------------------------------

test("throws DuplicatePathError when the same path appears twice in one candidate", () => {
  const patch: PatchCandidate = {
    id: "patch_dup",
    reason: "duplicate change",
    changes: [
      {
        path: "toolRules.get_sensitive_record.requireScopeMatch",
        oldValue: false,
        newValue: true,
      },
      {
        path: "toolRules.get_sensitive_record.requireScopeMatch",
        oldValue: false,
        newValue: true,
      },
    ],
  };

  assert.throws(() => applyPatch(makeBaseHarness(), patch), DuplicatePathError);
});

test("DuplicatePathError message names the duplicated path", () => {
  const patch: PatchCandidate = {
    id: "patch_dup",
    reason: "duplicate change",
    changes: [
      {
        path: "toolRules.get_sensitive_record.requireScopeMatch",
        oldValue: false,
        newValue: true,
      },
      {
        path: "toolRules.get_sensitive_record.requireScopeMatch",
        oldValue: false,
        newValue: true,
      },
    ],
  };

  let caught: unknown;
  try { applyPatch(makeBaseHarness(), patch); } catch (e) { caught = e; }

  assert.ok(caught instanceof DuplicatePathError);
  assert.ok(
    (caught as DuplicatePathError).message.includes(
      "toolRules.get_sensitive_record.requireScopeMatch",
    ),
  );
});

// ---------------------------------------------------------------------------
// 10. Unknown tool
// ---------------------------------------------------------------------------

test("throws UnknownToolError when the path references a tool not in toolRules", () => {
  const patch: PatchCandidate = {
    id: "patch_unknown_tool",
    reason: "non-existent tool",
    changes: [
      {
        path: "toolRules.nonexistent_tool.requireScopeMatch",
        oldValue: false,
        newValue: true,
      },
    ],
  };

  assert.throws(() => applyPatch(makeBaseHarness(), patch), UnknownToolError);
});

// ---------------------------------------------------------------------------
// 11. Malformed path
// ---------------------------------------------------------------------------

test("throws InvalidPolicyPathError for a top-level unknown field", () => {
  const patch: PatchCandidate = {
    id: "patch_bad_path",
    reason: "bad path",
    changes: [{ path: "version", oldValue: 1, newValue: 2 }],
  };

  assert.throws(() => applyPatch(makeBaseHarness(), patch), InvalidPolicyPathError);
});

test("throws InvalidPolicyPathError for a path with wrong segment count", () => {
  const patch: PatchCandidate = {
    id: "patch_bad_path_2",
    reason: "bad path",
    changes: [
      {
        path: "toolRules.get_sensitive_record",
        oldValue: {},
        newValue: {},
      },
    ],
  };

  assert.throws(() => applyPatch(makeBaseHarness(), patch), InvalidPolicyPathError);
});

test("throws InvalidPolicyPathError for an unsupported tool-rule field", () => {
  const patch: PatchCandidate = {
    id: "patch_bad_field",
    reason: "unsupported field",
    changes: [
      {
        path: "toolRules.get_sensitive_record.unknownField",
        oldValue: null,
        newValue: true,
      },
    ],
  };

  assert.throws(() => applyPatch(makeBaseHarness(), patch), InvalidPolicyPathError);
});

// ---------------------------------------------------------------------------
// 12. Prototype-pollution attempt
// ---------------------------------------------------------------------------

test("throws InvalidPolicyPathError for a __proto__ path", () => {
  const patch: PatchCandidate = {
    id: "patch_proto",
    reason: "prototype pollution attempt",
    changes: [{ path: "__proto__", oldValue: null, newValue: null }],
  };

  assert.throws(() => applyPatch(makeBaseHarness(), patch), InvalidPolicyPathError);
});

test("throws InvalidPolicyPathError for toolRules.__proto__.requireScopeMatch", () => {
  const patch: PatchCandidate = {
    id: "patch_proto_2",
    reason: "prototype pollution attempt 2",
    changes: [
      {
        path: "toolRules.__proto__.requireScopeMatch",
        oldValue: false,
        newValue: true,
      },
    ],
  };

  assert.throws(() => applyPatch(makeBaseHarness(), patch), InvalidPolicyPathError);
});

test("throws InvalidPolicyPathError for constructor path", () => {
  const patch: PatchCandidate = {
    id: "patch_constructor",
    reason: "prototype pollution attempt 3",
    changes: [
      {
        path: "toolRules.get_sensitive_record.constructor",
        oldValue: null,
        newValue: null,
      },
    ],
  };

  assert.throws(() => applyPatch(makeBaseHarness(), patch), InvalidPolicyPathError);
});

// ---------------------------------------------------------------------------
// 13. Incorrect value type
// ---------------------------------------------------------------------------

test("throws InvalidPatchValueError when newValue has wrong type (string for boolean)", () => {
  const patch: PatchCandidate = {
    id: "patch_bad_type",
    reason: "wrong type",
    changes: [
      {
        path: "toolRules.get_sensitive_record.requireScopeMatch",
        oldValue: false,
        newValue: "true",   // string, not boolean
      },
    ],
  };

  assert.throws(() => applyPatch(makeBaseHarness(), patch), InvalidPatchValueError);
});

test("throws InvalidPatchValueError for non-finite maxAmount", () => {
  const patch: PatchCandidate = {
    id: "patch_bad_max",
    reason: "bad maxAmount",
    changes: [
      {
        path: "toolRules.issue_credit.maxAmount",
        oldValue: 500,
        newValue: Number.NaN,
      },
    ],
  };

  assert.throws(() => applyPatch(makeBaseHarness(), patch), InvalidPatchValueError);
});

test("throws InvalidPatchValueError for allowedRoles containing non-string", () => {
  const patch: PatchCandidate = {
    id: "patch_bad_roles",
    reason: "bad roles type",
    changes: [
      {
        path: "toolRules.get_sensitive_record.allowedRoles",
        oldValue: ["support", "admin"],
        newValue: ["support", 42],
      },
    ],
  };

  assert.throws(() => applyPatch(makeBaseHarness(), patch), InvalidPatchValueError);
});

// ---------------------------------------------------------------------------
// 14. Atomic rejection — second change invalid, first must NOT be applied
// ---------------------------------------------------------------------------

test("rejects the entire patch atomically when the second change is invalid", () => {
  const harness = makeBaseHarness();
  const snapshot = JSON.stringify(harness);

  const patch: PatchCandidate = {
    id: "patch_atomic",
    reason: "first change valid, second invalid",
    changes: [
      {
        // Valid change
        path: "toolRules.get_sensitive_record.requireScopeMatch",
        oldValue: false,
        newValue: true,
      },
      {
        // Invalid: wrong oldValue
        path: "untrustedContentCanAuthorizeTools",
        oldValue: false,   // current is true
        newValue: true,
      },
    ],
  };

  assert.throws(() => applyPatch(harness, patch), OldValueMismatchError);

  // Original harness must be completely unchanged.
  assert.equal(
    JSON.stringify(harness),
    snapshot,
    "harness must not be partially mutated after atomic rejection",
  );
});

test("rejects the entire patch atomically when the second change has wrong type", () => {
  const harness = makeBaseHarness();

  const patch: PatchCandidate = {
    id: "patch_atomic_type",
    reason: "first valid, second wrong type",
    changes: [
      {
        path: "toolRules.get_sensitive_record.requireScopeMatch",
        oldValue: false,
        newValue: true,
      },
      {
        path: "untrustedContentCanAuthorizeTools",
        oldValue: true,
        newValue: "false",  // wrong type
      },
    ],
  };

  assert.throws(() => applyPatch(harness, patch), InvalidPatchValueError);
  // First change must not have been applied.
  assert.equal(
    harness.toolRules["get_sensitive_record"]?.requireScopeMatch,
    false,
  );
});

// ---------------------------------------------------------------------------
// 15. Deterministic output
// ---------------------------------------------------------------------------

test("same inputs always produce equal output", () => {
  const result1 = applyPatch(makeBaseHarness(), makeInv001Patch());
  const result2 = applyPatch(makeBaseHarness(), makeInv001Patch());

  assert.deepEqual(result1, result2);
});

test("output is structurally equal regardless of call order", () => {
  const harness = makeBaseHarness();
  const patch = makeInv001Patch();

  const r1 = JSON.stringify(applyPatch(harness, patch));
  const r2 = JSON.stringify(applyPatch(harness, patch));

  assert.equal(r1, r2);
});
