import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LoopDefSchema } from "../loop/types.js";
import { saveDef } from "../loop/store.js";
import { drainLoopWakes, enqueueLoopWake, peekLoopWakeCount } from "../loop/wake.js";
import { loadTrustLedger } from "../autonomy/trust.js";
import { processQueuedWakes, runProactiveCommand, verifyQueuedWake } from "./proactive-cmd.js";

const wake = (goalId: string) => ({ wake_reason: "manual", goal_id: goalId, since: null, delta: [] });

async function addLoop(dataDir: string, id: string): Promise<void> {
  await saveDef(dataDir, LoopDefSchema.parse({
    id,
    goal: `ship ${id}`,
    trigger: { kind: "manual" },
    stages: [{ name: "run", prompt: "go" }],
    createdAt: "2026-07-10T00:00:00.000Z",
  }));
}

describe("proactive trust execution", () => {
  it("keeps unearned wakes queued instead of discarding them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-proactive-trust-"));
    const run = vi.fn(async () => ({ finalText: "ok" }));
    const logs: string[] = [];
    try {
      await addLoop(dir, "alpha");
      await enqueueLoopWake(dir, wake("alpha"));

      expect(await processQueuedWakes(dir, run, (line) => logs.push(line))).toBe(0);
      expect(run).not.toHaveBeenCalled();
      expect(await peekLoopWakeCount(dir)).toBe(1);
      expect(logs.join("\n")).toContain("kept queued");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("earns autonomy per loop through explicit verified runs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-proactive-trust-"));
    const run = vi.fn(async () => ({ finalText: "ok" }));
    try {
      await addLoop(dir, "alpha");
      await addLoop(dir, "beta");
      for (let i = 0; i < 3; i++) await enqueueLoopWake(dir, wake("alpha"));

      expect(await verifyQueuedWake(dir, "alpha", run, () => {})).toBe(0);
      expect(await verifyQueuedWake(dir, "alpha", run, () => {})).toBe(0);
      expect(await verifyQueuedWake(dir, "alpha", run, () => {})).toBe(0);
      const ledger = await loadTrustLedger(dir);
      expect(ledger.workflows["proactive.loop.advance:loop:alpha"]?.tier).toBe("auto");
      expect(ledger.workflows["proactive.loop.advance:loop:beta"]).toBeUndefined();

      await enqueueLoopWake(dir, wake("alpha"));
      await enqueueLoopWake(dir, wake("beta"));
      expect(await processQueuedWakes(dir, run, () => {})).toBe(1);
      expect((await drainLoopWakes(dir)).map((queued) => queued.goal_id)).toEqual(["beta"]);
      expect(run).toHaveBeenCalledTimes(4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("exposes explicit verification through the proactive CLI command", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-proactive-cli-"));
    const dataDir = join(root, ".vanta");
    const run = vi.fn(async () => ({ finalText: "ok" }));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await addLoop(dataDir, "alpha");
      await enqueueLoopWake(dataDir, wake("alpha"));
      expect(await runProactiveCommand(root, ["verify", "alpha"], { runTask: run })).toBe(0);
      expect(run).toHaveBeenCalledOnce();
      expect((await loadTrustLedger(dataDir)).workflows["proactive.loop.advance:loop:alpha"]).toMatchObject({ runs: 1, passes: 1, tier: "watch" });
    } finally {
      log.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("demotes a failed auto-run and keeps its wake queued", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-proactive-trust-"));
    try {
      await addLoop(dir, "alpha");
      for (let i = 0; i < 3; i++) {
        await enqueueLoopWake(dir, wake("alpha"));
        expect(await verifyQueuedWake(dir, "alpha", async () => ({ finalText: "ok" }), () => {})).toBe(0);
      }
      await enqueueLoopWake(dir, wake("alpha"));
      expect(await processQueuedWakes(dir, async () => { throw new Error("verifier failed"); }, () => {})).toBe(0);
      expect((await loadTrustLedger(dir)).workflows["proactive.loop.advance:loop:alpha"]).toMatchObject({ tier: "queue", lastReason: "verifier failed" });
      expect(await peekLoopWakeCount(dir)).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
