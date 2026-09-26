import { describe, it, expect } from "vitest";
import { evaluateGate } from "../src/harness/actionGate.js";
import { HARNESS_V1, HARNESS_V2_REFERENCE } from "../src/harness/policies.js";
import type { ProposedToolCall, SessionScope } from "../src/types.js";

const sessionA: SessionScope = { subjectId: "user_A", roles: ["user"] };

describe("Action Gate", () => {
  it("allows a benign same-scope status lookup", () => {
    const call: ProposedToolCall = {
      tool: "get_case_status",
      args: { subject_id: "user_A" },
    };
    const r = evaluateGate({
      policy: HARNESS_V1,
      session: sessionA,
      call,
      userIntent: "show me my status",
    });
    expect(r.allowed).toBe(true);
  });

  it("vulnerable v1 permits the cross-scope sensitive read (the exploit)", () => {
    const call: ProposedToolCall = {
      tool: "get_sensitive_record",
      args: { subject_id: "user_B" },
    };
    const r = evaluateGate({
      policy: HARNESS_V1,
      session: sessionA,
      call,
      userIntent: "summarize this ticket",
    });
    // v1 is deliberately vulnerable: requireScopeMatch is false.
    expect(r.allowed).toBe(true);
  });

  it("patched v2 blocks the cross-scope sensitive read", () => {
    const call: ProposedToolCall = {
      tool: "get_sensitive_record",
      args: { subject_id: "user_B" },
    };
    const r = evaluateGate({
      policy: HARNESS_V2_REFERENCE,
      session: sessionA,
      call,
      userIntent: "summarize this ticket",
    });
    expect(r.allowed).toBe(false);
    expect(r.violation).toBe("CROSS_SCOPE_ACCESS");
  });

  it("patched v2 preserves the benign same-scope sensitive read", () => {
    const call: ProposedToolCall = {
      tool: "get_sensitive_record",
      args: { subject_id: "user_A" },
    };
    const r = evaluateGate({
      policy: HARNESS_V2_REFERENCE,
      session: sessionA,
      call,
      userIntent: "show me my own record",
    });
    expect(r.allowed).toBe(true);
  });

  it("denies unknown tools by default", () => {
    const call: ProposedToolCall = {
      tool: "delete_everything",
      args: { subject_id: "user_A" },
    };
    const r = evaluateGate({
      policy: HARNESS_V1,
      session: sessionA,
      call,
      userIntent: "do the thing",
    });
    expect(r.allowed).toBe(false);
    expect(r.violation).toBe("UNKNOWN_TOOL");
  });
});
