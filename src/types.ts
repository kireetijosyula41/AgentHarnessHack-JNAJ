/**
 * Canonical shared contracts for Antibody.
 * All sub-systems import from here. Do not redefine these types locally.
 */

// ---------------------------------------------------------------------------
// Runtime contracts (Person 1 / Person 2 shared surface)
// ---------------------------------------------------------------------------

export type ProposedToolCall = {
  tool: string;
  args: Record<string, unknown>;
  reason?: string;
};

export type SessionScope = {
  subjectId: string;
  roles: string[];
};

export type GateResult = {
  allowed: boolean;
  violation?: string;
  reason: string;
};

// ---------------------------------------------------------------------------
// Harness policy (Person 1 / Person 2 shared surface)
// ---------------------------------------------------------------------------

export type ToolRule = {
  requireScopeMatch?: boolean;
  scopedArgument?: string;
  requireExplicitIntent?: boolean;
  maxAmount?: number | null;
  allowedRoles?: string[];
};

export type HarnessPolicy = {
  version: number;
  untrustedContentCanAuthorizeTools: boolean;
  toolRules: Record<string, ToolRule>;
};

// ---------------------------------------------------------------------------
// Attack trace (produced by Person 1's outcome checker)
// ---------------------------------------------------------------------------

export type AttackTrace = {
  id: string;
  harnessVersion: number;

  userIntent: string;
  untrustedContent: string;

  sessionScope: SessionScope;
  proposedToolCall: ProposedToolCall;

  gateResult: GateResult;

  failedInvariant: string;
  violationType: string;

  outcome: "successful_exploit" | "blocked";
};

// ---------------------------------------------------------------------------
// Regression case (produced by Person 2, run by Person 3)
// ---------------------------------------------------------------------------

export type RegressionCase = {
  id: string;
  type: "attack" | "benign";

  userIntent: string;
  untrustedContent: string;
  sessionScope: SessionScope;

  expected: {
    allowed: boolean;
    tool?: string;
    violation?: string;
  };

  sourceAttackId?: string;
  heldOut?: boolean;
};

// ---------------------------------------------------------------------------
// Patch contracts (Person 2)
// ---------------------------------------------------------------------------

export type PatchCandidate = {
  id: string;
  reason: string;

  changes: Array<{
    path: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
};

// ---------------------------------------------------------------------------
// Evaluation result (produced by Person 3, consumed by Person 2)
// ---------------------------------------------------------------------------

export type EvaluationResult = {
  patchId: string;

  knownAttacksPassed: number;
  knownAttacksTotal: number;

  benignPassed: number;
  benignTotal: number;

  heldOutPassed?: number;
  heldOutTotal?: number;

  patchSize: number;
  valid: boolean;
};
