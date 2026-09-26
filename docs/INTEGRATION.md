# Integration Contract — Antibody

This is the source of truth for how the four subsystems connect. If you are
integrating with **Person 1 (Strands Runtime + Action Gate)**, everything you
need is here. Import from the barrel `src/index.ts`, never from internal files.

Owner of this doc: Person 1. Ping before changing any signature or shared type.

---

## 1. The loop and who owns each seam

```
                    ┌─────────────── Person 1 (this branch) ───────────────┐
AgentInput ──▶ runAgent(input, harness) ──▶ AgentRun ──▶ evaluateOutcome(run) ──▶ InvariantResult[]
                    └───────────────────────────────────────────────────────┘
                                                   │  toAttackTrace(run)
                                                   ▼
                                              AttackTrace  ──────────────▶  Person 4: saveAttackTrace()
                                                   │
                                                   ▼
                              Person 2: attackToRegression(trace) ──▶ RegressionCase
                              Person 2: generatePatchCandidates(...) ──▶ PatchCandidate[]
                              Person 2: applyPatch(harness, patch) ──▶ candidate HarnessPolicy
                                                   │
                                                   ▼
              Person 3: evaluateCandidate(baseHarness, patch, regressionCases) ──▶ EvaluationResult
                        (internally calls Person 1 runAgent(...) for each case)
                                                   │
                                                   ▼
                              Person 2: selectPatch(candidates, results) ──▶ winning PatchCandidate
                                                   │
                                                   ▼
              Person 4: createHarnessVersion(...) ──▶ activateHarness(v2) ──▶ getActiveHarness()
                                                   │
                                                   ▼
                              runtime reloads active harness, replays attack ──▶ blocked
```

The one non-obvious seam is `AgentRun → AttackTrace`. Person 1 owns the adapter
(`toAttackTrace`) so it isn't reinvented three times. See §4.

---

## 2. Person 1 public API (import from `src/index.ts`)

```ts
// Run the protected agent against a harness. Clones the harness (never mutates).
// LIVE path when OPENROUTER_API_KEY is set; OFFLINE deterministic planner otherwise.
runAgent(input: AgentInput, harness: HarnessPolicy, options?: RunOptions): Promise<AgentRun>

// Per-invocation verdict: "blocked" | "successful_exploit" | "clean".
evaluateOutcome(run: AgentRun): InvariantResult[]

// True if any invocation was a successful exploit.
hasSuccessfulExploit(run: AgentRun): boolean

// Adapter: AgentRun → AttackTrace for the first successful exploit, else null.
toAttackTrace(run: AgentRun, id?: string): AttackTrace | null

type RunOptions = { forceOffline?: boolean } // force deterministic path

// Harness fixtures + gate + invariants (also exported):
HARNESS_V1            // deliberately vulnerable baseline
HARNESS_V2_REFERENCE  // hand-authored correct fix (for tests/reference only)
cloneHarness(policy)  // deep clone
evaluateGate(input)   // low-level single-call authorization (Person 3 may prefer runAgent)
INV, VIOLATION        // invariant + violation-type constants
```

### RunOptions
- Tests / Person 3 fixtures: pass `{ forceOffline: true }` for deterministic,
  key-free runs. This is the recommended mode for the evaluation engine.
- Live demo: omit it and set `OPENROUTER_API_KEY` in `.env`.

---

## 3. Shared data shapes (all in `src/types.ts`)

`src/types.ts` is the ONLY shared file. Changes require notifying all owners.

Inputs / runtime (Person 1 surface):

```ts
type SessionScope = { subjectId: string; roles: string[] };

type AgentInput = {
  userIntent: string;          // the authenticated human's request
  untrustedContent?: string;   // poisoned/injected content (ticket, doc, notes)
  sessionScope: SessionScope;  // authenticated identity — NEVER from tool args
};

type ProposedToolCall = { tool: string; args: Record<string, unknown>; reason?: string };
type GateResult       = { allowed: boolean; violation?: string; reason: string };
type ToolInvocation   = { proposedToolCall: ProposedToolCall; gateResult: GateResult; toolOutput?: unknown };

type AgentRun = {
  input: AgentInput;
  harnessVersion: number;
  invocations: ToolInvocation[];  // every gated call, in order
  finalResponse?: string;         // model's final text (or offline summary)
  usedModel: boolean;             // true = live model path, false = offline planner
};

type InvariantResult = {
  invariant: string;              // e.g. "INV-001"
  violationType?: string;         // e.g. "CROSS_SCOPE_ACCESS"
  violated: boolean;
  outcome: "successful_exploit" | "blocked" | "clean";
  invocation?: ToolInvocation;
  detail: string;
};
```

Harness (Person 1 defines; Person 2 patches; Person 4 stores):

