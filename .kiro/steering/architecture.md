# Antibody — Architecture (shared steering)

Antibody is a self-hardening security harness for tool-using AI agents. It turns
successful agent exploits into verified least-privilege harness patches.

## Loop

```
untrusted input → Strands agent → proposed tool call → Action Gate (typed harness)
  → invariant check → (on successful exploit) attack trace
  → regression → typed patches → evaluate (attack + benign) → smallest valid patch
  → store harness v2 in Atlas → promote → agents reload → replay → blocked
```

## Subsystems and owners

| Area | Owner | Public interface |
|---|---|---|
| `src/agent`, `src/harness`, `src/tools` | Person 1 | `runAgent(input, harness)`, `evaluateOutcome(run)` |
| `src/antibody` | Person 2 | `attackToRegression`, `generatePatchCandidates`, `applyPatch`, `selectPatch` |
| `src/eval`, fixtures | Person 3 | `evaluateCandidate`, `evaluateCandidates` |
| `src/db`, `app`, `app/api`, scripts | Person 4 | `getActiveHarness`, `saveAttackTrace`, `createHarnessVersion`, `activateHarness`, ... |

Shared only: `src/types.ts`. After the first 20 minutes, changes there must be
announced to all owners.

## Person 1 contract (runtime)

- `runAgent(input: AgentInput, harness: HarnessPolicy, options?): Promise<AgentRun>`
  runs the protected agent. It has two interchangeable paths that share the same
  gated tools + Action Gate:
  - LIVE: real Strands `Agent` + OpenRouter model when `OPENROUTER_API_KEY` set.
  - OFFLINE: deterministic planner (tests/CI/fallback). Force with
    `{ forceOffline: true }`.
- `evaluateOutcome(run: AgentRun): InvariantResult[]` reports, per invocation,
  `blocked | successful_exploit | clean`. `hasSuccessfulExploit(run)` is a helper.
- The active harness is loaded from Atlas by Person 4 and passed in. `runAgent`
  clones it and never mutates the input (immutability).

## Runtime notes

- Node 20+ (ESM, `"type": "module"`). Model deps are imported lazily in the LIVE
  path so the OFFLINE path needs no OpenRouter/model packages.
- OpenRouter is used through the Strands OpenAI provider in Chat Completions mode
  (`api: 'chat'`, `clientConfig.baseURL = https://openrouter.ai/api/v1`).
