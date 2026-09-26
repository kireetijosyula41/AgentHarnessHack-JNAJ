/**
 * Apply a validated PatchCandidate to a HarnessPolicy, returning a new
 * immutable policy with the changes applied.
 *
 * Security contract (enforced before any mutation occurs):
 *
 *  1. All changes are validated before any are applied (atomic).
 *  2. Only paths approved by the policy-path whitelist are accepted.
 *  3. Malformed paths, unknown tools, unsupported fields, and wrong value
 *     types all throw before the harness is touched.
 *  4. Duplicate paths within one candidate are rejected.
 *  5. change.oldValue must exactly match the current harness value.
 *  6. No-op changes (oldValue deeply equal to newValue) are rejected.
 *  7. The original harness, its nested ToolRule objects, nested arrays, and
 *     the PatchCandidate are never mutated.
 *  8. All changes are applied atomically; a partially modified policy is
 *     never returned.
 *  9. Prototype pollution is blocked by parsePolicyPath.
 * 10. Every unrelated harness field is preserved unchanged.
 * 11. harness.version is NOT incremented here — that belongs to the
 *     persistence layer.
 * 12. Same inputs always produce the same output.
 *
 * Implementation note: values are written via an explicit field-specific
 * switch inside a typed setter. There is no eval, no dynamic key assignment
 * through unsanitised input, and no generic deep-set library.
 */

import type { HarnessPolicy, PatchCandidate, ToolRule } from "../types.ts";
import { RepairEngineError } from "./errors.ts";
import { parsePolicyPath, validatePolicyValue } from "./policyPaths.ts";
import type { ParsedPolicyPath, ToolRuleField } from "./policyPaths.ts";

// ---------------------------------------------------------------------------
// applyPatch-specific errors
// ---------------------------------------------------------------------------

/** Raised when change.oldValue does not match the current harness value. */
export class OldValueMismatchError extends RepairEngineError {
  constructor(path: string, expected: unknown, actual: unknown) {
    super(
      "OLD_VALUE_MISMATCH",
      `Patch change for "${path}": oldValue ${JSON.stringify(expected)} does not match ` +
        `current harness value ${JSON.stringify(actual)}`,
    );
    this.name = "OldValueMismatchError";
  }
}

/** Raised when oldValue and newValue are deeply equal (nothing would change). */
export class NoOpChangeError extends RepairEngineError {
  constructor(path: string) {
    super(
      "NOOP_CHANGE",
      `Patch change for "${path}" is a no-op: oldValue and newValue are identical`,
    );
    this.name = "NoOpChangeError";
  }
}

/** Raised when the same path appears more than once within a single candidate. */
export class DuplicatePathError extends RepairEngineError {
  constructor(path: string) {
    super(
      "DUPLICATE_PATH",
      `Patch candidate contains duplicate change for path "${path}"`,
    );
    this.name = "DuplicatePathError";
  }
}

// ---------------------------------------------------------------------------
// Deep equality — used only for primitive + array-of-primitive values that
// appear in ToolRule fields. A full recursive deep-equal is not needed here:
// policy values are booleans, strings, numbers, null, or string arrays.
// ---------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Reading the current value at a parsed policy path
// ---------------------------------------------------------------------------

function readCurrentValue(
  harness: HarnessPolicy,
  parsed: ParsedPolicyPath,
): unknown {
  if (parsed.kind === "topLevel") {
    return harness.untrustedContentCanAuthorizeTools;
  }

  // kind === "toolRule" — toolName is validated by parsePolicyPath
  const rule = harness.toolRules[parsed.toolName];
  if (rule === undefined) {
    // parsePolicyPath already guarantees the tool exists, so this is
    // unreachable in normal flow; kept as a safety net.
    return undefined;
  }

  // Explicit switch prevents dynamic key access on the ToolRule object.
  const field: ToolRuleField = parsed.field;
  switch (field) {
    case "requireScopeMatch":      return rule.requireScopeMatch;
    case "scopedArgument":         return rule.scopedArgument;
    case "requireExplicitIntent":  return rule.requireExplicitIntent;
    case "maxAmount":              return rule.maxAmount;
    case "allowedRoles":           return rule.allowedRoles;
  }
}

// ---------------------------------------------------------------------------
// Validated change descriptor (produced during the pre-flight pass)
// ---------------------------------------------------------------------------

type ValidatedChange =
  | {
      kind: "topLevel";
      field: "untrustedContentCanAuthorizeTools";
      newValue: boolean;
    }
  | {
      kind: "toolRule";
      toolName: string;
      field: ToolRuleField;
      newValue: unknown;
    };

// ---------------------------------------------------------------------------
// Pre-flight validation — validates ALL changes before applying ANY
// ---------------------------------------------------------------------------

