import type { DetailedEvaluationResult } from "./types.ts";

const LABEL_WIDTH = 19;
const line = (label: string, value: string | number) => label.padEnd(LABEL_WIDTH) + value;

/** Text lines for the UI and smoke script. */
export function formatEvaluation(r: DetailedEvaluationResult): string[] {
  const lines = [
    line("Known attacks", `${r.knownAttacksPassed}/${r.knownAttacksTotal}`),
    line("Benign workflows", `${r.benignPassed}/${r.benignTotal}`),
  ];
  if (r.heldOutTotal !== undefined) lines.push(line("Held-out attacks", `${r.heldOutPassed ?? 0}/${r.heldOutTotal}`));
  lines.push(line("Patch size", r.patchSize), line("Valid", r.valid ? "yes" : "no"));
  if (r.error) lines.push(line("Error", r.error));
  return lines;
}
