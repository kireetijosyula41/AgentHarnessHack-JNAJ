/**
 * Gated tool wrappers (Person 1, task 2 + 6).
 *
 * These are the ONLY tools exposed to the Strands agent. Each wrapper:
 *   1. Builds a ProposedToolCall from the model's arguments.
 *   2. Runs it through the Action Gate against the ACTIVE harness + session.
 *   3. ALLOW → executes the raw mock tool and returns its output.
 *      DENY  → returns a structured security response; the raw tool never runs.
 *   4. Records the invocation (proposed call + gate result + output) so the
 *      runtime can assemble an AgentRun and evaluate invariants afterwards.
 *
 * Strands never receives a raw privileged function (steering S1).
 */
import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import type {
  GateResult,
  HarnessPolicy,
  ProposedToolCall,
  SessionScope,
  ToolInvocation,
} from "../types.js";
import { evaluateGate } from "../harness/actionGate.js";
import { MOCK_TOOLS, type MockToolName } from "./mockTools.js";

/**
 * Shared execution context for a single agent run. The gate reads the active
 * harness + session from here; the wrappers append each invocation.
 */
export type GatedContext = {
  policy: HarnessPolicy;
  session: SessionScope;
  userIntent: string;
  invocations: ToolInvocation[];
};

/** Run one proposed call through the gate + (if allowed) the raw tool. */
function runGated(
  ctx: GatedContext,
  call: ProposedToolCall,
): { gateResult: GateResult; output: string } {
  const gateResult = evaluateGate({
    policy: ctx.policy,
    session: ctx.session,
    call,
    userIntent: ctx.userIntent,
  });

  let output: string;
  if (gateResult.allowed) {
    const fn = MOCK_TOOLS[call.tool as MockToolName];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    output = (fn as (a: any) => string)(call.args);
  } else {
    output = `DENIED by harness v${ctx.policy.version}: ${gateResult.reason}`;
  }

  ctx.invocations.push({
    proposedToolCall: call,
    gateResult,
    toolOutput: gateResult.allowed ? output : undefined,
  });

  return { gateResult, output };
}

/**
 * Build the set of gated Strands tools bound to a given run context.
 * Called once per run so each run has its own invocation log.
 */
export function buildGatedTools(ctx: GatedContext) {
  const subject = z.string().describe("The subject id the action targets");

  const get_case_status = tool({
    name: "get_case_status",
    description: "Look up the non-sensitive status for a subject.",
    inputSchema: z.object({ subject_id: subject }),
    callback: (input) =>
      runGated(ctx, { tool: "get_case_status", args: input }).output,
  });

  const get_sensitive_record = tool({
    name: "get_sensitive_record",
    description:
      "Retrieve the sensitive record for a subject. Access is scope-controlled.",
    inputSchema: z.object({ subject_id: subject }),
    callback: (input) =>
      runGated(ctx, { tool: "get_sensitive_record", args: input }).output,
  });

  const update_case = tool({
    name: "update_case",
    description: "Update the status of a subject's case.",
    inputSchema: z.object({
      subject_id: subject,
      status: z.string().describe("The new status value"),
    }),
    callback: (input) =>
      runGated(ctx, { tool: "update_case", args: input }).output,
  });

  const issue_credit = tool({
    name: "issue_credit",
    description: "Issue a monetary credit to a subject.",
    inputSchema: z.object({
      subject_id: subject,
      amount: z.number().describe("The credit amount"),
    }),
    callback: (input) =>
      runGated(ctx, { tool: "issue_credit", args: input }).output,
  });

  const send_message = tool({
    name: "send_message",
    description: "Send an outbound message to a subject.",
    inputSchema: z.object({
      subject_id: subject,
      message: z.string().describe("The message body"),
    }),
    callback: (input) =>
      runGated(ctx, { tool: "send_message", args: input }).output,
  });

  return [
    get_case_status,
    get_sensitive_record,
    update_case,
    issue_credit,
    send_message,
  ];
}

/**
 * Directly execute a proposed tool call through the gate, bypassing the model.
 * Used by the deterministic (offline) runtime path and by fixtures. Records the
 * invocation into `ctx` exactly like the model-driven path.
 */
export function executeProposedCall(
  ctx: GatedContext,
  call: ProposedToolCall,
): { gateResult: GateResult; output: string } {
  return runGated(ctx, call);
}
