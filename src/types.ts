/**
 * Antibody — shared contracts.
 *
 * FROZEN in the first 20 minutes (see PLAN.md §7). After that, changes here
 * must be announced to all four owners.
 *
 * Ownership of additions:
 *  - Person 1 (runtime): AgentInput, ToolInvocation, AgentRun, InvariantResult
 *  - Person 2 (repair):  PatchCandidate, EvaluationResult (consumes)
 *  - Person 3 (eval):    EvaluationResult (produces)
 *  - Person 4 (control): HarnessVersion, DeploymentState, AgentRunRecord,
 *                        RuntimeResult, LineageNode
 *
 * NOTE ON NAMING: Person 4's persisted "agent run" record was originally also
 * named AgentRun, which collided with Person 1's runtime AgentRun (a different
 * shape). During integration it was renamed AgentRunRecord to keep both.
 */

/** A tool call the model wants to make. Proposed — not yet authorized. */
export type ProposedToolCall = {
  tool: string;
  args: Record<string, unknown>;
  reason?: string;
};

/** The authenticated identity/authority of the current session. */
export type SessionScope = {
  subjectId: string;
  roles: string[];
};

/** Per-tool authority rules the Action Gate enforces deterministically. */
export type ToolRule = {
  /** Require the scoped argument to match the authenticated subject. */
  requireScopeMatch?: boolean;
  /** Which argument carries the subject identity (default: "subject_id"). */
  scopedArgument?: string;
  /** Require the human's original intent to reference this action. */
  requireExplicitIntent?: boolean;
  /** Max numeric amount for value-moving tools (null = unbounded). */
  maxAmount?: number | null;
  /** Roles permitted to invoke this tool (empty/undefined = any). */
  allowedRoles?: string[];
};

/**
 * The typed, mutable capability boundary. This — not prompt wording — is what
 * Antibody repairs. Only whitelisted fields inside toolRules may be patched.
 */
export type HarnessPolicy = {
  version: number;
  /** Global switch: may untrusted content authorize privileged tools? */
  untrustedContentCanAuthorizeTools: boolean;
  toolRules: Record<string, ToolRule>;
};

/** The Action Gate's verdict on a single proposed tool call. */
export type GateResult = {
  allowed: boolean;
  /** Violation type constant (e.g. CROSS_SCOPE_ACCESS) when denied. */
  violation?: string;
  reason: string;
};

/** A captured record of an attack that crossed the capability boundary. */
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

  /** Set by the persistence layer (Person 4). */
  createdAt?: string;
};

/** A permanent, executable regression derived from an attack or a benign flow. */
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

/** A typed, minimal patch to the harness policy. */
export type PatchCandidate = {
  id: string;
  reason: string;

  changes: Array<{
    path: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
};

/**
 * The result of evaluating one patch candidate against the suites.
 *
 * id / baseHarnessVersion / createdAt are set by the persistence layer
 * (Person 4) and are optional so Person 2's selector and Person 3's evaluator
 * can construct in-memory results without them. Held-out counts are optional
 * (Person 2 treats them as tie-break-only; Person 4 always populates them).
 */
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

  /** Persistence-layer fields (Person 4). */
  id?: string;
  baseHarnessVersion?: number;
  createdAt?: string;
};

// ---------------------------------------------------------------------------
// Person 1 runtime-facing types (referenced by PLAN.md §8, task 6).
// Shapes returned by runAgent(...) / evaluateOutcome(...).
// ---------------------------------------------------------------------------

/** The input to a single agent run. */
export type AgentInput = {
  userIntent: string;
  untrustedContent?: string;
  sessionScope: SessionScope;
};

/** A single gated tool invocation observed during a run. */
export type ToolInvocation = {
  proposedToolCall: ProposedToolCall;
  gateResult: GateResult;
  toolOutput?: unknown;
};

/** The full observable outcome of one agent run (Person 1 runtime). */
export type AgentRun = {
  input: AgentInput;
  harnessVersion: number;
  invocations: ToolInvocation[];
  finalResponse?: string;
  usedModel: boolean;
};

/** The outcome of checking a single invariant against a run. */
export type InvariantResult = {
  invariant: string;
  violationType?: string;
  violated: boolean;
  outcome: "successful_exploit" | "blocked" | "clean";
  invocation?: ToolInvocation;
  detail: string;
};

// ---------------------------------------------------------------------------
// Person 4 control-plane / persistence types.
// ---------------------------------------------------------------------------

/** An immutable, stored harness version with lineage metadata. */
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

/** The global deployment pointer (active + previous harness versions). */
export type DeploymentState = {
  id: "global";
  activeHarnessVersion: number;
  previousHarnessVersion: number | null;
  updatedAt: string;
};

/** A persisted record of one agent run or replay (Person 4 DB record). */
export type AgentRunRecord = {
  id: string;
  kind: "run" | "replay";
  harnessVersion: number;
  result: RuntimeResult;
  createdAt: string;
};

/** The compact runtime outcome the control plane displays and stores. */
export type RuntimeResult = {
  harnessVersion: number;
  proposedToolCall: ProposedToolCall;
  gateResult: GateResult;
  failedInvariant?: string;
  outcome: "safe" | "successful_exploit" | "blocked";
  attackId?: string;
};

/** One node in the harness lineage graph shown in the UI. */
export type LineageNode = {
  harness: HarnessVersion;
  attack?: AttackTrace;
  evaluation?: EvaluationResult;
};
