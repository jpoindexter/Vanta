import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Self-heal for CLI-backed reach channels. Brittle backends (twitter-cli, etc.)
// break when the platform changes its API; the maintainer ships a fix, so the
// heal is "re-pull the latest backend". This is the reach analogue of the
// self-repair organ — detect off → heal → re-check. Kernel-gated at the tool.

const run = promisify(execFile);
const HEAL_TIMEOUT_MS = 180_000;

export type HealResult = { ok: boolean; ran: string; output: string };

/**
 * Try an ordered ladder of `[bin, args]` commands; the first that runs to a
 * zero exit wins. A missing installer (ENOENT) is skipped; a real failure is
 * recorded and the next is tried. Never throws.
 */
export async function tryUpgrade(
  commands: Array<[string, string[]]>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HealResult> {
  let last = "no upgrade command available";
  for (const [bin, args] of commands) {
    try {
      const { stdout, stderr } = await run(bin, args, { timeout: HEAL_TIMEOUT_MS, env, maxBuffer: 4_000_000 });
      return { ok: true, ran: `${bin} ${args.join(" ")}`, output: (stdout || stderr).trim().slice(0, 400) };
    } catch (err) {
      const e = err as { code?: string | number; message: string };
      last = e.code === "ENOENT" ? `${bin} not available` : e.message;
    }
  }
  return { ok: false, ran: "", output: last };
}

/** Upgrade-command ladder for a Python CLI installed via uv/pipx/pip. Pure. */
export function pyToolUpgradeCommands(pkg: string): Array<[string, string[]]> {
  return [
    ["uv", ["tool", "install", "--upgrade", pkg]],
    ["pipx", ["upgrade", pkg]],
    ["pipx", ["install", pkg]],
    ["pip3", ["install", "--upgrade", pkg]],
  ];
}
