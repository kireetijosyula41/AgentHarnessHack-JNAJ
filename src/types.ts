export type ProposedToolCall = {
  tool: string;
  args: Record<string, unknown>;
  reason?: string;
};

export type SessionScope = {
  subjectId: string;
  roles: string[];
};

export type HarnessPolicy = {
  version: number;
  untrustedContentCanAuthorizeTools: boolean;
  toolRules: Record<string, {
    requireScopeMatch?: boolean;
    scopedArgument?: string;
    requireExplicitIntent?: boolean;
    maxAmount?: number | null;
    allowedRoles?: string[];
  }>;
};

export type GateResult = {
  allowed: boolean;
  violation?: string;
  reason: string;
};

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
  createdAt?: string;
};

export type RegressionCase = {
  id: string;
  type: "attack" | "benign";
  userIntent: string;
  untrustedContent: string;
  sessionScope: SessionScope;
  expected: { allowed: boolean; tool?: string; violation?: string };
  sourceAttackId?: string;
  heldOut?: boolean;
};

export type PatchCandidate = {
  id: string;
  reason: string;
  changes: Array<{ path: string; oldValue: unknown; newValue: unknown }>;
};

export type EvaluationResult = {
  id: string;
  patchId: string;
  baseHarnessVersion: number;
  knownAttacksPassed: number;
  knownAttacksTotal: number;
  benignPassed: number;
  benignTotal: number;
  heldOutPassed: number;
  heldOutTotal: number;
  patchSize: number;
  valid: boolean;
  createdAt?: string;
};

export type HarnessVersion = {
  id: string;
  version: number;
  parentVersion: number | null;
  status: "active" | "superseded";
  policy: HarnessPolicy;
  createdFromAttackId?: string;
  selectedPatchId?: string;
  evaluationRunId?: string;
  createdAt: string;
};

export type DeploymentState = {
  id: "global";
  activeHarnessVersion: number;
  previousHarnessVersion: number | null;
  updatedAt: string;
};

export type AgentRun = {
  id: string;
  kind: "run" | "replay";
  harnessVersion: number;
  result: RuntimeResult;
  createdAt: string;
};

export type RuntimeResult = {
  harnessVersion: number;
  proposedToolCall: ProposedToolCall;
  gateResult: GateResult;
  failedInvariant?: string;
  outcome: "safe" | "successful_exploit" | "blocked";
  attackId?: string;
};

export type LineageNode = {
  harness: HarnessVersion;
  attack?: AttackTrace;
  evaluation?: EvaluationResult;
};
