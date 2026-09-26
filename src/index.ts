/**
 * Person 1 public surface — the runtime + harness contract other subsystems
 * import. Person 2/3/4 should depend on these exports, not on internal files.
 */

// Shared contracts.
export * from "./types.js";

// Runtime (Person 1 primary interface).
export {
  runAgent,
  evaluateOutcome,
  hasSuccessfulExploit,
  toAttackTrace,
  type RunOptions,
} from "./agent/strandsAgent.js";

// Harness policies + Action Gate + invariants.
export {
  HARNESS_V1,
  HARNESS_V2_REFERENCE,
  cloneHarness,
} from "./harness/policies.js";
export { evaluateGate, type GateInput } from "./harness/actionGate.js";
export {
  INV,
  VIOLATION,
  checkInvariants,
  checkScopeIsolation,
  checkAuthorizationProvenance,
  checkActionLimit,
  scopedArgumentFor,
  requestedSubjectId,
  type InvariantCheck,
} from "./harness/invariants.js";

// Tools (mostly internal, exposed for fixtures/tests).
export { MOCK_TOOLS, __resetMockDb, type MockToolName } from "./tools/mockTools.js";
export {
  buildGatedTools,
  executeProposedCall,
  type GatedContext,
} from "./tools/gatedTools.js";
