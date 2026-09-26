import { runAgent } from "../../index.ts";
import type { AgentInput, AgentRun, HarnessPolicy } from "../../types.ts";
import { oracle } from "../oracle.ts";
import type { CaseRunner, EvalRun, InvariantFn } from "../types.ts";

/** Adapter for any runAgent-shaped runtime. `toEvalRun` normalizes its output for the judge. */
export function createAgentRunner<Run>(opts: {
  runAgent: (input: AgentInput, harness: HarnessPolicy) => Promise<Run>;
  toEvalRun: (run: Run, harness: HarnessPolicy) => EvalRun;
}): CaseRunner {
  return async (regCase, harness) => {
    const run = await opts.runAgent(
      { userIntent: regCase.userIntent, untrustedContent: regCase.untrustedContent, sessionScope: regCase.sessionScope },
      harness,
    );
    return opts.toEvalRun(run, harness);
  };
}

/** Normalizes Person 1's AgentRun. Violations come from the policy-independent oracle, not evaluateOutcome. */
export function agentRunToEvalRun(run: AgentRun, checkInvariants: InvariantFn = oracle): EvalRun {
  const { sessionScope, userIntent } = run.input;
  return {
    harnessVersion: run.harnessVersion,
    toolCalls: run.invocations.map((inv) => ({ call: inv.proposedToolCall, gate: inv.gateResult })),
    invariantViolations: run.invocations
      .filter((inv) => inv.gateResult.allowed)
      .flatMap((inv) => checkInvariants(sessionScope, inv.proposedToolCall, userIntent)),
  };
}

/** Person 1's runtime on its deterministic offline planner: no LLM, no API key. */
export function createOfflineAgentRunner(): CaseRunner {
  return createAgentRunner({
    runAgent: (input, harness) => runAgent(input, harness, { forceOffline: true }),
    toEvalRun: (run) => agentRunToEvalRun(run),
  });
}

/**
 * Person 1's runtime on the live model when OPENROUTER_API_KEY is set. Nondeterministic:
 * use it for the demo replay, never to decide `valid`.
 */
export function createLiveAgentRunner(): CaseRunner {
  return createAgentRunner({ runAgent, toEvalRun: (run) => agentRunToEvalRun(run) });
}
