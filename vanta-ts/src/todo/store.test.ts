import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTodos, writeTodos, formatTodos } from "./store.js";

const VANTA_HOME = join(tmpdir(), "vanta-todo-test");
const env = { ...process.env, VANTA_HOME };

describe("todo store", () => {
  beforeEach(async () => { await rm(VANTA_HOME, { recursive: true, force: true }); });
  afterEach(async () => { await rm(VANTA_HOME, { recursive: true, force: true }); });

  it("round-trips and renders the plan", async () => {
    await writeTodos([{ text: "spike", status: "done" }, { text: "build", status: "in_progress" }, { text: "ship", status: "pending" }], env);
    const items = await readTodos(env);
    expect(items).toHaveLength(3);
    const out = formatTodos(items);
    expect(out).toContain("✓ spike");
    expect(out).toContain("▸ build");
    expect(out).toContain("○ ship");
    expect(out).toContain("(1/3 done)");
  });

  it("returns [] (no plan) when none written", async () => {
    expect(await readTodos(env)).toEqual([]);
    expect(formatTodos([])).toContain("no plan yet");
  });
});
