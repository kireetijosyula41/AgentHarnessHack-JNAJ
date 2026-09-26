import type { AttackTrace, RegressionCase } from "../types.ts";
import type { EvalFixture } from "./types.ts";

/**
 * Pins a regression to the exact tool call from its source trace, so it replays
 * deterministically even if the offline planner can't reproduce a live exploit.
 */
export function withReplay(regCase: RegressionCase, trace: AttackTrace): EvalFixture {
  if (regCase.sourceAttackId !== undefined && regCase.sourceAttackId !== trace.id) {
    throw new Error(`case ${regCase.id} comes from ${regCase.sourceAttackId}, not trace ${trace.id}`);
  }
  return { ...regCase, scriptedToolCalls: [structuredClone(trace.proposedToolCall)] };
}
