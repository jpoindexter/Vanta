import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { isValidCron } from "../schedule/cron.js";
import type { DurableCronEntry } from "../schedule/durable-cron.js";
import { skillsDir } from "../store/home.js";
import { readSkillFrontmatter } from "./frontmatter.js";
import { loadDurableCron, addDurableCron, saveDurableCron } from "../schedule/durable-cron.js";

// HARNESS-BLUEPRINT-SKILLS — a skill's frontmatter may declare `schedule: <cron>`,
// making it a self-scheduling automation: loading the skill registers a recurring
// job on the EXISTING scheduler, unloading it removes the job — no new subsystem.
// SkillMeta is a closed shape (drops unknown keys), so schedules are mined from
// the RAW frontmatter record (same pattern as conditional-activate.ts). Pure
// extraction + a pure reconciler; the store I/O is injected.

// isValidCron lives in cron.ts (uses its field parser); re-exported for callers.
export { isValidCron } from "../schedule/cron.js";

/** Marks a durable cron entry as owned by a skill, so reconcile can prune orphans. */
export const SKILL_CRON_PREFIX = "__skill__:";

/** The `schedule` cron from a skill's raw frontmatter, or null (absent/invalid). Pure. */
export function parseSkillSchedule(frontmatter: Record<string, unknown>): string | null {
  const value = frontmatter.schedule;
  if (typeof value !== "string" || !isValidCron(value)) return null;
  return value.trim();
}

export type ScheduledSkill = { name: string; schedule: string; instruction: string };

/** A skill's cron instruction: run the skill on its cadence. Pure. */
export function skillCronInstruction(name: string): string {
  return `${SKILL_CRON_PREFIX}${name}`;
}

/** The skill name embedded in a skill-owned cron instruction, or null. Pure. */
export function skillNameFromInstruction(instruction: string): string | null {
  return instruction.startsWith(SKILL_CRON_PREFIX) ? instruction.slice(SKILL_CRON_PREFIX.length) : null;
}

export type CronReconcile = { toAdd: ScheduledSkill[]; toRemoveIds: number[]; unchanged: number };

/**
 * Reconcile the durable cron store against the currently-loaded scheduled
 * skills: ADD a job for a scheduled skill that has none (or whose cron changed),
 * REMOVE skill-owned jobs whose skill is gone or no longer scheduled (the
 * unregister-on-unload half). Only touches skill-owned entries (SKILL_CRON_PREFIX)
 * — hand-added cron jobs are never disturbed. Pure decision over the two sets.
 */
export function reconcileSkillCrons(loaded: ScheduledSkill[], existing: DurableCronEntry[]): CronReconcile {
  const wantByName = new Map(loaded.map((s) => [s.name, s]));
  const owned = existing.filter((e) => skillNameFromInstruction(e.instruction) !== null);
  const toRemoveIds: number[] = [];
  const haveFresh = new Set<string>();
  for (const e of owned) {
    const name = skillNameFromInstruction(e.instruction)!;
    const want = wantByName.get(name);
    if (want && want.schedule === e.cron) haveFresh.add(name); // still current → keep
    else toRemoveIds.push(e.id); // gone, unscheduled, or cron changed → drop
  }
  const toAdd = loaded.filter((s) => !haveFresh.has(s.name));
  return { toAdd, toRemoveIds, unchanged: haveFresh.size };
}

/**
 * Read every skill's RAW SKILL.md (SkillMeta drops `schedule`, so we must mine
 * the raw frontmatter) and return those declaring a valid schedule. The skill
 * name is the frontmatter `name` or the directory slug. Tolerant: a missing
 * dir / unreadable file yields no scheduled skills.
 */
export async function loadScheduledSkills(env?: NodeJS.ProcessEnv): Promise<ScheduledSkill[]> {
  const root = skillsDir(env);
  let slugs: string[];
  try {
    slugs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  const out: ScheduledSkill[] = [];
  for (const slug of slugs) {
    const fm = await readFile(join(root, slug, "SKILL.md"), "utf8").then(readSkillFrontmatter).catch(() => null);
    if (!fm) continue;
    const schedule = parseSkillSchedule(fm);
    const name = fm.name || slug;
    if (schedule) out.push({ name, schedule, instruction: skillCronInstruction(name) });
  }
  return out;
}

/**
 * Sync the durable cron store to the loaded scheduled skills: add jobs for newly
 * scheduled skills, remove skill-owned jobs whose skill is gone / unscheduled /
 * re-timed. Hand-added crons are untouched. Returns the reconcile summary.
 */
export async function syncSkillCrons(dataDir: string, env?: NodeJS.ProcessEnv): Promise<CronReconcile> {
  const loaded = await loadScheduledSkills(env);
  const existing = await loadDurableCron(dataDir);
  const plan = reconcileSkillCrons(loaded, existing);
  if (plan.toRemoveIds.length) {
    const remove = new Set(plan.toRemoveIds);
    await saveDurableCron(dataDir, existing.filter((e) => !remove.has(e.id)));
  }
  for (const s of plan.toAdd) await addDurableCron(dataDir, s.schedule, s.instruction, true);
  return plan;
}
