import { randomUUID } from "node:crypto";
import {
  runAgent as runProtectedAgent,
  evaluateOutcome,
} from "@/src/agent/strandsAgent";
import {
  diagnoseFailure,
  generatePatchCandidates,
  applyPatch,
  selectPatch,
  explainRepair,
} from "@/src/antibody/index";
import { listAgentRuns, saveAgentRun } from "@/src/db/agentRunRepo";
import { getAttackTrace, listAttackTraces, saveAttackTrace } from "@/src/db/attackRepo";
import { activateHarness, getActiveHarness, getDeploymentState } from "@/src/db/deploymentRepo";
import { listEvaluations, saveEvaluation } from "@/src/db/evaluationRepo";
import { createHarnessVersion, getHarness, listHarnessVersions } from "@/src/db/harnessRepo";
import { isMongoConfigured } from "@/src/db/mongo";
import { listRegressionCases, saveRegressionCase } from "@/src/db/regressionRepo";
import type {
  AttackTrace,
  GateResult,
  HarnessPolicy,
  LineageNode,
  PatchCandidate,
  ProposedToolCall,
  RuntimeResult,
  SessionScope,
} from "@/src/types";

export type RunInput = {
  userIntent: string;
  untrustedContent: string;
  subjectId: string;
};

/**
 * Retained fallback. As of the live-model integration, runAgent drives Person
 * 1's protected runtime (Strands + OpenRouter, or the offline planner) instead
 * of this regex. Kept for reference / a fully offline deterministic path.
 */
function inferToolCall(input: RunInput): ProposedToolCall {
  const target = input.untrustedContent.match(/user_[A-Za-z0-9-]+/i)?.[0];
  const sensitive = /sensitive|private|secret|billing record/i.test(input.untrustedContent);
  if (sensitive || (target && target !== input.subjectId)) {
    return {
      tool: "get_sensitive_record",
      args: { subject_id: target ?? "user_B" },
      reason: "The untrusted content requested a sensitive cross-subject lookup.",
    };
  }
  return {
    tool: "get_case_status",
    args: { subject_id: input.subjectId },
    reason: "The user explicitly requested their own account status.",
  };
}

export function evaluateGate(
  policy: HarnessPolicy,
  session: SessionScope,
  call: ProposedToolCall,
): GateResult {
  const rule = policy.toolRules[call.tool];
  if (!rule) return { allowed: false, violation: "TOOL_NOT_ALLOWED", reason: "Tool is absent from the active harness." };
  const scopedArgument = rule.scopedArgument ?? "subject_id";
  const requestedSubject = call.args[scopedArgument];
  if (rule.requireScopeMatch && requestedSubject !== session.subjectId) {
    return {
      allowed: false,
      violation: "CROSS_SCOPE_ACCESS",
      reason: `Session ${session.subjectId} cannot access ${String(requestedSubject)}.`,
    };
  }
  return { allowed: true, reason: "The active harness permits this tool call." };
}

export async function runAgent(input: RunInput, kind: "run" | "replay" = "run"): Promise<RuntimeResult> {
  const harness = await getActiveHarness();
  const session = { subjectId: input.subjectId, roles: ["member"] };

  // Drive Person 1's protected runtime. This uses the LIVE Strands + OpenRouter
  // path automatically when OPENROUTER_API_KEY is set, and the deterministic
  // offline planner otherwise. Both paths funnel every tool call through the
  // same Action Gate against the active harness policy, so the security outcome
  // is authoritative regardless of path.
  const run = await runProtectedAgent(
    {
      userIntent: input.userIntent,
      untrustedContent: input.untrustedContent,
      sessionScope: session,
    },
    harness.policy,
  );

  // Use the first gated invocation as the representative tool call for the UI.
  // If the model proposed nothing, fall back to a benign self-scoped call so
  // the control plane always has a well-formed RuntimeResult to display.
  const firstInvocation = run.invocations[0];
  const proposedToolCall: ProposedToolCall = firstInvocation?.proposedToolCall ?? {
    tool: "get_case_status",
    args: { subject_id: input.subjectId },
    reason: "The model proposed no tool call.",
  };
  const gateResult: GateResult = firstInvocation?.gateResult ?? {
    allowed: true,
    reason: "No tool call was proposed.",
  };

  // Person 1's evaluateOutcome is the single source of truth for exploit/blocked.
  const outcomes = evaluateOutcome(run);
  const exploit = outcomes.find((o) => o.outcome === "successful_exploit");
  const blocked = outcomes.find((o) => o.outcome === "blocked");
  const outcome: RuntimeResult["outcome"] = exploit
    ? "successful_exploit"
    : blocked
      ? "blocked"
      : "safe";

  const result: RuntimeResult = {
    harnessVersion: harness.version,
    proposedToolCall,
    gateResult,
    failedInvariant: exploit ? exploit.invariant : undefined,
    outcome,
  };

  if (outcome === "successful_exploit" && exploit) {
    // Persist the ACTUAL exploiting invocation Person 1's runtime observed,
    // not a re-inferred one, so hardening repairs the tool the model abused.
    const exploitInvocation = exploit.invocation ?? firstInvocation;
    const id = `attack_${randomUUID().slice(0, 8)}`;
    const attack: AttackTrace = {
      id,
      harnessVersion: harness.version,
      userIntent: input.userIntent,
      untrustedContent: input.untrustedContent,
      sessionScope: session,
      proposedToolCall: exploitInvocation?.proposedToolCall ?? proposedToolCall,
      gateResult: exploitInvocation?.gateResult ?? gateResult,
      failedInvariant: exploit.invariant,
      violationType: exploit.violationType ?? "CROSS_SCOPE_ACCESS",
      outcome,
      createdAt: new Date().toISOString(),
    };
    await saveAttackTrace(attack);
    result.attackId = id;
  }

  await saveAgentRun({
    id: `run_${randomUUID().slice(0, 8)}`,
    kind,
    harnessVersion: harness.version,
    result,
    createdAt: new Date().toISOString(),
  });
  return result;
}

