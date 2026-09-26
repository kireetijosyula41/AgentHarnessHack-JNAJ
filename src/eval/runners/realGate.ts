import { evaluateGate } from "../../index.ts";
import type { GateFn } from "../types.ts";

/** Person 1's Action Gate in the scripted runner's GateFn shape. */
export const realGate: GateFn = (policy, session, call, userIntent) =>
  evaluateGate({ policy, session, call, userIntent });