function preflightChanges(
  harness: HarnessPolicy,
  patch: PatchCandidate,
): ValidatedChange[] {
  const seenPaths = new Set<string>();
  const validated: ValidatedChange[] = [];

  for (const change of patch.changes) {
    const { path, oldValue, newValue } = change;

    // 4. Duplicate path detection.
    if (seenPaths.has(path)) {
      throw new DuplicatePathError(path);
    }
    seenPaths.add(path);

    // 2 & 3. Whitelist check — throws InvalidPolicyPathError / UnknownToolError.
    const parsed = parsePolicyPath(path, harness);

    // 3. Value type check — throws InvalidPatchValueError.
    validatePolicyValue(parsed, newValue, path);

    // 5. oldValue must match current harness value.
    const current = readCurrentValue(harness, parsed);
    if (!deepEqual(oldValue, current)) {
      throw new OldValueMismatchError(path, oldValue, current);
    }

    // 6. Reject no-ops.
    if (deepEqual(oldValue, newValue)) {
      throw new NoOpChangeError(path);
    }

    // Collect validated change.
    if (parsed.kind === "topLevel") {
      validated.push({
        kind: "topLevel",
        field: "untrustedContentCanAuthorizeTools",
        newValue: newValue as boolean,
      });
    } else {
      validated.push({
        kind: "toolRule",
        toolName: parsed.toolName,
        field: parsed.field,
        newValue,
      });
    }
  }

  return validated;
}

// ---------------------------------------------------------------------------
// Immutable deep clone helpers
// ---------------------------------------------------------------------------

/** Clone a ToolRule, copying the allowedRoles array if present. */
function cloneToolRule(rule: ToolRule): ToolRule {
  const cloned: ToolRule = {};

  if (rule.requireScopeMatch !== undefined) {
    cloned.requireScopeMatch = rule.requireScopeMatch;
  }
  if (rule.scopedArgument !== undefined) {
    cloned.scopedArgument = rule.scopedArgument;
  }
  if (rule.requireExplicitIntent !== undefined) {
    cloned.requireExplicitIntent = rule.requireExplicitIntent;
  }
  if (rule.maxAmount !== undefined) {
    cloned.maxAmount = rule.maxAmount;
  }
  if (rule.allowedRoles !== undefined) {
    // New array — not a reference to the original.
    cloned.allowedRoles = [...rule.allowedRoles];
  }

  return cloned;
}

/** Clone the entire toolRules map, cloning each rule independently. */
function cloneToolRules(
  toolRules: Record<string, ToolRule>,
): Record<string, ToolRule> {
  const cloned: Record<string, ToolRule> = {};
  for (const [name, rule] of Object.entries(toolRules)) {
    cloned[name] = cloneToolRule(rule);
  }
  return cloned;
}

// ---------------------------------------------------------------------------
// Typed setter — applies a single ValidatedChange to a mutable working copy.
// Uses an explicit switch; no dynamic key assignment on unsanitised input.
// ---------------------------------------------------------------------------

function applyChange(
  working: HarnessPolicy,
  change: ValidatedChange,
): void {
  if (change.kind === "topLevel") {
    working.untrustedContentCanAuthorizeTools = change.newValue;
    return;
  }

  // kind === "toolRule"
  const rule = working.toolRules[change.toolName];
  if (rule === undefined) {
    // Unreachable after pre-flight; kept as a safety net.
    return;
  }

  const field: ToolRuleField = change.field;
  switch (field) {
    case "requireScopeMatch":
      rule.requireScopeMatch = change.newValue as boolean;
      break;
    case "scopedArgument":
      rule.scopedArgument = change.newValue as string;
      break;
    case "requireExplicitIntent":
      rule.requireExplicitIntent = change.newValue as boolean;
      break;
    case "maxAmount":
      rule.maxAmount = change.newValue as number | null;
      break;
    case "allowedRoles":
      // Copy the array — do not store a reference to the patch's array.
      rule.allowedRoles = [...(change.newValue as string[])];
      break;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a PatchCandidate to a HarnessPolicy, returning a new policy with the
 * changes applied.
 *
 * The original harness and the patch candidate are never modified.
 * harness.version is preserved as-is.
 *
 * @throws {InvalidPolicyPathError}    – malformed or disallowed path
 * @throws {UnknownToolError}          – path references a tool not in toolRules
 * @throws {InvalidPatchValueError}    – newValue has the wrong type
 * @throws {OldValueMismatchError}     – oldValue does not match current harness
 * @throws {NoOpChangeError}           – oldValue === newValue (nothing to do)
 * @throws {DuplicatePathError}        – same path appears twice in one candidate
 */
export function applyPatch(
  harness: HarnessPolicy,
  patch: PatchCandidate,
): HarnessPolicy {
  // Phase 1 — validate everything; throws on first violation.
  const validatedChanges = preflightChanges(harness, patch);

  // Phase 2 — build a deep clone of the harness to work on.
  // version is copied as-is (not incremented).
  const working: HarnessPolicy = {
    version: harness.version,
    untrustedContentCanAuthorizeTools: harness.untrustedContentCanAuthorizeTools,
    toolRules: cloneToolRules(harness.toolRules),
  };

  // Phase 3 — apply every validated change to the working copy.
  for (const change of validatedChanges) {
    applyChange(working, change);
  }

  return working;
}
