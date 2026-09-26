# AgentHarnessHack-JNAJ — Antibody

Antibody turns successful agent exploits into verified least-privilege harness
patches. It captures an attack that crosses an agent's capability boundary,
converts it into a permanent regression, generates and evaluates typed harness
patches, selects the smallest valid one, and promotes a new immutable harness
version. See [`PLAN.md`](./PLAN.md) for the full design.

This is the integrated build combining all four subsystems.

## Setup

```bash
npm install
cp .env.example .env   # optional — live model + MongoDB are both optional
```

Requires Node 22+. Without `OPENROUTER_API_KEY` the runtime uses a deterministic
offline planner; without `MONGODB_URI` the control plane uses an in-memory store.

## Commands

```bash
npm run typecheck          # tsc --noEmit across all subsystems
npm test                   # runs both test runners (see below)
npm run test:runtime       # vitest: runtime + eval + control-plane (*.test.ts)
npm run test:repair-engine # node:test: repair engine (*.tests.ts)
npm run dev                # Next.js control-plane UI (http://localhost:3000)
npm run agent              # run the Strands runtime entrypoint
npm run seed               # seed MongoDB Atlas (needs MONGODB_URI)
npm run smoke              # end-to-end smoke script
```

### Two test runners

Suites are split by file naming so both runners coexist:

- `*.test.ts` → **vitest** (`npm run test:runtime`) — Person 1 runtime,
  Person 3 evaluation, Person 4 control plane.
- `*.tests.ts` → **node:test** (`npm run test:repair-engine`) — Person 2
  repair engine.

## Subsystems

| Owner | Area | Directories |
|---|---|---|
| Person 1 | Strands runtime + Action Gate | `src/agent`, `src/harness`, `src/tools` |
| Person 2 | Antibody repair engine | `src/antibody` |
| Person 3 | Regression + evaluation engine | `src/eval`, `tests/fixtures` |
| Person 4 | Control plane, persistence, UI | `src/db`, `src/control-plane`, `app`, `scripts` |

Shared contracts live in [`src/types.ts`](./src/types.ts) (frozen — changes must
be announced to all owners).

## The demo exploit (INV-001)

Harness v1 deliberately sets `get_sensitive_record.requireScopeMatch: false`, so
a session for `user_A` can read `user_B`'s sensitive record. The minimal patch
flips that one field to `true`, blocking the exploit while preserving benign
same-scope reads. The full loop:

1. **Run agent** — cross-scope exploit succeeds under vulnerable harness v1.
2. **Harden** — attack becomes a regression; the one-field patch is generated,
   evaluated (all known attacks blocked, benign preserved), stored as v2, activated.
3. **Replay** — the identical exploit is denied under v2.
4. **Roll back** — reactivate the previous immutable version.

## Control-plane API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/run` | Run the demo agent through the active gate |
| `POST` | `/api/harden` | Convert an attack trace into a tested patch and activate it |
| `POST` | `/api/replay` | Replay the same attack under the active harness |
| `POST` | `/api/rollback` | Reactivate the previous harness version |
| `GET` | `/api/harness` | Active harness, storage mode, metrics, and lineage |
| `GET` | `/api/lineage` | Immutable harness ancestry |
| `GET` | `/api/metrics` | Control-plane counters |

Harness versions are append-only; activation only moves the `deployment_state`
pointer, so rollback never mutates policy history. See
[`deployment/vercel.md`](deployment/vercel.md) for deployment notes.
