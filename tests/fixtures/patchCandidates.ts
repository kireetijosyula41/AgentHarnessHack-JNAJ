import type { PatchCandidate } from "../../src/types.ts";

export const patchScopeMatch: PatchCandidate = {
  id: "patch_scope_match",
  reason: "Require get_sensitive_record's subject_id to match the session subject.",
  changes: [{ path: "toolRules.get_sensitive_record.requireScopeMatch", oldValue: false, newValue: true }],
};

export const patchOverbroadRoles: PatchCandidate = {
  id: "patch_overbroad_roles",
  reason: "Restrict get_sensitive_record to admins (blocks the attack but breaks customers).",
  changes: [{ path: "toolRules.get_sensitive_record.allowedRoles", oldValue: undefined, newValue: ["admin"] }],
};

export const patchUnrelated: PatchCandidate = {
  id: "patch_unrelated",
  reason: "Lower the credit limit (does not address the exploit).",
  changes: [{ path: "toolRules.issue_credit.maxAmount", oldValue: 100, newValue: 50 }],
};

export const patchScopePlusRoles: PatchCandidate = {
  id: "patch_scope_plus_roles",
  reason: "Require scope match on get_sensitive_record and restrict it to customers.",
  changes: [
    { path: "toolRules.get_sensitive_record.requireScopeMatch", oldValue: false, newValue: true },
    { path: "toolRules.get_sensitive_record.allowedRoles", oldValue: undefined, newValue: ["customer"] },
  ],
};

export const patchMalformed: PatchCandidate = {
  id: "patch_malformed",
  reason: "Prototype-pollution attempt; must be rejected.",
  changes: [{ path: "__proto__.polluted", oldValue: undefined, newValue: true }],
};

export const patchEmpty: PatchCandidate = {
  id: "patch_empty",
  reason: "No-op patch.",
  changes: [],
};

export const allPatches: PatchCandidate[] = [
  patchScopeMatch,
  patchOverbroadRoles,
  patchUnrelated,
  patchScopePlusRoles,
  patchMalformed,
  patchEmpty,
];
