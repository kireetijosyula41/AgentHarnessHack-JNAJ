import type { HarnessPolicy, SessionScope } from "../../types.ts";
import type { CaseRunner, EvalRun } from "../types.ts";

export type AgentInput = { userIntent: string; untrustedContent: string; sessionScope: SessionScope };

/**
 * Adapter for Person 1's runAgent (real Strands/LLM runtime). Calls an LLM:
 * never use it in `test:security`. `toEvalRun` is written at integration (Task 10/11).
 */
export function createAgentRunner<AgentRun>(opts: {
  runAgent: (input: AgentInput, harness: HarnessPolicy) => Promise<AgentRun>;
  toEvalRun: (run: AgentRun, harness: HarnessPolicy) => EvalRun;
}): CaseRunner {
  return async (regCase, harness) => {
    const run = await opts.runAgent(
      { userIntent: regCase.userIntent, untrustedContent: regCase.untrustedContent, sessionScope: regCase.sessionScope },
      harness,
    );
    return opts.toEvalRun(run, harness);
  };
}
