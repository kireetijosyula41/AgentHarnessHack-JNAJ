import { applyPatchLocal } from "./mocks/applyPatchLocal.ts";
import { mockGate } from "./mocks/mockGate.ts";
import { mockInvariants } from "./mocks/mockInvariants.ts";
import { createScriptedRunner } from "./runners/scriptedRunner.ts";
import type { EvalDeps } from "./types.ts";

// Phase 1: mocks. At integration swap to Person 1's gate/invariants and Person 2's applyPatch (Task 11).
export const defaultEvalDeps: EvalDeps = {
  runCase: createScriptedRunner({ gate: mockGate, checkInvariants: mockInvariants }),
  applyPatch: applyPatchLocal,
};
