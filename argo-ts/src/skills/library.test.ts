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
  const prev = process.env.ARGO_HOME;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "argo-lib-home-"));
    source = await mkdtemp(join(tmpdir(), "argo-lib-src-"));
    process.env.ARGO_HOME = home;
    // seed a fake bundled library
    for (const slug of ["alpha-skill", "beta-skill"]) {
      await mkdir(join(source, slug), { recursive: true });
      await writeFile(join(source, slug, "SKILL.md"), SKILL(slug));
    }
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.ARGO_HOME;
    else process.env.ARGO_HOME = prev;
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

  it("the real bundled library resolves and contains SKILL.md dirs", async () => {
    // smoke: libraryDir() points at a dir with the ported skills
    const r = await installSkillLibrary();
    expect(r.installed.length + r.skipped.length).toBeGreaterThanOrEqual(10);
    expect([...r.installed, ...r.skipped]).toContain("systematic-debugging");
  });

  it("installs the design-system-skills source too (multi-source)", async () => {
    const r = await installSkillLibrary();
    const all = [...r.installed, ...r.skipped];
    // a skill that only exists in design-system-skills/, not skills-library/
    expect(all).toContain("atomic-design");
    expect(all).toContain("usability-heuristics");
  });

  it("librarySources lists both the bundled library and the design skills", () => {
    const srcs = librarySources();
    expect(srcs.some((s) => s.endsWith("skills-library"))).toBe(true);
    expect(srcs.some((s) => s.endsWith("design-system-skills"))).toBe(true);
  });
});