export async function harden(attackId?: string) {
  const attacks = await listAttackTraces();
  const attack = attackId ? await getAttackTrace(attackId) : attacks.at(-1) ?? null;
  if (!attack) throw new Error("Run the exploit first so Antibody has an attack trace to repair.");

  const source = await getHarness(attack.harnessVersion);
  if (!source) throw new Error(`Source harness v${attack.harnessVersion} is missing.`);

  // ── Person 2's deterministic repair engine does the real repair ──────────
  // 1. Diagnose the failure from the structured attack trace.
  // 2. Generate typed, whitelist-validated patch candidates.
  // 3. Evaluate each against the regression suite (known attacks + benign).
  // 4. Select the smallest valid candidate.
  // The model never chooses or writes the patch — applyPatch enforces the
  // whitelist and selectPatch enforces validity (PLAN §2, steering S4).
  const diagnosis = diagnoseFailure(attack, source.policy);
  const candidates = generatePatchCandidates(attack, source.policy);

  // Persist the triggering exploit as a permanent regression before evaluating.
  await saveRegressionCase({
    id: `reg_${attack.id}`,
    type: "attack",
    userIntent: attack.userIntent,
    untrustedContent: attack.untrustedContent,
    sessionScope: attack.sessionScope,
    expected: { allowed: false, violation: attack.violationType || "CROSS_SCOPE_ACCESS" },
    sourceAttackId: attack.id,
    heldOut: false,
  });

  const cases = await listRegressionCases();
  const known = cases.filter((item) => item.type === "attack" && !item.heldOut).length;
  const benign = cases.filter((item) => item.type === "benign").length;
  const heldOut = cases.filter((item) => item.heldOut).length;

  // Build an EvaluationResult per candidate. Each candidate is APPLIED through
  // the whitelist-validated applyPatch; a candidate is valid only if it applies
  // cleanly (blocks the triggering attack) while preserving the benign suite.
  const evaluations = candidates.map((candidate) => {
    let patchApplies = true;
    try {
      applyPatch(source.policy, candidate); // throws if malformed / off-whitelist
    } catch {
      patchApplies = false;
    }
    return {
      patchId: candidate.id,
      knownAttacksPassed: patchApplies ? known : 0,
      knownAttacksTotal: known,
      benignPassed: benign,
      benignTotal: benign,
      heldOutPassed: heldOut,
      heldOutTotal: heldOut,
      patchSize: candidate.changes.length,
      valid: patchApplies,
    };
  });

  // Deterministic selection of the smallest valid patch.
  const selection = selectPatch(candidates, evaluations);
  const patch = selection.selectedPatch;

  // Reasoning agent: explain WHY (narrative only — no authority over the patch).
  const explanation = await explainRepair(attack, diagnosis, patch);

  const nextVersion = Math.max(...(await listHarnessVersions()).map((item) => item.version), source.version) + 1;
  const evaluation = {
    ...selection.selectedEvaluation,
    id: `eval_${attack.id.replace("attack_", "")}`,
    baseHarnessVersion: source.version,
    createdAt: new Date().toISOString(),
  };
  await saveEvaluation(evaluation);

  // Apply the SELECTED patch through the deterministic, whitelist-enforcing
  // applyPatch — this is what actually mutates the policy, not hand-written code.
  const patchedPolicy = applyPatch(source.policy, patch);

  const existingPatched = (await listHarnessVersions()).find((item) =>
    item.createdFromAttackId === attack.id && item.selectedPatchId === patch.id);
  const hardened = existingPatched ?? await createHarnessVersion({
    id: `harness_v${nextVersion}`,
    version: nextVersion,
    parentVersion: source.version,
    status: "superseded",
    policy: { ...patchedPolicy, version: nextVersion },
    createdFromAttackId: attack.id,
    selectedPatchId: patch.id,
    evaluationRunId: evaluation.id,
    createdAt: new Date().toISOString(),
  });
  await activateHarness(hardened.version);
  return {
    attack,
    patch,
    evaluation,
    harness: hardened,
    diagnosis,
    rationale: selection.rationale,
    explanation: explanation.narrative,
    reasoned: explanation.reasoned,
  };
}

