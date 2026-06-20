import type { BgTask } from "../tools/bg-tasks.js";

// VANTA-EXEC-BG: `--exec "<cmd>"` (repeatable) starts each command as a
// background job when the session starts, alongside the interactive session,
// reusing the existing background-task machinery (`spawnBackground`). The
// background command is still kernel-gated like any shell execution — the
// gate lives in the run path, not here. No `--exec` = no background jobs
// (current behavior). Parse + plan are pure; launch is best-effort.

const EXEC_FLAG = "--exec";

/** Launch descriptor for one `--exec` background job. */
export type ExecBgPlan = { command: string; label: string };

/** Injected starter so the launch is testable without spawning a real process. */
export type ExecBgStarter = (command: string) => Promise<BgTask>;

/**
 * Extract every `--exec <cmd>` pair from argv. Leaves all other args in `rest`.
 * Tolerant of a trailing `--exec` with no value (ignored, flag dropped).
 */
export function parseExecFlags(argv: string[]): { commands: string[]; rest: string[] } {
  const commands: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === EXEC_FLAG) {
      const value = argv[i + 1];
      if (typeof value === "string") {
        commands.push(value);
        i++; // consume the value too
      }
      // trailing `--exec` with no value: drop the flag, add nothing
      continue;
    }
    rest.push(arg);
  }
  return { commands, rest };
}

/** Build the ordered list of background-job launch descriptors. */
export function buildExecBgPlan(commands: string[]): ExecBgPlan[] {
  return commands.map((command, i) => ({ command, label: `exec-${i + 1}` }));
}

/**
 * Start each planned `--exec` command as a background job via the injected
 * starter. Best-effort: a failing start never throws, so it can't break
 * session setup. Returns the count actually started.
 */
export async function launchExecBg(commands: string[], start: ExecBgStarter): Promise<number> {
  let started = 0;
  for (const { command } of buildExecBgPlan(commands)) {
    try {
      await start(command);
      started++;
    } catch {
      // best-effort: a failed background launch must never break the session
    }
  }
  return started;
}
