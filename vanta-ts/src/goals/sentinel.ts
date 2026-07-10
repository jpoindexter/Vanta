import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { z } from "zod";
import { recordTrustOutcome } from "../autonomy/trust.js";
import { notifyAndWait as sendNotification, type NotifyOpts } from "../term/notify.js";

const execAsync = promisify(exec);

const SentinelStatusSchema = z.enum(["active", "retired"]);
const SentinelHistorySchema = z.object({
  at: z.string(),
  status: z.enum(["pass", "fail"]),
  output: z.string(),
});

export const StandingGoalSentinelSchema = z.object({
  id: z.string().min(1),
  goalId: z.number().int().nonnegative(),
  goalText: z.string().min(1),
  predicate: z.string().min(1),
  command: z.string().min(1),
  status: SentinelStatusSchema,
  createdAt: z.string(),
  retiredAt: z.string().optional(),
  retireReason: z.string().optional(),
  history: z.array(SentinelHistorySchema).default([]),
});
export type StandingGoalSentinel = z.infer<typeof StandingGoalSentinelSchema>;

export const SentinelStoreSchema = z.object({
  version: z.literal(1).default(1),
  sentinels: z.array(StandingGoalSentinelSchema).default([]),
});
export type SentinelStore = z.infer<typeof SentinelStoreSchema>;
export type SentinelRun = { sentinel: StandingGoalSentinel; status: "pass" | "fail"; output: string };
export type SentinelRunDeps = { notify?: (opts: NotifyOpts) => void | Promise<void>; cwd?: string };

export function sentinelPath(dataDir: string): string {
  return join(dataDir, "standing-goal-sentinels.json");
}

export function sentinelWakePath(dataDir: string): string {
  return join(dataDir, "sentinel-wakes.jsonl");
}

export function sentinelLastRunPath(dataDir: string): string {
  return join(dataDir, "standing-goal-sentinel-last-run.txt");
}

export async function loadSentinels(dataDir: string): Promise<SentinelStore> {
  try {
    const parsed = SentinelStoreSchema.safeParse(JSON.parse(await readFile(sentinelPath(dataDir), "utf8")));
    return parsed.success ? parsed.data : { version: 1, sentinels: [] };
  } catch {
    return { version: 1, sentinels: [] };
  }
}

export async function saveSentinels(dataDir: string, store: SentinelStore): Promise<string> {
  await mkdir(dataDir, { recursive: true });
  const file = sentinelPath(dataDir);
  await writeFile(file, `${JSON.stringify(SentinelStoreSchema.parse(store), null, 2)}\n`, "utf8");
  return file;
}

export async function createGoalSentinel(
  dataDir: string,
  input: { goalId: number; goalText: string; command: string; predicate?: string; now?: Date },
): Promise<StandingGoalSentinel> {
  const now = input.now ?? new Date();
  const store = await loadSentinels(dataDir);
  const prior = store.sentinels.find((s) => s.id === `goal-${input.goalId}`);
  const sentinel: StandingGoalSentinel = {
    id: `goal-${input.goalId}`,
    goalId: input.goalId,
    goalText: input.goalText,
    predicate: input.predicate ?? `Goal remains true: ${input.goalText}`,
    command: input.command,
    status: "active",
    createdAt: prior?.createdAt ?? now.toISOString(),
    history: prior?.history ?? [],
  };
  await saveSentinels(dataDir, {
    version: 1,
    sentinels: [sentinel, ...store.sentinels.filter((s) => s.id !== sentinel.id)],
  });
  return sentinel;
}

export async function retireSentinel(
  dataDir: string,
  input: { id: string; reason: string; now?: Date },
): Promise<StandingGoalSentinel | null> {
  if (!input.reason.trim()) return null;
  const store = await loadSentinels(dataDir);
  const now = input.now ?? new Date();
  let retired: StandingGoalSentinel | null = null;
  const sentinels = store.sentinels.map((s) => {
    if (s.id !== input.id) return s;
    retired = { ...s, status: "retired", retiredAt: now.toISOString(), retireReason: input.reason };
    return retired;
  });
  if (!retired) return null;
  await saveSentinels(dataDir, { version: 1, sentinels });
  return retired;
}

