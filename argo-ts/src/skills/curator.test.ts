import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { curate } from "./curator.js";
import { LEARNED_TAG } from "./store.js";

// Fixed clock so age math is deterministic across machines and runs.
const NOW = "2026-06-02T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const DAY_MS = 86_400_000;

// Unique, stable temp home derived from the suite name (not time/randomness),
// per the parallel-build determinism rule.
const ARGO_HOME = join(tmpdir(), "argo-curator-test");
const SKILLS = join(ARGO_HOME, "skills");
const ARCHIVE = join(SKILLS, "_archive");

function daysAgo(days: number): string {
  return new Date(NOW_MS - days * DAY_MS).toISOString();
}

/** Write a flat-frontmatter SKILL.md under skills/<slug>/ (or _archive/<slug>/). */
async function writeSkill(args: {
  baseDir: string;
  slug: string;
  name: string;
  description: string;
  updated: string;
  tags?: string[];
}): Promise<void> {
  const dir = join(args.baseDir, args.slug);
  await mkdir(dir, { recursive: true });
  const tags = `[${(args.tags ?? []).join(", ")}]`;
  const md = `---
name: ${args.name}
description: ${args.description}
created: ${daysAgo(200)}
updated: ${args.updated}
tags: ${tags}
---
body for ${args.name}
`;
  await writeFile(join(dir, "SKILL.md"), md, "utf8");
}

describe("curate", () => {
  beforeEach(async () => {
    await rm(ARGO_HOME, { recursive: true, force: true });
    await mkdir(SKILLS, { recursive: true });
  });

  afterEach(async () => {
    await rm(ARGO_HOME, { recursive: true, force: true });
  });

  it("archives a stale LEARNED skill (reversible move to _archive)", async () => {
    await writeSkill({
      baseDir: SKILLS,
      slug: "stale-learned",
      name: "stale-learned",
      description: "an old agent-learned skill",
      updated: daysAgo(40),
      tags: [LEARNED_TAG],
    });

    const result = await curate({ env: { ARGO_HOME }, now: NOW });

    expect(result.archived).toContain("stale-learned");
    expect(existsSync(join(SKILLS, "stale-learned"))).toBe(false);
    expect(existsSync(join(ARCHIVE, "stale-learned", "SKILL.md"))).toBe(true);
  });

  it("reports a stale HAND-AUTHORED skill but never moves it", async () => {
    await writeSkill({
      baseDir: SKILLS,
      slug: "stale-user",
      name: "stale-user",
      description: "an old skill the user wrote",
      updated: daysAgo(40), // stale, but no LEARNED_TAG
    });

    const result = await curate({ env: { ARGO_HOME }, now: NOW });

    expect(result.staleUnowned).toContain("stale-user");
    expect(result.archived).not.toContain("stale-user");
    expect(existsSync(join(SKILLS, "stale-user", "SKILL.md"))).toBe(true); // untouched
  });

  it("reports a long-archived skill as prunable but NEVER deletes it", async () => {
    await writeSkill({
      baseDir: ARCHIVE,
      slug: "dead-skill",
      name: "dead-skill",
      description: "a long-dead archived skill",
      updated: daysAgo(100),
    });

    const result = await curate({ env: { ARGO_HOME }, now: NOW });

    expect(result.prunable).toContain("dead-skill");
    expect(existsSync(join(ARCHIVE, "dead-skill", "SKILL.md"))).toBe(true); // preserved
  });

  it("reports two near-duplicate active skills as an overlap", async () => {
    await writeSkill({
      baseDir: SKILLS,
      slug: "web-search-helper",
      name: "web-search-helper",
      description: "search the web for results",
      updated: daysAgo(1),
    });
    await writeSkill({
      baseDir: SKILLS,
      slug: "web-search-tool",
      name: "web-search-tool",
      description: "search the web for results",
      updated: daysAgo(1),
    });

    const result = await curate({ env: { ARGO_HOME }, now: NOW });

    expect(result.overlaps).toContainEqual(["web-search-helper", "web-search-tool"]);
    expect(result.overlaps).toHaveLength(1);
  });

  it("leaves a fresh skill untouched", async () => {
    await writeSkill({
      baseDir: SKILLS,
      slug: "fresh-skill",
      name: "fresh-skill",
      description: "a brand new skill",
      updated: daysAgo(2),
      tags: [LEARNED_TAG],
    });

    const result = await curate({ env: { ARGO_HOME }, now: NOW });

    expect(result.archived).not.toContain("fresh-skill");
    expect(result.staleUnowned).not.toContain("fresh-skill");
    expect(existsSync(join(SKILLS, "fresh-skill", "SKILL.md"))).toBe(true);
  });

  it("treats an unparseable updated timestamp as not-stale", async () => {
    await writeSkill({
      baseDir: SKILLS,
      slug: "malformed-skill",
      name: "malformed-skill",
      description: "has a bad timestamp",
      updated: "not-a-date",
      tags: [LEARNED_TAG],
    });

    const result = await curate({ env: { ARGO_HOME }, now: NOW });

    expect(result.archived).not.toContain("malformed-skill");
    expect(result.staleUnowned).not.toContain("malformed-skill");
    expect(existsSync(join(SKILLS, "malformed-skill"))).toBe(true);
  });

  it("returns empty results on an empty library", async () => {
    const result = await curate({ env: { ARGO_HOME }, now: NOW });

    expect(result).toEqual({ archived: [], staleUnowned: [], prunable: [], overlaps: [] });
    const names = await readdir(SKILLS);
    expect(names).not.toContain("_archive");
  });
});
