import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const AutonomyLaneSchema = z.enum(["acts-alone", "queues-for-approval", "wakes-me"]);
export type AutonomyLane = z.infer<typeof AutonomyLaneSchema>;

export const AutonomyActionSchema = z.object({
  kind: z.string().min(1),
  summary: z.string().min(1),
  risk: z.enum(["low", "medium", "high"]).default("low"),
  source: z.string().optional(),
});
export type AutonomyAction = z.infer<typeof AutonomyActionSchema>;

export const AutonomyRuleSchema = z.object({
  id: z.string().min(1),
  lane: AutonomyLaneSchema,
  match: z.string().min(1),
  reason: z.string().min(1),
});
export type AutonomyRule = z.infer<typeof AutonomyRuleSchema>;

export const AutonomyContractSchema = z.object({
  version: z.literal(1).default(1),
  rules: z.array(AutonomyRuleSchema),
});
export type AutonomyContract = z.infer<typeof AutonomyContractSchema>;

export type AutonomyDecision = {
  lane: AutonomyLane;
  ruleId: string;
  reason: string;
  action: AutonomyAction;
};

export const DEFAULT_AUTONOMY_CONTRACT: AutonomyContract = {
  version: 1,
  rules: [
    {
      id: "wake-high-risk",
      lane: "wakes-me",
      match: "risk:high",
      reason: "High-risk autonomous work must wake the operator.",
    },
    {
      id: "allow-proactive-loop",
      lane: "acts-alone",
      match: "kind:proactive.loop.advance",
      reason: "Queued loop wakes may advance under the existing kernel approval floor.",
    },
    {
      id: "queue-medium-risk",
      lane: "queues-for-approval",
      match: "risk:medium",
      reason: "Medium-risk autonomous work should wait for approval.",
    },
    {
      id: "allow-low-risk",
      lane: "acts-alone",
      match: "risk:low",
      reason: "Low-risk read/status/maintenance work can run alone.",
    },
  ],
};

export function contractPath(dataDir: string): string {
  return join(dataDir, "autonomy-contract.json");
}

export function autonomyLogPath(dataDir: string): string {
  return join(dataDir, "autonomy-decisions.jsonl");
}

export async function loadAutonomyContract(dataDir: string): Promise<AutonomyContract> {
  try {
    const parsed = AutonomyContractSchema.safeParse(JSON.parse(await readFile(contractPath(dataDir), "utf8")));
    return parsed.success ? parsed.data : DEFAULT_AUTONOMY_CONTRACT;
  } catch {
    return DEFAULT_AUTONOMY_CONTRACT;
  }
}

export async function writeDefaultAutonomyContract(dataDir: string): Promise<string> {
  const file = contractPath(dataDir);
  await mkdir(dataDir, { recursive: true });
  await writeFile(file, `${JSON.stringify(DEFAULT_AUTONOMY_CONTRACT, null, 2)}\n`, "utf8");
  return file;
}

export function decideAutonomy(contract: AutonomyContract, action: AutonomyAction): AutonomyDecision {
  const parsed = AutonomyActionSchema.parse(action);
  const rule = contract.rules.find((r) => ruleMatches(r, parsed)) ?? DEFAULT_AUTONOMY_CONTRACT.rules.at(-1)!;
  return { lane: rule.lane, ruleId: rule.id, reason: rule.reason, action: parsed };
}

export async function logAutonomyDecision(dataDir: string, decision: AutonomyDecision, now: () => Date = () => new Date()): Promise<string> {
  await mkdir(dataDir, { recursive: true });
  const file = autonomyLogPath(dataDir);
  const row = { createdAt: now().toISOString(), ...decision };
  await writeFile(file, `${JSON.stringify(row)}\n`, { encoding: "utf8", flag: "a" });
  return file;
}

export function formatAutonomyContract(contract: AutonomyContract): string {
  return [
    "Autonomy contract",
    "",
    "Acts alone",
    ...formatLane(contract, "acts-alone"),
    "",
    "Queues for approval",
    ...formatLane(contract, "queues-for-approval"),
    "",
    "Wakes me",
    ...formatLane(contract, "wakes-me"),
  ].join("\n");
}

export function formatAutonomyDecision(decision: AutonomyDecision): string {
  return [
    `Autonomy decision: ${decision.lane}`,
    `Rule: ${decision.ruleId}`,
    `Reason: ${decision.reason}`,
    `Action: ${decision.action.kind} — ${decision.action.summary}`,
  ].join("\n");
}

function formatLane(contract: AutonomyContract, lane: AutonomyLane): string[] {
  const rows = contract.rules.filter((r) => r.lane === lane);
  return rows.length ? rows.map((r) => `  - ${r.id}: ${r.match} — ${r.reason}`) : ["  - none"];
}

function ruleMatches(rule: AutonomyRule, action: AutonomyAction): boolean {
  if (rule.match === "*") return true;
  const [field, ...rest] = rule.match.split(":");
  const value = rest.join(":");
  if (field === "risk") return action.risk === value;
  if (field === "kind") return action.kind === value || action.kind.startsWith(`${value}.`);
  if (field === "source") return action.source === value;
  return action.summary.toLowerCase().includes(rule.match.toLowerCase());
}