export async function runSentinels(dataDir: string, now: Date = new Date(), deps: SentinelRunDeps = {}): Promise<SentinelRun[]> {
  const store = await loadSentinels(dataDir);
  const results: SentinelRun[] = [];
  const next: StandingGoalSentinel[] = [];
  for (const sentinel of store.sentinels) {
    if (sentinel.status !== "active") {
      next.push(sentinel);
      continue;
    }
    const result = await runOneSentinel(dataDir, sentinel, now, deps);
    results.push(result);
    next.push({ ...sentinel, history: [...sentinel.history, { at: now.toISOString(), status: result.status, output: result.output }].slice(-20) });
  }
  await saveSentinels(dataDir, { version: 1, sentinels: next });
  return results;
}

export async function runDailySentinels(dataDir: string, now: Date = new Date(), deps: SentinelRunDeps = {}): Promise<SentinelRun[]> {
  const today = now.toISOString().slice(0, 10);
  try {
    if ((await readFile(sentinelLastRunPath(dataDir), "utf8")).trim() === today) return [];
  } catch {
    /* first scheduled run */
  }
  const store = await loadSentinels(dataDir);
  if (!store.sentinels.some((sentinel) => sentinel.status === "active")) return [];
  const results = await runSentinels(dataDir, now, deps);
  await mkdir(dataDir, { recursive: true });
  await writeFile(sentinelLastRunPath(dataDir), `${today}\n`, "utf8");
  return results;
}

export function formatSentinels(store: SentinelStore): string {
  const rows = store.sentinels.sort((a, b) => a.id.localeCompare(b.id));
  return ["Standing goal sentinels", "", ...(rows.length ? rows.map(formatSentinel) : ["  - no sentinels yet"])].join("\n");
}

export function formatSentinel(s: StandingGoalSentinel): string {
  const last = s.history.at(-1);
  const suffix = last ? ` · last ${last.status}: ${firstLine(last.output)}` : "";
  const retired = s.status === "retired" ? ` · retired: ${s.retireReason}` : "";
  return `  - ${s.id}: ${s.status} · #${s.goalId} ${s.predicate} · check: ${s.command}${suffix}${retired}`;
}

async function runOneSentinel(dataDir: string, sentinel: StandingGoalSentinel, now: Date, deps: SentinelRunDeps): Promise<SentinelRun> {
  try {
    const { stdout, stderr } = await execAsync(sentinel.command, { timeout: 20_000 });
    const output = firstLine(`${stdout}${stderr}`.trim() || "ok");
    await recordTrustOutcome(dataDir, { workflowId: `standing-goal.sentinel.${sentinel.id}`, outcome: "pass", reason: output, now });
    return { sentinel, status: "pass", output };
  } catch (err) {
    const output = firstLine(err instanceof Error ? err.message : String(err));
    await recordTrustOutcome(dataDir, { workflowId: `standing-goal.sentinel.${sentinel.id}`, outcome: "fail", reason: output, now });
    await appendWake(dataDir, sentinel, output, now);
    await notifyViolation(dataDir, sentinel, output, deps);
    return { sentinel, status: "fail", output };
  }
}

async function notifyViolation(dataDir: string, sentinel: StandingGoalSentinel, output: string, deps: SentinelRunDeps): Promise<void> {
  const notify = deps.notify ?? sendNotification;
  try {
    await notify({
      title: "Vanta · standing goal violated",
      message: `#${sentinel.goalId} ${firstLine(sentinel.predicate)} — ${output}`,
      dataDir,
      cwd: deps.cwd ?? dirname(dataDir),
      notificationType: "standing_goal_violation",
    });
  } catch {
    /* notification failure must not erase the recorded violation */
  }
}

async function appendWake(dataDir: string, sentinel: StandingGoalSentinel, output: string, now: Date): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await appendFile(sentinelWakePath(dataDir), `${JSON.stringify({ createdAt: now.toISOString(), sentinelId: sentinel.id, goalId: sentinel.goalId, predicate: sentinel.predicate, output })}\n`, "utf8");
}

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}
