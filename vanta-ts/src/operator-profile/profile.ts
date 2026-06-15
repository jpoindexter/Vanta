import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { readPreferenceSignals } from "../preferences/signals.js";

const FILE = "operator-profile.json";

const Autonomy = z.enum(["low", "medium", "high"]);
const Scope = z.enum(["narrow", "normal", "broad"]);
const Detail = z.enum(["concise", "normal", "detailed"]);
const Risk = z.enum(["conservative", "balanced", "aggressive"]);
const ApprovalPref = z.enum(["never_ask", "always_ask", "ask_only_one_way"]);

export type ApprovalPreference = z.infer<typeof ApprovalPref>;
export type DeclaredProfile = z.infer<typeof DeclaredSchema>;
export type InferredProfile = z.infer<typeof InferredSchema>;
export type OperatorProfile = z.infer<typeof OperatorProfileSchema>;
export type ProfileSignal = { toolName: string; action: string; approved: boolean };

const DeclaredSchema = z.object({
  autonomyLevel: Autonomy,
  scopeAppetite: Scope,
  detailLevel: Detail,
  riskTolerance: Risk,
});

const InferredSchema = DeclaredSchema.extend({
  confidence: z.number().min(0).max(1),
});

const OperatorProfileSchema = z.object({
  declared: DeclaredSchema,
  inferred: InferredSchema,
  approvalPreferences: z.record(ApprovalPref),
});

export { OperatorProfileSchema };

export function defaultOperatorProfile(): OperatorProfile {
  const declared: DeclaredProfile = {
    autonomyLevel: "medium",
    scopeAppetite: "normal",
    detailLevel: "normal",
    riskTolerance: "balanced",
  };
  return { declared, inferred: { ...declared, confidence: 0 }, approvalPreferences: {} };
}

export function operatorProfilePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), FILE);
}

export async function loadOperatorProfile(env: NodeJS.ProcessEnv = process.env): Promise<OperatorProfile> {
  try {
    const parsed = OperatorProfileSchema.safeParse(JSON.parse(await readFile(operatorProfilePath(env), "utf8")));
    return parsed.success ? parsed.data : defaultOperatorProfile();
  } catch {
    return defaultOperatorProfile();
  }
}

export async function writeOperatorProfile(profile: OperatorProfile, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const parsed = OperatorProfileSchema.parse(profile);
  await mkdir(resolveVantaHome(env), { recursive: true });
  await writeFile(operatorProfilePath(env), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

export function inferProfileFromSignals(signals: ProfileSignal[]): InferredProfile {
  const denied = signals.filter((s) => !s.approved);
  const broadDenied = denied.filter((s) => isBroadScope(s.action)).length;
  const riskyDenied = denied.filter((s) => isOneWayDoor(s.action) || isRiskyTool(s.toolName)).length;
  return {
    autonomyLevel: denied.length >= 3 ? "low" : "medium",
    scopeAppetite: broadDenied > 0 ? "narrow" : "normal",
    detailLevel: "normal",
    riskTolerance: riskyDenied > 0 ? "conservative" : "balanced",
    confidence: signals.length ? Math.min(1, signals.length / 5) : 0,
  };
}

export async function inferProfileFromPreferenceSignals(env: NodeJS.ProcessEnv = process.env): Promise<InferredProfile> {
  const rows = await readPreferenceSignals(env);
  return inferProfileFromSignals(rows
    .filter((s) => s.kind === "approval_decision")
    .map((s) => ({
      toolName: s.provenance.toolName ?? "",
      action: s.context,
      approved: s.chosen.label === "allow",
    })));
}

export function detectProfileDrift(
  declared: DeclaredProfile,
  inferred: InferredProfile,
  threshold = 1,
): { hasDrift: boolean; messages: string[] } {
  const messages: string[] = [];
  addDrift(messages, { label: "autonomy level", declared: declared.autonomyLevel, inferred: inferred.autonomyLevel, threshold, rank: autonomyRank });
  addDrift(messages, { label: "scope appetite", declared: declared.scopeAppetite, inferred: inferred.scopeAppetite, threshold, rank: scopeRank });
  addDrift(messages, { label: "detail level", declared: declared.detailLevel, inferred: inferred.detailLevel, threshold, rank: detailRank });
  addDrift(messages, { label: "risk tolerance", declared: declared.riskTolerance, inferred: inferred.riskTolerance, threshold, rank: riskRank });
  return { hasDrift: messages.length > 0, messages };
}

export function approvalPreferenceFor(
  profile: OperatorProfile,
  request: { toolName: string; action: string; currentDecision: "allow" | "ask" | "block"; kernelRisk: "allow" | "ask" | "block" },
): { decision: "allow" | "ask" | "block"; reason: string } {
  if (request.currentDecision === "block" || request.kernelRisk === "block") return { decision: "block", reason: "kernel block is immovable" };
  const pref = profile.approvalPreferences[request.toolName] ?? profile.approvalPreferences["*"];
  if (isOneWayDoor(request.action)) return { decision: "ask", reason: "one-way-door action requires asking" };
  if (request.currentDecision === "ask") return { decision: "ask", reason: "kernel or permission rule requires asking" };
  if (pref === "always_ask") return { decision: "ask", reason: "operator profile always_ask" };
  return { decision: "allow", reason: pref ? `operator profile ${pref}` : "no operator profile preference" };
}

type DriftCheck<T extends string> = {
  declared: T;
  inferred: T;
  label: string;
  rank: (v: T) => number;
  threshold: number;
};

function addDrift<T extends string>(out: string[], check: DriftCheck<T>): void {
  const { declared, inferred, label, rank, threshold } = check;
  if (Math.abs(rank(declared) - rank(inferred)) > threshold) out.push(`Operator profile drift: declared ${label} is ${declared}, inferred is ${inferred}.`);
}

function idx<T extends string>(order: readonly T[]): (v: T) => number {
  return (v) => order.indexOf(v);
}

const autonomyRank = idx(["low", "medium", "high"] as const);
const scopeRank = idx(["narrow", "normal", "broad"] as const);
const detailRank = idx(["concise", "normal", "detailed"] as const);
const riskRank = idx(["conservative", "balanced", "aggressive"] as const);

function isRiskyTool(toolName: string): boolean {
  return toolName === "shell_cmd" || toolName === "git_push" || toolName === "workflow";
}

function isBroadScope(action: string): boolean {
  return /\b(all|every|workspace|system|production|deploy|global|outside)\b/i.test(action);
}

function isOneWayDoor(action: string): boolean {
  return /\b(rm -rf|delete|drop table|reset --hard|push --force|publish|deploy|migrate|production)\b/i.test(action);
}
