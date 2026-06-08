import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { buildBrief } from "./brief-cmd.js";
import { addTask } from "../task-stack/store.js";
import type { Goal } from "../types.js";

const DATA_DIR = join(tmpdir(), "vanta-brief-cmd-test");
const VANTA_HOME = join(tmpdir(), "vanta-brief-cmd-home");
const env: NodeJS.ProcessEnv = {
  ...process.env,
  VANTA_HOME,
  // Ensure calendar is skipped (no Google client configured)
  VANTA_GOOGLE_CLIENT_ID: undefined as unknown as string,
};

const noGoals = async (): Promise<Goal[]> => [];

beforeEach(async () => {
  await rm(DATA_DIR, { recursive: true, force: true });
  await rm(VANTA_HOME, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(DATA_DIR, { recursive: true, force: true });
  await rm(VANTA_HOME, { recursive: true, force: true });
});

describe("buildBrief", () => {
  it("empty state returns nothing-scheduled message", async () => {
    const out = await buildBrief({ dataDir: DATA_DIR, env, getGoals: noGoals });
    expect(out).toContain("Nothing scheduled");
  });

  it("includes active task title when a task exists", async () => {
    await addTask(DATA_DIR, { title: "Ship the brief card", why: "BRIEF-CMD roadmap item" });
    const out = await buildBrief({ dataDir: DATA_DIR, env, getGoals: noGoals });
    expect(out).toContain("Ship the brief card");
  });

  it("includes goal text when a goal is active", async () => {
    const getGoals = async (): Promise<Goal[]> => [
      { id: 1, text: "Ship v1 before end of week", status: "active" },
    ];
    const out = await buildBrief({ dataDir: DATA_DIR, env, getGoals });
    expect(out).toContain("Ship v1 before end of week");
  });

  it("does not include calendar section when VANTA_GOOGLE_CLIENT_ID is unset", async () => {
    const out = await buildBrief({ dataDir: DATA_DIR, env, getGoals: noGoals });
    expect(out).not.toContain("Calendar");
  });
});
