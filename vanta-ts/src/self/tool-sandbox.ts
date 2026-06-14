import { execFile } from "node:child_process";
import { posix } from "node:path";
import { promisify } from "node:util";
import { classifyPath } from "./compartments.js";
import { isSandboxError, maybeSandbox } from "../sandbox/run.js";

const run = promisify(execFile);
const TIMEOUT_MS = 60_000;
const MAX_OUTPUT = 1024 * 1024;
const TOOL_RE = /^vanta-ts\/src\/tools\/[^/]+\.ts$/;

export type ToolSandboxPlan =
  | { ok: true; toolPath: string; command: string }
  | { ok: false; reason: string };

export type ToolSandboxResult = {
  ok: boolean;
  output: string;
};

function normalizeRepoPath(path: string): string | null {
  const raw = path.trim().replace(/\\/g, "/");
  if (!raw || raw.startsWith("/") || raw.includes("\0")) return null;
  if (raw.split("/").includes("..")) return null;
  const normalized = posix.normalize(raw);
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) return null;
  return normalized;
}

function defaultCommand(toolPath: string): string {
  const base = toolPath.slice("vanta-ts/src/tools/".length, -".ts".length);
  return `npm --prefix vanta-ts test -- src/tools/${base}.test.ts`;
}

function isAllowedTestCommand(command: string): boolean {
  return (
    /^npm --prefix vanta-ts test -- src\/tools\/[^;&|]+\.test\.ts$/.test(command) ||
    command === "npm --prefix vanta-ts run typecheck"
  );
}

export function planToolSandboxTest(input: { toolPath?: string; command?: string }): ToolSandboxPlan {
  const toolPath = normalizeRepoPath(input.toolPath ?? "");
  if (!toolPath) return { ok: false, reason: "toolPath must be a repo-relative path" };
  if (!TOOL_RE.test(toolPath)) {
    return { ok: false, reason: "sandbox_test needs a limb tool path under vanta-ts/src/tools/*.ts" };
  }
  const compartment = classifyPath(toolPath);
  if (compartment.compartment !== "limbs") {
    return { ok: false, reason: `sandbox_test only accepts limb tool paths; got ${compartment.compartment}` };
  }
  const command = (input.command?.trim() || defaultCommand(toolPath));
  if (!isAllowedTestCommand(command)) {
    return {
      ok: false,
      reason: "sandbox_test command must be a bounded vanta-ts test or typecheck command",
    };
  }
  return { ok: true, toolPath, command };
}

function combine(stdout?: string, stderr?: string): string {
  return [stdout, stderr].filter(Boolean).join("\n").trim();
}

export async function runToolSandboxTest(root: string, command: string): Promise<ToolSandboxResult> {
  const env = { ...process.env, VANTA_SANDBOX: "1" };
  const sb = await maybeSandbox({ env, root, baseCmd: "sh", baseArgs: ["-c", command] });
  if (isSandboxError(sb)) return { ok: false, output: sb.error };
  try {
    const { stdout, stderr } = await run(sb.cmd, sb.args, {
      cwd: root,
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT,
    });
    return { ok: true, output: combine(stdout, stderr) || "(command produced no output)" };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string; killed?: boolean };
    const detail = e.killed ? `timed out after ${TIMEOUT_MS}ms` : e.message;
    return { ok: false, output: combine(e.stdout, e.stderr) || detail };
  } finally {
    await sb.cleanup?.();
  }
}
