import { applyPatchLocal } from "./mocks/applyPatchLocal";
import { mockGate } from "./mocks/mockGate";
import { mockInvariants } from "./mocks/mockInvariants";
import { createScriptedRunner } from "./runners/scriptedRunner";
import type { EvalDeps } from "./types";

// Phase 1: mocks. At integration swap to Person 1's gate/invariants and Person 2's applyPatch (Task 11).
export const defaultEvalDeps: EvalDeps = {
  runCase: createScriptedRunner({ gate: mockGate, checkInvariants: mockInvariants }),
  applyPatch: applyPatchLocal,
};
