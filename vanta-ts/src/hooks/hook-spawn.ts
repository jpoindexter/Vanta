import { spawn, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import type { ShellHookResult } from "./shell-hook-run.js";
import { buildSafeChildEnv } from "../exec/child-env.js";
import { isSandboxError, maybeSandbox } from "../sandbox/run.js";
import { resolveShellInvocation } from "../platform/shell.js";

// Child-process spawn machinery for shell/exec hooks. Extracted from
// shell-hook-run.ts (size gate). Behavior-preserving: identical timeout,
// fail-open, and stdin-piping semantics. `ShellHookResult` is imported as a
// type only (erased at compile), so there is no runtime import cycle.

/** Default per-hook timeout (ms) when a hook declares none. */
export const DEFAULT_TIMEOUT_MS = 10_000;

type ChildProc = ReturnType<typeof spawn>;
type HookSpawnOpts = { timeoutMs?: number; cwd?: string };

/**
 * Wire a spawned hook child: capture stdout/stderr, enforce the timeout, pipe
 * the JSON context to stdin, resolve with the exit code + output. A spawn
 * failure resolves to code 0 (fail-open on a broken hook); a timeout to 124.
 * Shared by the shell and exec spawn paths so they have identical semantics.
 */
function pipeChild(child: ChildProc, contextJson: string, timeoutMs: number): Promise<ShellHookResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: 124, stdout, stderr: `${stderr}\n[hook timed out]` });
    }, timeoutMs);
    child.stdout?.on("data", (d) => { stdout += String(d); });
    child.stderr?.on("data", (d) => { stderr += String(d); });
    child.stdin?.on("error", () => {});
    child.on("error", () => { clearTimeout(timer); resolve({ code: 0, stdout, stderr }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 0, stdout, stderr }); });
    child.stdin?.end(contextJson);
  });
}

/**
 * Spawn one shell hook, piping the JSON context to its stdin. Resolves with the
 * exit code + captured output. A spawn failure resolves to code 0 (fail-open on
 * a broken shell); a timeout resolves to code 124.
 */
export async function runShellHook(
  command: string,
  contextJson: string,
  opts: HookSpawnOpts = {},
): Promise<ShellHookResult> {
  const invocation = resolveShellInvocation(command, { env: process.env });
  return runHookChild(invocation.cmd, invocation.args, contextJson, opts);
}

/**
 * Spawn one exec-form hook DIRECTLY via execFile (no shell), piping the JSON
 * context to its stdin. `file` is spawned with `args` argv verbatim — the
 * command string is never interpreted by a shell, so there is no shell
 * injection/quoting hazard. Same timeout/fail-open semantics as runShellHook.
 */
export async function runExecHook(
  file: string,
  args: string[],
  contextJson: string,
  opts: HookSpawnOpts = {},
): Promise<ShellHookResult> {
  return runHookChild(file, args, contextJson, opts, true);
}

function executableOnPath(name: string, env: NodeJS.ProcessEnv): boolean {
  return (env.PATH ?? "").split(delimiter).some((dir) => dir && existsSync(join(dir, name)));
}

function hookSandboxEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const supported =
    process.platform === "darwin" ||
    (process.platform === "linux" && executableOnPath("bwrap", env)) ||
    env.VANTA_SANDBOX === "1";
  return supported
    ? { ...env, VANTA_SANDBOX: "1", VANTA_SANDBOX_NET: "0" }
    : env;
}

async function runHookChild(
  file: string,
  args: string[],
  contextJson: string,
  opts: HookSpawnOpts,
  execForm = false,
): Promise<ShellHookResult> {
  const root = resolve(opts.cwd ?? process.cwd());
  const env = hookSandboxEnv(process.env);
  const wrapped = await maybeSandbox({ env, root, workdir: root, baseCmd: file, baseArgs: args });
  if (isSandboxError(wrapped)) {
    return { code: 126, stdout: "", stderr: `[hook refused: ${wrapped.error}]` };
  }
  const safeEnv = buildSafeChildEnv(process.env);
  const child = execForm
    ? execFile(wrapped.cmd, wrapped.args, { cwd: root, env: safeEnv })
    : spawn(wrapped.cmd, wrapped.args, { cwd: root, env: safeEnv });
  try {
    const result = await pipeChild(child, contextJson, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    // sandbox-exec itself launched successfully, then reports a missing inner
    // executable as EX_OSERR (71). Preserve the existing broken-hook fail-open
    // contract, which previously arrived through the direct execFile error event.
    if (execForm && result.code === 71 && /execvp\(\).*No such file or directory/i.test(result.stderr)) {
      return { ...result, code: 0 };
    }
    return result;
  } finally {
    await wrapped.cleanup?.();
  }
}
