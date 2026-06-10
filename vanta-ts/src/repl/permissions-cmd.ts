import type { SlashHandler } from "./types.js";
import type { PermAction, PermRule } from "../permissions/rules.js";
import { loadRules, addRule, removeRule } from "../permissions/store.js";

const HELP_TEXT =
  "  /permissions [allow|ask|deny <tool> [pattern] | remove <n>]\n" +
  "\n" +
  "  (no args)  List current rules, numbered\n" +
  "  allow      Auto-confirm a kernel 'ask' for this tool/pattern\n" +
  "  ask        Always prompt for this tool/pattern\n" +
  "  deny       Always block this tool/pattern\n" +
  "  remove <n> Delete the rule at index n\n" +
  "\n" +
  "  Rules TIGHTEN the kernel verdict — they can never loosen a kernel block.\n" +
  "  Persisted to ~/.vanta/permissions.tsv.";

const ACTIONS: readonly PermAction[] = ["allow", "ask", "deny"];

function isPermAction(value: string): value is PermAction {
  return (ACTIONS as readonly string[]).includes(value);
}

function formatRule(rule: PermRule, i: number): string {
  const scope = [rule.tool, rule.pattern ? `~"${rule.pattern}"` : ""].filter(Boolean).join(" ");
  return `  ${i + 1}. ${rule.action.padEnd(5)} ${scope || "(any)"}`;
}

async function listRules(env: NodeJS.ProcessEnv): Promise<string> {
  const rules = await loadRules(env);
  if (rules.length === 0) {
    return "  no permission rules — use /permissions allow|ask|deny <tool> [pattern]";
  }
  return ["  permission rules (most specific wins):", ...rules.map(formatRule)].join("\n");
}

async function addFromArgs(action: PermAction, rest: string[], env: NodeJS.ProcessEnv): Promise<string> {
  const tool = rest[0];
  if (!tool) return `  usage: /permissions ${action} <tool> [pattern]`;
  const pattern = rest.slice(1).join(" ") || undefined;
  const rule: PermRule = pattern ? { action, tool, pattern } : { action, tool };
  await addRule(rule, env);
  return `  added: ${action} ${tool}${pattern ? ` ~"${pattern}"` : ""}`;
}

async function removeAt(arg: string | undefined, env: NodeJS.ProcessEnv): Promise<string> {
  const n = Number(arg);
  if (!Number.isInteger(n)) return "  usage: /permissions remove <n>";
  const removed = await removeRule(n, env);
  return removed
    ? `  removed rule ${n}: ${removed.action} ${removed.tool ?? "(any)"}`
    : `  no rule at index ${n}`;
}

export const permissions: SlashHandler = async (arg, ctx) => {
  const parts = arg.trim().split(/\s+/).filter(Boolean);
  const verb = parts[0]?.toLowerCase();
  if (!verb || verb === "list") return { output: await listRules(ctx.env) };
  if (verb === "remove") return { output: await removeAt(parts[1], ctx.env) };
  if (isPermAction(verb)) return { output: await addFromArgs(verb, parts.slice(1), ctx.env) };
  return { output: `  unknown action '${verb}'\n${HELP_TEXT}` };
};
