import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allowTestEffectGate } from "../effects/test-gate.js";
import type { CronEntry } from "./cron.js";
import { runScheduledScript } from "./effect-run.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const entry: CronEntry = {
  id: 42,
  cron: "* * * * *",
  instruction: "bounded fixture",
  status: "active",
};

describe("scheduled script typed receipt", () => {
  it("executes once, persists unverified provider acknowledgement, and never replays the fire window", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-scheduled-effect-"));
    roots.push(root);
    const run = vi.fn(async () => ({ ok: true, output: "fixture complete" }));
    const options = {
      entry,
      script: "printf fixture",
      context: allowTestEffectGate(root),
      windowKey: "2026-08-02T18:00Z",
      run,
    };

    await expect(runScheduledScript(options)).resolves.toEqual({ ok: true, output: "fixture complete" });
    const replay = await runScheduledScript(options);
    expect(replay).toMatchObject({ ok: false });
    expect(replay.output).toContain("without a result");
    expect(run).toHaveBeenCalledTimes(1);

    const receipt = JSON.parse((await readFile(join(root, ".vanta", "action-receipts.jsonl"), "utf8")).trim());
    expect(receipt).toMatchObject({
      action: "scheduler.script.execute",
      disposition: "confirmed",
      verification: "unverified",
    });
  });

  it("fails before execution when the effect gate is unavailable", async () => {
    const run = vi.fn();
    await expect(runScheduledScript({ entry, script: "printf fixture", windowKey: "window", run }))
      .resolves.toMatchObject({ ok: false, output: expect.stringContaining("gate unavailable") });
    expect(run).not.toHaveBeenCalled();
  });
});