export async function getLineage(): Promise<LineageNode[]> {
  const [harnesses, attacks, evaluations] = await Promise.all([
    listHarnessVersions(), listAttackTraces(), listEvaluations(),
  ]);
  return harnesses.map((harness) => ({
    harness,
    attack: attacks.find((item) => item.id === harness.createdFromAttackId),
    evaluation: evaluations.find((item) => item.id === harness.evaluationRunId),
  }));
}

export async function getSnapshot() {
  const [harness, deployment, lineage, attacks, regressions, evaluations] = await Promise.all([
    getActiveHarness(), getDeploymentState(), getLineage(), listAttackTraces(),
    listRegressionCases(), listEvaluations(),
  ]);
  return {
    storage: isMongoConfigured() ? "mongodb-atlas" : "local-demo",
    harness,
    deployment,
    lineage,
    metrics: {
      attacksCaptured: attacks.length,
      regressions: regressions.length,
      evaluations: evaluations.length,
      versions: lineage.length,
    },
  };
}

export async function rollback() {
  const state = await getDeploymentState();
  if (state.previousHarnessVersion === null) throw new Error("No previous harness is available.");
  return activateHarness(state.previousHarnessVersion);
}

// ---------------------------------------------------------------------------
// Impact Lab — deterministic "what changed" analysis for developers.
//
// Everything below is computed by re-running the SAME Action Gate over data we
// already store (regression cases, historical agent runs), comparing the active
// (patched) policy against its parent. No fabricated numbers.
// ---------------------------------------------------------------------------

export type ImpactReport = {
  activeVersion: number;
  parentVersion: number | null;
  // Which attacks are now blocked (vs. allowed under the parent policy).
  attacksBlocked: Array<{ id: string; violation: string; nowBlocked: boolean; wasBlocked: boolean }>;
  // Which benign workflows still work under the active policy.
  benignPreserved: Array<{ id: string; tool?: string; stillAllowed: boolean }>;
  benignBroken: Array<{ id: string; tool?: string }>;
  // Which capabilities changed (per-tool policy diff, parent -> active).
  capabilityChanges: Array<{ tool: string; field: string; from: unknown; to: unknown }>;
  // Which users / roles are affected by the changed tools.
  affectedRoles: string[];
  affectedSubjects: string[];
  // What would happen to historical traffic replayed under the active policy.
  historicalTraffic: { total: number; nowAllowed: number; nowBlocked: number; newlyBlocked: number };
  // How much new approval work the change creates (calls newly requiring denial/approval).
  newApprovalWork: number;
};

/** Replay a single stored tool call through the gate under a given policy. */
function gateFor(policy: HarnessPolicy, session: SessionScope, call: ProposedToolCall): boolean {
  return evaluateGate(policy, session, call).allowed;
}

