import { join } from "node:path";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolveVantaHome, commitInHome } from "../store/home.js";
import type { PermAction, PermRule } from "./rules.js";

/** Filename of the persisted rule set inside the ~/.vanta store. */
export const PERMISSIONS_FILE = "permissions.tsv";

const ACTIONS: readonly PermAction[] = ["allow", "ask", "deny"];

function isPermAction(value: string): value is PermAction {
  return (ACTIONS as readonly string[]).includes(value);
}

/**
 * Parse the TSV body into rules. Format: `action\ttool\tpattern[\troot]`, one per line;
 * empty tool/pattern fields are blank. Empty fields become `undefined` (so a
 * parse→serialize round-trip is stable) and blank lines / unknown actions are
 * skipped. Pure.
 */
export function parseRules(text: string): PermRule[] {
  const rules: PermRule[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const [action = "", tool = "", pattern = "", root = ""] = line.split("\t");
    if (!isPermAction(action)) continue;
    const rule: PermRule = { action };
    if (tool) rule.tool = tool;
    if (pattern) rule.pattern = pattern;
    if (root) rule.root = root;
    rules.push(rule);
  }
  return rules;
}

/** Serialize rules back to the TSV body. Inverse of `parseRules`. Pure. */
export function serializeRules(rules: PermRule[]): string {
  return rules.map((r) => {
    const base = `${r.action}\t${r.tool ?? ""}\t${r.pattern ?? ""}`;
    return r.root ? `${base}\t${r.root}` : base;
  }).join("\n");
}

function rulesPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), PERMISSIONS_FILE);
}

/** Load the rule set from ~/.vanta/permissions.tsv. Missing file → `[]`. */
export async function loadRules(env: NodeJS.ProcessEnv = process.env): Promise<PermRule[]> {
  try {
    return parseRules(await readFile(rulesPath(env), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Persist the rule set, auto-committing in the home store (best-effort). */
export async function saveRules(
  rules: PermRule[],
  env: NodeJS.ProcessEnv = process.env,
  isActive?: () => boolean,
): Promise<void> {
  if (isActive?.() === false) throw new DOMException("Approval canceled", "AbortError");
  await mkdir(resolveVantaHome(env), { recursive: true });
  // Write-then-rename so a crash mid-write cannot truncate the saved rules.
  const temp = `${rulesPath(env)}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, serializeRules(rules), { encoding: "utf8", mode: 0o600, flag: "wx" });
    // No asynchronous gap between the lifetime check and the publication commit point.
    if (isActive?.() === false) throw new DOMException("Approval canceled", "AbortError");
    renameSync(temp, rulesPath(env));
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
  await commitInHome(PERMISSIONS_FILE, "permissions: update rules", env);
}

/** Append a rule and persist. Returns the new full rule set. */
export async function addRule(
  rule: PermRule,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PermRule[]> {
  const rules = await loadRules(env);
  rules.push(rule);
  await saveRules(rules, env);
  return rules;
}

/**
 * Remove the rule at 1-based index `n` and persist. Returns the removed rule,
 * or `null` when `n` is out of range (nothing is written).
 */
export async function removeRule(
  n: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PermRule | null> {
  const rules = await loadRules(env);
  if (!Number.isInteger(n) || n < 1 || n > rules.length) return null;
  const [removed] = rules.splice(n - 1, 1);
  await saveRules(rules, env);
  return removed ?? null;
}
