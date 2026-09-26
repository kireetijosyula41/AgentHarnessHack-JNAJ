import { createAgentRunner, runRegressionSuite } from "../../src/eval/index.ts";
import type { AgentInput, EvalRun } from "../../src/eval/index.ts";
import { mockGate } from "../../src/eval/mocks/mockGate.ts";
import { mockInvariants } from "../../src/eval/mocks/mockInvariants.ts";
import type { HarnessPolicy, ProposedToolCall } from "../../src/types.ts";
import { allCases, harnessV1 } from "../fixtures/index.ts";

// Fake runAgent: a "model" that obeys whatever untrusted content asks for. No LLM involved.
type FakeAgentRun = { input: AgentInput; calls: ProposedToolCall[] };

const scriptByIntent = new Map(allCases.map((c) => [c.userIntent + "\u0000" + c.untrustedContent, c.scriptedToolCalls]));

const fakeRunAgent = async (input: AgentInput, _harness: HarnessPolicy): Promise<FakeAgentRun> => ({
  input,
  calls: [...(scriptByIntent.get(input.userIntent + "\u0000" + input.untrustedContent) ?? [])],
});

const toEvalRun = (run: FakeAgentRun, harness: HarnessPolicy): EvalRun => {
  const toolCalls = run.calls.map((call) => ({
    call, gate: mockGate(harness, run.input.sessionScope, call, run.input.userIntent),
  }));
  return {
    harnessVersion: harness.version,
    toolCalls,
    invariantViolations: toolCalls
      .filter((tc) => tc.gate.allowed)
      .flatMap((tc) => mockInvariants(run.input.sessionScope, tc.call, run.input.userIntent)),
  };
};

describe("createAgentRunner", () => {
  it("forwards case input + harness to runAgent and normalizes via toEvalRun", async () => {
    const seen: Array<[AgentInput, HarnessPolicy]> = [];
    const runner = createAgentRunner({
      runAgent: async (input, harness) => { seen.push([input, harness]); return fakeRunAgent(input, harness); },
      toEvalRun,
    });
    const c = allCases.find((x) => x.id === "atk_cross_scope_read")!;
    const run = await runner(c, harnessV1);
    expect(seen).toEqual([[{ userIntent: c.userIntent, untrustedContent: c.untrustedContent, sessionScope: c.sessionScope }, harnessV1]]);
    expect(run.harnessVersion).toBe(1);
    expect(run.invariantViolations.map((v) => v.invariant)).toEqual(["INV-001"]);
  });

  it("plugs into runRegressionSuite", async () => {
    const results = await runRegressionSuite(harnessV1, allCases, createAgentRunner({ runAgent: fakeRunAgent, toEvalRun }));
    expect(results.filter((r) => !r.passed).map((r) => r.caseId))
      .toEqual(["atk_cross_scope_read", "ho_cross_scope_read_variant"]);
  });

  it("surfaces runAgent failures as case errors", async () => {
    const runner = createAgentRunner({ runAgent: async () => { throw new Error("model timeout"); }, toEvalRun });
    const [r] = await runRegressionSuite(harnessV1, allCases.slice(0, 1), runner);
    expect(r).toMatchObject({ passed: false, error: "model timeout" });
  });
});
