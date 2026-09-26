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

  toolRules: Record<
    string,
    {
      requireScopeMatch?: boolean;
      scopedArgument?: string;
      requireExplicitIntent?: boolean;
      maxAmount?: number | null;
      allowedRoles?: string[];
    }
  >;
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
};

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

export type PatchCandidate = {
  id: string;
  reason: string;

  changes: Array<{
    path: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
};

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
