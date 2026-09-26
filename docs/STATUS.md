# Repo Status — what's built vs. stubbed

Snapshot for anyone picking up integration. Branch: `feat/strands-runtime`.

## Built and verified (Person 1)

| Area | Files | State |
|---|---|---|
| Shared contracts | `src/types.ts` | ✅ frozen (see INTEGRATION.md §3) |
| Public surface | `src/index.ts` | ✅ import from here |
| Strands runtime | `src/agent/strandsAgent.ts`, `planner.ts`, `prompts.ts` | ✅ `runAgent`, `evaluateOutcome`, `toAttackTrace` |
| Action Gate | `src/harness/actionGate.ts` | ✅ deterministic authorization |
| Invariants | `src/harness/invariants.ts` | ✅ INV-001 (mandatory); INV-002/003 present |
| Harness policies | `src/harness/policies.ts` | ✅ `HARNESS_V1` (vulnerable), `HARNESS_V2_REFERENCE` |
| Tools | `src/tools/mockTools.ts`, `gatedTools.ts` | ✅ 5 gated tools |
| Tests | `tests/actionGate.test.ts`, `tests/runtime.test.ts` | ✅ 10/10 pass |
| Steering | `.kiro/steering/*.md` | ✅ architecture, invariants, conventions |

Verification: `npm run build` clean, `npm test` 10/10, `npm run agent` (offline)
and `npm run agent:live` (Llama 3.1 8B) both reproduce exploit→block.

## Not in this repo yet (owned by others)

| Area | Expected path | Owner |
|---|---|---|
| Repair engine | `src/antibody/` | Person 2 |
| Evaluation engine | `src/eval/`, `tests/fixtures/` | Person 3 |
| Atlas + repos + UI | `src/db/`, `app/`, `app/api/`, `scripts/` | Person 4 |

## Important: the "self-improving" loop is NOT closed yet

Today the demo uses a **hand-authored** `HARNESS_V2_REFERENCE` to show the
before/after. Nothing in the repo yet *generates* v2 from an attack
automatically — that requires Person 2 (patch) + Person 3 (evaluate) + Person 4
(store/promote). Person 1 provides the runtime hooks (`runAgent`, `toAttackTrace`)
those stages plug into. See INTEGRATION.md §1 for the full loop.

## Runtime notes for whoever runs this branch

- Node 20+ (developed on 25). ESM project (`"type": "module"`), import local
  modules with `.js` extensions.
- `npm install` pulls `@strands-agents/sdk`, `zod`, and `openai` (the SDK's
  OpenAI provider peer, needed for the live/OpenRouter path).
- Offline path (tests, CI, `{ forceOffline: true }`) needs no API key.
- Live path: copy `.env.example` to `.env`, set `OPENROUTER_API_KEY`. Demo model
  is `meta-llama/llama-3.1-8b-instruct` (weak injection resistance + reliable
  tool calling, so the exploit lands live). `npm run agent:live` loads `.env`.
- `.env` is gitignored — never commit real keys.
