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

// Patch generation
export { generatePatchCandidates } from "./generatePatches.ts";
export { AlreadyRepairedError } from "./generatePatches.ts";

// Patch selection
export { selectPatch } from "./selectPatch.ts";
export type { SelectionResult } from "./selectPatch.ts";
export {
  DuplicateCandidateError,
  DuplicateEvaluationError,
  InconsistentEvaluationError,
  MissingEvaluationError,
  NoValidPatchError,
} from "./selectPatch.ts";
