import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidPatchValueError,
  InvalidPolicyPathError,
  UnknownToolError,
  parsePolicyPath,
  validatePolicyValue,
  type HarnessPolicy,
} from "../../src/antibody/index.ts";

const policy: HarnessPolicy = {
  untrustedContentCanAuthorizeTools: false,
  toolRules: {
    get_sensitive_record: {},
  },
};

const allowedFields = [
  ["untrustedContentCanAuthorizeTools", true],
  ["toolRules.get_sensitive_record.requireScopeMatch", true],
  ["toolRules.get_sensitive_record.scopedArgument", "subject_id"],
  ["toolRules.get_sensitive_record.requireExplicitIntent", false],
  ["toolRules.get_sensitive_record.maxAmount", 10],
  ["toolRules.get_sensitive_record.allowedRoles", ["support"]],
] as const;

test("accepts every explicitly allowed field", () => {
  for (const [path, value] of allowedFields) {
    const parsed = parsePolicyPath(path, policy);
    assert.doesNotThrow(() => validatePolicyValue(parsed, value, path));
  }
});

test("rejects invalid top-level and segment shapes", () => {
  for (const path of [
    "version",
    "toolRules",
    "toolRules.get_sensitive_record",
    "toolRules.get_sensitive_record.requireScopeMatch.extra",
    "toolRules.get_sensitive_record.requireScopeMatch.",
  ]) {
    assert.throws(() => parsePolicyPath(path, policy), InvalidPolicyPathError);
  }
});

test("rejects invalid tool-rule paths and unknown tools", () => {
  assert.throws(
    () => parsePolicyPath("toolRules.get_sensitive_record.unknown", policy),
    InvalidPolicyPathError,
  );
  assert.throws(
    () => parsePolicyPath("toolRules.missing.requireScopeMatch", policy),
    UnknownToolError,
  );
});

test("rejects prototype-pollution paths", () => {
  for (const path of [
    "__proto__",
    "toolRules.__proto__.requireScopeMatch",
    "toolRules.get_sensitive_record.constructor",
    "toolRules.get_sensitive_record.prototype",
  ]) {
    assert.throws(() => parsePolicyPath(path, policy), InvalidPolicyPathError);
  }
});

test("rejects incorrect new-value types", () => {
  const invalidValues: Array<[string, unknown]> = [
    ["untrustedContentCanAuthorizeTools", "false"],
    ["toolRules.get_sensitive_record.requireScopeMatch", "true"],
    ["toolRules.get_sensitive_record.scopedArgument", 42],
    ["toolRules.get_sensitive_record.requireExplicitIntent", null],
    ["toolRules.get_sensitive_record.maxAmount", "10"],
    ["toolRules.get_sensitive_record.maxAmount", Number.NaN],
    ["toolRules.get_sensitive_record.allowedRoles", ["support", 1]],
  ];

  for (const [path, value] of invalidValues) {
    const parsed = parsePolicyPath(path, policy);
    assert.throws(
      () => validatePolicyValue(parsed, value, path),
      InvalidPatchValueError,
    );
  }
});
