import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAutonomyCommand } from "./autonomy-cmd.js";

async function capture(fn: () => Promise<number>): Promise<{ code: number; output: string }> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((msg = "") => { lines.push(String(msg)); });
  try {
    return { code: await fn(), output: lines.join("\n") };
  } finally {
    spy.mockRestore();
  }
}

describe("runAutonomyCommand", () => {
  it("shows the active autonomy contract", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-autonomy-cli-"));
    try {
      const result = await capture(() => runAutonomyCommand(root, ["show"]));
      expect(result.code).toBe(0);
      expect(result.output).toContain("Acts alone");
      expect(result.output).toContain("Queues for approval");
      expect(result.output).toContain("Wakes me");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("trust-gates and logs an autonomy decision", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-autonomy-cli-"));
    try {
      const result = await capture(() => runAutonomyCommand(root, ["decide", "proactive.loop.advance", "low", "advance queued loop"]));
      expect(result.code).toBe(0);
      expect(result.output).toContain("Autonomy decision: queues-for-approval");
      expect(result.output).toContain("trust-ledger");
      expect(await readFile(join(root, ".vanta", "autonomy-decisions.jsonl"), "utf8")).toContain("allow-proactive-loop+trust-ledger");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records trust outcomes and then allows earned autonomy", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-autonomy-cli-"));
    try {
      await capture(() => runAutonomyCommand(root, ["trust", "pass", "proactive.loop.advance", "fixture", "one"]));
      await capture(() => runAutonomyCommand(root, ["trust", "pass", "proactive.loop.advance", "fixture", "two"]));
      const trust = await capture(() => runAutonomyCommand(root, ["trust", "pass", "proactive.loop.advance", "fixture", "three"]));
      expect(trust.output).toContain("auto");

      const result = await capture(() => runAutonomyCommand(root, ["decide", "proactive.loop.advance", "low", "advance queued loop"]));
      expect(result.output).toContain("Autonomy decision: acts-alone");
      expect(result.output).toContain("earned auto");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
