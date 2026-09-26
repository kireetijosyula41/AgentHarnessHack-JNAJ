/**
 * Antibody — shared contracts.
 *
 * FROZEN in the first 20 minutes (see PLAN.md §7). After that, changes here
 * must be announced to all four owners. Person 1 owns the runtime-facing
 * additions at the bottom of this file (AgentRun, InvariantResult); the core
 * contracts above are shared verbatim with the plan and consumed by Person 2
 * (repair engine) and Person 3 (evaluation engine).
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

/** The result of evaluating one patch candidate against the suites. */
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

// ---------------------------------------------------------------------------
// Person 1 runtime-facing types (referenced by PLAN.md §8, tasks 6).
// These are the shapes returned by runAgent(...) / evaluateOutcome(...).
// ---------------------------------------------------------------------------

/** The input to a single agent run. */
export type AgentInput = {
  /** The authenticated human's request. */
  userIntent: string;
  /** Untrusted content pulled into context (ticket body, document, etc.). */
  untrustedContent?: string;
  /** The authenticated session identity/authority. */
  sessionScope: SessionScope;
};

/** A single gated tool invocation observed during a run. */
export type ToolInvocation = {
  proposedToolCall: ProposedToolCall;
  gateResult: GateResult;
  /** Present only when the gate allowed the call and the tool ran. */
  toolOutput?: unknown;
};

/** The full observable outcome of one agent run. */
export type AgentRun = {
  input: AgentInput;
  harnessVersion: number;
  /** Every gated tool call the agent proposed, in order. */
  invocations: ToolInvocation[];
  /** The model's final natural-language answer, if any. */
  finalResponse?: string;
  /** True if the run reached the model at all (false when running offline). */
  usedModel: boolean;
};

/** The outcome of checking a single invariant against a run. */
export type InvariantResult = {
  invariant: string;
  violationType?: string;
  /** True when the invariant was violated by a successful (allowed) action. */
  violated: boolean;
  outcome: "successful_exploit" | "blocked" | "clean";
  /** The offending invocation, when violated. */
  invocation?: ToolInvocation;
  detail: string;
};
