import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCronFlag, runScheduleCommand, runCron } from "./commands.js";
import { addCron } from "./cron.js";
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
});
