import { applyPatchLocal } from "./mocks/applyPatchLocal.ts";
import { oracle } from "./oracle.ts";
import { createOfflineAgentRunner } from "./runners/agentRunner.ts";
import { createHybridRunner } from "./runners/hybridRunner.ts";
import { realGate } from "./runners/realGate.ts";
import { createScriptedRunner } from "./runners/scriptedRunner.ts";
import type { EvalDeps } from "./types.ts";

// Deterministic by construction: scripted replays, else Person 1's offline planner.
// applyPatchLocal stays until Person 2's applyPatch lands on this branch.
export const defaultEvalDeps: EvalDeps = {
  runCase: createHybridRunner({
    scripted: createScriptedRunner({ gate: realGate, checkInvariants: oracle }),
    fallback: createOfflineAgentRunner(),
  }),
  applyPatch: applyPatchLocal,
};
