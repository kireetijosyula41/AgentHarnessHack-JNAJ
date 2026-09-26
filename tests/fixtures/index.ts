import type { EvalFixture } from "../../src/eval/types.ts";
import { benignCases as rawBenign } from "./benignCases.ts";
import { harnessV1 as rawHarnessV1 } from "./harnessV1.ts";
import { heldOutAttacks as rawHeldOut } from "./heldOutAttacks.ts";
import { knownAttacks as rawKnown } from "./knownAttacks.ts";
import * as rawPatches from "./patchCandidates.ts";
import { SESSION_A as rawSessionA } from "./session.ts";

export function deepFreeze<T>(x: T): T {
  if (x !== null && typeof x === "object" && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}

export const SESSION_A = deepFreeze(rawSessionA);
export const harnessV1 = deepFreeze(rawHarnessV1);
export const benignCases = deepFreeze(rawBenign);
export const knownAttacks = deepFreeze(rawKnown);
export const heldOutAttacks = deepFreeze(rawHeldOut);

export const patchScopeMatch = deepFreeze(rawPatches.patchScopeMatch);
export const patchOverbroadRoles = deepFreeze(rawPatches.patchOverbroadRoles);
export const patchUnrelated = deepFreeze(rawPatches.patchUnrelated);
export const patchScopePlusRoles = deepFreeze(rawPatches.patchScopePlusRoles);
export const patchMalformed = deepFreeze(rawPatches.patchMalformed);
export const patchEmpty = deepFreeze(rawPatches.patchEmpty);
export const allPatches = deepFreeze(rawPatches.allPatches);

export const allCases: readonly EvalFixture[] = deepFreeze([...benignCases, ...knownAttacks, ...heldOutAttacks]);
