import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCronFlag, runScheduleCommand, runCron } from "./commands.js";
import { addCron } from "./cron.js";
import { createGoalSentinel } from "../goals/sentinel.js";
import { addAutoWatch } from "../watch/auto-watch.js";
import { setAmbientEnabled } from "../ambient/screen-context.js";
import type { RunTask } from "./runner.js";

describe("parseCronFlag", () => {
  it("extracts the cron value and strips the flag from the rest", () => {
    const { cron, rest } = parseCronFlag(["check", "mail", "--cron", "0 9 * * *"]);
    expect(cron).toBe("0 9 * * *");
    expect(rest).toEqual(["check", "mail"]);
  });

  it("returns null cron when the flag is absent", () => {
    const { cron, rest } = parseCronFlag(["just", "an", "instruction"]);
    expect(cron).toBeNull();
    expect(rest).toEqual(["just", "an", "instruction"]);
  });

  it("returns null cron when the flag has no following value", () => {
    const { cron, rest } = parseCronFlag(["do", "thing", "--cron"]);
    expect(cron).toBeNull();
    expect(rest).toEqual(["do", "thing"]);
  });
});

describe("runScheduleCommand", () => {
  let dataDir: string;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-cmd-"));
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    log.mockRestore();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("returns 1 (bad usage) when no --cron is given", async () => {
    const code = await runScheduleCommand(dataDir, ["an", "instruction"]);
    expect(code).toBe(1);
  });

  it("returns 1 (bad usage) when the instruction is empty", async () => {
    const code = await runScheduleCommand(dataDir, ["--cron", "* * * * *"]);
    expect(code).toBe(1);
  });

  it("adds a task and returns 0", async () => {
    const code = await runScheduleCommand(dataDir, [
      "check",
      "mail",
      "--cron",
      "0 9 * * *",
    ]);
    expect(code).toBe(0);
  });

  it("lists stored tasks", async () => {
    await addCron(dataDir, "* * * * *", "do the thing");
    const code = await runScheduleCommand(dataDir, ["list"]);
    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("do the thing"));
  });
});

describe("runCron", () => {
  let dataDir: string;
  let log: ReturnType<typeof vi.spyOn>;
  // Wed 2024-01-03 09:00 local — minute 0, hour 9 match "0 9 * * *".
  const NOW = new Date(2024, 0, 3, 9, 0, 0);

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-cron-"));
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    log.mockRestore();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("runs due tasks through the injected runner", async () => {
    await addCron(dataDir, "0 9 * * *", "morning task");
    const run: RunTask = async (instruction) => ({
      finalText: `did: ${instruction}`,
    });
    await runCron(dataDir, NOW, run);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("did: morning task"));
  });

  it("reports when nothing is due", async () => {
    await addCron(dataDir, "0 9 * * *", "morning task");
    const offHour = new Date(2024, 0, 3, 10, 0, 0);
    const run: RunTask = async () => ({ finalText: "unused" });
    await runCron(dataDir, offHour, run);
    expect(log).toHaveBeenCalledWith("vanta cron: no tasks due");
  });

  it("runs standing goal sentinels once per day", async () => {
    await createGoalSentinel(dataDir, { goalId: 9, goalText: "keep green", command: "true" });
    const run: RunTask = async () => ({ finalText: "unused" });
    await runCron(dataDir, NOW, run);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("sentinel pass goal-9"));

    log.mockClear();
    await runCron(dataDir, new Date(2024, 0, 3, 10, 0, 0), run);
    expect(log).toHaveBeenCalledWith("vanta cron: no tasks due");
  });

  it("surfaces auto-watch changes during cron", async () => {
    const state = join(dataDir, "watch-state.txt");
    await writeFile(state, "one");
    await addAutoWatch(dataDir, { id: "repo", kind: "repo", risk: "medium", command: `cat ${state}`, draft: "Draft repo action." });
    const run: RunTask = async () => ({ finalText: "unused" });
    await runCron(dataDir, NOW, run);
    log.mockClear();
    await writeFile(state, "two");
    await runCron(dataDir, new Date(2024, 0, 3, 10, 0, 0), run);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("watch repo: queues-for-approval"));
  });

  it("surfaces ambient screen proposals during cron when opt-in context exists", async () => {
    const old = process.env.VANTA_AMBIENT_CONTEXT;
    process.env.VANTA_AMBIENT_CONTEXT = "build failed on screen";
    await setAmbientEnabled(dataDir, true, 1);
    const run: RunTask = async () => ({ finalText: "unused" });
    try {
      await runCron(dataDir, NOW, run);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("ambient proposal: Fix failing tests"));
    } finally {
      if (old === undefined) delete process.env.VANTA_AMBIENT_CONTEXT;
      else process.env.VANTA_AMBIENT_CONTEXT = old;
    }
  });
});
