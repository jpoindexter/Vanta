import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const PROBE_TIMEOUT_MS = 5_000;

/**
 * Really execute a command to prove a backend works — `which()` alone isn't
 * proof (a stale venv/npx shim passes which() but can't run). Returns the
 * first output line as `detail` on success, or the error message on failure.
 * Never throws.
 */
export async function probeCommand(
  bin: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ available: boolean; detail: string }> {
  try {
    const { stdout, stderr } = await run(bin, args, { timeout: PROBE_TIMEOUT_MS, env });
    const line = (stdout || stderr).trim().split("\n")[0] ?? "";
    return { available: true, detail: line };
  } catch (err) {
    const e = err as { code?: number | string; message: string };
    const why = e.code === "ENOENT" ? "not installed" : e.message;
    return { available: false, detail: why };
  }
}
