import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { autonomyLogPath, type AutonomyDecision } from "./contract.js";

export const TrustTierSchema = z.enum(["watch", "queue", "auto"]);
export type TrustTier = z.infer<typeof TrustTierSchema>;

export const TrustPolicySchema = z.object({
  version: z.literal(1).default(1),
  minRuns: z.number().int().positive().default(3),
  minPassRate: z.number().min(0).max(1).default(0.9),
  demoteOnFail: z.boolean().default(true),
});
export type TrustPolicy = z.infer<typeof TrustPolicySchema>;

export const TrustWorkflowSchema = z.object({
  id: z.string().min(1),
  runs: z.number().int().nonnegative(),
  passes: z.number().int().nonnegative(),
  fails: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(1),
  tier: TrustTierSchema,
  lastOutcome: z.enum(["pass", "fail"]).optional(),
  lastReason: z.string().optional(),
  updatedAt: z.string(),
});
export type TrustWorkflow = z.infer<typeof TrustWorkflowSchema>;

export const TrustLedgerSchema = z.object({
  version: z.literal(1).default(1),
  workflows: z.record(z.string(), TrustWorkflowSchema).default({}),
});
export type TrustLedger = z.infer<typeof TrustLedgerSchema>;

export type TrustEvaluation = {
  workflowId: string;
  tier: TrustTier;
  runs: number;
  passes: number;
  fails: number;
  passRate: number;
  minRuns: number;
  minPassRate: number;
  reason: string;
};

export type TrustOutcomeInput = {
  workflowId: string;
  outcome: "pass" | "fail";
  reason: string;
  now?: Date;
  policy?: TrustPolicy;
};

export const DEFAULT_TRUST_POLICY: TrustPolicy = {
  version: 1,
  minRuns: 3,
  minPassRate: 0.9,
  demoteOnFail: true,
};

export const EMPTY_TRUST_LEDGER: TrustLedger = { version: 1, workflows: {} };

export function trustLedgerPath(dataDir: string): string {
  return join(dataDir, "trust-ledger.json");
}

export function trustPolicyPath(dataDir: string): string {
  return join(dataDir, "trust-policy.json");
}

export async function loadTrustPolicy(dataDir: string): Promise<TrustPolicy> {
  try {
    const parsed = TrustPolicySchema.safeParse(JSON.parse(await readFile(trustPolicyPath(dataDir), "utf8")));
    return parsed.success ? parsed.data : DEFAULT_TRUST_POLICY;
  } catch {
    return DEFAULT_TRUST_POLICY;
  }
}

export async function loadTrustLedger(dataDir: string): Promise<TrustLedger> {
  try {
    const parsed = TrustLedgerSchema.safeParse(JSON.parse(await readFile(trustLedgerPath(dataDir), "utf8")));
    return parsed.success ? parsed.data : EMPTY_TRUST_LEDGER;
  } catch {
    return EMPTY_TRUST_LEDGER;
  }
}

