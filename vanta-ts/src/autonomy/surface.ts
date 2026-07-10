import { appendFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { notifyAndWait, type NotifyOpts } from "../term/notify.js";
import {
  AutonomyActionSchema,
  AutonomyLaneSchema,
  autonomyLogPath,
  logAutonomyDecision,
  type AutonomyDecision,
} from "./contract.js";

const TrustLogSchema = z.object({
  workflowId: z.string(),
  tier: z.enum(["watch", "queue", "auto"]),
  runs: z.number(),
  passes: z.number(),
  fails: z.number(),
  passRate: z.number(),
  reason: z.string(),
});

const AutonomyDecisionLogSchema = z.object({
  createdAt: z.string(),
  lane: AutonomyLaneSchema,
  ruleId: z.string(),
  reason: z.string(),
  action: AutonomyActionSchema,
  trust: TrustLogSchema.optional(),
});

const AutonomyResolutionLogSchema = z.object({
  createdAt: z.string(),
  event: z.literal("autonomy-resolution"),
  key: z.string().min(1),
  note: z.string().min(1),
});

export type AutonomySurfaceDeps = {
  notify?: (opts: NotifyOpts) => void | Promise<void>;
  now?: () => Date;
  cwd?: string;
};

export type PendingAutonomyDecision = z.infer<typeof AutonomyDecisionLogSchema>;
export type AutonomyResolution = z.infer<typeof AutonomyResolutionLogSchema>;

export function autonomyDecisionKey(decision: Pick<AutonomyDecision, "action">): string {
  return `${decision.action.kind}:${decision.action.source ?? "default"}`;
}

/** Persist every decision and actively wake the operator when the contract requires it. */
export async function surfaceAutonomyDecision(
  dataDir: string,
  decision: AutonomyDecision,
  deps: AutonomySurfaceDeps = {},
): Promise<string> {
  const file = await logAutonomyDecision(dataDir, decision, deps.now);
  if (decision.lane !== "wakes-me") return file;
  const notify = deps.notify ?? notifyAndWait;
  await notify({
    title: "Vanta · action needs you",
    message: `${decision.action.summary} — ${decision.reason}`,
    dataDir,
    cwd: deps.cwd ?? dirname(dataDir),
    notificationType: "autonomy_wake",
  });
  return file;
}

/** Latest non-auto decision per workflow is the durable operator review queue. */
export async function loadPendingAutonomy(dataDir: string): Promise<PendingAutonomyDecision[]> {
  let raw = "";
  try { raw = await readFile(autonomyLogPath(dataDir), "utf8"); }
  catch { return []; }
  const latest = new Map<string, PendingAutonomyDecision>();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let json: unknown;
    try { json = JSON.parse(line); }
    catch { continue; }
    const resolution = AutonomyResolutionLogSchema.safeParse(json);
    if (resolution.success) {
      latest.delete(resolution.data.key);
      continue;
    }
    const parsed = AutonomyDecisionLogSchema.safeParse(json);
    if (!parsed.success) continue;
    latest.set(autonomyDecisionKey(parsed.data), parsed.data);
  }
  return [...latest.values()]
    .filter((entry) => entry.lane !== "acts-alone")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Resolve one visible item with an audit note. A later decision reopens it. */
export async function resolvePendingAutonomy(
  dataDir: string,
  key: string,
  note: string,
  now: () => Date = () => new Date(),
): Promise<AutonomyResolution | null> {
  const cleanKey = key.trim();
  const cleanNote = note.trim();
  if (!cleanKey || !cleanNote) return null;
  const pending = await loadPendingAutonomy(dataDir);
  if (!pending.some((entry) => autonomyDecisionKey(entry) === cleanKey)) return null;
  const resolution = AutonomyResolutionLogSchema.parse({
    createdAt: now().toISOString(),
    event: "autonomy-resolution",
    key: cleanKey,
    note: cleanNote,
  });
  await appendFile(autonomyLogPath(dataDir), `${JSON.stringify(resolution)}\n`, "utf8");
  return resolution;
}

export function formatPendingAutonomy(entries: PendingAutonomyDecision[]): string {
  if (!entries.length) return "Pending autonomy decisions\n\n  - none";
  return [
    "Pending autonomy decisions",
    "",
    ...entries.map((entry) => `  - ${entry.lane} · ${autonomyDecisionKey(entry)} · ${entry.action.summary} · ${entry.reason}`),
  ].join("\n");
}
