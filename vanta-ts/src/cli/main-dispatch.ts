import { usageExit, runInstruction } from "./commands.js";
import { startInteractive, resumeIdFrom, hasForkSession, parseRunArgs } from "./startup.js";
import type { parseStartupFlags } from "./startup-flags.js";
import { COMMANDS } from "./commands-table.js";
import { startRunPrewarm } from "../session/prewarm.js";

type Parsed = ReturnType<typeof parseStartupFlags>;

const PREWARM_COMMANDS = new Set(["chat", "--resume", "resume", "run", "desktop", "companion", "api", "gateway"]);

/**
 * Interactive entry points parse flags, so they stay explicit. They exit
 * explicitly when the REPL ends: mounted MCP stdio children keep the event loop
 * alive, so a returning session would otherwise linger forever (a non-TTY or
 * piped session reaches EOF and never exits). `/restart` exits internally with
 * RESTART_EXIT_CODE before these awaits resolve.
 */
async function runInteractive(repoRoot: string, cmd: string | undefined, rest: string[], parsed: Parsed): Promise<boolean> {
  const { lifecycle, pluginSources } = parsed;
  if (cmd === undefined || cmd === "chat") {
    await startInteractive(repoRoot, { resumeId: resumeIdFrom(rest), noTui: rest.includes("--no-tui"), forkSession: hasForkSession(rest), lifecycle, pluginSources });
    process.exit(0);
  }
  if (cmd === "--resume" || cmd === "resume") {
    await startInteractive(repoRoot, { resumeId: rest[0], forkSession: hasForkSession(rest), lifecycle, pluginSources });
    process.exit(0);
  }
  if (cmd === "run" && rest.length > 0) {
    const { instruction, outputFormat, jsonSchema } = parseRunArgs(rest);
    await runInstruction(repoRoot, instruction, { outputFormat, jsonSchema, lifecycle, pluginSources });
    // One-shot is DONE: exit explicitly, open MCP stdio handles would hang the process.
    process.exit(0);
  }
  return false;
}

/** Everything except `vanta desktop`, which has its own lean entry. */
export async function runCli(repoRoot: string, parsed: Parsed): Promise<void> {
  const [cmd, ...rest] = parsed.rest;
  // The short-circuit for the assembled prompt lives in startInteractive.
  if (parsed.dumpPrompt) return startInteractive(repoRoot, { dumpPrompt: true });
  if (cmd === undefined || PREWARM_COMMANDS.has(cmd)) startRunPrewarm(repoRoot);
  await runInteractive(repoRoot, cmd, rest, parsed);

  const handler = cmd === undefined ? undefined : COMMANDS[cmd];
  if (!handler) return usageExit();
  const code = await handler(repoRoot, rest);
  if (typeof code === "number") process.exit(code);
}
