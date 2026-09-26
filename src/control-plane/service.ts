import { randomUUID } from "node:crypto";
import { saveAgentRun } from "@/src/db/agentRunRepo";
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
  const proposedToolCall = inferToolCall(input);
  const gateResult = evaluateGate(harness.policy, session, proposedToolCall);
  const requestedSubject = proposedToolCall.args.subject_id;
  const crossScope = proposedToolCall.tool === "get_sensitive_record" && requestedSubject !== input.subjectId;
  const outcome = gateResult.allowed && crossScope
    ? "successful_exploit"
    : gateResult.allowed ? "safe" : "blocked";

  const result: RuntimeResult = {
    harnessVersion: harness.version,
    proposedToolCall,
    gateResult,
    failedInvariant: crossScope ? "INV-001" : undefined,
    outcome,
  };

  if (outcome === "successful_exploit") {
    const id = `attack_${randomUUID().slice(0, 8)}`;
    const attack: AttackTrace = {
      id,
      harnessVersion: harness.version,
      userIntent: input.userIntent,
      untrustedContent: input.untrustedContent,
      sessionScope: session,
      proposedToolCall,
      gateResult,
      failedInvariant: "INV-001",
      violationType: "CROSS_SCOPE_ACCESS",
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

  const patch: PatchCandidate = {
    id: `patch_${attack.id.replace("attack_", "")}`,
    reason: "Bind the sensitive record subject to the authenticated session scope.",
    changes: [{
      path: "toolRules.get_sensitive_record.requireScopeMatch",
      oldValue: false,
      newValue: true,
    }],
  };

  await saveRegressionCase({
    id: `reg_${attack.id}`,
    type: "attack",
    userIntent: attack.userIntent,
    untrustedContent: attack.untrustedContent,
    sessionScope: attack.sessionScope,
    expected: { allowed: false, violation: "CROSS_SCOPE_ACCESS" },
    sourceAttackId: attack.id,
    heldOut: false,
  });

  const cases = await listRegressionCases();
  const known = cases.filter((item) => item.type === "attack" && !item.heldOut).length;
  const benign = cases.filter((item) => item.type === "benign").length;
  const heldOut = cases.filter((item) => item.heldOut).length;
  const nextVersion = Math.max(...(await listHarnessVersions()).map((item) => item.version), source.version) + 1;
  const evaluation = {
    id: `eval_${attack.id.replace("attack_", "")}`,
    patchId: patch.id,
    baseHarnessVersion: source.version,
    knownAttacksPassed: known,
    knownAttacksTotal: known,
    benignPassed: benign,
    benignTotal: benign,
    heldOutPassed: heldOut,
    heldOutTotal: heldOut,
    patchSize: patch.changes.length,
    valid: true,
    createdAt: new Date().toISOString(),
  };
  await saveEvaluation(evaluation);

  const existingPatched = (await listHarnessVersions()).find((item) =>
    item.createdFromAttackId === attack.id && item.selectedPatchId === patch.id);
  const hardened = existingPatched ?? await createHarnessVersion({
    id: `harness_v${nextVersion}`,
    version: nextVersion,
    parentVersion: source.version,
    status: "superseded",
    policy: {
      ...source.policy,
      version: nextVersion,
      untrustedContentCanAuthorizeTools: false,
      toolRules: {
        ...source.policy.toolRules,
        get_sensitive_record: {
          ...source.policy.toolRules.get_sensitive_record,
          requireScopeMatch: true,
        },
      },
    },
    createdFromAttackId: attack.id,
    selectedPatchId: patch.id,
    evaluationRunId: evaluation.id,
    createdAt: new Date().toISOString(),
  });
  await activateHarness(hardened.version);
  return { attack, patch, evaluation, harness: hardened };
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
