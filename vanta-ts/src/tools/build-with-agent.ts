import { z } from "zod";
import { existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveShellInvocation } from "../platform/shell.js";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { buildAgentInvocation, runExternalAgent, type Invocation } from "../agents/external-cli.js";
import { parseClaudeStreamLine } from "../agents/claude-stream.js";
import { runBuildLoop, type BuildAttempt, type VerifyResult } from "../agents/build-loop.js";

// VANTA-A2A-BUILD-LOOP — the cofounder loop as one tool: delegate a build to another agent
// (coding mode), VERIFY the result (expected files exist + an optional command exits 0), and
// re-delegate a targeted fix if it fails, up to maxIters. The loop itself is pure
// (agents/build-loop.ts); this wires delegate=call_agent(coding) and verify=files/command.

const exec = promisify(execFile);
const BUILD_TIMEOUT_MS = 600_000;
const VERIFY_TIMEOUT_MS = 120_000;

const Args = z.object({
  agent: z.string(),
  task: z.string(),
  expectFiles: z.array(z.string()).optional(),
  verifyCmd: z.string().optional(),
  maxIters: z.number().int().min(1).max(6).optional(),
});

const str = (v: unknown): string => String(v ?? "");

/** A claude build streams stream-json → live progress + final result. */
async function delegateClaude(ctx: ToolContext, inv: Invocation): Promise<BuildAttempt> {
  let result = "";
  let isError = false;
  let last = "";
  const onChunk = (line: string) => {
    const ev = parseClaudeStreamLine(line);
    if (ev.progress && ev.progress !== last) { last = ev.progress; ctx.onProgress?.(`⋯ claude: ${ev.progress}`); }
    if (ev.result !== undefined) { result = ev.result; isError = ev.isError === true; }
  };
  const res = await runExternalAgent(inv, { cwd: ctx.root, onChunk, timeoutMs: BUILD_TIMEOUT_MS });
  if (res.notInstalled) return { ok: false, output: "claude CLI not found on PATH" };
  return { ok: res.ok && !isError && result !== "", output: result || `did not finish: ${res.stderr.slice(0, 300)}` };
}

/** Delegate one build attempt to the agent in coding mode. */
async function delegateBuild(ctx: ToolContext, agent: string, instruction: string): Promise<BuildAttempt> {
  const inv = buildAgentInvocation(agent, instruction, { coding: true });
  if (!inv) return { ok: false, output: `unknown agent "${agent}"` };
  if (agent === "claude") return delegateClaude(ctx, inv);
  const res = await runExternalAgent(inv, { cwd: ctx.root, onChunk: ctx.onProgress, timeoutMs: BUILD_TIMEOUT_MS });
  if (res.notInstalled) return { ok: false, output: `${agent} not installed` };
  return { ok: res.ok, output: (res.stdout.trim() || res.stderr.trim()).slice(0, 600) };
}

/** Verify the build: expected files exist, then (if given) a verify command exits 0. */
async function verifyBuild(ctx: ToolContext, expectFiles?: string[], verifyCmd?: string): Promise<VerifyResult> {
  const missing = (expectFiles ?? []).filter((f) => !existsSync(isAbsolute(f) ? f : join(ctx.root, f)));
  if (missing.length) return { ok: false, detail: `expected file(s) missing: ${missing.join(", ")}` };
  if (!verifyCmd) return { ok: true, detail: "" };
  try {
    const shell = resolveShellInvocation(verifyCmd);
    await exec(shell.cmd, shell.args, { cwd: ctx.root, timeout: VERIFY_TIMEOUT_MS });
    return { ok: true, detail: "" };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, detail: `verify command failed: ${(err.stderr || err.stdout || String(e)).slice(0, 200)}` };
  }
}

export const buildWithAgentTool: Tool = {
  schema: {
    name: "build_with_agent",
    description:
      "Delegate a BUILD to another coding agent and CLOSE THE LOOP: it builds (coding mode, streams progress), then Vanta VERIFIES (the expectFiles exist + an optional verifyCmd exits 0), and re-delegates a targeted fix if verification fails — up to maxIters. Use this (over a bare call_agent) when the user wants something built and actually working. Pass {agent, task, expectFiles?, verifyCmd?, maxIters?}.",
    parameters: {
      type: "object",
      properties: {
        agent: { type: "string", description: "Which agent CLI builds it (e.g. claude)" },
        task: { type: "string", description: "What to build" },
        expectFiles: { type: "array", items: { type: "string" }, description: "Files that must exist after a successful build (relative to cwd)" },
        verifyCmd: { type: "string", description: "Optional shell command that must exit 0 to count as verified (e.g. 'npm test', 'node check.js')" },
        maxIters: { type: "number", description: "Max build→verify→fix attempts (default 3, max 6)" },
      },
      required: ["agent", "task"],
    },
  },
  describeForSafety: (a) => {
    const o = a as Record<string, unknown>;
    return `build with agent ${str(o.agent)}; verify: ${str(o.verifyCmd) || "file check"}`.slice(0, 200);
  },
  async execute(raw, ctx: ToolContext): Promise<ToolResult> {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "build_with_agent needs {agent, task, expectFiles?, verifyCmd?, maxIters?}" };
    const { agent, task, expectFiles, verifyCmd, maxIters } = parsed.data;
    const detail = `delegates a build to ${agent} (auto-accepts edits), verifies${verifyCmd ? ` via: ${verifyCmd}` : " files exist"}, and re-delegates fixes up to ${maxIters ?? 3}×`;
    const approved = await ctx.requestApproval(`build with ${agent}: ${task.slice(0, 80)}`, detail, "build_with_agent");
    if (!approved) return { ok: false, output: "build_with_agent: declined" };
    const r = await runBuildLoop(task, {
      delegate: (instr) => delegateBuild(ctx, agent, instr),
      verify: () => verifyBuild(ctx, expectFiles, verifyCmd),
      maxIters,
      onStep: (m) => ctx.onProgress?.(m),
    });
    const head = r.ok ? `✓ built with ${agent} in ${r.iterations} attempt(s)` : `✗ not verified after ${r.iterations} attempt(s)`;
    return { ok: r.ok, output: `${head}\n${r.log.join("\n")}` };
  },
};
