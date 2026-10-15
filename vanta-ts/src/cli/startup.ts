import { join } from "node:path";
import { loadEnv } from "./startup-env.js";
import { resolveProvider } from "../providers/index.js";
import { runChat } from "../interactive.js";
import { runTuiV2 } from "../ui/launch.js";
import { runFullSetup } from "../setup-full.js";
import { runLifecycleHooks, type LifecycleFlags } from "./lifecycle.js";
import type { PluginSource } from "./plugin-source-flags.js";
import { installPluginSources } from "./plugin-source-install.js";
import { runDumpPrompt, defaultDumpDeps } from "./dump-prompt.js";
import type { OutputFormat } from "./commands.js";
import { consumeRestartHandoff } from "../repl/restart-handoff.js";
import { loadSession } from "../sessions/store.js";
import type { Session } from "../sessions/store.js";

function isConfigured(env: NodeJS.ProcessEnv): boolean {
  try {
    resolveProvider(env);
    return true;
  } catch {
    return false;
  }
}

async function maybeRunStartupLifecycle(repoRoot: string, lifecycle?: LifecycleFlags): Promise<boolean> {
  return lifecycle ? runLifecycleHooks(repoRoot, lifecycle, "interactive") : false;
}

async function ensureConfiguredOrSetup(repoRoot: string): Promise<boolean> {
  if (!isConfigured(process.env)) {
    if (!process.stdin.isTTY) {
      console.log("No model backend configured. Run `vanta setup` in a terminal first.");
      process.exit(1);
    }
    const wrote = await runFullSetup(repoRoot);
    if (!wrote) return false;
    loadEnv(repoRoot);
  }
  return true;
}

/** Use the Ink TUI only on an interactive TTY that isn't resuming or opted out. */
function shouldUseTui(opts: { resumeId?: string; noTui?: boolean }): boolean {
  return Boolean(process.stdin.isTTY) && !opts.resumeId && !opts.noTui && !process.env.VANTA_NO_TUI;
}

export async function loadRestartSession(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Promise<Session | null> {
  const sessionId = await consumeRestartHandoff(join(repoRoot, ".vanta"), now);
  return sessionId ? loadSession(sessionId, env) : null;
}

export async function startInteractive(
  repoRoot: string,
  opts: { resumeId?: string; noTui?: boolean; forkSession?: boolean; lifecycle?: LifecycleFlags; pluginSources?: PluginSource[]; dumpPrompt?: boolean } = {},
): Promise<void> {
  // VANTA-DUMP-SYS-PROMPT: print the assembled system prompt and exit before
  // any session work (plugin install, lifecycle hooks, setup, TUI launch).
  if (opts.dumpPrompt) process.exit(await runDumpPrompt(defaultDumpDeps(repoRoot)));
  if (opts.pluginSources?.length) await installPluginSources(repoRoot, opts.pluginSources);
  if (await maybeRunStartupLifecycle(repoRoot, opts.lifecycle)) return;
  if (!await ensureConfiguredOrSetup(repoRoot)) return;
  const restartSession = canResumeRestartInTui(opts) ? await loadRestartSession(repoRoot) : null;
  if (restartSession) return resumeRestartSession(repoRoot, restartSession, opts);
  if (!shouldUseTui(opts)) return runChat(repoRoot, opts);
  try {
    return await runTuiV2(repoRoot);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`\nTUI unavailable (${msg.split("\n")[0]}); falling back to readline REPL.\nSet VANTA_NO_TUI=1 to suppress this warning.\n`);
    return runChat(repoRoot, opts);
  }
}

function canResumeRestartInTui(opts: { resumeId?: string; noTui?: boolean }): boolean {
  return !opts.resumeId && !opts.noTui && !process.env.VANTA_NO_TUI && Boolean(process.stdin.isTTY);
}

async function resumeRestartSession(repoRoot: string, session: Session, opts: Parameters<typeof runChat>[1]): Promise<void> {
  try {
    return await runTuiV2(repoRoot, { initialSession: session });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`\nTUI unavailable after reload (${msg.split("\n")[0]}); resuming in readline mode.\n`);
    return runChat(repoRoot, { ...opts, resumeId: session.id });
  }
}

export function resumeIdFrom(args: string[]): string | undefined {
  const i = args.indexOf("--resume");
  return i >= 0 ? args[i + 1] : undefined;
}

export function hasForkSession(args: string[]): boolean {
  return args.includes("--fork-session");
}

export function parseRunArgs(rest: string[]): { instruction: string; outputFormat: OutputFormat; jsonSchema?: string } {
  const fmtIdx = rest.indexOf("--output-format");
  const rawFmt = fmtIdx >= 0 ? rest[fmtIdx + 1] : undefined;
  const outputFormat: OutputFormat =
    rawFmt === "json" || rawFmt === "stream-json" ? rawFmt : "text";
  const schemaIdx = rest.indexOf("--json-schema");
  const jsonSchema = schemaIdx >= 0 ? rest[schemaIdx + 1] : undefined;
  // Only skip a flag + its value when the flag was actually found. The old
  // `[fmtIdx+1, …].filter(i >= 0)` skipped index 0 when fmtIdx was -1 (-1+1=0),
  // dropping the instruction itself on a flagless `vanta run "<instr>"` → empty
  // user message (claude 400s / lenient models greet). Pre-existing; fixed here.
  const skipIdxs = new Set<number>();
  if (fmtIdx >= 0) { skipIdxs.add(fmtIdx); skipIdxs.add(fmtIdx + 1); }
  if (schemaIdx >= 0) { skipIdxs.add(schemaIdx); skipIdxs.add(schemaIdx + 1); }
  const instrArgs = rest.filter((_, i) => !skipIdxs.has(i));
  return { instruction: instrArgs.join(" "), outputFormat, jsonSchema };
}

export { findRepoRoot, loadEnv } from "./startup-env.js";
export { parseIsolationFlags, parseMaxBudgetFlag, parseStartupFlags } from "./startup-flags.js";
