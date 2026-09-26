// MOCK — replaced at integration, see src/eval/defaults.ts

import type { HarnessPolicy } from "../../types.ts";
import type { ApplyPatchFn } from "../types.ts";

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const PATCHABLE_RULE_FIELDS = new Set([
  "requireScopeMatch", "scopedArgument", "requireExplicitIntent", "maxAmount", "allowedRoles",
]);

function parsePath(base: HarnessPolicy, path: string): string[] {
  const invalid = () => new Error(`invalid patch path: ${path}`);
  const segs = path.split(".");
  if (segs.some((s) => s === "" || FORBIDDEN_SEGMENTS.has(s))) throw invalid();
  if (segs.length === 1 && segs[0] === "untrustedContentCanAuthorizeTools") return segs;
  if (segs.length === 3 && segs[0] === "toolRules"
      && Object.hasOwn(base.toolRules, segs[1]!) && PATCHABLE_RULE_FIELDS.has(segs[2]!)) {
    return segs;
  }
  throw invalid();
}

export const applyPatchLocal: ApplyPatchFn = (base, patch) => {
  const next = structuredClone(base);
  for (const change of patch.changes) {
    const segs = parsePath(base, change.path);
    if (segs.length === 1) {
      next.untrustedContentCanAuthorizeTools = change.newValue as boolean;
    } else {
      const rule = next.toolRules[segs[1]!] as Record<string, unknown>;
      rule[segs[2]!] = structuredClone(change.newValue);
    }
  }
  return next;
};