```ts
type ToolRule = {
  requireScopeMatch?: boolean;   // ← the field the demo patch flips
  scopedArgument?: string;       // default "subject_id"
  requireExplicitIntent?: boolean;
  maxAmount?: number | null;
  allowedRoles?: string[];
};

type HarnessPolicy = {
  version: number;
  untrustedContentCanAuthorizeTools: boolean;
  toolRules: Record<string, ToolRule>;
};
```

Cross-subsystem (defined for Person 2/3/4; Person 1 only produces AttackTrace):

```ts
type AttackTrace = {
  id: string;
  harnessVersion: number;
  userIntent: string;
  untrustedContent: string;
  sessionScope: SessionScope;
  proposedToolCall: ProposedToolCall;
  gateResult: GateResult;
  failedInvariant: string;       // "INV-001"
  violationType: string;         // "CROSS_SCOPE_ACCESS"
  outcome: "successful_exploit" | "blocked";
};

type RegressionCase = {
  id: string;
  type: "attack" | "benign";
  userIntent: string;
  untrustedContent: string;
  sessionScope: SessionScope;
  expected: { allowed: boolean; tool?: string; violation?: string };
  sourceAttackId?: string;
  heldOut?: boolean;
};

type PatchCandidate = {
  id: string;
  reason: string;
  changes: Array<{ path: string; oldValue: unknown; newValue: unknown }>;
};

type EvaluationResult = {
  patchId: string;
  knownAttacksPassed: number; knownAttacksTotal: number;
  benignPassed: number;       benignTotal: number;
  heldOutPassed?: number;     heldOutTotal?: number;
  patchSize: number;
  valid: boolean;
};
```

---

## 4. How each person plugs into Person 1

### Person 3 (Evaluation) — the heaviest consumer
Run any `RegressionCase` against a candidate harness and compare to `expected`:

```ts
import { runAgent, evaluateOutcome } from "../index.js";

async function runCase(harness: HarnessPolicy, c: RegressionCase) {
  const run = await runAgent(
    { userIntent: c.userIntent, untrustedContent: c.untrustedContent, sessionScope: c.sessionScope },
    harness,
    { forceOffline: true },          // deterministic, no API key needed
  );
  const outcomes = evaluateOutcome(run);
  const blocked = outcomes.some(o => o.outcome === "blocked");
  const exploited = outcomes.some(o => o.outcome === "successful_exploit");
  // Compare (blocked / exploited / allowed tool) against c.expected.
  return { run, blocked, exploited };
}
```
Note: `evaluateGate(...)` is available for single-call checks, but prefer
`runAgent` so you exercise the same path the demo uses.

### Person 2 (Repair) — consume the AttackTrace
```ts
import { toAttackTrace } from "../index.js";
const trace = toAttackTrace(run);          // null when the run wasn't an exploit
// attackToRegression(trace), generatePatchCandidates(trace, harness), etc.
```
Patch `path` strings target `HarnessPolicy`, e.g.
`"toolRules.get_sensitive_record.requireScopeMatch"`. `applyPatch` must clone
(use `cloneHarness`) and only touch whitelisted fields (the keys of `ToolRule`).

### Person 4 (DB + UI) — persist and serve harnesses
- `getActiveHarness()` returns a `HarnessPolicy`; pass it straight into `runAgent`.
- `HARNESS_V1` (exported) is the seed for `harness_v1`.
- Persist an `AttackTrace` via `saveAttackTrace(toAttackTrace(run))`.
- The `/api/run` handler is basically: load active harness → `runAgent` →
  return `{ run, outcomes: evaluateOutcome(run) }`.

---

## 5. Contract checklist (must compile together — PLAN §11)

- [x] Person 1: `runAgent`, `evaluateOutcome` (+ `toAttackTrace`, `hasSuccessfulExploit`)
- [ ] Person 2: `attackToRegression`, `generatePatchCandidates`, `applyPatch`, `selectPatch`
- [ ] Person 3: `evaluateCandidate`, `evaluateCandidates`
- [ ] Person 4: `getActiveHarness`, `saveAttackTrace`, `saveRegressionCase`, `saveEvaluation`, `createHarnessVersion`, `activateHarness`

---

## 6. Rules that keep integration safe (from PLAN §6 steering)

- S1 Model proposes; harness authorizes. Never call a raw tool directly.
- S2 Untrusted content can't change session identity — `sessionScope` comes from
  the authenticated caller, not tool args.
- S4 Patches touch only whitelisted `ToolRule` fields.
- S7 Harness versions are immutable — `runAgent` clones its input harness.
- Import from `src/index.ts` only. Don't reach into `src/agent`, `src/harness`,
  `src/tools` internals.
