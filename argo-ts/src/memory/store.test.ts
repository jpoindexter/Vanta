import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendMemory, readMemory, recentMemory } from "./store.js";

const ARGO_HOME = join(tmpdir(), "argo-memory-store-test");
const env = { ...process.env, ARGO_HOME };

describe("memory store", () => {
  beforeEach(async () => {
    await rm(ARGO_HOME, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(ARGO_HOME, { recursive: true, force: true });
  });

  it("readMemory contains both summaries after two appends", async () => {
    await appendMemory(1, "first summary", { env, now: "2026-06-02T10:00:00.000Z" });
    await appendMemory(1, "second summary", { env, now: "2026-06-02T11:00:00.000Z" });

    const content = await readMemory(1, env);

    expect(content).toContain("first summary");
    expect(content).toContain("second summary");
    expect(content).toContain("## 2026-06-02T10:00:00.000Z");
    expect(content).toContain("## 2026-06-02T11:00:00.000Z");
  });

  it("caps the stored file at ARGO_MEMORY_MAX_BLOCKS, keeping the most recent", async () => {
    const capped = { ...env, ARGO_MEMORY_MAX_BLOCKS: "3" };
    for (let i = 1; i <= 5; i++) {
      await appendMemory(7, `summary ${i}`, { env: capped, now: `2026-06-02T1${i}:00:00.000Z` });
    }
    const content = (await readMemory(7, capped)) ?? "";
    const blocks = content.split(/(?=^## )/m).filter((b) => b.trim().startsWith("## "));
    expect(blocks).toHaveLength(3); // capped
    expect(content).toContain("summary 5"); // newest kept
    expect(content).toContain("summary 3");
    expect(content).not.toContain("summary 1"); // oldest pruned from live file
  });

  it("recentMemory with maxPerGoal=1 returns only the latest block", async () => {
    await appendMemory(7, "older entry", { env, now: "2026-06-02T10:00:00.000Z" });
    await appendMemory(7, "newest entry", { env, now: "2026-06-02T12:00:00.000Z" });

    const recent = await recentMemory([7], { env, maxPerGoal: 1 });

    expect(recent).toContain("Goal 7:");
    expect(recent).toContain("newest entry");
    expect(recent).not.toContain("older entry");
  });

  it("recentMemory over an unknown goal returns empty string", async () => {
    const recent = await recentMemory([999], { env });

    expect(recent).toBe("");
  });

  it("readMemory returns null for a goal with no memory", async () => {
    const content = await readMemory(404, env);

    expect(content).toBeNull();
  });

  it("recentMemory concatenates across goals and skips empty ones", async () => {
    await appendMemory(1, "goal one note", { env, now: "2026-06-02T10:00:00.000Z" });
    await appendMemory(2, "goal two note", { env, now: "2026-06-02T11:00:00.000Z" });

    const recent = await recentMemory([1, 500, 2], { env });

    expect(recent).toContain("Goal 1:");
    expect(recent).toContain("goal one note");
    expect(recent).toContain("Goal 2:");
    expect(recent).toContain("goal two note");
    expect(recent).not.toContain("Goal 500:");
  });
});