export async function saveTrustLedger(dataDir: string, ledger: TrustLedger): Promise<string> {
  await mkdir(dataDir, { recursive: true });
  const file = trustLedgerPath(dataDir);
  await writeFile(file, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return file;
}

export function workflowIdForDecision(decision: AutonomyDecision): string {
  return decision.action.kind;
}

export function evaluateTrust(
  ledger: TrustLedger,
  workflowId: string,
  policy: TrustPolicy = DEFAULT_TRUST_POLICY,
): TrustEvaluation {
  const workflow = ledger.workflows[workflowId] ?? emptyWorkflow(workflowId, policy);
  const reason =
    workflow.tier === "auto"
      ? `earned auto after ${workflow.runs} run(s) at ${(workflow.passRate * 100).toFixed(0)}% pass rate`
      : workflow.lastOutcome === "fail" && policy.demoteOnFail
        ? `demoted after verifier failure: ${workflow.lastReason ?? "no reason recorded"}`
        : workflow.runs < policy.minRuns
          ? `needs ${policy.minRuns - workflow.runs} more verified run(s)`
          : `pass rate ${(workflow.passRate * 100).toFixed(0)}% is below ${(policy.minPassRate * 100).toFixed(0)}%`;
  return {
    workflowId,
    tier: workflow.tier,
    runs: workflow.runs,
    passes: workflow.passes,
    fails: workflow.fails,
    passRate: workflow.passRate,
    minRuns: policy.minRuns,
    minPassRate: policy.minPassRate,
    reason,
  };
}

export function applyTrustGate(
  decision: AutonomyDecision,
  ledger: TrustLedger,
  policy: TrustPolicy = DEFAULT_TRUST_POLICY,
): AutonomyDecision {
  if (decision.lane !== "acts-alone") return decision;
  const trust = evaluateTrust(ledger, workflowIdForDecision(decision), policy);
  if (trust.tier === "auto") {
    return { ...decision, reason: `${decision.reason} Trust ledger: ${trust.reason}.`, trust };
  }
  return {
    ...decision,
    lane: "queues-for-approval",
    ruleId: `${decision.ruleId}+trust-ledger`,
    reason: `${decision.reason} Trust ledger blocks auto-run: ${trust.reason}.`,
    trust,
  };
}

export async function recordTrustOutcome(
  dataDir: string,
  input: TrustOutcomeInput,
): Promise<TrustWorkflow> {
  const now = input.now ?? new Date();
  const policy = input.policy ?? DEFAULT_TRUST_POLICY;
  const ledger = await loadTrustLedger(dataDir);
  const previous = ledger.workflows[input.workflowId] ?? emptyWorkflow(input.workflowId, policy, now);
  const runs = previous.runs + 1;
  const passes = previous.passes + (input.outcome === "pass" ? 1 : 0);
  const fails = previous.fails + (input.outcome === "fail" ? 1 : 0);
  const passRate = runs > 0 ? passes / runs : 0;
  const tier = tierFor({ runs, passRate, outcome: input.outcome }, policy);
  const workflow: TrustWorkflow = {
    id: input.workflowId,
    runs,
    passes,
    fails,
    passRate,
    tier,
    lastOutcome: input.outcome,
    lastReason: input.reason,
    updatedAt: now.toISOString(),
  };
  await saveTrustLedger(dataDir, { version: 1, workflows: { ...ledger.workflows, [input.workflowId]: workflow } });
  await logTrustOutcome(dataDir, workflow, input.reason, now);
  return workflow;
}

export function formatTrustLedger(ledger: TrustLedger, policy: TrustPolicy = DEFAULT_TRUST_POLICY): string {
  const rows = Object.values(ledger.workflows).sort((a, b) => a.id.localeCompare(b.id));
  return [
    "Trust ledger",
    `Policy: minRuns=${policy.minRuns} · minPassRate=${(policy.minPassRate * 100).toFixed(0)}% · demoteOnFail=${policy.demoteOnFail ? "yes" : "no"}`,
    "",
    ...(rows.length ? rows.map(formatTrustWorkflow) : ["  - no workflow history yet"]),
  ].join("\n");
}

export function formatTrustWorkflow(workflow: TrustWorkflow): string {
  const rate = `${(workflow.passRate * 100).toFixed(0)}%`;
  const suffix = workflow.lastReason ? ` · ${workflow.lastOutcome}: ${workflow.lastReason}` : "";
  return `  - ${workflow.id}: ${workflow.tier} · ${workflow.passes}/${workflow.runs} pass · ${workflow.fails} fail · ${rate}${suffix}`;
}

function emptyWorkflow(workflowId: string, policy: TrustPolicy, now: Date = new Date()): TrustWorkflow {
  return {
    id: workflowId,
    runs: 0,
    passes: 0,
    fails: 0,
    passRate: 0,
    tier: tierFor({ runs: 0, passRate: 0 }, policy),
    updatedAt: now.toISOString(),
  };
}

function tierFor(input: { runs: number; passRate: number; outcome?: "pass" | "fail" }, policy: TrustPolicy): TrustTier {
  if (input.outcome === "fail" && policy.demoteOnFail) return "queue";
  if (input.runs < policy.minRuns) return "watch";
  return input.passRate >= policy.minPassRate ? "auto" : "queue";
}

async function logTrustOutcome(dataDir: string, workflow: TrustWorkflow, reason: string, now: Date): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await appendFile(autonomyLogPath(dataDir), `${JSON.stringify({ createdAt: now.toISOString(), event: "trust-ledger", workflow, reason })}\n`, "utf8");
}
