import { execFile } from "node:child_process";
import { resolveShellInvocation } from "../platform/shell.js";

// HARNESS-CRON-SCRIPT-MODE — the no-LLM script runner for cron entries. Runs a
// user-configured shell command with a hard timeout and a capped output, errors
// as values. Precedent: `.vanta/hooks.json` command hooks — owner-configured
// scripts run directly; configuring the entry is the consent (agent-mode cron
// still gates every tool call through the kernel as before).

const DEFAULT_TIMEOUT_SEC = 60;
const MAX_OUTPUT_CHARS = 20_000;

export type ScriptResult = { ok: boolean; output: string };

/** Resolve the script timeout from VANTA_CRON_SCRIPT_TIMEOUT_SEC (default 60s). */
export function scriptTimeoutMs(env: NodeJS.ProcessEnv): number {
  const n = Number(env.VANTA_CRON_SCRIPT_TIMEOUT_SEC);
  return (Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_SEC) * 1000;
}

/**
 * Run one cron script via `sh -c`, capturing stdout(+stderr on failure).
 * Never throws: a non-zero exit, timeout, or spawn failure returns
 * `{ ok: false, output: "..." }`. Output is capped at 20k chars.
 */
export function runCronScript(
  script: string,
  opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<ScriptResult> {
  const timeout = opts.timeoutMs ?? scriptTimeoutMs(opts.env ?? process.env);
  const shell = resolveShellInvocation(script, { env: opts.env ?? process.env });
  return new Promise((resolve) => {
    execFile(shell.cmd, shell.args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = (s: string): string => (s.length > MAX_OUTPUT_CHARS ? `${s.slice(0, MAX_OUTPUT_CHARS)}\n…(truncated)` : s);
      if (!err) {
        resolve({ ok: true, output: out(stdout.trimEnd()) });
        return;
      }
      const detail = [stdout.trimEnd(), stderr.trimEnd()].filter(Boolean).join("\n");
      const killed = "killed" in err && err.killed ? ` (timed out after ${timeout / 1000}s)` : "";
      resolve({ ok: false, output: out(`script failed${killed}: ${err.message.split("\n")[0]}${detail ? `\n${detail}` : ""}`) });
    });
  });
}
