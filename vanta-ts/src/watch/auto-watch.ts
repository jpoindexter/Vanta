import { exec } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { applyTrustGate, loadTrustLedger, loadTrustPolicy } from "../autonomy/trust.js";
import { decideAutonomy, loadAutonomyContract, logAutonomyDecision, type AutonomyAction } from "../autonomy/contract.js";

const execAsync = promisify(exec);

export const AutoWatchSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["repo", "issue", "email", "calendar", "generic"]).default("generic"),
  command: z.string().min(1),
  risk: z.enum(["low", "medium", "high"]).default("medium"),
  draft: z.string().default("Review this change and decide the next response."),
  lastHash: z.string().optional(),
  lastOutput: z.string().optional(),
});
export type AutoWatch = z.infer<typeof AutoWatchSchema>;

export const AutoWatchStoreSchema = z.object({ version: z.literal(1).default(1), watchers: z.array(AutoWatchSchema).default([]) });
export type AutoWatchStore = z.infer<typeof AutoWatchStoreSchema>;
export type WatchChange = { watch: AutoWatch; output: string; draft: string; lane: string; reason: string };

export function autoWatchPath(dataDir: string): string {
  return join(dataDir, "auto-watch.json");
}

export async function loadAutoWatch(dataDir: string): Promise<AutoWatchStore> {
  try {
    const parsed = AutoWatchStoreSchema.safeParse(JSON.parse(await readFile(autoWatchPath(dataDir), "utf8")));
    return parsed.success ? parsed.data : { version: 1, watchers: [] };
  } catch {
    return { version: 1, watchers: [] };
  }
}

export async function saveAutoWatch(dataDir: string, store: AutoWatchStore): Promise<string> {
  await mkdir(dataDir, { recursive: true });
  const file = autoWatchPath(dataDir);
  await writeFile(file, `${JSON.stringify(AutoWatchStoreSchema.parse(store), null, 2)}\n`, "utf8");
  return file;
}

export async function addAutoWatch(dataDir: string, input: Omit<AutoWatch, "lastHash" | "lastOutput">): Promise<AutoWatch> {
  const watch = AutoWatchSchema.parse(input);
  const store = await loadAutoWatch(dataDir);
  await saveAutoWatch(dataDir, { version: 1, watchers: [watch, ...store.watchers.filter((w) => w.id !== watch.id)] });
  return watch;
}

export async function runAutoWatch(dataDir: string, run: (cmd: string) => Promise<string> = runCommand): Promise<WatchChange[]> {
  const store = await loadAutoWatch(dataDir);
  const changes: WatchChange[] = [];
  const next: AutoWatch[] = [];
  for (const watch of store.watchers) {
    const output = await run(watch.command).catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);
    const hash = hashOutput(output);
    if (watch.lastHash && watch.lastHash !== hash) changes.push(await changeFor(dataDir, watch, output));
    next.push({ ...watch, lastHash: hash, lastOutput: output.slice(0, 2000) });
  }
  await saveAutoWatch(dataDir, { version: 1, watchers: next });
  return changes;
}

export function formatAutoWatch(store: AutoWatchStore): string {
  if (!store.watchers.length) return "auto-watch: no watchers";
  return store.watchers.map((w) => `${w.id} · ${w.kind} · ${w.risk} · ${w.command}`).join("\n");
}

export function formatWatchChange(c: WatchChange): string {
  return [`watch ${c.watch.id}: ${c.lane}`, `Reason: ${c.reason}`, `Draft: ${c.draft}`, `Output: ${firstLine(c.output)}`].join("\n");
}

async function changeFor(dataDir: string, watch: AutoWatch, output: string): Promise<WatchChange> {
  const action: AutonomyAction = {
    kind: `auto-watch.${watch.kind}`,
    risk: watch.risk,
    summary: `draft response for ${watch.id}`,
    source: watch.id,
  };
  const decision = applyTrustGate(decideAutonomy(await loadAutonomyContract(dataDir), action), await loadTrustLedger(dataDir), await loadTrustPolicy(dataDir));
  await logAutonomyDecision(dataDir, decision);
  return { watch, output, draft: `${watch.draft}\n\nChange:\n${output.slice(0, 1000)}`, lane: decision.lane, reason: decision.reason };
}

async function runCommand(cmd: string): Promise<string> {
  const { stdout, stderr } = await execAsync(cmd, { timeout: 20_000 });
  return `${stdout}${stderr}`.trim();
}

function hashOutput(output: string): string {
  return createHash("sha256").update(output).digest("hex").slice(0, 16);
}

function firstLine(text: string): string {
  return (text.split("\n")[0] ?? "").slice(0, 160);
}
