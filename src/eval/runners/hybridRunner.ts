import type { CaseRunner, EvalFixture } from "../types.ts";

/** Replays scriptedToolCalls when a case has them; otherwise defers to `fallback` (e.g. regressions from attackToRegression). */
export function createHybridRunner(opts: { scripted: CaseRunner; fallback: CaseRunner }): CaseRunner {
  return (regCase, harness) => {
    const calls = (regCase as Partial<EvalFixture>).scriptedToolCalls;
    return calls && calls.length > 0 ? opts.scripted(regCase, harness) : opts.fallback(regCase, harness);
  };
}
