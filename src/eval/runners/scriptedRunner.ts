import type { CaseRunner, EvalFixture, EvaluatedToolCall, GateFn, InvariantFn, InvariantViolation } from "../types";

/** Deterministic runner: replays the case's scriptedToolCalls through the gate, then checks invariants on allowed calls. */
export function createScriptedRunner(opts: { gate: GateFn; checkInvariants: InvariantFn }): CaseRunner {
  return async (regCase, harness) => {
    const calls = (regCase as Partial<EvalFixture>).scriptedToolCalls;
    if (!calls || calls.length === 0) {
      throw new Error(`case ${regCase.id} has no scriptedToolCalls; use the agent runner`);
    }
    const toolCalls: EvaluatedToolCall[] = [];
    const invariantViolations: InvariantViolation[] = [];
    for (const call of calls) {
      const gate = opts.gate(harness, regCase.sessionScope, call, regCase.userIntent);
      toolCalls.push({ call, gate });
      if (gate.allowed) {
        invariantViolations.push(...opts.checkInvariants(regCase.sessionScope, call, regCase.userIntent));
      }
    }
    return { harnessVersion: harness.version, toolCalls, invariantViolations };
  };
}
