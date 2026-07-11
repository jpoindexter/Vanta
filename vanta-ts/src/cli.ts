import { ensureVantaStore } from "./store/home.js";
import { usageExit, runInstruction } from "./cli/commands.js";
import {
  findRepoRoot, loadEnv, startInteractive,
  resumeIdFrom, hasForkSession, parseRunArgs, parseStartupFlags,
} from "./cli/startup.js";
import { COMMANDS } from "./cli/commands-table.js";
import { activateProfileEnvironment } from "./profiles/store.js";
import { activateVaultEnvironment } from "./secrets/vault-manager.js";
import { defaultExec } from "./secrets/provider.js";

async function initializeStoreAndProfile(): Promise<void> {
  const baseHome = await ensureVantaStore();
  await activateProfileEnvironment(process.env);
  await activateVaultEnvironment(process.env, defaultExec);
  if (process.env.VANTA_HOME !== baseHome) await ensureVantaStore(process.env);
}

async function main(): Promise<void> {
  const repoRoot = findRepoRoot();
  loadEnv(repoRoot);
  await initializeStoreAndProfile();

  const { rest: parsedArgs, lifecycle, pluginSources, dumpPrompt } = parseStartupFlags(process.argv.slice(2));
  const [cmd, ...rest] = parsedArgs;

  // VANTA-DUMP-SYS-PROMPT: print the assembled prompt and exit before any
  // command dispatch (the short-circuit lives in startInteractive).
  if (dumpPrompt) return startInteractive(repoRoot, { dumpPrompt });

  // Interactive entry points parse flags, so they stay explicit. They must exit
  // explicitly when the REPL ends — same hang class as `run` below: mounted MCP stdio
  // children keep the event loop alive, so a returning session lingers forever (a
  // non-TTY/piped session reaches EOF and never exits). `/restart` exits internally
  // with RESTART_EXIT_CODE before these awaits resolve. (Found by stress-driving the REPL.)
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
    // One-shot is DONE — exit explicitly. Without this the process hangs forever: MCP stdio
    // children (and other open handles) keep the event loop alive, and the teardown registered
    // on `process.once("exit")` only fires on an actual exit. (Found by driving a real task.)
    process.exit(0);
  }

  const handler = COMMANDS[cmd];
  if (!handler) return usageExit();
  const code = await handler(repoRoot, rest);
  if (typeof code === "number") process.exit(code);
}

main().catch((err: unknown) => {
  console.error(`\nvanta error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
