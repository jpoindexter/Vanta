import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isValidCron, parseSkillSchedule, reconcileSkillCrons, skillCronInstruction, skillNameFromInstruction,
  loadScheduledSkills, syncSkillCrons, type ScheduledSkill,
} from "./scheduled.js";
import { loadDurableCron } from "../schedule/durable-cron.js";
import type { DurableCronEntry } from "../schedule/durable-cron.js";

// HARNESS-BLUEPRINT-SKILLS — a skill's `schedule` frontmatter self-registers a cron.

describe("isValidCron / parseSkillSchedule", () => {
  it("accepts valid cron, rejects junk", () => {
    expect(isValidCron("0 9 * * *")).toBe(true);
    expect(isValidCron("*/15 * * * *")).toBe(true);
    expect(isValidCron("0 9 * *")).toBe(false); // 4 fields
    expect(isValidCron("nope")).toBe(false);
    expect(isValidCron("99 9 * * *")).toBe(false); // out-of-range minute
  });

  it("extracts a valid schedule from raw frontmatter, else null", () => {
    expect(parseSkillSchedule({ schedule: "0 9 * * *" })).toBe("0 9 * * *");
    expect(parseSkillSchedule({ schedule: "garbage" })).toBeNull();
    expect(parseSkillSchedule({})).toBeNull();
    expect(parseSkillSchedule({ schedule: 42 })).toBeNull();
  });
});

describe("instruction round-trip", () => {
  it("embeds + extracts the skill name; a non-skill instruction is null", () => {
    expect(skillNameFromInstruction(skillCronInstruction("daily-brief"))).toBe("daily-brief");
    expect(skillNameFromInstruction("just an agent task")).toBeNull();
  });
});

describe("reconcileSkillCrons", () => {
  const entry = (id: number, instruction: string, cron: string): DurableCronEntry =>
    ({ id, cron, instruction, status: "active", durable: true, recurring: true });
  const sched = (name: string, schedule: string): ScheduledSkill => ({ name, schedule, instruction: skillCronInstruction(name) });

  it("adds a newly-scheduled skill", () => {
    const plan = reconcileSkillCrons([sched("a", "0 9 * * *")], []);
    expect(plan.toAdd.map((s) => s.name)).toEqual(["a"]);
    expect(plan.toRemoveIds).toEqual([]);
  });

  it("keeps an unchanged skill cron (no churn)", () => {
    const existing = [entry(1, skillCronInstruction("a"), "0 9 * * *")];
    const plan = reconcileSkillCrons([sched("a", "0 9 * * *")], existing);
    expect(plan.toAdd).toEqual([]);
    expect(plan.toRemoveIds).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("removes a skill-owned cron whose skill unloaded, and re-times a changed cron", () => {
    const existing = [
      entry(1, skillCronInstruction("gone"), "0 9 * * *"), // skill no longer loaded → remove
      entry(2, skillCronInstruction("a"), "0 9 * * *"), // cron changed → remove + re-add
      entry(3, "hand-added job", "0 0 * * *"), // NOT skill-owned → never touched
    ];
    const plan = reconcileSkillCrons([sched("a", "0 12 * * *")], existing);
    expect(plan.toRemoveIds.sort()).toEqual([1, 2]);
    expect(plan.toAdd.map((s) => s.name)).toEqual(["a"]);
    expect(plan.toRemoveIds).not.toContain(3); // hand-added preserved
  });
});

describe("live sync (register on load / unregister on unload)", () => {
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-sched-skill-"));
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });
  const env = (): NodeJS.ProcessEnv => ({ VANTA_HOME: home });

  async function writeSkill(slug: string, frontmatter: string): Promise<void> {
    const dir = join(home, "skills", slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SKILL.md"), `---\n${frontmatter}\n---\nbody`, "utf8");
  }

  it("loadScheduledSkills mines the raw schedule frontmatter (SkillMeta drops it)", async () => {
    await writeSkill("daily-brief", "name: daily-brief\ndescription: d\nschedule: 0 8 * * *");
    await writeSkill("no-sched", "name: no-sched\ndescription: d");
    const loaded = await loadScheduledSkills(env());
    expect(loaded).toEqual([{ name: "daily-brief", schedule: "0 8 * * *", instruction: skillCronInstruction("daily-brief") }]);
  });

  it("syncSkillCrons registers on load then unregisters when the skill is removed", async () => {
    await writeSkill("daily-brief", "name: daily-brief\ndescription: d\nschedule: 0 8 * * *");
    const plan1 = await syncSkillCrons(join(home, ".vanta"), env());
    expect(plan1.toAdd.map((s) => s.name)).toEqual(["daily-brief"]);
    let crons = await loadDurableCron(join(home, ".vanta"));
    expect(crons.some((c) => skillNameFromInstruction(c.instruction) === "daily-brief")).toBe(true);

    // Unload the skill → next sync removes its cron.
    await rm(join(home, "skills", "daily-brief"), { recursive: true, force: true });
    const plan2 = await syncSkillCrons(join(home, ".vanta"), env());
    expect(plan2.toRemoveIds.length).toBe(1);
    crons = await loadDurableCron(join(home, ".vanta"));
    expect(crons.some((c) => skillNameFromInstruction(c.instruction) === "daily-brief")).toBe(false);
  });
});