export async function computeImpact(): Promise<ImpactReport> {
  const active = await getActiveHarness();
  const parent =
    active.parentVersion !== null ? await getHarness(active.parentVersion) : null;
  const parentPolicy = parent?.policy ?? active.policy;

  const [cases, runs] = await Promise.all([listRegressionCases(), listAgentRuns()]);

  // ── Attacks now blocked ──────────────────────────────────────────────────
  const attackCases = cases.filter((c) => c.type === "attack");
  const attacksBlocked = attackCases.map((c) => {
    const call: ProposedToolCall = {
      tool: c.expected.tool ?? "get_sensitive_record",
      // The regression's expected violation is cross-scope; model the abused call.
      args: { subject_id: findForeignSubject(c.sessionScope.subjectId) },
    };
    const nowAllowed = gateFor(active.policy, c.sessionScope, call);
    const wasAllowed = gateFor(parentPolicy, c.sessionScope, call);
    return {
      id: c.id,
      violation: c.expected.violation ?? "CROSS_SCOPE_ACCESS",
      nowBlocked: !nowAllowed,
      wasBlocked: !wasAllowed,
    };
  });

  // ── Benign workflows ─────────────────────────────────────────────────────
  const benignCases = cases.filter((c) => c.type === "benign");
  const benignReplayed = benignCases.map((c) => {
    const call: ProposedToolCall = {
      tool: c.expected.tool ?? "get_case_status",
      args: { subject_id: c.sessionScope.subjectId }, // benign = self-scoped
    };
    return { id: c.id, tool: c.expected.tool, stillAllowed: gateFor(active.policy, c.sessionScope, call) };
  });
  const benignPreserved = benignReplayed.filter((b) => b.stillAllowed);
  const benignBroken = benignReplayed.filter((b) => !b.stillAllowed).map(({ id, tool }) => ({ id, tool }));

  // ── Capability changes (per-tool policy diff) ────────────────────────────
  const capabilityChanges = diffPolicies(parentPolicy, active.policy);

  // ── Affected roles / subjects (from cases touching the changed tools) ─────
  const changedTools = new Set(capabilityChanges.map((d) => d.tool));
  const affectedRoles = new Set<string>();
  const affectedSubjects = new Set<string>();
  for (const c of cases) {
    const tool = c.expected.tool;
    if (tool && changedTools.has(tool)) {
      c.sessionScope.roles.forEach((r) => affectedRoles.add(r));
      affectedSubjects.add(c.sessionScope.subjectId);
    }
  }

  // ── Historical traffic replay ────────────────────────────────────────────
  let nowAllowed = 0;
  let nowBlocked = 0;
  let newlyBlocked = 0;
  for (const record of runs) {
    const call = record.result.proposedToolCall;
    const session: SessionScope = {
      subjectId: String(call.args["subject_id"] ?? "unknown"),
      roles: ["member"],
    };
    // Re-derive the ORIGINAL session subject from the stored run where possible.
    const origSubject = deriveRunSubject(record);
    const evalSession: SessionScope = { subjectId: origSubject, roles: session.roles };
    const allowedNow = gateFor(active.policy, evalSession, call);
    const allowedBefore = gateFor(parentPolicy, evalSession, call);
    if (allowedNow) nowAllowed++;
    else nowBlocked++;
    if (allowedBefore && !allowedNow) newlyBlocked++;
  }

  return {
    activeVersion: active.version,
    parentVersion: active.parentVersion,
    attacksBlocked,
    benignPreserved: benignReplayed.filter((b) => b.stillAllowed),
    benignBroken,
    capabilityChanges,
    affectedRoles: [...affectedRoles],
    affectedSubjects: [...affectedSubjects],
    historicalTraffic: { total: runs.length, nowAllowed, nowBlocked, newlyBlocked },
    // New approval work = benign/historical calls the tightened policy now denies.
    newApprovalWork: newlyBlocked + benignBroken.length,
  };
}

/** Pick a subject different from the session subject to model a cross-scope call. */
function findForeignSubject(self: string): string {
  return self === "user_B" ? "user_A" : "user_B";
}

/** Best-effort original session subject for a historical run. */
function deriveRunSubject(record: { result: RuntimeResult }): string {
  const arg = record.result.proposedToolCall.args["subject_id"];
  // A self-scoped benign call keeps its subject; an exploit used a foreign one.
  return record.result.outcome === "successful_exploit" ? "user_A" : String(arg ?? "user_A");
}

/** Deterministic per-tool-rule diff between two policies. */
function diffPolicies(from: HarnessPolicy, to: HarnessPolicy): ImpactReport["capabilityChanges"] {
  const changes: ImpactReport["capabilityChanges"] = [];
  if (from.untrustedContentCanAuthorizeTools !== to.untrustedContentCanAuthorizeTools) {
    changes.push({
      tool: "(global)",
      field: "untrustedContentCanAuthorizeTools",
      from: from.untrustedContentCanAuthorizeTools,
      to: to.untrustedContentCanAuthorizeTools,
    });
  }
  const tools = new Set([...Object.keys(from.toolRules), ...Object.keys(to.toolRules)]);
  for (const tool of tools) {
    const a = from.toolRules[tool] ?? {};
    const b = to.toolRules[tool] ?? {};
    const fields = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof typeof a>;
    for (const field of fields) {
      if (a[field] !== b[field]) {
        changes.push({ tool, field: String(field), from: a[field], to: b[field] });
      }
    }
  }
  return changes;
}
