import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addCron, loadCron, saveCron, type CronEntry } from "./cron.js";
import { runDueTasks, type RunTask, type RunScript } from "./runner.js";
import { parseScheduleFlags } from "./commands.js";

// HARNESS-CRON-SCRIPT-MODE — no_agent runs a script and delivers stdout with NO
// model call; script_context injects the script's stdout into the agent turn.

const NOW = new Date("2026-07-06T12:30:00");
const EVERY_MINUTE = "* * * * *";

async function tmpDataDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "vanta-cron-script-"));
}

function fakeRunners(): { calls: string[]; scripts: string[]; run: RunTask; runScript: RunScript } {
  const calls: string[] = [];
  const scripts: string[] = [];
  return {
    calls,
    scripts,
    run: async (instruction) => {
      calls.push(instruction);
      return { finalText: `agent:${instruction.slice(0, 20)}` };
    },
    runScript: async (script) => {
      scripts.push(script);
      return { ok: true, output: `out-of:${script}` };
    },
  };
}

describe("cron.tsv round-trip with mode/script", () => {
  it("persists mode + script and keeps legacy 4-column lines parseable", async () => {
    const dataDir = await tmpDataDir();
    await addCron(dataDir, EVERY_MINUTE, "disk check", { mode: "no_agent", script: "df -h" });
    await addCron(dataDir, EVERY_MINUTE, "plain agent task");
    const entries = await loadCron(dataDir);
    expect(entries[0]).toMatchObject({ mode: "no_agent", script: "df -h" });
    expect(entries[1]?.mode).toBeUndefined();
    // A pre-mode 4-column file still loads (back-compat).
    await saveCron(dataDir, []);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(dataDir, "cron.tsv"), `7\t${EVERY_MINUTE}\told entry\tactive\n`, "utf8");
    const legacy = await loadCron(dataDir);
    expect(legacy[0]).toMatchObject({ id: 7, instruction: "old entry" });
    expect(legacy[0]?.mode).toBeUndefined();
  });
});

describe("runner script modes", () => {
  const base = { cron: EVERY_MINUTE, status: "active" as const };

  it("no_agent delivers script stdout and NEVER calls the model", async () => {
    const dataDir = await tmpDataDir();
    const entry: CronEntry = { id: 1, instruction: "disk check", ...base, mode: "no_agent", script: "df -h" };
    const f = fakeRunners();
    const results = await runDueTasks({ dataDir, now: NOW, run: f.run, runScript: f.runScript, load: async () => [entry] });
    expect(results).toEqual([{ id: 1, instruction: "disk check", result: "out-of:df -h" }]);
    expect(f.scripts).toEqual(["df -h"]);
    expect(f.calls).toEqual([]); // no model call — the whole point
  });

  it("no_agent falls back to the instruction as the script", async () => {
    const entry: CronEntry = { id: 2, instruction: "echo hi", ...base, mode: "no_agent" };
    const f = fakeRunners();
    const results = await runDueTasks({ dataDir: await tmpDataDir(), now: NOW, run: f.run, runScript: f.runScript, load: async () => [entry] });
    expect(f.scripts).toEqual(["echo hi"]);
    expect(results[0]?.result).toBe("out-of:echo hi");
  });

  it("no_agent surfaces a failed script as an error result", async () => {
    const entry: CronEntry = { id: 3, instruction: "x", ...base, mode: "no_agent", script: "boom" };
    const f = fakeRunners();
    const failScript: RunScript = async () => ({ ok: false, output: "script failed: exit 1" });
    const results = await runDueTasks({ dataDir: await tmpDataDir(), now: NOW, run: f.run, runScript: failScript, load: async () => [entry] });
    expect(results[0]?.result).toBe("error: script failed: exit 1");
    expect(f.calls).toEqual([]);
  });

  it("script_context runs the script then injects its stdout into the agent turn", async () => {
    const entry: CronEntry = { id: 4, instruction: "summarize disk usage", ...base, mode: "script_context", script: "df -h" };
    const f = fakeRunners();
    const results = await runDueTasks({ dataDir: await tmpDataDir(), now: NOW, run: f.run, runScript: f.runScript, load: async () => [entry] });
    expect(f.scripts).toEqual(["df -h"]);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toContain("summarize disk usage");
    expect(f.calls[0]).toContain("[script output]\nout-of:df -h");
    expect(results[0]?.result).toBe(`agent:${"summarize disk usage".slice(0, 20)}`);
  });

  it("script modes without a configured runner report a clear error (not a silent agent run)", async () => {
    const entry: CronEntry = { id: 5, instruction: "x", ...base, mode: "no_agent", script: "df" };
    const f = fakeRunners();
    const results = await runDueTasks({ dataDir: await tmpDataDir(), now: NOW, run: f.run, load: async () => [entry] });
    expect(results[0]?.result).toContain("no script runner");
    expect(f.calls).toEqual([]);
  });

  it("script_context with no script reports a clear error", async () => {
    const entry: CronEntry = { id: 6, instruction: "x", ...base, mode: "script_context" };
    const f = fakeRunners();
    const results = await runDueTasks({ dataDir: await tmpDataDir(), now: NOW, run: f.run, runScript: f.runScript, load: async () => [entry] });
    expect(results[0]?.result).toContain("has no script");
  });
});

describe("parseScheduleFlags", () => {
  it("parses --cron --mode --script and returns the instruction words", () => {
    const p = parseScheduleFlags(["disk", "check", "--cron", "0 * * * *", "--mode", "no_agent", "--script", "df -h"]);
    expect(p).toMatchObject({ cron: "0 * * * *", mode: "no_agent", script: "df -h", invalidMode: null });
    expect(p.rest).toEqual(["disk", "check"]);
  });

  it("flags an invalid --mode instead of silently ignoring it", () => {
    const p = parseScheduleFlags(["x", "--cron", "* * * * *", "--mode", "bogus"]);
    expect(p.invalidMode).toBe("bogus");
    expect(p.mode).toBeUndefined();
  });

  it("leaves plain agent scheduling untouched", () => {
    const p = parseScheduleFlags(["do", "thing", "--cron", "* * * * *"]);
    expect(p).toMatchObject({ cron: "* * * * *", mode: undefined, script: undefined, invalidMode: null });
    expect(p.rest).toEqual(["do", "thing"]);
  });
});
