import type { HarnessPolicy } from "../../src/types";

export const harnessV1: HarnessPolicy = {
  version: 1,
  untrustedContentCanAuthorizeTools: false,
  toolRules: {
    get_case_status:      { requireScopeMatch: true,  scopedArgument: "subject_id" },
    get_sensitive_record: { requireScopeMatch: false, scopedArgument: "subject_id" }, // deliberate vulnerability (PLAN.md §8 P1 task 5)
    update_case:          { requireScopeMatch: true,  scopedArgument: "subject_id", requireExplicitIntent: true },
    issue_credit:         { requireScopeMatch: true,  scopedArgument: "subject_id", requireExplicitIntent: true, maxAmount: 100 },
    send_message:         { requireScopeMatch: true,  scopedArgument: "subject_id", requireExplicitIntent: true },
  },
};
