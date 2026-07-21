import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installSkillLibrary, libraryDir, librarySources } from "./library.js";
import { listSkills } from "./store.js";

const SKILL = (name: string) =>
  `---\nname: ${name}\ndescription: a ${name} skill\n---\n\nbody for ${name}\n`;

describe("installSkillLibrary", () => {
  let home: string;
  let source: string;
  const prev = process.env.VANTA_HOME;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-lib-home-"));
    source = await mkdtemp(join(tmpdir(), "vanta-lib-src-"));
    process.env.VANTA_HOME = home;
    // seed a fake bundled library
    for (const slug of ["alpha-skill", "beta-skill"]) {
      await mkdir(join(source, slug), { recursive: true });
      await writeFile(join(source, slug, "SKILL.md"), SKILL(slug));
    }
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = prev;
    await rm(home, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  });

  it("installs all bundled skills into a fresh store", async () => {
    const r = await installSkillLibrary({ from: source });
    expect(r.installed.sort()).toEqual(["alpha-skill", "beta-skill"]);
    expect(r.skipped).toEqual([]);
    const names = (await listSkills(process.env)).map((s) => s.meta.name).sort();
    expect(names).toEqual(["alpha-skill", "beta-skill"]);
  });

  it("skips a skill that already exists (user edits win)", async () => {
    await installSkillLibrary({ from: source });
    // user edits one
    await writeFile(join(home, "skills", "alpha-skill", "SKILL.md"), SKILL("alpha-skill-EDITED"));

    const r = await installSkillLibrary({ from: source });
    expect(r.installed).toEqual([]);
    expect(r.skipped.sort()).toEqual(["alpha-skill", "beta-skill"]);
    const edited = await readFile(join(home, "skills", "alpha-skill", "SKILL.md"), "utf8");
    expect(edited).toContain("alpha-skill-EDITED"); // not overwritten
  });

  it("overwrites with force", async () => {
    await installSkillLibrary({ from: source });
    await writeFile(join(home, "skills", "alpha-skill", "SKILL.md"), SKILL("alpha-skill-EDITED"));

    const r = await installSkillLibrary({ from: source, force: true });
    expect(r.installed.sort()).toEqual(["alpha-skill", "beta-skill"]);
    const restored = await readFile(join(home, "skills", "alpha-skill", "SKILL.md"), "utf8");
    expect(restored).toContain("name: alpha-skill\n"); // back to bundled
  });

  it("returns empty when the source dir is absent", async () => {
    const r = await installSkillLibrary({ from: join(source, "nope") });
    expect(r).toEqual({ installed: [], skipped: [] });
  });

  // The two real-library tests copy all ~86 bundled skills; under the full
  // parallel suite (241 files) that I/O can exceed the global 20s timeout,
  // so they get their own 60s budget.
  it("the real bundled library resolves and contains SKILL.md dirs", async () => {
    // smoke: libraryDir() points at a dir with the ported skills
    const r = await installSkillLibrary();
    expect(r.installed.length + r.skipped.length).toBeGreaterThanOrEqual(10);
    expect([...r.installed, ...r.skipped]).toContain("systematic-debugging");
    expect([...r.installed, ...r.skipped]).toContain("vanta-port-adapter");
    expect([...r.installed, ...r.skipped]).toContain("skill-generator");
    expect([...r.installed, ...r.skipped]).toContain("batch");
    expect([...r.installed, ...r.skipped]).toContain("ideation-methods");
  }, 60_000);

  it("installs the design + ai-engineering sources without duplicating core EF behavior", async () => {
    const r = await installSkillLibrary();
    const all = [...r.installed, ...r.skipped];
    // skills that only exist in the extra sources, not skills-library/
    expect(all).toContain("atomic-design"); // design-system-skills
    expect(all).toContain("usability-heuristics"); // design-system-skills
    expect(all).toContain("rag-architecture"); // ai-engineering-skills
    expect(all).not.toContain("functional-minimums"); // exported pack; Vanta uses its core prompt
  }, 60_000);

  it("librarySources lists the bundled library + design + ai-engineering skills", () => {
    const srcs = librarySources();
    expect(srcs.some((s) => s.endsWith("skills-library"))).toBe(true);
    expect(srcs.some((s) => s.endsWith("design-system-skills"))).toBe(true);
    expect(srcs.some((s) => s.endsWith("ai-engineering-skills"))).toBe(true);
    expect(srcs.some((s) => s.endsWith("executive-function-skills"))).toBe(false);
  });
});
