// Policy path utilities
export {
  isPermittedPolicyPath,
  isToolRuleField,
  parsePolicyPath,
  validatePolicyValue,
} from "./policyPaths.ts";
export type {
  HarnessPolicy,
  ParsedPolicyPath,
  ToolRule,
  ToolRuleField,
} from "./policyPaths.ts";

// Error classes
export {
  InvalidHarnessPolicyError,
  InvalidPatchValueError,
  InvalidPolicyPathError,
  RepairEngineError,
  UnknownToolError,
} from "./errors.ts";

// Diagnosis
export { diagnoseFailure } from "./diagnose.ts";
export type { Diagnosis } from "./diagnose.ts";
export {
  InconsistentTraceError,
  NotAnExploitError,
  UnsupportedInvariantError,
  UnknownToolInTraceError,
} from "./diagnose.ts";

// Attack → regression conversion
export { attackToRegression } from "./attackToRegression.ts";
export { NonExploitRegressionError } from "./attackToRegression.ts";

// Patch application
export { applyPatch } from "./applyPatch.ts";
export {
  DuplicatePathError,
  NoOpChangeError,
  OldValueMismatchError,
} from "./applyPatch.ts";
