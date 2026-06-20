import { z } from "zod";
import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { spawnSubagent } from "../subagent/spawn.js";
import { resolveProvider } from "../providers/index.js";
import { buildRegistry } from "./index.js";
import { appendLock } from "../verify/store.js";
import { selfCorrect, type Failure, type RunResult, type SelfCorrectResult } from "../selfcorrect/loop.js";

// self_correct — the one-loop self-correction surface: confirm a failure, drive a
// kernel-gated fix subagent, rerun the failing input, and lock a regression on
// success. The fix worker's edits are each assessed by the kernel (the "gated
// diff, approve" step); the failing command is assessed via describeForSafety.

const exec = promisify(execCb);
const TIMEOUT_MS = 60_000;
const MAX_BUFFER = 4_000_000;
const MAX_FAILURE_OUTPUT = 2_000;

const Args = z.object({
  command: z.string().min(1),
  expect: z.string().min(1),
});

async function runCommand(command: string): Promise<RunResult> {
  try {
    const { stdout, stderr } = await exec(command, { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER });
    return { exitCode: 0, output: stdout + stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    return { exitCode: e.code ?? 1, output: (e.stdout ?? "") + (e.stderr ?? "") + (e.message ?? "") };
  }
}

function fixInstruction(failure: Failure, failureOutput: string): string {
  return [
    "A command is failing and must be corrected.",
    "",
    `Command: ${failure.command}`,
    `Success criterion: it must exit 0 and its output must contain "${failure.expect}".`,
    "",
    "Failure output:",
    failureOutput.slice(0, MAX_FAILURE_OUTPUT),
    "",
    "Diagnose the root cause, then make the SMALLEST correct code change to fix it.",
    "Use your edit tools — each change is safety-gated. Do NOT weaken tests or",
    "assertions to force a pass; fix the actual cause. End with a one-line summary",
    "of the root cause and the fix.",
  ].join("\n");
}

async function runFixSubagent(failure: Failure, failureOutput: string, ctx: ToolContext): Promise<{ summary: string }> {
  const provider = resolveProvider(process.env);
  const registry = buildRegistry({ exclude: ["delegate", "self_correct"] });
  const outcome = await spawnSubagent({
    goal: `Fix the failing command: ${failure.command}`,
    instruction: fixInstruction(failure, failureOutput),
    deps: { provider, safety: ctx.safety, registry, root: ctx.root, requestApproval: ctx.requestApproval },
  });
  return { summary: outcome.finalText };
}

function formatResult(r: SelfCorrectResult): string {
  const lines = [`self_correct: ${r.stage} — ${r.detail}`];
  if (r.fixSummary) lines.push(`  fix: ${r.fixSummary}`);
  if (r.lockId) lines.push(`  regression locked: ${r.lockId} (re-verify with regression_lock check ${r.lockId})`);
  return lines.join("\n");
}

export const selfCorrectTool: Tool = {
  schema: {
    name: "self_correct",
    description:
      "Self-correct a failing command in one loop: confirm the failure, drive a fix " +
      "(diagnose + gated edits), rerun the failing input, and lock a regression test on success. " +
      "command = the failing shell command; expect = the substring its output must contain when fixed.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "the failing shell command to correct" },
        expect: { type: "string", description: "substring the command's output must contain once fixed" },
      },
      required: ["command", "expect"],
    },
  },
  describeForSafety: (a) => `run self-correction loop: ${String(a.command ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'self_correct needs "command" and "expect" strings' };
    const result = await selfCorrect(
      { command: parsed.data.command, expect: parsed.data.expect },
      { run: runCommand, fix: (f, out) => runFixSubagent(f, out, ctx), lock: (l) => appendLock(l), now: Date.now },
    );
    return { ok: result.stage === "fixed" || result.stage === "no-failure", output: formatResult(result) };
  },
};
