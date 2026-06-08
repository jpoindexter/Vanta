import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLifeOs, saveLifeOs, upsertById, removeById, formatLifeOsSummary } from "./store.js";
import type { LifeOs } from "./schema.js";

let home: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-life-os-"));
  env = { VANTA_HOME: home };
});

afterEach(async () => {
  await rm(home, { recursive: true }).catch(() => {});
});

describe("loadLifeOs", () => {
  it("returns defaults when file missing", async () => {
    const data = await loadLifeOs(env);
    expect(data.projects).toEqual([]);
    expect(data.tasks).toEqual([]);
  });
});

describe("saveLifeOs / loadLifeOs roundtrip", () => {
  it("persists and reloads a project", async () => {
    const data = await loadLifeOs(env);
    data.projects.push({ id: "proj-1", name: "Test Project", status: "active" });
    await saveLifeOs(data, env);
    const reloaded = await loadLifeOs(env);
    expect(reloaded.projects.length).toBe(1);
    expect(reloaded.projects[0]?.name).toBe("Test Project");
  });
});

describe("upsertById", () => {
  it("adds new item", () => {
    const list = [{ id: "a", name: "A" }];
    const result = upsertById(list, { id: "b", name: "B" });
    expect(result.length).toBe(2);
  });

  it("updates existing item", () => {
    const list = [{ id: "a", name: "A" }];
    const result = upsertById(list, { id: "a", name: "Updated" });
    expect(result.length).toBe(1);
    expect(result[0]?.name).toBe("Updated");
  });
});

describe("removeById", () => {
  it("removes item by id", () => {
    const list = [{ id: "a" }, { id: "b" }];
    expect(removeById(list, "a").length).toBe(1);
  });
});

describe("formatLifeOsSummary", () => {
  it("shows empty message for empty store", async () => {
    const data = await loadLifeOs(env);
    expect(formatLifeOsSummary(data)).toContain("empty");
  });

  it("includes active project names", async () => {
    const data = await loadLifeOs(env);
    data.projects.push({ id: "p1", name: "Vanta", status: "active" });
    const summary = formatLifeOsSummary(data);
    expect(summary).toContain("Vanta");
  });
});
