import { spawn, execFile } from "node:child_process";
import type { ShellHookResult } from "./shell-hook-run.js";

// Child-process spawn machinery for shell/exec hooks. Extracted from
// shell-hook-run.ts (size gate). Behavior-preserving: identical timeout,
// fail-open, and stdin-piping semantics. `ShellHookResult` is imported as a
// type only (erased at compile), so there is no runtime import cycle.

/** Default per-hook timeout (ms) when a hook declares none. */
export const DEFAULT_TIMEOUT_MS = 10_000;

type ChildProc = ReturnType<typeof spawn>;

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
export function runShellHook(
  command: string,
  contextJson: string,
  opts: { timeoutMs?: number; cwd?: string } = {},
): Promise<ShellHookResult> {
  const child = spawn(command, { shell: true, cwd: opts.cwd });
  return pipeChild(child, contextJson, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

/**
 * Spawn one exec-form hook DIRECTLY via execFile (no shell), piping the JSON
 * context to its stdin. `file` is spawned with `args` argv verbatim — the
 * command string is never interpreted by a shell, so there is no shell
 * injection/quoting hazard. Same timeout/fail-open semantics as runShellHook.
 */
export function runExecHook(
  file: string,
  args: string[],
  contextJson: string,
  opts: { timeoutMs?: number; cwd?: string } = {},
): Promise<ShellHookResult> {
  const child = execFile(file, args, { cwd: opts.cwd });
  return pipeChild(child, contextJson, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}
