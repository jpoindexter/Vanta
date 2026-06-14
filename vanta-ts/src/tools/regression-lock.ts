import { z } from "zod";
import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";
import type { Tool, ToolResult, ToolContext } from "./types.js";
import { appendLock, latestLocks, findLock, type Lock } from "../verify/store.js";
import { gradeRun, formatLock, formatCheckReport, type CheckResult } from "../verify/check.js";

const exec = promisify(execCb);
const CHECK_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 4_000_000;

const Args = z.object({
  action: z.enum(["lock", "check", "list"]),
  id: z.string().min(1).optional(),
  claim: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  expect: z.string().min(1).optional(),
});

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "lock";
}

/** Run a stored check command; combined stdout+stderr, exit code (0 on success). */
async function runCommand(command: string): Promise<{ exitCode: number; output: string }> {
  try {
    const { stdout, stderr } = await exec(command, {
      timeout: CHECK_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });
    return { exitCode: 0, output: stdout + stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    return { exitCode: e.code ?? 1, output: (e.stdout ?? "") + (e.stderr ?? "") + (e.message ?? "") };
  }
}

function doLock(args: z.infer<typeof Args>, now: number): ToolResult {
  if (!args.claim || !args.command || !args.expect) {
    return { ok: false, output: "lock needs claim, command, and expect" };
  }
  const id = args.id ?? slug(args.claim);
  const lock: Lock = {
    id,
    claim: args.claim,
    command: args.command,
    expect: args.expect,
    status: "locked",
    created: now,
    updated: now,
  };
  appendLock(lock);
  return { ok: true, output: `Locked "${id}": ${args.claim}\n  proof: ${args.command} ⊇ "${args.expect}"` };
}

async function checkOne(lock: Lock, ctx: ToolContext, now: number): Promise<CheckResult | null> {
  const approved = await ctx.requestApproval(
    `Run regression check "${lock.id}": ${lock.command}`,
    "executes a stored shell command to re-verify a locked claim",
  );
  if (!approved) return null;
  const result = gradeRun(lock, await runCommand(lock.command));
  appendLock({ ...lock, status: result.status, detail: result.detail, updated: now });
  return result;
}

async function doCheck(args: z.infer<typeof Args>, ctx: ToolContext, now: number): Promise<ToolResult> {
  const locks = args.id ? [findLock(args.id)].filter((l): l is Lock => Boolean(l)) : latestLocks();
  if (locks.length === 0) {
    return { ok: false, output: args.id ? `no lock "${args.id}"` : "no regression locks — lock one first" };
  }
  const results: CheckResult[] = [];
  for (const lock of locks) {
    const r = await checkOne(lock, ctx, now);
    if (r) results.push(r);
  }
  const regressed = results.some((r) => r.status === "regressed");
  return { ok: !regressed, output: formatCheckReport(results) };
}

function doList(): ToolResult {
  const locks = latestLocks();
  if (locks.length === 0) return { ok: true, output: "No regression locks yet." };
  return { ok: true, output: [`${locks.length} regression lock(s):`, ...locks.map(formatLock)].join("\n") };
}

export const regressionLockTool: Tool = {
  schema: {
    name: "regression_lock",
    description:
      "Lock a verified behavior so a later change can't silently break it. " +
      "action:lock {claim, command, expect} records a claim + the shell command that proves it + the substring its output must contain. " +
      "action:check [id] re-runs the locked command(s) and flags a regression if the substring is gone or the command fails (each run is approval-gated). " +
      "action:list shows every lock and its current status.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["lock", "check", "list"] },
        id: { type: "string", description: "lock id (check: limit to one; lock: optional explicit id)" },
        claim: { type: "string", description: "lock: the behavior being proven" },
        command: { type: "string", description: "lock: shell command that proves it" },
        expect: { type: "string", description: "lock: substring the command output must contain" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) =>
    a.action === "lock"
      ? `lock regression check: ${String(a.command ?? "")}`
      : a.action === "check"
        ? "run regression checks"
        : "list regression locks",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'regression_lock needs an "action" (lock|check|list)' };
    const args = parsed.data;
    const now = Date.now();
    if (args.action === "lock") return doLock(args, now);
    if (args.action === "check") return doCheck(args, ctx, now);
    return doList();
  },
};
