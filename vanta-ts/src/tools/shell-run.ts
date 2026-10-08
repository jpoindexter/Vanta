import { execFile, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";
import type { ToolContext, ToolResult } from "./types.js";
import { combineOutput, formatRunFailure, formatRunSuccess, withTimingNote, type RunError } from "./shell-output.js";
import { prepareGitProcess } from "../git/process.js";
import { directGitArgs } from "../git/shell.js";
import { resolveExecBackend, wrapExec } from "../exec/backend.js";
import { isSandboxError } from "../sandbox/run.js";
import { resolveShellInvocation } from "../platform/shell.js";
import { loadSettings } from "../settings/store.js";
import { resolveSshTarget, buildSshArgs } from "../ssh/config.js";
import { payloadSha256 } from "../effects/execute-effect.js";
import { effectOperationKey } from "../effects/gate-context.js";

const run = promisify(execFile);
export function backgroundEffectSeed(command: string, ctx: ToolContext) {
  return { host: "tool-host", kind: "shell.background.launch", targetClass: "sandboxed-background-process",
    payloadSha256: payloadSha256(command), idempotencyKey: effectOperationKey("shell-background", ctx) };
}
type LocalRun = {
  command: string; root: string; workdir: string; pfx: string;
  sandboxWritableDirs?: readonly string[]; sandboxEnv: NodeJS.ProcessEnv; childOptions: ExecFileOptions;
};

export async function runRemote(opts: { target: string; command: string; root: string; pfx: string; timeoutMs: number }): Promise<ToolResult> {
  const settings = await loadSettings(opts.root, process.env);
  const profile = resolveSshTarget(opts.target, settings.sshConfigs);
  if (!profile) return { ok: false, output: `unknown ssh profile "${opts.target}" — configure it in settings.sshConfigs, or pass an explicit user@host` };
  try {
    const { stdout, stderr } = await run("ssh", buildSshArgs(profile, opts.command), { timeout: opts.timeoutMs, maxBuffer: 1024 * 1024 });
    return formatRunSuccess(opts.command, combineOutput(stdout, stderr), opts.pfx);
  } catch (err) { return formatRunFailure(opts.command, err as RunError, opts.pfx); }
}

/** Git preparation retains the selected execution location and original OS sandbox. */
export async function runLocal(opts: LocalRun): Promise<ToolResult> {
  try {
    const gitArgs = directGitArgs(opts.command);
    if (gitArgs && resolveExecBackend(process.env) !== "local") return { ok: false, output: "Git shell hardening currently supports local execution; refusing to change the selected remote execution backend" };
    const git = gitArgs ? await prepareGitProcess(gitArgs, opts.childOptions) : null;
    const local = git ? { cmd: "git", args: git.args } : localInvocation(opts.command);
    const sb = await wrapExec({ env: opts.sandboxEnv, root: opts.root, workdir: opts.workdir,
      baseCmd: local.cmd, baseArgs: local.args, additionalWritableDirs: opts.sandboxWritableDirs });
    if (isSandboxError(sb)) return { ok: false, output: opts.pfx + sb.error };
    return await runWrapped(opts, sb, git?.options ?? opts.childOptions);
  } catch (error) { return formatRunFailure(opts.command, error as RunError, opts.pfx); }
}

function localInvocation(command: string): { cmd: string; args: string[] } {
  return resolveExecBackend(process.env) === "docker"
    ? { cmd: "sh", args: ["-c", command] } : resolveShellInvocation(command);
}

async function runWrapped(opts: LocalRun, sb: { cmd: string; args: string[]; cleanup?: () => Promise<void> }, child: ExecFileOptions): Promise<ToolResult> {
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await run(sb.cmd, sb.args, child);
    return withTimingNote(formatRunSuccess(opts.command, combineOutput(String(stdout), String(stderr)), opts.pfx), Date.now() - startedAt);
  } catch (error) {
    return withTimingNote(formatRunFailure(opts.command, error as RunError, opts.pfx), Date.now() - startedAt);
  } finally { await sb.cleanup?.(); }
}
