import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mirrorLegacyEnv } from "../env-compat.js";
import { resolveProvider } from "../providers/index.js";
import { runChat } from "../interactive.js";
import { runTuiV2 } from "../ui/launch.js";
import { runFullSetup } from "../setup-full.js";
import { parseLifecycleFlags, runLifecycleHooks, type LifecycleFlags } from "./lifecycle.js";
import { parsePermissionModeFlags } from "./permission-mode.js";
import { parsePluginSourceFlags, type PluginSource } from "./plugin-source-flags.js";
import { installPluginSources } from "./plugin-source-install.js";
import { parseEffortFlag } from "../effort.js";
import { resolveSessionCap } from "../budget/session-cap.js";
import type { OutputFormat } from "./commands.js";

export function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "Cargo.toml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

export function loadEnv(repoRoot: string): void {
  try {
    process.loadEnvFile(join(repoRoot, "vanta-ts", ".env"));
  } catch {
    // no .env file — rely on the ambient environment
  }
  mirrorLegacyEnv();
}

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

export async function startInteractive(
  repoRoot: string,
  opts: { resumeId?: string; noTui?: boolean; forkSession?: boolean; lifecycle?: LifecycleFlags; pluginSources?: PluginSource[] } = {},
): Promise<void> {
  if (opts.pluginSources?.length) await installPluginSources(repoRoot, opts.pluginSources);
  if (await maybeRunStartupLifecycle(repoRoot, opts.lifecycle)) return;
  if (!await ensureConfiguredOrSetup(repoRoot)) return;
  const useTui =
    Boolean(process.stdin.isTTY) && !opts.resumeId && !opts.noTui && !process.env.VANTA_NO_TUI;
  if (!useTui) return runChat(repoRoot, opts);
  try {
    return await runTuiV2(repoRoot);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`\nTUI unavailable (${msg.split("\n")[0]}); falling back to readline REPL.\nSet VANTA_NO_TUI=1 to suppress this warning.\n`);
    return runChat(repoRoot, opts);
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
  const skipIdxs = new Set<number>([fmtIdx, fmtIdx + 1, schemaIdx, schemaIdx + 1].filter((i) => i >= 0));
  const instrArgs = rest.filter((_, i) => !skipIdxs.has(i));
  return { instruction: instrArgs.join(" "), outputFormat, jsonSchema };
}

/**
 * VANTA-BUDGET-CAP: parse `--max-budget-usd <n>` into VANTA_MAX_BUDGET_USD so the
 * loop's session-cap check reads it. Validated via resolveSessionCap (positive
 * finite). Absent flag = unchanged. Mirrors parseEffortFlag.
 */
export function parseMaxBudgetFlag(
  args: string[],
  env: NodeJS.ProcessEnv,
): { rest: string[]; env: NodeJS.ProcessEnv; error?: string } {
  const i = args.indexOf("--max-budget-usd");
  if (i < 0) return { rest: args, env };
  const value = args[i + 1];
  if (resolveSessionCap({}, value) === null) {
    return { rest: args, env, error: "--max-budget-usd must be a positive number" };
  }
  const rest = args.filter((_, idx) => idx !== i && idx !== i + 1);
  return { rest, env: { ...env, VANTA_MAX_BUDGET_USD: value } };
}

export function parseStartupFlags(args: string[]): { rest: string[]; lifecycle: LifecycleFlags; pluginSources: PluginSource[] } {
  const permissionParse = parsePermissionModeFlags(args, process.env);
  if (permissionParse.error) { console.error(permissionParse.error); process.exit(1); }
  process.env = permissionParse.env;
  const effortParse = parseEffortFlag(permissionParse.rest, permissionParse.env);
  if (effortParse.error) { console.error(effortParse.error); process.exit(1); }
  process.env = effortParse.env;
  const budgetParse = parseMaxBudgetFlag(effortParse.rest, effortParse.env);
  if (budgetParse.error) { console.error(budgetParse.error); process.exit(1); }
  process.env = budgetParse.env;
  const pluginParse = parsePluginSourceFlags(budgetParse.rest);
  if (pluginParse.error) { console.error(pluginParse.error); process.exit(1); }
  const lifecycleParse = parseLifecycleFlags(pluginParse.rest);
  return { rest: lifecycleParse.rest, lifecycle: lifecycleParse.flags, pluginSources: pluginParse.sources };
}

