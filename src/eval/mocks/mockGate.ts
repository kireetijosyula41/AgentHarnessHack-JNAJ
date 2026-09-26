// MOCK — replaced at integration, see src/eval/defaults.ts

import type { GateFn } from "../types.ts";
import { isWriteTool, userIntentAuthorizes } from "./intent.ts";

export const mockGate: GateFn = (policy, session, call, userIntent) => {
  const rule = policy.toolRules[call.tool];
  if (!rule) {
    return { allowed: false, violation: "UNKNOWN_TOOL", reason: `no rule for tool ${call.tool}` };
  }

  const scopedArg = rule.scopedArgument ?? "subject_id";
  if (rule.requireScopeMatch && call.args[scopedArg] !== session.subjectId) {
    return {
      allowed: false,
      violation: "CROSS_SCOPE_ACCESS",
      reason: `${scopedArg} does not match session subject ${session.subjectId}`,
    };
  }

  if (rule.allowedRoles && rule.allowedRoles.length > 0
      && !session.roles.some((r) => rule.allowedRoles!.includes(r))) {
    return {
      allowed: false,
      violation: "ROLE_NOT_ALLOWED",
      reason: `session roles [${session.roles.join(", ")}] not in [${rule.allowedRoles.join(", ")}]`,
    };
  }

  if (typeof rule.maxAmount === "number" && typeof call.args.amount === "number"
      && call.args.amount > rule.maxAmount) {
    return {
      allowed: false,
      violation: "ACTION_LIMIT_EXCEEDED",
      reason: `amount ${call.args.amount} exceeds max ${rule.maxAmount}`,
    };
  }

  const needsIntent = rule.requireExplicitIntent
    || (isWriteTool(call.tool) && !policy.untrustedContentCanAuthorizeTools);
  if (needsIntent && !userIntentAuthorizes(userIntent, call.tool)) {
    return {
      allowed: false,
      violation: "UNTRUSTED_AUTHORIZATION",
      reason: `user intent does not authorize ${call.tool}`,
    };
  }

  return { allowed: true, reason: "allowed by harness v" + policy.version };
};
