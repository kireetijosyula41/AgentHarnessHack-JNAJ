/**
 * Action Gate (Person 1, task 3).
 *
 * The single deterministic authorization point. Every privileged tool call the
 * agent proposes must pass through `evaluateGate` before the tool runs. The gate
 * takes the active HarnessPolicy, the authenticated SessionScope, the proposed
 * tool call, and the original user intent, and returns a GateResult.
 *
 * Steering rules enforced here:
 *   S1  Model proposes actions; harness authorizes them.
 *   S2  Untrusted content cannot change session identity/scope.
 *
 * The gate is pure and side-effect free. It NEVER trusts arguments to redefine
 * the session — the session identity is passed in from the authenticated caller,
 * not read from the model's tool arguments.
 */
import type {
  GateResult,
  HarnessPolicy,
  ProposedToolCall,
  SessionScope,
} from "../types.js";
import { checkInvariants } from "./invariants.js";

export type GateInput = {
  policy: HarnessPolicy;
  session: SessionScope;
  call: ProposedToolCall;
  userIntent: string;
};

export function evaluateGate(input: GateInput): GateResult {
  const { policy, session, call, userIntent } = input;

  const rule = policy.toolRules[call.tool];

  // Unknown tool: deny by default. The harness only authorizes tools it knows.
  if (!rule) {
    return {
      allowed: false,
      violation: "UNKNOWN_TOOL",
      reason: `tool "${call.tool}" is not present in the active harness policy`,
    };
  }

  // Role check: if the rule restricts roles, the session must hold one.
  if (rule.allowedRoles && rule.allowedRoles.length > 0) {
    const hasRole = rule.allowedRoles.some((r) => session.roles.includes(r));
    if (!hasRole) {
      return {
        allowed: false,
        violation: "ROLE_NOT_PERMITTED",
        reason: `session roles [${session.roles.join(
          ", ",
        )}] lack any of the allowed roles [${rule.allowedRoles.join(", ")}] for "${call.tool}"`,
      };
    }
  }

  // Deterministic security invariants (INV-001 mandatory, others stretch).
  const violation = checkInvariants(policy, session, call, userIntent);
  if (violation) {
    return {
      allowed: false,
      violation: violation.violationType,
      reason: `${violation.invariant}: ${violation.reason}`,
    };
  }

  return {
    allowed: true,
    reason: `authorized by harness v${policy.version} for "${call.tool}"`,
  };
}
