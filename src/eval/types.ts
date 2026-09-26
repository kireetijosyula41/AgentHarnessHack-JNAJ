import type {
  EvaluationResult, GateResult, HarnessPolicy, PatchCandidate,
  ProposedToolCall, RegressionCase, SessionScope,
} from "../types";

/** One proposed tool call plus the gate's decision on it. */
export type EvaluatedToolCall = { call: ProposedToolCall; gate: GateResult };

/** A ground-truth invariant failure (only for calls the gate ALLOWED). */
export type InvariantViolation = {
  invariant: string;       // "INV-001" | "INV-002" | "INV-003" | ...
  violationType: string;   // "CROSS_SCOPE_ACCESS" | "UNTRUSTED_AUTHORIZATION" | "ACTION_LIMIT"
  toolCall: ProposedToolCall;
};

/** Normalized result of running one case, independent of which runtime produced it. */
export type EvalRun = {
  harnessVersion: number;
  toolCalls: EvaluatedToolCall[];
  invariantViolations: InvariantViolation[];
};

export type CaseRunner = (regCase: RegressionCase, harness: HarnessPolicy) => Promise<EvalRun>;
export type ApplyPatchFn = (base: HarnessPolicy, patch: PatchCandidate) => HarnessPolicy;
export type EvalDeps = { runCase: CaseRunner; applyPatch: ApplyPatchFn };

/** Mirrors Person 1's action-gate inputs (PLAN.md §8 Person 1 task 3). */
export type GateFn = (
  policy: HarnessPolicy, session: SessionScope, call: ProposedToolCall, userIntent: string,
) => GateResult;
export type InvariantFn = (
  session: SessionScope, call: ProposedToolCall, userIntent: string,
) => InvariantViolation[];

/** A RegressionCase with the tool calls a (compromised or benign) model would make. Used by the scripted runner. */
export type EvalFixture = RegressionCase & { scriptedToolCalls: ProposedToolCall[] };

export type CaseResult = {
  caseId: string;
  type: "attack" | "benign";
  heldOut: boolean;
  passed: boolean;              // benign: workflow succeeded; attack: attack was BLOCKED
  attempted: boolean;           // was a call to expected.tool proposed at all?
  actualAllowed: boolean | null; // gate decision on the first expected.tool call; null if not attempted
  actualViolation?: string;     // gate.violation on that call, if denied
  invariantViolations: string[]; // e.g. ["INV-001:CROSS_SCOPE_ACCESS"]
  error?: string;               // runner threw
};

/** Superset of the shared EvaluationResult. Safe to pass anywhere an EvaluationResult is expected. */
export type DetailedEvaluationResult = EvaluationResult & {
  harnessVersion: number;
  caseResults: CaseResult[];
  error?: string;               // e.g. patch failed to apply
};
