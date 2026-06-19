import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import type { SlashHandler } from "./types.js";

// One-shot `vanta <cmd>` verbs surfaced as slash commands. Each runs as a
// subprocess — which isolates the command's stdout from the Ink render and
// reuses the exact CLI behaviour, so the slash and CLI forms can't diverge. Only
// verbs verified non-interactive + non-daemon are wired (gateway/serve/auth/
// voice/loop stay CLI-only; they'd hang or orphan inside the TUI).

const exec = promisify(execFile);
const TIMEOUT_MS = 30_000;
const msg = (e: unknown): string => (e instanceof Error ? (e.message.split("\n")[0] ?? e.message) : String(e));

/** The vanta launcher: the installed global if present, else the repo's run.sh. */
function launcher(repoRoot: string): string {
  const global = join(homedir(), ".local", "bin", "vanta");
  return existsSync(global) ? global : join(repoRoot, "run.sh");
}

/** A SlashHandler that runs `vanta <name> <arg>` and returns its trimmed output. */
export function cliCmd(name: string): SlashHandler {
  return async (arg, ctx) => {
    const repoRoot = dirname(ctx.dataDir); // dataDir = <repoRoot>/.vanta
    const args = [name, ...(arg ? arg.split(/\s+/) : [])];
    try {
      const { stdout, stderr } = await exec(launcher(repoRoot), args, {
        cwd: repoRoot,
        timeout: TIMEOUT_MS,
        env: { ...process.env, VANTA_NO_TUI: "1" },
        maxBuffer: 4 * 1024 * 1024,
      });
      return { output: `${stdout}${stderr}`.trimEnd() || `  (${name}: no output)` };
    } catch (err) {
      return { output: `  /${name} failed: ${msg(err)}` };
    }
  };
}

/** Safe one-shot CLI verbs wired as slash commands (verified non-interactive). */
export const CLI_PASSTHROUGH: Readonly<Record<string, SlashHandler>> = {
  // /config opens the interactive TUI overlay (ui/config-panel) via PICKER_KINDS;
  // the `vanta config` CLI in cli/ops-app.ts stays for headless show/get/set.
  settings: cliCmd("settings"),
  models: cliCmd("models"),
  lint: cliCmd("lint"),
  roadmap: cliCmd("roadmap"),
  audit: cliCmd("audit"),
  today: cliCmd("today"),
  import: cliCmd("import"),
};
