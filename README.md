# Antibody Control Plane

Antibody is a self-hardening security harness for tool-using AI agents. This branch implements the Person 4 surface: MongoDB Atlas persistence, immutable harness lineage, API integration, rollback, and the one-screen demo UI.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without a MongoDB URI, the app deliberately uses an in-memory demo store. The complete demo remains runnable:

1. **Run agent** to show the cross-scope exploit succeeding under vulnerable harness v1.
2. **Harden harness** to create a regression, evaluate the one-field patch, store v2, and activate it.
3. **Replay attack** to prove the identical exploit is denied under v2.
4. **Roll back** to reactivate the previous immutable version.

## MongoDB Atlas

Copy `.env.example` to `.env.local`, set `MONGODB_URI`, and seed the `antibody` database:

```bash
npm run seed
npm run smoke
```

Collections: `harness_versions`, `attack_traces`, `regression_cases`, `evaluation_runs`, `deployment_state`, and `agent_runs`.

Harness versions are append-only. Activation only changes the `deployment_state` pointer and version status, making rollback possible without mutating policy history.

## API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/run` | Run the demo agent through the active gate |
| `POST` | `/api/harden` | Convert an attack trace into a tested patch and activate it |
| `POST` | `/api/replay` | Replay the same attack under the active harness |
| `POST` | `/api/rollback` | Reactivate the previous harness version |
| `GET` | `/api/harness` | Active harness, storage mode, metrics, and lineage |
| `GET` | `/api/lineage` | Immutable harness ancestry |
| `GET` | `/api/metrics` | Demo control-plane counters |

The current runtime and repair logic are deterministic integration seams. Person 1 can replace tool-call inference with Strands runtime output, while Person 2/3 can replace evaluation internals without changing the API or persistence contracts.

## Verification

```bash
npm test
npm run test:security
npm run build
npm run smoke
```

See [`deployment/vercel.md`](deployment/vercel.md) for deployment notes.
