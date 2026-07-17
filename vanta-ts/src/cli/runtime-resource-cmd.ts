import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  exportRuntimeResourceUsage,
  listRuntimeResourceUsage,
  pruneRuntimeResourceUsage,
  summarizeRuntimeResourceUsage,
  type RuntimeResourceFilter,
  type RuntimeResourceUsageSummary,
} from "../cost/resource-ledger.js";

type Log = (line: string) => void;
type RuntimeResourceCommandDeps = { log?: Log };
type CommandContext = { dataDir: string; args: string[]; log: Log };

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function required(args: string[], name: string): string {
  const value = flag(args, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function filterFrom(args: string[]): RuntimeResourceFilter {
  return {
    ...(flag(args, "--task") ? { taskId: flag(args, "--task") } : {}),
    ...(flag(args, "--model") ? { model: flag(args, "--model") } : {}),
    ...(flag(args, "--host") ? { hostId: flag(args, "--host") } : {}),
    ...(flag(args, "--session") ? { sessionId: flag(args, "--session") } : {}),
  };
}

function usage(log: Log): number {
  log("Usage: vanta local-model usage list|summary [--task <id>] [--model <id>] [--host <id>] [--session <id>] [--json]");
  log("       vanta local-model usage export --format <json|csv> --out <path> [filters]");
  log("       vanta local-model usage prune --before <iso-date> --confirm");
  return 1;
}

function formatSummary(summary: RuntimeResourceUsageSummary): string {
  if (!summary.calls) return "No runtime resource calls recorded for this window.";
  return [
    `Runtime calls: ${summary.calls} · ${summary.inputTokens} in / ${summary.outputTokens} out · ${summary.requestLatencyMs}ms request · ${summary.activeDurationMs}ms active`,
    `Failures: ${summary.failures} · calls with missing telemetry: ${summary.missingTelemetryCalls}`,
    `By model: ${Object.entries(summary.byModel).map(([key, count]) => `${key}=${count}`).join(", ")}`,
    `By host: ${Object.entries(summary.byHost).map(([key, count]) => `${key}=${count}`).join(", ")}`,
  ].join("\n");
}

async function listCommand(context: CommandContext): Promise<number> {
  const rows = await listRuntimeResourceUsage(context.dataDir, filterFrom(context.args));
  context.log(context.args.includes("--json") ? JSON.stringify(rows) : exportRuntimeResourceUsage(rows, "csv").trimEnd());
  return 0;
}

async function summaryCommand(context: CommandContext): Promise<number> {
  const rows = await listRuntimeResourceUsage(context.dataDir, filterFrom(context.args));
  const summary = summarizeRuntimeResourceUsage(rows);
  context.log(context.args.includes("--json") ? JSON.stringify(summary) : formatSummary(summary));
  return 0;
}

async function exportCommand(context: CommandContext): Promise<number> {
  const format = required(context.args, "--format");
  if (format !== "json" && format !== "csv") throw new Error("--format must be json or csv");
  const out = required(context.args, "--out");
  const rows = await listRuntimeResourceUsage(context.dataDir, filterFrom(context.args));
  await writeFile(out, exportRuntimeResourceUsage(rows, format), { encoding: "utf8", mode: 0o600 });
  context.log(`Exported ${rows.length} runtime resource row(s) to ${out}.`);
  return 0;
}

async function pruneCommand(context: CommandContext): Promise<number> {
  if (!context.args.includes("--confirm")) {
    context.log("Refusing to prune runtime usage without --confirm.");
    return 1;
  }
  const result = await pruneRuntimeResourceUsage(context.dataDir, required(context.args, "--before"));
  context.log(`Pruned ${result.removed} runtime resource row(s); retained ${result.retained}.`);
  return 0;
}

const COMMANDS: Record<string, (context: CommandContext) => Promise<number>> = {
  list: listCommand,
  summary: summaryCommand,
  export: exportCommand,
  prune: pruneCommand,
};

export async function runRuntimeResourceCommand(root: string, rest: string[], deps: RuntimeResourceCommandDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  const [command = "summary", ...args] = rest;
  const handler = COMMANDS[command];
  if (!handler) return usage(log);
  try {
    return await handler({ dataDir: join(root, ".vanta"), args, log });
  } catch (error) {
    log(`Runtime usage ${command} failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
