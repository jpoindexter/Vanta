import { parseEffortFlag } from "../effort.js";
import { resolveSessionCap } from "../budget/session-cap.js";
import { resolveIsolation, isolationLevel, isolationBanner } from "./isolation.js";
import { wantsDumpPrompt, stripDumpFlag } from "./dump-prompt.js";
import { parseLifecycleFlags, type LifecycleFlags } from "./lifecycle.js";
import { parsePermissionModeFlags } from "./permission-mode.js";
import { parsePluginSourceFlags, type PluginSource } from "./plugin-source-flags.js";

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

/**
 * VANTA-SAFE-MODE: strip `--safe-mode` / `--bare` and set VANTA_SAFE_MODE /
 * VANTA_BARE so the customization-loading sites read them via resolveIsolation.
 * Neither flag present = env untouched (byte-identical default). Pure over args.
 */
export function parseIsolationFlags(
  args: string[],
  env: NodeJS.ProcessEnv,
): { rest: string[]; env: NodeJS.ProcessEnv } {
  const rest: string[] = [];
  const nextEnv = { ...env };
  for (const arg of args) {
    if (arg === "--safe-mode") nextEnv.VANTA_SAFE_MODE = "1";
    else if (arg === "--bare") nextEnv.VANTA_BARE = "1";
    else rest.push(arg);
  }
  return { rest, env: nextEnv };
}

export function parseStartupFlags(args: string[]): { rest: string[]; lifecycle: LifecycleFlags; pluginSources: PluginSource[]; dumpPrompt: boolean } {
  const dumpPrompt = wantsDumpPrompt(args);
  const argsNoDump = dumpPrompt ? stripDumpFlag(args) : args;
  const isolationParse = parseIsolationFlags(argsNoDump, process.env);
  process.env = isolationParse.env;
  const level = isolationLevel(resolveIsolation(process.env));
  if (level !== "normal") console.log(isolationBanner(level));
  const permissionParse = parsePermissionModeFlags(isolationParse.rest, process.env);
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
  return { rest: lifecycleParse.rest, lifecycle: lifecycleParse.flags, pluginSources: pluginParse.sources, dumpPrompt };
}
