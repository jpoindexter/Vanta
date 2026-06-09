import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendMemory } from "./store.js";
import { curateMemory } from "./curator.js";

const VANTA_HOME = join(tmpdir(), "vanta-memory-curator-test");
const env = { ...process.env, VANTA_HOME };

describe("curateMemory", () => {
  beforeEach(async () => {
    await rm(VANTA_HOME, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(VANTA_HOME, { recursive: true, force: true });
  });

  it("returns zeros when memory file does not exist", async () => {
    const result = await curateMemory("999", env);
    expect(result).toEqual({ total: 0, kept: 0, archived: 0, skipped: 0 });
  });

  it("keeps durable content (a preference) and does not archive it", async () => {
    await appendMemory(1, "I prefer single quotes in TypeScript always", { env });
    const result = await curateMemory("1", env);
    expect(result.kept).toBeGreaterThan(0);
    expect(result.archived).toBe(0);
    expect(result.total).toBe(result.kept + result.archived + result.skipped);
  });

  it("archives noise and does not keep it in the main file", async () => {
    await appendMemory(2, "ok sure", { env });
    const result = await curateMemory("2", env);
    expect(result.archived).toBeGreaterThan(0);
    expect(result.kept).toBe(0);
    expect(result.total).toBe(result.kept + result.archived + result.skipped);
  });

  it("skipped count is 0 for well-formed content (non-empty body)", async () => {
    await appendMemory(3, "I prefer dark mode in my editor", { env });
    await appendMemory(3, "never push to main without a PR review", { env });
    const result = await curateMemory("3", env);
    expect(result.skipped).toBe(0);
    expect(result.total).toBe(result.kept + result.archived + result.skipped);
  });

  it("writes an archived file for non-durable blocks", async () => {
    await appendMemory(4, "ok", { env });
    await curateMemory("4", env);
    const archivePath = join(VANTA_HOME, "memories", "4.archived.md");
    const archived = await readFile(archivePath, "utf8");
    expect(archived.length).toBeGreaterThan(0);
  });

  it("separates durable and noise: durable stays in main, noise goes to archive", async () => {
    await appendMemory(
      5,
      "I prefer single quotes in TypeScript for my projects",
      { env },
    );
    await appendMemory(5, "ok thanks", { env });
    const result = await curateMemory("5", env);
    expect(result.kept).toBeGreaterThanOrEqual(1);
    expect(result.archived).toBeGreaterThanOrEqual(1);
    expect(result.total).toBe(result.kept + result.archived + result.skipped);
  });
});
