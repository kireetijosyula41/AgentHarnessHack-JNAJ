import {
  InvalidHarnessPolicyError,
  InvalidPatchValueError,
  InvalidPolicyPathError,
  UnknownToolError,
} from "./errors.ts";

export type ToolRule = {
  requireScopeMatch?: boolean;
  scopedArgument?: string;
  requireExplicitIntent?: boolean;
  maxAmount?: number | null;
  allowedRoles?: string[];
};

/** Local structural contract; the shared src/types.ts contract is not present yet. */
export type HarnessPolicy = {
  version?: number;
  untrustedContentCanAuthorizeTools: boolean;
  toolRules: Record<string, ToolRule>;
  [key: string]: unknown;
};

export type ToolRuleField =
  | "requireScopeMatch"
  | "scopedArgument"
  | "requireExplicitIntent"
  | "maxAmount"
  | "allowedRoles";

export type ParsedPolicyPath =
  | { kind: "topLevel"; field: "untrustedContentCanAuthorizeTools" }
  | { kind: "toolRule"; toolName: string; field: ToolRuleField };

const DANGEROUS_PROPERTY_NAMES = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const TOOL_RULE_FIELDS = new Set<ToolRuleField>([
  "requireScopeMatch",
  "scopedArgument",
  "requireExplicitIntent",
  "maxAmount",
  "allowedRoles",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

function rejectDangerousSegments(path: string, segments: string[]): void {
  if (segments.some((segment) => DANGEROUS_PROPERTY_NAMES.has(segment))) {
    throw new InvalidPolicyPathError(
      path,
      "Dangerous property names are not permitted",
    );
  }
}

/** Parse and authorize a policy path against the existing harness policy. */
export function parsePolicyPath(
  path: unknown,
  policy: HarnessPolicy,
): ParsedPolicyPath {
  if (typeof path !== "string" || path.length === 0) {
    throw new InvalidPolicyPathError(String(path));
  }

  const segments = path.split(".");
  rejectDangerousSegments(path, segments);

  if (
    segments.length === 1 &&
    segments[0] === "untrustedContentCanAuthorizeTools"
  ) {
    return { kind: "topLevel", field: segments[0] };
  }

  if (segments.length !== 3 || segments[0] !== "toolRules") {
    throw new InvalidPolicyPathError(path);
  }

  const [, toolName, field] = segments;
  if (!isRecord(policy.toolRules)) {
    throw new InvalidHarnessPolicyError("harness.toolRules must be an object");
  }
  if (!hasOwn(policy.toolRules, toolName)) {
    throw new UnknownToolError(toolName);
  }
  if (!TOOL_RULE_FIELDS.has(field as ToolRuleField)) {
    throw new InvalidPolicyPathError(path);
  }

  return {
    kind: "toolRule",
    toolName,
    field: field as ToolRuleField,
  };
}

/** Validate a patch value for a previously authorized policy path. */
export function validatePolicyValue(
  parsedPath: ParsedPolicyPath,
  value: unknown,
  path: string,
): void {
  const field = parsedPath.kind === "topLevel" ? parsedPath.field : parsedPath.field;

  if (field === "untrustedContentCanAuthorizeTools" || field === "requireScopeMatch" || field === "requireExplicitIntent") {
    if (typeof value !== "boolean") {
      throw new InvalidPatchValueError(path, "a boolean");
    }
    return;
  }

  if (field === "scopedArgument") {
    if (typeof value !== "string") {
      throw new InvalidPatchValueError(path, "a string");
    }
    return;
  }

  if (field === "maxAmount") {
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
      throw new InvalidPatchValueError(path, "a finite number or null");
    }
    return;
  }

  if (
    !Array.isArray(value) ||
    value.some((role) => typeof role !== "string")
  ) {
    throw new InvalidPatchValueError(path, "an array of strings");
  }
}

export function isPermittedPolicyPath(
  path: unknown,
  policy: HarnessPolicy,
): path is string {
  try {
    parsePolicyPath(path, policy);
    return true;
  } catch {
    return false;
  }
}

export function isToolRuleField(value: string): value is ToolRuleField {
  return TOOL_RULE_FIELDS.has(value as ToolRuleField);
}
