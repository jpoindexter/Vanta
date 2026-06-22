import { createInterface } from "node:readline/promises";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { listSkills } from "../skills/store.js";
import { createKernelClient } from "../kernel/client.js";
import { storeDir, runBackup } from "../cli-dx/backup.js";
import { MIGRATE_SOURCES, parseMcpServers, type MigrateSource } from "../migrate/parse.js";
import {
  buildMigrationPlan,
  formatPlan,
  narrowByFootprint,
  numberedItems,
  numberedList,
  parseItemSelection,
  filterPlanByNumbers,
  type PlanDeps,
  type MigrationPlan,
} from "../migrate/plan.js";
import { applyMigration, defaultApplyDeps, type ApplySelection, type ApplyResult } from "../migrate/apply.js";

// VANTA-MIGRATE — `vanta migrate <openclaw|hermes>`: preview → select → backup →
// apply. Kernel-gated (the apply is assessed; a block refuses), secrets redacted
// in the preview, conflicts skipped unless --overwrite, and ~/.vanta is backed up
// first so the whole thing is reversible.

const FLAG_RE = /^--/;

function usage(log: (s: string) => void): number {
  log("  usage: vanta migrate <openclaw|hermes> [--skills] [--mcp] [--model] [--overwrite] [--yes]");
  log("         default brings all three footprints; pass any of --skills/--mcp/--model to narrow.");
  return 1;
}

/** Selection from flags: any explicit footprint flag narrows; none = all. Pure. */
export function parseSelection(flags: string[]): ApplySelection {
  const has = (f: string): boolean => flags.includes(f);
  const narrowed = has("--skills") || has("--mcp") || has("--model");
  return {
    skills: narrowed ? has("--skills") : true,
    mcp: narrowed ? has("--mcp") : true,
    model: narrowed ? has("--model") : true,
    overwrite: has("--overwrite"),
  };
}

/** Live read-only fs deps for the planner, rooted at ~/.<source>. */
async function livePlanDeps(source: MigrateSource, env: NodeJS.ProcessEnv): Promise<PlanDeps> {
  const sourceRoot = join(homedir(), `.${source}`);
  const skills = await listSkills(env).catch(() => []);
  const existingSkillNames = new Set(skills.map((s) => s.meta.name));
  const mcpText = readSafe(join(storeDir(env), "mcp.json"));
  const existingMcpNames = new Set(Object.keys(mcpText ? parseMcpServers(mcpText) : {}));
  return {
    sourceRoot,
    exists: (p) => existsSync(p),
    readText: readSafe,
    listDirs: (p) => {
      try {
        return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {
        return [];
      }
    },
    existingSkillNames,
    existingMcpNames,
  };
}

function readSafe(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

const hasContent = (plan: MigrationPlan): boolean =>
  plan.skills.length > 0 || plan.mcpServers.length > 0 || plan.modelConfig !== null;

/** Kernel-gate the outward action; ask/allow proceed to the human confirm. */
async function kernelBlocks(env: NodeJS.ProcessEnv, source: MigrateSource): Promise<{ blocked: boolean; reason: string }> {
  const verdict = await createKernelClient(env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788")
    .assess(`migrate import from ${source} into ~/.vanta (skills + mcp + model)`)
    .catch(() => ({ risk: "ask" as const, needsHuman: true, reason: "kernel unreachable" }));
  return { blocked: verdict.risk === "block", reason: verdict.reason };
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/**
 * Decide what to import. Footprint flags (--skills/--mcp/--model) pre-narrow the
 * candidates; `--yes` imports them all unprompted; otherwise the operator picks
 * per item from a numbered list. Returns null when nothing is chosen (cancel).
 */
async function chooseToApply(plan: MigrationPlan, flags: string[], log: (s: string) => void): Promise<MigrationPlan | null> {
  const candidate = narrowByFootprint(plan, parseSelection(flags));
  if (flags.includes("--yes")) return hasContent(candidate) ? candidate : null;
  const items = numberedItems(candidate);
  if (!items.length) return null;
  log(numberedList(items));
  const selected = parseItemSelection(await ask("  Import which? (all / none / e.g. 1,3): "), items.length);
  if (!selected.size) return null;
  return filterPlanByNumbers(candidate, items, selected);
}

function printReport(log: (s: string) => void, source: MigrateSource, plan: MigrationPlan, result: ApplyResult): void {
  log(`  ✓ migrated from ${source} (backup: ${result.backup})`);
  if (result.skillsAdded.length) log(`    skills:  ${result.skillsAdded.join(", ")}`);
  if (result.mcpAdded.length) log(`    mcp:     ${result.mcpAdded.join(", ")}`);
  if (result.modelApplied) log(`    model:   ${plan.modelConfig?.provider}/${plan.modelConfig?.model} → ~/.vanta/.env`);
  if (result.skipped.length) log(`    skipped: ${result.skipped.join("; ")} (use --overwrite to replace)`);
}

export async function runMigrate(rest: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const log = console.log;
  const source = rest[0] as MigrateSource | undefined;
  if (!source || !MIGRATE_SOURCES.includes(source)) return usage(log);
  const flags = rest.filter((a) => FLAG_RE.test(a));

  const plan = buildMigrationPlan(source, await livePlanDeps(source, env));
  log(formatPlan(plan));
  if (!plan.found) return 1;
  if (!hasContent(plan)) {
    log("  nothing to import.");
    return 0;
  }

  const gate = await kernelBlocks(env, source);
  if (gate.blocked) {
    log(`  ✗ blocked by kernel: ${gate.reason}`);
    return 1;
  }

  const chosen = await chooseToApply(plan, flags, log);
  if (!chosen || !hasContent(chosen)) {
    log("  nothing selected — cancelled.");
    return 0;
  }

  const backupOut = join(homedir(), `vanta-backup-before-${source}-migrate.tgz`);
  const allFootprints: ApplySelection = { skills: true, mcp: true, model: true, overwrite: flags.includes("--overwrite") };
  const result = await applyMigration(
    chosen,
    allFootprints,
    defaultApplyDeps(env, async () => {
      await runBackup([backupOut], env);
      return backupOut;
    }),
  );
  printReport(log, source, chosen, result);
  return 0;
}
