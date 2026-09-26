# Antibody — Coding Conventions (shared steering)

- Language: TypeScript, ESM (`"type": "module"`). Import local modules with the
  `.js` extension (e.g. `import { evaluateGate } from "./actionGate.js"`), as
  required by NodeNext/Bundler ESM resolution.
- Validation: zod v4 (matches the Strands SDK peer).
- Tests: vitest. Test files live in `tests/**/*.test.ts`. `npm test` runs them;
  `npm run test:security` is the security-focused alias.
- Type-check: `npm run build` runs `tsc --noEmit`. Keep it green — `strict`,
  `noUnusedLocals`, and `noUnusedParameters` are on.
- Determinism: security-relevant code (gate, invariants, planner) must be pure
  and deterministic. No network or randomness on the offline path.
- Immutability: never mutate a `HarnessPolicy` passed in from outside; clone with
  `cloneHarness` (or `structuredClone`).
- Secrets: read model credentials from env (`OPENROUTER_API_KEY`,
  `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`). Never commit real keys; see
  `.env.example`.
- Ownership: only edit files inside your subsystem. `src/types.ts` is shared —
  announce changes.
